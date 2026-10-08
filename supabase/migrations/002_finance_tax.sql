-- Marketplace Tidalis / Phase 2 finance and tax schema.
-- All money stored in integer minor units (THB satang), no floating-point arithmetic.
-- Tables only: payment/refund mutation functions intentionally withheld pending reconciliation design.

create table if not exists public.seller_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops(id),
  vat_status text not null default 'not_registered' check(vat_status in ('not_registered','submitted','under_review','verified','needs_correction','suspended')),
  legal_name text,
  tax_id_last4 text,
  verified_at timestamptz,
  current_version_id uuid
);
create table if not exists public.tax_profile_versions (
  id uuid primary key default gen_random_uuid(),
  tax_profile_id uuid not null references public.seller_tax_profiles(id),
  legal_name text not null,
  registered_address text not null,
  tax_id_encrypted_ref text not null,
  branch_code text not null,
  approved_logo_private_path text,
  effective_from timestamptz not null,
  effective_until timestamptz,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now()
);
alter table public.seller_tax_profiles add constraint tax_profile_current_version_fk foreign key(current_version_id) references public.tax_profile_versions(id);
create table if not exists public.vat_verification_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  requested_legal_name text not null,
  requested_data jsonb not null default '{}'::jsonb,
  private_document_path text,
  status text not null default 'submitted' check(status in ('submitted','under_review','needs_correction','approved','rejected')),
  submitted_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create table if not exists public.tax_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  base_version_id uuid references public.tax_profile_versions(id),
  changes jsonb not null,
  reason text not null,
  private_evidence_path text,
  status text not null default 'submitted' check(status in ('submitted','under_review','needs_correction','approved','rejected')),
  submitted_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  buyer_id uuid not null references auth.users(id),
  status text not null default 'pending' check(status in ('pending','awaiting_quote','awaiting_acceptance','awaiting_payment','payment_review','paid','fulfilling','fulfilled','cancelled')),
  subtotal_minor bigint not null check(subtotal_minor>=0),
  vat_minor bigint not null default 0 check(vat_minor>=0),
  total_minor bigint not null check(total_minor>=0),
  currency text not null default 'THB' check(currency='THB'),
  buyer_note text,
  policy_snapshot jsonb not null,
  tax_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists orders_shop_idx on public.orders(shop_id,created_at desc);
create index if not exists orders_buyer_idx on public.orders(buyer_id,created_at desc);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  product_id uuid not null references public.products(id),
  quantity integer not null check(quantity>0),
  usage_type text not null check(usage_type in ('personal','commercial')),
  price_minor bigint not null check(price_minor>=0),
  item_snapshot jsonb not null
);
create table if not exists public.commission_brief_versions (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id),
  version integer not null check(version>0),
  author_id uuid not null references auth.users(id),
  content text not null,
  created_at timestamptz not null default now(),
  unique(order_item_id,version)
);
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  shop_id uuid not null references public.shops(id),
  amount_minor bigint not null check(amount_minor>0),
  method text not null check(method in ('promptpay_static','bank_transfer','truemoney_manual')),
  status text not null default 'pending' check(status in ('pending','proof_submitted','under_review','confirmed','rejected','expired')),
  proof_private_path text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_one_confirmed_per_order on public.payment_transactions(order_id) where status='confirmed';
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  shop_id uuid not null references public.shops(id),
  buyer_id uuid not null references auth.users(id),
  amount_minor bigint not null check(amount_minor>0),
  reason text not null,
  status text not null default 'requested' check(status in ('requested','under_review','approved','rejected','processing','completed','failed')),
  created_at timestamptz not null default now()
);
create table if not exists public.refund_transactions (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null references public.refund_requests(id),
  amount_minor bigint not null check(amount_minor>0),
  proof_private_path text,
  status text not null default 'processing' check(status in ('processing','reported_sent','buyer_confirmed','disputed','failed')),
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now()
);

create table if not exists public.commission_fee_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id),
  category text,
  rate_basis_points integer not null check(rate_basis_points between 0 and 10000),
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  shop_id uuid not null references public.shops(id),
  fee_rule_id uuid references public.commission_fee_rules(id),
  rate_basis_points integer not null,
  fee_base_minor bigint not null check(fee_base_minor>=0),
  fee_minor bigint not null check(fee_minor>=0),
  created_at timestamptz not null default now()
);
create table if not exists public.commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  commission_entry_id uuid not null references public.commission_entries(id),
  refund_request_id uuid not null unique references public.refund_requests(id),
  adjustment_minor bigint not null check(adjustment_minor>=0),
  created_at timestamptz not null default now()
);
create table if not exists public.seller_invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  invoice_number text not null unique,
  period_from date not null,period_to date not null,
  total_minor bigint not null check(total_minor>=0),
  status text not null default 'issued' check(status in ('draft','issued','partial','paid','overdue','void')),
  due_at timestamptz,
  issued_at timestamptz
);
create table if not exists public.seller_invoice_items (
  invoice_id uuid not null references public.seller_invoices(id),
  commission_entry_id uuid not null references public.commission_entries(id),
  primary key(invoice_id,commission_entry_id)
);
create table if not exists public.platform_fee_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.seller_invoices(id),
  amount_minor bigint not null check(amount_minor>0),
  status text not null default 'proof_submitted',
  proof_private_path text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz
);
create table if not exists public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  order_id uuid not null references public.orders(id),
  document_type text not null check(document_type in ('receipt','full_tax_invoice','credit_note')),
  document_number text not null,
  status text not null default 'issued' check(status in ('draft','issued','void','superseded')),
  tax_profile_version_id uuid references public.tax_profile_versions(id),
  document_snapshot jsonb not null,
  pdf_private_path text,
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz,
  unique(shop_id,document_type,document_number)
);
create table if not exists public.download_entitlements (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id),
  order_item_id uuid not null unique references public.order_items(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.finance_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  transaction_group uuid not null,
  account text not null,
  debit_minor bigint not null default 0 check(debit_minor>=0),
  credit_minor bigint not null default 0 check(credit_minor>=0),
  reference_type text not null,
  reference_id uuid not null,
  created_at timestamptz not null default now(),
  check ((debit_minor>0 and credit_minor=0) or (credit_minor>0 and debit_minor=0))
);

