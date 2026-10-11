import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// Real PostgreSQL execution in an isolated model. JWT claims here test RLS,
// not token verification; TOTP enrollment is modelled only in this local DB.
const db=new PGlite({extensions:{pgcrypto}});
let passed=0;
const id={seller:'10000000-0000-4000-8000-000000000001',other:'10000000-0000-4000-8000-000000000002',buyer:'10000000-0000-4000-8000-000000000003',admin:'10000000-0000-4000-8000-000000000004',shop:'20000000-0000-4000-8000-000000000001',otherShop:'20000000-0000-4000-8000-000000000002',product:'30000000-0000-4000-8000-000000000001',otherProduct:'30000000-0000-4000-8000-000000000002'};
async function as(user,aal='aal1',role='authenticated'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,aal,role})]);
  await db.exec(`set role ${role}`);
}
async function owner(){await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}
async function check(name,operation){await operation();passed++;console.log('PASS',name);}
async function denied(sql,message){await assert.rejects(db.query(sql),error=>message.test(error.message));}
const rows=async sql=>(await db.query(sql)).rows;

try{
  await db.exec(readFileSync('tests/db/supabase-model.sql','utf8'));
  for(const file of readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')).sort()){
    await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));console.log('MIGRATION PASS',file);
  }
  if(process.env.TIDALIS_SCHEMA_SNAPSHOT)writeFileSync(process.env.TIDALIS_SCHEMA_SNAPSHOT,JSON.stringify(await rows("select table_name as table,column_name as column,udt_name as type,is_nullable as nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position"),null,2));
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values
      ('${id.seller}','seller@example.invalid',now()),('${id.other}','other@example.invalid',now()),
      ('${id.buyer}','buyer@example.invalid',now()),('${id.admin}','admin@example.invalid',now());
    insert into auth.mfa_factors(user_id,factor_type,status) values
      ('${id.seller}','totp','verified'),('${id.other}','totp','verified'),('${id.admin}','totp','verified');
    insert into public.platform_roles(user_id,role) values ('${id.admin}','admin');
    insert into public.shops(id,owner_id,name,slug,status) values
      ('${id.shop}','${id.seller}','Test Shop','test-shop','paused'),('${id.otherShop}','${id.other}','Other Shop','other-shop','paused');
    insert into public.shop_members(shop_id,user_id,role) values ('${id.shop}','${id.seller}','owner'),('${id.otherShop}','${id.other}','owner');
    insert into public.products(id,shop_id,slug,name,description,product_type,pricing_mode,status) values
      ('${id.product}','${id.shop}','test-product','Test Product',repeat('x',40),'digital_asset','fixed','draft'),
      ('${id.otherProduct}','${id.otherShop}','other-product','Other Product',repeat('x',40),'digital_asset','fixed','draft');
    insert into public.product_license_prices(product_id,usage_type,price_minor,terms) values
      ('${id.product}','personal',10000,repeat('x',30)),('${id.product}','commercial',20000,repeat('x',30));
    insert into public.shop_work_types(shop_id,name) values ('${id.shop}','Artwork');
    update public.products set work_type_id=(select id from public.shop_work_types where shop_id='${id.shop}') where id='${id.product}';
    insert into storage.objects(bucket_id,name,owner_id,metadata) values
      ('tidalis-product-files','shops/${id.shop}/products/${id.product}/previews/40000000-0000-4000-8000-000000000001.png','${id.seller}','{"mimetype":"image/png","size":100}'),
      ('tidalis-product-files','shops/${id.shop}/products/${id.product}/deliverables/40000000-0000-4000-8000-000000000002.zip','${id.seller}','{"mimetype":"application/zip","size":100}');
    insert into public.product_files(product_id,file_path,is_delivery_file) select '${id.product}',name,name like '%/deliverables/%' from storage.objects;
    insert into public.seller_invoices(shop_id,invoice_number,period_from,period_to,total_minor)
      values ('${id.shop}','LOCAL-TEST-001','2026-01-01','2026-01-31',10000);
  `);
  await as(id.seller);
  await check('enrolled AAL1 seller reads only own drafts',async()=>assert.deepEqual((await rows('select id from public.products')).map(row=>row.id),[id.product]));
  await check('AAL1 reads previews but cannot read deliverable objects',async()=>{const files=await rows('select name from storage.objects');assert.equal(files.length,1);assert.match(files[0].name,/previews/)});
  await check('AAL1 cannot read seller invoices',async()=>assert.equal((await rows('select id from public.seller_invoices')).length,0));
  await check('cross-shop attachment is rejected',()=>denied(`select public.attach_seller_product_file('${id.otherProduct}','x',false)`,/Not authorized/));
  await check('AAL1 cannot submit for publication',()=>denied(`select public.submit_product_for_review('${id.product}')`,/MFA|authorized/));
  await check('AAL1 cannot change intake',()=>denied('select public.set_seller_intake_open(true)',/Admin MFA/));
  await as(id.seller,'aal2');
  await check('AAL2 retains private deliverable and invoice access',async()=>{assert.equal((await rows('select name from storage.objects')).length,2);assert.equal((await rows('select id from public.seller_invoices')).length,1)});
  await as(id.other,'aal2');
  await check('other-shop owner cannot see target draft',async()=>assert.equal((await rows(`select id from public.products where id='${id.product}'`)).length,0));
  await as(id.buyer,'aal2');
  await check('buyer AAL2 cannot see drafts, private files or invoices',async()=>{for(const table of ['products','seller_invoices'])assert.equal((await rows(`select id from public.${table}`)).length,0);assert.equal((await rows('select name from storage.objects')).length,0)});
  await as(null,'aal1','anon');
  await check('anon cannot see paused shops or call privileged RPCs',async()=>{assert.equal((await rows('select id from public.shops')).length,0);await denied('select public.set_seller_intake_open(true)',/permission denied/)});
  await check('anon can read intake state without operator metadata',async()=>{assert.equal((await rows('select seller_intake_open from public.marketplace_settings'))[0].seller_intake_open,false);await denied('select updated_by from public.marketplace_settings',/permission denied/)});
  await owner();await db.exec(`update auth.mfa_factors set status='unverified' where user_id='${id.seller}'`);
  await as(id.seller);
  await check('unenrolling TOTP removes AAL1 draft access',async()=>assert.equal((await rows('select id from public.products')).length,0));
  await owner();await db.exec(`update auth.mfa_factors set status='verified' where user_id='${id.seller}'; update public.shops set status='suspended' where id='${id.shop}'`);
  for(const aal of ['aal1','aal2']){
    await as(id.seller,aal);
    await check(`${aal} suspended shop cannot insert work types`,()=>denied(`insert into public.shop_work_types(shop_id,name) values ('${id.shop}','Suspended')`,/row-level security/));
    await check(`${aal} suspended shop cannot update work types`,async()=>assert.equal((await rows(`update public.shop_work_types set name='Changed' where shop_id='${id.shop}' returning id`)).length,0));
  }
  await owner();await db.exec(`update public.shops set status='paused' where id='${id.shop}'`);
  await as(id.seller);
  await check('owner readiness works at enrolled AAL1',async()=>assert.ok(Array.isArray((await rows(`select public.tidalis_shop_readiness_blockers('${id.shop}') as result`))[0].result)));
  await owner();await db.exec(`insert into public.shop_members(shop_id,user_id,role) values('${id.shop}','${id.buyer}','support'); insert into auth.mfa_factors(user_id,factor_type,status) values('${id.buyer}','totp','verified')`);
  for(const role of ['support','finance']){
    await owner();await db.exec(`update public.shop_members set role='${role}' where user_id='${id.buyer}'`);await as(id.buyer);
    await check(`${role} readiness is rejected at the outer role guard`,()=>denied(`select public.tidalis_shop_readiness_blockers('${id.shop}')`,/MFA and shop access required/));
  }
  await as(id.admin);
  await check('admin AAL1 cannot operate announcements or issue finance documents',async()=>{
    await denied("select public.tidalis_save_announcement(null,'Test Title','Test Announcement Text',null,true,false,0,null,null)",/Admin AAL2/);
    await denied('select public.tidalis_issue_platform_document(null,\'receipt\')',/Admin AAL2/);
  });
  await as(id.admin,'aal2');
  const policy=(await rows("select public.create_seller_agreement_draft('Local Synthetic Seller Agreement',repeat('x',600)) as id"))[0].id;
  await db.query('select public.publish_seller_agreement($1,true)',[policy]);
  await as(id.buyer);
  const submit=`select public.submit_seller_application('Buyer Test Shop','buyer-test-shop','https://example.invalid/portfolio',repeat('x',50),'${policy}') as id`;
  await check('closed intake blocks a direct RPC with valid email/agreement',()=>denied(submit,/applications are currently closed/));
  await check('buyer cannot bypass intake via direct table writes',()=>denied('update public.marketplace_settings set seller_intake_open=true',/permission denied/));
  await as(id.admin,'aal2');await db.query('select public.set_seller_intake_open(true)');
  await as(id.buyer);const first=(await rows(submit))[0].id;
  await check('one open application per user is enforced',()=>denied(submit,/already being reviewed/));
  await as(id.admin,'aal2');await db.query("select public.review_seller_application($1,'rejected','Local test rejection reason')",[first]);
  await as(id.buyer);
  let second;
  await check('a rejected slug can be reused and retains both application records',async()=>{second=(await rows(submit))[0].id;assert.notEqual(first,second);assert.equal((await rows('select id from public.seller_applications')).length,2)});
  await as(id.admin,'aal2');await db.query("select public.review_seller_application($1,'needs_information','Local test more information')",[second]);await db.query('select public.set_seller_intake_open(false)');
  await as(id.buyer);
  await check('closed intake also blocks direct resubmission',()=>denied(`select public.resubmit_seller_application('${second}','Buyer Test Shop','buyer-test-shop','https://example.invalid/portfolio',repeat('x',50),'${policy}')`,/applications are currently closed/));
  await owner();await db.exec(`update public.shops set status='active' where id='${id.shop}';
    insert into public.products(shop_id,slug,name,description,product_type,pricing_mode,status,created_at)
      select '${id.shop}','catalog-'||i,case when i=70 then 'Archive Needle 100%_Artwork' else 'Artwork '||i end,repeat('x',40),'commission','quote','draft',now()-(i||' hours')::interval from generate_series(1,70) i;
    insert into public.product_license_prices(product_id,usage_type,price_minor,terms)
      select p.id,l.usage_type,substring(p.slug from 9)::integer*100+l.extra,repeat('x',30)
      from public.products p cross join (values('personal',0),('commercial',10000)) l(usage_type,extra) where p.slug like 'catalog-%';
    update public.products set status='published' where slug like 'catalog-%';
  `);
  await as(null,'aal1','anon');
  const search=async args=>(await rows(`select public.search_public_products(${args}) as result`))[0].result;
  await check('catalog counts all 70 rows and paginates beyond the first 60',async()=>{const result=await search("'','all','featured',3,24");assert.equal(result.total,70);assert.equal(result.items.length,22)});
  await check('search and price sort find an older item outside the former 60-row window',async()=>{const result=await search("'Archive Needle','all','featured',1,24");assert.equal(result.total,1);assert.equal(result.items[0].slug,'catalog-70')});
  await check('ascending and descending prices sort globally before pagination',async()=>{const low=await search("'','all','low',1,24");const high=await search("'','all','high',1,24");assert.equal(low.items[0].slug,'catalog-1');assert.equal(high.items[0].slug,'catalog-70')});
  await check('SQL LIKE wildcard search characters are treated as literal text',async()=>{assert.equal((await search("'100%_Artwork','all','featured',1,24")).total,1);assert.equal((await search("'No%Match','all','featured',1,24")).total,0)});
  await check('catalog filters exclude drafts, paused shops and other product modes',async()=>{assert.equal((await search("'','digital_asset','featured',1,24")).total,0);assert.equal((await search(`'','all','featured',1,24,'${id.otherShop}'`)).total,0)});
  await check('catalog JSON exposes public fields and no file metadata',async()=>{const item=(await search("'','all','featured',1,24")).items[0];assert.deepEqual(Object.keys(item).sort(),['description','id','is_exclusive','name','pricing_mode','product_license_prices','product_type','shop','shop_id','slug','stock','work_type'].sort())});
  await owner();await db.exec(`update public.products set status='published',published_at=now() where id='${id.product}'`);await as(null,'aal1','anon');
  await check('published active product exposes preview metadata/objects, never delivery',async()=>{const files=await rows('select file_path,is_delivery_file from public.product_files');assert.equal(files.length,1);assert.equal(files[0].is_delivery_file,false);assert.equal((await rows('select name from storage.objects')).length,1)});
  await owner();await db.exec(`update public.shops set status='paused' where id='${id.shop}'`);await as(null,'aal1','anon');
  await check('pausing a shop hides its entire catalog and preview objects',async()=>{assert.equal((await search("'','all','featured',1,24")).total,0);assert.equal((await rows('select name from storage.objects')).length,0)});
  await owner();
  await check('every public table has RLS',async()=>assert.equal((await rows("select tablename from pg_tables where schemaname='public' and not rowsecurity")).length,0));
  await check('the live policy probe rolls back every fixture before returning its report',async()=>{
    const results=await db.exec(readFileSync('tests/db/live-policy-smoke.sql','utf8'));
    const report=results.at(-1).rows[0].test_report;
    assert.equal(report.fixtures_rolled_back,true);assert.equal(report.seller_intake_open,false);assert.equal(report.passed,26);
    if(process.env.TIDALIS_LIVE_PROBE_DIR)for(const [index,count] of [15,5,6].entries()){
      const results=await db.exec(readFileSync(`${process.env.TIDALIS_LIVE_PROBE_DIR}/${index+1}.sql`,'utf8'));
      const report=results.at(-1).rows[0].test_report;
      assert.equal(report.fixtures_rolled_back,true);assert.equal(report.seller_intake_open,false);assert.equal(report.passed,count);
    }
  });
  console.log(`Database regressions: ${passed} passed (isolated PostgreSQL/Supabase model; no live GoTrue login)`);
}finally{await db.close()}
