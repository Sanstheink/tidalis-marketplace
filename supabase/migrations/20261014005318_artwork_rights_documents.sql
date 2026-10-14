-- Additive artwork agreements. No existing purchases are treated as new signatures.
alter table public.order_receipt_recipients add column tax_id text check(tax_id is null or tax_id ~ '^[A-Za-z0-9 -]{6,40}$');
create function private.create_order_payment_with_identity(p_order uuid,p_method text,p_name text,p_address text,p_tax_id text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;r public.order_receipt_recipients%rowtype;a public.payment_attempts%rowtype;v uuid;t text:=nullif(trim(p_tax_id),'');
begin
 select * into o from public.orders where id=p_order and buyer_id=auth.uid() for update;
 if not found then raise exception 'order_unavailable';end if;
 if t is not null and t !~ '^[A-Za-z0-9 -]{6,40}$' then raise exception 'invalid_tax_id';end if;
 select * into r from public.order_receipt_recipients where order_id=o.id;
 if found then
  if r.name is distinct from trim(p_name) or coalesce(r.address,'') is distinct from trim(coalesce(p_address,'')) or r.tax_id is distinct from t then raise exception 'receipt_recipient_locked';end if;
 else
  if length(trim(coalesce(p_name,''))) not between 3 and 160 or length(coalesce(p_address,''))>1000 then raise exception 'receipt_recipient_required';end if;
  if exists(select 1 from public.payment_attempts where order_id=o.id) then raise exception 'payment_already_started';end if;
  insert into public.order_receipt_recipients(order_id,name,address,tax_id) values(o.id,trim(p_name),nullif(trim(p_address),''),t);
 end if;
 v:=private.create_payment_attempt(o.id,null,p_method);select * into a from public.payment_attempts where id=v;
 if length(trim(coalesce(a.recipient_snapshot->>'billingAddress','')))<15 then raise exception 'billing_identity_required';end if;return v;
end $$;
create function public.create_order_payment_with_identity(p_order uuid,p_method text,p_name text,p_address text,p_tax_id text) returns uuid language sql security invoker set search_path='' as $$select private.create_order_payment_with_identity(p_order,p_method,p_name,p_address,p_tax_id)$$;
revoke all on function public.create_order_payment_with_identity(uuid,text,text,text,text),private.create_order_payment_with_identity(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_order_payment_with_identity(uuid,text,text,text,text),private.create_order_payment_with_identity(uuid,text,text,text,text) to authenticated;

create table public.artwork_rights_documents (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),order_item_id uuid not null references public.order_items(id),
 shop_id uuid not null references public.shops(id),buyer_id uuid not null references auth.users(id),product_id uuid not null references public.products(id),
 kind text not null check(kind in ('license','assignment')),version integer not null check(version>0),
 status text not null default 'offered' check(status in ('offered','effective','withdrawn','declined','superseded')),
 exclusive_mode text not null check(exclusive_mode in ('non_exclusive','sole','exclusive','assignment')),
 snapshot jsonb not null,content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),execution_hash text check(execution_hash ~ '^[a-f0-9]{64}$'),
 preview_path text not null,policy_version_id uuid not null references public.platform_policy_versions(id),request_key uuid not null,
 seller_id uuid not null references auth.users(id),seller_signature text not null check(length(seller_signature) between 3 and 160),
 offered_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',
 buyer_signature text check(length(buyer_signature) between 3 and 160),accepted_at timestamptz,closed_at timestamptz,
 unique(order_id,request_key),unique(order_item_id,version),
 check((status in ('effective','superseded'))=(accepted_at is not null and buyer_signature is not null and execution_hash is not null))
);
create unique index rights_one_offer on public.artwork_rights_documents(order_item_id) where status='offered';
create unique index rights_one_current_kind on public.artwork_rights_documents(order_item_id,kind) where status='effective';
create index rights_shop on public.artwork_rights_documents(shop_id);
create index rights_buyer on public.artwork_rights_documents(buyer_id);
create index rights_product on public.artwork_rights_documents(product_id,status);
create index rights_policy on public.artwork_rights_documents(policy_version_id);
create index rights_seller on public.artwork_rights_documents(seller_id);
create index rights_preview on public.artwork_rights_documents(preview_path);
alter table public.artwork_rights_documents enable row level security;
revoke all on public.artwork_rights_documents from anon,authenticated;
grant select on public.artwork_rights_documents to authenticated;
create policy rights_read on public.artwork_rights_documents for select to authenticated using (
 buyer_id=(select auth.uid()) or ((select auth.jwt()->>'aal')='aal2' and public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']))
);
create function private.lock_artwork_rights() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Artwork agreement is immutable';end if;
 if (to_jsonb(new)-array['status','buyer_signature','accepted_at','execution_hash','closed_at']) is distinct from (to_jsonb(old)-array['status','buyer_signature','accepted_at','execution_hash','closed_at']) then raise exception 'Artwork agreement is immutable';end if;
 if old.status='offered' and new.status in ('effective','withdrawn','declined') then return new;end if;
 if old.status='effective' and new.status='superseded' and new.buyer_signature is not distinct from old.buyer_signature and new.accepted_at is not distinct from old.accepted_at and new.execution_hash is not distinct from old.execution_hash then return new;end if;
 raise exception 'Artwork agreement is immutable';
end $$;
create trigger rights_immutable before update or delete on public.artwork_rights_documents for each row execute function private.lock_artwork_rights();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tidalis-rights-previews','tidalis-rights-previews',false,2097152,array['image/png','image/jpeg']);
create function private.rights_preview_access(p_path text,p_write boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v uuid;
begin
 if auth.uid() is null or p_path !~ '^orders/[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg)$' then return false;end if;
 begin v:=split_part(p_path,'/',2)::uuid;exception when invalid_text_representation then return false;end;
 if exists(select 1 from public.orders where id=v and auth.jwt()->>'aal'='aal2' and public.is_shop_member(shop_id,auth.uid(),array['owner','manager'])) then return true;end if;
 return not p_write and exists(select 1 from public.artwork_rights_documents where order_id=v and preview_path=p_path and buyer_id=auth.uid());
end $$;
revoke all on function private.rights_preview_access(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.rights_preview_access(text,boolean) to authenticated;
create policy rights_preview_insert on storage.objects for insert to authenticated with check(bucket_id='tidalis-rights-previews' and private.rights_preview_access(name,true));
create policy rights_preview_read on storage.objects for select to authenticated using(bucket_id='tidalis-rights-previews' and private.rights_preview_access(name,false));
-- No UPDATE/DELETE: a signed thumbnail must remain reproducible; no mutable URL references.

create function private.offer_artwork_rights(p_item uuid,p_kind text,p_details jsonb,p_policy uuid,p_preview text,p_signature text,p_confirmed boolean,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.order_items%rowtype;o public.orders%rowtype;r public.financial_documents%rowtype;p public.platform_policy_versions%rowtype;d public.artwork_rights_documents%rowtype;s jsonb;mode text;usage text;v uuid;ver integer;
begin
 select * into i from public.order_items where id=p_item;
 if not found then raise exception 'rights_unavailable';end if;
 select * into o from public.orders where id=i.order_id for update;
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not public.is_shop_member(o.shop_id,auth.uid(),array['owner','manager']) then raise exception 'rights_seller_required';end if;
 if p_confirmed is distinct from true or length(trim(coalesce(p_signature,''))) not between 3 and 160 or p_key is null then raise exception 'rights_confirmation_required';end if;
 select * into d from public.artwork_rights_documents where order_id=o.id and request_key=p_key;
 if found then
  if d.order_item_id=p_item and d.kind=p_kind and d.seller_id=auth.uid() and d.seller_signature=trim(p_signature) and d.snapshot->'requested_details'=p_details and d.policy_version_id=p_policy and d.preview_path=p_preview then return d.id;end if;
  raise exception 'rights_request_conflict';
 end if;
 if o.status not in ('fulfilled','partially_refunded') or not exists(select 1 from public.download_entitlements where order_item_id=i.id and buyer_id=o.buyer_id and revoked_at is null) then raise exception 'rights_delivery_required';end if;
 if exists(select 1 from public.refund_requests where order_id=o.id and status in ('requested','under_review','approved','processing')) then raise exception 'rights_delivery_required';end if;
 select * into r from public.financial_documents where order_id=o.id and document_type='receipt' and status='issued' for share;
 if not found or not exists(select 1 from public.payment_attempts where order_id=o.id and status='confirmed') then raise exception 'rights_receipt_required';end if;
 if exists(select 1 from public.artwork_rights_documents where order_item_id=i.id and (status='offered' or (status='effective' and kind='assignment'))) then raise exception 'rights_existing_document';end if;
 if p_kind is null or p_kind not in ('license','assignment') then raise exception 'rights_invalid_details';end if;
 select * into p from public.platform_policy_versions where id=p_policy and policy_type=case when p_kind='license' then 'standard-license' else 'standard-assignment' end and status='published' and approved_by is not null and effective_from<=now() for share;
 if not found then raise exception 'rights_policy_unavailable';end if;
 if jsonb_typeof(p_details) is distinct from 'object' or length(trim(coalesce(p_details->>'title',''))) not between 3 and 200 or length(trim(coalesce(p_details->>'licensor',''))) not between 3 and 160 or length(trim(coalesce(p_details->>'scope',''))) not between 30 and 2500 or length(trim(coalesce(p_details->>'territory',''))) not between 2 and 160 or coalesce(p_details->>'source','') not in ('brief','site_chat','external') or length(trim(coalesce(p_details->>'agreement_reference',''))) not between 10 and 1000 then raise exception 'rights_invalid_details';end if;
 if coalesce(p_details->>'duration','') not in ('perpetual','until') then raise exception 'rights_invalid_duration';end if;
 if p_details->>'duration'='until' then
  begin if (p_details->>'ends_on')::date is null or (p_details->>'ends_on')::date<=(now() at time zone 'Asia/Bangkok')::date then raise exception 'rights_invalid_duration';end if;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'rights_invalid_duration';end;
 end if;
 mode:=case when p_kind='assignment' then 'assignment' else p_details->>'exclusivity' end;usage:=case when p_kind='assignment' then 'assignment' else p_details->>'usage' end;
 if p_kind='license' and (coalesce(mode,'') not in ('non_exclusive','sole','exclusive') or coalesce(usage,'') not in ('personal','commercial','merchandise')) then raise exception 'rights_invalid_details';end if;
 if p_preview is null or p_preview !~ ('^orders/'||o.id::text||'/[a-f0-9-]{36}\.(png|jpg)$') or not exists(select 1 from storage.objects where bucket_id='tidalis-rights-previews' and name=p_preview and (metadata->>'size')::bigint between 1 and 2097152 and metadata->>'mimetype' in ('image/png','image/jpeg')) then raise exception 'rights_preview_required';end if;
 if o.order_kind='fixed' then
  perform 1 from public.products where id=i.product_id for update;
  if exists(select 1 from public.artwork_rights_documents where product_id=i.product_id and order_item_id<>i.id and exclusive_mode<>'non_exclusive' and (status='effective' or (status='offered' and expires_at>now()))) then raise exception 'rights_conflict';end if;
  if mode<>'non_exclusive' and (i.quantity<>1 or exists(select 1 from public.order_items oi join public.orders oo on oo.id=oi.order_id where oi.product_id=i.product_id and oi.id<>i.id and oo.status not in ('cancelled','refunded') and not (oo.status='pending' and oo.reservation_expires_at<=now()))) then raise exception 'rights_prior_sales';end if;
 end if;
 s:=jsonb_build_object('preview_path',p_preview,'title',trim(p_details->>'title'),'artwork_type','งานศิลปกรรม (ภาพวาด/ภาพประกอบ/ภาพวาดดิจิทัล)','licensor',trim(p_details->>'licensor'),'licensee',r.document_snapshot->'recipient','receipt_id',r.id,'receipt_number',r.document_number,'payment_id',r.document_snapshot->>'payment_id','amount_minor',o.total_minor,'currency',o.currency,'usage',usage,'exclusivity',mode,'territory',trim(p_details->>'territory'),'duration',p_details->>'duration','ends_on',case when p_details->>'duration'='until' then p_details->>'ends_on' else null end,'scope',trim(p_details->>'scope'),'source',p_details->>'source','agreement_reference',trim(p_details->>'agreement_reference'),'original_terms',i.item_snapshot->>'license_terms','policy',jsonb_build_object('id',p.id,'title',p.title,'version',p.version,'content',p.content),'requested_details',p_details);
 select coalesce(max(version),0)+1 into ver from public.artwork_rights_documents where order_item_id=i.id;
 insert into public.artwork_rights_documents(order_id,order_item_id,shop_id,buyer_id,product_id,kind,version,exclusive_mode,snapshot,content_hash,preview_path,policy_version_id,request_key,seller_id,seller_signature)
 values(o.id,i.id,o.shop_id,o.buyer_id,i.product_id,p_kind,ver,mode,s,encode(sha256(convert_to(s::text,'UTF8')),'hex'),p_preview,p.id,p_key,auth.uid(),trim(p_signature)) returning id into v;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'artwork_rights_offered','artwork_rights_documents',v);return v;
end $$;

create function private.accept_artwork_rights(p_document uuid,p_hash text,p_signature text,p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare d public.artwork_rights_documents%rowtype;o public.orders%rowtype;t timestamptz:=now();
begin
 select * into d from public.artwork_rights_documents where id=p_document and buyer_id=auth.uid();if not found then raise exception 'rights_unavailable';end if;
 select * into o from public.orders where id=d.order_id for update;
 select * into d from public.artwork_rights_documents where id=p_document for update;
 if p_confirmed is distinct from true or length(trim(coalesce(p_signature,''))) not between 3 and 160 or p_hash is distinct from d.content_hash then raise exception 'rights_confirmation_required';end if;
 if d.status='effective' and d.buyer_signature=trim(p_signature) then return;end if;
 if d.status<>'offered' or d.expires_at<=now() then raise exception 'rights_offer_closed';end if;
 if o.status not in ('fulfilled','partially_refunded') or not exists(select 1 from public.download_entitlements where order_item_id=d.order_item_id and buyer_id=auth.uid() and revoked_at is null) or exists(select 1 from public.refund_requests where order_id=o.id and status in ('requested','under_review','approved','processing')) then raise exception 'rights_delivery_required';end if;
 perform 1 from public.financial_documents where id=(d.snapshot->>'receipt_id')::uuid and status='issued' for share;
 if not found then raise exception 'rights_receipt_changed';end if;
 if d.snapshot->>'duration'='until' and (d.snapshot->>'ends_on')::date<=(now() at time zone 'Asia/Bangkok')::date then raise exception 'rights_invalid_duration';end if;
 if o.order_kind='fixed' and d.exclusive_mode<>'non_exclusive' then
  perform 1 from public.products where id=d.product_id for update;
  update public.products set status='archived' where id=d.product_id and status='published';
 end if;
 update public.artwork_rights_documents set status='superseded',closed_at=t where order_item_id=d.order_item_id and status='effective' and (kind=d.kind or d.kind='assignment');
 update public.artwork_rights_documents set status='effective',buyer_signature=trim(p_signature),accepted_at=t,execution_hash=encode(sha256(convert_to(jsonb_build_object('content',d.content_hash,'seller',d.seller_id,'seller_signature',d.seller_signature,'offered',d.offered_at,'buyer',auth.uid(),'buyer_signature',trim(p_signature),'accepted',t)::text,'UTF8')),'hex') where id=d.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),d.shop_id,'artwork_rights_accepted','artwork_rights_documents',d.id,jsonb_build_object('content_hash',d.content_hash));
end $$;
create function private.close_artwork_rights(p_document uuid,p_decline boolean) returns void language plpgsql security definer set search_path='' as $$
declare d public.artwork_rights_documents%rowtype;st text;
begin
 select * into d from public.artwork_rights_documents where id=p_document;if not found then raise exception 'rights_unavailable';end if;
 perform 1 from public.orders where id=d.order_id for update;select * into d from public.artwork_rights_documents where id=p_document for update;
 if p_decline is true and auth.uid()=d.buyer_id then st:='declined';
 elsif p_decline is false and coalesce(auth.jwt()->>'aal','')='aal2' and public.is_shop_member(d.shop_id,auth.uid(),array['owner','manager']) then st:='withdrawn';
 else raise exception 'rights_unavailable';end if;
 if d.status=st then return;end if;if d.status<>'offered' then raise exception 'rights_offer_closed';end if;
 update public.artwork_rights_documents set status=st,closed_at=now() where id=d.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),d.shop_id,'artwork_rights_'||st,'artwork_rights_documents',d.id);
