-- Phase 6: direct-payment Commission orders, private order delivery,
-- manual refunds with acknowledgement, fee credits, and ordinary shop receipts.
-- No gateway, bank transfer automation, business identity or live sales gate seeded.
alter table public.orders add column order_kind text not null default 'fixed' check(order_kind in ('fixed','commission'));
alter table public.orders add column commission_due_at timestamptz;
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check(status in ('pending','awaiting_quote','awaiting_acceptance','awaiting_payment','payment_review','paid','fulfilling','delivery_review','fulfilled','cancelled','refund_pending','partially_refunded','refunded'));
create table public.commission_quotes (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),version integer not null,
 brief_version integer not null,amount_minor bigint not null check(amount_minor between 0 and 999999999999),
 scope text not null check(length(trim(scope)) between 20 and 10000),license_terms text not null check(length(trim(license_terms)) between 10 and 2500),
 delivery_days integer not null check(delivery_days between 1 and 365),revisions integer not null check(revisions between 0 and 20),
 expires_at timestamptz not null,status text not null default 'offered' check(status in ('offered','accepted','superseded','declined')),
 offered_by uuid not null references auth.users(id),accepted_at timestamptz,created_at timestamptz not null default now(),unique(order_id,version)
);
create unique index commission_quote_one_offer on public.commission_quotes(order_id) where status='offered';
alter table public.orders add column accepted_quote_id uuid references public.commission_quotes(id);
create table public.commission_deliveries (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),version integer not null,
 status text not null default 'submitted' check(status in ('submitted','changes_requested','accepted')),
 seller_note text not null,buyer_note text,submitted_by uuid not null references auth.users(id),submitted_at timestamptz not null default now(),reviewed_at timestamptz,unique(order_id,version)
);
create table public.commission_delivery_files (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),delivery_id uuid references public.commission_deliveries(id),
 file_path text not null unique,filename text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index commission_delivery_file_order on public.commission_delivery_files(order_id,delivery_id);
create index commission_delivery_file_submission on public.commission_delivery_files(delivery_id);
create index commission_quote_author on public.commission_quotes(offered_by);
create index commission_delivery_author on public.commission_deliveries(submitted_by);
create index commission_file_author on public.commission_delivery_files(created_by);
create index orders_accepted_quote on public.orders(accepted_quote_id);
alter table public.commission_quotes enable row level security;
alter table public.commission_deliveries enable row level security;
alter table public.commission_delivery_files enable row level security;
revoke all on public.commission_quotes,public.commission_deliveries,public.commission_delivery_files from public,anon,authenticated;
grant select on public.commission_quotes,public.commission_deliveries,public.commission_delivery_files to authenticated;
grant all on public.commission_quotes,public.commission_deliveries,public.commission_delivery_files to service_role;
create policy commission_quotes_read on public.commission_quotes for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy commission_deliveries_read on public.commission_deliveries for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy commission_files_read on public.commission_delivery_files for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and
 (public.is_platform_admin((select auth.uid())) or public.is_shop_member(o.shop_id,(select auth.uid()),array['owner','manager','artist']) or
 (o.buyer_id=(select auth.uid()) and delivery_id is not null and o.status in ('fulfilling','delivery_review','fulfilled','partially_refunded')))));

create function private.commission_context(p_product uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.products%rowtype;c jsonb;
begin
 select * into p from public.products where id=p_product and status='published' and pricing_mode='quote' and product_type='commission' and reviewed_by is not null and exists(select 1 from public.shops s where s.id=shop_id and s.status='active');
 if not found then raise exception 'product_unavailable';end if;
 c:=private.fixed_checkout_context(p.shop_id,array[p.id]);
 return c||jsonb_build_object('product',jsonb_build_object('id',p.id,'name',p.name,'shopId',p.shop_id,'currency',p.currency,'licenses',
 (select jsonb_agg(jsonb_build_object('usageType',usage_type,'priceMinor',price_minor,'terms',terms)) from public.product_license_prices where product_id=p.id)));
end $$;
create function private.request_commission(p_product uuid,p_usage text,p_brief text,p_policies uuid[],p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype;c jsonb;v uuid;item uuid;terms text;existing public.orders%rowtype;payload jsonb;ids uuid[];
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'verified_email_required';end if;
 if p_key is null or p_usage is null or p_usage not in ('personal','commercial') or length(trim(coalesce(p_brief,''))) not between 30 and 10000 then raise exception 'invalid_brief';end if;
 payload:=jsonb_build_object('product',p_product,'usage',p_usage,'brief',trim(p_brief),'policies',p_policies);
 insert into public.profiles(id) values(auth.uid()) on conflict(id) do nothing;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into existing from public.orders where buyer_id=auth.uid() and idempotency_key=p_key;
 if found then if existing.request_payload is distinct from payload then raise exception 'idempotency_conflict';end if;return existing.id;end if;
 select * into p from public.products where id=p_product for share;c:=private.commission_context(p_product);
 if (c->>'enabled')::boolean is distinct from true then raise exception 'orders_closed';end if;
 if (c->>'eligible')::boolean is distinct from true then raise exception 'shop_setup_pending';end if;
 if exists(select 1 from public.shop_members where shop_id=p.shop_id and user_id=auth.uid()) then raise exception 'own_shop_order';end if;
 if (select count(*) from public.orders where buyer_id=auth.uid() and order_kind='commission' and status in ('awaiting_quote','awaiting_acceptance','awaiting_payment'))>=5 then raise exception 'active_order_limit';end if;
 select array_agg((x->>'id')::uuid order by (x->>'id')::uuid) into ids from jsonb_array_elements(c->'policies') x;
 if p_policies is null or cardinality(p_policies)<>8 or ids is distinct from (select array_agg(x order by x) from unnest(p_policies) x) then raise exception 'policies_changed';end if;
 if exists(select 1 from jsonb_array_elements(c->'policies') x where x->>'source_type'='pdf' and not exists(select 1 from storage.objects where bucket_id='tidalis-policy-documents' and name=x->>'document_path')) then raise exception 'shop_setup_pending';end if;
 select l.terms into terms from public.product_license_prices l where product_id=p.id and usage_type=p_usage;
 if not found then raise exception 'license_unavailable';end if;
 insert into public.orders(shop_id,buyer_id,status,subtotal_minor,total_minor,currency,buyer_note,policy_snapshot,tax_snapshot,idempotency_key,request_payload,shop_snapshot,order_kind)
 values(p.shop_id,auth.uid(),'awaiting_quote',0,0,p.currency,trim(p_brief),c->'policies',jsonb_build_object('vat_status','not_registered','vat_charged',false),p_key,payload,c->'shop','commission') returning id into v;
 insert into public.order_items(order_id,product_id,quantity,usage_type,price_minor,item_snapshot) values(v,p.id,1,p_usage,0,jsonb_build_object('name',p.name,'slug',p.slug,'product_type','commission','currency',p.currency,'license_terms',terms)) returning id into item;
 insert into public.commission_brief_versions(order_item_id,version,author_id,content) values(item,1,auth.uid(),trim(p_brief));
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),p.shop_id,'commission_requested','orders',v);return v;
end $$;
create function private.revise_commission_brief(p_order uuid,p_brief text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;i uuid;
begin
 select * into o from public.orders where id=p_order and buyer_id=auth.uid() for update;
 if not found or o.order_kind<>'commission' or o.status not in ('awaiting_quote','awaiting_acceptance') or length(trim(coalesce(p_brief,''))) not between 30 and 10000 then raise exception 'brief_locked';end if;
 select id into i from public.order_items where order_id=o.id;
 insert into public.commission_brief_versions(order_item_id,version,author_id,content) select i,coalesce(max(version),0)+1,auth.uid(),trim(p_brief) from public.commission_brief_versions where order_item_id=i;
 update public.commission_quotes set status='superseded' where order_id=o.id and status='offered';
 update public.orders set buyer_note=trim(p_brief),status='awaiting_quote' where id=o.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'commission_brief_revised','orders',o.id);
end $$;
create function private.offer_commission_quote(p_order uuid,p_amount bigint,p_scope text,p_terms text,p_days integer,p_revisions integer,p_valid_days integer) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;v uuid;brief integer;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or not public.is_shop_member(o.shop_id,auth.uid(),array['owner','manager','artist']) then raise exception 'seller_mfa_required';end if;
 if not exists(select 1 from public.shops where id=o.shop_id and status in ('active','paused')) then raise exception 'shop_unavailable';end if;
 if o.order_kind<>'commission' or o.status not in ('awaiting_quote','awaiting_acceptance') or p_valid_days is null or p_valid_days not between 1 and 30 then raise exception 'quote_locked';end if;
 select max(b.version) into brief from public.commission_brief_versions b join public.order_items i on i.id=b.order_item_id where i.order_id=o.id;
 update public.commission_quotes set status='superseded' where order_id=o.id and status='offered';
 insert into public.commission_quotes(order_id,version,brief_version,amount_minor,scope,license_terms,delivery_days,revisions,expires_at,offered_by)
 select o.id,coalesce(max(version),0)+1,brief,p_amount,trim(p_scope),trim(p_terms),p_days,p_revisions,now()+make_interval(days=>p_valid_days),auth.uid() from public.commission_quotes where order_id=o.id returning id into v;
 update public.orders set status='awaiting_acceptance' where id=o.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'commission_quote_offered','commission_quotes',v);return v;
end $$;
create function private.accept_commission_quote(p_quote uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.commission_quotes%rowtype;o public.orders%rowtype;
begin
 select * into q from public.commission_quotes where id=p_quote;
 if not found then raise exception 'quote_unavailable';end if;
 select * into o from public.orders where id=q.order_id and buyer_id=auth.uid() for update;
 if not found then raise exception 'order_unavailable';end if;
 select * into q from public.commission_quotes where id=p_quote for update;
 if o.accepted_quote_id=q.id and q.status='accepted' then return o.id;end if;
 if not exists(select 1 from public.shops where id=o.shop_id and status in ('active','paused')) then raise exception 'shop_unavailable';end if;
 if q.status<>'offered' or q.expires_at<=now() or o.status<>'awaiting_acceptance' then raise exception 'quote_expired';end if;
 if q.amount_minor>0 and cardinality(private.direct_payment_methods(o.shop_id,o.currency))=0 then raise exception 'payment_setup_pending';end if;
 update public.commission_quotes set status='accepted',accepted_at=now() where id=q.id;
 update public.orders set accepted_quote_id=q.id,subtotal_minor=q.amount_minor,total_minor=q.amount_minor,reservation_expires_at=now()+interval '24 hours',
 status=case when q.amount_minor=0 then 'fulfilling' else 'awaiting_payment' end,commission_due_at=case when q.amount_minor=0 then now()+make_interval(days=>q.delivery_days) end where id=o.id;
 update public.order_items set price_minor=q.amount_minor,item_snapshot=item_snapshot||jsonb_build_object('license_terms',q.license_terms,'quote_scope',q.scope,'quote_version',q.version,'delivery_days',q.delivery_days,'revisions',q.revisions) where order_id=o.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'commission_quote_accepted','orders',o.id);return o.id;
