# Order payments and documents 0.6.8

Customers accept a Commission quotation, then use **ไปชำระเงิน** to open a separate payment page. The page collects the receipt recipient's name and optional address before starting the payment. Submission saves that identity and creates the payment attempt atomically. Retries reuse the existing payment and identity.

Before confirmed payment, customers download a quotation PDF marked **สำเนาสำหรับลูกค้า**. The shop retains the accepted quotation snapshot and can download its original from the seller order. After confirmed payment, the customer action switches to **ดาวน์โหลดใบเสร็จรับเงิน**. Slip submission and reconciliation cases never count as confirmed payment.

New payments create an immutable shop receipt inside the confirmation transaction. Shop finance can correct a receipt using the existing void-and-reissue process, preserving the old document and replacement reference. Existing attempts without collected receipt identity continue using the seller-issued receipt workflow; no names or business identities are invented or backfilled.

Ready-made and digital-asset items with an active entitlement show adjacent work and Licence download actions. Multiple files use a file picker. Licence text comes from the purchased item snapshot, including the selected personal/commercial terms, never the product's current terms. Full refunds revoke work and Licence access. Receipts remain available as historical payment evidence.

All download routes require authenticated ownership; shop originals also require finance access and MFA. PDFs use private/no-store responses and embedded, OFL-licensed Sarabun font assets. The server generates PDFs locally, with no external document processing service. Thai word/grapheme wrapping supports long terms and multipage documents.

## Database rollout

Additive migration: `supabase/migrations/20261012195555_order_payment_documents.sql`.

Apply this migration before deploying 0.6.8. Do not replay historic migrations or use `db push --include-all` against the hosted project. This change adds receipt recipients, an atomic order-payment RPC, automatic receipt issuance for new payments, and accepted quotation snapshots. Legacy payment RPCs remain supported.

## Validation

Local source checks, existing regressions, TypeScript and production build have been run. New database, document and browser checks cover duplicate submission, immutable originals, foreign-account access, pre/post-payment document switching, automatic receipts, receipt correction, entitlement revocation, Thai PDF generation and mobile layout. Final CI results and hosted migration status will be recorded after verification.

No main merge or Production deployment is performed by this patch.
