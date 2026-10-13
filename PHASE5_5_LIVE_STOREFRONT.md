# Tidalis — Phase 5.5: Public read-only storefront

## Why the homepage previously did not change
The earlier Phase 5.5 discussion was a **plan**, not a shipped code update. Phase 5 still imports fixture catalog values from `lib/catalog.ts` in `app/page.tsx`, `app/shop/page.tsx`, and product/shop routes. Redeploying that code does not fetch live Supabase data.

## What this patch changes
- `/`: Featured Artworks load latest `published` products for `active` shops from Supabase; if none exist an honest empty state is shown. Hero artwork, announcement and footer deliberately remain unchanged.
- `/shop`: Uses public database products; client-side category/search/sort on at most the newest 60 products (pagination / server search can come in a later phase).
- `/products/[slug]`: Public detail for URLs such as `/products/my-art--UUID`, with real product name, price and Personal/Commercial terms. **No cart or buy buttons** for database products until Phase 6 transaction validation.
- `/shops/[slug]`: Real, active storefront data and its published products.
- Public art panels are **explicit placeholders**. Phase 5 private files in `tidalis-product-files` remain private. Never publicize that Storage bucket. Implement a separate approved public preview-derivative pipeline before showing real artist images.

## Backend rules and Production safety
- This patch makes **no SQL migrations and no writes to Supabase**.
- Reads use a separate **anonymous Supabase client** with public/publishable key and RLS. They expressly filter `products.status = published` and `shops.status = active` (including when an admin is browsing).
- Phase 5 only supports products in `draft`; it does **not** provide a safe publishing workflow. Therefore a Production database with only drafts shows the empty state. **Do not mark products as published manually in Production simply to see something on the homepage.** Publishing requires release gates (store verified, all seller policies approved, safe public previews, stock/licensing review and orders/payment readiness).
- No original file path, deliverable, Storage URL, or restricted product files are read or sent to the browser.
- `shop.slug` + `product.slug` are not globally unique, so links append product UUID: `/products/{slug}--{uuid}`.
- If Supabase configuration is missing, or the public read fails, the UI shows an empty state rather than mock products. For a query error, inspect Vercel logs with a `[Tidalis public catalog]` tag; do not leak credentials or detailed SQL errors into page HTML.

## VS Code application
From the Phase 5 checkout that contains `005_seller_catalog_drafts.sql`:

```bash
cd ~/Downloads/tidalis-marketplace
git status
# Commit or stash your changes before creating a new branch.
git switch -c feat/phase5-5-live-storefront
git apply --check ~/Downloads/tidalis-phase5-5.patch
git apply ~/Downloads/tidalis-phase5-5.patch
npm install
npm run check:source
npm run test:phase5-5
npm run typecheck
npm run build
```

Only after build passes:

```bash
git add app/page.tsx app/shop/page.tsx app/globals.css \
  "app/products/[slug]/page.tsx" "app/shops/[slug]/page.tsx" \
  components/PublicProductCard.tsx components/PublicShopGrid.tsx \
  lib/public-catalog.ts lib/public-catalog-shared.ts \
  package.json scripts/test-phase55.cjs PHASE5_5_LIVE_STOREFRONT.md
git commit -m "feat: read-only Supabase storefront"
git push -u origin feat/phase5-5-live-storefront
```

Open a PR to your production branch and inspect its Vercel Preview URL **before merging**. Verify Preview and Production environment variables point to the intended Supabase project; Vercel rebuilds/redeploys when environment variables are changed.

## Safe SQL diagnostic (SELECT only)
Use SQL Editor in your Supabase project:

```sql
select p.status as product_status, s.status as shop_status, count(*) as count
from public.products p
join public.shops s on s.id = p.shop_id
group by p.status, s.status
order by p.status, s.status;
```

If there is no row with `product_status = published` AND `shop_status = active`, nothing is eligible to display. This is expected while all products are drafts. Do not force a status update in Production.

## Manual QA on Vercel Preview
1. Open `/` and `/shop` signed out. No fictional products/prices should appear. If there are no published products, an empty-state text must be visible.
2. Test `/products/violet-moon-character` (old demo slug) — should return 404 rather than a demo purchasable product.
3. Test `/shops/moonlight-studio` (old demo store) — should return 404 unless a real active shop exists with that slug.
4. Confirm no Checkout / Add to cart action appears for database products.
5. Verify Home/Shop do not expose any private Storage path in View Source or browser Network.
6. On a *separate staging project*, use normal reviewed publishing workflow once implemented and verify only published products of active shops appear to anon visitors.
7. Confirm mobile layout, filters, sort, dynamic metadata, and no private file URLs.

**Not yet provided:** verified public artwork thumbnails, production publishing, checkout/payment/orders, cursor pagination, database-side search, end-to-end tests with Supabase, and full Production build verification in this artifact environment.
