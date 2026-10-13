-- Phase 5.8.1 emergency rollback: STAGING REVIEW FIRST.
-- This preserves shop/order/policy data. Use only together with reverting web code.
-- Does NOT rerun historic migrations, delete users, or change MFA factors.
begin;
drop policy if exists tidalis_routine_own_shop_read on public.shops;
drop policy if exists tidalis_routine_worktypes_read on public.shop_work_types;
drop policy if exists tidalis_routine_worktypes_insert on public.shop_work_types;
drop policy if exists tidalis_routine_worktypes_update on public.shop_work_types;
drop policy if exists tidalis_routine_products_read on public.products;
drop policy if exists tidalis_routine_license_read on public.product_license_prices;
drop policy if exists tidalis_routine_draft_file_metadata on public.product_files;
drop policy if exists tidalis_routine_shop_policy_read on public.shop_policy_versions;
drop policy if exists tidalis_routine_readiness_read on public.shop_readiness_requests;
drop policy if exists tidalis_routine_preview_upload on storage.objects;
drop policy if exists tidalis_routine_preview_read on storage.objects;
drop policy if exists tidalis_routine_policy_pdf_upload on storage.objects;
drop policy if exists tidalis_routine_policy_pdf_read on storage.objects;

-- Restore original save_seller_product_draft from 005_seller_catalog_drafts.sql
create or replace function public.save_seller_product_draft(
  p_shop_id uuid,
  p_product_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_product_type text,
  p_work_type_id uuid,
  p_is_exclusive boolean,
  p_stock integer,
  p_personal_price_minor bigint,
  p_personal_terms text,
  p_commercial_price_minor bigint,
  p_commercial_terms text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_product_id uuid; v_old public.products%rowtype; v_status text;
begin
  if auth.uid() is null or not public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager','artist']) then
    raise exception 'Not authorized or MFA required';
  end if;
  select status into v_status from public.shops where id=p_shop_id for share;
  if v_status not in ('active','paused') or v_status is null then
    raise exception 'Shop cannot edit catalog';
  end if;
  if length(trim(coalesce(p_name,''))) not between 3 and 120
     or trim(coalesce(p_slug,'')) !~ '^[a-z0-9-]{3,80}$'
     or length(coalesce(p_description,'')) > 10000 then
    raise exception 'Product name, slug or description is invalid';
  end if;
  if p_product_type not in ('commission','ready_made','digital_asset') then
    raise exception 'Invalid product mode';
  end if;
  if p_work_type_id is not null and not exists (
    select 1 from public.shop_work_types where id=p_work_type_id and shop_id=p_shop_id
  ) then raise exception 'Work type does not belong to this shop'; end if;
  if p_personal_price_minor is null or p_commercial_price_minor is null
     or p_personal_price_minor < 0 or p_commercial_price_minor < 0
     or p_personal_price_minor > 1000000000 or p_commercial_price_minor > 1000000000
     or length(coalesce(p_personal_terms,'')) > 2500
     or length(coalesce(p_commercial_terms,'')) > 2500 then
    raise exception 'License terms or prices are invalid';
  end if;
  if p_product_type = 'commission' and (coalesce(p_is_exclusive,false) or p_stock is not null) then
    raise exception 'Commission work uses a quote and cannot have ready-made stock';
  end if;
  if coalesce(p_is_exclusive,false) and (p_product_type <> 'ready_made' or p_stock <> 1) then
    raise exception 'Exclusive artwork must be ready-made with stock = 1';
  end if;
  if p_stock is not null and (p_stock < 0 or p_stock > 100000) then
    raise exception 'Stock out of bounds';
  end if;

  if p_product_id is null then
    insert into public.products (
      shop_id,slug,name,description,product_type,pricing_mode,work_type_id,status,is_exclusive,stock
    ) values (
      p_shop_id,trim(p_slug),trim(p_name),coalesce(p_description,''),p_product_type,
      case when p_product_type='commission' then 'quote' else 'fixed' end,
      p_work_type_id,'draft',coalesce(p_is_exclusive,false),p_stock
    ) returning id into v_product_id;
  else
    select * into v_old from public.products where id=p_product_id for update;
    if not found or v_old.shop_id <> p_shop_id or v_old.status <> 'draft' then
      raise exception 'Only this shop''s draft products may be edited';
    end if;
    if v_old.product_type <> p_product_type and exists(
      select 1 from public.product_files where product_id=p_product_id
    ) then
      raise exception 'Cannot change product mode after uploading files';
    end if;
    update public.products set
      slug=trim(p_slug),name=trim(p_name),description=coalesce(p_description,''),
      product_type=p_product_type,
      pricing_mode=case when p_product_type='commission' then 'quote' else 'fixed' end,
      work_type_id=p_work_type_id,is_exclusive=coalesce(p_is_exclusive,false),stock=p_stock
    where id=p_product_id returning id into v_product_id;
  end if;

  insert into public.product_license_prices(product_id,usage_type,price_minor,terms)
    values(v_product_id,'personal',p_personal_price_minor,coalesce(p_personal_terms,'')),
          (v_product_id,'commercial',p_commercial_price_minor,coalesce(p_commercial_terms,''))
    on conflict(product_id,usage_type) do update
    set price_minor=excluded.price_minor,terms=excluded.terms;

  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),p_shop_id,
      case when p_product_id is null then 'catalog_draft_created' else 'catalog_draft_updated' end,
      'products',v_product_id,
      pg_catalog.jsonb_build_object('product_type',p_product_type,'status','draft'));
  return v_product_id;
