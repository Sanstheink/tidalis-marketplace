-- Tidalis Phase 5.9 / Admin operations + controlled platform-fee documents
-- Depends on 001–009. Apply on STAGING as postgres first.
-- Existing finance write gates and is_platform_admin(AAL2) remain unchanged.
begin;

alter table public.platform_announcements
  add column if not exists link_url text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists published_at timestamptz;

revoke insert,update,delete on public.platform_announcements from anon,authenticated;

create or replace function public.tidalis_save_announcement(
 p_id uuid, p_title text, p_message text, p_link_url text,
 p_ribbon boolean, p_popup boolean, p_priority integer,
 p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'Admin AAL2 required'; end if;
 if length(btrim(coalesce(p_title,''))) not between 5 and 160
    or length(btrim(coalesce(p_message,''))) not between 10 and 4000
    or not (p_ribbon or p_popup)
    or p_priority is null or p_priority not between -100 and 100
    or (p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at)
 then raise exception 'Invalid announcement'; end if;
 if nullif(btrim(coalesce(p_link_url,'')),'') is not null and
    not ((left(p_link_url,1)='/' and left(p_link_url,2)<>'//'
          and p_link_url !~ '[[:space:]]' and strpos(p_link_url,chr(92))=0)
         or p_link_url ~ '^https://[^[:space:]]+$')
 then raise exception 'Invalid announcement link'; end if;
 if p_id is null then
  insert into public.platform_announcements
   (title,message,link_url,show_ribbon,show_popup,priority,starts_at,ends_at,status,created_by,updated_by)
  values (btrim(p_title),btrim(p_message),nullif(btrim(p_link_url),''),p_ribbon,p_popup,p_priority,
          p_starts_at,p_ends_at,'draft',auth.uid(),auth.uid())
  returning id into v_id;
 else
  update public.platform_announcements
     set title=btrim(p_title),message=btrim(p_message),link_url=nullif(btrim(p_link_url),''),
         show_ribbon=p_ribbon,show_popup=p_popup,priority=p_priority,
         starts_at=p_starts_at,ends_at=p_ends_at,updated_at=now(),
         updated_by=auth.uid(),version=version+1
   where id=p_id and status='draft'
   returning id into v_id;
  if v_id is null then raise exception 'Draft not found or already published'; end if;
 end if;
 insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
 values(auth.uid(),'announcement_saved','platform_announcements',v_id,jsonb_build_object('draft',true));
 return v_id;
end; $$;

create or replace function public.tidalis_change_announcement_status(p_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare v_old public.platform_announcements%rowtype;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'Admin AAL2 required'; end if;
 if p_action not in ('publish','archive') then raise exception 'Invalid action'; end if;
 select * into v_old from public.platform_announcements where id=p_id for update;
 if not found then raise exception 'Announcement not found'; end if;
 if p_action='publish' then
  if v_old.status<>'draft' or not (v_old.show_ribbon or v_old.show_popup)
     or (v_old.ends_at is not null and v_old.ends_at<=now()) then
    raise exception 'Announcement is not publishable';
  end if;
  update public.platform_announcements set status='published',published_at=now(),
   updated_at=now(),updated_by=auth.uid() where id=p_id;
 else
  if v_old.status='archived' then raise exception 'Already archived'; end if;
  update public.platform_announcements set status='archived',updated_at=now(),
   updated_by=auth.uid() where id=p_id;
 end if;
 insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
 values(auth.uid(),'announcement_'||p_action,'platform_announcements',p_id,'{}'::jsonb);
end; $$;

revoke all on function public.tidalis_save_announcement(uuid,text,text,text,boolean,boolean,integer,timestamptz,timestamptz) from public,anon;
grant execute on function public.tidalis_save_announcement(uuid,text,text,text,boolean,boolean,integer,timestamptz,timestamptz) to authenticated;
revoke all on function public.tidalis_change_announcement_status(uuid,text) from public,anon;
grant execute on function public.tidalis_change_announcement_status(uuid,text) to authenticated;

-- Registry is write-only through authorized issuance RPCs; never fabricate order/payment rows.
create table if not exists public.platform_issuer_profile (
 id boolean primary key default true check(id),
 legal_name text not null check(length(btrim(legal_name))>=3),
 tax_id text not null check(tax_id ~ '^[0-9]{13}$'),
 registered_address text not null check(length(btrim(registered_address))>=15),
 branch_code text not null default '00000' check(branch_code ~ '^[0-9]{5}$'),
 vat_registered boolean not null default false,
 tax_invoice_enabled boolean not null default false,
 vat_rate_bp integer not null default 700 check(vat_rate_bp between 0 and 3000),
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null
);
alter table public.platform_issuer_profile enable row level security;
create policy platform_issuer_admin_read on public.platform_issuer_profile for select to authenticated
 using(public.is_platform_admin((select auth.uid())));
revoke all on public.platform_issuer_profile from anon,authenticated;
grant select on public.platform_issuer_profile to authenticated;

create sequence if not exists public.tidalis_platform_receipt_seq;
create sequence if not exists public.tidalis_platform_tax_seq;

create table if not exists public.platform_billing_documents (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id),
 invoice_id uuid not null references public.seller_invoices(id),
 payment_id uuid not null references public.platform_fee_payments(id),
 document_type text not null check(document_type in ('receipt','tax_invoice')),
 document_number text not null unique,
 net_minor bigint not null check(net_minor>=0),
 vat_minor bigint not null check(vat_minor>=0),
 total_minor bigint not null check(total_minor>0),
 currency text not null default 'THB' check(currency='THB'),
 issuer_snapshot jsonb not null,
 recipient_snapshot jsonb not null,
 status text not null default 'issued' check(status in ('issued','void')),
 issued_by uuid not null references auth.users(id),
 issued_at timestamptz not null default now(),
 voided_by uuid references auth.users(id),
 voided_at timestamptz,
 void_reason text,
 unique(payment_id,document_type),
 check(net_minor+vat_minor=total_minor)
);
create index if not exists platform_billing_shop_idx on public.platform_billing_documents(shop_id,issued_at desc);
alter table public.platform_billing_documents enable row level security;
create policy platform_billing_read on public.platform_billing_documents for select to authenticated
 using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager','finance']));
revoke all on public.platform_billing_documents from anon,authenticated;
grant select on public.platform_billing_documents to authenticated;

create or replace function public.tidalis_issue_platform_document(
 p_payment_id uuid, p_kind text, p_recipient_tax_id text default null,
 p_net_minor bigint default null, p_vat_minor bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_pay public.platform_fee_payments%rowtype;
 v_invoice public.seller_invoices%rowtype;
 v_issuer public.platform_issuer_profile%rowtype;
 v_recipient public.tax_profile_versions%rowtype;
 v_tax public.seller_tax_profiles%rowtype;
 v_id uuid; v_num text; v_net bigint; v_vat bigint;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'Admin AAL2 required'; end if;
 if p_kind is null or p_kind not in ('receipt','tax_invoice') then raise exception 'Invalid document type'; end if;
 select * into v_pay from public.platform_fee_payments where id=p_payment_id for update;
 if not found or v_pay.status<>'confirmed' or v_pay.confirmed_at is null or v_pay.confirmed_by is null then
   raise exception 'Only verified confirmed fee payments may be documented'; end if;
 select * into v_invoice from public.seller_invoices where id=v_pay.invoice_id for share;
 if not found or v_invoice.status in ('draft','void') or v_invoice.total_minor<v_pay.amount_minor then
   raise exception 'Invoice is not eligible'; end if;
 select * into v_issuer from public.platform_issuer_profile where id=true;
 if not found or v_issuer.approved_at is null then raise exception 'Verified platform issuer profile required'; end if;
 select * into v_tax from public.seller_tax_profiles where shop_id=v_invoice.shop_id;
 if not found or v_tax.current_version_id is null then raise exception 'Verified seller billing identity required'; end if;
 select * into v_recipient from public.tax_profile_versions where id=v_tax.current_version_id;
 if not found then raise exception 'Verified seller tax profile version missing'; end if;
 if p_kind='tax_invoice' then
   if not v_issuer.vat_registered or not v_issuer.tax_invoice_enabled then raise exception 'VAT issuance disabled'; end if;
   if coalesce(p_recipient_tax_id,'') !~ '^[0-9]{13}$'
      or v_tax.tax_id_last4 is null or length(v_tax.tax_id_last4)<>4 or right(p_recipient_tax_id,4)<>v_tax.tax_id_last4 then
     raise exception 'Recipient tax ID not verified'; end if;
   v_net:=p_net_minor; v_vat:=p_vat_minor;
   if v_net is null or v_net<=0 or v_vat is null or v_vat<0 or
       v_net+v_vat<>v_pay.amount_minor or
       v_vat<>round(v_net::numeric*v_issuer.vat_rate_bp/10000)::bigint then
     raise exception 'VAT calculation does not reconcile'; end if;
   v_num:='TD-TX-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.tidalis_platform_tax_seq')::text,7,'0');
 else
   v_net:=v_pay.amount_minor;v_vat:=0;
   v_num:='TD-RC-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.tidalis_platform_receipt_seq')::text,7,'0');
 end if;
 insert into public.platform_billing_documents
 (shop_id,invoice_id,payment_id,document_type,document_number,net_minor,vat_minor,total_minor,
  issuer_snapshot,recipient_snapshot,issued_by)
 values(v_invoice.shop_id,v_invoice.id,v_pay.id,p_kind,v_num,v_net,v_vat,v_pay.amount_minor,
   jsonb_build_object('legal_name',v_issuer.legal_name,'tax_id',v_issuer.tax_id,
     'address',v_issuer.registered_address,'branch_code',v_issuer.branch_code,
     'vat_rate_bp',v_issuer.vat_rate_bp,'vat_registered',v_issuer.vat_registered),
   jsonb_build_object('legal_name',v_recipient.legal_name,'address',v_recipient.registered_address,
      'branch_code',v_recipient.branch_code,'tax_id',case when p_kind='tax_invoice' then p_recipient_tax_id else null end),
   auth.uid()) returning id into v_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
 values(auth.uid(),v_invoice.shop_id,'platform_document_issued','platform_billing_documents',v_id,
        jsonb_build_object('document_type',p_kind,'payment_id',p_payment_id,'number',v_num));
 return v_id;
