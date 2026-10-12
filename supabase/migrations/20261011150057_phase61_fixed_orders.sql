-- Phase 6.1: fixed-price orders, disabled by default. No payment or delivery.
-- Leases reserve stock without decrementing/restoring the seller's stock.
-- VAT shops remain gated until the payment/tax phase is implemented.
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to anon,authenticated;
alter table public.marketplace_settings add column fixed_orders_enabled boolean not null default false;
grant select(fixed_orders_enabled) on public.marketplace_settings to anon,authenticated;
alter table public.orders add column idempotency_key uuid, add column request_payload jsonb,
  add column reservation_expires_at timestamptz, add column cancelled_at timestamptz,
  add column cancellation_reason text, add column shop_snapshot jsonb;
create unique index orders_buyer_idempotency on public.orders(buyer_id,idempotency_key) where idempotency_key is not null;
create index orders_active_leases on public.orders(buyer_id,reservation_expires_at) where status='pending' and idempotency_key is not null;
revoke insert,update,delete on public.orders,public.order_items from anon,authenticated;
create table public.product_reservations (
  order_item_id uuid primary key references public.order_items(id),
  order_id uuid not null references public.orders(id), product_id uuid not null references public.products(id),
  quantity integer not null check(quantity between 1 and 20), expires_at timestamptz not null, released_at timestamptz
);
create index reservations_active_product on public.product_reservations(product_id,expires_at) include(quantity) where released_at is null;
create index reservations_order on public.product_reservations(order_id);
alter table public.product_reservations enable row level security;
revoke all on public.product_reservations from public,anon,authenticated;

create function private.fixed_checkout_context(p_shop_id uuid,p_product_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_shop public.shops%rowtype; v_policies jsonb; v_products jsonb;
  v_enabled boolean; v_eligible boolean; v_tax text; v_reason text;
begin
  if p_product_ids is null or cardinality(p_product_ids) not between 1 and 20 then raise exception 'invalid_items'; end if;
  select * into v_shop from public.shops where id=p_shop_id and status='active';
  if not found then return jsonb_build_object('enabled',false,'eligible',false,'reason','shop_unavailable','products','[]'::jsonb,'policies','[]'::jsonb); end if;
  select fixed_orders_enabled into v_enabled from public.marketplace_settings where singleton;
  select vat_status into v_tax from public.seller_tax_profiles where shop_id=p_shop_id;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.scope,q.policy_type),'[]'::jsonb) into v_policies from (
    (select distinct on (policy_type) id,policy_type,version,content,source_type,document_path,document_name,'shop'::text as scope
      from public.shop_policy_versions where shop_id=p_shop_id and status='published' and reviewed_by is not null
        and policy_type in ('refund','delivery','license') order by policy_type,version desc)
    union all
    (select distinct on (policy_type) id,policy_type,version,content,'text'::text,null::text,null::text,'platform'::text
      from public.platform_policy_versions where status='published' and approved_by is not null
        and (effective_from is null or effective_from<=now())
        and policy_type in ('terms','privacy','seller-agreement','payment-refund','copyright') order by policy_type,version desc)
  ) q;
  v_eligible:=jsonb_array_length(v_policies)=8 and coalesce(v_tax,'not_registered')='not_registered'
    and exists(select 1 from public.shop_readiness_requests where shop_id=p_shop_id and status='approved');
  v_reason:=case when not coalesce(v_enabled,false) then 'closed' when coalesce(v_tax,'not_registered')<>'not_registered' then 'tax_setup_pending'
    when not v_eligible then 'shop_setup_pending' else null end;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'name',p.name,'exclusive',p.is_exclusive,
    'available',case when p.stock is null then 20 else greatest(0,least(case when p.is_exclusive then 1 else 20 end,
      p.stock-coalesce((select sum(r.quantity) from public.product_reservations r where r.product_id=p.id and r.released_at is null and r.expires_at>now()),0))) end,
    'licenses',(select coalesce(jsonb_agg(jsonb_build_object('usageType',l.usage_type,'priceMinor',l.price_minor,'terms',l.terms) order by l.usage_type),'[]'::jsonb)
      from public.product_license_prices l where l.product_id=p.id)) order by p.id),'[]'::jsonb) into v_products
    from public.products p where p.shop_id=p_shop_id and p.id=any(p_product_ids) and p.status='published' and p.pricing_mode='fixed';
  return jsonb_build_object('enabled',coalesce(v_enabled,false),'eligible',v_eligible,'reason',v_reason,
    'shop',jsonb_build_object('id',v_shop.id,'name',v_shop.name,'slug',v_shop.slug),'products',v_products,'policies',v_policies,'reservationMinutes',30);