end;
$$;

-- Restore original attach_seller_product_file from 005_seller_catalog_drafts.sql
create or replace function public.attach_seller_product_file(
  p_product_id uuid,p_file_path text,p_is_delivery_file boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype; v_file_id uuid;
  v_dir text;
begin
  select * into v_product from public.products where id=p_product_id for update;
  if not found or v_product.status <> 'draft' or
     not public.is_shop_member(v_product.shop_id,auth.uid(),array['owner','manager','artist']) then
    raise exception 'Not authorized or product not a draft';
  end if;
  if not exists(select 1 from public.shops where id=v_product.shop_id and status in ('active','paused')) then
    raise exception 'Shop is not editable';
  end if;
  v_dir := case when p_is_delivery_file then 'deliverables' else 'previews' end;
  if p_file_path not like 'shops/'||v_product.shop_id::text||'/products/'||v_product.id::text||'/'||v_dir||'/%' then
    raise exception 'File path does not belong to this draft';
  end if;
  if p_is_delivery_file and v_product.product_type='commission' then
    raise exception 'Commission delivery is handled only after an order';
  end if;
  if (not p_is_delivery_file and (select count(*) from public.product_files where product_id=p_product_id and not is_delivery_file)>=6)
     or (p_is_delivery_file and (select count(*) from public.product_files where product_id=p_product_id and is_delivery_file)>=3) then
    raise exception 'File limit exceeded';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='tidalis-product-files'
     and name=p_file_path and owner_id=auth.uid()::text) then
    raise exception 'Upload object is missing or has a different owner';
  end if;
  insert into public.product_files(product_id,file_path,is_delivery_file)
    values(p_product_id,p_file_path,p_is_delivery_file) returning id into v_file_id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),v_product.shop_id,'catalog_file_attached','product_files',v_file_id,
       pg_catalog.jsonb_build_object('product_id',p_product_id,'kind',v_dir));
  return v_file_id;
end;
$$;

-- Restore original save_shop_policy_draft from 007_shop_policy_documents.sql
create or replace function public.save_shop_policy_draft(
 p_shop_id uuid, p_policy_type text, p_content text, p_draft_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_policy public.shop_policy_versions%rowtype;
  v_id uuid; v_version integer; v_status text;
begin
  if not public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager']) then
    raise exception 'Shop owner/manager MFA required';
  end if;
  select status into v_status from public.shops where id=p_shop_id;
  if v_status is null or v_status not in ('paused','active') then raise exception 'Shop is not eligible'; end if;
  if p_policy_type is null or p_policy_type not in ('refund','delivery','license','other') then
    raise exception 'Invalid shop policy type';
  end if;
  if length(trim(coalesce(p_content,''))) not between 1 and 30000 then
    raise exception 'Draft must contain 1-30000 characters; submit requires at least 200';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_shop_id::text),pg_catalog.hashtext(p_policy_type));
  if p_draft_id is not null then
    select * into v_policy from public.shop_policy_versions
      where id=p_draft_id and shop_id=p_shop_id and policy_type=p_policy_type for update;
    if not found or v_policy.status <> 'draft' then raise exception 'Draft no longer editable'; end if;
    if v_policy.source_type <> 'text' then raise exception 'This draft uses a PDF; upload a revised PDF instead'; end if;
    update public.shop_policy_versions set content=trim(p_content),review_note=null,
      review_outcome=null,reviewed_by=null,reviewed_at=null
      where id=v_policy.id returning id into v_id;
  else
    if exists(select 1 from public.shop_policy_versions where shop_id=p_shop_id
        and policy_type=p_policy_type and status in ('draft','under_review')) then
      raise exception 'Existing draft or under-review version; edit that version first';
    end if;
    select coalesce(max(version),0)+1 into v_version from public.shop_policy_versions
      where shop_id=p_shop_id and policy_type=p_policy_type;
    insert into public.shop_policy_versions(shop_id,policy_type,version,content,status,source_type)
      values(p_shop_id,p_policy_type,v_version,trim(p_content),'draft','text') returning id into v_id;
  end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),p_shop_id,'shop_policy_draft_saved','shop_policy_versions',v_id,
      pg_catalog.jsonb_build_object('policy_type',p_policy_type,'source_type','text'));
  return v_id;
