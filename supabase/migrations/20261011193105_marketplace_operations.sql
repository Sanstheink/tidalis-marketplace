-- Operations: actual recipient details, fee invoices, personal receipts and a
-- deliberate sales switch. No business identities, fees or payment keys seeded.
create sequence public.tidalis_fee_invoice_seq;
alter table public.platform_issuer_profile alter column tax_id drop not null;
alter table public.platform_billing_documents drop constraint platform_billing_documents_currency_check;
alter table public.platform_billing_documents add constraint platform_billing_documents_currency_check check(currency in ('THB','USD','LAK'));

create function private.save_platform_issuer(p_name text,p_address text,p_tax_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required'; end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 160 or length(trim(coalesce(p_address,''))) not between 15 and 1000
 or (nullif(p_tax_id,'') is not null and p_tax_id !~ '^[0-9]{13}$') then raise exception 'invalid_issuer'; end if;
 insert into public.platform_issuer_profile(id,legal_name,registered_address,tax_id,approved_by,approved_at)
 values(true,trim(p_name),trim(p_address),nullif(p_tax_id,''),auth.uid(),now())
 on conflict(id) do update set legal_name=excluded.legal_name,registered_address=excluded.registered_address,tax_id=excluded.tax_id,
 approved_by=auth.uid(),approved_at=now();
 insert into public.audit_logs(actor_id,action,target_table) values(auth.uid(),'platform_issuer_saved','platform_issuer_profile');
end $$;

-- Retain the existing tax-invoice path; ordinary receipts also support an
-- approved individual issuer and the actual shop billing identity.
alter function public.tidalis_issue_platform_document(uuid,text,text,bigint,bigint) set schema private;
alter function private.tidalis_issue_platform_document(uuid,text,text,bigint,bigint) rename to issue_legacy_platform_document;
revoke all on function private.issue_legacy_platform_document(uuid,text,text,bigint,bigint) from public,anon,authenticated;
create function private.issue_platform_document(p_payment_id uuid,p_kind text,p_recipient_tax_id text,p_net_minor bigint,p_vat_minor bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare pay public.platform_fee_payments%rowtype; inv public.seller_invoices%rowtype; issuer public.platform_issuer_profile%rowtype;
 recipient public.payment_profiles%rowtype; doc uuid; num text;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required'; end if;
 if p_kind='tax_invoice' then return private.issue_legacy_platform_document(p_payment_id,p_kind,p_recipient_tax_id,p_net_minor,p_vat_minor); end if;
 if p_kind is distinct from 'receipt' then raise exception 'invalid_document'; end if;
 select * into pay from public.platform_fee_payments where id=p_payment_id for update;
 if not found or pay.status<>'confirmed' or pay.confirmed_at is null or pay.confirmed_by is null then raise exception 'confirmed_payment_required'; end if;
 select id into doc from public.platform_billing_documents where payment_id=pay.id and document_type='receipt';
 if found then return doc; end if;
 select * into inv from public.seller_invoices where id=pay.invoice_id;
 if not found or inv.status<>'paid' or inv.total_minor<>pay.amount_minor then raise exception 'invoice_not_paid'; end if;
 select * into issuer from public.platform_issuer_profile where id;
 if not found or issuer.approved_at is null then raise exception 'issuer_required'; end if;
 select * into recipient from public.payment_profiles where shop_id=inv.shop_id;
 if not found or length(trim(coalesce(recipient.billing_address,'')))<15 then raise exception 'billing_identity_required'; end if;
 num:='TD-RC-'||to_char(now() at time zone 'Asia/Bangkok','YYYY')||'-'||lpad(nextval('public.tidalis_platform_receipt_seq')::text,7,'0');
 insert into public.platform_billing_documents(shop_id,invoice_id,payment_id,document_type,document_number,net_minor,vat_minor,total_minor,currency,issuer_snapshot,recipient_snapshot,issued_by)
 values(inv.shop_id,inv.id,pay.id,'receipt',num,pay.amount_minor,0,pay.amount_minor,inv.currency,
 jsonb_build_object('legal_name',issuer.legal_name,'address',issuer.registered_address,'tax_id',issuer.tax_id,'vat_registered',issuer.vat_registered,'branch_code',issuer.branch_code),
 jsonb_build_object('legal_name',recipient.recipient_name,'address',recipient.billing_address,'tax_id',null,'invoice_number',inv.invoice_number),auth.uid()) returning id into doc;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),inv.shop_id,'platform_document_issued','platform_billing_documents',doc);
 return doc;
