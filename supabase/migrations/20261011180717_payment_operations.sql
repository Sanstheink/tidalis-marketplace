-- Shop proceeds and platform fees have separate recipients. No real credentials or
-- account numbers are seeded. Existing production intake/order switches stay closed.
create table public.payment_profiles (
 id uuid primary key default gen_random_uuid(), shop_id uuid references public.shops(id),
 recipient_name text not null, bank_name text, bank_account text, promptpay_id text, qr_private_path text,
 bank_enabled boolean not null default false, promptpay_enabled boolean not null default false,
 billing_address text, bank_currency text not null default 'THB' check(bank_currency in ('THB','LAK','USD')),
 bank_accounts jsonb not null default '{}'::jsonb,
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 check(length(trim(recipient_name)) between 3 and 160),
 check(not bank_enabled or coalesce(length(trim(bank_name))>=2 and bank_account ~ '^[A-Za-z0-9 -]{6,40}$',false)),
 check(not promptpay_enabled or coalesce(promptpay_id ~ '^(0[0-9]{9}|[0-9]{13})$',false))
);
create unique index payment_profile_shop on public.payment_profiles(shop_id) where shop_id is not null;
create unique index payment_profile_platform on public.payment_profiles((true)) where shop_id is null;
alter table public.payment_profiles enable row level security;
create policy payment_profile_finance_read on public.payment_profiles for select to authenticated using(
 public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','finance']));
revoke all on public.payment_profiles from anon,authenticated;
grant select on public.payment_profiles to authenticated;

create table public.payment_attempts (
 id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id),
 invoice_id uuid references public.seller_invoices(id), shop_id uuid references public.shops(id),
 payer_id uuid not null references auth.users(id), amount_minor bigint not null check(amount_minor>0),
 currency text not null check(currency in ('THB','USD','LAK')), method text not null
   check(method in ('bank_transfer','promptpay','qr_code')),
 status text not null default 'pending' check(status in ('pending','proof_submitted','confirmed','rejected','expired','needs_review')),
 recipient_snapshot jsonb not null, expires_at timestamptz not null,
 proof_private_path text, proof_sha256 text check(proof_sha256 is null or proof_sha256 ~ '^[a-f0-9]{64}$'),
 review_note text, confirmed_by uuid references auth.users(id), confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 check((order_id is null) <> (invoice_id is null)),
 check((order_id is not null and shop_id is not null) or (invoice_id is not null and shop_id is null))
);
create unique index one_open_order_payment on public.payment_attempts(order_id) where status in ('pending','proof_submitted','confirmed','needs_review');
create unique index one_open_fee_payment on public.payment_attempts(invoice_id) where status in ('pending','proof_submitted','confirmed','needs_review');
create unique index payment_unique_proof on public.payment_attempts(proof_sha256) where proof_sha256 is not null;
create index payment_attempt_order on public.payment_attempts(order_id);
create index payment_attempt_invoice on public.payment_attempts(invoice_id);
create index payment_attempt_confirmer on public.payment_attempts(confirmed_by);
create index payment_profile_updater on public.payment_profiles(updated_by);
create index payment_attempt_payer on public.payment_attempts(payer_id,created_at desc);
create index payment_attempt_shop on public.payment_attempts(shop_id,created_at desc);
alter table public.payment_attempts enable row level security;
create policy payment_attempt_read on public.payment_attempts for select to authenticated using(
 payer_id=(select auth.uid()) or public.is_platform_admin((select auth.uid()))
 or public.is_shop_member(shop_id,(select auth.uid()),array['owner','finance'])
 or exists(select 1 from public.seller_invoices i where i.id=invoice_id
   and public.is_shop_member(i.shop_id,(select auth.uid()),array['owner','finance'])));
revoke all on public.payment_attempts from anon,authenticated;
grant select on public.payment_attempts to authenticated;
grant all on public.payment_attempts,public.payment_profiles to service_role;
alter table public.payment_transactions drop constraint payment_transactions_method_check;
alter table public.payment_transactions add constraint payment_transactions_method_check
 check(method in ('promptpay_static','bank_transfer','truemoney_manual','bank_qr'));
