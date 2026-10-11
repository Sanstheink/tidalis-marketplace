# Marketplace Tidalis — 0.5.10

Next.js marketplace with Supabase Auth, seller workspaces, moderated catalogue/policies, and admin operations. This branch includes Phase 5.9 and the 0.5.10 stability fixes. Public storefronts show published products from active shops; the purchase/payment flow remains disabled.

See [RELEASE_0_5_10.md](RELEASE_0_5_10.md) for changes, actual test results, applied Supabase migrations, remaining test limits, and the Production rollout.

## Local setup

Use Node 24 (tested) or Node 22. Dependencies are pinned with a committed lockfile.

```bash
npm ci
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the intended project. Do not expose private keys. Supabase Auth redirect URLs and email templates must match the deployment. Auth emails use Supabase SMTP; application Resend configuration is separate.

Public routes: `/`, `/shop`, `/artists`, `/shops/[slug]`, `/products/[slug--uuid]`, `/policies`. Demo fixtures belong to `/preview` and `/preview/phase5`.

Authenticated routes: `/account`, `/workspace`, `/sell/apply`, `/seller`, `/admin`. Regular buyers need verified email. Seller routine access requires eligible membership and verified TOTP enrollment. Financial, publication and Admin operations require elevated AAL2. Workspace lets an enrolled member select which shop to manage.

## Database setup

For a **new** database, review and apply `supabase/migrations/*.sql` in order. Local database regressions execute all migrations against an isolated PostgreSQL model of Supabase auth/storage.

For the existing Marketplace project `fdwiwaawqrenxxvdsnqs`, historical phases 001–010 already exist and were applied manually. Both timestamped 0.5.10 migrations have also been applied and verified. Do not replay historical SQL or run `db push --include-all` against that project without reconciling its migration history.

Seller intake is controlled by `marketplace_settings`, starts closed, and is changed by an MFA Admin at `/admin/seller-applications`. An effective, approved Seller Agreement is still required. The former legal environment flag is no longer used by the app.

## Tests

```bash
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
```

`npm test` runs all historical checks, mocked read contracts, 11 unit cases and 35 isolated database regressions. CI also builds and runs browser checks using placeholder configuration; it never modifies a real Supabase project. The opt-in live browser suite is separate:

```bash
TIDALIS_LIVE_TESTS=true npm run test:browser
```

This suite reads the configured project and sends one invalid-password request for a nonexistent account. It does not sign up users or send email. `tests/db/live-policy-smoke.sql` is a migration-owner SQL probe that creates transactional fixtures and rolls them back; it requires existing verified accounts/enrollment and an effective agreement. SQL claims tests do not prove signed GoTrue login/MFA. Consult the release report before running it against a shared database.

Optional test-container settings: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an installed browser; `TIDALIS_BROWSER_USE_ENV_PROXY=true` configures its egress proxy. `TIDALIS_AUTH_TEST_NODE_TRANSPORT=true` forwards the actual negative Auth request through Node when Chromium cannot use the container proxy; it never supplies a fake API result.

## Deployment

Push a feature branch for review/Preview, then merge the verified changes into Vercel's configured Production Branch. Confirm the deployed source commit contains 0.5.10. Redeploy is appropriate for rebuilding that commit after configuration changes. Full instructions are in the release guide; Vercel deployment is left to the project owner.

Phase-specific guides remain for historical context. Their old environment flags and rollout instructions are superseded by the release guide.