end $$;
create function public.tidalis_issue_platform_document(p_payment_id uuid,p_kind text,p_recipient_tax_id text default null,p_net_minor bigint default null,p_vat_minor bigint default null)
returns uuid language sql security invoker set search_path='' as $$select private.issue_platform_document(p_payment_id,p_kind,p_recipient_tax_id,p_net_minor,p_vat_minor)$$;

create function private.save_fee_rule(p_shop_id uuid,p_rate integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required'; end if;
 if p_rate is null or p_rate not between 0 and 10000 then raise exception 'invalid_fee'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fee-rule:'||coalesce(p_shop_id::text,'platform')));
 update public.commission_fee_rules set effective_until=now() where shop_id is not distinct from p_shop_id and category is null and effective_until is null;
 insert into public.commission_fee_rules(shop_id,rate_basis_points,effective_from) values(p_shop_id,p_rate,now()) returning id into v_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),p_shop_id,'fee_rule_saved','commission_fee_rules',v_id,jsonb_build_object('rate_basis_points',p_rate));
 return v_id;
end $$;
create function private.issue_fee_invoice(p_shop_id uuid,p_currency text,p_from date,p_to date,p_due date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_total bigint;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required'; end if;
 if p_currency is null or p_currency not in ('THB','LAK','USD') or p_from is null or p_to is null or p_due is null or p_to<p_from or p_due<p_to then raise exception 'invalid_period'; end if;
 perform 1 from public.shops where id=p_shop_id for update;
 if not found then raise exception 'shop_unavailable'; end if;
 select coalesce(sum(c.fee_minor),0) into v_total from public.commission_entries c where c.shop_id=p_shop_id and c.currency=p_currency
 and (c.created_at at time zone 'Asia/Bangkok')::date between p_from and p_to and c.fee_minor>0
 and not exists(select 1 from public.seller_invoice_items x where x.commission_entry_id=c.id);
 if v_total<=0 then raise exception 'no_unbilled_fees'; end if;
 if v_total>999999999999 then raise exception 'invoice_limit_exceeded'; end if;
 insert into public.seller_invoices(shop_id,invoice_number,period_from,period_to,total_minor,currency,due_at,issued_at)
 values(p_shop_id,'TD-IN-'||to_char(now() at time zone 'Asia/Bangkok','YYYY')||'-'||lpad(nextval('public.tidalis_fee_invoice_seq')::text,7,'0'),p_from,p_to,v_total,p_currency,
 ((p_due+1)::timestamp at time zone 'Asia/Bangkok')-interval '1 second',now()) returning id into v_id;
 insert into public.seller_invoice_items(invoice_id,commission_entry_id) select v_id,c.id from public.commission_entries c where c.shop_id=p_shop_id and c.currency=p_currency
 and (c.created_at at time zone 'Asia/Bangkok')::date between p_from and p_to and c.fee_minor>0
 and not exists(select 1 from public.seller_invoice_items x where x.commission_entry_id=c.id);
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),p_shop_id,'fee_invoice_issued','seller_invoices',v_id);
 return v_id;
end $$;

