# Marketplace Tidalis — Phase 5.6: Artist Directory

## Summary

- The **ร้านศิลปิน** navbar link, homepage artist-section heading CTA, and footer directory link point to **`/artists`**.
- `/artists` loads *active* shops using an **anonymous publishable-key client** from Supabase. The only selected fields are `id, slug, name, description`.
- 0 active shops: honest empty state; 1 active shop: full-width featured card; multiple: responsive grid with search and server pagination (12/page).
- Clicking any directory card links to `/shops/[slug]`, which also checks `status='active'`.
- The homepage shows up to 3 active artist shops, or a truthful empty/unavailable message.
- No migration or production data modification is required. No changes to checkout, payment, product publishing, or approvals.
- The current schema does not include shop artwork/avatar/cover columns. Artist card art is **decorative CSS and an icon**; it does not imply actual seller content. Add public shop assets later, with explicit storage policies and approval.

## Install on existing Git repository

Start from your branch with **Phase 5.5 already applied and committed**. Do not apply this patch to a Phase 5-only repository. Check `git status` before continuing.

```bash
cd ~/Downloads/tidalis-marketplace
git status
git switch -c feat/phase5-6-artists
git apply --check ~/Downloads/tidalis-phase5-6-artists.patch
git apply ~/Downloads/tidalis-phase5-6-artists.patch
npm install
npm run check:source
npm run test:artists
npm run test:phase5-5
npm run typecheck
npm run build
```

Stop if `git apply --check` fails or `npm run build` reports an error. Review your changes (`git diff --stat`) before committing.

```bash
git add .
git commit -m "feat: live artist directory and homepage navigation"
git push -u origin feat/phase5-6-artists
```

Open a GitHub Pull Request to enable a **Vercel Preview Deployment**, then test `/`, `/artists`, and `/shops/<real-active-shop-slug>`. The production domain follows `main`, not the preview branch, until changes are merged and deployed.

## Production database: read-only verification

Run on Supabase SQL Editor as an operator; no inserts or updates:

```sql
SELECT status, COUNT(*) AS total
FROM public.shops
GROUP BY status ORDER BY status;

-- View a few public-visible candidates without exposing seller payment/tax information
SELECT slug, name, status
FROM public.shops
WHERE status = 'active'
ORDER BY created_at DESC LIMIT 20;
```

Test that the anon key is **only** able to query `active` rows; Supabase `shops_public_read` RLS should restrict other statuses. `paused` is expected after Phase 4 approval; do not change Production statuses just to populate this page. Do not use a service-role key for public queries.

## Acceptance cases (use Staging or existing legitimate Production records)

1. **0 active shops** → `/artists` and homepage show empty state; no fake shop names.
2. **1 active shop** → one enlarged card and working `/shops/[slug]` route; no duplicate cards.
3. **2–12 active shops** → responsive grid; clicking each card loads the corresponding shop.
4. **13+ active shops** → next/previous page links work; no items duplicated between pages.
5. **Search** → results filter by shop name and retain the query when changing page.
6. **Paused/pending/suspended** → absent from public directory; signed-in seller may still access private Seller Studio per its own authorization rules.
7. **No Supabase URL/key or query failure** → connectivity message, not “no shops”.
8. **Mobile 360px** → usable cards, search field, pagination; animation respects reduced motion.
9. **Security** → browser response contains no owner email, owner ID, payment data, VAT docs, or private storage URLs.

**Important:** Current Seller/Shop creation flow keeps approved shops paused. Listing will be empty until real shop activation is implemented through the approved safety process. This patch does *not* activate shops or enable payments.
