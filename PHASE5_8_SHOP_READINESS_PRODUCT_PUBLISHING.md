# Tidalis Phase 5.8 — Shop Readiness & Product Publishing

This patch applies **after Phase 5.7.1 and Migration 007**. It is the last planned **core** Phase 5 patch. Bug fixes and deployment hardening may still be required.

**Deployment safety:** GitHub/Vercel Preview may use the **Production Supabase project** even when the app URL contains `preview`. VERIFY which Supabase project each deployment points at. No tests that write to a database should run on Production before sign-off.

## Capabilities

- Seller `/seller/readiness`: shop readiness checklist and request for opening an approved **paused** shop. Owner or manager + Supabase TOTP MFA (AAL2) required.
- Admin `/admin/shop-readiness`: review, request information, reject or activate shop; MFA + role checked again inside a security-definer RPC. Status `active` exposes shop in `/artists`, **not checkout**.
- Seller `/seller/products` and `/seller/products/[id]`: ensure preview, valid license prices/terms, source files and required description/work type; request product review, withdraw a pending request, or archive published inventory.
- Admin `/admin/product-reviews`: inspect product description, personal/commercial prices & terms, signed private preview and delivery file links; request changes/reject/publish via verified MFA RPC.
- Public `/`, `/shop`, `/products/[slug]`, `/shops/[slug]`: list only published products of active shops; preview images use 5-minute signed URLs from a PRIVATE bucket. **Source files/deliverables are never public**.
- Seller owner/manager or MFA Admin may **pause** an active shop at any time; all public shop/product read policies hide it again. Re-opening requires a fresh readiness request and Admin approval. Old signed previews may remain usable up to 300 seconds.
- Review actions write an audit log. Published product metadata/attached file records/price rows become immutable; archive removes product from listing. Rejection returns it to editable draft.
- Orders, cart and payment integrations remain **disabled** for these live products. The legacy **demonstration** cart/checkout is not connected to live purchases.

## 0. Prerequisites

A) Phase 5.7.1 in GitHub `main` (or tested on a branch) and migrations `001` → `007` successfully installed in isolated Supabase **Staging**.

B) Access to an approved Seller shop, Seller account with TOTP MFA, MFA Admin account, realistic legally reviewed policies, and a separate buyer/anonymous session. Do not create bypassed production shops or publish legal placeholders.

C) For an activation request, shop must be paused, have an **approved seller application** linked via `seller_applications.created_shop_id`, **published** platform policies `terms`, `privacy`, `seller-agreement`, `payment-refund`, `copyright`, published shop policies `refund`, `delivery`, `license`, and **at least one publication-ready product**. A prepared product needs 30+ chars description, valid shop work type, Personal & Commercial price >0 with >=20-char terms, ≥1 stored JPEG/PNG/WebP preview. Ready-made needs stock >0 and delivery file; Digital Asset needs delivery file; commission needs no pre-sale deliverable. This is a checklist for VISIBILITY only; do not treat it as a payment go-live signoff.

D) Source and SQL should pass technical/security review before deployment. This patch was not run against your real database, nor was a full Next.js build verified in the assistant environment.

## 1. Git steps (non-destructive)

```bash
cd ~/Downloads/tidalis-marketplace
git status
# Commit/stash unrelated work before continuing.
git switch -c feat/phase5-8-publication
git apply --check ~/Downloads/tidalis-phase5-8-shop-readiness.patch
git apply ~/Downloads/tidalis-phase5-8-shop-readiness.patch
npm install
npm run check:source
npm run test:phase5-8
npm run test:phase5-7-1
npm run test:phase5-5
npm run typecheck
npm run build
```

If `git apply --check` fails, STOP. This patch was prepared against the provided Phase 5.7.1 sources, not arbitrary changes on your PC.

If the full build passes:

```bash
git add .
git diff --cached --check
git commit -m "feat: phase 5.8 shop readiness and product publishing"
git push -u origin feat/phase5-8-publication
```

Create a GitHub Pull Request. Do **NOT** merge to Production yet.

## 2. Staging-only migration order

1. Provision an **independent Supabase Staging project** with the latest migrations 001-007, using sanitized/synthetic data. Verify its project URL / publishable key are set on the Vercel Preview. Check server-side env variables as well as browser-visible ones.
2. Snapshot Staging, then run `supabase/migrations/008_shop_readiness_product_publishing.sql` using Supabase SQL Editor or your versioned migration runner. Do **not** run the whole file repeatedly after a partial error.
3. Confirm the SELECT-only checks below. No schema change should be applied straight to Production until you can demonstrate the full Staging flow and examine existing data/RLS impacts.
4. Confirm bucket `tidalis-product-files` remains `public=false`; inspect all SELECT policies on `storage.objects` (there can be policies other than the ones created here). Existing permissions are additive. Explicitly test anon can sign only PUBLISHED preview images, and cannot sign any `deliverables` path.
5. Build and redeploy the Vercel Preview with **Staging** variables before testing the UI.

### Preflight: read-only checks

```sql
select to_regclass('public.shops') as shops,
       to_regclass('public.products') as products,
       to_regclass('public.shop_policy_versions') as shop_policies,
       to_regclass('public.seller_applications') as applications,
       to_regclass('public.product_files') as product_files;
select id, public, file_size_limit from storage.buckets
where id in ('tidalis-product-files','tidalis-policy-documents');
select status, count(*) from public.shops group by status order by status;
select status, count(*) from public.products group by status order by status;
select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('save_shop_policy_document_draft','submit_shop_policy_draft',
    'approve_seller_application','attach_seller_product_file')
order by proname;
```

