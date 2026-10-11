-- Tidalis Phase 5.8: approved shop activation and reviewed product publication.
-- REQUIRE 001-007. REHEARSE ON AN ISOLATED STAGING PROJECT WITH MFA BEFORE PRODUCTION.
-- This migration NEVER activates existing shops, publishes existing products, takes payments or seeds policies.

create table if not exists public.shop_readiness_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops(id),
  status text not null default 'submitted' check(status in ('submitted','needs_information','rejected','approved')),
  seller_note text not null default '',
  review_note text,
  reviewed_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists shop_readiness_requests_status_idx on public.shop_readiness_requests(status,submitted_at);
alter table public.shop_readiness_requests enable row level security;
revoke all on public.shop_readiness_requests from public, anon, authenticated;
grant select on public.shop_readiness_requests to authenticated;
drop policy if exists tidalis_shop_readiness_select on public.shop_readiness_requests;
create policy tidalis_shop_readiness_select on public.shop_readiness_requests
for select to authenticated using (
  public.is_shop_member(shop_id,(select auth.uid()))
  or public.is_platform_admin((select auth.uid()))
);

alter table public.products
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists review_note text,
  add column if not exists published_at timestamptz;
revoke insert,update,delete on public.products,public.product_license_prices,public.product_files
  from anon, authenticated;

-- Internal readiness function: caller must be a current shop member or MFA admin.
-- This is a point-in-time check, repeated atomically in the approval transaction.
create or replace function public.tidalis_shop_readiness_blockers(p_shop_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_status text; v_reasons text[] := array[]::text[]; v_type text;
  v_product_id uuid; v_has_ready_product boolean:=false;
begin
  if not (public.is_shop_member(p_shop_id,auth.uid()) or public.is_platform_admin(auth.uid())) then
    raise exception 'MFA and shop access required';
  end if;
  select status into v_status from public.shops where id=p_shop_id;
  if v_status is null or v_status not in ('paused','active') then
    return array['shop_not_eligible']::text[];
  end if;
  if not exists (select 1 from public.seller_applications a
    where a.created_shop_id=p_shop_id and a.status='approved') then
    v_reasons := array_append(v_reasons,'seller_approval_missing');
  end if;
  foreach v_type in array array['terms','privacy','seller-agreement','payment-refund','copyright'] loop
    if not exists (select 1 from public.platform_policy_versions p
      where p.policy_type=v_type and p.status='published'
        and (p.effective_from is null or p.effective_from<=now())) then
      v_reasons := array_append(v_reasons,'platform_policy_'||v_type);
    end if;
  end loop;
  foreach v_type in array array['refund','delivery','license'] loop
    if not exists(select 1 from public.shop_policy_versions p
      where p.shop_id=p_shop_id and p.policy_type=v_type and p.status='published'
        and (p.source_type='text' or (p.source_type='pdf' and exists(
          select 1 from storage.objects o
          where o.bucket_id='tidalis-policy-documents' and o.name=p.document_path)))) then
      v_reasons := array_append(v_reasons,'shop_policy_'||v_type);
    end if;
  end loop;
  for v_product_id in select p.id from public.products p
    where p.shop_id=p_shop_id and p.status in ('draft','under_review','published') loop
    if array_length(public.tidalis_product_publish_blockers(v_product_id),1) is null then
      v_has_ready_product:=true;exit;
    end if;
  end loop;
  if not v_has_ready_product then
    v_reasons := array_append(v_reasons,'ready_product_missing');
  end if;
  -- Re-opening must not restore already-published but now broken product listings.
  for v_product_id in select p.id from public.products p
    where p.shop_id=p_shop_id and p.status='published' loop
    if array_length(public.tidalis_product_publish_blockers(v_product_id),1)>0 then
      v_reasons := array_append(v_reasons,'published_product_incomplete');
      exit;
    end if;
  end loop;
  return v_reasons;
end;
$$;
revoke all on function public.tidalis_shop_readiness_blockers(uuid) from public,anon;
grant execute on function public.tidalis_shop_readiness_blockers(uuid) to authenticated;

create or replace function public.submit_shop_readiness(p_shop_id uuid,p_seller_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_blockers text[]; v_status text;
begin
  if not public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager']) then
    raise exception 'Owner/manager MFA required'; end if;
  select status into v_status from public.shops where id=p_shop_id for update;
  if v_status is distinct from 'paused' then raise exception 'Only paused shops can request activation'; end if;
  if length(coalesce(p_seller_note,''))>1500 then raise exception 'Seller note too long'; end if;
  v_blockers := public.tidalis_shop_readiness_blockers(p_shop_id);
  if array_length(v_blockers,1)>0 then raise exception 'Shop readiness incomplete: %',array_to_string(v_blockers,', '); end if;
  insert into public.shop_readiness_requests(shop_id,status,seller_note,submitted_at,review_note,reviewed_by,reviewed_at)
  values(p_shop_id,'submitted',trim(coalesce(p_seller_note,'')),now(),null,null,null)
  on conflict(shop_id) do update set status='submitted',seller_note=excluded.seller_note,
    submitted_at=now(),review_note=null,reviewed_by=null,reviewed_at=null
  where public.shop_readiness_requests.status in ('needs_information','rejected')
  returning id into v_id;
  if v_id is null then raise exception 'Shop readiness request already submitted or approved'; end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),p_shop_id,'shop_readiness_submitted','shop_readiness_requests',v_id,
       pg_catalog.jsonb_build_object('note',left(coalesce(p_seller_note,''),300)));
  return v_id;
