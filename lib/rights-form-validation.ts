export const rightsTextRules = {
 title: {label:'ชื่อผลงาน', min:3, max:200},
 licensor: {label:'ชื่อผู้ให้สิทธิ์ / ผู้โอนสิทธิ์', min:3, max:160},
 scope: {label:'ขอบเขตสิทธิ์', min:30, max:2500},
 territory: {label:'พื้นที่ใช้สิทธิ์', min:2, max:160},
 agreement_reference: {label:'รายละเอียดอ้างอิงข้อตกลง', min:10, max:1000},
 signature: {label:'ชื่อผู้ลงนาม', min:3, max:160},
} as const;
export type RightsFormErrors = Record<string,string>;
export type RightsOfferState = {errors:RightsFormErrors; message:string};
export function validateRightsForm(values:Record<string,string>):RightsFormErrors {
 const errors:RightsFormErrors={};
 for(const [field,rule] of Object.entries(rightsTextRules)){
  // Count Unicode code points like PostgreSQL length(text), after server trimming.
  const count=Array.from((values[field]||'').trim()).length;
  if(count<rule.min||count>rule.max) errors[field]=`${rule.label}ต้องมี ${rule.min}–${rule.max} ตัวอักษร หลังตัดช่องว่างหัวท้าย (ขณะนี้ ${count} ตัวอักษร)`;
 }
 if(!['license','assignment'].includes(values.kind))errors.kind='เลือกประเภทเอกสาร';
 if(!['brief','site_chat','external'].includes(values.source))errors.source='เลือกที่มาข้อตกลง';
 if(values.kind==='license'){
  if(!['personal','commercial','merchandise'].includes(values.usage))errors.usage='เลือกประเภทการใช้สิทธิ์';
  if(!['non_exclusive','sole','exclusive'].includes(values.exclusivity))errors.exclusivity='เลือกลักษณะการให้สิทธิ์';
 }
 return errors;
}
