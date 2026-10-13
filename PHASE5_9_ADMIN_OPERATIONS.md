# Phase 5.9 — Admin Operations & Finance (Staging first)
Baseline: committed Tidalis project with migrations 001–009 and Seller Step-up MFA.
Patch changes Admin pages and adds migration 010, root app/template.tsx, and admin finance components.

## Functional scope
- Admin AAL2 Announcement Manager: create/edit draft; schedule Asia/Bangkok; publish, archive; Audit Logs; Ribbon and homepage Popup.
- Admin AAL2 Sales: up to 100 real orders filtered by shop/status; confirmed payment proof amounts; never demo catalog or unconditional GMV.
- Admin AAL2 Finance: real seller invoices and commission entries, confirmed fee-payment records.
- Admin AAL2 Document Registry: issue platform-fee receipt for a VERIFIED confirmed fee payment only, with approved platform issuer and seller billing identity; optional tax invoice path disabled by default until verified VAT profile, rate, invoice data and tax compliance review.
- Admin AAL2 Shop documents: view seller-issued document metadata/snapshots; no unsafe public signed file URLs.
- Database: no general INSERT/UPDATE/DELETE grants on finance tables; SECURITY DEFINER RPC validates MFA, paid transaction, snapshot, uniqueness; immutable issued docs; audit trail.

**IMPORTANT:** This is NOT a completed order/payment processing system. Phase 002 deliberately withheld payment and invoice mutation flows. If there are no confirmed real fee payments, no receipt can be issued. Do not manufacture payments in Production just to activate buttons.
Printable HTML document can be saved as PDF using browser Print. It is NOT certified e-Tax Invoice or digitally signed e-Tax. Legal/tax review and compliant issuance workflow required.

## Installation in VS Code
1. Ensure committed clean worktree. Save the downloaded .patch in ~/Downloads.
2. git switch -c feat/phase5-9-admin-operations
3. git apply --check ~/Downloads/tidalis-phase5-9-admin-operations.patch
4. git apply ~/Downloads/tidalis-phase5-9-admin-operations.patch
5. node scripts/test-phase5-9.mjs
6. npm install && npm run typecheck && npm run build
7. git add . && git diff --cached --check && git commit -m "feat(admin): announcements sales and controlled fee documents"
8. git push -u origin feat/phase5-9-admin-operations
9. Open PR, Preview must point to Staging. Never assume Vercel Preview uses Staging without checking configured NEXT_PUBLIC_SUPABASE_URL.

## Staging migration
Run migrations 001–009 first and confirm complete. SQL Editor must use postgres not authenticated.
Backup and verify restore plan. Apply supabase/migrations/010_admin_operations_finance.sql once.
Review all preflight and migration statements before executing. No test records in Production.
If app/template.tsx already exists, STOP at git apply --check and integrate manually rather than overwriting.

## Configure verified platform legal identity (trusted SQL editor ONLY)
No demo values are inserted by migration. This one-row table cannot be modified by authenticated API clients.
After legal/accounting staff confirm legal_name, 13-digit taxpayer number, registered address, approved admin UUID and actual VAT registration status:
  insert into public.platform_issuer_profile(
   id,legal_name,tax_id,registered_address,branch_code,
   vat_registered,tax_invoice_enabled,vat_rate_bp,approved_by,approved_at)
  values (true,'VERIFIED LEGAL NAME','VERIFIED 13 DIGIT TAX ID','VERIFIED FULL ADDRESS',
   '00000',false,false,700,'VERIFIED ADMIN USER UUID',now());
Do not literally run the placeholder statement. Tax invoice MUST remain disabled until a separate legal approval.
Seller tax profile must have an approved tax_profile_versions current_version_id.
Any displayed payment must be status=confirmed, confirmed_at and confirmed_by set by a trusted reconciliation process.

## QA Staging
- Admin AAL1 -> /admin denied/step-up; Admin AAL2 -> all added pages.
- Buyer and Seller must NOT invoke tidalis_save_announcement, tidalis_change_announcement_status, tidalis_issue_platform_document, tidalis_void_platform_document through direct RPC.
- Announce: create draft -> not visible anon; publish future -> not visible until starts_at; publish current -> Ribbon and Popup; archive -> disappears. XSS text is escaped and links only /relative or https.
- Anonymous users cannot see admin drafts, financial tables, issuer profile, receipt registry.
- Sales list: no phantom demo orders; filter by shop; payment status NOT confirmed must not enter confirmed total.
- Finance: confirmed payment missing one of confirmed_by/confirmed_at cannot create receipt; duplicate receipt for one payment must fail; an unreconciled or void invoice must fail; missing platform issuer or seller billing identity must fail.
- Tax invoice must fail while tax_invoice_enabled=false. When enabled by trusted operator, validate full recipient ID, VAT split reconciliation and applicable law before first real issue.
- Immutable issued document: direct authenticated update/delete fails; void receipt with reason is audited; tax invoice correction requires approved accounting workflow.
- PDF via Print is NOT regulatory e-Tax. Do not market as certified electronic tax invoice.
- Query audit_logs for announcement_saved/publish/archive and platform_document_issued/voided.
- Run node scripts/test-phase5-9.mjs, npm run typecheck, npm run build and test browser + PostgREST RPC directly.

## Production rollout
1. Staging acceptance & security review sign-off including direct RPC negatives, data privacy and fiscal rules.
2. Production backup + restore verification. Capture DB schema diff and ensure 001–009 complete.
3. Reviewed Migration 010 on Production using postgres role, no fake issuer or VAT activation.
4. Merge Preview into production after Staging release passes.
5. Test live admin MFA AAL2, public announcements, finance read-only, capture logs.
6. Configure issuer profile only after verification and enable document issuance deliberately.

## Rollback
Deploy previous web commit first. For emergency RPC freeze apply supabase/rollback/010_admin_operations_finance.rollback.sql. DO NOT DROP financial document and audit tables. Rolling back code alone does not undo published announcements; archive announcements using AAL2 RPC before freeze.
