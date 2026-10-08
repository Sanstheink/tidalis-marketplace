# Marketplace Tidalis · Phase 3: Authentication / Buyer–Seller–Admin

Phase 3 integrates the Next.js SSR structure with **Supabase Auth**, **Postgres Row Level Security**, a Workspace Switcher and protected Buyer/Seller/Admin routes. Phase 2 catalog and checkout remain **demo only**. **Do not process funds or enable real orders.**

## A. Update the EXISTING VS Code repository

Phase 3 patch is based on the *Phase 2 source*, not the original Phase 1 source. Do **not** unzip over `.git` or apply both patch and ZIP.

```bash
cd ~/Downloads/tidalis-marketplace
git status
# Finish or commit Phase 2 work first. Do not discard changes.
git switch feat/phase2-storefront   # or main ONLY if Phase 2 was already merged
# When clean and at the Phase 2 code:
git switch -c feat/phase3-auth
git apply --check ~/Downloads/tidalis-phase3.patch
git apply ~/Downloads/tidalis-phase3.patch
npm install
npm run check:source
npm run test:phase2
npm run test:phase3
npm run typecheck
npm run build
# After all checks pass:
git add .
git diff --cached --stat
git commit -m "feat: phase 3 Supabase auth and role-based workspaces"
git push -u origin feat/phase3-auth
```

If the Phase 2 branch is already merged to main, use `git switch main` then `git pull --ff-only` BEFORE creating Phase 3 branch. If you have local edits, inspect/stash/commit them first. If `git apply --check` fails, stop and share the output; do not force-apply.

## B. Create a Supabase **STAGING** project

1. Create Supabase project for testing, separate from a future live project. No project has been created or changed by these deliverables.
2. Open **Settings → API / Connect** (labels may differ). Copy **Project URL** and **publishable (or legacy anon) key**, *never* `service_role`/secret key into `NEXT_PUBLIC_` variables.
3. In Supabase **SQL Editor**, have an authorized database operator **review**, then run in order:
   - `supabase/migrations/001_identity_catalog.sql`
   - `supabase/migrations/002_finance_tax.sql`
   - `supabase/migrations/003_phase3_auth_hardening.sql`
4. Verify tables, grants, policies and functions were created. The Phase 3 migration tightens seller/admin helper functions to require an authenticated user with **AAL2** for sensitive RLS queries. It does NOT make payment/tax systems production-safe.
5. Under Authentication settings, enable **Email confirmation**, set appropriate OTP expiry/rate limits and configure authorized redirect URLs. Enable **Google OAuth** only once Google Cloud credentials/callback and Supabase provider settings are configured; until then password login can be tested independently. Enable MFA TOTP and require step-up in the app.
6. Auth email templates: `/verify-email` supports **6-digit signup OTP**, but Supabase's standard template can send confirmation **links**. To send a six-digit code, configure the approved email template containing `{{ .Token }}`. For token hash links, direct to `/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (use the right auth domain and URL). For password recovery keep Supabase recovery links pointed to `/auth/callback?next=%2Freset-password` or configure a recovery token-hash confirmation route. Test actual emails end-to-end; never assume SMTP/Resend is connected.
7. Authorized URL examples: local `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/confirm`; Vercel production/staging `https://YOUR-VERCEL-URL/auth/callback`, `https://YOUR-VERCEL-URL/auth/confirm`. For each Preview hostname, add an allowed redirect pattern you control. Supabase's redirect allowlist and OAuth provider domains MUST be checked before testing previews. Prefer a **stable staging hostname** for auth tests to avoid constantly changing redirect URLs. Never set an unrestricted wildcard on an unrelated domain.

## C. Vercel environment variables

In Vercel Project → Settings → Environment Variables, set the following for **Preview** (and Production only when approved):

```ini
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_STAGING_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_STAGING_PUBLISHABLE_KEY
NEXT_PUBLIC_LEGAL_DOCUMENTS_APPROVED=false
```

For local development, put them in `.env.local` (ignored by Git); do not commit them. The `NEXT_PUBLIC_SITE_URL` setting is optional and must reflect each environment if used.

**Redeploy** after changing environment variables. Vercel Preview projects build from GitHub branches/PRs; open a PR from `feat/phase3-auth` into Phase 2's branch if Phase 2 is still open, otherwise into `main`.

## D. Test real accounts