end $$;
create function private.cancel_commission(p_order uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.order_kind<>'commission' or not(o.buyer_id=auth.uid() or public.is_shop_member(o.shop_id,auth.uid(),array['owner','manager','artist'])) then raise exception 'order_unavailable';end if;
 if o.status='cancelled' then return;end if;
 if o.status not in ('awaiting_quote','awaiting_acceptance','awaiting_payment') or exists(select 1 from public.payment_attempts where order_id=o.id and status in ('proof_submitted','confirmed','needs_review')) or length(trim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'order_not_cancellable';end if;
 update public.payment_attempts set status='expired' where order_id=o.id and status='pending';
 update public.payment_transactions set status='expired' where order_id=o.id and status='pending';
 update public.commission_quotes set status='declined' where order_id=o.id and status='offered';
 update public.orders set status='cancelled',cancelled_at=now(),cancellation_reason=trim(p_reason) where id=o.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'commission_cancelled','orders',o.id);
end $$;
create or replace function private.payment_context(p_order_id uuid,p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_shop uuid; v_amount bigint; v_currency text; v_name text; v_profile public.payment_profiles%rowtype; v_bank jsonb; v_methods text[]:='{}';
begin
 if auth.uid() is null or (p_order_id is null)=(p_invoice_id is null) then raise exception 'payment_unavailable'; end if;
 if p_order_id is not null then
  select shop_id,total_minor,currency,shop_snapshot->>'name' into v_shop,v_amount,v_currency,v_name from public.orders
   where id=p_order_id and buyer_id=auth.uid() and status in ('pending','awaiting_payment','payment_review','paid','fulfilling','delivery_review','fulfilled');
  if not found then raise exception 'payment_unavailable'; end if;
 else
  select i.total_minor,i.currency,'Tidalis · ค่าบริการแพลตฟอร์ม' into v_amount,v_currency,v_name from public.seller_invoices i
   where i.id=p_invoice_id and i.status in ('issued','partial','overdue','paid') and public.is_shop_member(i.shop_id,auth.uid(),array['owner','finance']);
  if not found then raise exception 'finance_mfa_required'; end if;
 end if;
 v_methods:=private.direct_payment_methods(v_shop,v_currency);
 return jsonb_build_object('recipientLabel',v_name,'amountMinor',v_amount,'currency',v_currency,'methods',v_methods);
end $$;

create or replace function private.create_payment_attempt(p_order_id uuid,p_invoice_id uuid,p_method text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_order public.orders%rowtype; v_invoice public.seller_invoices%rowtype;
 v_profile public.payment_profiles%rowtype; v_bank jsonb; v_attempt public.payment_attempts%rowtype; v_shop uuid; v_expiry timestamptz;
begin
 if (p_order_id is null)=(p_invoice_id is null) then raise exception 'payment_unavailable'; end if;
 if p_order_id is not null then
  select * into v_order from public.orders where id=p_order_id and buyer_id=auth.uid() for update;
  if not found or v_order.status not in ('pending','awaiting_payment','payment_review') then raise exception 'order_not_payable'; end if;
  v_shop:=v_order.shop_id; v_expiry:=v_order.reservation_expires_at;
 else
  select * into v_invoice from public.seller_invoices where id=p_invoice_id for update;
  if not found or v_invoice.status not in ('issued','overdue') or not public.is_shop_member(v_invoice.shop_id,auth.uid(),array['owner','finance']) then raise exception 'invoice_not_payable'; end if;
  if exists(select 1 from public.platform_fee_payments where invoice_id=p_invoice_id and status='confirmed') then raise exception 'invoice_already_paid'; end if;
  v_expiry:=now()+interval '30 minutes';
 end if;
 select * into v_attempt from public.payment_attempts where order_id=p_order_id or invoice_id=p_invoice_id
  order by created_at desc limit 1 for update;
 if found and v_attempt.status='pending' and v_attempt.expires_at<=now() then
  update public.payment_attempts set status='expired' where id=v_attempt.id;
  update public.payment_transactions set status='expired' where id=v_attempt.id;
  update public.platform_fee_payments set status='expired' where id=v_attempt.id;
  v_attempt.status:='expired';
 end if;
 if found and v_attempt.status in ('pending','proof_submitted','confirmed','needs_review') then
  if v_attempt.method<>p_method then raise exception 'payment_already_started'; end if;
  return v_attempt.id;
 end if;
 if p_order_id is not null and not exists(select 1 from public.shops where id=v_shop and status in ('active','paused')) then raise exception 'shop_unavailable';end if;
 if v_expiry is null or v_expiry<=now() then raise exception 'reservation_expired'; end if;
 v_context:=private.payment_context(p_order_id,p_invoice_id);
 if not ((v_context->'methods') ? p_method) then raise exception 'method_unavailable'; end if;
 select * into v_profile from public.payment_profiles where shop_id is not distinct from v_shop for share;
 v_bank:=v_profile.bank_accounts->(v_context->>'currency');
 insert into public.payment_attempts(order_id,invoice_id,shop_id,payer_id,amount_minor,currency,method,expires_at,recipient_snapshot)
 values(p_order_id,p_invoice_id,v_shop,auth.uid(),(v_context->>'amountMinor')::bigint,v_context->>'currency',p_method,v_expiry,
 jsonb_build_object('label',v_context->>'recipientLabel','name',v_profile.recipient_name,'billingAddress',v_profile.billing_address,'bank',v_bank->>'bank',
 'account',case when p_method in ('bank_transfer','qr_code') then v_bank->>'account' end,
 'promptpay',case when p_method='promptpay' then v_profile.promptpay_id end,'qrPath',case when p_method='qr_code' then v_bank->>'qrPath' end)) returning * into v_attempt;
 if p_order_id is not null then
  insert into public.payment_transactions(id,order_id,shop_id,amount_minor,method,status) values(v_attempt.id,p_order_id,v_shop,v_attempt.amount_minor,
   case p_method when 'promptpay' then 'promptpay_static' when 'bank_transfer' then 'bank_transfer' when 'qr_code' then 'bank_qr' end,'pending');
 else
  insert into public.platform_fee_payments(id,invoice_id,amount_minor,status) values(v_attempt.id,p_invoice_id,v_attempt.amount_minor,'pending');
 end if;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),v_shop,'payment_started','payment_attempts',v_attempt.id,jsonb_build_object('method',p_method));
 return v_attempt.id;
end $$;

create or replace function private.review_manual_payment(p_attempt_id uuid,p_approve boolean,p_note text)
returns text language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;
begin
 select * into a from public.payment_attempts where id=p_attempt_id;
 if not found or a.method not in ('bank_transfer','promptpay','qr_code') or not (case when a.invoice_id is not null then public.is_platform_admin(auth.uid())
 else public.is_shop_member(a.shop_id,auth.uid(),array['owner','finance']) end) then raise exception 'finance_mfa_required'; end if;
 if p_approve is null then raise exception 'invalid_review'; end if;
 if a.status='confirmed' and p_approve then return a.status; end if;
 if a.status<>'proof_submitted' then raise exception 'proof_required'; end if;
 if p_approve then return private.finish_payment(a.id,auth.uid()); end if;
 if length(trim(coalesce(p_note,''))) not between 10 and 1000 then raise exception 'review_note_required'; end if;
 if a.order_id is not null then perform 1 from public.orders where id=a.order_id for update;
 else perform 1 from public.seller_invoices where id=a.invoice_id for update; end if;
 select * into a from public.payment_attempts where id=p_attempt_id for update;
 if a.status<>'proof_submitted' then raise exception 'payment_changed'; end if;
 update public.payment_attempts set status='rejected',review_note=trim(p_note) where id=a.id;
 if a.order_id is not null then
  update public.payment_transactions set status='rejected' where id=a.id;
  update public.orders set status=case when order_kind='commission' then 'awaiting_payment' else 'pending' end where id=a.order_id;
 else update public.platform_fee_payments set status='rejected' where id=a.id; end if;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),a.shop_id,'payment_rejected','payment_attempts',a.id,jsonb_build_object('reason',trim(p_note)));
 return 'rejected';
end $$;

alter table public.finance_ledger_entries add column currency text not null default 'THB' check(currency in ('THB','LAK','USD'));
create index ledger_shop_currency_date on public.finance_ledger_entries(shop_id,currency,created_at);
create unique index phase6_ledger_once on public.finance_ledger_entries(reference_type,reference_id,account) where reference_type in ('phase6_sale','phase6_refund','phase6_fee');
create function private.book_sale(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;begin
 select * into o from public.orders where id=p_order;
 if o.total_minor>0 then
 insert into public.finance_ledger_entries(shop_id,transaction_group,account,debit_minor,credit_minor,reference_type,reference_id,currency)
 values(o.shop_id,o.id,'cash',o.total_minor,0,'phase6_sale',o.id,o.currency),(o.shop_id,o.id,'sales',0,o.total_minor,'phase6_sale',o.id,o.currency) on conflict do nothing;end if;
end $$;
alter function private.finish_payment(uuid,uuid) rename to finish_fixed_payment;
create function private.finish_payment(p_attempt_id uuid,p_actor uuid) returns text language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;o public.orders%rowtype;q public.commission_quotes%rowtype;rule public.commission_fee_rules%rowtype;result text;inv public.seller_invoices%rowtype;
begin
 select * into a from public.payment_attempts where id=p_attempt_id;
 if not found then raise exception 'payment_unavailable';end if;
 if a.order_id is not null then select * into o from public.orders where id=a.order_id for update;end if;
 if a.order_id is null or o.order_kind='fixed' then
 result:=private.finish_fixed_payment(p_attempt_id,p_actor);
 if result='confirmed' and a.order_id is not null then perform private.book_sale(o.id);end if;
 if result='confirmed' and a.invoice_id is not null then
 select * into inv from public.seller_invoices where id=a.invoice_id;
 insert into public.finance_ledger_entries(shop_id,transaction_group,account,debit_minor,credit_minor,reference_type,reference_id,currency)
 values(inv.shop_id,a.id,'platform_fee',a.amount_minor,0,'phase6_fee',a.id,inv.currency),(inv.shop_id,a.id,'cash',0,a.amount_minor,'phase6_fee',a.id,inv.currency) on conflict do nothing;
 end if;
 if result='needs_review' then update public.payment_attempts set confirmed_by=p_actor,confirmed_at=coalesce(confirmed_at,now()) where id=a.id;end if;return result;
 end if;
 select * into a from public.payment_attempts where id=p_attempt_id for update;
 if a.status in ('confirmed','needs_review') then return a.status;end if;
 if a.status<>'proof_submitted' or a.amount_minor<>o.total_minor or a.currency<>o.currency then raise exception 'payment_changed';end if;
 select * into q from public.commission_quotes where id=o.accepted_quote_id and status='accepted';
 if not found or o.status not in ('awaiting_payment','payment_review') or not exists(select 1 from public.shops where id=o.shop_id and status in ('active','paused')) then
 update public.payment_attempts set status='needs_review',confirmed_by=p_actor,confirmed_at=now(),review_note='รับเงินแล้วแต่ขั้นตอนงานเปลี่ยนไป กรุณากระทบยอดก่อนส่งมอบ' where id=a.id;
 update public.payment_transactions set status='under_review' where id=a.id;return 'needs_review';end if;
 update public.orders set status='fulfilling',commission_due_at=now()+make_interval(days=>q.delivery_days) where id=o.id;
 update public.payment_attempts set status='confirmed',confirmed_by=p_actor,confirmed_at=now() where id=a.id;
 update public.payment_transactions set status='confirmed',confirmed_by=p_actor,confirmed_at=now() where id=a.id;
 select * into rule from public.commission_fee_rules where (shop_id=o.shop_id or shop_id is null) and category is null and effective_from<=o.created_at and (effective_until is null or effective_until>o.created_at) order by shop_id nulls last,effective_from desc,id limit 1;
 if found then insert into public.commission_entries(order_id,shop_id,fee_rule_id,rate_basis_points,fee_base_minor,fee_minor,currency)
 values(o.id,o.shop_id,rule.id,rule.rate_basis_points,o.subtotal_minor,(o.subtotal_minor*rule.rate_basis_points+5000)/10000,o.currency) on conflict(order_id) do nothing;end if;
 perform private.book_sale(o.id);
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,o.shop_id,'commission_payment_confirmed','orders',o.id);return 'confirmed';
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tidalis-order-deliveries','tidalis-order-deliveries',false,26214400,array['image/png','image/jpeg','image/webp','application/zip','application/pdf','application/octet-stream']);
create function private.commission_object_access(p_path text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o where p_path ~ ('^orders/'||o.id::text||'/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|zip|pdf|psd|clip|kra)$') and o.order_kind='commission' and
 (case when p_write then o.status='fulfilling' and public.is_shop_member(o.shop_id,auth.uid(),array['owner','manager','artist'])
 and not exists(select 1 from public.refund_requests where order_id=o.id and status in ('approved','processing'))
 else public.is_platform_admin(auth.uid()) or public.is_shop_member(o.shop_id,auth.uid(),array['owner','manager','artist']) or
 (o.buyer_id=auth.uid() and o.status in ('fulfilling','delivery_review','fulfilled','partially_refunded') and exists(select 1 from public.commission_delivery_files f where f.order_id=o.id and f.file_path=p_path and f.delivery_id is not null)) end));
