-- Tidalis Phase 5 — seller-owned catalog drafts and PRIVATE file staging.
-- Apply AFTER 001-004. BACK UP and rehearse on a matching staging database FIRST.
-- NO publishing, ordering, payment, public storage bucket, or buyer downloads in this phase.

create unique index if not exists tidalis_product_files_unique_path on public.product_files(file_path);

-- A paused, approved shop can prepare drafts; suspended shops cannot modify inventory.
-- Only OWNER, MANAGER, ARTIST with an AAL2 Supabase session may write via this RPC.
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
revoke all on function public.save_seller_product_draft(uuid,uuid,text,text,text,text,uuid,boolean,integer,bigint,text,bigint,text) from public,anon;
grant execute on function public.save_seller_product_draft(uuid,uuid,text,text,text,text,uuid,boolean,integer,bigint,text,bigint,text) to authenticated;

-- A PRIVATE bucket. Supabase Storage may impose a lower project-wide upload limit.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('tidalis-product-files','tidalis-product-files',false,26214400,
  array['image/png','image/jpeg','image/webp','application/zip','application/x-zip-compressed','application/pdf','application/octet-stream'])
on conflict(id) do nothing;

do $$ begin
  if exists(select 1 from storage.buckets where id='tidalis-product-files' and public=true) then
    raise exception 'tidalis-product-files must NOT be a public bucket';
  end if;
end $$;

-- Path: shops/{shop_uuid}/products/{product_uuid}/{previews|deliverables}/{random_uuid}.{ext}
-- Upload requires owner/manager/artist, matching draft product, and AAL2.
create policy tidalis_catalog_files_insert on storage.objects
for insert to authenticated with check (
 bucket_id='tidalis-product-files'
 and (storage.foldername(name))[1]='shops'
 and (storage.foldername(name))[3]='products'
 and (storage.foldername(name))[5] in ('previews','deliverables')
 and (name ~ '^shops/[0-9a-f-]{36}/products/[0-9a-f-]{36}/(previews|deliverables)/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|zip|pdf|psd|clip|kra)$')
 and exists(
   select 1 from public.products p
   join public.shops s on s.id=p.shop_id
   where p.id::text=(storage.foldername(storage.objects.name))[4]
     and p.shop_id::text=(storage.foldername(storage.objects.name))[2]
     and p.status='draft' and s.status in ('active','paused')
     and public.is_shop_member(p.shop_id,(select auth.uid()),array['owner','manager','artist'])
 )
);

-- Storage objects remain private; only the artist team can view / sign a URL.
create policy tidalis_catalog_files_read on storage.objects
for select to authenticated using (
 bucket_id='tidalis-product-files'
 and (storage.foldername(name))[1]='shops'
 and (storage.foldername(name))[3]='products'
 and exists(
   select 1 from public.products p where p.id::text=(storage.foldername(storage.objects.name))[4]
     and p.shop_id::text=(storage.foldername(storage.objects.name))[2]
     and public.is_shop_member(p.shop_id,(select auth.uid()),array['owner','manager','artist'])
 )
);

-- Record file metadata only after checking the uploaded object exists and belongs to this user's path.
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
revoke all on function public.attach_seller_product_file(uuid,text,boolean) from public,anon;
grant execute on function public.attach_seller_product_file(uuid,text,boolean) to authenticated;
