export const shopPolicyTypes=[
  {value:'refund',label:'นโยบายการยกเลิกและคืนเงิน',short:'Refund Policy'},
  {value:'delivery',label:'นโยบายส่งมอบผลงาน',short:'Delivery Policy'},
  {value:'license',label:'นโยบายสิทธิ์การใช้งาน',short:'License Policy'},
  {value:'other',label:'เงื่อนไขเพิ่มเติมของร้าน',short:'Additional Terms'},
] as const;
export const shopPolicyLabel=(type:string)=>shopPolicyTypes.find(p=>p.value===type)?.label||type;
