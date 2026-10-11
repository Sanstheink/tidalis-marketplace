# Tidalis 0.6.2: direct payments and operations

Shops receive sale proceeds directly into their own bank or PromptPay accounts. Platform fee invoices use a separate platform recipient. Buyers choose the recipient's uploaded bank QR, PromptPay QR/number, or bank account number. Every transfer requires proof and confirmation by an authorized finance reviewer after checking the actual incoming bank transaction.

Prices, orders, recipient accounts and invoices keep THB, LAK and USD separate. No exchange rate or cross-currency settlement is invented. Each recipient can retain bank accounts and QR images for all three currencies. PromptPay is available only for THB. A bank account/QR can be used only for its configured currency.

## Activation

1. Apply `20261011180717_payment_operations.sql` and `20261011193105_marketplace_operations.sql` after phase 6.1. Both pending migrations contain only direct payment operations. Historical migrations 001–010 must not be replayed against the hosted database.
2. Set `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) only in the server deployment for proof verification. Use the real project key. Set `NEXT_PUBLIC_SITE_URL` to the actual HTTPS origin. No payment-provider accounts or secrets are required.
3. Shop owners/finance members configure real recipient names, billing addresses, currency-specific bank accounts and QR images at `/seller/settings/payments`. Admin configures the platform recipient and actual receipt issuer at `/admin/settings/payments`. Use the actual individual or group receiving the money; no company identity or registration is assumed or seeded.
4. Configure actual fee percentages for new orders. Publish actual policies, approve seller applications, review products, and approve shop readiness. Admin explicitly controls seller intake and fixed-price order intake. This release does not invent account numbers, publish legal text, or open hosted gates automatically.
5. Test all recipient accounts/QR codes with the actual account owner before enabling them. The app displays submitted recipient details; it does not independently verify account ownership or bank transactions.

## Daily flows

- Buyer: choose a shop and one currency → accept frozen terms → reserve → choose a direct channel → transfer and submit proof → recipient verifies actual money → download from `/account/library`. Free fixed-price orders grant rights without a fabricated payment. Download redirects authenticate the buyer, recheck revocation, and issue a private URL lasting 60 seconds.
- Seller: prepare work type, product, price, preview and delivery file → submit for admin review → publish once approved. Shop visibility requires a separate readiness approval. Finance members use `/seller/payments` to verify bank receipts. Exact duplicate proof bytes cannot be reused. Image deduplication does not replace bank verification: check the actual incoming transaction before confirming.
- Platform: record fees only on confirmed paid orders → invoice each unbilled fee once → seller pays the platform recipient → admin verifies → admin issues an immutable numbered ordinary receipt → seller can view/print it from the invoice. Voiding retains the original document.

Ordinary receipts support an individual/group issuer with optional tax ID and charge no VAT. The existing separately approved tax-invoice gate remains disabled for an unregistered issuer. A receipt is created only from confirmed received money and cannot be silently changed afterward.

Expired, closed or stock-conflicting payments require reconciliation. Refunds are handled by the recipient outside the app; this release does not send bank refunds. Commission products retain their quote-based product mode; automatic commission quoting and bespoke delivery are separate from fixed-price file purchases.

## Verification

`npm test`, `npm run typecheck`, `npm run build`, and Playwright public UI checks run in CI. The isolated local Supabase job provisions real Auth users, enrolls real TOTP factors, and checks buyer/seller/admin pages, private proof storage, file downloads, fee invoices, ordinary receipts, product upload/publication, announcements, PromptPay and bank QR. Test fixtures use synthetic local identities and money, never real transfers or hosted data. Password/token/MFA traces and videos are disabled. UI screenshots are stored in the `checkout-ui` workflow artifact.

Primary specification: [Bank of Thailand QR standard](https://www.bot.or.th/content/dam/bot/documents/th/our-roles/payment-systems/about-payment-systems/ThaiQRCode_Payment_Standard.pdf).