alter table public.product_reservations add column fulfilled_at timestamptz;
alter table public.seller_invoice_items add constraint invoice_entry_once unique(commission_entry_id);
alter table public.commission_entries add column currency text not null default 'THB' check(currency in ('THB','USD','LAK'));
alter table public.seller_invoices add column currency text not null default 'THB' check(currency in ('THB','USD','LAK'));

create function private.save_payment_profile(p_shop_id uuid,p_name text,p_bank text,p_account text,p_promptpay text,p_bank_enabled boolean,p_promptpay_enabled boolean,p_address text,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not (case when p_shop_id is null then public.is_platform_admin(auth.uid())
   else public.is_shop_member(p_shop_id,auth.uid(),array['owner','finance']) end) then raise exception 'finance_mfa_required'; end if;
 if p_bank_enabled is null or p_promptpay_enabled is null or p_currency is null or p_currency not in ('THB','LAK','USD') or length(trim(coalesce(p_address,''))) not between 15 and 1000 then raise exception 'invalid_billing_address'; end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 160 then raise exception 'invalid_recipient'; end if;
 -- Serialize the platform singleton too, without accepting client-side amounts.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('payment-profile:'||coalesce(p_shop_id::text,'platform')));
 select id into v_id from public.payment_profiles where shop_id is not distinct from p_shop_id for update;
 if v_id is null then
  insert into public.payment_profiles(shop_id,recipient_name,bank_name,bank_account,promptpay_id,bank_enabled,promptpay_enabled,billing_address,bank_currency,bank_accounts,updated_by)
  values(p_shop_id,trim(p_name),nullif(trim(p_bank),''),nullif(p_account,''),nullif(p_promptpay,''),p_bank_enabled,p_promptpay_enabled,trim(p_address),p_currency,jsonb_build_object(p_currency,jsonb_build_object('bank',nullif(trim(p_bank),''),'account',nullif(p_account,''),'enabled',p_bank_enabled)),auth.uid()) returning id into v_id;
 else
  update public.payment_profiles set recipient_name=trim(p_name),bank_name=nullif(trim(p_bank),''),bank_account=nullif(p_account,''),
   promptpay_id=nullif(p_promptpay,''),bank_enabled=p_bank_enabled,promptpay_enabled=p_promptpay_enabled,billing_address=trim(p_address),bank_currency=p_currency,qr_private_path=bank_accounts->p_currency->>'qrPath',
   bank_accounts=bank_accounts||jsonb_build_object(p_currency,coalesce(bank_accounts->p_currency,'{}'::jsonb)||jsonb_build_object('bank',nullif(trim(p_bank),''),'account',nullif(p_account,''),'enabled',p_bank_enabled)),updated_by=auth.uid(),updated_at=now() where id=v_id;
 end if;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),p_shop_id,'payment_recipient_updated','payment_profiles',v_id);
 return v_id;
end $$;
-- Reveal channel availability, never bank account numbers, to public checkout.
create function private.direct_payment_methods(p_shop_id uuid,p_currency text)
returns text[] language sql stable security definer set search_path='' as $$
 select coalesce((select array_remove(array[
  case when p.bank_accounts->p_currency->>'enabled'='true' then 'bank_transfer' end,
  case when p.bank_accounts->p_currency->>'qrPath' is not null and exists(select 1 from storage.objects o where o.bucket_id='tidalis-payment-qr' and o.name=p.bank_accounts->p_currency->>'qrPath') then 'qr_code' end,
  case when p.promptpay_enabled and p_currency='THB' then 'promptpay' end
 ]::text[],null) from public.payment_profiles p where p.shop_id is not distinct from p_shop_id),'{}'::text[])
$$;
revoke all on function private.direct_payment_methods(uuid,text) from public,anon,authenticated,service_role;

