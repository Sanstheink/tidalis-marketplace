const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const empty={errors:{}};
const form=values=>{const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,v);return f;};
const valid={scope:'platform',name:'Local Test Recipient',address:'Synthetic isolated test address 123',currency:'THB',bank:'Local Bank',account:'123 456-7890',bankEnabled:'on',confirmed:'yes'};
function fixture(error=null){
 const calls=[],guards=[];const client={async rpc(fn,params){calls.push({fn,params});return {error}}};
 const overrides={'next/navigation':{redirect:url=>{throw Object.assign(new Error('redirect'),{url})}},'next/cache':{revalidatePath(){}},'@/lib/auth':{requirePlatformAdmin:async()=>{guards.push('admin');return {client}},requireSellerFinance:async()=>{guards.push('finance');return {client,member:{shop_id:'20000000-0000-4000-8000-000000000001'}}},requireMfa:async()=>{guards.push('mfa')}}};
 return {recipient:load('app/seller/settings/payments/actions.ts',overrides).saveRecipient,issuer:load('app/admin/settings/payments/actions.ts',overrides).saveIssuer,calls,guards};
}
test('recipient form returns specific errors before RPC for enabled channels missing details',async()=>{
 const f=fixture();const result=await f.recipient(empty,form({...valid,bank:'',account:'',promptpayEnabled:'on',promptpay:''}));assert.ok(result.errors.bank);assert.ok(result.errors.account);assert.ok(result.errors.promptpay);assert.deepEqual(f.calls,[]);assert.deepEqual(f.guards,['admin']);
});
test('shop finance save checks MFA and serializes normalized account and PromptPay inputs',async()=>{
 const f=fixture();await assert.rejects(()=>f.recipient(empty,form({...valid,scope:'shop',promptpayEnabled:'on',promptpay:'๐๘๑-๒๓๔-๕๖๗๘'})),e=>e.url==='/seller/settings/payments?notice=saved');assert.deepEqual(f.guards,['finance','mfa']);assert.equal(f.calls[0].fn,'save_payment_profile');assert.equal(f.calls[0].params.p_account,'123456-7890');assert.equal(f.calls[0].params.p_promptpay,'0812345678');assert.equal(f.calls[0].params.p_shop_id,'20000000-0000-4000-8000-000000000001');
});
test('database failure returns an actionable form error, without exposing database/account details',async()=>{
 const f=fixture({code:'23514',message:'private failure containing sensitive account info'});const result=await f.recipient(empty,form(valid));assert.match(result.errors.form,/บัญชีหรือพร้อมเพย์/);assert.equal(JSON.stringify(result).includes('sensitive'),false);assert.equal(f.calls.length,1);
});
test('individual issuer may omit a tax number; valid save reaches the issuer RPC',async()=>{
 const f=fixture();await assert.rejects(()=>f.issuer(empty,form({name:valid.name,address:valid.address,confirmed:'yes'})),e=>e.url==='/admin/settings/payments?notice=issuer_saved');assert.deepEqual(f.calls,[{fn:'save_platform_issuer',params:{p_name:valid.name,p_address:valid.address,p_tax_id:''}}]);
});
test('issuer accepts separated Thai numerals, but rejects malformed tax IDs and unconfirmed edits',async()=>{
 const f=fixture();await assert.rejects(()=>f.issuer(empty,form({name:valid.name,address:valid.address,taxId:'๑-๒๓๔๕-๖๗๘๙๐-๑๒-๓',confirmed:'yes'})),e=>e.url==='/admin/settings/payments?notice=issuer_saved');assert.equal(f.calls[0].params.p_tax_id,'1234567890123');
 const invalid=fixture();const result=await invalid.issuer(empty,form({name:valid.name,address:valid.address,taxId:'ไม่มี'}));assert.ok(result.errors.taxId);assert.ok(result.errors.confirmed);assert.deepEqual(invalid.calls,[]);
});