end;
$$;
revoke all on function public.submit_shop_readiness(uuid,text) from public,anon;
grant execute on function public.submit_shop_readiness(uuid,text) to authenticated;

create or replace function public.review_shop_readiness(p_request_id uuid,p_decision text,p_note text,p_confirmed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.shop_readiness_requests%rowtype; v_status text; v_blockers text[];
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_decision not in ('approved','needs_information','rejected') then raise exception 'Invalid review decision'; end if;
  if p_decision='approved' and p_confirmed is distinct from true then raise exception 'Explicit readiness confirmation required'; end if;
  if p_decision<>'approved' and length(trim(coalesce(p_note,''))) not between 12 and 1500 then
    raise exception 'Review explanation requires 12-1500 characters'; end if;
  select * into v_req from public.shop_readiness_requests where id=p_request_id for update;
  if not found or v_req.status<>'submitted' then raise exception 'Request no longer pending'; end if;
  select status into v_status from public.shops where id=v_req.shop_id for update;
  if v_status <> 'paused' then raise exception 'Shop is not paused'; end if;
  if p_decision='approved' then
    v_blockers := public.tidalis_shop_readiness_blockers(v_req.shop_id);
    if array_length(v_blockers,1)>0 then raise exception 'Readiness changed: %',array_to_string(v_blockers,', '); end if;
    -- Admin confirms visibility only: the order and payment routes stay disabled.
    update public.shops set status='active' where id=v_req.shop_id and status='paused';
  end if;
  update public.shop_readiness_requests set status=p_decision,review_note=nullif(trim(coalesce(p_note,'')),''),
    reviewed_by=auth.uid(),reviewed_at=now() where id=v_req.id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),v_req.shop_id,'shop_readiness_'||p_decision,'shop_readiness_requests',v_req.id,
      pg_catalog.jsonb_build_object('review_note',left(coalesce(p_note,''),1500)));
end;
$$;
revoke all on function public.review_shop_readiness(uuid,text,text,boolean) from public,anon;
grant execute on function public.review_shop_readiness(uuid,text,text,boolean) to authenticated;

