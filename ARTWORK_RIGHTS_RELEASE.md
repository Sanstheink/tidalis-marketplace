# Artwork rights documents — release and verification

This patch adds seller-issued License Certificates and Copyright Assignment Agreements to the order workflow, and redesigns downloadable quotations, receipts, refund credit notes, cancellation documents and licence certificates with a shared formal A4 layout. It is stacked on [PR #10](https://github.com/Sanstheink/tidalis-marketplace/pull/10); implementation is in [PR #12](https://github.com/Sanstheink/tidalis-marketplace/pull/12).

## Customer and seller behavior

- Buyers request copyright assignment in the Commission brief or order chat. Sellers can also record an agreement made through an external channel. A request or chat message alone never becomes a signed transfer.
- After confirmed payment, an issued receipt and delivery acceptance, the shop owner or manager with MFA prepares either document. The buyer's name and optional tax ID come from the receipt snapshot. Sellers select personal/commercial/merchandise use, non-exclusive/sole/exclusive rights, territory, duration, scope and the agreement reference, and upload a private artwork thumbnail.
- The seller reads the published standard terms, enters their signer name and explicitly confirms the offer. The buyer reads the same frozen document, enters their own signer name and explicitly accepts its exact content hash. Effective time is the actual acceptance time, never a fabricated payment-time signature.
- Signed electronic originals appear beside the receipt on the buyer's order detail. Both signed documents remain available when a subsequent assignment supersedes a licence; superseded originals are labelled as history. Unsigned offers cannot be downloaded as executed originals.
- QR codes open the private agreement page; the buyer or authorized shop member must sign in. An unrelated account, including a platform administrator who is not a party, cannot download these originals.
- Pending offers can be withdrawn by the seller or declined by the buyer and then reissued. Signed content and signature history cannot be edited or deleted. A changed agreement must preserve the original record. This release does not implement a separate post-assignment transfer-back workflow.
- Full refunds revoke purchased work access and end the licence under the draft terms; originals remain available as historical evidence with a refund notice. A copyright assignment is not automatically reversed by a refund. Fixed artworks with accepted sole/exclusive/assignment rights stop resale; commission templates remain available.
- An expired order cannot recover a conflicting fixed-artwork entitlement through late-payment reconciliation. It stays `needs_review`, with an audit entry and no paid receipt or entitlement. Product row locks serialize this check with rights offers and acceptance.
- Free orders retain their existing purchase certificate. No paid receipt or payment-backed agreement is fabricated for a zero-price order.

## Data and access

Source migration: `supabase/migrations/20261014005318_artwork_rights_documents.sql`.

The migration adds optional receipt tax identity, an immutable agreement table, a private thumbnail bucket, three agreement RPCs, a document-aware payment identity RPC, fixed-artwork reservation protection, a late-payment exclusivity check, and two draft policy types. Existing payment RPCs remain supported. Receipt rows are share-locked when offering and accepting agreements so that concurrent receipt cancellation cannot invalidate a newly accepted snapshot unnoticed.

The agreement snapshot freezes the receipt identity, artwork, scope, policy ID/version/full text, original purchased terms and thumbnail reference. Content and execution SHA-256 records bind the snapshot and actual account/name/timestamp evidence. These are application evidence records, not certified digital signatures or government copyright registrations. Document responses use private/no-store caching; PDF generation and embedded Sarabun fonts stay on the application server.

Applied to hosted Supabase project `fdwiwaawqrenxxvdsnqs` on 2026-10-14 at 18:06:56 UTC, recorded as `20261014180656` (`artwork_rights_documents`). The source timestamp remains `20261014005318`.

No production customer, payment, receipt, entitlement or agreement fixtures are created for testing. The existing hosted payment function's body hash was checked against the source before replacement; it matched (`cb415e2a3bdd616af4655ad7eebdbbab`).

## Verification

Final code commit: `cd31058c36141e297348a1e52f867e16b370dd7a`.

[GitHub Actions run 38610938743](https://github.com/Sanstheink/tidalis-marketplace/actions/runs/38610938743): both `verify` and `user-flow` succeeded.

| Check | Passed |
| --- | ---: |
| Unit tests | 61 |
| Isolated PostgreSQL regressions | 139 |
| General browser tests | 10 |
| Real Auth / MFA / Postgres / private Storage browser flows | 21 |
| Total | 231 |

The earlier complete run [38495055732](https://github.com/Sanstheink/tidalis-marketplace/actions/runs/38495055732), at `1b117db5ee803586d44de99a2f1b75f0f7baa26d`, passed all 229 cases and the TypeScript/build checks. Its browser flow covered seller issuance of both documents, actual buyer acceptance, private thumbnail access, pre-signature rejection, original PDF download, order-page buttons, unrelated-account rejection, a full refund and historical-original access after refund. The final code adds targeted late-payment reconciliation regressions; its document rendering and UI are unchanged.

Source/import checks, TypeScript and the production build also pass. Four opt-in live-production browser checks are excluded from these totals and were not run.

The isolated order-document suite passes 25 cases locally. It includes receipt identity and tax snapshot locking, seller MFA and ownership, unpublished policy rejection, explicit consent and exact-hash checks, immutable signatures and previews, receipt cancellation before signing, version supersession, pending-offer closure, resale blocking and conflicting late payments both before and after acceptance. Tests use synthetic data in an isolated database. The suite does not represent a live customer payment or a production deployment test.

PDF QA rendered six synthetic documents into 12 pages: licence (3), assignment (3), receipt (1), credit note (1), void receipt (1), long quotation (3). First, continuation and final pages were visually inspected; text-bound checks found no text outside page bounds. The design uses restrained navy/gold rules, clear Thai/English headings, numbered sections, readable local fonts, page numbers, an artwork thumbnail and QR block, and full terms/signature appendices. QR URL validation is unit tested; camera scanning was not separately tested. The actual browser-produced 390px mobile order screenshot was reviewed, and the flow asserts no horizontal overflow.

Hosted read-only checks confirmed RLS and no anonymous table access; authenticated users have SELECT only, with no direct INSERT/UPDATE/DELETE. All four new public RPCs are security invoker, callable by authenticated users and denied to anonymous users. Internal receipt/payment/immutability/reservation helpers remain inaccessible directly to clients. The thumbnail bucket is private, PNG/JPEG only and limited to 2 MB. Both policy rows are drafts with no approver, both triggers are installed, the late-payment guard is present, and no agreement was fabricated (`rights_count = 0`).

Security Advisor findings are unchanged from the pre-migration baseline: one intentionally closed reservation table, two existing anonymous-role and 29 existing authenticated-role SECURITY DEFINER function notices, and the existing Leaked Password Protection warning. No new finding was introduced. Existing remediation references: [closed-table RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous function access](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function access](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Activation and rollback

1. Preserve the dependency on PR #10 when merging PR #12, then deploy the application through the owner's normal release process. No `main` merge or Vercel Production deployment is performed by this patch.
2. An administrator must actually review and publish **Standard Platform License Terms** and **Standard Assignment Terms** in `/admin/policies`. Both are seeded as drafts without an approver. The existing legal-review confirmation gate is intentionally preserved; seller issuance remains disabled until the relevant reviewed policy is published.
3. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin (without a path, query or fragment) before issuing QR-linked documents. Local HTTP is only permitted in the explicit development/test environment.
4. The earlier payment-proof server configuration issue described in `ORDER_DOCUMENTS_0_6_8.md` is separate. This patch does not claim that the live Vercel environment or production payment-proof service has been repaired; no real transfer was initiated.

Do not replay historical source migrations or run `db push --include-all` against the hosted database: hosted migration timestamps differ from source timestamps. If application rollback is needed, revert the deployed application to the prior version and preserve the additive tables, frozen records, bucket and migration history. Do not remove signed agreement history or archived-product safeguards as a rollback shortcut.
