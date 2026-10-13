/* Phase 5.8 structural contracts. Real security requires separate Supabase staging integration tests. */
const fs=require('fs');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/008_shop_readiness_product_publishing.sql');
const sellerReady=read('app/seller/readiness/page.tsx');
const adminReady=read('app/admin/shop-readiness/page.tsx');
const adminProducts=read('app/admin/product-reviews/page.tsx');
const sellerProducts=read('app/seller/products/page.tsx');
const publicCatalog=read('lib/public-catalog.ts');
const publicCard=read('components/PublicProductCard.tsx');
const detail=read('app/products/[slug]/page.tsx');
const tests=[
  ['shop readiness only begins for approved seller',()=>assert.match(sql,/created_shop_id=p_shop_id and a.status='approved'/)],
  ['shop stays paused until MFA admin explicitly approves request',()=>{
    assert.match(sql,/public\.review_shop_readiness\(/);
    assert.match(sql,/public\.is_platform_admin\(auth\.uid\(\)\)/);
    assert.match(sql,/if p_decision='approved' and p_confirmed is distinct from true/);
    assert.match(sql,/update public\.shops set status='active'/);
    assert.ok(!/update public\.shops set status='active'/.test(sql.slice(0,sql.indexOf('create or replace function public.review_shop_readiness('))));
  }],
  ['shop requires all three published shop policies plus core legal documents',()=>{
    for(const p of ['refund','delivery','license','terms','privacy','seller-agreement','payment-refund','copyright'])assert.ok(sql.includes(`'${p}'`));
    assert.match(sql,/source_type='pdf'.*exists\(/s);
  }],
  ['shop requires prepared product, not just an empty draft',()=>assert.match(sql,/tidalis_product_publish_blockers\(v_product_id\)/)],
  ['no checkout or payment activation in migration',()=>{
    assert.doesNotMatch(sql,/update public\.orders|insert into public\.payment_transactions|update public\.payment_transactions/i);
  }],
  ['seller submits product but cannot self-publish',()=>{
    assert.match(sql,/create or replace function public\.submit_product_for_review/);
    const part=sql.split('create or replace function public.submit_product_for_review')[1].split('create or replace function public.review_product_publication')[0];
    assert.match(part,/status='under_review'/);
    assert.doesNotMatch(part,/status='published'/);
  }],
  ['admin product publication enforces MFA, active shop, revalidated blockers',()=>{
    const review=sql.split('create or replace function public.review_product_publication')[1].split('create or replace function public.withdraw_product_for_review')[0];
    assert.match(review,/is_platform_admin\(auth.uid\(\)\)/);
    assert.match(review,/p_confirmed is distinct from true/);
    assert.match(review,/status='active'/);
    assert.match(review,/tidalis_product_publish_blockers/);
  }],
  ['product requires preview image, both license prices, and stock/secure delivery',()=>{
    for(const s of ['preview_image_missing','license_prices_terms_incomplete','private_delivery_missing','ready_made_stock_missing','digital_asset_stock_zero','exclusive_stock_invalid'])assert.ok(sql.includes(s));
  }],
  ['published products cannot mutate content, licenses, or file rows',()=>{
    for(const s of ['tidalis_lock_reviewed_products','tidalis_lock_reviewed_product_children','before insert or update or delete on public.product_files']) assert.ok(sql.includes(s));
  }],
  ['all publication functions revoke public/anon and grant only authenticated',()=>{
    for(const fn of ['submit_shop_readiness','review_shop_readiness','submit_product_for_review','review_product_publication','archive_published_product','withdraw_product_for_review']){
      assert.ok(sql.includes(`revoke all on function public.${fn}(`));
      assert.ok(sql.includes(`grant execute on function public.${fn}(`));
    }
  }],
  ['storage stays private and anonymous preview never exposes deliverable',()=>{
    assert.match(sql,/bucket_id='tidalis-product-files' and \(storage.foldername\(storage.objects.name\)\)\[5\]='previews'/);
    assert.match(sql,/f\.is_delivery_file=false/);
    assert.match(sql,/p\.status='published' and s\.status='active'/);
    assert.match(sql,/public\.is_platform_admin\(\(select auth.uid\(\)\)\)/);
  }],
  ['published preview links are short-lived and only on read-only server code',()=>{
    assert.match(publicCatalog,/import 'server-only'/);
    assert.match(publicCatalog,/createSignedUrls\(paths,300\)/);
    assert.match(publicCatalog,/\.eq\('is_delivery_file',false\)/);
    assert.doesNotMatch(publicCatalog,/SERVICE_ROLE/);
  }],
  ['published listings show real approved preview and no purchase buttons',()=>{
    assert.match(publicCard,/product\.previewUrl/);
    assert.match(detail,/product\.previewUrl/);
    assert.doesNotMatch(detail,/ProductPurchase|addToCart/);
  }],
  ['seller readiness page gates request by paused status and role',()=>{
    assert.match(sellerReady,/shop\?\.status==='paused'/);
    assert.match(sellerReady,/\['owner','manager'\]/);
    assert.match(sellerReady,/tidalis_shop_readiness_blockers/);
  }],
  ['admin review pages have deny-first auth and explicit confirmation',()=>{
    assert.match(adminReady,/requirePlatformAdmin/);
    assert.match(adminReady,/confirmed/);
    assert.match(adminProducts,/requirePlatformAdmin/);
    assert.match(adminProducts,/confirmed/);
    assert.match(adminProducts,/createSignedUrl/);
  }],
  ['seller product list can submit/withdraw/archive and has readiness link',()=>{
    for(const s of ["value=\"submit\"","value=\"withdraw\"","value=\"archive\"","/seller/readiness"])assert.ok(sellerProducts.includes(s));
  }],
  ['owner or admin may pause published shop; reopening must pass another review',()=>{
    assert.match(sql,/create or replace function public.pause_shop_visibility/);
    assert.match(sql,/update public.shops set status='paused'/);
    assert.match(sql,/status='needs_information'/);
    assert.match(sql,/published_product_incomplete/);
    assert.match(read('app/seller/readiness/page.tsx'),/pauseOwnShopVisibility/);
    assert.match(adminReady,/adminPauseShopVisibility/);
  }],
  ['no automatic population of production rows or policy text',()=>{
    assert.doesNotMatch(sql,/insert into public\.shops\s*\(/i);
    assert.doesNotMatch(sql,/insert into public\.platform_policy_versions\s*\(/i);
    assert.doesNotMatch(sql,/update public\.products set status='published' where status='draft'/i);
  }],
];
let passed=0;
for(const [name,test] of tests){try{test();passed++;console.log('PASS',name)}catch(e){process.exitCode=1;console.error('FAIL',name,'—',e.message)}}
console.log(`Phase 5.8 structural checks: ${passed}/${tests.length} passed (integration requires Supabase Staging)`);
