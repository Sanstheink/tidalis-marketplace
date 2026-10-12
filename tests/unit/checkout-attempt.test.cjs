const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const {checkoutAttempt,storedCheckoutAttempt,recoveredCartKeys}=load('lib/checkout-attempt.ts');
const buyer='10000000-0000-4000-8000-000000000001',shop='20000000-0000-4000-8000-000000000001',product='30000000-0000-4000-8000-000000000001',key='50000000-0000-4000-8000-000000000001';
function memory(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
test('fixed checkout retries survive remount without persisting the note or terms',async()=>{
 const storage=memory(),payload={note:'Private buyer note',terms:'Private license text'};
 const first=await checkoutAttempt(buyer,shop,payload,storage),retry=await checkoutAttempt(buyer,shop,payload,storage);
 assert.equal(first.key,retry.key);assert.equal(storedCheckoutAttempt(buyer,shop,storage).key,first.key);
 assert.equal([...storage.values.values()].some(v=>v.includes(payload.note)||v.includes(payload.terms)),false);
});
test('fixed checkout identities retain v1 compatibility and isolate buyer and shop',async()=>{
 const storage=memory(),first=await checkoutAttempt(buyer,shop,{},storage);
 assert.equal(first.storageKey,`tidalis:order-attempt:v1:${buyer}:${shop}`);
 assert.equal(storedCheckoutAttempt(buyer+'2',shop,storage),null);assert.equal(storedCheckoutAttempt(buyer,shop+'2',storage),null);
 assert.equal((await checkoutAttempt(buyer,shop,{note:'changed'},storage)).key,first.key);
});
test('an edited retry cannot create another identity while the first request may still be committing',async()=>{
 const storage=memory(),first=await checkoutAttempt(buyer,shop,{note:'original'},storage);
 const edited=await checkoutAttempt(buyer,shop,{note:'edited while the response is unknown'},storage);
 assert.equal(edited.key,first.key);assert.notEqual(edited.fingerprint,first.fingerprint);
 storage.removeItem(edited.storageKey);
 assert.notEqual((await checkoutAttempt(buyer,shop,{note:'a new purchase after acknowledgement'},storage)).key,first.key);
});
test('storage read/write failures and discarded writes cannot produce a sendable identity',async()=>{
 for(const storage of [
  {getItem(){throw Error('blocked')},setItem(){}},
  {getItem:()=>null,setItem(){throw Error('quota exceeded')}},
  {getItem:()=>null,setItem(){}}
 ])await assert.rejects(checkoutAttempt(buyer,shop,{},storage));
});
test('malformed saved identity is never silently replaced',async()=>{
 for(const value of ['{broken',JSON.stringify({key:'bad',fingerprint:'a'.repeat(64)}),JSON.stringify({key,fingerprint:'bad'})]){
  const storage=memory();storage.setItem(`tidalis:order-attempt:v1:${buyer}:${shop}`,value);
  await assert.rejects(checkoutAttempt(buyer,shop,{},storage));assert.equal([...storage.values.values()][0],value);
 }
});
test('recovery clears only unchanged purchased lines, preserving other shops, licenses and edits',()=>{
 const original={shopId:shop,productId:product,license:'personal',quantity:1};
 const order={orderId:'order',items:[{productId:product,license:'personal',quantity:1}]};
 assert.deepEqual(recoveredCartKeys([original,{...original,shopId:'other'},{...original,license:'commercial'},{...original,productId:'new'}],shop,order),[product+':personal']);
 assert.deepEqual(recoveredCartKeys([{...original,quantity:2}],shop,order),[]);
});
function recovery(identity,response={data:null,error:null}){
 const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){return response}};
 const client={from(name){assert.equal(name,'orders');return q}};
 const action=load('app/checkout/actions.ts',{'@/lib/auth':{getIdentity:async()=>({client,...identity})},'@/lib/orders':{},'next/cache':{revalidatePath(){}}}).recoverFixedOrder;
 return {action,filters};
}
test('recovery reads only the current verified buyer, shop, fixed kind and retry identity',async()=>{
 const {action,filters}=recovery({user:{id:buyer,email_confirmed_at:'confirmed'}},{data:{id:'order',order_items:[{product_id:product,usage_type:'personal',quantity:1}]},error:null});
 assert.deepEqual(await action(shop,key),{order:{orderId:'order',items:[{productId:product,license:'personal',quantity:1}]}});
 assert.deepEqual(filters,[['buyer_id',buyer],['shop_id',shop],['order_kind','fixed'],['idempotency_key',key]]);
});
test('recovery rejects unauthenticated, unverified and invalid requests without a query',async()=>{
 for(const [identity,expected] of [[{user:null},'login_required'],[{user:{id:buyer}},'verified_email_required']]){
  const {action,filters}=recovery(identity);assert.equal((await action(shop,key)).error,expected);assert.deepEqual(filters,[]);
 }
 const {action,filters}=recovery({user:{id:buyer,email_confirmed_at:'confirmed'}});
 assert.equal((await action(shop,'invalid')).error,'invalid_items');assert.deepEqual(filters,[]);
});
test('a failed recovery query is distinguishable from an absent order',async()=>{
 const identity={user:{id:buyer,email_confirmed_at:'confirmed'}};
 assert.deepEqual(await recovery(identity).action(shop,key),{order:null});
 assert.deepEqual(await recovery(identity,{data:null,error:{code:'XX000'}}).action(shop,key),{order:null,error:'order_recovery_unavailable'});
});