end;
$$;

create function private.create_fixed_order(p_shop_id uuid,p_items jsonb,p_note text,p_policy_ids uuid[],p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_existing public.orders%rowtype; v_product public.products%rowtype;
  v_price public.product_license_prices%rowtype; v_context jsonb; v_payload jsonb; v_items jsonb;
  v_line jsonb; v_id uuid; v_item_id uuid; v_total bigint:=0; v_qty integer;
  v_held bigint; v_available bigint; v_enabled boolean; v_now timestamptz; v_policy_ids uuid[];
begin
  if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then raise exception 'verified_email_required'; end if;
  if p_idempotency_key is null or p_shop_id is null or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) not between 1 and 20 or length(coalesce(p_note,''))>2000 or p_policy_ids is null or cardinality(p_policy_ids)<>8 then raise exception 'invalid_items'; end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_line)<>'object' or coalesce(v_line->>'productId','') !~ '^[0-9a-fA-F-]{36}$'
      or coalesce(v_line->>'license','') not in ('personal','commercial') or jsonb_typeof(v_line->'quantity') is distinct from 'number'
      or coalesce(v_line->>'quantity','') !~ '^[0-9]{1,2}$' or (v_line->>'quantity')::integer not between 1 and 20
      or jsonb_typeof(v_line->'expectedPriceMinor') is distinct from 'number' or coalesce(v_line->>'expectedPriceMinor','') !~ '^[0-9]{1,12}$'
      or jsonb_typeof(v_line->'expectedTerms') is distinct from 'string' then raise exception 'invalid_items'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_items) x group by (x->>'productId')::uuid,x->>'license' having count(*)>1) then raise exception 'duplicate_items'; end if;
  select jsonb_agg(jsonb_build_object('productId',(x->>'productId')::uuid,'license',x->>'license','quantity',(x->>'quantity')::integer,
    'expectedPriceMinor',(x->>'expectedPriceMinor')::bigint,'expectedTerms',x->>'expectedTerms') order by (x->>'productId')::uuid,x->>'license') into v_items from jsonb_array_elements(p_items) x;
  select array_agg(x order by x) into v_policy_ids from unnest(p_policy_ids) x;
  v_payload:=jsonb_build_object('shopId',p_shop_id,'items',v_items,'note',trim(coalesce(p_note,'')),'policyIds',v_policy_ids);
  -- Buyer lock serializes duplicate submissions and limits stock-hoarding.
  perform 1 from public.profiles where id=v_user for update;
  if not found then raise exception 'verified_email_required'; end if;
  select * into v_existing from public.orders where buyer_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_payload is distinct from v_payload then raise exception 'idempotency_conflict'; end if;
    return v_existing.id;
  end if;
  select fixed_orders_enabled into v_enabled from public.marketplace_settings where singleton for share;
  if v_enabled is distinct from true then raise exception 'orders_closed'; end if;
  perform 1 from public.shops where id=p_shop_id and status='active' for share;
  if not found then raise exception 'shop_unavailable'; end if;
  if exists(select 1 from public.shop_members where shop_id=p_shop_id and user_id=v_user) then raise exception 'own_shop_order'; end if;
  if (select count(*) from public.orders where buyer_id=v_user and status='pending' and reservation_expires_at>clock_timestamp())>=5 then raise exception 'active_order_limit'; end if;
  -- Products always lock in UUID order; the cart's ordering cannot cause deadlocks.
  perform p.id from public.products p where p.id in (select (x->>'productId')::uuid from jsonb_array_elements(v_items) x) order by p.id for update;
  perform 1 from public.product_license_prices l where l.product_id in (select (x->>'productId')::uuid from jsonb_array_elements(v_items) x) order by l.product_id,l.usage_type for share;
  perform 1 from public.shop_policy_versions where shop_id=p_shop_id and status='published' order by id for share;
  perform 1 from public.platform_policy_versions where status='published' order by id for share;
  perform 1 from public.shop_readiness_requests where shop_id=p_shop_id for share;
  perform 1 from public.seller_tax_profiles where shop_id=p_shop_id for share;
  v_context:=private.fixed_checkout_context(p_shop_id,array(select distinct (x->>'productId')::uuid from jsonb_array_elements(v_items) x));
  if (v_context->>'eligible')::boolean is distinct from true then raise exception 'shop_setup_pending'; end if;
  if (select array_agg((x->>'id')::uuid order by (x->>'id')::uuid) from jsonb_array_elements(v_context->'policies') x) is distinct from v_policy_ids then raise exception 'policies_changed'; end if;
  if exists(select 1 from jsonb_array_elements(v_context->'policies') x where x->>'source_type'='pdf'
    and not exists(select 1 from storage.objects o where o.bucket_id='tidalis-policy-documents' and o.name=x->>'document_path')) then raise exception 'shop_setup_pending'; end if;
  v_now:=clock_timestamp();
  for v_product in select p.* from public.products p where p.id in (select (x->>'productId')::uuid from jsonb_array_elements(v_items) x) order by p.id loop
    if v_product.shop_id<>p_shop_id or v_product.status<>'published' or v_product.pricing_mode<>'fixed'
      or v_product.reviewed_by is null or v_product.published_at is null
      or (v_product.product_type='ready_made' and v_product.stock is null)
      or (v_product.is_exclusive and v_product.stock<>1)
      or not exists(select 1 from public.product_files f join storage.objects o on o.bucket_id='tidalis-product-files' and o.name=f.file_path where f.product_id=v_product.id and f.is_delivery_file)
      or not exists(select 1 from public.product_files f join storage.objects o on o.bucket_id='tidalis-product-files' and o.name=f.file_path where f.product_id=v_product.id and not f.is_delivery_file and o.metadata->>'mimetype' in ('image/png','image/jpeg','image/webp')) then raise exception 'product_unavailable'; end if;
    select sum((x->>'quantity')::integer) into v_qty from jsonb_array_elements(v_items) x where (x->>'productId')::uuid=v_product.id;
    select coalesce(sum(quantity),0) into v_held from public.product_reservations where product_id=v_product.id and released_at is null and expires_at>v_now;
    v_available:=case when v_product.stock is null then 400 else v_product.stock-v_held end;
    if v_qty>20 or (v_product.is_exclusive and v_qty>1) or v_qty>v_available or (v_product.is_exclusive and v_held>0) then raise exception 'stock_unavailable'; end if;
  end loop;
  if (select count(distinct (x->>'productId')::uuid) from jsonb_array_elements(v_items) x) <>
    (select count(*) from public.products p where p.id in (select (x->>'productId')::uuid from jsonb_array_elements(v_items) x)) then raise exception 'product_unavailable'; end if;
  for v_line in select value from jsonb_array_elements(v_items) loop
    select * into v_price from public.product_license_prices where product_id=(v_line->>'productId')::uuid and usage_type=v_line->>'license';
    if not found then raise exception 'license_unavailable'; end if;
    if v_price.price_minor<>(v_line->>'expectedPriceMinor')::bigint or v_price.terms<>v_line->>'expectedTerms' then raise exception 'price_or_terms_changed'; end if;
    v_total:=v_total+v_price.price_minor*(v_line->>'quantity')::integer;
    if v_total>999999999999 then raise exception 'invalid_total'; end if;
  end loop;
  insert into public.orders(shop_id,buyer_id,status,subtotal_minor,vat_minor,total_minor,buyer_note,policy_snapshot,tax_snapshot,idempotency_key,request_payload,reservation_expires_at,shop_snapshot)
    values(p_shop_id,v_user,'pending',v_total,0,v_total,nullif(trim(coalesce(p_note,'')),''),v_context->'policies',jsonb_build_object('vat_status','not_registered','vat_charged',false),p_idempotency_key,v_payload,v_now+interval '30 minutes',v_context->'shop') returning id into v_id;
  for v_line in select value from jsonb_array_elements(v_items) loop
    select * into v_product from public.products where id=(v_line->>'productId')::uuid;
    select * into v_price from public.product_license_prices where product_id=v_product.id and usage_type=v_line->>'license';
    insert into public.order_items(order_id,product_id,quantity,usage_type,price_minor,item_snapshot)
      values(v_id,v_product.id,(v_line->>'quantity')::integer,v_price.usage_type,v_price.price_minor,jsonb_build_object('name',v_product.name,'slug',v_product.slug,'product_type',v_product.product_type,'exclusive',v_product.is_exclusive,'license_terms',v_price.terms)) returning id into v_item_id;
    insert into public.product_reservations(order_item_id,order_id,product_id,quantity,expires_at) values(v_item_id,v_id,v_product.id,(v_line->>'quantity')::integer,v_now+interval '30 minutes');
  end loop;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(v_user,p_shop_id,'fixed_order_created','orders',v_id,jsonb_build_object('total_minor',v_total));
  return v_id;
