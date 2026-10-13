const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const load=require('./load-typescript.cjs');
const methods=['bank_transfer','qr_code','promptpay'];
const order='10000000-0000-4000-8000-000000000003';
function fixture({ready=true,available=methods,attempt=null,error=null}={}){
 const client={
  async rpc(){return {data:{recipientLabel:'Synthetic shop',amountMinor:10000,currency:'THB',methods:available},error};},
  from(table){let attemptQuery=false;const q={select(){return q;},eq(){return q;},in(){attemptQuery=true;return q;},order(){return q;},limit(){return q;},async maybeSingle(){return {data:table==='payment_attempts'&&attemptQuery?attempt:null,error:null};}};return q;}
 };
 const Page=load('components/PaymentOptions.tsx',{
  'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  '@/app/payments/actions':{startPayment(){}},
  '@/lib/supabase/service':{supabaseService:()=>ready?{}:null}
 }).default;
 return async()=>renderToStaticMarkup(await Page({client,orderId:order}));
}
test('configured bank, QR and PromptPay choices are visible and enabled when the server is ready',async()=>{
 const html=await fixture()();for(const method of methods)assert.match(html,new RegExp(`value="${method}"`));
 assert.doesNotMatch(html,/disabled=""|payment-system-unavailable|ผู้รับเงินกำลังตั้งค่าช่องทางชำระ/);
 assert.match(html,/name="recipientName"/);
});
test('missing server configuration does not hide configured methods or blame the shop',async()=>{
 const html=await fixture({ready:false})();
 for(const method of methods)assert.match(html,new RegExp(`value="${method}" disabled=""`));
 assert.match(html,/id="payment-system-unavailable"/);assert.match(html,/ติดต่อผู้ดูแลเว็บไซต์/);
 assert.doesNotMatch(html,/ผู้รับเงินกำลังตั้งค่าช่องทางชำระ/);
});
test('a shop without methods still gets the separate currency setup notice and no stray zero',async()=>{
 const html=await fixture({available:[]})();assert.match(html,/ผู้รับเงินกำลังตั้งค่าช่องทางชำระ/);
 assert.doesNotMatch(html,/payment-method-grid|payment-system-unavailable|>0</);
});
test('an existing attempt stays resumable and a context failure never offers a new payment',async()=>{
 const html=await fixture({attempt:{id:'existing',status:'pending'},ready:false})();assert.match(html,/href="\/payments\/existing"/);assert.doesNotMatch(html,/payment-method-grid/);
 const failed=await fixture({error:{message:'unavailable'}})();assert.match(failed,/ยังไม่พร้อมชำระเงิน/);assert.doesNotMatch(failed,/payment-method-grid/);
});
test('direct payment submission still fails closed without the proof service',async()=>{
 let called=false;
 const action=load('app/payments/actions.ts',{
  '@/lib/auth':{requireUser:async()=>({client:{rpc(){called=true;throw Error('unexpected');}}})},
  '@/lib/supabase/service':{supabaseService:()=>null},
  'next/navigation':{redirect:url=>{throw Object.assign(Error('redirect'),{url});}},
  'next/cache':{revalidatePath(){}}
 }).startPayment;
 const f=new FormData();f.set('orderId',order);f.set('method','bank_transfer');
 await assert.rejects(()=>action(f),e=>e.url===`/account/orders/${order}/payment?notice=payment_configuration_required`);assert.equal(called,false);
});