end $$;
create function private.guard_artwork_reservation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.orders where id=new.order_id and order_kind='fixed') then
  perform 1 from public.products where id=new.product_id for update;
  if exists(select 1 from public.artwork_rights_documents where product_id=new.product_id and exclusive_mode<>'non_exclusive' and (status='effective' or (status='offered' and expires_at>now()))) then raise exception 'rights_conflict';end if;
 end if;return new;
end $$;
create trigger artwork_reservation before insert on public.order_items for each row execute function private.guard_artwork_reservation();
create function public.offer_artwork_rights(p_item uuid,p_kind text,p_details jsonb,p_policy uuid,p_preview text,p_signature text,p_confirmed boolean,p_key uuid) returns uuid language sql security invoker set search_path='' as $$select private.offer_artwork_rights(p_item,p_kind,p_details,p_policy,p_preview,p_signature,p_confirmed,p_key)$$;
create function public.accept_artwork_rights(p_document uuid,p_hash text,p_signature text,p_confirmed boolean) returns void language sql security invoker set search_path='' as $$select private.accept_artwork_rights(p_document,p_hash,p_signature,p_confirmed)$$;
create function public.close_artwork_rights(p_document uuid,p_decline boolean) returns void language sql security invoker set search_path='' as $$select private.close_artwork_rights(p_document,p_decline)$$;
revoke all on function private.lock_artwork_rights(),private.guard_artwork_reservation() from public,anon,authenticated,service_role;
revoke all on function public.offer_artwork_rights(uuid,text,jsonb,uuid,text,text,boolean,uuid),private.offer_artwork_rights(uuid,text,jsonb,uuid,text,text,boolean,uuid),public.accept_artwork_rights(uuid,text,text,boolean),private.accept_artwork_rights(uuid,text,text,boolean),public.close_artwork_rights(uuid,boolean),private.close_artwork_rights(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.offer_artwork_rights(uuid,text,jsonb,uuid,text,text,boolean,uuid),private.offer_artwork_rights(uuid,text,jsonb,uuid,text,text,boolean,uuid),public.accept_artwork_rights(uuid,text,text,boolean),private.accept_artwork_rights(uuid,text,text,boolean),public.close_artwork_rights(uuid,boolean),private.close_artwork_rights(uuid,boolean) to authenticated;

create or replace function private.create_shop_receipt(p_order uuid,p_name text,p_address text,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;a public.payment_attempts%rowtype;p public.payment_profiles%rowtype;v uuid;num text;items jsonb;begin
 select * into o from public.orders where id=p_order for update;
 if not found or p_actor is null then raise exception 'confirmed_payment_required';end if;
 select id into v from public.financial_documents where order_id=o.id and document_type='receipt' and status='issued';if found then return v;end if;
 select * into a from public.payment_attempts where order_id=o.id and status='confirmed';
 if not found or a.amount_minor<>o.total_minor or a.currency<>o.currency or o.vat_minor<>0 or length(trim(coalesce(p_name,''))) not between 3 and 160 or length(coalesce(p_address,''))>1000 then raise exception 'confirmed_payment_required';end if;
 select * into p from public.payment_profiles where shop_id=o.shop_id;
 if not found or length(trim(coalesce(a.recipient_snapshot->>'billingAddress',p.billing_address,'')))<15 then raise exception 'billing_identity_required';end if;
 select jsonb_agg(jsonb_build_object('name',item_snapshot->>'name','license',usage_type,'quantity',quantity,'unit_minor',price_minor,'total_minor',quantity*price_minor)) into items from public.order_items where order_id=o.id;
 num:='TD-SH-'||to_char(now() at time zone 'Asia/Bangkok','YYYY')||'-'||lpad(nextval('public.tidalis_shop_receipt_seq')::text,7,'0');
 insert into public.financial_documents(shop_id,order_id,document_type,document_number,document_snapshot,issued_by,issued_at)
 values(o.shop_id,o.id,'receipt',num,jsonb_build_object('currency',o.currency,'total_minor',o.total_minor,'vat_minor',0,'payment_id',a.id,'replacement_for',(select id from public.financial_documents where order_id=o.id and document_type='receipt' and status='void' order by issued_at desc limit 1),'items',items,
 'issuer',jsonb_build_object('name',a.recipient_snapshot->>'name','address',coalesce(a.recipient_snapshot->>'billingAddress',p.billing_address)),
 'recipient',jsonb_build_object('name',trim(p_name),'address',nullif(trim(p_address),''),'tax_id',(select tax_id from public.order_receipt_recipients where order_id=o.id and name=trim(p_name)))),p_actor,now()) returning id into v;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,o.shop_id,'shop_receipt_issued','financial_documents',v);return v;
end $$;

create or replace function public.create_platform_policy_draft(
  p_policy_type text, p_title text, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version integer;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_policy_type is null or p_policy_type not in (
    'terms','privacy','cookies','buyer-protection','payment-refund','copyright','community','standard-license','standard-assignment') then
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
    'terms','privacy','cookies','buyer-protection','payment-refund','copyright','community','standard-license','standard-assignment') then
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
    'terms','privacy','cookies','buyer-protection','payment-refund','copyright','community','standard-license','standard-assignment')
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

