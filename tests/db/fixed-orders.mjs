import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite({extensions:{pgcrypto}});let count=0;
const buyer='10000000-0000-4000-8000-000000000003',other='10000000-0000-4000-8000-000000000002',seller='10000000-0000-4000-8000-000000000001',unverified='10000000-0000-4000-8000-000000000005';
const shop='20000000-0000-4000-8000-000000000001',product='30000000-0000-4000-8000-000000000001',exclusive='30000000-0000-4000-8000-000000000002';
const rows=async(sql,params)=>(await db.query(sql,params)).rows;
async function as(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role,aal:'aal1'})]);await db.exec(`set role ${role}`)}
async function owner(){await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)")}
async function check(name,fn){await fn();count++;console.log('PASS',name)}
const item=(id=product,qty=1,license='personal')=>({productId:id,quantity:qty,license,expectedPriceMinor:license==='personal'?12675:25125,expectedTerms:`Local test license for ${license} use only.`});
let policies;
async function create(items=[item()],key=randomUUID(),ids=policies,note='Local test note'){
 return (await rows('select public.create_fixed_order($1,$2::jsonb,$3,$4::uuid[],$5) as id',[shop,JSON.stringify(items),note,ids,key]))[0].id;
}
const denied=async(fn,message)=>assert.rejects(fn,error=>message.test(error.message));
try{
 await db.exec(readFileSync('tests/db/supabase-model.sql','utf8'));
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'test-'||i||'@example.invalid',case when i=5 then null else now() end from generate_series(1,5) i;`);
 await db.exec(readFileSync('tests/db/fixed-order-fixtures.sql','utf8'));
 await db.exec("insert into storage.objects(bucket_id,name,metadata) select 'tidalis-product-files',file_path,jsonb_build_object('mimetype',case when is_delivery_file then 'application/zip' else 'image/png' end,'size',100) from public.product_files");
 await as(null,'anon');
 let context=(await rows('select public.get_fixed_checkout($1,$2::uuid[]) as ctx',[shop,[product,exclusive]]))[0].ctx;
 policies=context.policies.map(p=>p.id);
 await check('order creation is disabled by default and context exposes only public data',async()=>{assert.equal(context.enabled,false);assert.equal(context.eligible,true);assert.equal(context.products.length,2);assert.equal(JSON.stringify(context).includes('/deliverables/'),false);});
 await check('anonymous creation and reservation-table reads are denied',async()=>{await denied(()=>create(),/permission denied/);await denied(()=>rows('select * from public.product_reservations'),/permission denied/)});
 await as(buyer);await check('closed gate also rejects direct authenticated RPC',()=>denied(()=>create(),/orders_closed/));
 await owner();await db.exec('update public.marketplace_settings set fixed_orders_enabled=true');await as(unverified);
 await check('unverified email cannot create an order',()=>denied(()=>create(),/verified_email_required/));
 await as(seller);await check('seller cannot order from own shop',()=>denied(()=>create(),/own_shop_order/));await as(buyer);
 await check('invalid quantity and duplicate lines are rejected',async()=>{await denied(()=>create([item(product,0)]),/invalid_items/);await denied(()=>create([item(),item()]),/duplicate_items/)});
 await check('cross-shop, missing, commission and draft products are rejected',async()=>{
  await denied(()=>create([item('30000000-0000-4000-8000-000000000003')]),/product_unavailable/);
  await denied(()=>create([item(randomUUID())]),/product_unavailable/);
  await denied(()=>create([item('30000000-0000-4000-8000-000000000004')]),/product_unavailable/);
  await denied(()=>create([item('30000000-0000-4000-8000-000000000005')]),/product_unavailable/);
 });
 await check('tampered price, changed license terms and stale policies cannot be accepted',async()=>{
  await denied(()=>create([{...item(),expectedPriceMinor:1}]),/price_or_terms_changed/);
  await denied(()=>create([{...item(),expectedTerms:'forged'}]),/price_or_terms_changed/);
  await denied(()=>create([item()],randomUUID(),[randomUUID(),...policies.slice(1)]),/policies_changed/);
  assert.equal((await rows('select id from public.orders')).length,0);
 });
 const key=randomUUID();const items=[item(product,2),item(product,1,'commercial')];let order;
 await check('server prices produce an exact integer total and frozen snapshots',async()=>{
  order=await create(items,key);const o=(await rows('select * from public.orders where id=$1',[order]))[0];assert.equal(Number(o.total_minor),50475);assert.equal(Number(o.vat_minor),0);assert.equal(o.policy_snapshot.length,8);assert.equal(o.shop_snapshot.name,'Moonlit Test Studio');assert.equal(o.status,'pending');
  const lines=await rows('select * from public.order_items where order_id=$1',[order]);assert.equal(lines.length,2);assert.match(lines[0].item_snapshot.license_terms,/Local test license/);
 });
 await check('reordered retry returns the same order; changed payload using the key is rejected',async()=>{assert.equal(await create([...items].reverse(),key),order);await denied(()=>create([item()],key),/idempotency_conflict/);assert.equal((await rows('select id from public.orders')).length,1)});
 await check('buyers cannot write orders, alter ledger or self-mark paid',async()=>{
  await denied(()=>rows("update public.orders set status='paid' where id=$1",[order]),/permission denied/);
  await denied(()=>rows('delete from public.product_reservations'),/permission denied/);
  await denied(()=>rows('insert into public.order_items(order_id,product_id,quantity,usage_type,price_minor,item_snapshot) values($1,$2,1,\'personal\',1,\'{}\')',[order,product]),/permission denied/);
 });
 await as(other);
 await check('another signed buyer cannot read/cancel the first buyer order or items',async()=>{assert.equal((await rows('select id from public.orders where id=$1',[order])).length,0);assert.equal((await rows('select id from public.order_items where order_id=$1',[order])).length,0);await denied(()=>rows('select public.cancel_fixed_order($1)',[order]),/order_unavailable/)});
 await as(buyer);
 let held;
 await check('exclusive stock is shared across both licenses',async()=>{await denied(()=>create([item(exclusive),item(exclusive,1,'commercial')]),/stock_unavailable/);held=await create([item(exclusive)]);await denied(()=>create([item(exclusive,1,'commercial')]),/stock_unavailable/)});
 await check('cancellation is idempotent and restores availability without inflating stock',async()=>{await rows('select public.cancel_fixed_order($1)',[held]);await rows('select public.cancel_fixed_order($1)',[held]);const ctx=(await rows('select public.get_fixed_checkout($1,$2::uuid[]) as ctx',[shop,[exclusive]]))[0].ctx;assert.equal(ctx.products[0].available,1);await owner();assert.equal((await rows('select stock from public.products where id=$1',[exclusive]))[0].stock,1);await as(buyer);});
 held=await create([item(exclusive)]);
 await owner();await db.query("update public.product_reservations set expires_at=now()-interval '1 second' where order_id=$1",[held]);await db.query("update public.orders set reservation_expires_at=now()-interval '1 second' where id=$1",[held]);await as(other);
 await check('expired reservation is reusable without a cron or cleanup job',async()=>{const ctx=(await rows('select public.get_fixed_checkout($1,$2::uuid[]) as ctx',[shop,[exclusive]]))[0].ctx;assert.equal(ctx.products[0].available,1);const next=await create([item(exclusive)]);await rows('select public.cancel_fixed_order($1)',[next]);});
 await as(buyer);await rows('select public.cancel_fixed_order($1)',[held]);
 await check('expired cancellation is recorded distinctly',async()=>assert.equal((await rows('select cancellation_reason from public.orders where id=$1',[held]))[0].cancellation_reason,'expired'));
 await owner();await db.exec(`update public.shops set status='paused' where id='${shop}'`);await as(buyer);
 await check('paused shop rejects new orders but preserves buyer snapshots',async()=>{await denied(()=>create(),/shop_unavailable/);assert.equal((await rows('select shop_snapshot from public.orders where id=$1',[order]))[0].shop_snapshot.name,'Moonlit Test Studio')});
 await owner();await db.exec(`update public.shops set status='active' where id='${shop}';update public.seller_tax_profiles set vat_status='verified' where shop_id='${shop}'`);await as(buyer);
 await check('VAT shops fail closed until payment/tax handling exists',()=>denied(()=>create(),/shop_setup_pending/));
 await owner();await db.exec(`update public.seller_tax_profiles set vat_status='not_registered' where shop_id='${shop}'`);await as(buyer);
 await check('active pending orders are capped at five per buyer',async()=>{for(let i=0;i<4;i++)await create();await denied(()=>create(),/active_order_limit/)});
 await owner();await db.exec('update public.marketplace_settings set fixed_orders_enabled=false');await as(buyer);
 await check('known retries survive gate closure; cancellation still works',async()=>{assert.equal(await create(items,key),order);await rows('select public.cancel_fixed_order($1)',[order]);});
 await owner();await db.exec(`update public.marketplace_settings set fixed_orders_enabled=true;update public.shop_readiness_requests set status='needs_information' where shop_id='${shop}'`);await as(buyer);
 await check('revoked shop readiness blocks ordering immediately',()=>denied(()=>create(),/shop_setup_pending/));
 await owner();await db.exec(`update public.shop_readiness_requests set status='approved' where shop_id='${shop}';update public.shop_policy_versions set status='archived' where shop_id='${shop}' and policy_type='delivery'`);await as(buyer);
 await check('missing current policy blocks new orders but retains accepted snapshots',async()=>{await denied(()=>create(),/shop_setup_pending/);assert.equal((await rows('select policy_snapshot from public.orders where id=$1',[order]))[0].policy_snapshot.length,8)});
 const pdf=`shops/${shop}/policies/50000000-0000-4000-8000-000000000003.pdf`;
 await owner();await db.query("insert into storage.objects(bucket_id,name,metadata) values('tidalis-policy-documents',$1,'{\"mimetype\":\"application/pdf\",\"size\":100}')",[pdf]);
 await db.query("insert into public.shop_policy_versions(shop_id,policy_type,version,content,status,published_at,reviewed_by,source_type,document_path,document_name,document_size) values($1,'delivery',2,'Local PDF policy','published',now(),'10000000-0000-4000-8000-000000000004','pdf',$2,'test-delivery.pdf',100)",[shop,pdf]);await as(buyer);
 const revised=(await rows('select public.get_fixed_checkout($1,$2::uuid[]) as ctx',[shop,[product]]))[0].ctx;
 await check('policy version changes require fresh buyer acceptance',()=>denied(()=>create(),/policies_changed/));
 const pdfOrder=await create([item()],randomUUID(),revised.policies.map(p=>p.id));
 await owner();await db.exec(`update public.shop_policy_versions set status='archived' where shop_id='${shop}' and policy_type='delivery';update public.shops set status='paused' where id='${shop}'`);
 await check('archived private policy PDF stays visible only to its accepting buyer',async()=>{
  await as(buyer);assert.equal((await rows('select name from storage.objects where name=$1',[pdf])).length,1);
  await as(other);assert.equal((await rows('select name from storage.objects where name=$1',[pdf])).length,0);
  await as(null,'anon');assert.equal((await rows('select name from storage.objects where name=$1',[pdf])).length,0);
  await as(buyer);await rows('select public.cancel_fixed_order($1)',[pdfOrder]);
 });
 console.log(`Fixed-order regressions: ${count} passed (isolated PostgreSQL model; concurrency/GoTrue tested separately in CI)`);
}catch(error){console.error('Fixed-order regression failed:',error.message,error.code||'',error.where||'');process.exitCode=1;}finally{await db.close()}