create function private.cancel_payment_attempt(p_attempt_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;
begin
 select * into a from public.payment_attempts where id=p_attempt_id and payer_id=auth.uid();
 if not found then raise exception 'payment_unavailable'; end if;
 if a.order_id is not null then perform 1 from public.orders where id=a.order_id for update;
 else perform 1 from public.seller_invoices where id=a.invoice_id for update; end if;
 select * into a from public.payment_attempts where id=p_attempt_id for update;
 if a.status<>'pending' then raise exception 'payment_not_cancellable'; end if;
 update public.payment_attempts set status='expired' where id=a.id;
 update public.payment_transactions set status='expired' where id=a.id;
 update public.platform_fee_payments set status='expired' where id=a.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),a.shop_id,'payment_attempt_cancelled','payment_attempts',a.id);
end $$;
-- A rejected/abandoned manual payment must not prevent cancelling the reservation.
create or replace function private.cancel_fixed_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
 if auth.uid() is null then raise exception 'not_authorized'; end if;
 select * into o from public.orders where id=p_order_id and buyer_id=auth.uid() and idempotency_key is not null for update;
 if not found then raise exception 'order_unavailable'; end if;
 if o.status='cancelled' then return o.id; end if;
 if o.status<>'pending' or exists(select 1 from public.payment_transactions where order_id=o.id and status not in ('rejected','expired')) then raise exception 'order_not_cancellable'; end if;
 update public.orders set status='cancelled',cancelled_at=now(),cancellation_reason=case when reservation_expires_at<=now() then 'expired' else 'buyer_cancelled' end where id=o.id;
 update public.product_reservations set released_at=now() where order_id=o.id and released_at is null;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'fixed_order_cancelled','orders',o.id);
 return o.id;
end $$;

-- Uploaded bank QR is private and remains attached to the exact payer snapshot.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tidalis-payment-qr','tidalis-payment-qr',false,3145728,array['image/png','image/jpeg','image/webp']);
create function private.payment_qr_access(p_path text,p_write boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_profiles p where p_path ~ ('^profiles/'||p.id::text||'/[a-f0-9-]{36}\.(png|jpg|webp)$')
 and (case when p_write then (case when p.shop_id is null then public.is_platform_admin(auth.uid()) else public.is_shop_member(p.shop_id,auth.uid(),array['owner','finance']) end)
 else public.is_platform_admin(auth.uid()) or public.is_shop_member(p.shop_id,auth.uid(),array['owner','finance'])
 or exists(select 1 from public.payment_attempts a where a.payer_id=auth.uid() and a.recipient_snapshot->>'qrPath'=p_path) end))
$$;
create policy payment_qr_upload on storage.objects for insert to authenticated with check(bucket_id='tidalis-payment-qr' and private.payment_qr_access(name,true));
create policy payment_qr_read on storage.objects for select to authenticated using(bucket_id='tidalis-payment-qr' and private.payment_qr_access(name,false));
create policy payment_qr_cleanup on storage.objects for delete to authenticated using(
 bucket_id='tidalis-payment-qr' and private.payment_qr_access(name,true)
 and not exists(select 1 from public.payment_profiles p where p.qr_private_path=name or exists(select 1 from jsonb_each(p.bank_accounts) b where b.value->>'qrPath'=name))
 and not exists(select 1 from public.payment_attempts a where a.recipient_snapshot->>'qrPath'=name)
);
create function private.save_payment_qr(p_profile_id uuid,p_path text,p_currency text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.payment_profiles%rowtype;
begin
 select * into p from public.payment_profiles where id=p_profile_id for update;
 if not found or not (case when p.shop_id is null then public.is_platform_admin(auth.uid()) else public.is_shop_member(p.shop_id,auth.uid(),array['owner','finance']) end) then raise exception 'finance_mfa_required'; end if;
 if p_currency is null or p_currency not in ('THB','LAK','USD') or not (p.bank_accounts ? p_currency) then raise exception 'invalid_qr_currency'; end if;
 if p_path is not null and (not private.payment_qr_access(p_path,true) or not exists(select 1 from storage.objects where bucket_id='tidalis-payment-qr' and name=p_path)) then raise exception 'invalid_qr'; end if;
 update public.payment_profiles set qr_private_path=case when bank_currency=p_currency then p_path else qr_private_path end,bank_accounts=jsonb_set(bank_accounts,array[p_currency,'qrPath'],coalesce(to_jsonb(p_path),'null'::jsonb)),updated_by=auth.uid(),updated_at=now() where id=p.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),p.shop_id,'payment_qr_saved','payment_profiles',p.id);