insert into public.platform_policy_versions(policy_type,version,title,content,status) select 'standard-license',1,'Standard Platform License Terms',$terms$ข้อกำหนดมาตรฐานการอนุญาตให้ใช้สิทธิ์ผลงานศิลปกรรม

1. คู่สัญญาและผลงาน
ผู้ให้สิทธิ์และผู้รับสิทธิ์คือบุคคลหรือนิติบุคคลที่ระบุในใบรับรอง ผู้ลงนามแทนนิติบุคคลต้องมีอำนาจผูกพันบุคคลนั้น ผู้ให้สิทธิ์รับรองว่ามีอำนาจอนุญาตตามขอบเขตที่เสนอ และต้องเปิดเผยสิทธิ์บุคคลภายนอกหรือส่วนประกอบที่ไม่อยู่ในสิทธิ์ของตน ภาพตัวอย่างใช้ระบุผลงานประกอบชื่อและคำสั่งซื้อ ไม่ใช่ไฟล์ส่งมอบฉบับเต็ม

2. ประเภทการใช้งาน
Personal License อนุญาตใช้ส่วนตัวโดยไม่แสวงหาประโยชน์ทางการค้า Commercial License อนุญาตใช้ประกอบกิจการ สื่อโฆษณาและเนื้อหาเชิงพาณิชย์ตามขอบเขตที่ระบุ แต่ไม่รวมผลิตสินค้าเพื่อจำหน่ายโดยใช้ผลงานเป็นองค์ประกอบหลัก เว้นแต่ตกลงไว้ชัดเจน Merchandise License อนุญาตผลิตสินค้าเพื่อจำหน่ายตามประเภท จำนวน และข้อจำกัดที่ระบุในขอบเขตสัญญา ทุกประเภทไม่อนุญาตขายต่อไฟล์ต้นฉบับหรือให้สิทธิ์ช่วงแก่บุคคลอื่น เว้นแต่คู่สัญญาระบุไว้ชัดเจน

