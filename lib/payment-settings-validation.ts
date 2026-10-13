export type PaymentSettingsState={errors:Record<string,string>};
export const emptyPaymentSettings:PaymentSettingsState={errors:{}};

const value=(form:FormData,key:string)=>String(form.get(key)||'').trim();
// Accept the separators people commonly copy from printed account/tax records.
export function identityDigits(value:string){
 return value.replace(/[๐-๙]/g,d=>String(d.charCodeAt(0)-'๐'.charCodeAt(0))).replace(/[-\s]/g,'');
}
export function recipientInput(form:FormData){
 return {name:value(form,'name'),address:value(form,'address'),currency:value(form,'currency')||'THB',bank:value(form,'bank'),account:value(form,'account').replace(/\s/g,''),promptpay:identityDigits(value(form,'promptpay')),bankEnabled:form.get('bankEnabled')==='on',promptpayEnabled:form.get('promptpayEnabled')==='on',confirmed:form.get('confirmed')==='yes'};
}
export function issuerInput(form:FormData){
 return {name:value(form,'name'),address:value(form,'address'),taxId:identityDigits(value(form,'taxId')),confirmed:form.get('confirmed')==='yes'};
}
function identityErrors(name:string,address:string){
 const errors:Record<string,string>={};
 if(name.length<3||name.length>160)errors.name='กรอกชื่อจริงอย่างน้อย 3 และไม่เกิน 160 ตัวอักษร';
 if(address.length<15||address.length>1000)errors.address='กรอกที่อยู่จริงอย่างน้อย 15 และไม่เกิน 1,000 ตัวอักษร';
 return errors;
}
export function validateRecipient(form:FormData):PaymentSettingsState{
 const input=recipientInput(form),errors=identityErrors(input.name,input.address);
 if(!['THB','LAK','USD'].includes(input.currency))errors.currency='เลือกสกุลเงิน THB, LAK หรือ USD';
 if(input.bank.length>120||(input.bankEnabled&&input.bank.length<2))errors.bank='กรอกชื่อธนาคารอย่างน้อย 2 ตัวอักษรเมื่อเปิดโอนผ่านเลขบัญชี';
 if(input.account.length>40||(input.bankEnabled&&!/^[A-Za-z0-9 -]{6,40}$/.test(input.account)))errors.account='กรอกเลขบัญชี 6–40 ตัว ใช้ตัวเลข ตัวอักษรอังกฤษ หรือขีด';
 if(input.promptpay.length>18||(input.promptpayEnabled&&!/^(0[0-9]{9}|[0-9]{13})$/.test(input.promptpay)))errors.promptpay='เมื่อเปิดพร้อมเพย์ ให้กรอกเบอร์โทรศัพท์ไทย 10 หลักขึ้นต้นด้วย 0 หรือเลขประจำตัว 13 หลัก';
 if(!input.confirmed)errors.confirmed='ทำเครื่องหมายยืนยันว่าชื่อผู้รับและบัญชีถูกต้องก่อนบันทึก';
 return {errors};
}
export function validateIssuer(form:FormData):PaymentSettingsState{
 const input=issuerInput(form),errors=identityErrors(input.name,input.address);
 if(input.taxId&&!/^[0-9]{13}$/.test(input.taxId))errors.taxId='เลขผู้เสียภาษีต้องมี 13 หลัก ถ้ายังไม่มีให้เว้นว่าง';
 if(!input.confirmed)errors.confirmed='ทำเครื่องหมายยืนยันข้อมูลผู้ออกเอกสารก่อนบันทึก';
 return {errors};
}
export function paymentSettingsFailure(error:{code?:string;message?:string},issuer=false):PaymentSettingsState{
 const known:Record<string,string>={invalid_recipient:'ตรวจชื่อผู้รับเงิน ธนาคาร และเลขบัญชีอีกครั้ง',invalid_billing_address:'ตรวจที่อยู่จริงและสกุลเงินบัญชี',invalid_issuer:'ตรวจชื่อ ที่อยู่ และเลขผู้เสียภาษี 13 หลัก หรือเว้นเลขผู้เสียภาษีว่าง',admin_mfa_required:'ยืนยัน Authenticator อีกครั้งก่อนบันทึกข้อมูลแพลตฟอร์ม',finance_mfa_required:'ยืนยัน Authenticator และตรวจสิทธิ์เจ้าของร้านหรือฝ่ายการเงิน'};
 return {errors:{form:known[error.message||'']||(error.code==='23514'?'ข้อมูลบัญชีหรือพร้อมเพย์ไม่ตรงรูปแบบ กรุณาตรวจช่องทางที่เปิดใช้งาน':issuer?'บันทึกผู้ออกใบเสร็จไม่สำเร็จ กรุณาลองใหม่ ข้อมูลที่กรอกยังอยู่':'บันทึกผู้รับเงินไม่สำเร็จ กรุณาลองใหม่ ข้อมูลที่กรอกยังอยู่')}};
}