$$;
create policy commission_object_insert on storage.objects for insert to authenticated with check(bucket_id='tidalis-order-deliveries' and private.commission_object_access(name,true));
create policy commission_object_read on storage.objects for select to authenticated using(bucket_id='tidalis-order-deliveries' and private.commission_object_access(name,false));
create policy commission_object_cleanup on storage.objects for delete to authenticated using(bucket_id='tidalis-order-deliveries' and private.commission_object_access(name,true) and not exists(select 1 from public.commission_delivery_files where file_path=name));
create function private.attach_commission_file(p_order uuid,p_path text,p_filename text) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;begin
 perform 1 from public.orders where id=p_order for update;
 if not private.commission_object_access(p_path,true) or p_path !~ ('^orders/'||p_order::text||'/') or length(coalesce(p_filename,'')) not between 1 and 160 then raise exception 'delivery_locked';end if;
 if (select count(*) from public.commission_delivery_files where order_id=p_order and delivery_id is null)>=3 then raise exception 'delivery_file_limit';end if;
 if not exists(select 1 from storage.objects where bucket_id='tidalis-order-deliveries' and name=p_path and (metadata->>'size')::bigint between 1 and 26214400 and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','application/zip','application/pdf','application/octet-stream')) then raise exception 'delivery_file_unavailable';end if;
 insert into public.commission_delivery_files(order_id,file_path,filename,created_by) values(p_order,p_path,p_filename,auth.uid()) returning id into v;return v;
end $$;
create function private.submit_commission_delivery(p_order uuid,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;v uuid;begin
 select * into o from public.orders where id=p_order for update;
 if not found or not public.is_shop_member(o.shop_id,auth.uid(),array['owner','manager','artist']) or o.order_kind<>'commission' or o.status<>'fulfilling' or length(trim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'delivery_locked';end if;
 if exists(select 1 from public.refund_requests where order_id=o.id and status in ('approved','processing')) then raise exception 'refund_in_progress';end if;
 if not exists(select 1 from public.commission_delivery_files f join storage.objects s on s.bucket_id='tidalis-order-deliveries' and s.name=f.file_path where f.order_id=o.id and f.delivery_id is null) then raise exception 'delivery_file_required';end if;
 insert into public.commission_deliveries(order_id,version,seller_note,submitted_by) select o.id,coalesce(max(version),0)+1,trim(p_note),auth.uid() from public.commission_deliveries where order_id=o.id returning id into v;
 update public.commission_delivery_files set delivery_id=v where order_id=o.id and delivery_id is null;
 update public.orders set status='delivery_review' where id=o.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'commission_delivery_submitted','commission_deliveries',v);return v;
end $$;
create function private.review_commission_delivery(p_delivery uuid,p_accept boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare d public.commission_deliveries%rowtype;o public.orders%rowtype;q public.commission_quotes%rowtype;begin
 select * into d from public.commission_deliveries where id=p_delivery;
 select * into o from public.orders where id=d.order_id and buyer_id=auth.uid() for update;
 if not found or o.order_kind<>'commission' then raise exception 'delivery_unavailable';end if;
 select * into d from public.commission_deliveries where id=p_delivery for update;
 if d.status='accepted' and p_accept then return;end if;
 if d.status<>'submitted' or o.status<>'delivery_review' or p_accept is null then raise exception 'delivery_locked';end if;
 if exists(select 1 from public.refund_requests where order_id=o.id and status in ('approved','processing')) then raise exception 'refund_in_progress';end if;
 if p_accept then
 update public.commission_deliveries set status='accepted',reviewed_at=now(),buyer_note=nullif(trim(p_note),'') where id=d.id;
 update public.orders set status='fulfilled' where id=o.id;
 insert into public.download_entitlements(buyer_id,order_item_id) select o.buyer_id,id from public.order_items where order_id=o.id on conflict(order_item_id) do nothing;
 else
 select * into q from public.commission_quotes where id=o.accepted_quote_id;
 if length(trim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'revision_note_required';end if;
 if (select count(*) from public.commission_deliveries where order_id=o.id and status='changes_requested')>=q.revisions then raise exception 'revision_limit';end if;
 update public.commission_deliveries set status='changes_requested',reviewed_at=now(),buyer_note=trim(p_note) where id=d.id;
 update public.orders set status='fulfilling' where id=o.id;
 end if;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,case when p_accept then 'commission_delivery_accepted' else 'commission_revision_requested' end,'commission_deliveries',d.id);
end $$;

create table public.order_messages(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),author_id uuid not null references auth.users(id),body text not null check(length(trim(body)) between 1 and 4000),created_at timestamptz not null default now());
create index order_message_order on public.order_messages(order_id,created_at);
create index order_message_author on public.order_messages(author_id);
alter table public.order_messages enable row level security;
revoke all on public.order_messages from public,anon,authenticated;
grant select on public.order_messages to authenticated;
grant all on public.order_messages to service_role;
create policy order_message_read on public.order_messages for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create function private.post_order_message(p_order uuid,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;v uuid;begin
 select * into o from public.orders where id=p_order;
 if not found or not(o.buyer_id=auth.uid() or public.is_shop_member(o.shop_id,auth.uid()) or public.is_platform_admin(auth.uid())) then raise exception 'order_unavailable';end if;
 insert into public.order_messages(order_id,author_id,body) values(o.id,auth.uid(),trim(p_body)) returning id into v;return v;
end $$;

alter table public.refund_requests add column currency text not null default 'THB' check(currency in ('THB','LAK','USD'));
alter table public.refund_requests add column recipient_snapshot jsonb;
alter table public.refund_requests add column review_note text;
alter table public.refund_requests add column reviewed_by uuid references auth.users(id);
alter table public.refund_requests add column reviewed_at timestamptz;
alter table public.refund_requests add column completed_at timestamptz;
alter table public.refund_requests add column prior_order_status text;
alter table public.refund_transactions add column proof_sha256 text check(proof_sha256 ~ '^[a-f0-9]{64}$');
create unique index refund_proof_once on public.refund_transactions(proof_sha256) where proof_sha256 is not null;
create unique index refund_one_open on public.refund_requests(order_id) where status in ('requested','under_review','approved','processing');
create index refund_request_reviewer on public.refund_requests(reviewed_by);
create index refund_tx_request on public.refund_transactions(refund_request_id);
create index refund_tx_actor on public.refund_transactions(recorded_by);
create function private.request_refund(p_order uuid,p_amount bigint,p_reason text,p_name text,p_bank text,p_account text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;r public.refund_requests%rowtype;paid bigint;done bigint;v uuid;begin
 select * into o from public.orders where id=p_order and buyer_id=auth.uid() for update;
 if not found then raise exception 'order_unavailable';end if;
 select coalesce(sum(amount_minor),0) into paid from public.payment_transactions where order_id=o.id and status='confirmed';
 select coalesce(sum(amount_minor),0) into done from public.refund_requests where order_id=o.id and status='completed';
 if p_amount is null or p_amount<=0 or p_amount>paid-done or length(trim(coalesce(p_reason,''))) not between 10 and 2000 or length(trim(coalesce(p_name,''))) not between 3 and 160 or length(trim(coalesce(p_bank,''))) not between 2 and 100 or coalesce(p_account,'') !~ '^[A-Za-z0-9 -]{6,40}$' then raise exception 'invalid_refund';end if;
 select * into r from public.refund_requests where order_id=o.id and status in ('requested','under_review','approved','processing');
 if found then if r.amount_minor=p_amount and r.reason=trim(p_reason) then return r.id;end if;raise exception 'refund_in_progress';end if;
 insert into public.refund_requests(order_id,shop_id,buyer_id,amount_minor,reason,currency,recipient_snapshot,prior_order_status)
 values(o.id,o.shop_id,o.buyer_id,p_amount,trim(p_reason),o.currency,jsonb_build_object('name',trim(p_name),'bank',trim(p_bank),'account',p_account,'currency',o.currency),o.status) returning id into v;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'refund_requested','refund_requests',v);return v;
end $$;
create function private.review_refund(p_refund uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.refund_requests%rowtype;begin
 select * into r from public.refund_requests where id=p_refund;perform 1 from public.orders where id=r.order_id for update;
 select * into r from public.refund_requests where id=p_refund for update;
 if not found or not(public.is_shop_member(r.shop_id,auth.uid(),array['owner','finance']) or public.is_platform_admin(auth.uid())) then raise exception 'finance_mfa_required';end if;
 if r.status not in ('requested','under_review') or p_approve is null or length(trim(coalesce(p_note,''))) not between 10 and 1000 then raise exception 'refund_locked';end if;
 update public.refund_requests set status=case when p_approve then 'approved' else 'rejected' end,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),r.shop_id,case when p_approve then 'refund_approved' else 'refund_rejected' end,'refund_requests',r.id);
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tidalis-refund-proofs','tidalis-refund-proofs',false,3145728,array['image/png','image/jpeg','image/webp','application/pdf']);
create function private.refund_proof_access(p_path text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.refund_requests r where p_path ~ ('^refunds/'||r.id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$') and
 (case when p_write then r.status='approved' and public.is_shop_member(r.shop_id,auth.uid(),array['owner','finance']) else r.buyer_id=auth.uid() or public.is_shop_member(r.shop_id,auth.uid(),array['owner','finance']) or public.is_platform_admin(auth.uid()) end));
$$;
create policy refund_proof_insert on storage.objects for insert to authenticated with check(bucket_id='tidalis-refund-proofs' and private.refund_proof_access(name,true));
create policy refund_proof_read on storage.objects for select to authenticated using(bucket_id='tidalis-refund-proofs' and private.refund_proof_access(name,false));
create policy refund_proof_cleanup on storage.objects for delete to authenticated using(bucket_id='tidalis-refund-proofs' and private.refund_proof_access(name,true) and not exists(select 1 from public.refund_transactions where proof_private_path=name));
create function private.record_refund_transfer(p_refund uuid,p_actor uuid,p_path text,p_sha text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.refund_requests%rowtype;v uuid;begin
 select * into r from public.refund_requests where id=p_refund;perform 1 from public.orders where id=r.order_id for update;
 select * into r from public.refund_requests where id=p_refund for update;
 if not found or r.status<>'approved' or not exists(select 1 from public.shop_members m join auth.users u on u.id=m.user_id where m.shop_id=r.shop_id and m.user_id=p_actor and m.role in ('owner','finance') and u.email_confirmed_at is not null and exists(select 1 from auth.mfa_factors f where f.user_id=p_actor and f.status='verified' and f.factor_type='totp')) then raise exception 'finance_mfa_required';end if;
 if p_path is null or p_sha is null or p_sha !~ '^[a-f0-9]{64}$' or p_path !~ ('^refunds/'||r.id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$') or not exists(select 1 from storage.objects where bucket_id='tidalis-refund-proofs' and name=p_path and (metadata->>'size')::bigint between 1 and 3145728 and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','application/pdf')) then raise exception 'invalid_proof';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tidalis-proof:'||p_sha,0));
 if exists(select 1 from public.payment_attempts where proof_sha256=p_sha) or exists(select 1 from public.platform_refund_transfers where proof_sha256=p_sha) then raise exception 'duplicate_proof';end if;
 insert into public.refund_transactions(refund_request_id,amount_minor,proof_private_path,proof_sha256,status,recorded_by) values(r.id,r.amount_minor,p_path,p_sha,'reported_sent',p_actor) returning id into v;
 update public.refund_requests set status='processing' where id=r.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,r.shop_id,'refund_transfer_reported','refund_transactions',v);return v;
end $$;
create function private.complete_refund(p_refund uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.refund_requests%rowtype;o public.orders%rowtype;c public.commission_entries%rowtype;total bigint;credit bigint;prior bigint;
begin
 select * into r from public.refund_requests where id=p_refund;select * into o from public.orders where id=r.order_id for update;
 select * into r from public.refund_requests where id=p_refund for update;
 if r.status='completed' then return;end if;
 if r.status<>'processing' or not exists(select 1 from public.refund_transactions where refund_request_id=r.id and status in ('reported_sent','disputed')) then raise exception 'refund_locked';end if;
 select coalesce(sum(amount_minor),0)+r.amount_minor into total from public.refund_requests where order_id=o.id and status='completed';
 if total>o.total_minor then raise exception 'refund_limit';end if;
 update public.refund_requests set status='completed',completed_at=now() where id=r.id;
 update public.refund_transactions set status='buyer_confirmed' where refund_request_id=r.id and status in ('reported_sent','disputed');
 if total=o.total_minor then
 update public.orders set status='refunded' where id=o.id;
 update public.download_entitlements set revoked_at=now() where order_item_id in(select id from public.order_items where order_id=o.id) and revoked_at is null;
 else update public.orders set status=case when o.status='refund_pending' then 'refund_pending' when o.order_kind='commission' and o.status in ('fulfilling','delivery_review') then o.status else 'partially_refunded' end where id=o.id;end if;
 select * into c from public.commission_entries where order_id=o.id for update;
 if found then
 select coalesce(sum(adjustment_minor),0) into prior from public.commission_adjustments where commission_entry_id=c.id;
 credit:=greatest(0,least(c.fee_minor,round(c.fee_minor::numeric*total/nullif(o.total_minor,0))::bigint)-prior);
 insert into public.commission_adjustments(commission_entry_id,refund_request_id,adjustment_minor) values(c.id,r.id,credit) on conflict(refund_request_id) do nothing;
 end if;
 insert into public.finance_ledger_entries(shop_id,transaction_group,account,debit_minor,credit_minor,reference_type,reference_id,currency)
 values(o.shop_id,r.id,'sales_returns',r.amount_minor,0,'phase6_refund',r.id,r.currency),(o.shop_id,r.id,'cash',0,r.amount_minor,'phase6_refund',r.id,r.currency) on conflict do nothing;
 perform private.issue_refund_record(r.id,p_actor);
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,o.shop_id,'refund_completed','refund_requests',r.id);
end $$;
create function private.acknowledge_refund(p_refund uuid,p_received boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.refund_requests%rowtype;begin
 select * into r from public.refund_requests where id=p_refund;perform 1 from public.orders where id=r.order_id for update;
 select * into r from public.refund_requests where id=p_refund and buyer_id=auth.uid() for update;
 if not found then raise exception 'refund_unavailable';end if;
 if r.status='completed' and p_received then return;end if;
 if r.status<>'processing' or p_received is null then raise exception 'refund_locked';end if;
 if p_received then perform private.complete_refund(r.id,auth.uid());else
 if length(trim(coalesce(p_note,''))) not between 10 and 1000 then raise exception 'review_note_required';end if;
 update public.refund_transactions set status='disputed' where refund_request_id=r.id and status='reported_sent';
 update public.refund_requests set review_note=trim(p_note) where id=r.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),r.shop_id,'refund_disputed','refund_requests',r.id);
 end if;
end $$;
create function private.resolve_refund_dispute(p_refund uuid,p_received boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.refund_requests%rowtype;begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 select * into r from public.refund_requests where id=p_refund;perform 1 from public.orders where id=r.order_id for update;
 select * into r from public.refund_requests where id=p_refund for update;
 if not found or r.status<>'processing' or not exists(select 1 from public.refund_transactions where refund_request_id=r.id and status='disputed') or p_received is null or length(trim(coalesce(p_note,''))) not between 15 and 1000 then raise exception 'dispute_unavailable';end if;
 if p_received then perform private.complete_refund(r.id,auth.uid());else
 update public.refund_transactions set status='failed' where refund_request_id=r.id and status='disputed';
 update public.refund_requests set status='approved' where id=r.id;end if;
 update public.refund_requests set review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),r.shop_id,'refund_dispute_resolved','refund_requests',r.id);
