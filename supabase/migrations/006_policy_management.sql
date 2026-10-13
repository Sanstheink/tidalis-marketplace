-- Tidalis Phase 5.7. STAGING/CLONE FIRST. Never paste production keys into client code.
-- Requires 001 -> 005 (especially 003 MFA + 004 approval workflow).
-- This file does NOT publish policies, activate shops, create orders, or seed legal text.

-- Store review notes without altering the existing check constraint on status.
-- 'changes_requested' and 'rejected' return a version to DRAFT, accompanied by
-- an explicit review_outcome. They are not publicly exposed.
alter table public.shop_policy_versions
  add column if not exists review_note text,
  add column if not exists review_outcome text check (review_outcome in ('approved','changes_requested','rejected')),
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz;

-- Never allow direct browser writes to policies, even if older grants exist.
revoke insert, update, delete on public.platform_policy_versions from anon, authenticated;
revoke insert, update, delete on public.shop_policy_versions from anon, authenticated;

-- Prior policy erroneously exposed published policies for paused/suspended shops.
-- Members/admins retain review visibility (MFA protected by 003 helpers).
drop policy if exists policies_read on public.shop_policy_versions;
create policy policies_read on public.shop_policy_versions
for select to anon,authenticated using (
  (status = 'published' and exists (
    select 1 from public.shops s where s.id = shop_id and s.status = 'active'
  ))
  or public.is_shop_member(shop_id,(select auth.uid()))
  or public.is_platform_admin((select auth.uid()))
);

-- Published content is immutable. The only permitted change after publication is
-- a transition from published -> archived (e.g. superseded by a new version).
create or replace function public.tidalis_lock_published_shop_policy()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('published','archived') and (
    new.shop_id is distinct from old.shop_id
    or new.policy_type is distinct from old.policy_type
    or new.version is distinct from old.version
    or new.content is distinct from old.content
    or new.published_at is distinct from old.published_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.review_note is distinct from old.review_note
    or new.review_outcome is distinct from old.review_outcome
    or new.submitted_at is distinct from old.submitted_at
    or new.created_at is distinct from old.created_at
    or (old.status = 'archived' and new.status is distinct from old.status)
    or (old.status = 'published' and new.status not in ('published','archived'))
  ) then
    raise exception 'Published shop policy versions are immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists tidalis_immutable_published_shop_policy on public.shop_policy_versions;
create trigger tidalis_immutable_published_shop_policy
before update on public.shop_policy_versions
for each row execute function public.tidalis_lock_published_shop_policy();