-- Product gate also verifies private object metadata, both license terms, inventory semantics,
-- and shop readiness on every approval. Only the product's artist team / admin can call.
create or replace function public.tidalis_product_publish_blockers(p_product_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_p public.products%rowtype; v_reasons text[]:=array[]::text[];
begin
  select * into v_p from public.products where id=p_product_id;
  if not found then raise exception 'Product not found'; end if;
  if not (public.is_shop_member(v_p.shop_id,auth.uid(),array['owner','manager','artist'])
      or public.is_platform_admin(auth.uid())) then
    raise exception 'Product review requires MFA'; end if;
  if length(trim(v_p.description))<30 then v_reasons:=array_append(v_reasons,'description_too_short'); end if;
  if v_p.work_type_id is null or not exists(select 1 from public.shop_work_types wt
    where wt.id=v_p.work_type_id and wt.shop_id=v_p.shop_id) then
    v_reasons:=array_append(v_reasons,'work_type_missing'); end if;
  if (select count(*) from public.product_license_prices lp where lp.product_id=p_product_id
      and lp.usage_type in ('personal','commercial') and lp.price_minor>0
      and length(trim(lp.terms))>=20) <> 2 then
    v_reasons:=array_append(v_reasons,'license_prices_terms_incomplete'); end if;
  if v_p.product_type='ready_made' and (v_p.stock is null or v_p.stock<1) then
    v_reasons:=array_append(v_reasons,'ready_made_stock_missing'); end if;
  if v_p.product_type='digital_asset' and v_p.stock=0 then
    v_reasons:=array_append(v_reasons,'digital_asset_stock_zero'); end if;
  if v_p.is_exclusive and (v_p.product_type<>'ready_made' or v_p.stock<>1) then
    v_reasons:=array_append(v_reasons,'exclusive_stock_invalid'); end if;
  if v_p.product_type<>'commission' and not exists(select 1 from public.product_files f
    join storage.objects o on o.bucket_id='tidalis-product-files' and o.name=f.file_path
    where f.product_id=p_product_id and f.is_delivery_file=true) then
    v_reasons:=array_append(v_reasons,'private_delivery_missing'); end if;
  if not exists(select 1 from public.product_files f
    join storage.objects o on o.bucket_id='tidalis-product-files' and o.name=f.file_path
    where f.product_id=p_product_id and f.is_delivery_file=false
      and (o.metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')) then
    v_reasons:=array_append(v_reasons,'preview_image_missing'); end if;
  return v_reasons;
end;
$$;
revoke all on function public.tidalis_product_publish_blockers(uuid) from public,anon;
grant execute on function public.tidalis_product_publish_blockers(uuid) to authenticated;

create or replace function public.submit_product_for_review(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.products%rowtype; v_blockers text[];
begin
  select * into v_p from public.products where id=p_product_id for update;
  if not found or not public.is_shop_member(v_p.shop_id,auth.uid(),array['owner','manager','artist']) then
    raise exception 'Seller MFA required'; end if;
  if v_p.status<>'draft' then raise exception 'Only drafts can be submitted'; end if;
  if not exists(select 1 from public.shops where id=v_p.shop_id and status in ('active','paused')) then
    raise exception 'Shop cannot submit products'; end if;
  v_blockers := public.tidalis_product_publish_blockers(p_product_id);
  if array_length(v_blockers,1)>0 then raise exception 'Product incomplete: %',array_to_string(v_blockers,', '); end if;
  update public.products set status='under_review',submitted_at=now(),review_note=null,
    reviewed_by=null,reviewed_at=null where id=p_product_id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id)
    values(auth.uid(),v_p.shop_id,'product_submitted','products',p_product_id);
end;
$$;
revoke all on function public.submit_product_for_review(uuid) from public,anon;
grant execute on function public.submit_product_for_review(uuid) to authenticated;

create or replace function public.review_product_publication(p_product_id uuid,p_decision text,p_note text,p_confirmed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.products%rowtype; v_blockers text[];
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_decision not in ('approved','changes_requested','rejected') then raise exception 'Invalid decision'; end if;
  if p_decision='approved' and p_confirmed is distinct from true then raise exception 'Review confirmation required'; end if;
  if p_decision<>'approved' and length(trim(coalesce(p_note,''))) not between 12 and 1500 then
    raise exception 'Review note requires 12-1500 characters'; end if;
  select * into v_p from public.products where id=p_product_id for update;
  if not found or v_p.status<>'under_review' then raise exception 'Product is no longer pending'; end if;
  if p_decision='approved' then
    if not exists(select 1 from public.shops where id=v_p.shop_id and status='active') then
      raise exception 'Shop must be active for product publication'; end if;
    if array_length(public.tidalis_shop_readiness_blockers(v_p.shop_id),1)>0 then
      raise exception 'Shop is no longer ready'; end if;
    v_blockers := public.tidalis_product_publish_blockers(p_product_id);
    if array_length(v_blockers,1)>0 then raise exception 'Product no longer ready: %',array_to_string(v_blockers,', '); end if;
    update public.products set status='published',published_at=now(),reviewed_by=auth.uid(),
      reviewed_at=now(),review_note=null where id=p_product_id;
  else
    update public.products set status='draft',reviewed_by=auth.uid(),reviewed_at=now(),
      review_note=trim(p_note) where id=p_product_id;
  end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),v_p.shop_id,'product_'||p_decision,'products',p_product_id,
      pg_catalog.jsonb_build_object('note',left(coalesce(p_note,''),1500)));
end;
$$;
revoke all on function public.review_product_publication(uuid,text,text,boolean) from public,anon;
grant execute on function public.review_product_publication(uuid,text,text,boolean) to authenticated;

create or replace function public.withdraw_product_for_review(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.products%rowtype;
begin
  select * into v_p from public.products where id=p_product_id for update;
  if not found or v_p.status<>'under_review' or not
    public.is_shop_member(v_p.shop_id,auth.uid(),array['owner','manager','artist']) then
    raise exception 'Only the artist team may withdraw a pending product'; end if;
  update public.products set status='draft' where id=p_product_id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id)
    values(auth.uid(),v_p.shop_id,'product_review_withdrawn','products',p_product_id);
end;
$$;
revoke all on function public.withdraw_product_for_review(uuid) from public,anon;
grant execute on function public.withdraw_product_for_review(uuid) to authenticated;

create or replace function public.archive_published_product(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.products%rowtype;
begin
  select * into v_p from public.products where id=p_product_id for update;
  if not found or v_p.status<>'published' or not
    (public.is_shop_member(v_p.shop_id,auth.uid(),array['owner','manager']) or public.is_platform_admin(auth.uid())) then
    raise exception 'Only an MFA owner/manager/admin can unlist published work'; end if;
  update public.products set status='archived' where id=p_product_id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id)
    values(auth.uid(),v_p.shop_id,'product_archived','products',p_product_id);
end;
$$;
revoke all on function public.archive_published_product(uuid) from public,anon;
grant execute on function public.archive_published_product(uuid) to authenticated;

-- Defense in depth: review/published product contents and stored file metadata are immutable.
-- This deliberately restricts even privileged manual SQL updates (except status and review fields).
create or replace function public.tidalis_lock_reviewed_products()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('under_review','published','archived') and (
     new.shop_id is distinct from old.shop_id or new.slug is distinct from old.slug
     or new.name is distinct from old.name or new.description is distinct from old.description
     or new.product_type is distinct from old.product_type or new.pricing_mode is distinct from old.pricing_mode
     or new.work_type_id is distinct from old.work_type_id or new.is_exclusive is distinct from old.is_exclusive
     or new.stock is distinct from old.stock or new.created_at is distinct from old.created_at
     or new.published_at is distinct from old.published_at and old.status in ('published','archived')
     or (old.status='archived' and new.status is distinct from old.status)
     or (old.status='published' and new.status not in ('published','archived'))
     or (old.status='under_review' and new.status not in ('under_review','draft','published'))
  ) then raise exception 'Reviewed/published product content is immutable'; end if;
  return new;
end;
$$;
drop trigger if exists tidalis_lock_reviewed_products on public.products;
create trigger tidalis_lock_reviewed_products before update on public.products
  for each row execute function public.tidalis_lock_reviewed_products();

create or replace function public.tidalis_lock_reviewed_product_children()
returns trigger language plpgsql set search_path = '' as $$
declare v_id uuid; v_status text;
begin
  v_id:=case when tg_op='DELETE' then old.product_id else new.product_id end;
  select status into v_status from public.products where id=v_id;
  if v_status is distinct from 'draft' then raise exception 'Submitted product attachments and pricing are immutable'; end if;
  if tg_op='UPDATE' and new.product_id is distinct from old.product_id then
    raise exception 'Cannot move a license/file between products'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists tidalis_lock_product_licenses on public.product_license_prices;
create trigger tidalis_lock_product_licenses before insert or update or delete on public.product_license_prices
  for each row execute function public.tidalis_lock_reviewed_product_children();
drop trigger if exists tidalis_lock_product_files on public.product_files;
create trigger tidalis_lock_product_files before insert or update or delete on public.product_files
  for each row execute function public.tidalis_lock_reviewed_product_children();

-- Public visibility for IMAGE PREVIEWS ONLY; deliverables remain private.
-- The bucket itself stays PRIVATE; signed URLs expire after 300 seconds.
do $$ begin
 if not exists(select 1 from storage.buckets where id='tidalis-product-files' and public=false) then
   raise exception 'Private product bucket missing or public; abort migration';
 end if;
end $$;
grant select on public.product_files to anon;
drop policy if exists tidalis_published_product_previews on public.product_files;
create policy tidalis_published_product_previews on public.product_files
for select to anon,authenticated using (
  is_delivery_file=false and exists(
    select 1 from public.products p join public.shops s on s.id=p.shop_id
    where p.id=product_id and p.status='published' and s.status='active'
  )
);
drop policy if exists tidalis_public_preview_storage_read on storage.objects;
create policy tidalis_public_preview_storage_read on storage.objects
for select to anon,authenticated using (
  bucket_id='tidalis-product-files' and (storage.foldername(storage.objects.name))[5]='previews'
  and exists(
    select 1 from public.product_files f
    join public.products p on p.id=f.product_id
    join public.shops s on s.id=p.shop_id
    where f.file_path=storage.objects.name and f.is_delivery_file=false
      and p.status='published' and s.status='active'
  )
);

-- An MFA Admin must be able to REVIEW all private attached assets before publication.
-- This grants no insert/update/delete permission and cannot be used without platform admin MFA.
drop policy if exists tidalis_admin_product_files_review on storage.objects;
create policy tidalis_admin_product_files_review on storage.objects
for select to authenticated using (
  bucket_id='tidalis-product-files'
  and public.is_platform_admin((select auth.uid()))
);

-- Emergency stop: a seller owner/manager or MFA admin may immediately hide an ACTIVE shop.
-- All published product and preview visibility is removed by existing status-bound RLS.
-- Re-opening always requires a NEW admin approval after readiness checks.
create or replace function public.pause_shop_visibility(p_shop_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not (public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager'])
       or public.is_platform_admin(auth.uid())) then
    raise exception 'Owner/manager/admin MFA required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 12 and 1500 then
    raise exception 'Pause reason must be 12-1500 characters'; end if;
  select status into v_status from public.shops where id=p_shop_id for update;
  if v_status<>'active' then raise exception 'Shop is not currently active'; end if;
  update public.shops set status='paused' where id=p_shop_id;
  insert into public.shop_readiness_requests(shop_id,status,seller_note,review_note,submitted_at,reviewed_at)
    values(p_shop_id,'needs_information','',trim(p_reason),now(),now())
    on conflict(shop_id) do update set status='needs_information',review_note=excluded.review_note,
      reviewed_by=null,reviewed_at=now();
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),p_shop_id,'shop_visibility_paused','shops',p_shop_id,
      pg_catalog.jsonb_build_object('reason',trim(p_reason)));
end;
$$;
revoke all on function public.pause_shop_visibility(uuid,text) from public,anon;
grant execute on function public.pause_shop_visibility(uuid,text) to authenticated;

-- Shop work type names are part of publicly shown product metadata.
-- Renaming a work type used by a submitted/published product must not rewrite
-- an already reviewed listing without another review.
create or replace function public.tidalis_lock_referenced_work_type()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.shop_id is distinct from old.shop_id or new.id is distinct from old.id then
    raise exception 'Cannot move a work type to another shop'; end if;
  if new.name is distinct from old.name and exists(
    select 1 from public.products p where p.work_type_id=old.id
      and p.status in ('under_review','published','archived')) then
    raise exception 'Work type is used by reviewed/published work; create a new type instead';
  end if;
  return new;
end;
$$;
drop trigger if exists tidalis_lock_referenced_work_type on public.shop_work_types;
create trigger tidalis_lock_referenced_work_type before update on public.shop_work_types
  for each row execute function public.tidalis_lock_referenced_work_type();
