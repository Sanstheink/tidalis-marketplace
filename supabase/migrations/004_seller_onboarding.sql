-- Tidalis Phase 4 — review carefully on a CLONE/STAGING database before Production.
-- Prerequisite: 001, 002, 003 applied. Do not insert example legal text in Production.
-- Never apply by browser client. Requires database owner privileges.

alter table public.seller_applications
  add column if not exists agreement_version_id uuid references public.platform_policy_versions(id),
  add column if not exists review_note text;

-- Stop new pending duplicate applications (fails intentionally if Production has duplicates;
-- inspect the preflight queries in PHASE4_DEPLOY.md before applying).
create unique index if not exists seller_one_open_application_per_user
  on public.seller_applications (user_id)
  where status in ('submitted', 'under_review', 'needs_information');

-- Application writes now ONLY through security-definer RPCs. Existing user/admin SELECT RLS remains.
revoke insert, update, delete on public.seller_applications from authenticated, anon;
drop policy if exists applications_create on public.seller_applications;

-- Public acceptance records remain readable only by the accepted user/admin through RLS.
revoke insert, update, delete on public.policy_acceptances from authenticated, anon;

-- Published legal content is immutable. Archiving a published version is allowed;
-- changing its title/body/version/effective date/approver is NOT.
create or replace function public.tidalis_lock_published_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('published','archived') and (
    new.title is distinct from old.title
    or new.content is distinct from old.content
    or new.version is distinct from old.version
    or new.effective_from is distinct from old.effective_from
    or new.approved_by is distinct from old.approved_by
    or new.policy_type is distinct from old.policy_type
    or (old.status = 'archived' and new.status is distinct from old.status)
    or (old.status = 'published' and new.status not in ('published','archived'))
  ) then
    raise exception 'Published/archived policy text and approval metadata are immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists tidalis_immutable_published_policy on public.platform_policy_versions;
create trigger tidalis_immutable_published_policy before update on public.platform_policy_versions
for each row execute function public.tidalis_lock_published_policy();