end $$;

create function private.set_sales_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required'; end if;
 if p_enabled is null then raise exception 'invalid_setting'; end if;
 if p_enabled and not exists(select 1 from public.platform_policy_versions where status='published' and approved_by is not null and policy_type='payment-refund' and (effective_from is null or effective_from<=now())) then raise exception 'payment_policy_required'; end if;
 update public.marketplace_settings set fixed_orders_enabled=p_enabled,updated_by=auth.uid(),updated_at=now() where singleton;
 insert into public.audit_logs(actor_id,action,target_table,metadata) values(auth.uid(),'sales_switch_changed','marketplace_settings',jsonb_build_object('enabled',p_enabled));
end $$;

create function public.save_platform_issuer(p_name text,p_address text,p_tax_id text) returns void language sql security invoker set search_path='' as $$select private.save_platform_issuer(p_name,p_address,p_tax_id)$$;
create function public.save_fee_rule(p_shop_id uuid,p_rate integer) returns uuid language sql security invoker set search_path='' as $$select private.save_fee_rule(p_shop_id,p_rate)$$;
create function public.issue_fee_invoice(p_shop_id uuid,p_currency text,p_from date,p_to date,p_due date) returns uuid language sql security invoker set search_path='' as $$select private.issue_fee_invoice(p_shop_id,p_currency,p_from,p_to,p_due)$$;
create function public.cancel_payment_attempt(p_attempt_id uuid) returns void language sql security invoker set search_path='' as $$select private.cancel_payment_attempt(p_attempt_id)$$;
create function public.save_payment_qr(p_profile_id uuid,p_path text,p_currency text) returns void language sql security invoker set search_path='' as $$select private.save_payment_qr(p_profile_id,p_path,p_currency)$$;
create function public.set_sales_enabled(p_enabled boolean) returns void language sql security invoker set search_path='' as $$select private.set_sales_enabled(p_enabled)$$;
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in
 ('save_platform_issuer','save_fee_rule','issue_fee_invoice','cancel_payment_attempt','payment_qr_access','save_payment_qr','set_sales_enabled','issue_platform_document','tidalis_issue_platform_document') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.sig);
 execute format('grant execute on function %s to authenticated',fn.sig);
 end loop;
end $$;
notify pgrst,'reload schema';

create or replace function public.search_public_products(
  p_search text default '', p_type text default 'all', p_sort text default 'featured',
  p_page integer default 1, p_page_size integer default 24, p_shop_id uuid default null
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with params as (
    select '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
      left(btrim(coalesce(p_search,'')),80), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' as pattern,
      least(10000,greatest(1,coalesce(p_page,1))) as page,
      least(24,greatest(1,coalesce(p_page_size,24))) as page_size
  ), matching as materialized (
    select p.id,p.created_at,l.min_price,
      pg_catalog.jsonb_build_object(
        'id',p.id,'slug',p.slug,'name',p.name,'description',p.description,
        'currency',p.currency,'product_type',p.product_type,'pricing_mode',p.pricing_mode,
        'is_exclusive',p.is_exclusive,'stock',p.stock,'shop_id',p.shop_id,
        'shop',pg_catalog.jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'status',s.status),
        'work_type',pg_catalog.jsonb_build_object('name',wt.name),
        'product_license_prices',l.licenses
      ) as item
    from public.products p join public.shops s on s.id=p.shop_id
    left join public.shop_work_types wt on wt.id=p.work_type_id and wt.shop_id=p.shop_id
    cross join lateral (
      select min(lp.price_minor) as min_price,
        pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'usage_type',lp.usage_type,'price_minor',lp.price_minor,'terms',lp.terms
        ) order by lp.usage_type) as licenses
      from public.product_license_prices lp
      where lp.product_id=p.id and lp.usage_type in ('personal','commercial') and lp.price_minor>=0
    ) l cross join params
    where p.status='published' and s.status='active' and l.min_price is not null
      and (coalesce(p_type,'all')='all' or p.product_type=p_type)
      and (p_shop_id is null or p.shop_id=p_shop_id)
      and (p.name ilike params.pattern or s.name ilike params.pattern or wt.name ilike params.pattern)
  ), page_rows as (
    select item,row_number() over(order by
      case when p_sort in ('low','high') then item->>'currency' end asc,
      case when p_sort='low' then min_price end asc,
      case when p_sort='high' then min_price end desc,
      created_at desc,id desc) as position
    from matching order by
      case when p_sort in ('low','high') then item->>'currency' end asc,
      case when p_sort='low' then min_price end asc,
      case when p_sort='high' then min_price end desc,
      created_at desc,id desc
    limit (select page_size from params)
    offset (select (page-1)*page_size from params)
  )
  select pg_catalog.jsonb_build_object(
    'items',coalesce((select pg_catalog.jsonb_agg(item order by position) from page_rows),'[]'::jsonb),
    'total',(select count(*) from matching),'page',(select page from params),
    'pageSize',(select page_size from params)
  );
