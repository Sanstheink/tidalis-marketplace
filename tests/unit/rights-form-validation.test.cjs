const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const {validateRightsForm}=load('lib/rights-form-validation.ts');
const valid={kind:'license',title:'ผลงานทดสอบ',licensor:'ศิลปินทดสอบ',scope:'อนุญาตใช้ภาพประกอบในการประชาสัมพันธ์ร้านค้าของผู้ซื้อ',territory:'ทั่วโลก',agreement_reference:'ตกลงผ่านแชทคำสั่งซื้อนี้',source:'site_chat',usage:'commercial',exclusivity:'non_exclusive',signature:'ผู้ลงนามทดสอบ'};
test('both document kinds accept complete Thai details',()=>{
 assert.deepEqual(validateRightsForm(valid),{});
 assert.deepEqual(validateRightsForm({...valid,kind:'assignment',usage:'assignment',exclusivity:'assignment'}),{});
});
test('spaces and short prefilled fields identify each failing field',()=>{
 const errors=validateRightsForm({...valid,title:' A ',scope:' '.repeat(30),agreement_reference:'  แชท  '});
 assert.deepEqual(Object.keys(errors),['title','scope','agreement_reference']);
 assert.match(errors.title,/ขณะนี้ 1 ตัวอักษร/);
 assert.match(errors.scope,/30–2500/);
});
test('emoji length uses database code points rather than browser UTF-16 units',()=>{
 assert.ok(validateRightsForm({...valid,title:'🎨🎨'}).title);
 assert.equal(validateRightsForm({...valid,title:'🎨🎨🎨'}).title,undefined);
});
test('enum errors identify their field and a corrected retry clears errors',()=>{
 assert.deepEqual(Object.keys(validateRightsForm({...valid,source:'other',usage:'unknown',exclusivity:''})),['source','usage','exclusivity']);
 assert.deepEqual(validateRightsForm(valid),{});
});
test('server validation returns field errors without redirecting or uploading a preview',async()=>{
 const id='10000000-0000-4000-8000-000000000001';
 const query={select(){return this},eq(){return this},async maybeSingle(){return {data:{id},error:null}}};
 const client={from(){return query},get storage(){throw Error('Invalid form must not upload');}};
 const {offerRights}=load('app/rights/actions.ts',{
  'next/navigation':{redirect(){throw Error('Invalid form must not redirect');}},'next/cache':{revalidatePath(){}},
  '@/lib/auth':{requireSellerHistory:async()=>({client,member:{role:'owner',shop_id:id}})},
  '@/lib/rights-server':{rightsUrl(){return 'https://example.invalid';}}
 });
 const form=new FormData();for(const [k,v] of Object.entries({...valid,order:id,item:id,key:id,title:' A '}))form.set(k,v);
 const result=await offerRights({errors:{},message:''},form);
 assert.deepEqual(Object.keys(result.errors),['title']);assert.match(result.message,/ข้อมูลที่กรอกยังอยู่ครบ/);
});
