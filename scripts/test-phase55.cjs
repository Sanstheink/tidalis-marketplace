// Static safeguards only; run npm run build and integration QA against Staging too.
const fs=require('fs');
let pass=0;
function check(name,ok){if(!ok){console.error('FAIL: '+name);process.exitCode=1;}else{console.log('PASS: '+name);pass++}}
const src=(p)=>fs.readFileSync(p,'utf8');
const publicCatalog=src('lib/public-catalog.ts');
const home=src('app/page.tsx'),shop=src('app/shop/page.tsx');
const detail=src('app/products/[slug]/page.tsx');
const shopPage=src('app/shops/[slug]/page.tsx');
check('public storefront requires published products',publicCatalog.includes(".eq('status','published')") && publicCatalog.includes(".eq('shop.status','active')"));
check('public API uses only publishable/anon key',publicCatalog.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') && !publicCatalog.includes('SERVICE_ROLE'));
check('no product_files or storage paths queried',!publicCatalog.includes('product_files') && !publicCatalog.includes('file_path') && !publicCatalog.includes('storage.from'));
check('server-only read boundary',publicCatalog.includes("import 'server-only'") && !src('lib/public-catalog-shared.ts').includes('server-only'));
check('home and shop query real data',home.includes('getPublicProducts(') && shop.includes('getPublicProducts(') && !home.includes("from '@/lib/catalog'") && !shop.includes("from '@/components/ShopGrid'"));
check('product detail does not expose checkout',detail.includes('getPublicProductByRoute(') && !detail.includes('ProductPurchase') && !detail.includes('addToCart'));
check('public product page guards publication',publicCatalog.includes(".eq('slug',match[1])") && publicCatalog.includes(".eq('id',match[2])"));
check('shop page queries active shops',shopPage.includes('getPublicShop(') && publicCatalog.includes(".eq('status','active').maybeSingle()"));
check('no missing featured fallback',home.includes('products.length?') && home.includes('empty-state'));
check('shared helpers safe in client',!src('components/PublicProductCard.tsx').includes("from '@/lib/public-catalog'") && !src('components/PublicShopGrid.tsx').includes("from '@/lib/public-catalog'"));
check('live product types only preview design',src('components/PublicProductCard.tsx').includes('ภาพ Placeholder') && detail.includes('Private'));
console.log('Phase 5.5 static guards: '+pass+'/11 passed');