3. ลักษณะการให้สิทธิ์
Non-exclusive ผู้ให้สิทธิ์ยังใช้เองและอนุญาตผู้อื่นได้ Sole ผู้ให้สิทธิ์ยังใช้เองได้แต่จะไม่อนุญาตบุคคลอื่นในขอบเขตเดียวกัน Exclusive ผู้ให้สิทธิ์จะไม่ใช้เองหรืออนุญาตผู้อื่นในขอบเขตเดียวกันตลอดระยะเวลาที่ตกลง สิทธิ์ทุกแบบเป็นการอนุญาต ไม่ใช่การโอนความเป็นเจ้าของลิขสิทธิ์ สิทธิ์ของบุคคลภายนอกที่เกิดขึ้นก่อนหน้านี้ไม่ถูกยกเลิกด้วยใบรับรองนี้

4. พื้นที่ ระยะเวลา และข้อจำกัด
ให้ใช้ทั่วโลกและตลอดอายุที่กฎหมายคุ้มครองลิขสิทธิ์เป็นค่าเริ่มต้น เว้นแต่เอกสารระบุพื้นที่หรือวันสิ้นสุดอื่น ผู้รับสิทธิ์ต้องปฏิบัติตามขอบเขตการดัดแปลง การระบุชื่อผู้สร้างสรรค์ จำนวนผลิต และข้อจำกัดเฉพาะที่ปรากฏในเอกสาร ห้ามใช้ผลงานฝ่าฝืนกฎหมายหรือแอบอ้างเป็นผู้สร้างสรรค์

