# Marketplace Tidalis — Phase 4: Seller Onboarding & Admin Review

> **Important: Production database.** This update is not installed automatically. Applying `004_seller_onboarding.sql` changes database privileges, functions, indexes and a trigger. Review with a qualified DBA and make a verified backup first. Test on a separate **schema-identical non-production clone** before any Production deployment. Never publish placeholder legal terms just to unlock signup.

## What's included

- `/sell/apply`: authenticated seller applications, portfolio HTTPS link, shop name/slug, **currently published** Seller Agreement vN, re-acceptance on resubmission.
- `/sell/application`: own application history, applicant-visible admin explanation, resubmit when `needs_information`.
- `/admin/seller-applications`: permissioned queue, approve, reject and ask for information; review reasons and confirmation.
- `/admin/policies`: create a **draft** Seller Agreement, inspect full text and manually publish only after genuine legal review and authorization.
- `/policies/seller-agreement`: show actual currently published, effective agreement; otherwise show **draft warning**. Published content is displayed as text, not raw HTML.
- `004_seller_onboarding.sql`: RPC-only application writes, server-set acceptance timestamp, immutable policy version, admin-MFA approval and audit record.

## Safety properties

1. `NEXT_PUBLIC_LEGAL_DOCUMENTS_APPROVED=true` is only a **UI gate**, never sufficient authorization. The database independently checks the latest effective, approved and published policy, actual applicant acceptance, and email verification.
2. All creation/approval/rejection/alteration actions use `SECURITY DEFINER` RPCs that validate `auth.uid()` and server-side user/admin roles; admin actions additionally require JWT assurance `aal2` via `is_platform_admin` from Phase 3.
3. Direct browser INSERT/UPDATE/DELETE on `seller_applications` are revoked. RLS remains enabled. The applicant can read their own application; admin read still requires MFA.
4. Approval atomically creates a **PAUSED (not public/live)** `shops` record, `shop_members` (owner), updates the application and records an Audit Log. Seller Studio accepts PAUSED shops after MFA; only a later readiness/policy-verification workflow may activate sales. Slug collisions fail with no partial data committed.
5. Policy acceptances are stored with the precise, immutable `platform_policy_versions.id`. When a newer version is published after submission, approval is blocked until the applicant reaccepts a valid version. For pending applications, Admin may request more information, then seller can resubmit.
6. The original Phase 1–3 functionality is unchanged; Phase 4 does **not** enable checkout, payment, digital delivery, VAT or a live financial system.
7. **Caution:** external HTTPS Portfolio links are *not* verified. Admin reviewers should avoid opening suspicious URLs; file/document upload review with private Supabase Storage is future work. Application rate limiting, bot protection and email notifications require additional integration before broad public onboarding.

## Phase 4 preflight queries (READ-ONLY)

Run these in Supabase SQL Editor on **the correct project**, before migrating.

```sql
-- Schema prerequisite
select to_regclass('public.seller_applications') as applications,
       to_regclass('public.platform_policy_versions') as policies,
       to_regclass('public.policy_acceptances') as acceptances,
       to_regclass('public.audit_logs') as audit_logs;

-- The partial unique index in 004 requires 0 duplicates here.
select user_id, count(*) as pending_count
from public.seller_applications
where status in ('submitted','under_review','needs_information')
group by user_id having count(*) > 1;

-- Check legacy rows. Old applications with no agreement version cannot be approved by Phase 4.
select status, count(*) as total,
       count(*) filter (where agreement_accepted_at is null) as missing_timestamp
from public.seller_applications group by status;

-- Check whether there's an actual approved, published agreement:
select id,version,title,status,effective_from,approved_by
from public.platform_policy_versions
where policy_type='seller-agreement' order by version desc;
```

Note: do not run queries referencing `agreement_version_id` until migration 004 has been applied.

## Deploy sequence

**In VS Code** (after Phase 3.1 is committed and on the current branch):

```bash
git status
git switch -c feat/phase4-seller-onboarding
git apply --check ~/Downloads/tidalis-phase4.patch
git apply ~/Downloads/tidalis-phase4.patch
npm install
npm run check:source
npm run test:phase4
npm run typecheck
npm run build
```

If `git apply --check` fails, STOP; do not force-apply or unpack a ZIP over your repository. Confirm your working tree is clean and Phase 3.1 exists in the source. Resolve version drift first.

**Database:** Make a recoverable backup, run preflight queries on Production read-only, apply Migration 004 **on a staging clone first**, and use the testing procedure below. Only once reviewed, deploy the code and apply the migration to Production during a controlled release. SQL Editor has elevated privileges; do not share admin passwords or bypass RLS.

**Policy publication:** In `/admin/policies`, use only a real, legally approved full Seller Agreement. Draft first, inspect rendered text, then publish with explicit confirmation. Keep `NEXT_PUBLIC_LEGAL_DOCUMENTS_APPROVED=false` while reviewing. Set `true` in the Vercel environments you intend to open **only after legal approval, policy publication, validation and testing**. Redeploy after changing the environment variable. Publication is not mandatory just to preview the UI.

**Git/Vercel:**

```bash
git add .
git commit -m "feat: phase 4 seller onboarding and auditable review"
git push -u origin feat/phase4-seller-onboarding
```

Open a Pull Request and inspect the Vercel Preview deployment, making sure the configured Supabase environment matches your intended non-production test. Do not connect a publicly accessible Preview build to Production while testing privileged writes. The user must explicitly approve GitHub merge and Production migrations.

## QA scenarios on a non-production clone

1. **Without published policy:** `/sell/apply` shows locked notice; no RPC-created application.
2. **With real approved/published policy:** buyer with confirmed email accepts exact policy vN, submits; row records `agreement_version_id`; acceptance and audit rows exist.
3. **Admin AAL1:** cannot list or approve; verify denial through UI and RPC. After AAL2, admin can see application.
4. **Wrong role:** seller can call neither `approve_seller_application` nor `review_seller_application`.
5. **Need more info:** admin must enter 12+ character reason; seller sees it and can resubmit after reaccepting current terms.
6. **Reject:** admin reason recorded in audit; rejected cannot be resubmitted in place (new application required).
7. **Approve:** confirmation needed; a transaction creates a **paused** shop and owner membership exactly once; second approval rejected.
8. **Duplicate slug / concurrent requests:** unique constraint or RPC rejects without creating partial shop.
9. **Policy updated during review:** approval rejects old version; admin requests resubmission after new acceptance.
10. **Other seller:** cannot see other sellers' private application rows; policies cannot be modified after publication.

## Known limitations

- Do not mistake these structural tests for successful Supabase integration or a Vercel Production Build. Confirm both on your infrastructure.
- Legal review, Thailand-specific requirements, PDPA, platform agreements and operator approval must be completed externally before public onboarding.
- No uploaded seller KYC documents/portfolio assets or Resend application decision emails yet; those require separate private storage, rate limits and a job/outbox flow.
- Existing **legacy applications** without a recorded policy version are intentionally non-approvable; do not backfill fictitious acceptance. Ask the applicant to submit a new application under a genuinely published agreement, or design a separate audited legacy re-consent flow.
