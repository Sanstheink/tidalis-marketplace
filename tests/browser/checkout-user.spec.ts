import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
test.skip(process.env.TIDALIS_LOCAL_USER_TESTS!=='true','Only run against the isolated local Supabase stack');
// Sessions/password requests must never appear in uploaded traces.
test.use({trace:'off',video:'off'});
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const shop='20000000-0000-4000-8000-000000000001',brush='30000000-0000-4000-8000-000000000001',exclusive='30000000-0000-4000-8000-000000000002';
const productPath=`/products/moonlit-brushes--${brush}`;
test.beforeAll(()=>{if(new URL(url).hostname!=='127.0.0.1')throw Error('User-flow fixtures must never run against a hosted project')});
async function signed(name='buyer'){
  const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await client.auth.signInWithPassword({email:`${name}@tidalis-test.invalid`,password:process.env.TIDALIS_TEST_BUYER_PASSWORD!});
  expect(error?.message).toBeUndefined();return client;
}
async function login(page:Page,next='/account/orders',name='buyer'){
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('อีเมล',{exact:true}).fill(`${name}@tidalis-test.invalid`);
  await page.getByLabel('รหัสผ่าน',{exact:true}).fill(process.env.TIDALIS_TEST_BUYER_PASSWORD!);
  const response=page.waitForResponse(r=>r.url().includes('/auth/v1/token')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
  expect((await response).status()).toBe(200);await expect(page).toHaveURL(new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'));
}
async function addBrush(page:Page,commercial=false){
  await page.goto(productPath);if(commercial)await page.getByRole('button',{name:/Commercial Use/}).click();
  await page.getByRole('button',{name:'เพิ่มลงตะกร้า',exact:true}).click();await expect(page.getByRole('status')).toContainText('เพิ่มลงตะกร้าแล้ว');
}
async function cleanOrders(){const client=await signed();const {data,error}=await client.from('orders').select('id').eq('status','pending');expect(error).toBeNull();for(const o of data||[]){const {error}=await client.rpc('cancel_fixed_order',{p_order_id:o.id});expect(error).toBeNull();}}
test.beforeEach(async()=>{await cleanOrders()});
test('buyer signs in through UI, orders with correct license/total, retains other-shop cart and cancels',async({page})=>{
  await addBrush(page,true);await page.getByRole('button',{name:'เพิ่มจำนวน',exact:true}).click();await page.getByRole('button',{name:'เพิ่มลงตะกร้า',exact:true}).click();
  // One initial add + two additional units = three commercial rights.
  await page.goto('/products/other-artwork--30000000-0000-4000-8000-000000000003');await page.getByRole('button',{name:'เพิ่มลงตะกร้า',exact:true}).click();
  await page.goto('/cart');await expect(page.locator('.shop-cart')).toHaveCount(2);
  await page.locator('.shop-cart').filter({hasText:'Moonlit Test Studio'}).getByRole('link',{name:'ตรวจสอบรายการ'}).click();
  await expect(page.getByRole('link',{name:'เข้าสู่ระบบเพื่อดำเนินการต่อ'})).toBeVisible();
  await login(page,'/checkout/moonlit-test-studio');
  await page.getByLabel('หมายเหตุ (ไม่บังคับ)').fill('Browser buyer note');
  await page.getByRole('checkbox').check();await page.screenshot({path:'test-results/checkout-ui/checkout-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'ยืนยันและจองสินค้า'}).click();await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading',{name:'บันทึกคำสั่งซื้อแล้ว'})).toBeVisible();await expect(page.locator('.order-note')).toHaveText('Browser buyer note');
  const id=page.url().split('/').at(-1)!;const client=await signed();
  const {data:order,error}=await client.from('orders').select('total_minor,policy_snapshot,status,order_items(quantity,usage_type,price_minor)').eq('id',id).single();
  expect(error).toBeNull();expect(order!.total_minor).toBe(75375);expect(order!.status).toBe('pending');expect(order!.policy_snapshot).toHaveLength(8);
  expect(order!.order_items).toEqual([{quantity:3,usage_type:'commercial',price_minor:25125}]);
  const privatePath=`shops/${shop}/products/${brush}/deliverables/50000000-0000-4000-8000-000000000002.zip`;
  const denied=await client.storage.from('tidalis-product-files').createSignedUrl(privatePath,30);expect(denied.error).not.toBeNull();
  await page.screenshot({path:'test-results/checkout-ui/order-desktop.png',fullPage:true});
  await page.goto('/cart');await expect(page.locator('.shop-cart')).toHaveCount(1);await expect(page.locator('.shop-cart')).toContainText('Other Test Studio');
  await page.goto(`/account/orders/${id}`);await page.getByRole('button',{name:'ยกเลิกคำสั่งซื้อ',exact:true}).click();await page.getByRole('button',{name:'ยืนยันยกเลิก',exact:true}).click();
  await expect(page.locator('.commerce-heading .order-status')).toHaveText('ยกเลิกแล้ว');await expect(page.getByRole('heading',{name:'ยกเลิกแล้ว'})).toBeVisible();
});
test('a lost response after database commit survives reload and creates only one order',async({page})=>{
  await login(page);await addBrush(page);await page.goto('/checkout/moonlit-test-studio');await page.getByRole('checkbox').check();
  let dropped=false;
  await page.route('**/checkout/moonlit-test-studio',async route=>{
    if(!dropped&&route.request().method()==='POST'&&route.request().headers()['next-action']){
      const response=await route.fetch();expect(response.status()).toBe(200);dropped=true;await route.abort('failed');
    }else await route.continue();
  });
  await page.getByRole('button',{name:'ยืนยันและจองสินค้า'}).click();await expect(page.getByRole('alert')).toContainText('ยังยืนยันผลไม่ได้');
  const client=await signed();const before=await client.from('orders').select('id').eq('status','pending');expect(before.data).toHaveLength(1);
  await page.unroute('**/checkout/moonlit-test-studio');await page.reload();await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'ยืนยันและจองสินค้า'}).click();await expect(page).toHaveURL(new RegExp(`/account/orders/${before.data![0].id}$`));
  const after=await client.from('orders').select('id').eq('status','pending');expect(after.data).toHaveLength(1);
});
test('concurrent authenticated buyers cannot reserve an exclusive twice; only the owner can cancel',async()=>{
  const first=await signed(),second=await signed('other');
  const {data:context,error}=await first.rpc('get_fixed_checkout',{p_shop_id:shop,p_product_ids:[exclusive]});expect(error).toBeNull();
  const params=(license:string)=>({p_shop_id:shop,p_items:[{productId:exclusive,license,quantity:1,expectedPriceMinor:license==='personal'?12675:25125,expectedTerms:`Local test license for ${license} use only.`}],p_note:'Concurrent stock test',p_policy_ids:context.policies.map((p:{id:string})=>p.id),p_idempotency_key:randomUUID()});
  const results=await Promise.all([first.rpc('create_fixed_order',params('personal')),second.rpc('create_fixed_order',params('commercial'))]);
  expect(results.filter(r=>!r.error)).toHaveLength(1);expect(results.filter(r=>r.error)).toHaveLength(1);expect(results.find(r=>r.error)!.error!.message).toBe('stock_unavailable');
  const winner=results[0].data?first:second,loser=results[0].data?second:first,id=results.find(r=>r.data)!.data;
  const hidden=await loser.from('orders').select('id').eq('id',id);expect(hidden.data).toEqual([]);
  const wrong=await loser.rpc('cancel_fixed_order',{p_order_id:id});expect(wrong.error!.message).toBe('order_unavailable');
  const cancel=await winner.rpc('cancel_fixed_order',{p_order_id:id});expect(cancel.error).toBeNull();
  const free=await first.rpc('get_fixed_checkout',{p_shop_id:shop,p_product_ids:[exclusive]});expect(free.data.products[0].available).toBe(1);
});
test('real PostgREST enforces server prices, retry identity and denies buyer marking paid',async()=>{
  const client=await signed();const {data:context}=await client.rpc('get_fixed_checkout',{p_shop_id:shop,p_product_ids:[brush]});
  const params={p_shop_id:shop,p_items:[{productId:brush,license:'personal',quantity:1,expectedPriceMinor:12675,expectedTerms:'Local test license for personal use only.'}],p_note:'RPC retry test',p_policy_ids:context.policies.map((p:{id:string})=>p.id),p_idempotency_key:randomUUID()};
  const fake=await client.rpc('create_fixed_order',{...params,p_items:[{...params.p_items[0],expectedPriceMinor:1}]});expect(fake.error!.message).toBe('price_or_terms_changed');
  const retries=await Promise.all([client.rpc('create_fixed_order',params),client.rpc('create_fixed_order',params)]);expect(retries.every(r=>!r.error)).toBe(true);expect(retries[0].data).toBe(retries[1].data);
  const paid=await client.from('orders').update({status:'paid'}).eq('id',retries[0].data);expect(paid.error).not.toBeNull();
});
test('a second user cannot open another buyer order through the actual application',async({page})=>{
  const client=await signed();const {data:context}=await client.rpc('get_fixed_checkout',{p_shop_id:shop,p_product_ids:[brush]});
  const created=await client.rpc('create_fixed_order',{p_shop_id:shop,p_items:[{productId:brush,license:'personal',quantity:1,expectedPriceMinor:12675,expectedTerms:'Local test license for personal use only.'}],p_note:'Isolation test',p_policy_ids:context.policies.map((p:{id:string})=>p.id),p_idempotency_key:randomUUID()});expect(created.error).toBeNull();
  await login(page,'/account/orders','other');const response=await page.goto(`/account/orders/${created.data}`);expect(response!.status()).toBe(404);
  await expect(page.locator('.order-note')).toHaveCount(0);
});
test('mobile buyer can review real prices and terms without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page);await addBrush(page,true);await page.goto('/cart');await expect(page.locator('.shop-cart')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByRole('link',{name:'ตรวจสอบรายการ'}).click();await page.getByRole('checkbox').check();
  await expect(page.getByRole('button',{name:'ยืนยันและจองสินค้า'})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/checkout-ui/checkout-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'ยืนยันและจองสินค้า'}).click();await expect(page.getByRole('heading',{name:'บันทึกคำสั่งซื้อแล้ว'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'test-results/checkout-ui/order-mobile.png',fullPage:true});
});
test.afterAll(async()=>{await cleanOrders()});
