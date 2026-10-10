const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const sql=read('supabase/migrations/009_seller_step_up_mfa.sql');
const old=read('supabase/migrations/003_phase3_auth_hardening.sql');
const guard=read('lib/auth.ts');
let passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
function fnBlock(s,name){const at=s.indexOf(`create or replace function public.${name}(`);assert.ok(at>=0,`missing ${name}`);return s.slice(at,s.indexOf('\n$$;',at)+4)}
function policyBody(name){let at=sql.indexOf(`create policy ${name} `);assert.ok(at>=0,`missing ${name}`);return sql.slice(at,sql.indexOf('\n);',at)+3)}

test('legacy seller member helper remains AAL2-only',()=>{assert.match(old,/create or replace function public\.is_shop_member[\s\S]*?'aal2'/);assert.doesNotMatch(sql,/create or replace function public\.is_shop_member\s*\(/)});
test('platform admin AAL2 remains untouched',()=>{assert.match(guard,/await requireMfa\(client,'\/admin'\)/);assert.doesNotMatch(sql,/create or replace function public\.is_platform_admin\s*\(/)});
test('AAL1 helper uses live verified TOTP enrollment',()=>{const x=fnBlock(sql,'tidalis_seller_routine_access');for(const pat of [/security definer/i,/set search_path = ''/,/auth\.mfa_factors/,/f\.status='verified'/,/f\.factor_type='totp'/,/m\.user_id=\(select auth\.uid\(\)\)/,/s\.status in \('active','paused'\)/,/m\.role=any\(p_roles\)/])assert.match(x,pat)});
test('AAL1 helper only callable by authenticated role',()=>assert.match(sql,/revoke all on function public\.tidalis_seller_routine_access\(uuid,text\[\]\) from public,anon;/));
test('seller page denies users without shop membership or verified factor',()=>{assert.match(guard,/client\.from\('shop_members'\)/);assert.match(guard,/client\.auth\.mfa\.listFactors\(\)/);assert.match(guard,/totp\?\.some\(f=>f\.status==='verified'\)/)});
test('seller route no longer forces per-login AAL2',()=>assert.doesNotMatch(guard.slice(guard.indexOf('export async function requireSeller()'),guard.indexOf('export async function getWorkspaceAccess')),/await requireMfa/));
test('only narrow AAL1 policies added',()=>{const all=[...sql.matchAll(/create policy (\w+) on ([\w.]+)/g)];assert.equal(all.length,13);for(const [,name,table] of all){assert.match(name,/^tidalis_routine_/);assert.ok(['public.shops','public.shop_work_types','public.products','public.product_license_prices','public.product_files','public.shop_policy_versions','public.shop_readiness_requests','storage.objects'].includes(table))}});
test('routine SQL never mentions finance, tax or payments tables',()=>assert.doesNotMatch(sql,/\b(public\.(orders|payment_transactions|refund_requests|seller_invoices|seller_tax_profiles|tax_profile_versions|finance_ledger_entries))\b/));
test('draft product RPC uses routine helper',()=>{const s=fnBlock(sql,'save_seller_product_draft');assert.match(s,/tidalis_seller_routine_access\(p_shop_id,array\['owner','manager','artist'\]\)/);assert.match(s,/catalog_draft_(created|updated)/)});
test('delivery attachment still uses legacy AAL2 helper',()=>{const s=fnBlock(sql,'attach_seller_product_file');assert.match(s,/when p_is_delivery_file\s+then public\.is_shop_member/);assert.match(s,/else public\.tidalis_seller_routine_access/)});
test('AAL1 storage upload is previews only',()=>{const s=policyBody('tidalis_routine_preview_upload');assert.match(s,/\[5\]='previews'/);assert.doesNotMatch(s,/deliverables/)});
test('AAL1 storage read is previews only',()=>assert.match(policyBody('tidalis_routine_preview_read'),/\[5\]='previews'/));
test('AAL1 policy PDFs remain private and role-scoped',()=>{for(const name of ['tidalis_routine_policy_pdf_upload','tidalis_routine_policy_pdf_read']){const s=policyBody(name);assert.match(s,/tidalis-policy-documents/);assert.match(s,/array\['owner','manager'\]/)}});
test('shop policy drafts are AAL1 but submit RPC not overwritten',()=>{assert.match(fnBlock(sql,'save_shop_policy_draft'),/tidalis_seller_routine_access/);assert.match(fnBlock(sql,'save_shop_policy_document_draft'),/tidalis_seller_routine_access/);assert.doesNotMatch(sql,/create or replace function public\.submit_shop_policy_draft\s*\(/)});
test('review and publish RPCs stay unchanged',()=>assert.doesNotMatch(sql,/create or replace function public\.(review_shop_policy|review_product_publication|review_shop_readiness|approve_seller_application|submit_product_for_review|submit_shop_readiness|pause_shop_visibility|archive_published_product)\s*\(/));
test('seller high-risk actions redirect through MFA',()=>{for(const f of ['app/seller/products/review-actions.ts','app/seller/policies/actions.ts','app/seller/readiness/actions.ts'])assert.match(read(f),/await requireMfa\(/)});
test('seller financial and tax pages still require AAL2',()=>{for(const f of ['finance','payments','refunds','documents','tax'])assert.match(read(`app/seller/${f}/page.tsx`),new RegExp(`requireMfa\\(client,'/seller/${f}'\\)`))});
test('buyer ordinary routes remain MFA-optional',()=>{assert.match(read('app/account/page.tsx'),/requireUser\('\/account'\)/);assert.doesNotMatch(sql,/create policy .* on public\.profiles/)});
test('UI requires step-up for submit, pause and file deliverables',()=>{assert.match(read('app/seller/readiness/page.tsx'),/elevated&&/);assert.match(read('app/seller/products/[id]/page.tsx'),/disabled=\{!elevated/);assert.match(read('components/SellerProductFiles.tsx'),/kind==='delivery'&&!elevated/)});
test('public storefront and admin files are unchanged by SQL',()=>{assert.doesNotMatch(sql,/drop policy|alter table|update public\.shops set status|insert into public\.platform_roles/i)});
test('no direct service role key or hardcoded account',()=>{assert.doesNotMatch(sql,/service_role|secret_key|auth\.users.*insert/i)});
console.log(`Seller Step-up MFA structural checks: ${passed}/21`);