### Postflight: read-only checks

```sql
select to_regclass('public.shop_readiness_requests') as readiness_requests,
       to_regprocedure('public.submit_shop_readiness(uuid,text)') as request_rpc,
       to_regprocedure('public.review_shop_readiness(uuid,text,text,boolean)') as shop_review_rpc,
       to_regprocedure('public.submit_product_for_review(uuid)') as submit_product_rpc,
       to_regprocedure('public.review_product_publication(uuid,text,text,boolean)') as publish_rpc;
select column_name from information_schema.columns
where table_schema='public' and table_name='products'
  and column_name in ('submitted_at','reviewed_at','reviewed_by','review_note','published_at')
order by column_name;
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where (schemaname='storage' and tablename='objects')
   or (schemaname='public' and tablename in ('products','product_files','shop_readiness_requests'))
order by schemaname,tablename,policyname;
```

**IMPORTANT:** The `pg_policies` report should be reviewed for permissive OR policies that bypass the new visibility restrictions. Merely counting expected new policy names is not sufficient.

## 3. Website acceptance tests (Staging only)

| Scenario | Action | Expected |
|---|---|---|
| 0 public shops | Open `/artists` and `/` | No fake shops/products; friendly empty state |
| Approved but `paused` | Open `/artists` as anonymous | Shop not listed |
| Missing required policies | Open `/seller/readiness` as MFA Seller | Detailed missing items; cannot submit |
| Prepared shop | Publish legally reviewed policies + one complete product via normal Staging workflow; click “submit readiness” | Request `submitted`, shop still `paused` |
| Anonymous / other shop | Open `/admin/shop-readiness` | No admin access |
| Admin requests info | `/admin/shop-readiness`: needs info with ≥12-char note | Seller sees note, shop stays `paused`, can re-submit |
| Admin approves | Select approve + confirmation | Shop becomes `active`; `/artists` shows it, no checkout |
| Incomplete Draft product | `/seller/products/[id]` → submit | Refused with blocker list |
| Complete Draft product | Submit for review | `under_review`, not listed publicly |
| Seller tries bypass | Try direct Supabase table UPDATE/INSERT with their own AAL2 session | Denied (grants/RLS) |
| Other shop's Seller | Try review/submit somebody else's product | Denied |
| Anonymous / without MFA | Try Admin review / signed private file | Denied |
| Admin requests changes | Review product with note ≥12 chars | Back to editable Draft; audit recorded |
| Admin approves | Active shop, complete product, inspected files and license terms, confirm | `published`, product and actual preview visible to anonymous |
| Private deliverable | Attempt anon signed URL for `deliverables` | Denied, even if product is published |
| Unlist product | Seller Owner/Manager archives published item | Absent from public listings; data and audit preserved |
| Emergency shop pause | Owner/Manager or Admin pauses active shop with reason | Public directory and its products disappear; audit written |
| Reopen | Seller submits new readiness request; Admin reapproves after checking published products still valid | Never reopens by itself |
| Stale / duplicate actions | Resubmit pending, approve twice, approve if shop paused, modify prices while pending/published | Rejected safely |
| Signed preview link expiry | Wait >300 seconds and try original link | Link expires; new public request obtains fresh link if still published |

IMPORTANT: Shop `paused`, product `under_review`, or policy `draft` MUST never become public through cache, query filters, or RLS. Note that a signed URL generated earlier can remain usable **until its 300-second expiry**; visibility revocation is not instantaneous for previously issued links.

## 4. Production rollout gate and rollback strategy

**Do not merge or install 008** until:
- Staging acceptance tests above pass, database RLS and storage policies are reviewed, and Vercel Preview points to Staging.
- All legal texts are approved and current, the Production `007` migration status has been validated, current SQL grants/policies recorded, and backups/restores are verified.
- The reviewer understands that store activation makes shops publicly visible; it **does not make order/payment routes ready**, and must not be used to accept buyers' money.

Deployment order on Production when authorized: (a) capture backup and relevant Storage object manifest, (b) review and apply migration 008 during controlled window, (c) verify postflight and no unexpected public rows, (d) deploy app changes by merging PR, (e) smoke test anonymous views and permissions without creating fake Production policies/orders, (f) monitor logs. **No Production changes have been made by this patch delivery.**

If a problem occurs: pause rollout and revert application commit on GitHub to restore previous behavior. **Do not run `DROP TABLE`, delete Storage objects or roll back RLS blindly.** SQL schema changes may remain dormant until a separately reviewed corrective migration is ready. Keep existing records and audit intact.

## 5. Limitations before Phase 6

1. No buyer order state machine, PromptPay payment initiation, manual proof verification, refunds, tax documents, or genuine download delivery. All live-product purchase actions remain disabled.
2. Private uploaded files are only protected by file type/size metadata; anti-malware/content moderation, thumbnail processing and image safety review are manual for now. Do not treat file extensions/MIME as trusted proof.
3. A 300-second signed preview URL is a bearer URL. Public preview images are intentionally viewable by anyone while published; do not upload paid/source files into the `previews` folder.
4. The base Seller dashboard uses the first shop membership; full multi-shop switching remains separate work. Test multi-shop privileges explicitly.
5. PostgreSQL triggers, SQL compilation and production RLS need real environment testing; structural tests alone are not an integration or security audit.