$$;

-- Currency updates use the same authorized, atomic draft workflow.
create function private.save_seller_product_priced_draft(p_shop_id uuid,p_product_id uuid,p_name text,p_slug text,p_description text,p_product_type text,p_work_type_id uuid,p_is_exclusive boolean,p_stock integer,p_personal_price_minor bigint,p_personal_terms text,p_commercial_price_minor bigint,p_commercial_terms text,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_currency is null or p_currency not in ('THB','LAK','USD') then raise exception 'invalid_currency'; end if;
 v_id:=public.save_seller_product_draft(p_shop_id,p_product_id,p_name,p_slug,p_description,p_product_type,p_work_type_id,p_is_exclusive,p_stock,p_personal_price_minor,p_personal_terms,p_commercial_price_minor,p_commercial_terms);
 update public.products set currency=p_currency where id=v_id and status='draft';
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),p_shop_id,'product_currency_saved','products',v_id,jsonb_build_object('currency',p_currency));
 return v_id;
end $$;
create function public.save_seller_product_priced_draft(p_shop_id uuid,p_product_id uuid,p_name text,p_slug text,p_description text,p_product_type text,p_work_type_id uuid,p_is_exclusive boolean,p_stock integer,p_personal_price_minor bigint,p_personal_terms text,p_commercial_price_minor bigint,p_commercial_terms text,p_currency text)
returns uuid language sql security invoker set search_path='' as $$select private.save_seller_product_priced_draft(p_shop_id,p_product_id,p_name,p_slug,p_description,p_product_type,p_work_type_id,p_is_exclusive,p_stock,p_personal_price_minor,p_personal_terms,p_commercial_price_minor,p_commercial_terms,p_currency)$$;
revoke all on function public.save_seller_product_priced_draft(uuid,uuid,text,text,text,text,uuid,boolean,integer,bigint,text,bigint,text,text),private.save_seller_product_priced_draft(uuid,uuid,text,text,text,text,uuid,boolean,integer,bigint,text,bigint,text,text) from public,anon;
grant execute on function public.save_seller_product_priced_draft(uuid,uuid,text,text,text,text,uuid,boolean,integer,bigint,text,bigint,text,text),private.save_seller_product_priced_draft(uuid,uuid,text,text,text,text,uuid,boolean,integer,bigint,text,bigint,text,text) to authenticated;
create function public.tidalis_lock_product_currency() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status<>'draft' and new.currency is distinct from old.currency then raise exception 'Reviewed product currency is immutable'; end if;
 return new;
end $$;
revoke all on function public.tidalis_lock_product_currency() from public,anon,authenticated;
create trigger tidalis_lock_currency before update on public.products for each row execute function public.tidalis_lock_product_currency();
notify pgrst,'reload schema';
