import {createClient} from '@supabase/supabase-js';
import {execFileSync,spawnSync} from 'node:child_process';
import {totp} from '../tests/helpers/totp.mjs';
import {readFileSync,appendFileSync} from 'node:fs';
// Only CLI-generated LOCAL keys are used. Never retrieve a hosted project's secrets.
const status=JSON.parse(execFileSync('npx',['--yes','supabase@2.120.0','status','-o','json'],{encoding:'utf8'}));
const url=status.API_URL||status.api_url,dbUrl=status.DB_URL||status.db_url;
if(new URL(url).hostname!=='127.0.0.1'||new URL(dbUrl).hostname!=='127.0.0.1'||new URL(dbUrl).port!=='54322')throw Error('Fixtures require the isolated local Supabase stack');
const anon=status.ANON_KEY||status.anon_key,service=status.SERVICE_ROLE_KEY||status.service_role_key;
if(!anon||!service)throw Error('Local CLI status is missing test credentials');
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const password='Local-Only-Fixture-2026!';
for(const [number,name] of [[1,'seller'],[2,'other'],[3,'buyer'],[4,'admin'],[5,'unverified'],[6,'applicant'],[7,'selfseller']]){
  const id=`10000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  const {data,error}=await admin.auth.admin.createUser({id,email:`${name}@tidalis-test.invalid`,password,email_confirm:number!==5,user_metadata:{username:`local_${name}`}});
  if(error||data.user?.id!==id)throw Error(`Could not provision isolated ${name} fixture: ${error?.message||'id mismatch'}`);
}
function sql(input){const result=spawnSync('psql',[dbUrl,'-v','ON_ERROR_STOP=1','-q'],{input,encoding:'utf8'});if(result.status!==0)throw Error(`Local fixture SQL failed: ${result.stderr}`);return result.stdout;}
sql(readFileSync('tests/db/fixed-order-fixtures.sql','utf8'));
const {data:files,error:fileError}=await admin.from('product_files').select('file_path,is_delivery_file');if(fileError)throw Error(fileError.message);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
// Valid empty ZIP: test delivery is gated; these are synthetic local objects.
const zip=Buffer.from('504b0506000000000000000000000000000000000000','hex');
for(const file of files){const {error}=await admin.storage.from('tidalis-product-files').upload(file.file_path,file.is_delivery_file?zip:png,{contentType:file.is_delivery_file?'application/zip':'image/png'});if(error)throw Error(`Local fixture upload failed: ${error.message}`);}
sql(`update public.marketplace_settings set fixed_orders_enabled=true,self_service_shops=false,seller_self_publish=false;insert into public.platform_roles(user_id,role) values('10000000-0000-4000-8000-000000000004','admin') on conflict do nothing;`);
sql(`insert into public.payment_profiles(shop_id,recipient_name,billing_address,bank_accounts,updated_by) values('20000000-0000-4000-8000-000000000001','Local Test Seller','Synthetic local test address 123','{"THB":{"bank":"Local Test Bank","account":"1111111111","enabled":true}}','10000000-0000-4000-8000-000000000001');`);
const totpSecrets={};
for(const name of ['seller','admin','selfseller']){
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error:login}=await client.auth.signInWithPassword({email:`${name}@tidalis-test.invalid`,password});if(login)throw Error('Local MFA sign-in failed');
 const {data:factor,error:enroll}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:`Local ${name} test factor`});if(enroll||!factor)throw Error('Local TOTP enrollment failed');
 const {error:verify}=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)});if(verify)throw Error('Local TOTP verification failed');
 totpSecrets[`TIDALIS_TEST_${name.toUpperCase()}_TOTP`]=factor.totp.secret;console.log(`::add-mask::${factor.totp.secret}`);
}

const exported={NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:anon,TIDALIS_LOCAL_USER_TESTS:'true',TIDALIS_TEST_BUYER_PASSWORD:password,SUPABASE_SECRET_KEY:service,...totpSecrets,NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3000'};
if(!process.env.GITHUB_ENV)throw Error('This setup exports to a GitHub Actions runner only');
console.log(`::add-mask::${service}`);console.log(`::add-mask::${password}`);
appendFileSync(process.env.GITHUB_ENV,Object.entries(exported).map(([key,value])=>`${key}=${value}\n`).join(''));
console.log('Isolated Supabase Auth users, policies, catalog and private files are ready. No hosted project was accessed.');
