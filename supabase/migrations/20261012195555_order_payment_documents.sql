-- Additive: legacy payments retain the seller-issued receipt path.
create table public.order_receipt_recipients (
 order_id uuid primary key references public.orders(id),
 name text not null check(length(trim(name)) between 3 and 160),
 address text check(length(address)<=1000),
 created_at timestamptz not null default now()
);
alter table public.order_receipt_recipients enable row level security;
revoke all on public.order_receipt_recipients from anon,authenticated;
grant select on public.order_receipt_recipients to authenticated;
create policy receipt_recipient_read on public.order_receipt_recipients for select to authenticated using (
 exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=(select auth.uid()) or public.is_shop_member(o.shop_id,(select auth.uid()),array['owner','finance']) or public.is_platform_admin((select auth.uid()))))
);
create function private.lock_receipt_recipient() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Receipt recipient is immutable';end $$;
create trigger receipt_recipient_immutable before update or delete on public.order_receipt_recipients for each row execute function private.lock_receipt_recipient();

-- Name/address and the attempt are committed together under the order lock.
create function private.create_order_payment(p_order uuid,p_method text,p_name text,p_address text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;r public.order_receipt_recipients%rowtype;a public.payment_attempts%rowtype;v uuid;
begin
 select * into o from public.orders where id=p_order and buyer_id=auth.uid() for update;
 if not found then raise exception 'order_unavailable';end if;
 select * into r from public.order_receipt_recipients where order_id=o.id;
 if found then
  if r.name is distinct from trim(p_name) or coalesce(r.address,'') is distinct from trim(coalesce(p_address,'')) then raise exception 'receipt_recipient_locked';end if;
 else
  if length(trim(coalesce(p_name,''))) not between 3 and 160 or length(coalesce(p_address,''))>1000 then raise exception 'receipt_recipient_required';end if;
  -- Existing attempts keep their original, manual receipt workflow.
  if exists(select 1 from public.payment_attempts where order_id=o.id) then raise exception 'payment_already_started';end if;
  insert into public.order_receipt_recipients(order_id,name,address) values(o.id,trim(p_name),nullif(trim(p_address),''));
 end if;
 v:=private.create_payment_attempt(o.id,null,p_method);
 select * into a from public.payment_attempts where id=v;
 if length(trim(coalesce(a.recipient_snapshot->>'billingAddress','')))<15 then raise exception 'billing_identity_required';end if;
 return v;
end $$;
create function public.create_order_payment(p_order uuid,p_method text,p_name text,p_address text) returns uuid language sql security invoker set search_path='' as $$select private.create_order_payment(p_order,p_method,p_name,p_address)$$;
revoke all on function public.create_order_payment(uuid,text,text,text),private.create_order_payment(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_order_payment(uuid,text,text,text),private.create_order_payment(uuid,text,text,text) to authenticated;

create function private.create_shop_receipt(p_order uuid,p_name text,p_address text,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
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
 'recipient',jsonb_build_object('name',trim(p_name),'address',nullif(trim(p_address),''))),p_actor,now()) returning id into v;
 insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id) values(p_actor,o.shop_id,'shop_receipt_issued','financial_documents',v);return v;
end $$;

create or replace function private.issue_shop_receipt(p_order uuid,p_name text,p_address text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or not public.is_shop_member(o.shop_id,auth.uid(),array['owner','finance']) then raise exception 'finance_mfa_required';end if;
 return private.create_shop_receipt(o.id,p_name,p_address,auth.uid());
end $$;
create function private.receipt_on_confirmed_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.order_receipt_recipients%rowtype;
begin
 if new.order_id is not null and new.status='confirmed' and old.status is distinct from 'confirmed' then
  select * into r from public.order_receipt_recipients where order_id=new.order_id;
  if found then perform private.create_shop_receipt(new.order_id,r.name,r.address,new.confirmed_by);end if;
 end if;
 return new;
end $$;
create trigger issue_confirmed_order_receipt after update of status on public.payment_attempts for each row execute function private.receipt_on_confirmed_payment();

-- Store the shop's original accepted quotation once; downloads render copies.
alter table public.commission_quotes add column document_snapshot jsonb;
create function private.snapshot_accepted_quote() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
 if old.document_snapshot is not null then
  if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Accepted quotation is immutable';end if;
 elsif new.status='accepted' then
  select * into o from public.orders where id=new.order_id;
  new.document_snapshot:=jsonb_build_object('shop',o.shop_snapshot,'order_id',o.id,'buyer_id',o.buyer_id,'currency',o.currency,
   'number','TD-Q-'||new.id::text,'version',new.version,'brief_version',new.brief_version,'amount_minor',new.amount_minor,
   'scope',new.scope,'license_terms',new.license_terms,'delivery_days',new.delivery_days,'revisions',new.revisions,
   'issued_at',new.created_at,'accepted_at',new.accepted_at,'expires_at',new.expires_at);
 end if;
 return new;
end $$;
-- Run after quote_immutable validates the original quote fields.
create trigger zz_accepted_quote_snapshot before update on public.commission_quotes for each row execute function private.snapshot_accepted_quote();
revoke all on function private.create_shop_receipt(uuid,text,text,uuid),private.receipt_on_confirmed_payment(),private.snapshot_accepted_quote(),private.lock_receipt_recipient() from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
