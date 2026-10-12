-- Owner-authorized Phase 6 self-service release. Apply only after the pending
-- Phase 6 completion migration. No hosted database is modified by writing this file.
-- Real published agreements, verified email, shop membership, MFA, product data,
-- policy snapshots, currency recipients and actual financial amounts remain checked.
alter table public.marketplace_settings add column self_service_shops boolean not null default true;
alter table public.marketplace_settings add column seller_self_publish boolean not null default true;
grant select(self_service_shops,seller_self_publish) on public.marketplace_settings to anon,authenticated;
-- The owner requested intake and publishing to be unlocked. Checkout still checks
-- every shop's completed policies, readiness and currency-specific recipient.
update public.marketplace_settings set seller_intake_open=true,fixed_orders_enabled=true,updated_at=now() where singleton;
alter table public.seller_applications add column approval_mode text not null default 'manual' check(approval_mode in ('manual','self_service'));
alter table public.seller_applications add column self_opened_at timestamptz;
alter table public.shop_readiness_requests add column approval_mode text not null default 'manual' check(approval_mode in ('manual','self_service'));
alter table public.products add column publication_mode text not null default 'manual' check(publication_mode in ('manual','seller'));
alter table public.shop_policy_versions add column publication_mode text not null default 'manual' check(publication_mode in ('manual','seller'));

create function private.self_open_shop(p_application uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.seller_applications%rowtype;agreement uuid;shop uuid;enabled boolean;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'verified_email_required';end if;
 select self_service_shops into enabled from public.marketplace_settings where singleton for share;
 if enabled is distinct from true then raise exception 'self_service_closed';end if;
 select * into a from public.seller_applications where id=p_application and user_id=auth.uid() for update;
 if not found then raise exception 'application_unavailable';end if;
 if a.status='approved' and a.created_shop_id is not null then return a.created_shop_id;end if;
 if a.status not in ('submitted','under_review') then raise exception 'application_not_ready';end if;
 select id into agreement from public.platform_policy_versions where policy_type='seller-agreement' and status='published' and approved_by is not null and effective_from<=now() order by version desc limit 1;
 if agreement is null or agreement is distinct from a.agreement_version_id or a.agreement_accepted_at is null or not exists(select 1 from public.policy_acceptances where user_id=a.user_id and policy_version_id=agreement) then raise exception 'policies_changed';end if;
 insert into public.shops(owner_id,name,slug,description,status) values(a.user_id,a.shop_name,a.requested_slug,a.description,'active') returning id into shop;
 insert into public.shop_members(shop_id,user_id,role) values(shop,a.user_id,'owner');
 update public.seller_applications set status='approved',created_shop_id=shop,approval_mode='self_service',self_opened_at=now(),reviewed_by=null,reviewed_at=null,review_note=null where id=a.id;
 insert into public.shop_readiness_requests(shop_id,status,seller_note,approval_mode) values(shop,'needs_information','เตรียมนโยบายและสินค้าเพื่อเริ่มรับคำสั่งซื้อ','self_service');
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),shop,'shop_self_opened','seller_applications',a.id);
 return shop;
end $$;
create function private.auto_open_own_application() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='submitted' and new.user_id=auth.uid() and exists(select 1 from public.marketplace_settings where singleton and self_service_shops) then perform private.self_open_shop(new.id);end if;
 return new;
end $$;
create trigger seller_self_service_open after insert or update of status on public.seller_applications for each row execute function private.auto_open_own_application();
revoke all on function private.auto_open_own_application() from public,anon,authenticated,service_role;