create function private.payment_context(p_order_id uuid,p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_shop uuid; v_amount bigint; v_currency text; v_name text; v_profile public.payment_profiles%rowtype; v_bank jsonb; v_methods text[]:='{}';
begin
 if auth.uid() is null or (p_order_id is null)=(p_invoice_id is null) then raise exception 'payment_unavailable'; end if;
 if p_order_id is not null then
  select shop_id,total_minor,currency,shop_snapshot->>'name' into v_shop,v_amount,v_currency,v_name from public.orders
   where id=p_order_id and buyer_id=auth.uid() and status in ('pending','payment_review','paid','fulfilled');
  if not found then raise exception 'payment_unavailable'; end if;
 else
  select i.total_minor,i.currency,'Tidalis · ค่าบริการแพลตฟอร์ม' into v_amount,v_currency,v_name from public.seller_invoices i
   where i.id=p_invoice_id and i.status in ('issued','partial','overdue','paid') and public.is_shop_member(i.shop_id,auth.uid(),array['owner','finance']);
  if not found then raise exception 'finance_mfa_required'; end if;
 end if;
 v_methods:=private.direct_payment_methods(v_shop,v_currency);
 return jsonb_build_object('recipientLabel',v_name,'amountMinor',v_amount,'currency',v_currency,'methods',v_methods);
end $$;

create function private.create_payment_attempt(p_order_id uuid,p_invoice_id uuid,p_method text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_order public.orders%rowtype; v_invoice public.seller_invoices%rowtype;
 v_profile public.payment_profiles%rowtype; v_bank jsonb; v_attempt public.payment_attempts%rowtype; v_shop uuid; v_expiry timestamptz;
begin
 if (p_order_id is null)=(p_invoice_id is null) then raise exception 'payment_unavailable'; end if;
 if p_order_id is not null then
  select * into v_order from public.orders where id=p_order_id and buyer_id=auth.uid() for update;
  if not found or v_order.status not in ('pending','payment_review') then raise exception 'order_not_payable'; end if;
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
 if v_expiry is null or v_expiry<=now() then raise exception 'reservation_expired'; end if;
 v_context:=private.payment_context(p_order_id,p_invoice_id);
 if not ((v_context->'methods') ? p_method) then raise exception 'method_unavailable'; end if;
 select * into v_profile from public.payment_profiles where shop_id is not distinct from v_shop for share;
 v_bank:=v_profile.bank_accounts->(v_context->>'currency');
 insert into public.payment_attempts(order_id,invoice_id,shop_id,payer_id,amount_minor,currency,method,expires_at,recipient_snapshot)
 values(p_order_id,p_invoice_id,v_shop,auth.uid(),(v_context->>'amountMinor')::bigint,v_context->>'currency',p_method,v_expiry,
 jsonb_build_object('label',v_context->>'recipientLabel','name',v_profile.recipient_name,'bank',v_bank->>'bank',
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

-- Protected, bounded storage helper; object paths cannot be repurposed for another payer.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('tidalis-payment-proofs','tidalis-payment-proofs',false,3145728,array['image/png','image/jpeg','image/webp','application/pdf'])
 on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=excluded.allowed_mime_types;
create function private.payment_proof_access(p_path text,p_write boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_attempts a where p_path ~ ('^attempts/'||a.id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$')
 and (case when p_write then a.payer_id=auth.uid() and a.method in ('bank_transfer','promptpay','qr_code') and a.status='pending' and a.expires_at>now()
 else a.payer_id=auth.uid() or public.is_platform_admin(auth.uid()) or public.is_shop_member(a.shop_id,auth.uid(),array['owner','finance'])
 or exists(select 1 from public.seller_invoices i where i.id=a.invoice_id and public.is_shop_member(i.shop_id,auth.uid(),array['owner','finance'])) end))
$$;
create policy payment_proof_upload on storage.objects for insert to authenticated with check(bucket_id='tidalis-payment-proofs' and private.payment_proof_access(name,true));
create policy payment_proof_read on storage.objects for select to authenticated using(bucket_id='tidalis-payment-proofs' and private.payment_proof_access(name,false));
create policy payment_proof_cleanup on storage.objects for delete to authenticated using(bucket_id='tidalis-payment-proofs' and private.payment_proof_access(name,true)
 and not exists(select 1 from public.payment_attempts where proof_private_path=name));

create function private.submit_payment_proof(p_attempt_id uuid,p_actor uuid,p_path text,p_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype;
begin
 select * into a from public.payment_attempts where id=p_attempt_id;
 if a.order_id is not null then perform 1 from public.orders where id=a.order_id for update;
 else perform 1 from public.seller_invoices where id=a.invoice_id for update; end if;
 select * into a from public.payment_attempts where id=p_attempt_id for update;
 if p_actor is null or not found or a.payer_id is distinct from p_actor or a.method not in ('bank_transfer','promptpay','qr_code') then raise exception 'proof_unavailable'; end if;
 if a.status='proof_submitted' and a.proof_private_path=p_path and a.proof_sha256=p_sha256 then return; end if;
 if a.status<>'pending' or a.expires_at<=now() then raise exception 'reservation_expired'; end if;
 if p_path is null or p_sha256 is null or p_path !~ ('^attempts/'||a.id::text||'/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$') or p_sha256 !~ '^[a-f0-9]{64}$'
  or not exists(select 1 from storage.objects where bucket_id='tidalis-payment-proofs' and name=p_path
    and (metadata->>'size')::bigint between 1 and 3145728 and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','application/pdf')) then raise exception 'invalid_proof'; end if;
 update public.payment_attempts set status='proof_submitted',proof_private_path=p_path,proof_sha256=p_sha256,expires_at=now()+interval '24 hours' where id=a.id;
 if a.order_id is not null then
  update public.payment_transactions set status='proof_submitted',proof_private_path=p_path where id=a.id;
  update public.orders set status='payment_review',reservation_expires_at=now()+interval '24 hours' where id=a.order_id;
  update public.product_reservations set expires_at=now()+interval '24 hours' where order_id=a.order_id and released_at is null;
 else update public.platform_fee_payments set status='proof_submitted',proof_private_path=p_path where id=a.id; end if;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,a.shop_id,'payment_proof_submitted','payment_attempts',a.id);
end $$;

create function private.finish_payment(p_attempt_id uuid,p_actor uuid)
returns text language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype; o public.orders%rowtype; i public.seller_invoices%rowtype; p record; available bigint; rule public.commission_fee_rules%rowtype;
begin
 select * into a from public.payment_attempts where id=p_attempt_id;
 if not found then raise exception 'payment_unavailable'; end if;
 if a.order_id is not null then select * into o from public.orders where id=a.order_id for update;
 else select * into i from public.seller_invoices where id=a.invoice_id for update; end if;
 select * into a from public.payment_attempts where id=p_attempt_id for update;
 if a.status in ('confirmed','needs_review') then return a.status; end if;
 if a.status<>'proof_submitted' then raise exception 'payment_not_reviewable'; end if;
 if a.order_id is not null then
  if o.total_minor<>a.amount_minor or o.currency<>a.currency then raise exception 'order_changed'; end if;
  if o.status not in ('pending','payment_review') then
   update public.payment_attempts set status='needs_review',confirmed_at=now(),review_note='ได้รับเงินสำหรับรายการที่ปิดแล้ว กรุณาตรวจสอบการคืนเงิน' where id=a.id;
   update public.payment_transactions set status='under_review' where id=a.id;
   insert into public.audit_logs(shop_id,action,target_table,target_id) values(a.shop_id,'paid_closed_order','payment_attempts',a.id);
   return 'needs_review';
  end if;
  perform pr.id from public.products pr where pr.id in(select product_id from public.order_items where order_id=o.id) order by pr.id for update;
  for p in select pr.id,pr.stock,sum(oi.quantity) qty from public.order_items oi join public.products pr on pr.id=oi.product_id where oi.order_id=o.id group by pr.id,pr.stock loop
   select coalesce(sum(quantity),0) into available from public.product_reservations where product_id=p.id and order_id<>o.id and released_at is null and expires_at>now();
   if p.stock is not null and p.stock-available<p.qty then
    update public.payment_attempts set status='needs_review',confirmed_at=now(),confirmed_by=p_actor,
     review_note='ได้รับเงินหลังสิทธิ์การจองหมดและสินค้าไม่พอ กรุณาติดต่อร้านเพื่อคืนเงิน' where id=a.id;
    update public.payment_transactions set status='under_review' where id=a.id;
    update public.orders set status='payment_review' where id=o.id;
    insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,a.shop_id,'paid_stock_conflict','payment_attempts',a.id);
    return 'needs_review';
   end if;
  end loop;
  -- Permanent inventory allocation preserves immutable published product contents.
  update public.product_reservations set expires_at='infinity',released_at=null,fulfilled_at=now() where order_id=o.id;
  update public.orders set status='fulfilled' where id=o.id;
  update public.payment_transactions set status='confirmed',confirmed_by=p_actor,confirmed_at=now() where id=a.id;
  insert into public.download_entitlements(buyer_id,order_item_id) select o.buyer_id,id from public.order_items where order_id=o.id on conflict(order_item_id) do nothing;
  select * into rule from public.commission_fee_rules where (shop_id=o.shop_id or shop_id is null) and category is null
   and effective_from<=o.created_at and (effective_until is null or effective_until>o.created_at) order by shop_id nulls last,effective_from desc,id limit 1;
  if found then insert into public.commission_entries(order_id,shop_id,fee_rule_id,rate_basis_points,fee_base_minor,fee_minor,currency)
   values(o.id,o.shop_id,rule.id,rule.rate_basis_points,o.subtotal_minor,(o.subtotal_minor*rule.rate_basis_points+5000)/10000,o.currency) on conflict(order_id) do nothing; end if;
 else
  if i.total_minor<>a.amount_minor or i.currency<>a.currency then raise exception 'invoice_changed'; end if;
  if i.status not in ('issued','overdue') then
   update public.payment_attempts set status='needs_review',review_note='ได้รับเงินสำหรับใบแจ้งหนี้ที่ปิดแล้ว กรุณาตรวจสอบการคืนเงิน' where id=a.id;
   insert into public.audit_logs(action,target_table,target_id) values('paid_closed_invoice','payment_attempts',a.id);
   return 'needs_review';
  end if;
  update public.platform_fee_payments set status='confirmed',confirmed_by=p_actor,confirmed_at=now() where id=a.id;
  update public.seller_invoices set status='paid' where id=i.id;
 end if;
 update public.payment_attempts set status='confirmed',confirmed_by=p_actor,confirmed_at=now() where id=a.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(p_actor,a.shop_id,'payment_confirmed','payment_attempts',a.id,jsonb_build_object('method',a.method,'amount_minor',a.amount_minor,'currency',a.currency));
 return 'confirmed';
end $$;
create function private.review_manual_payment(p_attempt_id uuid,p_approve boolean,p_note text)
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
  update public.orders set status='pending' where id=a.order_id;
 else update public.platform_fee_payments set status='rejected' where id=a.id; end if;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),a.shop_id,'payment_rejected','payment_attempts',a.id,jsonb_build_object('reason',trim(p_note)));
 return 'rejected';
end $$;

-- Verified buyers can read only paid entitlements; archived shop visibility cannot
-- revoke a purchased file. Files referenced by orders are immutable.
create policy entitled_product_file_read on public.product_files for select to authenticated using(is_delivery_file and exists(
 select 1 from public.download_entitlements e join public.order_items oi on oi.id=e.order_item_id
 where oi.product_id=public.product_files.product_id and e.buyer_id=(select auth.uid()) and e.revoked_at is null));
create policy entitled_product_object_read on storage.objects for select to authenticated using(bucket_id='tidalis-product-files' and exists(
 select 1 from public.product_files f join public.order_items oi on oi.product_id=f.product_id join public.download_entitlements e on e.order_item_id=oi.id
 where f.file_path=storage.objects.name and f.is_delivery_file and e.buyer_id=(select auth.uid()) and e.revoked_at is null));

-- Exposed functions are invoker wrappers; definers stay outside the API schema.
create function public.save_payment_profile(p_shop_id uuid,p_name text,p_bank text,p_account text,p_promptpay text,p_bank_enabled boolean,p_promptpay_enabled boolean,p_address text,p_currency text)
returns uuid language sql security invoker set search_path='' as $$select private.save_payment_profile(p_shop_id,p_name,p_bank,p_account,p_promptpay,p_bank_enabled,p_promptpay_enabled,p_address,p_currency)$$;
create function public.get_payment_context(p_order_id uuid,p_invoice_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.payment_context(p_order_id,p_invoice_id)$$;
create function public.create_payment_attempt(p_order_id uuid,p_invoice_id uuid,p_method text)
returns uuid language sql security invoker set search_path='' as $$select private.create_payment_attempt(p_order_id,p_invoice_id,p_method)$$;
create function public.review_manual_payment(p_attempt_id uuid,p_approve boolean,p_note text)
returns text language sql security invoker set search_path='' as $$select private.review_manual_payment(p_attempt_id,p_approve,p_note)$$;
create function public.submit_payment_proof(p_attempt_id uuid,p_actor uuid,p_path text,p_sha256 text)
returns void language sql security invoker set search_path='' as $$select private.submit_payment_proof(p_attempt_id,p_actor,p_path,p_sha256)$$;
do $$ declare fn record; r text; begin
 for fn in select p.oid::regprocedure sig,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname in ('save_payment_profile','payment_context','get_payment_context','create_payment_attempt','review_manual_payment','submit_payment_proof','finish_payment','payment_proof_access') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.sig);
  if fn.proname in ('submit_payment_proof') then r:='service_role';
  elsif fn.proname='finish_payment' then continue; else r:='authenticated'; end if;
  execute format('grant execute on function %s to %I',fn.sig,r);
 end loop;
end $$;
grant usage on schema public,private to service_role;
notify pgrst,'reload schema';

-- Multi-currency prices use integer hundredths; no implicit FX conversion.
alter table public.products add column currency text not null default 'THB' check(currency in ('THB','USD','LAK'));
alter table public.orders drop constraint orders_currency_check;
alter table public.orders add constraint orders_currency_check check(currency in ('THB','USD','LAK'));
create or replace function private.fixed_checkout_context(p_shop_id uuid,p_product_ids uuid[])
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
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'name',p.name,'currency',p.currency,'exclusive',p.is_exclusive,
    'available',case when p.stock is null then 20 else greatest(0,least(case when p.is_exclusive then 1 else 20 end,
      p.stock-coalesce((select sum(r.quantity) from public.product_reservations r where r.product_id=p.id and r.released_at is null and r.expires_at>now()),0))) end,
    'licenses',(select coalesce(jsonb_agg(jsonb_build_object('usageType',l.usage_type,'priceMinor',l.price_minor,'terms',l.terms) order by l.usage_type),'[]'::jsonb)
      from public.product_license_prices l where l.product_id=p.id)) order by p.id),'[]'::jsonb) into v_products
    from public.products p where p.shop_id=p_shop_id and p.id=any(p_product_ids) and p.status='published' and p.pricing_mode='fixed';
  return jsonb_build_object('enabled',coalesce(v_enabled,false),'eligible',v_eligible,'reason',v_reason,
    'shop',jsonb_build_object('id',v_shop.id,'name',v_shop.name,'slug',v_shop.slug),'products',v_products,'policies',v_policies,'paymentMethods',jsonb_build_object('THB',private.direct_payment_methods(p_shop_id,'THB'),'LAK',private.direct_payment_methods(p_shop_id,'LAK'),'USD',private.direct_payment_methods(p_shop_id,'USD')),'reservationMinutes',30);
