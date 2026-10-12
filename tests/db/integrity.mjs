import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite({extensions:{pgcrypto}});let count=0;
const seller=randomUUID(),other=randomUUID(),admin=randomUUID(),applicant=randomUUID(),shop=randomUUID();
const rows=async(q,p)=>(await db.query(q,p)).rows;
async function as(id,aal='aal1',role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal,role})]);await db.exec(`set role ${role}`);}
async function owner(){await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}
async function check(name,fn){await fn();count++;console.log('PASS',name)}
try{
 await db.waitReady;await db.exec(readFileSync('tests/db/supabase-model.sql','utf8'));
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'));
 for(const id of [seller,other,admin,applicant])await db.query('insert into auth.users(id,email_confirmed_at) values($1,$2)',[id,id===applicant?null:new Date()]);
 for(const id of [seller,admin])await db.query("insert into auth.mfa_factors(user_id,status,factor_type) values($1,'verified','totp')",[id]);
 await db.query("insert into public.platform_roles(user_id,role) values($1,'admin')",[admin]);
 await db.query("insert into public.shops(id,owner_id,name,slug,status) values($1,$2,'Integrity Shop','integrity-shop','paused')",[shop,seller]);
 await db.query("insert into public.shop_members(shop_id,user_id,role) values($1,$2,'owner')",[shop,seller]);
 await db.exec('update public.marketplace_settings set self_service_shops=false,seller_self_publish=false');
 let draft,pdf;
 await check('enrolled AAL1 sellers can save a short text policy draft',async()=>{await as(seller);draft=(await rows('select public.save_shop_policy_draft($1,$2,$3,null) id',[shop,'refund','An incomplete working draft.']))[0].id;assert.ok(draft)});
 await check('another buyer cannot edit a seller policy draft',async()=>{await as(other,'aal2');await assert.rejects(rows('select public.save_shop_policy_draft($1,$2,$3,$4)',[shop,'refund','Changed by another buyer',draft]),/MFA required/)});
 const path=`shops/${shop}/policies/${randomUUID()}.pdf`;
 await owner();await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('tidalis-policy-documents',$1,$2,'{\"size\":100,\"mimetype\":\"application/pdf\"}')",[path,seller]);
 await check('enrolled AAL1 sellers can attach a valid private PDF draft',async()=>{await as(seller);pdf=(await rows('select public.save_shop_policy_document_draft($1,$2,$3,$4,100,null) id',[shop,'delivery',path,'Synthetic audit policy.pdf']))[0].id;assert.ok(pdf)});
 await check('text updates cannot silently replace a PDF policy',async()=>{await as(seller);await assert.rejects(rows('select public.save_shop_policy_draft($1,$2,$3,$4)',[shop,'delivery','x'.repeat(200),pdf]),/uses a PDF/)});
 await check('policy submission still requires an AAL2 seller session',async()=>{await as(seller);await assert.rejects(rows('select public.submit_shop_policy_draft($1)',[pdf]),/MFA required/)});
 await check('a complete PDF can be submitted without 200 characters of text',async()=>{await as(seller,'aal2');await rows('select public.submit_shop_policy_draft($1)',[pdf]);assert.equal((await rows('select status from public.shop_policy_versions where id=$1',[pdf]))[0].status,'under_review')});
 await as(admin,'aal2');await rows('select public.review_shop_policy($1,$2,$3,true)',[pdf,'approved','Synthetic audit reviewed PDF policy.']);
 for(const [field,value] of [['document_path',path.replace('.pdf','-changed.pdf')],['document_name','Changed.pdf'],['document_size',200],['source_type','text']])await check(`published PDF ${field} is immutable even to the database owner`,async()=>{await owner();await assert.rejects(db.query(`update public.shop_policy_versions set ${field}=$1 where id=$2`,[value,pdf]),/immutable/)});
 await check('archived PDFs retain the original file identity',async()=>{await owner();await db.query("update public.shop_policy_versions set status='archived' where id=$1",[pdf]);await assert.rejects(db.query('update public.shop_policy_versions set document_name=$1 where id=$2',['Changed archived.pdf',pdf]),/immutable/)});
 const agreement=randomUUID();await owner();await db.query("insert into public.platform_policy_versions(id,policy_type,version,title,content,status,effective_from,approved_by) values($1,'seller-agreement',1,'Synthetic agreement',$2,'published',now(),$3)",[agreement,'x'.repeat(250),admin]);
 const app=randomUUID();await db.query("insert into public.seller_applications(id,user_id,shop_name,requested_slug,portfolio_url,description,status,agreement_version_id,agreement_accepted_at) values($1,$2,'Synthetic Applicant','integrity-applicant','https://example.invalid/audit',$3,'under_review',$4,now())",[app,applicant,'x'.repeat(50),agreement]);
 await check('manual approval rejects an unverified applicant',async()=>{await as(admin,'aal2');await assert.rejects(rows('select public.approve_seller_application($1)',[app]),/email is not verified/)});
 await owner();await db.query('update auth.users set email_confirmed_at=now() where id=$1',[applicant]);
 await check('manual approval requires a recorded current agreement acceptance',async()=>{await as(admin,'aal2');await assert.rejects(rows('select public.approve_seller_application($1)',[app]),/reaccept the current/)});
 await owner();await db.query('insert into public.policy_acceptances(user_id,policy_version_id) values($1,$2)',[applicant,agreement]);
 const newer=randomUUID();await db.query("insert into public.platform_policy_versions(id,policy_type,version,title,content,status,effective_from,approved_by) values($1,'seller-agreement',2,'Synthetic current agreement',$2,'published',now(),$3)",[newer,'x'.repeat(250),admin]);
 await check('manual approval rejects acceptance of an outdated agreement',async()=>{await as(admin,'aal2');await assert.rejects(rows('select public.approve_seller_application($1)',[app]),/reaccept the current/)});
 await owner();await db.query('insert into public.policy_acceptances(user_id,policy_version_id) values($1,$2)',[applicant,newer]);await db.query('update public.seller_applications set agreement_version_id=$1 where id=$2',[newer,app]);
 await check('eligible under-review applicants enter shop readiness instead of going live immediately',async()=>{await as(admin,'aal2');const id=(await rows('select public.approve_seller_application($1) id',[app]))[0].id;await owner();assert.equal((await rows('select status from public.shops where id=$1',[id]))[0].status,'paused')});
 console.log(`Integrity regressions: ${count} passed (isolated PostgreSQL model)`);
}catch(error){console.error('FAIL',error.message);process.exitCode=1}finally{await db.close()}
