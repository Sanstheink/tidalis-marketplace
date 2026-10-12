const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const id='30000000-0000-4000-8000-000000000001',shop='20000000-0000-4000-8000-000000000001';
const form=values=>{const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,v);return f;};
function fixture({role='owner',owned=true,selfPublishing=true,rpcError=null}={}){
 const calls=[],filters=[],paths=[];let mfa=0,auth=0;
 const query={select(){return this},eq(key,value){filters.push([key,value]);return this},async maybeSingle(){return {data:owned?{id}:null}}};
 const client={from(table){assert.equal(table,'products');return query},async rpc(fn,params){calls.push({fn,params});return {error:rpcError}}};
 const redirect=url=>{throw Object.assign(new Error('redirect'),{url})};
 const overrides={'next/navigation':{redirect},'next/cache':{revalidatePath:p=>paths.push(p)},'@/lib/auth':{requireSeller:async()=>{auth++;return {client,member:{role,shop_id:shop}}},requireMfa:async()=>{mfa++},requirePlatformAdmin:async()=>{auth++;return {client}}},'@/lib/seller-access':{sellerAccessMode:async()=>({available:true,selfPublishing})}};
 return {seller:load('app/seller/products/review-actions.ts',overrides).changeSellerProductReview,admin:load('app/admin/product-reviews/actions.ts',overrides).reviewProductPublication,calls,filters,paths,auth:()=>auth,mfa:()=>mfa};
}
test('seller action accepts a real product UUID and self-publishes with ownership and MFA checks',async()=>{
 const f=fixture();await assert.rejects(()=>f.seller(form({id,action:'submit',confirmed:'yes'})),e=>e.url==='/seller/products?notice=published');
 assert.equal(f.auth(),1);assert.equal(f.mfa(),1);assert.deepEqual(f.filters,[['id',id],['shop_id',shop]]);assert.deepEqual(f.calls,[{fn:'publish_own_product',params:{p_product:id,p_confirmed:true}}]);assert.ok(f.paths.includes('/'));
});
test('manual mode passes a real UUID to the legacy review RPC',async()=>{
 const f=fixture({selfPublishing:false});await assert.rejects(()=>f.seller(form({id,action:'submit'})),e=>e.url==='/seller/products?notice=updated');assert.deepEqual(f.calls,[{fn:'submit_product_for_review',params:{p_product_id:id}}]);
});
test('valid admin approval reaches the review RPC instead of being rejected as invalid',async()=>{
 const f=fixture();await assert.rejects(()=>f.admin(form({id,decision:'approved',confirmed:'yes'})),e=>e.url==='/admin/product-reviews?notice=reviewed');assert.deepEqual(f.calls,[{fn:'review_product_publication',params:{p_product_id:id,p_decision:'approved',p_note:'',p_confirmed:true}}]);
});
test('invalid IDs, missing confirmation, foreign products and read-only roles cannot publish',async()=>{
 for(const [options,values,notice] of [[{}, {id:id.replace('-8000',''),action:'publish',confirmed:'yes'},'invalid'],[{}, {id,action:'publish'},'confirmation-required'],[{owned:false},{id,action:'publish',confirmed:'yes'},'invalid'],[{role:'viewer'},{id,action:'publish',confirmed:'yes'},'read-only']]){
  const f=fixture(options);await assert.rejects(()=>f.seller(form(values)),e=>e.url===`/seller/products?notice=${notice}`);assert.deepEqual(f.calls,[]);
 }
});
