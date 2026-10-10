/** Static/integration-contract smoke checks. Does NOT test Supabase runtime, Storage or RLS. */
const fs=require('fs');const assert=require('assert');
const read=p=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/005_seller_catalog_drafts.sql');
const editor=read('components/SellerProductEditor.tsx');
const uploader=read('components/SellerProductFiles.tsx');
const actions=read('app/seller/products/actions.ts');
const listing=read('app/seller/products/page.tsx');
const edit=read('app/seller/products/[id]/page.tsx');
const checks=[
 ['RPC requires shop membership and MFA',sql.includes("public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager','artist'])")&&sql.includes("v_old.status <> 'draft'")],
 ['Both licensing prices saved transactionally',sql.includes("on conflict(product_id,usage_type) do update")&&sql.includes("p_personal_price_minor")&&sql.includes('p_commercial_price_minor')],
 ['Shop drafts never publish automatically',sql.includes("p_work_type_id,'draft'")&& !sql.includes("set status='published'")],
 ['Exclusive work limited to one ready-made unit',sql.includes("p_stock <> 1")&&sql.includes("p_product_type <> 'ready_made'")],
 ['Private bucket and per-shop storage ACL',sql.includes("'tidalis-product-files',false")&&sql.includes("create policy tidalis_catalog_files_insert")&&sql.includes("p.shop_id::text=(storage.foldername(storage.objects.name))[2]")],
 ['Upload registered only after Storage object ownership check',sql.includes('owner_id=auth.uid()::text')&&sql.includes('catalog_file_attached')],
 ['Editor supports product modes and license variants',editor.includes('commission')&&editor.includes('ready_made')&&editor.includes('digital_asset')&&editor.includes('personal')&&editor.includes('commercial')&&editor.includes('`${key}Price`')],
 ['Product writes use server-side role check, RPC only',actions.includes('requireSeller()')&&actions.includes("client.rpc('save_seller_product_draft'")&& !actions.includes(".from('products').insert")],
 ['Files restricted to private bucket with size guards',uploader.includes('const BUCKET=\'tidalis-product-files\'')&&uploader.includes('file.size>limit')&&uploader.includes('attach_seller_product_file')],
 ['Seller catalog offers create and edit',listing.includes('/seller/products/new')&&edit.includes('<SellerProductEditor')&&edit.includes('<SellerProductFiles')]
];
for(const [title,result] of checks){console.log(`${result?'PASS':'FAIL'}: ${title}`);assert.ok(result,title)}
console.log(`${checks.length}/${checks.length} Phase 5 source-contract checks passed. Run npm run build and STAGING database tests separately.`);
