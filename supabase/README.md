# Database security and migration notes

1. **These migrations are NOT applied to a live project.** Review schema, RLS, grants, tax fields, required legal notices and storage policies before applying in a staging Supabase project.
2. Run `001_identity_catalog.sql` first, then `002_finance_tax.sql` (a change to the second migration should be reviewed before use). Do not run raw SQL against production without a rollback plan.
3. Bootstrap a single admin with a verified `auth.users.id`, through an authorized SQL/admin operator only. Never create a public route that promotes a user to admin.
4. Seller approval is handled atomically by the restricted `approve_seller_application` RPC. The authenticated admin role is checked *inside* the function.
5. **Do not collect real payments or issue official financial documents yet.** Order creation, payment proof upload, manual confirmation, commission accrual, finance ledger balancing, refund and tax-document issuance need separately reviewed transactional RPCs. Current RLS intentionally denies direct client writes for those tables.
6. Keep VAT evidence, buyer artwork references, payment slips and downloadable files in PRIVATE buckets. Create and test bucket policies before upload integration.
7. For administrative and financial operations, enforce MFA (`aal2`) and step-up security in middleware/server functions/RLS before production. A browser-only guard is insufficient.
8. Define finance documents and VAT rule validation with a Thailand tax professional. A generated PDF is not automatically an approved e-Tax invoice.
9. Legal policy pages are drafting placeholders and must not be used as binding agreements before approved publication with versioned acceptance.
10. Add automated RLS integration tests with at least 2 shops and 2 buyers to verify isolation before any production launch.

### Phase 3 (new)

Review and apply `003_phase3_auth_hardening.sql` **after** 001 and 002 in a STAGING project. Its role helper replacements intentionally require `auth.jwt()->>'aal' = 'aal2'` for seller-private and platform-admin RLS operations, including the seller-approval RPC. They prevent raw PostgREST requests with an AAL1 session from bypassing MFA just because a screen hides a button. The user's own role and membership discovery remain readable via existing owner-only SELECT RLS so the workspace picker can show a login user's available spaces. Read `PHASE3_SUPABASE_VERCEL.md` before applying.