end; $$;

-- Immutable issued financial snapshots. Only status->void by authorized RPC is possible.
create or replace function public.tidalis_lock_platform_document()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Financial document deletion forbidden'; end if;
 if old.status<>'issued' or new.status<>'void' or
    (to_jsonb(new)-'status'-'voided_by'-'voided_at'-'void_reason') <>
    (to_jsonb(old)-'status'-'voided_by'-'voided_at'-'void_reason') then
   raise exception 'Financial document snapshots are immutable';
 end if;
 return new;
end; $$;
drop trigger if exists tidalis_immutable_platform_billing on public.platform_billing_documents;
create trigger tidalis_immutable_platform_billing before update or delete
 on public.platform_billing_documents for each row execute function public.tidalis_lock_platform_document();

create or replace function public.tidalis_void_platform_document(p_document_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_doc public.platform_billing_documents%rowtype;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'Admin AAL2 required'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 15 and 1000 then raise exception 'Void reason required'; end if;
 select * into v_doc from public.platform_billing_documents where id=p_document_id for update;
 if not found or v_doc.status<>'issued' then raise exception 'Document cannot be voided'; end if;
 if v_doc.document_type='tax_invoice' then raise exception 'Tax invoice reversal requires reviewed credit-note workflow'; end if;
 update public.platform_billing_documents set status='void',voided_by=auth.uid(),
  voided_at=now(),void_reason=btrim(p_reason) where id=p_document_id;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
 values(auth.uid(),v_doc.shop_id,'platform_document_voided','platform_billing_documents',p_document_id,
 jsonb_build_object('reason',btrim(p_reason),'number',v_doc.document_number));
end; $$;

revoke all on function public.tidalis_issue_platform_document(uuid,text,text,bigint,bigint) from public,anon;
grant execute on function public.tidalis_issue_platform_document(uuid,text,text,bigint,bigint) to authenticated;
revoke all on function public.tidalis_void_platform_document(uuid,text) from public,anon;
grant execute on function public.tidalis_void_platform_document(uuid,text) to authenticated;

commit;