end $$;
create function private.reconcile_order_payment(p_attempt uuid,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;o public.orders%rowtype;begin
 select * into a from public.payment_attempts where id=p_attempt;select * into o from public.orders where id=a.order_id for update;
 select * into a from public.payment_attempts where id=p_attempt for update;
 if not found or a.order_id is null or not(public.is_shop_member(o.shop_id,auth.uid(),array['owner','finance']) or public.is_platform_admin(auth.uid())) then raise exception 'finance_mfa_required';end if;
 if a.amount_minor<>o.total_minor or a.currency<>o.currency then raise exception 'order_changed';end if;
 if a.status<>'needs_review' or length(trim(coalesce(p_note,''))) not between 15 and 1000 then raise exception 'payment_not_reviewable';end if;
 update public.payment_attempts set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now(),review_note=trim(p_note) where id=a.id;
 update public.payment_transactions set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now() where id=a.id;
 update public.orders set status='refund_pending' where id=o.id;perform private.book_sale(o.id);
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'payment_reconciled_for_refund','orders',o.id);return o.id;
end $$;

alter table public.seller_invoices add column gross_minor bigint;
alter table public.seller_invoices add column credited_minor bigint not null default 0 check(credited_minor>=0);
update public.seller_invoices set gross_minor=total_minor;
alter table public.seller_invoices alter column gross_minor set not null;
alter table public.seller_invoices alter column gross_minor set default 0;
create table public.fee_credit_applications(invoice_id uuid not null references public.seller_invoices(id),adjustment_id uuid not null references public.commission_adjustments(id),amount_minor bigint not null check(amount_minor>0),primary key(invoice_id,adjustment_id));
create index fee_credit_adjustment on public.fee_credit_applications(adjustment_id);
alter table public.fee_credit_applications enable row level security;
revoke all on public.fee_credit_applications from public,anon,authenticated;
grant select on public.fee_credit_applications to authenticated;
grant all on public.fee_credit_applications to service_role;
create policy fee_credit_read on public.fee_credit_applications for select to authenticated using(exists(select 1 from public.seller_invoices i where i.id=invoice_id));
create or replace function private.issue_fee_invoice(p_shop_id uuid,p_currency text,p_from date,p_to date,p_due date) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;gross bigint;remaining bigint;used bigint:=0;take bigint;x record;entry_ids uuid[];begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 if p_currency is null or p_currency not in ('THB','LAK','USD') or p_from is null or p_to is null or p_due is null or p_to<p_from or p_due<p_to then raise exception 'invalid_period';end if;
 perform 1 from public.shops where id=p_shop_id for update;if not found then raise exception 'shop_unavailable';end if;
 select array_agg(c.id order by c.id),coalesce(sum(c.fee_minor),0) into entry_ids,gross from public.commission_entries c where c.shop_id=p_shop_id and c.currency=p_currency and (c.created_at at time zone 'Asia/Bangkok')::date between p_from and p_to and c.fee_minor>0 and not exists(select 1 from public.seller_invoice_items where commission_entry_id=c.id);
 if gross<=0 then raise exception 'no_unbilled_fees';end if;if gross>999999999999 then raise exception 'invoice_limit_exceeded';end if;
 insert into public.seller_invoices(shop_id,invoice_number,period_from,period_to,total_minor,gross_minor,currency,due_at,issued_at)
 values(p_shop_id,'TD-IN-'||to_char(now() at time zone 'Asia/Bangkok','YYYY')||'-'||lpad(nextval('public.tidalis_fee_invoice_seq')::text,7,'0'),p_from,p_to,gross,gross,p_currency,((p_due+1)::timestamp at time zone 'Asia/Bangkok')-interval '1 second',now()) returning id into v;
 insert into public.seller_invoice_items(invoice_id,commission_entry_id) select v,unnest(entry_ids);
 remaining:=gross;
 for x in select a.id,a.adjustment_minor-coalesce((select sum(amount_minor) from public.fee_credit_applications where adjustment_id=a.id),0) available from public.commission_adjustments a join public.commission_entries c on c.id=a.commission_entry_id where c.shop_id=p_shop_id and c.currency=p_currency order by a.created_at,a.id loop
 take:=least(remaining,x.available);if take>0 then insert into public.fee_credit_applications values(v,x.id,take);used:=used+take;remaining:=remaining-take;end if;exit when remaining=0;end loop;
 update public.seller_invoices set total_minor=remaining,credited_minor=used,status=case when remaining=0 then 'paid' else 'issued' end where id=v;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),p_shop_id,'fee_invoice_issued','seller_invoices',v,jsonb_build_object('gross_minor',gross,'credited_minor',used));return v;
