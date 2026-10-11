# Marketplace Tidalis · Phase 2 / Vercel Preview

Phase 2 is a **UI/UX development preview**, not a live marketplace. It includes sample product fixtures, mock gallery, seller-specific cart sections, personal/commercial license selections, creative brief and a two-step checkout review. It does **not** create orders, issue invoices, upload reference files, reserve inventory, or process funds.

## Import Phase 2 changes into your existing VS Code repository

Preferred: apply the provided `tidalis-phase2.patch` while at the repository root:

```bash
# Start in the folder containing package.json and .git
# If you have uncommitted edits, commit or stash them first.
git status
git switch -c feat/phase2-storefront
git apply --check /path/to/tidalis-phase2.patch
git apply /path/to/tidalis-phase2.patch
npm install
npm run check:source
npm run test:phase2
npm run typecheck
npm run build
git add .
git commit -m "feat: phase 2 storefront and multi-seller checkout preview"
git push -u origin feat/phase2-storefront
```

If you choose the full source archive instead, **copy its files over** your existing repository instead of replacing the whole repository directory, so `.git` and local project changes remain intact. Never copy `.env.local` from other systems or commit it.

## Connect GitHub → Vercel

1. Open <https://vercel.com/new> and import **Sanstheink/tidalis-marketplace**. Authorize the repository in Vercel's GitHub integration if it is missing.
2. Set framework **Next.js**. Set Root Directory to `./` if `package.json` is at repository root.
3. Set Node.js **22.x** if Vercel requires a specific version. Leave Next.js build and install commands at defaults.
4. Configure optional `NEXT_PUBLIC_SITE_URL` for the preview environment. **Do not add dummy Supabase credentials.** If Supabase is not configured, the public storefront should render using demo catalog; authenticated areas cannot function.
5. Create the project and check the Build Logs. Pushes to branches / Pull Requests can generate Vercel preview deployments once Git Integration is active. Use a PR to review Phase 2 without shipping new code to `main`.
6. Keep the staging project behind Vercel Deployment Protection if available; do not attach `marketplace.tidalis.site` until backend authorization, payment rules, shop policies and security checks are ready.

### Limits that must be addressed before production

- Catalog and stock are **fixtures**. Cart is stored in the browser only and is never trusted for authoritative pricing.
- Checkout confirmation is deliberately disabled. An authenticated transaction, stock reservation, quote approval, seller-isolated checkout, policy/version snapshots, server-side final price/tax, payment verification, and idempotency are still required.
- Uploaded reference files remain **in the browser** during this preview and are never transmitted to sellers.
- Seller policy pages and real licensing terms have not been populated yet; the seller pages explicitly disclose this.
- Production Vercel environment variables must use real scoped keys. Keep secret keys server-side. Auth redirects, MFA and RLS need end-to-end tests before public access.
- Placeholder artwork, shop identities and prices must be replaced with approved content.

### Helpful commands

```bash
npm install
npm run check:source
npm run test:phase2
npm run typecheck
npm run build
```

Use the **Vercel deployment log** (not screenshots of npm errors alone) to troubleshoot failed builds. Never run with `NEXT_TELEMETRY_DISABLED` or `SKIP_ENV_VALIDATION` to conceal build issues; address the errors directly.
