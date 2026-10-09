const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const sql=read('supabase/migrations/004_seller_onboarding.sql');
const seller=read('components/SellerApply.tsx');
const apply=read('app/sell/apply/page.tsx');
const admin=read('app/admin/seller-applications/page.tsx');
const policyPage=read('app/policies/[slug]/page.tsx');
const policyAdmin=read('app/admin/policies/page.tsx');
const cases=[
  ['production policies require published effective version and approved_by',()=>{
    assert.match(sql,/status='published'\s+and approved_by is not null and effective_from<=now\(\)/);
    assert.match(apply,/\.eq\('status','published'\)/);
    assert.match(apply,/NEXT_PUBLIC_LEGAL_DOCUMENTS_APPROVED/);
  }],
  ['acceptance is timestamped by DB and pinned to policy version',()=>{
    assert.match(sql,/agreement_version_id uuid references/);
    assert.match(sql,/insert into public\.policy_acceptances/);
    assert.match(sql,/agreement_version_id,agreement_accepted_at,submitted_at/);
    assert.match(sql,/v_policy\.id,now\(\),now\(\)/);
    assert.match(seller,/p_agreement_version_id:policy\.id/);
  }],
  ['browser cannot directly insert seller applications',()=>{
    assert.match(sql,/revoke insert, update, delete on public\.seller_applications/);
    assert.match(sql,/drop policy if exists applications_create/);
    assert.doesNotMatch(seller,/\.from\('seller_applications'\)\.insert\(/);
  }],
  ['admin MFA checked before approval and review with audit',()=>{
    assert.match(sql,/function public\.review_seller_application/);
    assert.match(sql,/if not public\.is_platform_admin\(auth\.uid\(\)\)/);
    assert.match(sql,/insert into public\.audit_logs/);
    assert.match(admin,/approveApplication/);
    assert.match(admin,/reviewApplication/);
  }],
  ['published text locked and full agreement displayed',()=>{
    assert.match(sql,/tidalis_lock_published_policy/);
    assert.match(policyPage,/published\.content/);
    assert.match(policyAdmin,/p\.content/);
    assert.doesNotMatch(policyPage,/dangerouslySetInnerHTML/);
  }],
  ['re-review, resubmit and rollback safe approvals',()=>{
    assert.match(sql,/function public\.resubmit_seller_application/);
    assert.match(sql,/where id=p_application_id for update/);
    assert.match(sql,/v_policy\.id<>v_app\.agreement_version_id/);
    assert.match(sql,/seller_one_open_application_per_user/);
    assert.match(sql,/v_app\.description,'paused'/);
    assert.match(read('lib/auth.ts'),/\['active','paused'\]/);
  }],
  ['no auto-publication of legal placeholder',()=>{
    assert.match(sql,/Explicit legal-review confirmation required/);
    assert.match(policyAdmin,/name="reviewed"/);
    assert.doesNotMatch(sql,/insert into public\.platform_policy_versions[^;]*published[^;]*values[^;]*'published'/i);
  }],
];
for(const [name,test] of cases){try{test();console.log('PASS '+name)}catch(e){console.error('FAIL '+name,e.message);process.exitCode=1}}
console.log(`Phase 4 structural checks: ${cases.length} cases; not a live DB or integration test`);