end $$;
create function private.fee_credit_balance(p_shop uuid,p_currency text) returns bigint language plpgsql stable security definer set search_path='' as $$
declare v bigint;begin
 if not(public.is_shop_member(p_shop,auth.uid(),array['owner','finance']) or public.is_platform_admin(auth.uid())) then raise exception 'finance_mfa_required';end if;
 select coalesce(sum(a.adjustment_minor-coalesce((select sum(amount_minor) from public.fee_credit_applications where adjustment_id=a.id),0)),0) into v from public.commission_adjustments a join public.commission_entries c on c.id=a.commission_entry_id where c.shop_id=p_shop and c.currency=p_currency;return v;
end $$;

create sequence public.tidalis_shop_receipt_seq;
alter table public.financial_documents add column void_reason text;
alter table public.financial_documents add column voided_at timestamptz;
create unique index shop_one_order_receipt on public.financial_documents(order_id) where document_type='receipt' and status='issued';
create function private.issue_shop_receipt(p_order uuid,p_name text,p_address text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;a public.payment_attempts%rowtype;p public.payment_profiles%rowtype;v uuid;num text;items jsonb;begin
 select * into o from public.orders where id=p_order for update;
 if not found or not public.is_shop_member(o.shop_id,auth.uid(),array['owner','finance']) then raise exception 'finance_mfa_required';end if;
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
 'recipient',jsonb_build_object('name',trim(p_name),'address',nullif(trim(p_address),''))),auth.uid(),now()) returning id into v;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'shop_receipt_issued','financial_documents',v);return v;
end $$;
create function private.void_shop_receipt(p_document uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare d public.financial_documents%rowtype;begin
 select * into d from public.financial_documents where id=p_document for update;
 if not found or d.document_type<>'receipt' or not public.is_shop_member(d.shop_id,auth.uid(),array['owner','finance']) or length(trim(coalesce(p_reason,''))) not between 15 and 1000 then raise exception 'document_unavailable';end if;
 if d.status='void' then return;end if;
 update public.financial_documents set status='void',void_reason=trim(p_reason),voided_at=now() where id=d.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),d.shop_id,'shop_receipt_voided','financial_documents',d.id);
end $$;
create function private.lock_shop_document() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Issued document is immutable';end if;
 if (to_jsonb(new)-array['status','void_reason','voided_at']) is distinct from (to_jsonb(old)-array['status','void_reason','voided_at']) or not(old.status='issued' and new.status='void' and length(trim(coalesce(new.void_reason,'')))>=15 and new.voided_at is not null) then raise exception 'Issued document is immutable';end if;return new;
end $$;
create trigger shop_document_immutable before update or delete on public.financial_documents for each row execute function private.lock_shop_document();

