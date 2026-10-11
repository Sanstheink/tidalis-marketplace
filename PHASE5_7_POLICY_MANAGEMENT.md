# Tidalis Phase 5.7 — Policy Management (Staging first)

## Scope

This update extends Phase 5.6 with versioned policies in the existing Supabase tables. It adds **no template legal documents**, does **not** enable checkout, and does **not** activate paused shops.

- `/policies` lists eight platform categories and published/not-published status.
- `/policies/[slug]` displays only currently effective, approved, published versions of platform policies; otherwise shows a clear unpublished notice. Existing Seller Agreement approval remains managed using Phase 4's dedicated RPCs.
- `/admin/policies` adds general platform policy drafting, draft editing and explicit human legal-review confirmation for publication, using database RPCs; a visible version history remains.
- `/seller/policies` supports shop owner/manager drafting, editing and submitting refund/delivery/license/other policy versions for review.
- `/admin/shop-policies` supports approve/publish, request changes, or reject (with reasons), and writes audit entries.
- `/shops/[slug]` displays only approved and published policy versions of **active** shops. The entire private authoring/review flow remains inaccessible to public readers.

**Out of scope:** legal drafting, legal sign-off, shop activation, product publishing, binding checkout consent, payment, delivery/refunds. These are follow-up phases. Shop policies add to applicable law and platform policies; they may not waive non-waivable customer rights.

## Apply to VS Code

Precondition: your repo must contain Phase 5.6 and prior SQL migrations `001`–`005`. Commit/stash local work; do not overwrite your existing repo with the ZIP.

```bash
cd ~/Downloads/tidalis-marketplace
git status
git switch -c feat/phase5-7-policy-management
git apply --check ~/Downloads/tidalis-phase5-7-policies.patch
git apply ~/Downloads/tidalis-phase5-7-policies.patch
npm install
npm run check:source
npm run test:phase5-7
npm run test:phase4
npm run test:artists
npm run typecheck
npm run build
```

If `git apply --check` fails, **stop** and review your branch/merge status. Do not force apply or overwrite prior changes. Commit and push only after the build succeeds, then review through Vercel Preview.

```bash
git add .
git commit -m "feat: versioned platform and shop policy management"
git push -u origin feat/phase5-7-policy-management
```

Vercel Preview may show the UI, but its forms must **not** be used against Production for QA until the migration has been safely applied and the documents are truly approved. Vercel Preview may inherit Production Supabase environment variables, so do not assume a preview deployment is an isolated test environment.

## Database preflight: safe READ-ONLY checks on Production

**Back up Production and test migration 006 on a separate Supabase Staging project (or a properly isolated clone) first.** Running SQL Editor as a database owner bypasses RLS: do NOT perform RLS tests using owner SQL alone. These checks are read-only:

```sql
select to_regclass('public.shop_policy_versions') as shop_policies,
       to_regclass('public.platform_policy_versions') as platform_policies,
       to_regclass('public.audit_logs') as audit_logs;

select policy_type,status,count(*) as versions
from public.platform_policy_versions
group by policy_type,status order by policy_type,status;

select shop_id,policy_type,count(*) as published_count
from public.shop_policy_versions
where status='published'
group by shop_id,policy_type having count(*) > 1;

select policyname,cmd,qual from pg_policies
where schemaname='public' and tablename='shop_policy_versions';
```

If the last `HAVING` query returns rows, prior data already has competing published versions and should be reviewed before public exposure. The migration does not delete or silently modify those historical rows.

## SQL migration, only after review and staging tests

`supabase/migrations/006_policy_management.sql` adds review metadata; replaces shop policy SELECT RLS to limit anonymous reads to published policies of active shops; revokes direct policy-table writes; protects published shop-policy history; adds role/AAL2-protected RPCs for draft, submit, review and publish.

**Do not run on Production just to make preview buttons work.** Validate backups/rollback strategy, inspect changed grants and existing data, then use a reviewed change window. SQL changes are **not** deployed by Vercel/Git push automatically. Running the migration against Production should be an explicit operator decision. No legal text is seeded.

### Read-only checks after an authorized deployment

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='shop_policy_versions'
  and column_name in ('review_note','review_outcome','submitted_at','reviewed_at')
order by column_name;

select proname,prosecdef from pg_proc
where pronamespace='public'::regnamespace and proname in (
 'create_platform_policy_draft','update_platform_policy_draft','publish_platform_policy',
 'save_shop_policy_draft','submit_shop_policy_draft','review_shop_policy')
order by proname;

select policyname,cmd,qual from pg_policies
where schemaname='public' and tablename='shop_policy_versions';
```

All six RPCs must exist and be `SECURITY DEFINER` (`prosecdef = true`). The read policy must include `status='published'` **and** active shop check for anonymous visitors. SQL output alone does **not** prove that RLS works at the HTTP API layer.

## QA matrix — isolated Supabase Staging only

1. No policies: `/policies/[slug]` shows unpublished; `/shops/[slug]` shows no shop policy (if an active staging shop exists via the **normal approval flow**).
2. Buyer/anon with no MFA cannot call shop/admin policy write RPCs; a Seller from a different shop cannot edit/read private drafts.
3. Seller owner with AAL2 and an **approved, paused** shop: create refund draft, edit same version, submit; second submission and edits to pending should fail.
4. Admin with AAL2: request changes with mandatory note, seller sees note, revises, resubmits; reject and verify note/audit; approve and verify published policy. Policy approval **must not** flip `shops.status` to active.
5. Publish v2 after v1: v1 archived; attempt editing either published or archived row via approved RPC and via authenticated direct update (expected denied). Review `audit_logs` as Admin.
6. On an active staging shop only, anonymous API shows published policy but hides draft, under_review, archived and policies of paused shops. New platform policy has no public text until explicit Admin publication.
7. Regression: Seller Agreement Phase 4 signup, admin MFA, Seller Dashboard, Artist Directory `/artists` and public product pages still work.
8. Try on mobile, ensure form is usable and policy whitespace preserved; confirm no HTML execution from submitted content (React renders plain text).

Use **real reviewed documents** before allowing production publication. Do not invent or paste placeholder legal terms to enable tests. Never create a QA shop directly in Production or skip seller approval. RLS tests must use actual anon/authenticated Supabase sessions on Staging, not the privileged SQL Editor.

## Troubleshooting

- `function ... does not exist`: migration 006 not applied to the referenced project; preview environment may point to a different Supabase project.
- `Admin MFA required` / `Shop owner/manager MFA required`: re-authenticate with TOTP until Supabase JWT has `aal2`, and verify `platform_roles` / `shop_members` on an authorized environment.
- Only paused shops: expected to be missing from public `/artists` and `/shops/[slug]`; policy approval does not activate them.
- Public policy missing: must be `published`, have effective date/approver for platform policies, and shop must be active for shop policies.
- The tests in `scripts/test-phase57.cjs` are **structural tests**, not proof of database execution, real-user RLS, security penetration tests, or successful Next.js build.