| Actor | Setup | Test |
| --- | --- | --- |
| Buyer | Sign up at `/register`, verify email/OTP or approved link, log in | `/account`, `/workspace`, sign out, password recovery |
| Non-admin | Regular Buyer account | `/admin` MUST deny; `/seller` MUST redirect to `/sell/application` |
| Admin | Create/verify a separate account; trusted operator assigns platform role through SQL Editor | Enroll TOTP at `/mfa`, then `/admin`, `/admin/seller-applications` |
| Seller | Submit seller application only **after an approved Seller Agreement** is actually published | Admin MFA approves; seller MFA enrolls; `/seller`, `/seller/products`, `/seller/tax` |

**Never** create public `make-me-admin` endpoints or let users self-write `platform_roles`/`shop_members`.

### One-time Admin bootstrap (trusted SQL Editor only)

First locate/verify the desired user **by email** in Supabase Authentication users. Then in SQL Editor, after independently confirming UUID and account ownership:

```sql
-- Replace with the verified UUID from Supabase Auth users; do not use a guess.
insert into public.platform_roles (user_id, role)
values ('00000000-0000-0000-0000-000000000000', 'admin')
on conflict do nothing;
```

The UUID above is deliberately invalid as a real account and **must be replaced**. Do not paste SQL role assignments in a public webpage or browser console. In production require dual control and an audit process for administrative privilege grants.

### Seller approval prerequisite

Existing RLS requires a **published, effective** `seller-agreement` policy version, and the UI requires `NEXT_PUBLIC_LEGAL_DOCUMENTS_APPROVED=true` to open the application form. **Do not set this flag to true until an approved agreement is published.** For UI-only testing use `/preview`; do not simulate a real approval with arbitrary seed data on a production project.

### Optional test-only Seller account (STAGING project only)

If the legal Seller Agreement has not yet been approved, **do not** turn on public onboarding just for a test. To test the Seller UI in an isolated staging project, a trusted DBA may create a clearly marked QA shop and membership directly. This **does not test seller application approval**, and the data MUST NOT be migrated to production:

```sql
-- STAGING ONLY. Replace UUID with the verified Seller test auth.users.id.
with qa_shop as (
  insert into public.shops (owner_id, name, slug, description, status)
  values ('00000000-0000-0000-0000-000000000000', 'Tidalis QA Studio',
          'tidalis-qa-studio-01', 'Testing only / no live sales', 'active')
  returning id, owner_id
)
insert into public.shop_members(shop_id, user_id, role)
select id, owner_id, 'owner' from qa_shop;
```

Use a **different verified test account** for the seller and admin; enroll seller MFA before opening `/seller`. To repeat fixture creation, change the slug to avoid its unique constraint. Revoke the test role / delete test data from staging when finished. On the real service, Seller accounts must use the reviewed approval workflow.

### Negative tests / QA

- Unauthenticated `/account`, `/seller`, `/admin` redirects to Login, not private data.
- Buyer may see only their own buyer data. Buyer cannot read admin applications or another shop's private data through PostgREST.
- Account without seller membership cannot use Seller Studio, even if it edits browser state.
- Seller with AAL1 (not stepped up) cannot query seller-private RLS data; Seller with AAL2 and active membership can only query their own shop.
- Admin with AAL1 is denied privileged RLS reads; Admin with AAL2 may view allowed admin data. Verify **database policies**, not only UI redirects.
- `next=https://attacker.example` and `next=//attacker.example` must never redirect outside Tidalis.
- OTP links, password resets, signup with duplicate usernames, disabled Google OAuth, email rate limits, revoked sessions, and multiple-user sessions all need manual QA.
- SQL migrations need real Supabase integration tests before any production deployment; source-level tests alone are not enough.

## E. What's NOT built in Phase 3

- Username **login** (login uses email/password; usernames are unique display handles). A future secure resolver must avoid exposing email enumeration.
- Public seller agreements/policy acceptance version snapshots suitable for live release.
- Self-service team invitations and multiple-shop selection UI (membership stays scoped and protected).
- Orders, payments, refunds, VAT verification workflow, PDF issuance, safe downloads, Resend transactional notifications, production data migration or legal compliance sign-off.

## F. Rollback / troubleshooting

- Roll back a preview by redeploying the previous successful Vercel commit. This **does not roll back Supabase migrations**.
- Back up the staging DB and review migration steps before applying. Phase 3 replaces `is_shop_member` / `is_platform_admin` with stricter MFA-enforcing definitions. Existing RLS routes that relied on AAL1 will become inaccessible until MFA succeeds (intentional).
- If Vercel build fails, copy the **first build error**, not only the final `Command exited with 1` line. Fix in VS Code, commit, push to the same feature branch.
- Supabase redirect issues: verify Site URL, permitted Redirect URLs, Google provider redirect URL, and browser session cookies on the exact Vercel hostname.
