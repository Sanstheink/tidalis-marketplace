const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const {NextRequest,NextResponse}=require('next/server');
const {updateSessionResponse,preventAuthCaching}=load('lib/supabase/response.ts');
const {otpSlots,otpValue,isCompleteOtp}=load('lib/otp.ts');
const {chooseSellerMembership}=load('lib/seller-workspace.ts');
const {catalogFilters,catalogHref}=load('lib/catalog-query.ts');

test('multiple SSR cookie callbacks retain cookies, attributes, cache headers and the updated request',()=>{
  const request=new NextRequest('https://example.invalid/account');
  let response=NextResponse.next({request});
  response.headers.set('Vary','Cookie');
  response=updateSessionResponse(request,response,[{name:'session.0',value:'first',options:{path:'/',httpOnly:true,maxAge:60}}],{'Cache-Control':'private, no-store','Expires':'0','Pragma':'no-cache'});
  response=updateSessionResponse(request,response,[{name:'session.1',value:'second',options:{path:'/',sameSite:'lax'}}],{});
  assert.equal(response.cookies.get('session.0').value,'first');
  assert.equal(response.cookies.get('session.0').httpOnly,true);
  assert.equal(response.cookies.get('session.1').value,'second');
  assert.equal(request.cookies.get('session.1').value,'second');
  assert.match(response.headers.get('x-middleware-request-cookie'),/session.0=first; session.1=second/);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(response.headers.get('Expires'),'0');
  assert.equal(response.headers.get('Vary'),'Cookie');
});
test('auth redirects retain their destination and cannot be cached',()=>{
  const response=preventAuthCaching(NextResponse.redirect('https://example.invalid/account'));
  assert.equal(response.headers.get('location'),'https://example.invalid/account');
  assert.match(response.headers.get('Cache-Control'),/private.*no-store/);
  assert.equal(response.headers.get('Pragma'),'no-cache');
});
test('deleting a middle OTP cell preserves the other positions and disables submission',()=>{
  const slots=otpSlots('123456');slots[2]='';
  const value=otpValue(slots);
  assert.equal(value,'12 456');assert.deepEqual(otpSlots(value),['1','2','','4','5','6']);
  assert.equal(isCompleteOtp(value),false);slots[2]='9';assert.equal(isCompleteOtp(otpValue(slots)),true);
});
test('OTP requires exactly six ASCII digits',()=>{
  for(const value of ['12345','1234567','12 456','12345x','１２３４５６',''])assert.equal(isCompleteOtp(value),false);
  assert.equal(isCompleteOtp('001234'),true);
});
test('a single eligible shop can be selected by default; multiple shops require a choice',()=>{
  const members=[{shop_id:'first',role:'owner'},{shop_id:'second',role:'artist'}];
  assert.equal(chooseSellerMembership(members,['first']).shop_id,'first');
  assert.equal(chooseSellerMembership(members,['first','second']),null);
});
test('a selected shop must remain a live eligible membership',()=>{
  const members=[{shop_id:'first'},{shop_id:'second'}];
  assert.equal(chooseSellerMembership(members,['first','second'],'second').shop_id,'second');
  assert.equal(chooseSellerMembership(members,['first'],'second'),null);
  assert.equal(chooseSellerMembership(members,['first'],'foreign'),null);
});
test('catalog parameters are bounded and repeated/invalid values cannot become filters',()=>{
  assert.deepEqual(catalogFilters({q:['first','second'],type:'foreign',sort:'random',page:'-3'}),{q:'',type:'all',sort:'featured',page:1});
  assert.deepEqual(catalogFilters({q:'  landscape  ',type:'commission',sort:'low',page:'2'}),{q:'landscape',type:'commission',sort:'low',page:2});
  assert.equal(catalogFilters({page:'999999999999999999999999'}).page,10000);
  assert.equal(catalogFilters({q:'x'.repeat(100)}).q.length,80);
});
test('category changes reset the page and keep the query/ordering in the URL',()=>{
  const url=catalogHref('/shop',{q:'100% & art',type:'all',sort:'high',page:4},{type:'digital_asset',page:1});
  const params=new URL(url,'https://example.invalid').searchParams;
  assert.equal(params.get('q'),'100% & art');assert.equal(params.get('type'),'digital_asset');
  assert.equal(params.get('sort'),'high');assert.equal(params.has('page'),false);
});

function catalog(queryResult,rpcResult=queryResult) {
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='public-test-key';
  const query={select(){return this},eq(){return this},order(){return this},limit(){return this},maybeSingle(){return Promise.resolve(queryResult)},then(resolve,reject){return Promise.resolve(queryResult).then(resolve,reject)}};
  return load('lib/public-catalog.ts',{'server-only':{},'@supabase/supabase-js':{createClient:()=>({from:()=>query,rpc:()=>Promise.resolve(rpcResult)})}});
}
test('catalog errors propagate as unavailable rather than empty results or a false 404',async()=>{
  const c=catalog({data:null,error:{code:'NETWORK'}});
  await assert.rejects(c.getPublicProducts(),c.CatalogUnavailableError);
  await assert.rejects(c.getPublicProductByRoute('sample--10000000-0000-4000-8000-000000000001'),c.CatalogUnavailableError);
  await assert.rejects(c.getPublicShop('sample'),c.CatalogUnavailableError);
  await assert.rejects(c.getPublicCatalogPage(),c.CatalogUnavailableError);
});
test('a successful no-row response remains a real not-found result',async()=>{
  const c=catalog({data:null,error:null});assert.equal(await c.getPublicShop('absent'),null);
  assert.equal(await c.getPublicProductByRoute('absent--10000000-0000-4000-8000-000000000001'),null);
});
test('empty and malformed paged responses are distinguished',async()=>{
  const empty=catalog({data:{items:[],total:0},error:null});assert.equal((await empty.getPublicCatalogPage()).total,0);
  const bad=catalog({data:{items:[],total:'0'},error:null});await assert.rejects(bad.getPublicCatalogPage(),bad.CatalogUnavailableError);
});