end;
$$;

-- Restore original save_shop_policy_document_draft from 007_shop_policy_documents.sql
create or replace function public.save_shop_policy_document_draft(
 p_shop_id uuid, p_policy_type text, p_file_path text, p_document_name text,
 p_document_size bigint, p_draft_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_policy public.shop_policy_versions%rowtype;
  v_object storage.objects%rowtype; v_id uuid; v_version integer; v_status text;
begin
  if not public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager']) then
    raise exception 'Shop owner/manager MFA required'; end if;
  select status into v_status from public.shops where id=p_shop_id;
  if v_status is null or v_status not in ('paused','active') then raise exception 'Shop is not eligible'; end if;
  if p_policy_type is null or p_policy_type not in ('refund','delivery','license','other') then
    raise exception 'Invalid shop policy type'; end if;
  if p_file_path is null or p_file_path !~ ('^shops/'||p_shop_id::text||'/policies/[0-9a-f-]{36}\.pdf$') then
    raise exception 'Invalid policy PDF path'; end if;
  if p_document_name is null or length(trim(p_document_name)) not between 5 and 160
     or lower(p_document_name) !~ '\.pdf$' or position('/' in p_document_name)>0 or position(chr(92) in p_document_name)>0 or p_document_name ~ '[[:cntrl:]]'
     or p_document_size is null or p_document_size not between 1 and 8388608 then
    raise exception 'Invalid PDF file name or size'; end if;
  select * into v_object from storage.objects where bucket_id='tidalis-policy-documents'
    and name=p_file_path and owner_id=auth.uid()::text;
  if not found or (v_object.metadata->>'mimetype') is distinct from 'application/pdf'
    or (v_object.metadata->>'size')::bigint is distinct from p_document_size then
    raise exception 'Private PDF upload is missing, invalid, or has a different owner/size'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_shop_id::text),pg_catalog.hashtext(p_policy_type));
  if p_draft_id is not null then
    select * into v_policy from public.shop_policy_versions where id=p_draft_id
      and shop_id=p_shop_id and policy_type=p_policy_type for update;
    if not found or v_policy.status <> 'draft' or v_policy.source_type <> 'pdf' then
      raise exception 'This PDF draft is no longer editable'; end if;
    update public.shop_policy_versions set document_path=p_file_path,
      document_name=trim(p_document_name),document_size=p_document_size,
      review_note=null,review_outcome=null,reviewed_by=null,reviewed_at=null
      where id=v_policy.id returning id into v_id;
  else
    if exists(select 1 from public.shop_policy_versions where shop_id=p_shop_id
        and policy_type=p_policy_type and status in ('draft','under_review')) then
      raise exception 'Existing draft or under-review version; edit that version first'; end if;
    select coalesce(max(version),0)+1 into v_version from public.shop_policy_versions
      where shop_id=p_shop_id and policy_type=p_policy_type;
    insert into public.shop_policy_versions(shop_id,policy_type,version,content,status,
      source_type,document_path,document_name,document_size)
      values(p_shop_id,p_policy_type,v_version,'[PDF attached: see document]','draft',
        'pdf',p_file_path,trim(p_document_name),p_document_size) returning id into v_id;
  end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),p_shop_id,'shop_policy_pdf_draft_saved','shop_policy_versions',v_id,
      pg_catalog.jsonb_build_object('policy_type',p_policy_type,'source_type','pdf',
        'document_name',p_document_name,'document_size',p_document_size));
  return v_id;
end;
$$;

-- Restore original tidalis_shop_readiness_blockers from 008_shop_readiness_product_publishing.sql
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

-- Restore original tidalis_product_publish_blockers from 008_shop_readiness_product_publishing.sql
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

drop function if exists public.tidalis_seller_routine_access(uuid,text[]);
commit;