-- Preserve the old manual workflow for installations which explicitly disable
-- self-service. Retry identity is the real owner's requested shop URL and payload.
alter function public.submit_seller_application(text,text,text,text,uuid) set schema private;
alter function private.submit_seller_application(text,text,text,text,uuid) rename to submit_legacy_seller_application;
revoke all on function private.submit_legacy_seller_application(text,text,text,text,uuid) from public,anon,authenticated,service_role;
create function private.submit_seller_application(p_shop_name text,p_requested_slug text,p_portfolio_url text,p_description text,p_agreement_version_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.seller_applications%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'verified_email_required';end if;
 insert into public.profiles(id) values(auth.uid()) on conflict(id) do nothing;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into a from public.seller_applications where user_id=auth.uid() and requested_slug=trim(p_requested_slug) and status='approved' order by submitted_at desc limit 1;
 if found and a.shop_name=trim(p_shop_name) and a.portfolio_url=trim(p_portfolio_url) and a.description=trim(p_description) and a.agreement_version_id=p_agreement_version_id then return a.id;end if;
 return private.submit_legacy_seller_application(p_shop_name,p_requested_slug,p_portfolio_url,p_description,p_agreement_version_id);
end $$;
create function public.submit_seller_application(p_shop_name text,p_requested_slug text,p_portfolio_url text,p_description text,p_agreement_version_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.submit_seller_application(p_shop_name,p_requested_slug,p_portfolio_url,p_description,p_agreement_version_id)$$;
alter function public.resubmit_seller_application(uuid,text,text,text,text,uuid) set schema private;
alter function private.resubmit_seller_application(uuid,text,text,text,text,uuid) rename to resubmit_legacy_seller_application;
revoke all on function private.resubmit_legacy_seller_application(uuid,text,text,text,text,uuid) from public,anon,authenticated,service_role;
create function private.resubmit_seller_application(p_application_id uuid,p_shop_name text,p_requested_slug text,p_portfolio_url text,p_description text,p_agreement_version_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.seller_applications%rowtype;
begin
 select * into a from public.seller_applications where id=p_application_id and user_id=auth.uid() for update;
 if not found then raise exception 'application_unavailable';end if;
 if a.status='approved' and a.shop_name=trim(p_shop_name) and a.requested_slug=trim(p_requested_slug) and a.portfolio_url=trim(p_portfolio_url) and a.description=trim(p_description) and a.agreement_version_id=p_agreement_version_id then return;end if;
 if a.status in ('submitted','under_review') and exists(select 1 from public.marketplace_settings where singleton and self_service_shops) then update public.seller_applications set status='needs_information' where id=a.id;end if;
 perform private.resubmit_legacy_seller_application(p_application_id,p_shop_name,p_requested_slug,p_portfolio_url,p_description,p_agreement_version_id);
end $$;
create function public.resubmit_seller_application(p_application_id uuid,p_shop_name text,p_requested_slug text,p_portfolio_url text,p_description text,p_agreement_version_id uuid) returns void language sql security invoker set search_path='' as $$select private.resubmit_seller_application(p_application_id,p_shop_name,p_requested_slug,p_portfolio_url,p_description,p_agreement_version_id)$$;

create function private.refresh_self_service_readiness(p_shop uuid) returns void language plpgsql security definer set search_path='' as $$
declare issues text[];
begin
 if not exists(select 1 from public.marketplace_settings where singleton and self_service_shops) or not exists(select 1 from public.shops where id=p_shop and status='active') then return;end if;
 issues:=public.tidalis_shop_readiness_blockers(p_shop);
 if cardinality(issues)=0 then
 insert into public.shop_readiness_requests(shop_id,status,seller_note,approval_mode,reviewed_by,reviewed_at)
 values(p_shop,'approved','ผ่านการตรวจข้อมูลอัตโนมัติ','self_service',null,null)
 on conflict(shop_id) do update set status='approved',approval_mode='self_service',review_note=null,reviewed_by=null,reviewed_at=null;
 end if;
end $$;
revoke all on function private.refresh_self_service_readiness(uuid) from public,anon,authenticated,service_role;
create function private.activate_own_shop(p_shop uuid) returns void language plpgsql security definer set search_path='' as $$
declare state text;issues text[];
begin
 if not public.is_shop_member(p_shop,auth.uid(),array['owner','manager']) then raise exception 'seller_mfa_required';end if;
 if not exists(select 1 from public.marketplace_settings where singleton and self_service_shops) then raise exception 'self_service_closed';end if;
 select status into state from public.shops where id=p_shop for update;
 if state is null or state not in ('active','paused') then raise exception 'shop_unavailable';end if;
 issues:=public.tidalis_shop_readiness_blockers(p_shop);
 if cardinality(issues)>0 then raise exception 'shop_setup_pending';end if;
 update public.shops set status='active' where id=p_shop;
 perform private.refresh_self_service_readiness(p_shop);
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),p_shop,'shop_self_activated','shops',p_shop);
end $$;

create function private.publish_own_product(p_product uuid,p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype;issues text[];
begin
 select * into product from public.products where id=p_product;
 if not found or not public.is_shop_member(product.shop_id,auth.uid(),array['owner','manager','artist']) then raise exception 'seller_mfa_required';end if;
 if p_confirmed is distinct from true then raise exception 'publication_confirmation_required';end if;
 if not exists(select 1 from public.marketplace_settings where singleton and seller_self_publish) then raise exception 'self_publication_closed';end if;
 perform 1 from public.shops where id=product.shop_id and status in ('active','paused') for update;
 if not found then raise exception 'shop_unavailable';end if;
 select * into product from public.products where id=p_product for update;
 if product.status='published' then return;end if;
 if product.status not in ('draft','under_review') then raise exception 'product_locked';end if;
 issues:=public.tidalis_product_publish_blockers(p_product);
 if cardinality(issues)>0 then raise exception 'product_incomplete: %',array_to_string(issues,', ');end if;
 update public.products set status='published',published_at=now(),reviewed_by=auth.uid(),reviewed_at=now(),review_note=null,publication_mode='seller' where id=p_product;
 perform private.refresh_self_service_readiness(product.shop_id);
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),product.shop_id,'product_self_published','products',product.id);
end $$;
create function private.publish_own_shop_policy(p_policy uuid,p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare policy public.shop_policy_versions%rowtype;
begin
 select * into policy from public.shop_policy_versions where id=p_policy;
 if not found or not public.is_shop_member(policy.shop_id,auth.uid(),array['owner','manager']) then raise exception 'seller_mfa_required';end if;
 if p_confirmed is distinct from true then raise exception 'publication_confirmation_required';end if;
 if not exists(select 1 from public.marketplace_settings where singleton and self_service_shops) then raise exception 'self_service_closed';end if;
 perform 1 from public.shops where id=policy.shop_id and status in ('active','paused') for update;
 if not found then raise exception 'shop_unavailable';end if;
 select * into policy from public.shop_policy_versions where id=p_policy for update;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(policy.shop_id::text),pg_catalog.hashtext(policy.policy_type));
 if policy.status='published' then return;end if;
 if policy.status not in ('draft','under_review') or (policy.source_type='text' and length(trim(policy.content))<200) then raise exception 'policy_incomplete';end if;
 if policy.source_type='pdf' and not exists(select 1 from storage.objects where bucket_id='tidalis-policy-documents' and name=policy.document_path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint=policy.document_size) then raise exception 'policy_document_unavailable';end if;
 if exists(select 1 from public.shop_policy_versions where shop_id=policy.shop_id and policy_type=policy.policy_type and status='published' and version>=policy.version) then raise exception 'newer_policy_published';end if;
 update public.shop_policy_versions set status='archived' where shop_id=policy.shop_id and policy_type=policy.policy_type and status='published';
 update public.shop_policy_versions set status='published',published_at=now(),reviewed_by=auth.uid(),reviewed_at=now(),review_note=null,review_outcome='approved',publication_mode='seller' where id=policy.id;
 perform private.refresh_self_service_readiness(policy.shop_id);
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),policy.shop_id,'shop_policy_self_published','shop_policy_versions',policy.id);
end $$;

