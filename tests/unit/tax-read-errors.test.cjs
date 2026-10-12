const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-typescript.cjs');
function client(){const q={select(){return q},eq(){return q},order(){return q},async range(){return {data:null,error:{code:'XX000'},count:null}},async maybeSingle(){return {data:null,error:{code:'XX000'}}}};return {from(){return q}}}
test('a failed tax profile read cannot render a seller as not registered',async()=>{
 const page=load('app/seller/tax/page.tsx',{'@/lib/auth':{requireSeller:async()=>({client:client(),member:{shop_id:'synthetic'}}),requireMfa:async()=>{}}}).default;
 await assert.rejects(page(),/Tax profile unavailable/);
});
test('a failed tax verification read cannot render the admin queue as empty',async()=>{
 const page=load('app/admin/tax-verification/page.tsx',{'@/components/PageNav':()=>null,'@/lib/auth':{requirePlatformAdmin:async()=>({client:client()})}}).default;
 await assert.rejects(page({searchParams:Promise.resolve({})}),/Tax verification requests unavailable/);
});