-- RLS is deliberately DENY-BY-DEFAULT for all write operations involving payments/tax/receipts.
-- Future SECURITY DEFINER RPCs must implement order ownership, shop membership, amount verification,
-- idempotency, proof validation, VAT eligibility, and ledger balancing within transactions.
alter table public.seller_tax_profiles enable row level security;
alter table public.tax_profile_versions enable row level security;
alter table public.vat_verification_requests enable row level security;
alter table public.tax_profile_change_requests enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.commission_brief_versions enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.refund_requests enable row level security;
alter table public.refund_transactions enable row level security;
alter table public.commission_fee_rules enable row level security;
alter table public.commission_entries enable row level security;
alter table public.commission_adjustments enable row level security;
alter table public.seller_invoices enable row level security;
alter table public.seller_invoice_items enable row level security;
alter table public.platform_fee_payments enable row level security;
alter table public.financial_documents enable row level security;
alter table public.download_entitlements enable row level security;
alter table public.finance_ledger_entries enable row level security;

create policy tax_profiles_read on public.seller_tax_profiles for select to authenticated using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']));
create policy tax_versions_read on public.tax_profile_versions for select to authenticated using(public.is_platform_admin((select auth.uid())) or exists(select 1 from public.seller_tax_profiles t where t.id=tax_profile_id and public.is_shop_member(t.shop_id,(select auth.uid()),array['owner'])));
create policy vat_requests_read on public.vat_verification_requests for select to authenticated using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']));
create policy tax_change_requests_read on public.tax_profile_change_requests for select to authenticated using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']));
create policy orders_read on public.orders for select to authenticated using(buyer_id=(select auth.uid()) or public.is_shop_member(shop_id,(select auth.uid())) or public.is_platform_admin((select auth.uid())));
create policy order_items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=(select auth.uid()) or public.is_shop_member(o.shop_id,(select auth.uid())) or public.is_platform_admin((select auth.uid())))));
create policy briefs_read on public.commission_brief_versions for select to authenticated using(exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.id=order_item_id and (o.buyer_id=(select auth.uid()) or public.is_shop_member(o.shop_id,(select auth.uid())) or public.is_platform_admin((select auth.uid())))));
create policy payment_read on public.payment_transactions for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=(select auth.uid()) or public.is_shop_member(o.shop_id,(select auth.uid()),array['owner','manager','finance']) or public.is_platform_admin((select auth.uid())))));
create policy refunds_read on public.refund_requests for select to authenticated using(buyer_id=(select auth.uid()) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager','finance','support']) or public.is_platform_admin((select auth.uid())));
create policy refund_tx_read on public.refund_transactions for select to authenticated using(exists(select 1 from public.refund_requests r where r.id=refund_request_id and (r.buyer_id=(select auth.uid()) or public.is_shop_member(r.shop_id,(select auth.uid()),array['owner','manager','finance']) or public.is_platform_admin((select auth.uid())))));
create policy fee_rules_read on public.commission_fee_rules for select to authenticated using(shop_id is null or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager','finance']) or public.is_platform_admin((select auth.uid())));
create policy commissions_read on public.commission_entries for select to authenticated using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager','finance']));
create policy commission_adjustments_read on public.commission_adjustments for select to authenticated using(exists(select 1 from public.commission_entries c where c.id=commission_entry_id and (public.is_platform_admin((select auth.uid())) or public.is_shop_member(c.shop_id,(select auth.uid()),array['owner','manager','finance']))));
create policy invoices_read on public.seller_invoices for select to authenticated using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager','finance']));
create policy invoice_items_read on public.seller_invoice_items for select to authenticated using(exists(select 1 from public.seller_invoices s where s.id=invoice_id and (public.is_platform_admin((select auth.uid())) or public.is_shop_member(s.shop_id,(select auth.uid()),array['owner','manager','finance']))));
create policy fee_payments_read on public.platform_fee_payments for select to authenticated using(exists(select 1 from public.seller_invoices s where s.id=invoice_id and (public.is_platform_admin((select auth.uid())) or public.is_shop_member(s.shop_id,(select auth.uid()),array['owner','manager','finance']))));
create policy documents_read on public.financial_documents for select to authenticated using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager','finance']) or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=(select auth.uid())));
create policy entitlements_read on public.download_entitlements for select to authenticated using(buyer_id=(select auth.uid()) or public.is_platform_admin((select auth.uid())));
create policy ledger_read on public.finance_ledger_entries for select to authenticated using(public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','finance']));

grant select on public.seller_tax_profiles,public.tax_profile_versions,
  public.vat_verification_requests,public.tax_profile_change_requests,
  public.orders,public.order_items,public.commission_brief_versions,
  public.payment_transactions,public.refund_requests,public.refund_transactions,
  public.commission_fee_rules,public.commission_entries,public.commission_adjustments,
  public.seller_invoices,public.seller_invoice_items,public.platform_fee_payments,
  public.financial_documents,public.download_entitlements,public.finance_ledger_entries
  to authenticated;
-- NO direct INSERT/UPDATE/DELETE grants for these financial or identity-verification tables.