end;
$$;
create function private.cancel_fixed_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authorized'; end if;
  select * into v_order from public.orders where id=p_order_id and buyer_id=auth.uid() and idempotency_key is not null for update;
  if not found then raise exception 'order_unavailable'; end if;
  if v_order.status='cancelled' then return v_order.id; end if;
  if v_order.status<>'pending' or exists(select 1 from public.payment_transactions where order_id=v_order.id) then raise exception 'order_not_cancellable'; end if;
  update public.orders set status='cancelled',cancelled_at=clock_timestamp(),cancellation_reason=case when reservation_expires_at<=clock_timestamp() then 'expired' else 'buyer_cancelled' end where id=v_order.id;
  update public.product_reservations set released_at=clock_timestamp() where order_id=v_order.id and released_at is null;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),v_order.shop_id,'fixed_order_cancelled','orders',v_order.id);
  return v_order.id;
end;
$$;
-- Definers live outside exposed schemas. Public RPCs are invoker wrappers.
create function public.get_fixed_checkout(p_shop_id uuid,p_product_ids uuid[]) returns jsonb language sql stable security invoker set search_path='' as $$select private.fixed_checkout_context(p_shop_id,p_product_ids)$$;
create function public.create_fixed_order(p_shop_id uuid,p_items jsonb,p_note text,p_policy_ids uuid[],p_idempotency_key uuid) returns uuid language sql security invoker set search_path='' as $$select private.create_fixed_order(p_shop_id,p_items,p_note,p_policy_ids,p_idempotency_key)$$;
create function public.cancel_fixed_order(p_order_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.cancel_fixed_order(p_order_id)$$;
revoke all on function private.fixed_checkout_context(uuid,uuid[]),public.get_fixed_checkout(uuid,uuid[]) from public,anon,authenticated;
grant execute on function private.fixed_checkout_context(uuid,uuid[]),public.get_fixed_checkout(uuid,uuid[]) to anon,authenticated;
revoke all on function private.create_fixed_order(uuid,jsonb,text,uuid[],uuid),public.create_fixed_order(uuid,jsonb,text,uuid[],uuid),private.cancel_fixed_order(uuid),public.cancel_fixed_order(uuid) from public,anon,authenticated;
grant execute on function private.create_fixed_order(uuid,jsonb,text,uuid[],uuid),public.create_fixed_order(uuid,jsonb,text,uuid[],uuid),private.cancel_fixed_order(uuid),public.cancel_fixed_order(uuid) to authenticated;
-- Preserve access to the exact accepted PDF after archival or shop closure.
create policy order_policy_pdf_read on storage.objects for select to authenticated using (
  bucket_id='tidalis-policy-documents' and exists(select 1 from public.orders o
    cross join lateral jsonb_array_elements(case when jsonb_typeof(o.policy_snapshot)='array' then o.policy_snapshot else '[]'::jsonb end) p
    where o.buyer_id=(select auth.uid()) and p->>'scope'='shop' and p->>'source_type'='pdf' and p->>'document_path'=storage.objects.name)
);
notify pgrst,'reload schema';