-- Platform policy workflow for the seven GENERAL policy types.
-- Seller Agreement has a separate hardened Phase 4 workflow, deliberately retained.
create or replace function public.create_platform_policy_draft(
  p_policy_type text, p_title text, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version integer;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_policy_type is null or p_policy_type not in (
    'terms','privacy','cookies','buyer-protection','payment-refund','copyright','community') then
    raise exception 'Unknown platform policy type';
  end if;
  if length(trim(coalesce(p_title,''))) not between 8 and 160
    or length(trim(coalesce(p_content,''))) not between 500 and 30000 then
    raise exception 'Invalid legal title or content';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(87211,pg_catalog.hashtext(p_policy_type));
  select coalesce(max(version),0)+1 into v_version
    from public.platform_policy_versions where policy_type=p_policy_type;
  insert into public.platform_policy_versions(policy_type,version,title,content,status)
    values(p_policy_type,v_version,trim(p_title),trim(p_content),'draft') returning id into v_id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(auth.uid(),'platform_policy_draft_created','platform_policy_versions',v_id,
      pg_catalog.jsonb_build_object('policy_type',p_policy_type,'version',v_version));
  return v_id;
end;
$$;

-- An editable draft remains the SAME version. Published text can never be modified.
create or replace function public.update_platform_policy_draft(
  p_policy_version_id uuid,p_title text,p_content text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_policy public.platform_policy_versions%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if length(trim(coalesce(p_title,''))) not between 8 and 160
    or length(trim(coalesce(p_content,''))) not between 500 and 30000 then
    raise exception 'Invalid legal title or content';
  end if;
  select * into v_policy from public.platform_policy_versions where id=p_policy_version_id for update;
  if not found or v_policy.status <> 'draft' or v_policy.policy_type not in (
    'terms','privacy','cookies','buyer-protection','payment-refund','copyright','community') then
    raise exception 'Only general platform drafts can be edited';
  end if;
  update public.platform_policy_versions
    set title=trim(p_title),content=trim(p_content) where id=v_policy.id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(auth.uid(),'platform_policy_draft_updated','platform_policy_versions',v_policy.id,
      pg_catalog.jsonb_build_object('policy_type',v_policy.policy_type,'version',v_policy.version));
end;
$$;

create or replace function public.publish_platform_policy(
  p_policy_version_id uuid, p_reviewed_and_authorized boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_policy public.platform_policy_versions%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_reviewed_and_authorized is distinct from true then
    raise exception 'Legal review confirmation is required';
  end if;
  select * into v_policy from public.platform_policy_versions
    where id=p_policy_version_id for update;
  if not found or v_policy.policy_type not in (
    'terms','privacy','cookies','buyer-protection','payment-refund','copyright','community')
    or v_policy.status not in ('draft','under_review') then
    raise exception 'This platform draft cannot be published';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(87211,pg_catalog.hashtext(v_policy.policy_type));
  if exists(select 1 from public.platform_policy_versions
    where policy_type=v_policy.policy_type and status='published'
      and version >= v_policy.version) then
    raise exception 'Cannot replace a newer published policy';
  end if;
  update public.platform_policy_versions set status='archived'
    where policy_type=v_policy.policy_type and status='published';
  update public.platform_policy_versions
    set status='published',effective_from=now(),approved_by=auth.uid()
    where id=v_policy.id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(auth.uid(),'platform_policy_published','platform_policy_versions',v_policy.id,
      pg_catalog.jsonb_build_object('policy_type',v_policy.policy_type,'version',v_policy.version,'legal_review_confirmed',true));
end;
$$;

-- Seller authoring. Save only DRAFT; under_review/published cannot be edited.
create or replace function public.save_shop_policy_draft(
 p_shop_id uuid, p_policy_type text, p_content text, p_draft_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_shop public.shops%rowtype; v_policy public.shop_policy_versions%rowtype;
  v_id uuid; v_version integer;
begin
  if not public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager']) then
    raise exception 'Shop owner/manager MFA required';
  end if;
  select * into v_shop from public.shops where id=p_shop_id;
  if not found or v_shop.status not in ('paused','active') then raise exception 'Shop is not eligible'; end if;
  if p_policy_type is null or p_policy_type not in ('refund','delivery','license','other') then
    raise exception 'Invalid shop policy type';
  end if;
  if length(trim(coalesce(p_content,''))) not between 200 and 30000 then
    raise exception 'Policy content must be 200-30000 characters';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_shop_id::text),pg_catalog.hashtext(p_policy_type));
  if p_draft_id is not null then
    select * into v_policy from public.shop_policy_versions
      where id=p_draft_id and shop_id=p_shop_id and policy_type=p_policy_type for update;
    if not found or v_policy.status <> 'draft' then raise exception 'Draft no longer editable'; end if;
    update public.shop_policy_versions
      set content=trim(p_content),review_note=null,review_outcome=null,
          reviewed_by=null,reviewed_at=null
      where id=v_policy.id returning id into v_id;
  else
    if exists(select 1 from public.shop_policy_versions
      where shop_id=p_shop_id and policy_type=p_policy_type and status in ('draft','under_review')) then
      raise exception 'Edit or submit the existing draft first';
    end if;
    select coalesce(max(version),0)+1 into v_version from public.shop_policy_versions
      where shop_id=p_shop_id and policy_type=p_policy_type;
    insert into public.shop_policy_versions(shop_id,policy_type,version,content,status)
      values(p_shop_id,p_policy_type,v_version,trim(p_content),'draft') returning id into v_id;
  end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),p_shop_id,'shop_policy_draft_saved','shop_policy_versions',v_id,
      pg_catalog.jsonb_build_object('policy_type',p_policy_type));
  return v_id;
end;
$$;