5. การแสดงเจตนาและวันมีผล
ผู้ให้สิทธิ์เสนอข้อตกลงด้วยบัญชีที่ยืนยันตัวตนและกรอกชื่อผู้ลงนาม ผู้รับสิทธิ์ต้องอ่านเอกสารฉบับเต็ม กรอกชื่อผู้ลงนาม และยืนยันยอมรับในบัญชีของตน ระบบบันทึกบัญชี เวลา ฉบับข้อกำหนด และค่าตรวจสอบความครบถ้วนของเอกสาร วันมีผลคือเวลาที่ผู้รับสิทธิ์ลงนามหลังชำระเงินและรับงานแล้ว การแจ้งในบรีฟหรือแชทเป็นเพียงข้อมูลประกอบ ไม่แทนการยอมรับเอกสารฉบับนี้

6. การแก้ไขและสิ้นสุด
เอกสารที่ยอมรับแล้วจะไม่ถูกแก้ทับ การเปลี่ยนขอบเขตต้องเสนอและยอมรับฉบับใหม่ การคืนเงินเต็มจำนวนทำให้สิทธิ์การใช้งานตามใบรับรองสิ้นสุดและต้องหยุดการใช้งานต่อไป การคืนเงินบางส่วนไม่ยกเลิกสิทธิ์โดยอัตโนมัติ การบอกเลิกจากเหตุผิดสัญญาต้องแจ้งเหตุและเปิดโอกาสแก้ไขตามข้อตกลงและกฎหมายที่เกี่ยวข้อง

