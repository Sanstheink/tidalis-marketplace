-- Repair the two columns omitted when historical Phase 4 SQL was applied manually.
-- Additive and idempotent over a fresh 001–010 installation. No history backfill.
alter table public.seller_applications
  add column if not exists agreement_version_id uuid references public.platform_policy_versions(id),
  add column if not exists review_note text;
create index if not exists seller_applications_agreement_version_idx
  on public.seller_applications(agreement_version_id);
