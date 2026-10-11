# Phase 6.1 — fixed-price orders (0.6.1)

Buyers can keep reviewed ready-made/digital products in a real cart, review each shop separately, accept the exact policy/license versions, create an order with a 30-minute reservation, view the frozen order and cancel it. The cart stores IDs, license and quantity only; database prices determine the order total in THB satang.

The storefront, cart, checkout and buyer order pages use the Midnight Violet design with responsive cards, readable license options, clear totals and a reservation countdown. Historical demo checkout is at `/preview/cart` and `/preview/checkout/[shop]`; it cannot create orders.

## Release boundary

- `marketplace_settings.fixed_orders_enabled` defaults to **false**. The migration never enables sales or changes seller intake.
- The isolated CI fixture enables the gate only in its own local Supabase stack.
- Orders remain `pending`: no payment collection, seller confirmation, platform fees, financial documents, file entitlement or delivery is performed.
- The UI tells buyers not to transfer money for these reservations. Phase 6.2 must implement seller payment details, private proof and verification before any production opening.
- VAT profiles other than `not_registered` are gated until the payment/tax implementation handles verified seller tax snapshots. This phase adds no VAT calculation.
- Commission products still require the future brief/quote flow.

## Transaction behavior

`create_fixed_order` is an invoker wrapper around a bounded definer in the unexposed `private` schema. It requires a genuinely verified Auth user, an active shop with approved readiness, current approved policies, a published/reviewed fixed-price product with preview/delivery metadata and the selected license.

The buyer row serializes retries and the five-active-order limit. Products lock in UUID order before prices and held stock are read. Exclusive stock is shared across both license options. Quantities are capped at 20 per product. Price/license-term changes and policy changes require the buyer to reload and accept again. Buyer membership in the selling shop is rejected.

Order lines freeze names, licenses and integer prices; orders freeze shop, policy and the non-VAT tax state. Buyer/idempotency-key uniqueness returns the original order on a retry, including after gate closure. A changed payload with the same key is rejected. The browser retains a hashed attempt identifier in session storage across a lost response/reload, without persisting buyer notes or policy text there.

`product_reservations` is an internal RLS ledger without client table privileges. Availability subtracts only unreleased, unexpired holds. `products.stock` is not modified when reserving or cancelling, so repeated cancellations cannot inflate inventory. Expired holds stop consuming stock without needing a cron. Expired pending rows remain historical orders and render as “หมดเวลาจอง”; cancellation records the expiry explicitly.

Buyer cancellation locks the owned order and refuses any non-pending order or an order with a payment transaction. It releases holds once and creates an audit entry. Buyers cannot write order/item/ledger tables or mark themselves paid. Existing seller/Admin financial MFA protection remains in place. Buyer policy PDFs can be read only if that exact private path was captured in their owned order.

**Phase 6.2 must atomically recheck the lease before payment transitions and convert valid holds into sold inventory.** Never treat a Phase 6.1 pending/expired order as paid or grant a download.

## Verification

- `npm test`: historical source guards, unit tests, 35 existing isolated database regressions and 20 new order regressions.
- `npm run typecheck` and `npm run build`.
- CI `user-flow`: starts a fresh local Supabase Postgres 17/Auth/Storage stack using CLI `2.120.0`; provisions synthetic confirmed accounts through the actual local Auth Admin API; uploads local private fixtures; signs buyers in through the real browser login form.
- Browser scenarios: license and exact total, shop-scoped cart clearing, order detail/cancellation, no private delivery before payment, lost-response/reload retry, concurrent exclusive reservations, cross-buyer RLS/application denial, direct paid-write denial and 390px mobile layout.
- User-flow tests refuse non-loopback Supabase URLs and disable session traces/video. Only synthetic UI screenshots are uploaded. No hosted credentials, user password, MFA factor or live order is used by these fixtures.

## Migration and deployment

Apply only `supabase/migrations/20261011150057_phase61_fixed_orders.sql` after the existing 0.5.10 schema. **Do not replay migrations 001–010 or use `db push --include-all` on the hosted project**, whose historical migration ledger differs from its already-applied schema.

After applying, verify `select fixed_orders_enabled from public.marketplace_settings` is false and that anonymous order mutations are denied. The application fails closed if the checkout RPC is unavailable.

This feature branch starts from PR #2's 0.5.10 stabilization commit. Merge PR #2 first, then retarget this PR to the updated production branch before merging. A Git-integrated push creates a Vercel Preview; production must use a new deployment of the merged production-branch commit, rather than redeploying the old main commit. Leave the live order gate closed until the payment phase is ready.

CI and Preview URLs/results are recorded in the pull request when verification completes.