end;
$$;

create or replace function private.create_fixed_order(p_shop_id uuid,p_items jsonb,p_note text,p_policy_ids uuid[],p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_existing public.orders%rowtype; v_product public.products%rowtype;
  v_price public.product_license_prices%rowtype; v_context jsonb; v_payload jsonb; v_items jsonb;
  v_line jsonb; v_id uuid; v_item_id uuid; v_total bigint:=0; v_qty integer;
  v_currency text; v_held bigint; v_available bigint; v_enabled boolean; v_now timestamptz; v_policy_ids uuid[];
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
    'expectedPriceMinor',(x->>'expectedPriceMinor')::bigint,'expectedTerms',x->>'expectedTerms','expectedCurrency',coalesce(x->>'expectedCurrency','THB')) order by (x->>'productId')::uuid,x->>'license') into v_items from jsonb_array_elements(p_items) x;
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
  select min(p.currency) into v_currency from public.products p where p.id in(select (x->>'productId')::uuid from jsonb_array_elements(v_items) x);
  if (select count(distinct p.currency) from public.products p where p.id in(select (x->>'productId')::uuid from jsonb_array_elements(v_items) x))>1 then raise exception 'mixed_currencies'; end if;
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
    if (select currency from public.products where id=v_price.product_id) is distinct from v_line->>'expectedCurrency' then raise exception 'price_or_terms_changed'; end if;
    if v_price.price_minor<>(v_line->>'expectedPriceMinor')::bigint or v_price.terms<>v_line->>'expectedTerms' then raise exception 'price_or_terms_changed'; end if;
    v_total:=v_total+v_price.price_minor*(v_line->>'quantity')::integer;
    if v_total>999999999999 then raise exception 'invalid_total'; end if;
  end loop;
  perform 1 from public.payment_profiles where shop_id=p_shop_id for share;
  if v_total>0 and cardinality(private.direct_payment_methods(p_shop_id,v_currency))=0 then raise exception 'payment_setup_pending'; end if;
  insert into public.orders(shop_id,buyer_id,status,currency,subtotal_minor,vat_minor,total_minor,buyer_note,policy_snapshot,tax_snapshot,idempotency_key,request_payload,reservation_expires_at,shop_snapshot)
    values(p_shop_id,v_user,'pending',v_currency,v_total,0,v_total,nullif(trim(coalesce(p_note,'')),''),v_context->'policies',jsonb_build_object('vat_status','not_registered','vat_charged',false),p_idempotency_key,v_payload,v_now+interval '30 minutes',v_context->'shop') returning id into v_id;
  for v_line in select value from jsonb_array_elements(v_items) loop
    select * into v_product from public.products where id=(v_line->>'productId')::uuid;
    select * into v_price from public.product_license_prices where product_id=v_product.id and usage_type=v_line->>'license';
    insert into public.order_items(order_id,product_id,quantity,usage_type,price_minor,item_snapshot)
      values(v_id,v_product.id,(v_line->>'quantity')::integer,v_price.usage_type,v_price.price_minor,jsonb_build_object('name',v_product.name,'slug',v_product.slug,'product_type',v_product.product_type,'exclusive',v_product.is_exclusive,'currency',v_currency,'license_terms',v_price.terms)) returning id into v_item_id;
    insert into public.product_reservations(order_item_id,order_id,product_id,quantity,expires_at) values(v_item_id,v_id,v_product.id,(v_line->>'quantity')::integer,v_now+interval '30 minutes');
  end loop;
  if v_total=0 then
   update public.orders set status='fulfilled' where id=v_id;
   update public.product_reservations set expires_at='infinity',fulfilled_at=now() where order_id=v_id;
   insert into public.download_entitlements(buyer_id,order_item_id) select v_user,id from public.order_items where order_id=v_id;
  end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(v_user,p_shop_id,'fixed_order_created','orders',v_id,jsonb_build_object('total_minor',v_total));
  return v_id;
end;
$$;
