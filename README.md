# Marketplace Tidalis — 0.6.4

Phase 6 connects fixed-price orders, direct shop/platform payments, verified proof review, private downloads, individual seller operations, ordinary receipts, Commission briefs/quotes/order delivery, manual refunds, reconciliation, and fee credits. See [PHASE6_COMPLETION.md](PHASE6_COMPLETION.md) and [OPERATIONS.md](OPERATIONS.md).

Shops open and publish products/policies through owner-scoped self-service RPCs. Configure actual recipients, issuer identity, fee rules and published policies. Public storefronts show published products from active shops. Platform documents support real zero balances without inventing payments. Historical demo checkout is isolated under `/preview`.

## Local setup

Use Node 24 or Node 22. Dependencies are pinned with a committed lockfile.

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

The new self-service migration enables seller/order intake and self-publication when the owner applies it. Admin intake controls remain available. A real effective, approved Seller Agreement is still required. Both new migration files and historical hosted timestamp mappings are listed in OPERATIONS.md. The former legal environment flag is no longer used by the app.

## Tests

```bash
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
```

`npm test` invokes historical source/unit/database checks. Legacy fixtures explicitly select manual-review mode; they do not establish acceptance coverage for the self-service release. No functional tests or build were executed during this iteration, as requested by the owner. CI builds core browser checks with placeholder configuration, then tests signed buyers against a fresh local Supabase Auth/Postgres/Storage stack. It never modifies the hosted project. The opt-in live browser suite is separate:

```bash
TIDALIS_LIVE_TESTS=true npm run test:browser
```

This suite reads the configured project and sends one invalid-password request for a nonexistent account. It does not sign up users or send email. `tests/db/live-policy-smoke.sql` is a migration-owner SQL probe that creates transactional fixtures and rolls them back; it requires existing verified accounts/enrollment and an effective agreement. SQL claims tests do not prove signed GoTrue login/MFA. Consult the release report before running it against a shared database.

Optional test-container settings: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an installed browser; `TIDALIS_BROWSER_USE_ENV_PROXY=true` configures its egress proxy. `TIDALIS_AUTH_TEST_NODE_TRANSPORT=true` forwards the actual negative Auth request through Node when Chromium cannot use the container proxy; it never supplies a fake API result.

## Deployment

Push a feature branch for review/Preview, then merge the verified changes into Vercel's configured Production Branch. Confirm the deployed source commit contains 0.6.4 and all source migrations recorded in OPERATIONS.md have been applied, and verify the intake settings produced by the self-service migration. Redeploy is appropriate for rebuilding that commit after configuration changes. Full instructions are in the release guide; Vercel deployment is left to the project owner.

Phase-specific guides remain for historical context. Their old environment flags and rollout instructions are superseded by the release guide.