create function public.get_commission_context(p_product uuid) returns jsonb language sql security invoker set search_path='' as $$select private.commission_context(p_product)$$;
revoke all on function public.get_commission_context(uuid),private.commission_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_commission_context(uuid),private.commission_context(uuid) to anon,authenticated;
create function public.request_commission(p_product uuid,p_usage text,p_brief text,p_policies uuid[],p_key uuid) returns uuid language sql security invoker set search_path='' as $$select private.request_commission(p_product,p_usage,p_brief,p_policies,p_key)$$;
revoke all on function public.request_commission(uuid,text,text,uuid[],uuid),private.request_commission(uuid,text,text,uuid[],uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_commission(uuid,text,text,uuid[],uuid),private.request_commission(uuid,text,text,uuid[],uuid) to authenticated;
create function public.revise_commission_brief(p_order uuid,p_brief text) returns void language sql security invoker set search_path='' as $$select private.revise_commission_brief(p_order,p_brief)$$;
revoke all on function public.revise_commission_brief(uuid,text),private.revise_commission_brief(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.revise_commission_brief(uuid,text),private.revise_commission_brief(uuid,text) to authenticated;
create function public.offer_commission_quote(p_order uuid,p_amount bigint,p_scope text,p_terms text,p_days integer,p_revisions integer,p_valid_days integer) returns uuid language sql security invoker set search_path='' as $$select private.offer_commission_quote(p_order,p_amount,p_scope,p_terms,p_days,p_revisions,p_valid_days)$$;
revoke all on function public.offer_commission_quote(uuid,bigint,text,text,integer,integer,integer),private.offer_commission_quote(uuid,bigint,text,text,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.offer_commission_quote(uuid,bigint,text,text,integer,integer,integer),private.offer_commission_quote(uuid,bigint,text,text,integer,integer,integer) to authenticated;
create function public.accept_commission_quote(p_quote uuid) returns uuid language sql security invoker set search_path='' as $$select private.accept_commission_quote(p_quote)$$;
revoke all on function public.accept_commission_quote(uuid),private.accept_commission_quote(uuid) from public,anon,authenticated,service_role;
grant execute on function public.accept_commission_quote(uuid),private.accept_commission_quote(uuid) to authenticated;
create function public.cancel_commission(p_order uuid,p_reason text) returns void language sql security invoker set search_path='' as $$select private.cancel_commission(p_order,p_reason)$$;
revoke all on function public.cancel_commission(uuid,text),private.cancel_commission(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.cancel_commission(uuid,text),private.cancel_commission(uuid,text) to authenticated;
create function public.attach_commission_file(p_order uuid,p_path text,p_filename text) returns uuid language sql security invoker set search_path='' as $$select private.attach_commission_file(p_order,p_path,p_filename)$$;
revoke all on function public.attach_commission_file(uuid,text,text),private.attach_commission_file(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.attach_commission_file(uuid,text,text),private.attach_commission_file(uuid,text,text) to authenticated;
create function public.submit_commission_delivery(p_order uuid,p_note text) returns uuid language sql security invoker set search_path='' as $$select private.submit_commission_delivery(p_order,p_note)$$;
revoke all on function public.submit_commission_delivery(uuid,text),private.submit_commission_delivery(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_commission_delivery(uuid,text),private.submit_commission_delivery(uuid,text) to authenticated;
create function public.review_commission_delivery(p_delivery uuid,p_accept boolean,p_note text) returns void language sql security invoker set search_path='' as $$select private.review_commission_delivery(p_delivery,p_accept,p_note)$$;
revoke all on function public.review_commission_delivery(uuid,boolean,text),private.review_commission_delivery(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.review_commission_delivery(uuid,boolean,text),private.review_commission_delivery(uuid,boolean,text) to authenticated;
create function public.post_order_message(p_order uuid,p_body text) returns uuid language sql security invoker set search_path='' as $$select private.post_order_message(p_order,p_body)$$;
revoke all on function public.post_order_message(uuid,text),private.post_order_message(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.post_order_message(uuid,text),private.post_order_message(uuid,text) to authenticated;
create function public.request_refund(p_order uuid,p_amount bigint,p_reason text,p_name text,p_bank text,p_account text) returns uuid language sql security invoker set search_path='' as $$select private.request_refund(p_order,p_amount,p_reason,p_name,p_bank,p_account)$$;
revoke all on function public.request_refund(uuid,bigint,text,text,text,text),private.request_refund(uuid,bigint,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.request_refund(uuid,bigint,text,text,text,text),private.request_refund(uuid,bigint,text,text,text,text) to authenticated;
create function public.review_refund(p_refund uuid,p_approve boolean,p_note text) returns void language sql security invoker set search_path='' as $$select private.review_refund(p_refund,p_approve,p_note)$$;
revoke all on function public.review_refund(uuid,boolean,text),private.review_refund(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.review_refund(uuid,boolean,text),private.review_refund(uuid,boolean,text) to authenticated;
create function public.record_refund_transfer(p_refund uuid,p_actor uuid,p_path text,p_sha text) returns uuid language sql security invoker set search_path='' as $$select private.record_refund_transfer(p_refund,p_actor,p_path,p_sha)$$;
revoke all on function public.record_refund_transfer(uuid,uuid,text,text),private.record_refund_transfer(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_refund_transfer(uuid,uuid,text,text),private.record_refund_transfer(uuid,uuid,text,text) to service_role;
create function public.acknowledge_refund(p_refund uuid,p_received boolean,p_note text) returns void language sql security invoker set search_path='' as $$select private.acknowledge_refund(p_refund,p_received,p_note)$$;
revoke all on function public.acknowledge_refund(uuid,boolean,text),private.acknowledge_refund(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.acknowledge_refund(uuid,boolean,text),private.acknowledge_refund(uuid,boolean,text) to authenticated;
create function public.resolve_refund_dispute(p_refund uuid,p_received boolean,p_note text) returns void language sql security invoker set search_path='' as $$select private.resolve_refund_dispute(p_refund,p_received,p_note)$$;
revoke all on function public.resolve_refund_dispute(uuid,boolean,text),private.resolve_refund_dispute(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_refund_dispute(uuid,boolean,text),private.resolve_refund_dispute(uuid,boolean,text) to authenticated;
create function public.reconcile_order_payment(p_attempt uuid,p_note text) returns uuid language sql security invoker set search_path='' as $$select private.reconcile_order_payment(p_attempt,p_note)$$;
revoke all on function public.reconcile_order_payment(uuid,text),private.reconcile_order_payment(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_order_payment(uuid,text),private.reconcile_order_payment(uuid,text) to authenticated;
create function public.fee_credit_balance(p_shop uuid,p_currency text) returns bigint language sql security invoker set search_path='' as $$select private.fee_credit_balance(p_shop,p_currency)$$;
revoke all on function public.fee_credit_balance(uuid,text),private.fee_credit_balance(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.fee_credit_balance(uuid,text),private.fee_credit_balance(uuid,text) to authenticated;
create function public.issue_shop_receipt(p_order uuid,p_name text,p_address text) returns uuid language sql security invoker set search_path='' as $$select private.issue_shop_receipt(p_order,p_name,p_address)$$;
revoke all on function public.issue_shop_receipt(uuid,text,text),private.issue_shop_receipt(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.issue_shop_receipt(uuid,text,text),private.issue_shop_receipt(uuid,text,text) to authenticated;
create function public.void_shop_receipt(p_document uuid,p_reason text) returns void language sql security invoker set search_path='' as $$select private.void_shop_receipt(p_document,p_reason)$$;
revoke all on function public.void_shop_receipt(uuid,text),private.void_shop_receipt(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.void_shop_receipt(uuid,text),private.void_shop_receipt(uuid,text) to authenticated;
revoke all on function private.book_sale(uuid) from public,anon,authenticated,service_role;
revoke all on function private.finish_payment(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.finish_fixed_payment(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.complete_refund(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.lock_shop_document() from public,anon,authenticated,service_role;
revoke all on function private.commission_object_access(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.commission_object_access(text,boolean) to authenticated;
revoke all on function private.refund_proof_access(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.refund_proof_access(text,boolean) to authenticated;
notify pgrst,'reload schema';

create or replace function private.submit_payment_proof(p_attempt_id uuid,p_actor uuid,p_path text,p_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;
begin
 select * into a from public.payment_attempts where id=p_attempt_id;
 if a.order_id is not null then perform 1 from public.orders where id=a.order_id for update;
 else perform 1 from public.seller_invoices where id=a.invoice_id for update; end if;
 select * into a from public.payment_attempts where id=p_attempt_id for update;
 if p_actor is null or not found or a.payer_id is distinct from p_actor or a.method not in ('bank_transfer','promptpay','qr_code') then raise exception 'proof_unavailable'; end if;
 if a.status='proof_submitted' and a.proof_private_path=p_path and a.proof_sha256=p_sha256 then return; end if;
 if a.status not in ('pending','expired') then raise exception 'reservation_expired'; end if;
 if p_path is null or p_sha256 is null or p_path !~ ('^attempts/'||a.id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$') or p_sha256 !~ '^[a-f0-9]{64}$'
  or not exists(select 1 from storage.objects where bucket_id='tidalis-payment-proofs' and name=p_path
    and (metadata->>'size')::bigint between 1 and 3145728 and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','application/pdf')) then raise exception 'invalid_proof'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tidalis-proof:'||p_sha256,0));
 if exists(select 1 from public.refund_transactions where proof_sha256=p_sha256) or exists(select 1 from public.platform_refund_transfers where proof_sha256=p_sha256) then raise exception 'duplicate_proof';end if;
 if exists(select 1 from public.payment_attempts x where x.id<>a.id and (x.order_id=a.order_id or x.invoice_id=a.invoice_id) and x.status in ('pending','proof_submitted','confirmed','needs_review')) then raise exception 'payment_already_started';end if;
 if a.order_id is not null and (a.status='expired' or a.expires_at<=now()) then
 update public.payment_attempts set status='needs_review',proof_private_path=p_path,proof_sha256=p_sha256,review_note='หลักฐานหลังหมดเวลา ต้องตรวจยอดเงินจริงและเงื่อนไขคืนเงิน' where id=a.id;
 update public.payment_transactions set status='under_review',proof_private_path=p_path where id=a.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,a.shop_id,'late_payment_proof_submitted','payment_attempts',a.id);return;
 end if;
 update public.payment_attempts set status='proof_submitted',proof_private_path=p_path,proof_sha256=p_sha256,expires_at=now()+interval '24 hours' where id=a.id;
 if a.order_id is not null then
  update public.payment_transactions set status='proof_submitted',proof_private_path=p_path where id=a.id;
  update public.orders set status='payment_review',reservation_expires_at=now()+interval '24 hours' where id=a.order_id;
  update public.product_reservations set expires_at=now()+interval '24 hours' where order_id=a.order_id and released_at is null;
 else update public.platform_fee_payments set status='proof_submitted',proof_private_path=p_path where id=a.id; end if;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,a.shop_id,'payment_proof_submitted','payment_attempts',a.id);
end $$;
create or replace function private.payment_proof_access(p_path text,p_write boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_attempts a where p_path ~ ('^attempts/'||a.id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$')
 and (case when p_write then a.payer_id=auth.uid() and a.method in ('bank_transfer','promptpay','qr_code') and a.status in ('pending','expired') and not exists(select 1 from public.payment_attempts x where x.id<>a.id and (x.order_id=a.order_id or x.invoice_id=a.invoice_id) and x.status in ('pending','proof_submitted','confirmed','needs_review'))
 else a.payer_id=auth.uid() or public.is_platform_admin(auth.uid()) or public.is_shop_member(a.shop_id,auth.uid(),array['owner','finance'])
 or exists(select 1 from public.seller_invoices i where i.id=a.invoice_id and public.is_shop_member(i.shop_id,auth.uid(),array['owner','finance'])) end))
$$;
drop policy payment_proof_cleanup on storage.objects;
create policy payment_proof_cleanup on storage.objects for delete to authenticated using(bucket_id='tidalis-payment-proofs' and exists(select 1 from public.payment_attempts a where a.payer_id=(select auth.uid()) and name ~ ('^attempts/'||a.id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$')) and not exists(select 1 from public.payment_attempts where proof_private_path=name));
drop policy refund_proof_cleanup on storage.objects;
create policy refund_proof_cleanup on storage.objects for delete to authenticated using(bucket_id='tidalis-refund-proofs' and private.refund_proof_access(name,false) and exists(select 1 from public.refund_requests r where name ~ ('^refunds/'||r.id::text||'/') and (public.is_shop_member(r.shop_id,(select auth.uid()),array['owner','finance']) or public.is_platform_admin((select auth.uid())))) and not exists(select 1 from public.refund_transactions where proof_private_path=name));
drop policy commission_object_cleanup on storage.objects;
create policy commission_object_cleanup on storage.objects for delete to authenticated using(bucket_id='tidalis-order-deliveries' and private.commission_object_access(name,false) and not exists(select 1 from public.commission_delivery_files where file_path=name));

notify pgrst,'reload schema';

create function private.restore_order_payment(p_attempt uuid,p_note text) returns text language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;o public.orders%rowtype;result text;begin
 select * into a from public.payment_attempts where id=p_attempt;select * into o from public.orders where id=a.order_id for update;
 select * into a from public.payment_attempts where id=p_attempt for update;
 if not found or a.order_id is null or not(public.is_shop_member(o.shop_id,auth.uid(),array['owner','finance']) or public.is_platform_admin(auth.uid())) then raise exception 'finance_mfa_required';end if;
 if a.status<>'needs_review' or o.status not in ('pending','payment_review','awaiting_payment') or a.amount_minor<>o.total_minor or a.currency<>o.currency or length(trim(coalesce(p_note,''))) not between 15 and 1000 or a.proof_private_path is null then raise exception 'payment_not_reviewable';end if;
 update public.payment_attempts set status='proof_submitted',review_note=trim(p_note) where id=a.id;
 result:=private.finish_payment(a.id,auth.uid());
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),o.shop_id,'payment_reconciliation_fulfil','payment_attempts',a.id,jsonb_build_object('note',trim(p_note),'result',result));return result;
end $$;
create function public.restore_order_payment(p_attempt uuid,p_note text) returns text language sql security invoker set search_path='' as $$select private.restore_order_payment(p_attempt,p_note)$$;
revoke all on function public.restore_order_payment(uuid,text),private.restore_order_payment(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.restore_order_payment(uuid,text),private.restore_order_payment(uuid,text) to authenticated;
create function private.remove_commission_file(p_file uuid) returns text language plpgsql security definer set search_path='' as $$
declare f public.commission_delivery_files%rowtype;o public.orders%rowtype;begin
 select * into f from public.commission_delivery_files where id=p_file;select * into o from public.orders where id=f.order_id for update;
 select * into f from public.commission_delivery_files where id=p_file for update;
 if not found or not public.is_shop_member(o.shop_id,auth.uid(),array['owner','manager','artist']) or f.delivery_id is not null or o.status<>'fulfilling' then raise exception 'delivery_locked';end if;
 delete from public.commission_delivery_files where id=f.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'commission_staged_file_removed','commission_delivery_files',f.id);return f.file_path;
end $$;
create function public.remove_commission_file(p_file uuid) returns text language sql security invoker set search_path='' as $$select private.remove_commission_file(p_file)$$;
revoke all on function public.remove_commission_file(uuid),private.remove_commission_file(uuid) from public,anon,authenticated,service_role;
grant execute on function public.remove_commission_file(uuid),private.remove_commission_file(uuid) to authenticated;
notify pgrst,'reload schema';

create function private.issue_refund_record(p_refund uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.refund_requests%rowtype;a public.payment_attempts%rowtype;p public.payment_profiles%rowtype;begin
 select * into r from public.refund_requests where id=p_refund and status='completed';if not found then raise exception 'refund_locked';end if;
 if exists(select 1 from public.financial_documents where document_type='credit_note' and document_snapshot->>'refund_id'=r.id::text) then return;end if;
 select * into a from public.payment_attempts where order_id=r.order_id and status='confirmed';select * into p from public.payment_profiles where shop_id=r.shop_id;
 insert into public.financial_documents(shop_id,order_id,document_type,document_number,document_snapshot,issued_by,issued_at)
 values(r.shop_id,r.order_id,'credit_note','TD-RF-'||to_char(now() at time zone 'Asia/Bangkok','YYYY')||'-'||lpad(nextval('public.tidalis_shop_receipt_seq')::text,7,'0'),
 jsonb_build_object('refund_id',r.id,'currency',r.currency,'total_minor',r.amount_minor,'vat_minor',0,'payment_id',a.id,'issuer',jsonb_build_object('name',coalesce(a.recipient_snapshot->>'name',p.recipient_name),'address',coalesce(a.recipient_snapshot->>'billingAddress',p.billing_address)),
 'recipient',jsonb_build_object('name',r.recipient_snapshot->>'name','address',null),'items',jsonb_build_array(jsonb_build_object('name','คืนเงินตามคำขอ #'||left(r.id::text,8),'license','','quantity',1,'total_minor',r.amount_minor))),p_actor,now());
end $$;
revoke all on function private.issue_refund_record(uuid,uuid) from public,anon,authenticated,service_role;
create unique index refund_record_once on public.financial_documents((document_snapshot->>'refund_id')) where document_type='credit_note' and document_snapshot ? 'refund_id';
create function private.lock_phase6_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
 if tg_table_name='commission_delivery_files' then if old.delivery_id is null then return old;end if;end if;
 raise exception 'Recorded history is immutable';end if;
 if tg_table_name='commission_quotes' then
 if old.status='accepted' or (to_jsonb(new)-array['status','accepted_at']) is distinct from (to_jsonb(old)-array['status','accepted_at']) then raise exception 'Quote is immutable';end if;
 elsif tg_table_name='commission_deliveries' then
 if old.status<>'submitted' or (to_jsonb(new)-array['status','buyer_note','reviewed_at']) is distinct from (to_jsonb(old)-array['status','buyer_note','reviewed_at']) then raise exception 'Delivery history is immutable';end if;
 elsif tg_table_name='commission_delivery_files' then
 if old.delivery_id is not null or (to_jsonb(new)-'delivery_id') is distinct from (to_jsonb(old)-'delivery_id') or not exists(select 1 from public.commission_deliveries d where d.id=new.delivery_id and d.order_id=new.order_id) then raise exception 'Delivery file is immutable';end if;
 elsif tg_table_name='refund_requests' then
 if (to_jsonb(new)-array['status','review_note','reviewed_by','reviewed_at','completed_at']) is distinct from (to_jsonb(old)-array['status','review_note','reviewed_by','reviewed_at','completed_at']) then raise exception 'Refund amount and recipient are immutable';end if;
 elsif tg_table_name='refund_transactions' then
 if old.status='buyer_confirmed' or (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Refund proof is immutable';end if;
 end if;return new;
end $$;
revoke all on function private.lock_phase6_history() from public,anon,authenticated,service_role;
create trigger quote_immutable before update or delete on public.commission_quotes for each row execute function private.lock_phase6_history();
create trigger commission_delivery_immutable before update or delete on public.commission_deliveries for each row execute function private.lock_phase6_history();
create trigger commission_delivery_file_immutable before update or delete on public.commission_delivery_files for each row execute function private.lock_phase6_history();
update public.refund_requests r set currency=o.currency from public.orders o where o.id=r.order_id;
create trigger refund_request_immutable before update or delete on public.refund_requests for each row execute function private.lock_phase6_history();
create trigger refund_transfer_immutable before update or delete on public.refund_transactions for each row execute function private.lock_phase6_history();
notify pgrst,'reload schema';

create function private.extend_commission_payment(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.order_kind<>'commission' or o.status<>'awaiting_payment' or o.accepted_quote_id is null or o.reservation_expires_at>now() or not public.is_shop_member(o.shop_id,auth.uid(),array['owner','manager','artist']) then raise exception 'quote_locked';end if;
 if not exists(select 1 from public.shops where id=o.shop_id and status in ('active','paused')) then raise exception 'shop_unavailable';end if;
 if exists(select 1 from public.payment_attempts where order_id=o.id and (status in ('proof_submitted','confirmed','needs_review') or (status='pending' and expires_at>now()))) then raise exception 'payment_already_started';end if;
 update public.payment_attempts set status='expired' where order_id=o.id and status='pending';
 update public.payment_transactions set status='expired' where order_id=o.id and status='pending';
 update public.orders set reservation_expires_at=now()+interval '24 hours' where id=o.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),o.shop_id,'commission_payment_extended','orders',o.id);
end $$;
create function public.extend_commission_payment(p_order uuid) returns void language sql security invoker set search_path='' as $$select private.extend_commission_payment(p_order)$$;
revoke all on function public.extend_commission_payment(uuid),private.extend_commission_payment(uuid) from public,anon,authenticated,service_role;
grant execute on function public.extend_commission_payment(uuid),private.extend_commission_payment(uuid) to authenticated;
revoke all on sequence public.tidalis_shop_receipt_seq from public,anon,authenticated;
notify pgrst,'reload schema';

create function private.flag_payment_for_reconciliation(p_attempt uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 select * into a from public.payment_attempts where id=p_attempt;perform 1 from public.orders where id=a.order_id for update;
 select * into a from public.payment_attempts where id=p_attempt for update;
 if not found or a.order_id is null or a.status<>'proof_submitted' or a.proof_private_path is null or length(trim(coalesce(p_note,''))) not between 15 and 1000 then raise exception 'payment_not_reviewable';end if;
 update public.payment_attempts set status='needs_review',review_note=trim(p_note) where id=a.id;
 update public.payment_transactions set status='under_review' where id=a.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),a.shop_id,'payment_reconciliation_flagged','payment_attempts',a.id,jsonb_build_object('note',trim(p_note)));
end $$;
create function public.flag_payment_for_reconciliation(p_attempt uuid,p_note text) returns void language sql security invoker set search_path='' as $$select private.flag_payment_for_reconciliation(p_attempt,p_note)$$;
revoke all on function public.flag_payment_for_reconciliation(uuid,text),private.flag_payment_for_reconciliation(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.flag_payment_for_reconciliation(uuid,text),private.flag_payment_for_reconciliation(uuid,text) to authenticated;
notify pgrst,'reload schema';

create table public.platform_payment_refunds(
 attempt_id uuid primary key references public.payment_attempts(id),shop_id uuid not null references public.shops(id),
 amount_minor bigint not null check(amount_minor>0),currency text not null check(currency in ('THB','LAK','USD')),
 recipient_snapshot jsonb not null,status text not null default 'prepared' check(status in ('prepared','reported','confirmed')),
 prepared_by uuid not null references auth.users(id),proof_private_path text,proof_sha256 text unique check(proof_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_by uuid references auth.users(id),confirmed_by uuid references auth.users(id),prepared_at timestamptz not null default now(),recorded_at timestamptz,confirmed_at timestamptz
);
create index platform_refund_shop on public.platform_payment_refunds(shop_id);
create index platform_refund_preparer on public.platform_payment_refunds(prepared_by);
create index platform_refund_recorder on public.platform_payment_refunds(recorded_by);
create index platform_refund_confirmer on public.platform_payment_refunds(confirmed_by);
alter table public.platform_payment_refunds enable row level security;
revoke all on public.platform_payment_refunds from public,anon,authenticated;
grant select on public.platform_payment_refunds to authenticated;
grant all on public.platform_payment_refunds to service_role;
create policy platform_refund_read on public.platform_payment_refunds for select to authenticated using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','finance']));
create function private.prepare_platform_refund(p_attempt uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;i public.seller_invoices%rowtype;p public.payment_profiles%rowtype;b jsonb;snap jsonb;begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 select * into a from public.payment_attempts where id=p_attempt;select * into i from public.seller_invoices where id=a.invoice_id for update;
 select * into a from public.payment_attempts where id=p_attempt for update;
 if not found or a.invoice_id is null or a.status<>'needs_review' then raise exception 'payment_not_reviewable';end if;
 if exists(select 1 from public.platform_payment_refunds where attempt_id=a.id) then return;end if;
 select * into p from public.payment_profiles where shop_id=i.shop_id for share;b:=p.bank_accounts->a.currency;
 if b->>'account' ~ '^[A-Za-z0-9 -]{6,40}$' and length(trim(coalesce(b->>'bank','')))>=2 then snap:=jsonb_build_object('name',p.recipient_name,'bank',b->>'bank','account',b->>'account');
 elsif a.currency='THB' and p.promptpay_enabled then snap:=jsonb_build_object('name',p.recipient_name,'bank','พร้อมเพย์','account',p.promptpay_id);
 else raise exception 'payment_setup_pending';end if;
 insert into public.platform_payment_refunds(attempt_id,shop_id,amount_minor,currency,recipient_snapshot,prepared_by) values(a.id,i.shop_id,a.amount_minor,a.currency,snap,auth.uid());
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),i.shop_id,'platform_refund_prepared','platform_payment_refunds',a.id);
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tidalis-platform-refund-proofs','tidalis-platform-refund-proofs',false,3145728,array['image/png','image/jpeg','image/webp','application/pdf']);
create function private.platform_refund_proof_access(p_path text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_payment_refunds r where p_path ~ ('^refunds/'||r.attempt_id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$') and
 (case when p_write then r.status='prepared' and public.is_platform_admin(auth.uid()) else public.is_platform_admin(auth.uid()) or public.is_shop_member(r.shop_id,auth.uid(),array['owner','finance']) end));
$$;
create policy platform_refund_proof_insert on storage.objects for insert to authenticated with check(bucket_id='tidalis-platform-refund-proofs' and private.platform_refund_proof_access(name,true));
create policy platform_refund_proof_read on storage.objects for select to authenticated using(bucket_id='tidalis-platform-refund-proofs' and private.platform_refund_proof_access(name,false));
create policy platform_refund_proof_cleanup on storage.objects for delete to authenticated using(bucket_id='tidalis-platform-refund-proofs' and private.platform_refund_proof_access(name,false) and public.is_platform_admin((select auth.uid())) and not exists(select 1 from public.platform_payment_refunds where proof_private_path=name));
create function private.report_platform_refund(p_attempt uuid,p_actor uuid,p_path text,p_sha text) returns void language plpgsql security definer set search_path='' as $$
declare r public.platform_payment_refunds%rowtype;begin
 select * into r from public.platform_payment_refunds where attempt_id=p_attempt for update;
 if not found or r.status<>'prepared' or not exists(select 1 from public.platform_roles pr join auth.users u on u.id=pr.user_id where pr.user_id=p_actor and pr.role='admin' and u.email_confirmed_at is not null and exists(select 1 from auth.mfa_factors f where f.user_id=p_actor and f.status='verified' and f.factor_type='totp')) then raise exception 'admin_mfa_required';end if;
 if p_path is null or p_sha is null or p_sha !~ '^[a-f0-9]{64}$' or p_path !~ ('^refunds/'||r.attempt_id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$') or not exists(select 1 from storage.objects where bucket_id='tidalis-platform-refund-proofs' and name=p_path and (metadata->>'size')::bigint between 1 and 3145728 and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','application/pdf')) then raise exception 'invalid_proof';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tidalis-proof:'||p_sha,0));
 if exists(select 1 from public.payment_attempts where proof_sha256=p_sha) or exists(select 1 from public.refund_transactions where proof_sha256=p_sha) then raise exception 'duplicate_proof';end if;
 update public.platform_payment_refunds set status='reported',proof_private_path=p_path,proof_sha256=p_sha,recorded_by=p_actor,recorded_at=now() where attempt_id=r.attempt_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,r.shop_id,'platform_refund_reported','platform_payment_refunds',r.attempt_id);
end $$;
create function private.acknowledge_platform_refund(p_attempt uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.platform_payment_refunds%rowtype;begin
 perform 1 from public.payment_attempts where id=p_attempt for update;
 select * into r from public.platform_payment_refunds where attempt_id=p_attempt for update;
 if not found or not public.is_shop_member(r.shop_id,auth.uid(),array['owner','finance']) then raise exception 'finance_mfa_required';end if;
 if r.status='confirmed' then return;end if;if r.status<>'reported' then raise exception 'refund_locked';end if;
 update public.platform_payment_refunds set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now() where attempt_id=r.attempt_id;
 update public.payment_attempts set status='rejected',review_note='คืนเงินค่าธรรมเนียมแล้ว ผู้ขายยืนยันรับเงินจริง' where id=r.attempt_id;
 update public.platform_fee_payments set status='refunded' where id=r.attempt_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),r.shop_id,'platform_refund_confirmed','platform_payment_refunds',r.attempt_id);
end $$;
create function public.prepare_platform_refund(p_attempt uuid) returns void language sql security invoker set search_path='' as $$select private.prepare_platform_refund(p_attempt)$$;
create function public.report_platform_refund(p_attempt uuid,p_actor uuid,p_path text,p_sha text) returns void language sql security invoker set search_path='' as $$select private.report_platform_refund(p_attempt,p_actor,p_path,p_sha)$$;
create function public.acknowledge_platform_refund(p_attempt uuid) returns void language sql security invoker set search_path='' as $$select private.acknowledge_platform_refund(p_attempt)$$;
revoke all on function private.prepare_platform_refund(uuid),public.prepare_platform_refund(uuid),private.acknowledge_platform_refund(uuid),public.acknowledge_platform_refund(uuid),private.platform_refund_proof_access(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.prepare_platform_refund(uuid),public.prepare_platform_refund(uuid),private.acknowledge_platform_refund(uuid),public.acknowledge_platform_refund(uuid),private.platform_refund_proof_access(text,boolean) to authenticated;
revoke all on function private.report_platform_refund(uuid,uuid,text,text),public.report_platform_refund(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.report_platform_refund(uuid,uuid,text,text),public.report_platform_refund(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';

-- Preserve every reported platform return, including failed/disputed retries.
alter table public.platform_payment_refunds drop constraint platform_payment_refunds_status_check;
alter table public.platform_payment_refunds add constraint platform_refund_status check(status in ('prepared','reported','disputed','confirmed'));
alter table public.platform_payment_refunds add column resolution_note text;
create table public.platform_refund_transfers(
 id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.platform_payment_refunds(attempt_id),
 amount_minor bigint not null check(amount_minor>0),currency text not null check(currency in ('THB','LAK','USD')),recipient_snapshot jsonb not null,
 proof_private_path text not null unique,proof_sha256 text not null unique check(proof_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'reported' check(status in ('reported','disputed','confirmed','failed')),
 recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now()
);
create index platform_refund_transfer_attempt on public.platform_refund_transfers(attempt_id,recorded_at);
create index platform_refund_transfer_actor on public.platform_refund_transfers(recorded_by);
alter table public.platform_refund_transfers enable row level security;
revoke all on public.platform_refund_transfers from public,anon,authenticated;
grant select on public.platform_refund_transfers to authenticated;
grant all on public.platform_refund_transfers to service_role;
create policy platform_refund_transfer_read on public.platform_refund_transfers for select to authenticated using(exists(select 1 from public.platform_payment_refunds r where r.attempt_id=public.platform_refund_transfers.attempt_id));
insert into public.platform_refund_transfers(attempt_id,amount_minor,currency,recipient_snapshot,proof_private_path,proof_sha256,status,recorded_by,recorded_at)
 select attempt_id,amount_minor,currency,recipient_snapshot,proof_private_path,proof_sha256,case when status='confirmed' then 'confirmed' else 'reported' end,recorded_by,recorded_at from public.platform_payment_refunds where proof_private_path is not null and proof_sha256 is not null and recorded_by is not null and recorded_at is not null;
create or replace function private.report_platform_refund(p_attempt uuid,p_actor uuid,p_path text,p_sha text) returns void language plpgsql security definer set search_path='' as $$
declare r public.platform_payment_refunds%rowtype;
begin
 select * into r from public.platform_payment_refunds where attempt_id=p_attempt for update;
 if not found or not exists(select 1 from public.platform_roles pr join auth.users u on u.id=pr.user_id where pr.user_id=p_actor and pr.role='admin' and u.email_confirmed_at is not null and exists(select 1 from auth.mfa_factors f where f.user_id=p_actor and f.status='verified' and f.factor_type='totp')) then raise exception 'admin_mfa_required';end if;
 if r.status='reported' and r.proof_private_path=p_path and r.proof_sha256=p_sha then return;end if;
 if r.status<>'prepared' then raise exception 'refund_locked';end if;
 if p_path is null or p_sha is null or p_sha !~ '^[a-f0-9]{64}$' or p_path !~ ('^refunds/'||r.attempt_id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$') or not exists(select 1 from storage.objects where bucket_id='tidalis-platform-refund-proofs' and name=p_path and (metadata->>'size')::bigint between 1 and 3145728 and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','application/pdf')) then raise exception 'invalid_proof';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tidalis-proof:'||p_sha,0));
 if exists(select 1 from public.payment_attempts where proof_sha256=p_sha) or exists(select 1 from public.refund_transactions where proof_sha256=p_sha) then raise exception 'duplicate_proof';end if;
 insert into public.platform_refund_transfers(attempt_id,amount_minor,currency,recipient_snapshot,proof_private_path,proof_sha256,recorded_by) values(r.attempt_id,r.amount_minor,r.currency,r.recipient_snapshot,p_path,p_sha,p_actor);
 update public.platform_payment_refunds set status='reported',proof_private_path=p_path,proof_sha256=p_sha,recorded_by=p_actor,recorded_at=now(),resolution_note=null where attempt_id=r.attempt_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,r.shop_id,'platform_refund_reported','platform_payment_refunds',r.attempt_id);
end $$;
create function private.complete_platform_refund(p_attempt uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.platform_payment_refunds%rowtype;
begin
 select * into r from public.platform_payment_refunds where attempt_id=p_attempt for update;
 if not found then raise exception 'refund_unavailable';end if;
 if r.status='confirmed' then return;end if;
 if r.status not in ('reported','disputed') then raise exception 'refund_locked';end if;
 update public.platform_refund_transfers set status='confirmed' where attempt_id=r.attempt_id and status in ('reported','disputed');
 update public.platform_payment_refunds set status='confirmed',confirmed_by=p_actor,confirmed_at=now() where attempt_id=r.attempt_id;
 update public.payment_attempts set status='rejected',review_note='คืนเงินค่าธรรมเนียมแล้ว ยืนยันว่าเงินถึงผู้ขาย' where id=r.attempt_id;
 update public.platform_fee_payments set status='refunded' where id=r.attempt_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,r.shop_id,'platform_refund_confirmed','platform_payment_refunds',r.attempt_id);
end $$;
revoke all on function private.complete_platform_refund(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function private.acknowledge_platform_refund(p_attempt uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.platform_payment_refunds%rowtype;
begin
 perform 1 from public.payment_attempts where id=p_attempt for update;
 select * into r from public.platform_payment_refunds where attempt_id=p_attempt for update;
 if not found or not public.is_shop_member(r.shop_id,auth.uid(),array['owner','finance']) then raise exception 'finance_mfa_required';end if;
 perform private.complete_platform_refund(r.attempt_id,auth.uid());
end $$;
create function private.dispute_platform_refund(p_attempt uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.platform_payment_refunds%rowtype;
begin
 select * into r from public.platform_payment_refunds where attempt_id=p_attempt for update;
 if not found or not public.is_shop_member(r.shop_id,auth.uid(),array['owner','finance']) then raise exception 'finance_mfa_required';end if;
 if r.status<>'reported' or length(trim(coalesce(p_note,''))) not between 10 and 1000 then raise exception 'refund_locked';end if;
 update public.platform_refund_transfers set status='disputed' where attempt_id=r.attempt_id and status='reported';
 update public.platform_payment_refunds set status='disputed',resolution_note=trim(p_note) where attempt_id=r.attempt_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),r.shop_id,'platform_refund_disputed','platform_payment_refunds',r.attempt_id,jsonb_build_object('note',trim(p_note)));
end $$;
create function private.resolve_platform_refund(p_attempt uuid,p_received boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.platform_payment_refunds%rowtype;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 perform 1 from public.payment_attempts where id=p_attempt for update;
 select * into r from public.platform_payment_refunds where attempt_id=p_attempt for update;
 if not found or r.status<>'disputed' or p_received is null or length(trim(coalesce(p_note,''))) not between 15 and 1000 then raise exception 'refund_locked';end if;
 if p_received then perform private.complete_platform_refund(r.attempt_id,auth.uid());else
 update public.platform_refund_transfers set status='failed' where attempt_id=r.attempt_id and status='disputed';
 update public.platform_payment_refunds set status='prepared',resolution_note=trim(p_note) where attempt_id=r.attempt_id;
 end if;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),r.shop_id,'platform_refund_resolved','platform_payment_refunds',r.attempt_id,jsonb_build_object('received',p_received,'note',trim(p_note)));
end $$;
create function private.refresh_platform_refund_recipient(p_attempt uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.platform_payment_refunds%rowtype;p public.payment_profiles%rowtype;b jsonb;snap jsonb;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 select * into r from public.platform_payment_refunds where attempt_id=p_attempt for update;
 if not found or r.status<>'prepared' or length(trim(coalesce(p_note,''))) not between 15 and 1000 then raise exception 'refund_locked';end if;
 select * into p from public.payment_profiles where shop_id=r.shop_id for share;b:=p.bank_accounts->r.currency;
 if b->>'account' ~ '^[A-Za-z0-9 -]{6,40}$' and length(trim(coalesce(b->>'bank','')))>=2 then snap:=jsonb_build_object('name',p.recipient_name,'bank',b->>'bank','account',b->>'account');
 elsif r.currency='THB' and p.promptpay_enabled then snap:=jsonb_build_object('name',p.recipient_name,'bank','พร้อมเพย์','account',p.promptpay_id);
 else raise exception 'payment_setup_pending';end if;
 update public.platform_payment_refunds set recipient_snapshot=snap,resolution_note=trim(p_note) where attempt_id=r.attempt_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),r.shop_id,'platform_refund_recipient_refreshed','platform_payment_refunds',r.attempt_id,jsonb_build_object('reason',trim(p_note),'previous_recipient',r.recipient_snapshot));
end $$;
create function private.lock_platform_refund_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Refund history is immutable';end if;
 if tg_table_name='platform_refund_transfers' then
 if old.status in ('confirmed','failed') or (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Refund evidence is immutable';end if;
 else
 if old.status='confirmed' or (to_jsonb(new)-array['status','recipient_snapshot','proof_private_path','proof_sha256','recorded_by','recorded_at','confirmed_by','confirmed_at','resolution_note']) is distinct from (to_jsonb(old)-array['status','recipient_snapshot','proof_private_path','proof_sha256','recorded_by','recorded_at','confirmed_by','confirmed_at','resolution_note']) then raise exception 'Refund amount is immutable';end if;
 if new.recipient_snapshot is distinct from old.recipient_snapshot and old.status<>'prepared' then raise exception 'Refund recipient is locked';end if;
 if (new.proof_private_path,new.proof_sha256,new.recorded_by,new.recorded_at) is distinct from (old.proof_private_path,old.proof_sha256,old.recorded_by,old.recorded_at) and not(old.status='prepared' and new.status='reported') then raise exception 'Refund evidence is locked';end if;
 end if;return new;
end $$;
revoke all on function private.lock_platform_refund_history() from public,anon,authenticated,service_role;
create trigger immutable_platform_refund before update or delete on public.platform_payment_refunds for each row execute function private.lock_platform_refund_history();
create trigger immutable_platform_refund_transfer before update or delete on public.platform_refund_transfers for each row execute function private.lock_platform_refund_history();
create function public.dispute_platform_refund(p_attempt uuid,p_note text) returns void language sql security invoker set search_path='' as $$select private.dispute_platform_refund(p_attempt,p_note)$$;
create function public.resolve_platform_refund(p_attempt uuid,p_received boolean,p_note text) returns void language sql security invoker set search_path='' as $$select private.resolve_platform_refund(p_attempt,p_received,p_note)$$;
create function public.refresh_platform_refund_recipient(p_attempt uuid,p_note text) returns void language sql security invoker set search_path='' as $$select private.refresh_platform_refund_recipient(p_attempt,p_note)$$;
revoke all on function private.dispute_platform_refund(uuid,text),public.dispute_platform_refund(uuid,text),private.resolve_platform_refund(uuid,boolean,text),public.resolve_platform_refund(uuid,boolean,text),private.refresh_platform_refund_recipient(uuid,text),public.refresh_platform_refund_recipient(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.dispute_platform_refund(uuid,text),public.dispute_platform_refund(uuid,text),private.resolve_platform_refund(uuid,boolean,text),public.resolve_platform_refund(uuid,boolean,text),private.refresh_platform_refund_recipient(uuid,text),public.refresh_platform_refund_recipient(uuid,text) to authenticated;
notify pgrst,'reload schema';

drop policy platform_refund_proof_cleanup on storage.objects;
create policy platform_refund_proof_cleanup on storage.objects for delete to authenticated using(bucket_id='tidalis-platform-refund-proofs' and private.platform_refund_proof_access(name,false) and public.is_platform_admin((select auth.uid())) and not exists(select 1 from public.platform_payment_refunds where proof_private_path=name) and not exists(select 1 from public.platform_refund_transfers where proof_private_path=name));
notify pgrst,'reload schema';
