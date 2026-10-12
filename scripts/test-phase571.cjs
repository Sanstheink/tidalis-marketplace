/* Phase 5.7.1 structural checks; NOT a Postgres / storage RLS integration test. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const get=p=>fs.readFileSync(p,'utf8');
const sql=get('supabase/migrations/007_shop_policy_documents.sql');
const ui=get('components/SellerPolicyComposer.tsx');
const seller=get('app/seller/policies/page.tsx');
const admin=get('app/admin/shop-policies/page.tsx');
const pub=get('lib/public-policies.ts');
const shop=get('app/shops/[slug]/page.tsx');
const tests=[
 ['migration does not seed shops, publish policy or enable payments',()=>{
   assert.doesNotMatch(sql,/insert into public\.shops|update public\.shops|insert into public\.orders|update public\.orders|truncate\s|drop table/i);
 }],
 ['existing draft text can be short and submit still requires 200 chars',()=>{
   assert.match(sql,/length\(trim\(coalesce\(p_content,''\)\)\) not between 1 and 30000/);
   assert.match(sql,/v_policy\.source_type='text' and length\(trim\(v_policy\.content\)\)<200/);
   assert.match(ui,/text\.length<1/);
 }],
 ['PDF uploads are private, limited, and restricted to MIME PDF',()=>{
   assert.match(sql,/tidalis-policy-documents','tidalis-policy-documents',false,8388608/);
   assert.match(sql,/allowed_mime_types=array\['application\/pdf'\]/);
   assert.match(ui,/MAX_PDF=8\*1024\*1024/);
   assert.match(ui,/magic!=='%PDF-'/);
 }],
 ['storage ACL checks MFA owner-manager, privileged admin and published-active',()=>{
   assert.match(sql,/create policy tidalis_policy_pdf_upload[\s\S]*?is_shop_member/);
   assert.match(sql,/array\['owner','manager'\]/);
   assert.match(sql,/create policy tidalis_policy_pdf_read[\s\S]*?public\.is_platform_admin/);
   assert.match(sql,/pv\.status='published' and pv\.source_type='pdf' and s\.status='active'/);
 }],
 ['SQL columns use qualified storage name (avoid 42702)',()=>{
   assert.match(sql,/storage\.objects\.name/);
   assert.doesNotMatch(sql,/storage\.foldername\(name\)/);
 }],
 ['PDF draft RPC verifies storage object owner MIME size and shop authorization',()=>{
   assert.match(sql,/create or replace function public\.save_shop_policy_document_draft/);
   assert.match(sql,/owner_id=auth\.uid\(\)::text/);
   assert.match(sql,/v_object\.metadata->>'mimetype'/);
   assert.match(sql,/v_object\.metadata->>'size'/);
   assert.match(sql,/p_file_path !~/);
 }],
 ['PDF publication is blocked when the document is missing',()=>{
   assert.match(sql,/create trigger tidalis_validate_shop_policy_publication/);
   assert.match(sql,/Cannot publish a shop policy with a missing PDF document/);
 }],
 ['already published PDF path cannot be changed',()=>{
   assert.match(sql,/new\.document_path is distinct from old\.document_path/);
   assert.match(sql,/new\.document_name is distinct from old\.document_name/);
   assert.match(sql,/new\.document_size is distinct from old\.document_size/);
 }],
 ['no browser direct policy table writes',()=>{
   assert.match(ui,/rpc\('save_shop_policy_draft'/);
   assert.match(ui,/rpc\('save_shop_policy_document_draft'/);
   assert.doesNotMatch(ui,/\.from\('shop_policy_versions'\)\.(insert|upsert|update|delete)/);
 }],
 ['existing draft is edited, not duplicated',()=>{
   assert.match(ui,/const matched=existing\.find/);
   assert.match(ui,/p_draft_id:draft\?\.id\|\|null/);
   assert.match(ui,/under_review/);
 }],
 ['seller and admin have short-lived document preview links',()=>{
   assert.match(seller,/createSignedUrl\(p\.document_path!,300/);
   assert.match(admin,/createSignedUrl\(p\.document_path!,300/);
   assert.match(admin,/ไม่สามารถเข้าถึงเอกสารได้/);
 }],
 ['public only requests published shop policy docs for active shops',()=>{
   assert.match(pub,/\.eq\('status','published'\)\.eq\('shop\.status','active'\)/);
   assert.match(pub,/createSignedUrl\(row\.document_path,300/);
   assert.match(shop,/p\.source_type==='pdf'/);
   assert.doesNotMatch(pub,/service.role|service_role/);
 }],
 ['original policy review RPC and audit remain',()=>{
   assert.match(sql,/create or replace function public\.submit_shop_policy_draft/);
   assert.match(sql,/insert into public\.audit_logs/);
   assert.match(admin,/action=\{reviewShopPolicy\}/);
 }],
];
let failed=0;
for(const [name,fn] of tests){try{fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name, e.message)}}
console.log(`Phase 5.7.1 structural checks: ${tests.length-failed}/${tests.length} passed`);
if(failed)process.exitCode=1;
