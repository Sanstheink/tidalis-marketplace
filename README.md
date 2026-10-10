# Marketplace Tidalis — Phase 1 Codebase

**Domain target:** `marketplace.tidalis.site`  
**Stack:** Next.js 16 App Router / React 19 / TypeScript / Supabase (Auth, PostgreSQL, RLS, planned Storage) / Vercel / planned Resend.  
**Theme:** Midnight Violet. Logo based on the **Tidalis visual selected by the owner**.

This is **the first development milestone**, not a production-ready marketplace. It intentionally does **not** accept real orders, slips or money, issue legally operative invoices, or expose customer download files yet.

## What is implemented

- Dark responsive UI: announcement ribbon, homepage announcement popup with browser dismissal, navigation, homepage, category browsing, search, sort, shop profile, product detail gallery, Product/License selector, shopping cart and checkout preview.
- Personal and Commercial license prices are defined separately per product. Ready-made / assets have fixed prices; commissions are quote-required. Product types and work types are kept separate.
- Brief and order-note fields with review screen; final order confirmation is disabled until transactional backend is verified.
- Supabase SSR-capable login/register, Google OAuth callback, email OTP, basic TOTP MFA enrollment/verification UI. Account, Seller and Admin pages are protected by verified sessions and database roles, with MFA required for Seller/Admin routes.
- Seller application form is gated until legally approved terms are available. Admin seller approval uses a restricted, transactional SQL RPC and audit event.
- Seller dashboard, product and work-type management, payment/refund/finance read views, document listing, VAT status; Admin dashboard, seller applications, VAT review queue, announcements and platform-policy read views. Buyer order detail and refund history have protected read views. Public UI preview at `/preview` does not bypass those protected routes.
- Database migration drafts for multi-tenant shops/RLS, buyer orders, commission briefs, payment/refund records, platform percentage fees, seller monthly invoices, financial documents, tax versioning and permission isolation.
- Policy Center routes are **non-binding content outlines**, clearly labeled drafts.
- Actual Tidalis brand-board logo artwork cropped as standalone assets for Navbar/Footer/Favicon.

## Run locally

Requirements: Node 22+ and access to npm registry.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and explore `/`, `/shop`, `/products/violet-moon-character`, `/cart`, `/checkout/moonlight-studio`, `/policies` and `/preview`.

**Offline note:** The package was created in an environment with no access to the npm registry. Dependencies were not installed and no Next.js build/browser test could be run here. Source files passed a TypeScript syntax parse check. Run `npm install`, `npm run typecheck` and `npm run build` in an online environment and resolve findings before deploying.

## Supabase connection

1. Create a **new staging** Supabase project or provide access to the intended project. No connected Supabase project was detected when this codebase was produced.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Do not expose service-role keys to the browser.
3. Review `supabase/migrations/001_identity_catalog.sql` and `002_finance_tax.sql` before applying, then run in order. These are **unapplied schema drafts**; verify RLS, grants and role isolation in staging.
4. Configure Auth email confirmation (OTP template if 6-digit code is desired) and Google OAuth redirect URLs, including `http://localhost:3000/auth/callback` for development and `https://marketplace.tidalis.site/auth/callback` when deployed.
5. Assign the first admin role from a trusted server/database administration channel to a verified user ID. Never create a public admin sign-up flow.
6. Publish a legally reviewed Seller Agreement before setting `NEXT_PUBLIC_LEGAL_DOCUMENTS_APPROVED=true`. Platform policy acceptance and full legal audit/versioning still need completion before public onboarding.
7. **Do not enable checkout in production** until the payment, tax, refund, inventory and download RPCs are implemented and audited.

## Security / business constraints

- One authenticated user can participate as buyer and seller; Seller/Admin permissions must be validated on the server and in RLS.
- Direct-to-seller static PromptPay QR. Commission is a platform receivable, not automatically deducted from a buyer's payment.
- Seller-created work types and Personal/Commercial prices are per product.
- Every seller must publish seller-specific refund, delivery and license policies. Marketplace policies are separate.
- **Non-verified VAT shops may not charge VAT or issue tax invoices.** Sellers may issue official documents only through a future audited server workflow. Only an authorized Admin can alter verified tax identity and tax-invoice logo after reviewing evidence.
- Minimal receipt visual excludes the VAT line, subject to statutory minimum fields. Full tax invoice must carry legally required seller/buyer data.
- Future downloadable artwork uses private storage, explicit entitlements and short-lived signed URLs.
- Do not rely on a slip upload or seller click as bank-verified payment.

