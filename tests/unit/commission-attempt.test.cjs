const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const {commissionAttempt}=load('lib/commission-attempt.ts');
const user='10000000-0000-4000-8000-000000000001',product='30000000-0000-4000-8000-000000000001';
function memory(){const values=new Map();return {values,getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
test('commission retries and a remounted form reuse the same identity without storing the brief',async()=>{
 const storage=memory(),payload={usage:'personal',brief:'Private requested illustration details',policies:['one','two']};
 const first=await commissionAttempt(user,product,payload,storage),retry=await commissionAttempt(user,product,payload,storage);
 assert.equal(first.key,retry.key);assert.equal(storage.values.size,1);assert.equal([...storage.values.values()][0].includes(payload.brief),false);
});
test('commission identities are scoped to buyer, product and submitted terms',async()=>{
 const storage=memory(),payload={brief:'Brief one'};
 const first=await commissionAttempt(user,product,payload,storage);
 assert.notEqual((await commissionAttempt(user,product,{brief:'Brief two'},storage)).key,first.key);
 assert.notEqual((await commissionAttempt(user+'2',product,payload,storage)).key,first.key);
 assert.notEqual((await commissionAttempt(user,product+'2',payload,storage)).key,first.key);
});
test('a commission request is blocked if the browser cannot persist retry identity',async()=>{
 const storage={getItem:()=>null,setItem(){throw Error('quota exceeded')},removeItem(){}};
 await assert.rejects(commissionAttempt(user,product,{},storage),/quota exceeded/);
});
test('commission action returns the committed order instead of replacing the key through a redirect',async()=>{
 let received;const order='40000000-0000-4000-8000-000000000001',key='50000000-0000-4000-8000-000000000001';
 const {requestCommission}=load('app/commissions/actions.ts',{'@/lib/auth':{requireUser:async()=>({client:{rpc:async(name,params)=>{received={name,params};return {data:order,error:null}}}})},'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('Unexpected redirect')}}});
 const form=new FormData();for(const [k,v] of Object.entries({product,key,brief:'Synthetic user brief long enough for a commission request.',usage:'personal',confirmed:'yes'}))form.set(k,v);
 for(let i=0;i<8;i++)form.append('policies',`60000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 assert.deepEqual(await requestCommission(form),{orderId:order});assert.equal(received.name,'request_commission');assert.equal(received.params.p_key,key);
});