-- Optional administrator workflow: draft content supplied by the verified operator only.
-- This is NOT a template, legal approval or permission to publish unreviewed text.
create or replace function public.create_seller_agreement_draft(p_title text, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version integer;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if length(trim(coalesce(p_title,''))) not between 8 and 160 or
     length(trim(coalesce(p_content,''))) not between 500 and 30000 then
     raise exception 'Legal title or content length is invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(87211, 4);
  select coalesce(max(version),0)+1 into v_version
    from public.platform_policy_versions where policy_type = 'seller-agreement';
  insert into public.platform_policy_versions(policy_type,version,title,content,status)
  values('seller-agreement',v_version,trim(p_title),trim(p_content),'draft')
  returning id into v_id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(auth.uid(),'seller_agreement_draft_created','platform_policy_versions',v_id,
      pg_catalog.jsonb_build_object('version',v_version));
  return v_id;
end;
$$;

-- Explicit human legal-review acknowledgement, followed by publication by MFA admin.
-- Version becomes effective immediately; later scheduled publication can be added separately.
create or replace function public.publish_seller_agreement(
 p_policy_version_id uuid, p_reviewed_and_authorized boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_policy public.platform_policy_versions%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_reviewed_and_authorized is distinct from true then raise exception 'Explicit legal-review confirmation required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(87211, 4);
  select * into v_policy from public.platform_policy_versions
    where id = p_policy_version_id and policy_type = 'seller-agreement' for update;
  if not found or v_policy.status not in ('draft','under_review') then
    raise exception 'Only draft/under-review seller agreements can be published';
  end if;
  if exists(select 1 from public.platform_policy_versions
    where policy_type='seller-agreement' and status='published' and version >= v_policy.version) then
    raise exception 'Cannot publish an older seller agreement version';
  end if;
  update public.platform_policy_versions set status='archived'
    where policy_type='seller-agreement' and status='published';
  update public.platform_policy_versions set status='published',effective_from=now(),approved_by=auth.uid()
    where id=v_policy.id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(auth.uid(),'seller_agreement_published','platform_policy_versions',v_policy.id,
      pg_catalog.jsonb_build_object('version',v_policy.version,'review_confirmation',true));
end;
$$;

-- Seller is NOT allowed to set acceptance time, policy version or status manually.
create or replace function public.submit_seller_application(
 p_shop_name text, p_requested_slug text, p_portfolio_url text,
 p_description text, p_agreement_version_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_policy public.platform_policy_versions%rowtype; v_app_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Verify email first';
  end if;
  if length(trim(coalesce(p_shop_name,''))) not between 3 and 100
    or trim(coalesce(p_requested_slug,'')) !~ '^[a-z0-9-]{3,50}$'
    or length(trim(coalesce(p_description,''))) not between 30 and 4000
    or length(trim(coalesce(p_portfolio_url,''))) not between 12 and 800
    or trim(coalesce(p_portfolio_url,'')) !~ '^https://[^[:space:]@/]+(/[^[:space:]]*)?$' then
    raise exception 'Check the application fields';
  end if;
  if exists(select 1 from public.seller_applications
    where user_id=auth.uid() and status in ('submitted','under_review','needs_information')) then
    raise exception 'An application is already being reviewed';
  end if;
  if exists(select 1 from public.shops where slug=trim(p_requested_slug)) then
    raise exception 'Shop URL is not available';
  end if;
  select * into v_policy from public.platform_policy_versions
    where policy_type='seller-agreement' and status='published'
      and approved_by is not null and effective_from<=now()
    order by version desc limit 1;
  if not found or v_policy.id<>p_agreement_version_id then
    raise exception 'Accept the current published Seller Agreement';
  end if;
  insert into public.policy_acceptances(user_id,policy_version_id,accepted_at)
    values(auth.uid(),v_policy.id,now()) on conflict(user_id,policy_version_id) do nothing;
  insert into public.seller_applications(
    user_id,shop_name,requested_slug,portfolio_url,description,status,
    agreement_version_id,agreement_accepted_at,submitted_at)
  values(auth.uid(),trim(p_shop_name),trim(p_requested_slug),trim(p_portfolio_url),
    trim(p_description),'submitted',v_policy.id,now(),now())
  returning id into v_app_id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(auth.uid(),'seller_application_submitted','seller_applications',v_app_id,
      pg_catalog.jsonb_build_object('agreement_version_id',v_policy.id));
  return v_app_id;
end;
$$;

-- Resubmission is allowed only after Admin requests additional information.
create or replace function public.resubmit_seller_application(
 p_application_id uuid, p_shop_name text, p_requested_slug text,
 p_portfolio_url text, p_description text, p_agreement_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_app public.seller_applications%rowtype; v_policy public.platform_policy_versions%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_app from public.seller_applications
    where id=p_application_id and user_id=auth.uid() for update;
  if not found or v_app.status<>'needs_information' then
    raise exception 'This application cannot be edited';
  end if;
  if length(trim(coalesce(p_shop_name,''))) not between 3 and 100
    or trim(coalesce(p_requested_slug,'')) !~ '^[a-z0-9-]{3,50}$'
    or length(trim(coalesce(p_description,''))) not between 30 and 4000
    or length(trim(coalesce(p_portfolio_url,''))) not between 12 and 800
    or trim(coalesce(p_portfolio_url,'')) !~ '^https://[^[:space:]@/]+(/[^[:space:]]*)?$' then
    raise exception 'Check the application fields';
  end if;
  if exists(select 1 from public.shops where slug=trim(p_requested_slug)) then
    raise exception 'Shop URL is not available';
  end if;
  select * into v_policy from public.platform_policy_versions
    where policy_type='seller-agreement' and status='published'
      and approved_by is not null and effective_from<=now()
    order by version desc limit 1;
  if not found or v_policy.id<>p_agreement_version_id then
    raise exception 'Accept the current published Seller Agreement';
  end if;
  insert into public.policy_acceptances(user_id,policy_version_id,accepted_at)
    values(auth.uid(),v_policy.id,now()) on conflict(user_id,policy_version_id) do nothing;
  update public.seller_applications
    set shop_name=trim(p_shop_name),requested_slug=trim(p_requested_slug),
        portfolio_url=trim(p_portfolio_url),description=trim(p_description),
        agreement_version_id=v_policy.id,agreement_accepted_at=now(),
        status='submitted',submitted_at=now(),reviewed_by=null,reviewed_at=null,review_note=null
    where id=v_app.id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(auth.uid(),'seller_application_resubmitted','seller_applications',v_app.id,
      pg_catalog.jsonb_build_object('agreement_version_id',v_policy.id));
end;
$$;

-- Admin review, mandatory reason for rejection/request-for-information.
create or replace function public.review_seller_application(
 p_application_id uuid, p_decision text, p_review_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_app public.seller_applications%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_decision not in ('rejected','needs_information') or
     length(trim(coalesce(p_review_note,''))) not between 12 and 1500 then
    raise exception 'A valid decision and explanation are required';
  end if;
  select * into v_app from public.seller_applications where id=p_application_id for update;
  if not found or v_app.status not in ('submitted','under_review') then
    raise exception 'Application no longer available for review';
  end if;
  update public.seller_applications set status=p_decision,
    review_note=trim(p_review_note),reviewed_by=auth.uid(),reviewed_at=now()
    where id=v_app.id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(auth.uid(),'seller_application_'||p_decision,'seller_applications',v_app.id,
      pg_catalog.jsonb_build_object('reason',left(trim(p_review_note),1500)));
end;
$$;

-- Atomic shop creation, only by MFA Admin, using explicitly accepted current policy version.
-- A newly approved shop starts PAUSED, never publicly active. Activation requires
-- reviewed shop refund/delivery/license policies and platform readiness (later phase).
create or replace function public.approve_seller_application(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_app public.seller_applications%rowtype; v_policy public.platform_policy_versions%rowtype;
  v_shop_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  select * into v_app from public.seller_applications where id=p_application_id for update;
  if not found or v_app.status not in ('submitted','under_review') or
     v_app.agreement_version_id is null or v_app.agreement_accepted_at is null then
    raise exception 'Seller application is not ready for approval';
  end if;
  if not exists(select 1 from auth.users
    where id=v_app.user_id and email_confirmed_at is not null) then
    raise exception 'Applicant email is not verified';
  end if;
  select * into v_policy from public.platform_policy_versions
    where policy_type='seller-agreement' and status='published'
      and approved_by is not null and effective_from<=now()
    order by version desc limit 1;
  if not found or v_policy.id<>v_app.agreement_version_id or
     not exists(select 1 from public.policy_acceptances
       where user_id=v_app.user_id and policy_version_id=v_app.agreement_version_id) then
    raise exception 'Applicant must reaccept the current Seller Agreement';
  end if;
  if exists(select 1 from public.shops where slug=v_app.requested_slug) then
    raise exception 'Shop URL is not available';
  end if;
  insert into public.shops(owner_id,name,slug,description,status)
    values(v_app.user_id,v_app.shop_name,v_app.requested_slug,v_app.description,'paused')
    returning id into v_shop_id;
  insert into public.shop_members(shop_id,user_id,role)
    values(v_shop_id,v_app.user_id,'owner');
  update public.seller_applications set status='approved',
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=null,created_shop_id=v_shop_id
    where id=p_application_id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),v_shop_id,'seller_approved','seller_applications',p_application_id,
      pg_catalog.jsonb_build_object('agreement_version_id',v_app.agreement_version_id));
  return v_shop_id;
end;
$$;

-- SECURITY DEFINER functions have PUBLIC EXECUTE by default: revoke before granting.
revoke all on function public.create_seller_agreement_draft(text,text) from public,anon;
revoke all on function public.publish_seller_agreement(uuid,boolean) from public,anon;
revoke all on function public.submit_seller_application(text,text,text,text,uuid) from public,anon;
revoke all on function public.resubmit_seller_application(uuid,text,text,text,text,uuid) from public,anon;
revoke all on function public.review_seller_application(uuid,text,text) from public,anon;
revoke all on function public.approve_seller_application(uuid) from public,anon;
grant execute on function public.create_seller_agreement_draft(text,text) to authenticated;
grant execute on function public.publish_seller_agreement(uuid,boolean) to authenticated;
grant execute on function public.submit_seller_application(text,text,text,text,uuid) to authenticated;
grant execute on function public.resubmit_seller_application(uuid,text,text,text,text,uuid) to authenticated;
grant execute on function public.review_seller_application(uuid,text,text) to authenticated;
grant execute on function public.approve_seller_application(uuid) to authenticated;
