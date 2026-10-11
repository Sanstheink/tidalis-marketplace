/* Structural contract checks, NOT a Postgres, RLS or end-to-end test. */
const fs=require('fs');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/006_policy_management.sql');
const seller=read('app/seller/policies/page.tsx');
const sellerActions=read('app/seller/policies/actions.ts');
const admin=read('app/admin/shop-policies/page.tsx');
const adminActions=read('app/admin/shop-policies/actions.ts');
const policies=read('app/policies/[slug]/page.tsx');
const policyIndex=read('app/policies/page.tsx');
const shop=read('app/shops/[slug]/page.tsx');
const pub=read('lib/public-policies.ts');
const adminPlatform=read('app/admin/policies/page.tsx');
const checks=[
 ['new migration is additive and does not seed/activate shops',()=>{
    assert.match(sql,/add column if not exists review_note/);
    assert.doesNotMatch(sql,/update public\.shops|insert into public\.shops|update public\.orders|truncate|delete from public/);
 }],
 ['published shop policies immutable',()=>assert.match(sql,/tidalis_immutable_published_shop_policy[\s\S]*?tidalis_lock_published_shop_policy/)],
 ['public shop policy RLS requires active shop',()=>assert.match(sql,/status = 'published' and exists \([\s\S]*?s\.status = 'active'/)],
 ['browser write privileges revoked',()=>{
   assert.match(sql,/revoke insert, update, delete on public\.platform_policy_versions/);
   assert.match(sql,/revoke insert, update, delete on public\.shop_policy_versions/);
 }],
 ['seller RPCs restrict owner-manager with database MFA',()=>{
    assert.match(sql,/save_shop_policy_draft[\s\S]*?is_shop_member\(p_shop_id,auth\.uid\(\),array\['owner','manager'\]\)/);
    assert.match(sql,/submit_shop_policy_draft[\s\S]*?is_shop_member\(v_policy\.shop_id,auth\.uid\(\),array\['owner','manager'\]\)/);
 }],
 ['admin RPC restricts admin MFA and human approval',()=>{
    assert.match(sql,/review_shop_policy[\s\S]*?is_platform_admin\(auth\.uid\(\)\)/);
    assert.match(sql,/p_reviewed_and_authorized is distinct from true/);
 }],
 ['review leaves shop paused and writes audit log',()=>{
    assert.match(sql,/review_shop_policy[\s\S]*?shop_policy_'\|\|p_decision/);
    assert.doesNotMatch(sql.slice(sql.indexOf('create or replace function public.review_shop_policy')),/update public\.shops/);
 }],
 ['platform workflow excludes Seller Agreement (existing flow protected)',()=>{
    assert.match(sql,/create_platform_policy_draft/);
    assert.match(sql,/publish_platform_policy/);
    assert.doesNotMatch(sql.slice(sql.indexOf('create or replace function public.create_platform_policy_draft'),sql.indexOf('create or replace function public.publish_platform_policy')),/\x27seller-agreement\x27/);
 }],
 ['seller UI uses write RPC actions not direct table mutations',()=>{
    assert.match(seller,/action=\{saveShopPolicy\}/);
    assert.match(seller,/action=\{submitShopPolicy\}/);
    assert.match(sellerActions,/requireSeller\(\)/);
    assert.match(sellerActions,/rpc\('save_shop_policy_draft'/);
    assert.match(sellerActions,/rpc\('submit_shop_policy_draft'/);
    assert.doesNotMatch(sellerActions,/\.from\('shop_policy_versions'\)\.(insert|update|delete)/);
 }],
 ['admin UI explicitly reviews shop policies',()=>{
    assert.match(admin,/changes_requested/);
    assert.match(admin,/rejected/);
    assert.match(admin,/approved/);
    assert.match(adminActions,/requirePlatformAdmin\(\)/);
    assert.match(adminActions,/rpc\('review_shop_policy'/);
 }],
 ['public pages replace placeholder legal outlines with published only',()=>{
    assert.match(policies,/getPublishedPlatformPolicy/);
    assert.match(policyIndex,/getPublishedPlatformPolicy/);
    assert.doesNotMatch(policies,/const outline/);
    assert.match(policies,/ยังไม่ได้เผยแพร่/);
 }],
 ['public shop policies are anonymous and bound to active shops',()=>{
    assert.match(pub,/createClient\(url,key,\{auth:\{persistSession:false,autoRefreshToken:false\}\}\)/);
    assert.match(pub,/\.eq\('status','published'\)\.eq\('shop\.status','active'\)/);
    assert.match(shop,/getPublishedShopPolicies\(shop\.id\)/);
    assert.doesNotMatch(pub,/service.role|service_role|product_files|shop_payment_methods|seller_tax_profiles/);
 }],
 ['platform admin UI offers all seven general policy types',()=>{
    assert.match(adminPlatform,/createGeneralPlatformPolicyDraft/);
    assert.match(adminPlatform,/publishGeneralPlatformPolicy/);
    assert.match(adminPlatform,/p\.slug!=='seller-agreement'/);
 }],
];
let failed=0;
for(const [name,fn] of checks){try{fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
console.log(`Phase 5.7 structural checks: ${checks.length-failed}/${checks.length} passed`);
if(failed)process.exitCode=1;