create function private.suspend_shop(p_shop uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 if length(trim(coalesce(p_reason,''))) not between 12 and 1500 then raise exception 'review_note_required';end if;
 perform 1 from public.shops where id=p_shop and status in ('active','paused') for update;
 if not found then raise exception 'shop_unavailable';end if;
 update public.shops set status='suspended' where id=p_shop;
 update public.shop_readiness_requests set status='needs_information',review_note=trim(p_reason),reviewed_by=auth.uid(),reviewed_at=now() where shop_id=p_shop;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),p_shop,'shop_suspended','shops',p_shop,jsonb_build_object('reason',trim(p_reason)));
end $$;

create function public.self_open_shop(p_application uuid) returns uuid language sql security invoker set search_path='' as $$select private.self_open_shop(p_application)$$;
create function public.activate_own_shop(p_shop uuid) returns void language sql security invoker set search_path='' as $$select private.activate_own_shop(p_shop)$$;
create function public.publish_own_product(p_product uuid,p_confirmed boolean) returns void language sql security invoker set search_path='' as $$select private.publish_own_product(p_product,p_confirmed)$$;
create function public.publish_own_shop_policy(p_policy uuid,p_confirmed boolean) returns void language sql security invoker set search_path='' as $$select private.publish_own_shop_policy(p_policy,p_confirmed)$$;
create function public.suspend_shop(p_shop uuid,p_reason text) returns void language sql security invoker set search_path='' as $$select private.suspend_shop(p_shop,p_reason)$$;
revoke all on function private.self_open_shop(uuid),public.self_open_shop(uuid),private.activate_own_shop(uuid),public.activate_own_shop(uuid),private.publish_own_product(uuid,boolean),public.publish_own_product(uuid,boolean),private.publish_own_shop_policy(uuid,boolean),public.publish_own_shop_policy(uuid,boolean),private.suspend_shop(uuid,text),public.suspend_shop(uuid,text),private.submit_seller_application(text,text,text,text,uuid),public.submit_seller_application(text,text,text,text,uuid),private.resubmit_seller_application(uuid,text,text,text,text,uuid),public.resubmit_seller_application(uuid,text,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.self_open_shop(uuid),public.self_open_shop(uuid),private.activate_own_shop(uuid),public.activate_own_shop(uuid),private.publish_own_product(uuid,boolean),public.publish_own_product(uuid,boolean),private.publish_own_shop_policy(uuid,boolean),public.publish_own_shop_policy(uuid,boolean),private.suspend_shop(uuid,text),public.suspend_shop(uuid,text),private.submit_seller_application(text,text,text,text,uuid),public.submit_seller_application(text,text,text,text,uuid),private.resubmit_seller_application(uuid,text,text,text,text,uuid),public.resubmit_seller_application(uuid,text,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';

-- Zero is an allowed, real product price; free checkout already creates no payment.
create or replace function public.tidalis_product_publish_blockers(p_product_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_p public.products%rowtype; v_reasons text[]:=array[]::text[];
begin
  select * into v_p from public.products where id=p_product_id;
  if not found then raise exception 'Product not found'; end if;
  if not (public.tidalis_seller_routine_access(v_p.shop_id,array['owner','manager','artist'])
      or public.is_platform_admin(auth.uid())) then
    raise exception 'Product review requires MFA'; end if;
  if length(trim(v_p.description))<30 then v_reasons:=array_append(v_reasons,'description_too_short'); end if;
  if v_p.work_type_id is null or not exists(select 1 from public.shop_work_types wt
    where wt.id=v_p.work_type_id and wt.shop_id=v_p.shop_id) then
    v_reasons:=array_append(v_reasons,'work_type_missing'); end if;
  if (select count(*) from public.product_license_prices lp where lp.product_id=p_product_id
      and lp.usage_type in ('personal','commercial') and lp.price_minor>=0
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

-- A zero-balance document has a real invoice anchor and no fabricated payment.
alter table public.platform_billing_documents alter column payment_id drop not null;
alter table public.platform_billing_documents drop constraint platform_billing_documents_total_minor_check;
alter table public.platform_billing_documents add constraint platform_document_total_nonnegative check(total_minor>=0);
alter table public.platform_billing_documents add column issuance_source text not null default 'confirmed_payment' check(issuance_source in ('confirmed_payment','zero_balance'));
alter table public.platform_billing_documents add constraint platform_document_origin check(
 (issuance_source='confirmed_payment' and payment_id is not null and total_minor>0) or
 (issuance_source='zero_balance' and payment_id is null and total_minor=0 and net_minor=0 and vat_minor=0));
alter table public.platform_billing_documents drop constraint platform_billing_documents_payment_id_document_type_key;
create unique index platform_active_payment_document on public.platform_billing_documents(payment_id,document_type) where status='issued' and payment_id is not null;
create unique index platform_active_zero_document on public.platform_billing_documents(invoice_id,document_type) where status='issued' and issuance_source='zero_balance';

create function private.issue_zero_platform_document(p_shop_id uuid,p_currency text,p_from date,p_to date,p_kind text,p_name text,p_address text,p_tax_id text) returns uuid language plpgsql security definer set search_path='' as $$
declare issuer public.platform_issuer_profile%rowtype;profile public.payment_profiles%rowtype;invoice public.seller_invoices%rowtype;
 tax public.seller_tax_profiles%rowtype;tax_version public.tax_profile_versions%rowtype;doc uuid;num text;recipient_name text;recipient_address text;gross bigint;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 if p_currency is null or p_currency not in ('THB','LAK','USD') or p_kind is null or p_kind not in ('receipt','tax_invoice') or p_from is null or p_to is null or p_from>p_to or p_to>(now() at time zone 'Asia/Bangkok')::date then raise exception 'invalid_period';end if;
 perform 1 from public.shops where id=p_shop_id for update;if not found then raise exception 'shop_unavailable';end if;
 select * into issuer from public.platform_issuer_profile where id=true;
 if not found or issuer.approved_at is null then raise exception 'issuer_required';end if;
 select * into profile from public.payment_profiles where shop_id=p_shop_id;
 recipient_name:=coalesce(nullif(trim(p_name),''),profile.recipient_name);
 recipient_address:=coalesce(nullif(trim(p_address),''),profile.billing_address);
 if length(coalesce(recipient_name,'')) not between 3 and 160 or length(coalesce(recipient_address,'')) not between 15 and 1000 then raise exception 'billing_identity_required';end if;
 if p_kind='tax_invoice' then
 if not issuer.vat_registered or not issuer.tax_invoice_enabled or issuer.tax_id is null then raise exception 'vat_issuance_disabled';end if;
 select * into tax from public.seller_tax_profiles where shop_id=p_shop_id and vat_status='verified';
 if not found or tax.current_version_id is null or coalesce(p_tax_id,'') !~ '^[0-9]{13}$' or right(p_tax_id,4) is distinct from tax.tax_id_last4 then raise exception 'verified_tax_identity_required';end if;
 select * into tax_version from public.tax_profile_versions where id=tax.current_version_id;
 if not found then raise exception 'verified_tax_identity_required';end if;
 recipient_name:=tax_version.legal_name;recipient_address:=tax_version.registered_address;
 end if;
 select * into invoice from public.seller_invoices where shop_id=p_shop_id and currency=p_currency and period_from=p_from and period_to=p_to and total_minor=0 and status='paid' order by issued_at,id limit 1;
 if not found then
 select coalesce(sum(fee_minor),0) into gross from public.commission_entries where shop_id=p_shop_id and currency=p_currency and (created_at at time zone 'Asia/Bangkok')::date between p_from and p_to;
 if gross<>0 then raise exception 'zero_balance_required';end if;
 insert into public.seller_invoices(shop_id,invoice_number,period_from,period_to,total_minor,gross_minor,credited_minor,currency,status,due_at,issued_at)
 values(p_shop_id,'TD-IN-'||to_char(now() at time zone 'Asia/Bangkok','YYYY')||'-'||lpad(nextval('public.tidalis_fee_invoice_seq')::text,7,'0'),p_from,p_to,0,0,0,p_currency,'paid',now(),now()) returning * into invoice;
 end if;
 if p_kind='tax_invoice' and (invoice.gross_minor<>0 or invoice.credited_minor<>0) then raise exception 'tax_zero_context_required';end if;
 select id into doc from public.platform_billing_documents where invoice_id=invoice.id and document_type=p_kind and issuance_source='zero_balance' and status='issued';
 if found then return doc;end if;
 if invoice.gross_minor=0 and invoice.credited_minor=0 then
 select coalesce(sum(fee_minor),0) into gross from public.commission_entries where shop_id=p_shop_id and currency=p_currency and (created_at at time zone 'Asia/Bangkok')::date between p_from and p_to;
 if gross<>0 then raise exception 'zero_balance_required';end if;
 end if;
 num:=(case when p_kind='receipt' then 'TD-ZR-' else 'TD-ZT-' end)||to_char(now() at time zone 'Asia/Bangkok','YYYY')||'-'||lpad(nextval((case when p_kind='receipt' then 'public.tidalis_platform_receipt_seq' else 'public.tidalis_platform_tax_seq' end)::regclass)::text,7,'0');
 insert into public.platform_billing_documents(shop_id,invoice_id,payment_id,document_type,document_number,net_minor,vat_minor,total_minor,currency,issuance_source,issuer_snapshot,recipient_snapshot,issued_by)
 values(p_shop_id,invoice.id,null,p_kind,num,0,0,0,p_currency,'zero_balance',
 jsonb_build_object('legal_name',issuer.legal_name,'address',issuer.registered_address,'tax_id',issuer.tax_id,'branch_code',issuer.branch_code,'vat_registered',issuer.vat_registered),
 jsonb_build_object('legal_name',recipient_name,'address',recipient_address,'tax_id',case when p_kind='tax_invoice' then p_tax_id end,'invoice_number',invoice.invoice_number,'period_from',p_from,'period_to',p_to,'gross_minor',invoice.gross_minor,'credited_minor',invoice.credited_minor,'replacement_for',(select id from public.platform_billing_documents where invoice_id=invoice.id and document_type=p_kind and status='void' order by issued_at desc limit 1)),auth.uid()) returning id into doc;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),p_shop_id,'zero_platform_document_issued','platform_billing_documents',doc,jsonb_build_object('invoice_id',invoice.id,'no_payment',true));
 return doc;
end $$;
create function public.issue_zero_platform_document(p_shop_id uuid,p_currency text,p_from date,p_to date,p_kind text,p_name text,p_address text,p_tax_id text) returns uuid language sql security invoker set search_path='' as $$select private.issue_zero_platform_document(p_shop_id,p_currency,p_from,p_to,p_kind,p_name,p_address,p_tax_id)$$;
revoke all on function private.issue_zero_platform_document(uuid,text,date,date,text,text,text,text),public.issue_zero_platform_document(uuid,text,date,date,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.issue_zero_platform_document(uuid,text,date,date,text,text,text,text),public.issue_zero_platform_document(uuid,text,date,date,text,text,text,text) to authenticated;
notify pgrst,'reload schema';

create or replace function private.issue_platform_document(p_payment_id uuid,p_kind text,p_recipient_tax_id text,p_net_minor bigint,p_vat_minor bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare pay public.platform_fee_payments%rowtype; inv public.seller_invoices%rowtype; issuer public.platform_issuer_profile%rowtype;
 recipient public.payment_profiles%rowtype; doc uuid; num text;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required'; end if;
 if p_kind is null or p_kind not in ('receipt','tax_invoice') then raise exception 'invalid_document';end if;
 select * into pay from public.platform_fee_payments where id=p_payment_id for update;
 if not found or pay.status<>'confirmed' or pay.confirmed_at is null or pay.confirmed_by is null then raise exception 'confirmed_payment_required'; end if;
 select id into doc from public.platform_billing_documents where payment_id=pay.id and document_type=p_kind and status='issued';
 if found then return doc; end if;
 if p_kind='tax_invoice' then return private.issue_legacy_platform_document(p_payment_id,p_kind,p_recipient_tax_id,p_net_minor,p_vat_minor);end if;
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
 jsonb_build_object('legal_name',recipient.recipient_name,'address',recipient.billing_address,'tax_id',null,'invoice_number',inv.invoice_number,'replacement_for',(select id from public.platform_billing_documents where payment_id=pay.id and document_type='receipt' and status='void' order by issued_at desc limit 1)),auth.uid()) returning id into doc;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),inv.shop_id,'platform_document_issued','platform_billing_documents',doc);
 return doc;
end $$;

-- Remove only draft metadata; submitted/sold files and accepted policy PDFs stay immutable.
create function private.remove_own_product_file(p_product uuid,p_file uuid) returns text language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype;file public.product_files%rowtype;
begin
 select * into product from public.products where id=p_product for update;
 if not found or product.status<>'draft' or not exists(select 1 from public.shops where id=product.shop_id and status in ('active','paused')) then raise exception 'product_locked';end if;
 select * into file from public.product_files where id=p_file and product_id=p_product for update;
 if not found or not(case when file.is_delivery_file then public.is_shop_member(product.shop_id,auth.uid(),array['owner','manager','artist']) else public.tidalis_seller_routine_access(product.shop_id,array['owner','manager','artist']) end) then raise exception 'seller_mfa_required';end if;
 delete from public.product_files where id=file.id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(auth.uid(),product.shop_id,'draft_product_file_removed','product_files',file.id);
 return file.file_path;
end $$;
create function private.unlinked_product_object_access(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.products p join public.shops s on s.id=p.shop_id where p_path ~ ('^shops/'||s.id::text||'/products/'||p.id::text||'/(previews|deliverables)/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|zip|pdf|psd|clip|kra)$') and p.status='draft' and s.status in ('active','paused')
 and (case when p_path like '%/previews/%' then public.tidalis_seller_routine_access(s.id,array['owner','manager','artist']) else public.is_shop_member(s.id,auth.uid(),array['owner','manager','artist']) end))
 and not exists(select 1 from public.product_files where file_path=p_path);
$$;
create policy cleanup_unlinked_product_object on storage.objects for delete to authenticated using(bucket_id='tidalis-product-files' and private.unlinked_product_object_access(name));
create function private.unlinked_policy_object_access(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.shops s where p_path ~ ('^shops/'||s.id::text||'/policies/[a-f0-9-]{36}\.pdf$') and public.tidalis_seller_routine_access(s.id,array['owner','manager']))
 and not exists(select 1 from public.shop_policy_versions where document_path=p_path)
 and not exists(select 1 from public.orders o cross join lateral jsonb_array_elements(case when jsonb_typeof(o.policy_snapshot)='array' then o.policy_snapshot else '[]'::jsonb end) x where x->>'document_path'=p_path);
$$;
create policy cleanup_unlinked_policy_object on storage.objects for delete to authenticated using(bucket_id='tidalis-policy-documents' and private.unlinked_policy_object_access(name));
create function public.remove_own_product_file(p_product uuid,p_file uuid) returns text language sql security invoker set search_path='' as $$select private.remove_own_product_file(p_product,p_file)$$;
revoke all on function private.remove_own_product_file(uuid,uuid),public.remove_own_product_file(uuid,uuid),private.unlinked_product_object_access(text),private.unlinked_policy_object_access(text) from public,anon,authenticated,service_role;
grant execute on function private.remove_own_product_file(uuid,uuid),public.remove_own_product_file(uuid,uuid),private.unlinked_product_object_access(text),private.unlinked_policy_object_access(text) to authenticated;

create function private.lock_published_mode() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status in ('published','archived') and new.publication_mode is distinct from old.publication_mode then raise exception 'Published origin is immutable';end if;return new;
end $$;
revoke all on function private.lock_published_mode() from public,anon,authenticated,service_role;
create trigger product_publication_origin before update on public.products for each row execute function private.lock_published_mode();
create trigger policy_publication_origin before update on public.shop_policy_versions for each row execute function private.lock_published_mode();
notify pgrst,'reload schema';

-- RLS is retained by the invoker query; scope adds explicit tenant restrictions.
create function public.search_order_history(p_scope text,p_shop uuid default null,p_search text default '',p_status text default 'all',p_kind text default 'all',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
 with params as (
 select '%'||pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(left(trim(coalesce(p_search,'')),80),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%' pattern,
 least(10000,greatest(1,coalesce(p_page,1))) page
 ), matching as materialized (
 select o.id,o.shop_id,o.order_kind,o.status,o.total_minor,o.subtotal_minor,o.vat_minor,o.currency,o.created_at,o.reservation_expires_at,o.commission_due_at,o.shop_snapshot
 from public.orders o cross join params
 where auth.uid() is not null and
 ((p_scope='buyer' and o.buyer_id=auth.uid()) or (p_scope='seller' and o.shop_id=p_shop and public.is_shop_member(o.shop_id,auth.uid())) or (p_scope='admin' and public.is_platform_admin(auth.uid())))
 and (p_shop is null or o.shop_id=p_shop)
 and (coalesce(p_status,'all')='all' or o.status=p_status)
 and (coalesce(p_kind,'all')='all' or o.order_kind=p_kind)
 and (o.id::text ilike params.pattern or o.shop_snapshot->>'name' ilike params.pattern or exists(select 1 from public.order_items i where i.order_id=o.id and i.item_snapshot->>'name' ilike params.pattern))
 ), page_rows as (
 select m.*,(select coalesce(jsonb_agg(jsonb_build_object('quantity',i.quantity,'item_snapshot',i.item_snapshot) order by i.id),'[]'::jsonb) from public.order_items i where i.order_id=m.id) order_items from matching m order by created_at desc,id desc limit 25 offset (select (page-1)*25 from params)
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc) from page_rows r),'[]'::jsonb),'total',(select count(*) from matching),'page',(select page from params));
$$;
revoke all on function public.search_order_history(text,uuid,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.search_order_history(text,uuid,text,text,text,integer) to authenticated;
create index orders_shop_kind_created on public.orders(shop_id,order_kind,created_at desc);
create index orders_buyer_kind_created on public.orders(buyer_id,order_kind,created_at desc);
notify pgrst,'reload schema';

create function private.public_product_stock(p_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare value jsonb;
begin
 if p_ids is null or cardinality(p_ids)>60 then raise exception 'invalid_products';end if;
 select coalesce(jsonb_object_agg(p.id::text,case when p.stock is null then null else greatest(0,p.stock-coalesce((select sum(r.quantity) from public.product_reservations r where r.product_id=p.id and r.released_at is null and r.expires_at>now()),0)) end),'{}'::jsonb) into value
 from public.products p join public.shops s on s.id=p.shop_id where p.id=any(p_ids) and p.status='published' and s.status='active';return value;
end $$;
create function public.get_public_product_stock(p_ids uuid[]) returns jsonb language sql stable security invoker set search_path='' as $$select private.public_product_stock(p_ids)$$;
revoke all on function private.public_product_stock(uuid[]),public.get_public_product_stock(uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.public_product_stock(uuid[]),public.get_public_product_stock(uuid[]) to anon,authenticated;
notify pgrst,'reload schema';

-- Only an administrator can release a suspension; release returns the shop to
-- preparation, then actual readiness checks govern reopening.
create function private.release_shop_suspension(p_shop uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'admin_mfa_required';end if;
 if length(trim(coalesce(p_reason,''))) not between 12 and 1500 then raise exception 'review_note_required';end if;
 perform 1 from public.shops where id=p_shop and status='suspended' for update;
 if not found then raise exception 'shop_unavailable';end if;
 update public.shops set status='paused' where id=p_shop;
 update public.shop_readiness_requests set status='needs_information',review_note=trim(p_reason),reviewed_by=auth.uid(),reviewed_at=now() where shop_id=p_shop;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata) values(auth.uid(),p_shop,'shop_suspension_released','shops',p_shop,jsonb_build_object('reason',trim(p_reason)));
end $$;
create function public.release_shop_suspension(p_shop uuid,p_reason text) returns void language sql security invoker set search_path='' as $$select private.release_shop_suspension(p_shop,p_reason)$$;
revoke all on function private.release_shop_suspension(uuid,text),public.release_shop_suspension(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.release_shop_suspension(uuid,text),public.release_shop_suspension(uuid,text) to authenticated;
notify pgrst,'reload schema';