7. หลักฐานและข้อพิพาท
คู่สัญญาดาวน์โหลดต้นฉบับอิเล็กทรอนิกส์ได้ และตรวจฉบับที่บันทึกผ่าน QR หลังเข้าสู่ระบบ ข้อกำหนดที่ยอมรับถูกเก็บตามฉบับนั้น การแก้ไขนโยบายในอนาคตไม่เปลี่ยนสัญญาย้อนหลัง คู่สัญญาควรติดต่อแก้ข้อพิพาทโดยสุจริตและใช้สิทธิตามกฎหมายไทยโดยไม่ตัดสิทธิตามกฎหมายบังคับ แพลตฟอร์มให้บริการบันทึกหลักฐาน มิใช่คู่สัญญา ไม่รับรองความเป็นเจ้าของลิขสิทธิ์ และเอกสารนี้ไม่ใช่หนังสือรับรองจากหน่วยงานรัฐ$terms$,'draft' where not exists(select 1 from public.platform_policy_versions where policy_type='standard-license');

insert into public.platform_policy_versions(policy_type,version,title,content,status) select 'standard-assignment',1,'Standard Assignment Terms',$terms$ข้อกำหนดสัญญาโอนสิทธิ์ขาดในลิขสิทธิ์มาตรฐาน

1. คู่สัญญาและอำนาจโอน
ผู้โอนและผู้รับโอนคือบุคคลหรือนิติบุคคลที่ระบุในสัญญา ผู้ลงนามแทนต้องมีอำนาจผูกพันคู่สัญญา ผู้โอนรับรองว่ามีสิทธิ์และอำนาจโอนลิขสิทธิ์ในผลงานที่ระบุ ต้องเปิดเผยเจ้าของร่วม สิทธิ์เดิม ส่วนประกอบของบุคคลอื่น และข้อจำกัดที่อาจกระทบผู้รับโอนก่อนลงนาม การแจ้งความประสงค์ในบรีฟหรือการสนทนาในเว็บไซต์หรือช่องทางออนไลน์ยังไม่ทำให้สัญญาฉบับนี้มีผล