## Planned next milestones

1. Replace demo catalog with Supabase-backed seller product creation and uploads; implement private storage / work types / seller policy editor and approval gates.
2. Implement transactional order creation, order/brief snapshots, quote approval, secure exclusive-stock reservation and true end-to-end purchase flow.
3. Implement direct payment proof verification, manual seller confirmation, double-entry ledgers, fee invoices, refund workflows, and dispute handling; add automated RLS and race-condition tests.
4. Implement private download entitlements and invoices / tax PDF generation, tax identity change review with evidence, Resend outbound email and logs.
5. Complete admin announcement management, policy CMS, design QA/mobile, security audit, Vercel Preview and finally live domain binding.

## Repo deployment

No GitHub repositories, Vercel teams/projects or Supabase projects were returned by the connected accounts during initial setup. The deliverable is therefore a **downloadable source project**, not a deployed or connected production website. You can create a repository and connect it to Vercel when ready.

## Phase 2 — storefront / Vercel preview

Phase 2 expands the product gallery, seller-defined license price selection, quantity and exclusive-product limits, multi-seller cart grouping, and separate fixed-price versus commission brief checkout preview. Checkout confirmation remains **disabled** pending authenticated backend, seller policy acceptance snapshots, inventory reservation, and payment verification. The mock catalog contains two fictional seller shops.

See [PHASE2_VERCEL.md](PHASE2_VERCEL.md) for GitHub/Vercel preview workflows, caveats, and testing instructions. Run `npm run test:phase2` for fixture-level cart tests.

## Phase 3 — Supabase Auth and role-based workspaces

Phase 3 adds protected workspace selection (`/workspace`), email login/signup and verification, resend verification, Google OAuth PKCE callback, password recovery, TOTP MFA setup/challenge, seller application status (`/sell/application`) and server/RLS-guarded Buyer, Seller and Admin screens. Phase 3's `003_phase3_auth_hardening.sql` enforces `aal2` in database helper checks for sensitive seller/admin rows. Email/password login is supported; **username login is not yet included** (username is only a public handle).

**No migrations, user accounts, domain settings or deployments were created remotely by this update.** Follow [PHASE3_SUPABASE_VERCEL.md](PHASE3_SUPABASE_VERCEL.md) to configure your staging Supabase project and Vercel environment variables, review migrations and test roles. Complete the checklist before moving beyond preview; no real checkout is enabled.

Tests: `npm run check:source && npm run test:phase2 && npm run test:phase3 && npm run typecheck && npm run build` (the final two require dependencies to be installed and the Vercel environment configured).


## Phase 4 — Seller onboarding & admin review

See [PHASE4_PRODUCTION_GUIDE.md](PHASE4_PRODUCTION_GUIDE.md) for safe deployment, migration and policy publication. Run `npm run test:phase4` for structural checks; do **not** apply SQL to production without a staging clone/backup and legal approval.


## Phase 5 — Seller Catalog Drafts (not live sales)

ดู `PHASE5_SELLER_CATALOG_GUIDE.md` สำหรับวิธีอัปเดตฐานข้อมูล/โค้ดและทดสอบบน Staging. Phase 5 เพิ่มหน้า `/seller/products/new`, `/seller/products/[id]`, Private Storage สำหรับ Seller และหน้า Public UI Preview `/preview/phase5` (ข้อมูลตัวอย่างเท่านั้น). **ยังไม่เปิดสินค้า/รับเงินหรือให้ผู้ซื้อดาวน์โหลด**.


## Phase 5.7 — Platform & Shop Policies

See [PHASE5_7_POLICY_MANAGEMENT.md](PHASE5_7_POLICY_MANAGEMENT.md) for installation, read-only Production preflight, isolated Staging migration and policy review workflow. **Never use placeholder legal terms or direct SQL to open a Production shop.**
