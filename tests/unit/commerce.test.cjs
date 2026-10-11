const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-typescript.cjs');
const {normalizeLiveCart,orderState}=load('lib/marketplace-cart-utils.ts');
const productId='30000000-0000-4000-8000-000000000001',shopId='20000000-0000-4000-8000-000000000001';
test('live cart rejects demo IDs and never trusts stored price/name/keys',()=>{
 const line={productId,shopId,license:'personal',quantity:2,priceMinor:1,name:'forged'};
 assert.deepEqual(normalizeLiveCart([line,{...line,productId:'pr-001'},{...line,license:'foreign'},{...line,quantity:1.5}]),[{productId,shopId,license:'personal',quantity:2}]);
});
test('duplicate live cart entries are bounded and cannot reassign a product to another shop',()=>{
 const line={productId,shopId,license:'commercial',quantity:15};assert.deepEqual(normalizeLiveCart([line,line,{...line,shopId:'20000000-0000-4000-8000-000000000002'}]),[{...line,quantity:20}]);
});
test('expired leases are displayed as expired while paid/cancelled statuses are preserved',()=>{
 assert.equal(orderState('pending','2026-01-01T00:00:00Z',Date.parse('2026-01-01T00:30:00Z')),'expired');
 assert.equal(orderState('paid','2026-01-01T00:00:00Z',Date.now()),'paid');assert.equal(orderState('pending',null),'pending');
});