2. ผลงานและสิทธิ์ที่โอน
ผู้โอนตกลงโอนสิทธิ์ทางเศรษฐกิจในลิขสิทธิ์ของผลงานศิลปกรรมที่ระบุ รวมถึงสิทธิ์ทำซ้ำ ดัดแปลง เผยแพร่ต่อสาธารณชน และอนุญาตให้ผู้อื่นใช้สิทธิ์ ภายในขอบเขตที่บันทึกไว้ ส่วนประกอบหรือสิทธิ์ที่ไม่โอนต้องระบุชัดเจน ภาพตัวอย่างใช้ระบุผลงานร่วมกับชื่อและรายละเอียดคำสั่งซื้อ ไม่ใช่การโอนผลงานอื่นของผู้โอน

3. พื้นที่และระยะเวลา
การโอนมีผลทั่วโลกตลอดอายุที่กฎหมายคุ้มครองลิขสิทธิ์ เว้นแต่คู่สัญญาระบุพื้นที่หรือวันสิ้นสุดอื่นไว้อย่างชัดเจนในเอกสาร การกำหนดวันสิ้นสุดต้องไม่ตีความว่าเป็นการโอนตลอดอายุการคุ้มครอง ผู้โอนต้องหยุดใช้หรือให้สิทธิ์บุคคลอื่นในส่วนที่โอนนับแต่วันมีผล เว้นแต่ได้รับอนุญาตจากผู้รับโอน