create or replace function public.submit_shop_policy_draft(p_policy_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_policy public.shop_policy_versions%rowtype;
begin
  select * into v_policy from public.shop_policy_versions where id=p_policy_version_id for update;
  if not found or not public.is_shop_member(v_policy.shop_id,auth.uid(),array['owner','manager']) then
    raise exception 'Shop owner/manager MFA required';
  end if;
  if v_policy.status <> 'draft' or length(trim(v_policy.content)) < 200 then
    raise exception 'Only complete drafts can be submitted';
  end if;
  if not exists(select 1 from public.shops where id=v_policy.shop_id and status in ('paused','active')) then
    raise exception 'Shop is not eligible';
  end if;
  update public.shop_policy_versions
    set status='under_review',submitted_at=now(),review_note=null,review_outcome=null
    where id=v_policy.id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),v_policy.shop_id,'shop_policy_submitted','shop_policy_versions',v_policy.id,
      pg_catalog.jsonb_build_object('policy_type',v_policy.policy_type,'version',v_policy.version));
end;
$$;

-- Admin decision is atomic and audited; publication leaves shop PAUSED.
create or replace function public.review_shop_policy(
 p_policy_version_id uuid,p_decision text,p_review_note text,p_reviewed_and_authorized boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_policy public.shop_policy_versions%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_decision is null or p_decision not in ('approved','changes_requested','rejected') then
    raise exception 'Invalid review decision';
  end if;
  if p_decision='approved' and p_reviewed_and_authorized is distinct from true then
    raise exception 'Human policy review acknowledgement required';
  end if;
  if p_decision<>'approved' and length(trim(coalesce(p_review_note,''))) not between 12 and 1500 then
    raise exception 'Review explanation must be 12-1500 characters';
  end if;
  select * into v_policy from public.shop_policy_versions where id=p_policy_version_id for update;
  if not found or v_policy.status <> 'under_review' then
    raise exception 'Only pending shop policies can be reviewed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_policy.shop_id::text),pg_catalog.hashtext(v_policy.policy_type));
  if p_decision='approved' then
    if exists(select 1 from public.shop_policy_versions where shop_id=v_policy.shop_id
      and policy_type=v_policy.policy_type and status='published' and version >= v_policy.version) then
      raise exception 'Cannot supersede a newer published version';
    end if;
    update public.shop_policy_versions set status='archived'
      where shop_id=v_policy.shop_id and policy_type=v_policy.policy_type and status='published';
    update public.shop_policy_versions
      set status='published',published_at=now(),reviewed_by=auth.uid(),reviewed_at=now(),
        review_note=null,review_outcome='approved'
      where id=v_policy.id;
  else
    update public.shop_policy_versions
      set status='draft',reviewed_by=auth.uid(),reviewed_at=now(),
        review_note=trim(p_review_note),review_outcome=p_decision
      where id=v_policy.id;
  end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),v_policy.shop_id,'shop_policy_'||p_decision,'shop_policy_versions',v_policy.id,
      pg_catalog.jsonb_build_object('policy_type',v_policy.policy_type,'version',v_policy.version,
        'review_note',left(coalesce(p_review_note,''),1500)));
end;
$$;

-- Restrict SECURITY DEFINER functions. Authenticated may execute but RPC checks
-- verified identity, AAL2 and roles inside Postgres; anon has no execution.
revoke all on function public.create_platform_policy_draft(text,text,text) from public,anon;
revoke all on function public.publish_platform_policy(uuid,boolean) from public,anon;
revoke all on function public.update_platform_policy_draft(uuid,text,text) from public,anon;
revoke all on function public.save_shop_policy_draft(uuid,text,text,uuid) from public,anon;
revoke all on function public.submit_shop_policy_draft(uuid) from public,anon;
revoke all on function public.review_shop_policy(uuid,text,text,boolean) from public,anon;
grant execute on function public.create_platform_policy_draft(text,text,text) to authenticated;
grant execute on function public.publish_platform_policy(uuid,boolean) to authenticated;
grant execute on function public.update_platform_policy_draft(uuid,text,text) to authenticated;
grant execute on function public.save_shop_policy_draft(uuid,text,text,uuid) to authenticated;
grant execute on function public.submit_shop_policy_draft(uuid) to authenticated;
grant execute on function public.review_shop_policy(uuid,text,text,boolean) to authenticated;
