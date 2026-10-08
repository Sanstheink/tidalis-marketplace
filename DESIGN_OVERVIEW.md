# Tidalis Design & Development Status

## Confirmed product constraints

| Topic | Decision |
| --- | --- |
| Domain/brand | Marketplace Tidalis / `marketplace.tidalis.site` |
| Marketplace | Multi-seller; seller applications reviewed by Admin |
| Appearance | Midnight Violet; cinematic storefront, subtle operational UI motion |
| Product types | Commission (quote required), Ready-made Artwork (fixed price), Digital Asset (fixed price) |
| Work types | Defined by each shop (e.g. Chibi, VTuber, Background) |
| License | Personal and Commercial; **seller specifies prices independently** |
| Checkout | Shop-scoped, additional customer note; Commission also has a versioned brief and references |
| Payment | Customer pays the seller's static QR/bank/wallet directly, then provides proof; seller manually verifies |
| Platform fee | Percentage of confirmed sales; invoiced to sellers periodically, NOT split from buyer payment |
| Refund | Seller sends refund directly; proof/possible buyer confirmation, dispute and fee adjustment |
| VAT | Non-verified sellers cannot charge VAT; verify Ph.P.20 and tax data; Admin-only changes to tax issuer identity and invoice logo |
| Receipt | Shop name, number, date, line items and totals, no VAT line in design; must verify statutory minimums |
| Tax invoice | Issued by authorized seller action, based on locked Admin-approved legal identity and logo; versions/snapshots |
| Policies | Separate platform policy versions and required seller policies (refund, delivery, license) |
| Download files | Private Supabase Storage after verified payment, signed URLs via entitlements |
| Announcements | Ribbon all pages; dismissible popup homepage; Admin-managed scheduled content in later phase |
| External services | Next.js / React / Vercel / Supabase / Resend |

## Phase 1 - Present in source (not deployed)

Visual storefront, 25+ route files, demo catalog, license selection, shop-scoped cart, brief/checkout UI, auth plumbing, roles and MVP seller/Admin dashboard protected read views, secure database schema/RLS drafts, approved logo assets.

## Phase 2 - Not built yet

Transactional order creation and quote approval, invoice/PDF issuance, verified tax workflows, payment confirmation and reconciliation, buyer downloads, claim/refund execution, Resend integration, production policy CMS, uploads and approved seller onboarding, live site deployment.

## Why financial actions are disabled

An illustrated preview must never masquerade as an actual purchase. Until server-side amount validation, tenant-scoped RLS, transactional DB RPCs, tax assessment and payment reconciliation are implemented and tested, sensitive create/confirm/refund buttons are disabled. The database denies direct client write operations for financial records.