4. ค่าตอบแทนและวันมีผล
ค่าตอบแทนสำหรับการโอนรวมอยู่ในยอดคำสั่งซื้อที่ชำระและยืนยันแล้วตามใบเสร็จอ้างอิง หากตกลงค่าโอนเพิ่มเติม ต้องจัดการชำระและจัดทำหลักฐานให้ครบก่อนเสนอเอกสารนี้ สัญญามีผลเมื่อผู้รับโอนลงนามยอมรับหลังผู้โอนลงนาม ชำระเงิน และรับงานแล้ว วันมีผลไม่ย้อนหลังไปเป็นวันชำระเงิน

5. การลงนามอิเล็กทรอนิกส์
ผู้โอนจัดทำและเสนอเอกสารด้วยบัญชีร้านที่ยืนยันตัวตนหลายปัจจัย พร้อมกรอกชื่อและยืนยันอำนาจของตน ผู้รับโอนอ่านรายละเอียดและข้อกำหนดฉบับเต็ม กรอกชื่อ และยืนยันเจตนาในบัญชีของตน ระบบบันทึกบัญชีผู้ลงนาม เวลา เนื้อหาที่ไม่แก้ทับ และค่าตรวจสอบความครบถ้วนของเอกสาร ไม่ถือว่าลูกค้ายอมรับเพียงเพราะส่งบรีฟ สนทนา หรือชำระเงิน

6. สิทธิ์ของผู้สร้างสรรค์และบุคคลภายนอก
การโอนนี้ไม่อ้างว่าโอนหรือลบสิทธิ์ทางศีลธรรมของผู้สร้างสรรค์ที่กฎหมายคุ้มครอง และไม่ยกเลิกสิทธิ์ของบุคคลภายนอกที่เกิดขึ้นโดยชอบก่อนวันมีผล ผู้โอนต้องเปิดเผยสิทธิ์เดิมทั้งหมด ผู้รับโอนไม่ได้รับสิทธิ์ในเครื่องหมายการค้า แบบอักษร หรือทรัพย์สินอื่นเกินกว่าที่ผู้โอนมีอำนาจโอน

7. การแก้ไข คืนเงิน และข้อพิพาท
การแก้ไขหรือโอนลิขสิทธิ์คืนต้องมีข้อตกลงใหม่ที่คู่สัญญาลงนาม การคืนเงินบางส่วนหรือเต็มจำนวนและการปิดสิทธิ์ดาวน์โหลดของแพลตฟอร์มไม่ทำให้ลิขสิทธิ์โอนกลับโดยอัตโนมัติ คู่สัญญาต้องตกลงผลของการเลิกสัญญาและสิทธิ์ที่เกิดขึ้นแล้วตามกฎหมาย หากมีข้อพิพาทให้ติดต่อกันโดยสุจริตก่อนใช้สิทธิตามกฎหมายไทย ทั้งนี้ไม่ตัดสิทธิ์ตามกฎหมายบังคับ

8. ต้นฉบับและการเก็บหลักฐาน
เอกสารและบันทึกการลงนามในระบบเป็นหลักฐานอิเล็กทรอนิกส์ คู่สัญญาดาวน์โหลดต้นฉบับได้และตรวจสอบผ่าน QR หลังเข้าสู่ระบบ เนื้อหานโยบายที่ยอมรับถูกเก็บเป็นฉบับเดียวกับสัญญา การแก้นโยบายภายหลังไม่เปลี่ยนสัญญาย้อนหลัง แพลตฟอร์มเป็นผู้จัดระบบหลักฐาน มิใช่คู่สัญญาผู้โอนหรือผู้รับโอน ไม่รับรองกรรมสิทธิ์แทนผู้โอน และเอกสารไม่ใช่การจดทะเบียนหรือรับรองลิขสิทธิ์โดยหน่วยงานรัฐ$terms$,'draft' where not exists(select 1 from public.platform_policy_versions where policy_type='standard-assignment');

notify pgrst,'reload schema';
