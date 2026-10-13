# Order payments and documents 0.6.8

Customers accept a Commission quotation, then use **ไปชำระเงิน** to open a separate payment page. The page collects the receipt recipient's name and optional address before starting the payment. Submission saves that identity and creates the payment attempt atomically. Retries reuse the existing payment and identity.

Before confirmed payment, customers download a quotation PDF marked **สำเนาสำหรับลูกค้า**. The shop retains the accepted quotation snapshot and can download its original from the seller order. After confirmed payment, the customer action switches to **ดาวน์โหลดใบเสร็จรับเงิน**. Slip submission and reconciliation cases never count as confirmed payment.

New payments create an immutable shop receipt inside the confirmation transaction. Shop finance can correct a receipt using the existing void-and-reissue process, preserving the old document and replacement reference. Existing attempts without collected receipt identity continue using the seller-issued receipt workflow; no names or business identities are invented or backfilled.

Ready-made and digital-asset items with an active entitlement show adjacent work and Licence download actions. Multiple files use a file picker. Licence text comes from the purchased item snapshot, including the selected personal/commercial terms, never the product's current terms. Full refunds revoke work and Licence access. Receipts remain available as historical payment evidence.

All download routes require authenticated ownership; shop originals also require finance access and MFA. PDFs use private/no-store responses and embedded, OFL-licensed Sarabun font assets. The server generates PDFs locally, with no external document processing service. Thai word/grapheme wrapping supports long terms and multipage documents.

## Database rollout

Additive migration: `supabase/migrations/20261012195555_order_payment_documents.sql`.

Applied to hosted Supabase project `fdwiwaawqrenxxvdsnqs` on 2026-10-13 at 12:27 UTC, recorded as migration `20261013122721` (`order_payment_documents`). The source migration timestamp remains `20261012195555`. The database is ready for deployment of 0.6.8. Do not replay historic migrations or use `db push --include-all` against the hosted project. This change adds receipt recipients, an atomic order-payment RPC, automatic receipt issuance for new payments, and accepted quotation snapshots. Legacy payment RPCs remain supported.

## Validation

Verified code commit: `3ea978b5cd52e3c477fc9509e75e71e683688660`.

[GitHub Actions run 38396633629](https://github.com/Sanstheink/tidalis-marketplace/actions/runs/38396633629): both `verify` and `user-flow` passed.

| Validation | Passed |
| --- | ---: |
| Unit tests | 51 |
| Isolated PostgreSQL regressions | 126 |
| General browser tests | 10 |
| Real Auth / MFA / Postgres / private Storage browser flows | 21 |
| Total | 208 |

Source/import checks, TypeScript and production build also passed. Production dependency audit reported zero known vulnerabilities. The optional four live-production tests were not run; no real customer purchase or transfer was created for testing.

The browser flows verify Commission quote acceptance, separate payment pages, customer copies and seller originals, automatic receipts, asset work/Licence links, wrong-account rejection, receipt access after refunds, Licence revocation, PromptPay and private bank QR switching, recipient identity preservation, mobile overflow and minimum text contrast of 4.5 for the new action/guidance UI. Earlier verification found and corrected an outdated inline-QR test and poor contrast in the first dark-theme design.

PDF QA rendered Thai receipt and Licence documents (one page each) and a six-page quotation. No text extended outside the page bounds. A footer pagination issue was fixed and covered by a regression. Draft receipts are denied; void receipts carry a cancellation label on every page.

Hosted read-only checks confirmed RLS on receipt recipients, no anonymous access, no direct authenticated inserts, no anonymous execution of the new payment RPC, no client execution of the internal receipt issuer, and all three new triggers. Security Advisor findings were unchanged from the pre-migration baseline. Existing notices concern intentionally guarded legacy RPCs ([function access guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)), the deliberately closed reservation table, and [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No new advisory finding was introduced.

No main merge or Production deployment is performed by this patch.
