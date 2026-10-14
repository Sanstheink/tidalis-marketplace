'use client';
import {useState} from 'react';
import {useFormStatus} from 'react-dom';
import {offerRights} from '@/app/rights/actions';
import {rightsKinds,rightsModes,rightsUsage} from '@/lib/artwork-rights';
export type RightsPolicy={id:string;policy_type:string;title:string;version:number;content:string};
function Submit(){const {pending}=useFormStatus();return <button className="btn btn-primary" disabled={pending}>{pending?'กำลังบันทึก…':'ลงนามและเสนอเอกสารให้ผู้ซื้อ'}</button>;}
export default function RightsOfferForm({order,items,shopName,policies,requestKey}:{order:string;items:{id:string;name:string;terms:string}[];shopName:string;policies:RightsPolicy[];requestKey:string}){
 const [kind,setKind]=useState<'license'|'assignment'>('license'),[duration,setDuration]=useState('perpetual'),[item,setItem]=useState(items[0]?.id||'');
 const selected=items.find(i=>i.id===item),policy=policies.find(p=>p.policy_type===`standard-${kind}`);
 return <form action={offerRights} className="operations-form rights-form"><input type="hidden" name="order" value={order}/><input type="hidden" name="key" value={requestKey}/><input type="hidden" name="policy" value={policy?.id||''}/>
 <label>ประเภทเอกสาร<select name="kind" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>{Object.entries(rightsKinds).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <label>รายการในคำสั่งซื้อ<select name="item" value={item} onChange={e=>setItem(e.target.value)}>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
 <label>ชื่อผลงาน<input key={item} name="title" defaultValue={selected?.name} minLength={3} maxLength={200} required/></label>
 <label>{kind==='assignment'?'ผู้โอนสิทธิ์':'ผู้ให้สิทธิ์'} (ชื่อจริง / นิติบุคคล / ร้านค้า)<input name="licensor" defaultValue={shopName} minLength={3} maxLength={160} required/></label>
 {kind==='license'?<><label>ประเภทการใช้สิทธิ์<select name="usage">{Object.entries(rightsUsage).filter(([k])=>k!=='assignment').map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><label>ลักษณะการให้สิทธิ์<select name="exclusivity">{Object.entries(rightsModes).filter(([k])=>k!=='assignment').map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label></>:<><input type="hidden" name="usage" value="assignment"/><input type="hidden" name="exclusivity" value="assignment"/><p className="rights-note">โอนสิทธิ์ทางเศรษฐกิจตามขอบเขตที่ระบุ ค่าตอบแทนต้องรวมในรายการที่ชำระแล้ว การคืนเงินไม่ทำให้สิทธิ์โอนกลับอัตโนมัติ</p></>}
 <p>เลือกสิทธิ์ที่ตกลงและรวมอยู่ในยอดที่ชำระแล้ว แบบฟอร์มนี้ไม่เรียกเก็บเงินเพิ่ม</p>
 <p>การให้สิทธิ์ Sole / Exclusive หรือโอนลิขสิทธิ์ของสินค้าสำเร็จรูปจะระงับการขายผลงานนั้นเมื่อผู้ซื้อยอมรับ และต้องไม่มีรายการของผู้ซื้ออื่นที่ขัดกัน</p>
 <label>พื้นที่ใช้สิทธิ์<input name="territory" defaultValue="ทั่วโลก (Worldwide)" required minLength={2} maxLength={160}/></label>
 <label>ระยะเวลา<select name="duration" value={duration} onChange={e=>setDuration(e.target.value)}><option value="perpetual">ตลอดอายุการคุ้มครองลิขสิทธิ์ (Perpetual)</option><option value="until">กำหนดวันสิ้นสุด</option></select></label>
 {duration==='until'?<label>วันสิ้นสุด (หลังวันนี้)<input type="date" name="ends_on" required/></label>:<input type="hidden" name="ends_on" value=""/>}
 <label>ขอบเขต สิทธิ์เดิม และข้อจำกัดที่ตกลง<textarea key={`${item}-${kind}`} name="scope" defaultValue={kind==='license'?selected?.terms:''} minLength={30} maxLength={2500} rows={6} required placeholder="ระบุการใช้งาน การดัดแปลง จำนวนสินค้า เครดิตผู้วาด และสิทธิ์บุคคลอื่นที่ต้องเปิดเผย"/></label>
 <label>ที่มาข้อตกลง<select name="source"><option value="brief">บรีฟงาน</option><option value="site_chat">แชทในเว็บไซต์</option><option value="external">ช่องทางออนไลน์ภายนอก</option></select></label>
 <label>รายละเอียดอ้างอิงข้อตกลง<textarea name="agreement_reference" minLength={10} maxLength={1000} rows={3} required placeholder="วันที่ ช่องทาง และใจความที่ตกลง หลีกเลี่ยงข้อมูลส่วนบุคคลที่ไม่จำเป็น"/></label>
 <label>ภาพตัวอย่างผลงาน<input name="preview" type="file" accept="image/png,image/jpeg" required/><small>JPG / PNG ไม่เกิน 2 MB และ 4096 × 4096 พิกเซล ภาพนี้จะถูกเก็บกับสัญญา</small></label>
 {policy?<details className="rights-terms"><summary>อ่าน {policy.title} · ฉบับ {policy.version}</summary><div>{policy.content}</div></details>:<p role="status">ข้อกำหนดประเภทนี้ยังไม่ได้เผยแพร่ ผู้ดูแลต้องตรวจและเผยแพร่ที่หน้าจัดการนโยบายก่อน</p>}
 <label>ชื่อผู้ลงนามแทนผู้ให้สิทธิ์<input name="signature" required minLength={3} maxLength={160} autoComplete="name"/></label>
 <label className="operations-check"><input name="confirmed" type="checkbox" value="yes" required/> ฉันมีอำนาจให้หรือโอนสิทธิ์ตามที่ระบุ ตรวจข้อมูลและข้อกำหนดฉบับเต็มแล้ว และยืนยันเจตนาลงนามเสนอข้อตกลงนี้</label>
 {policy?<Submit/>:<button className="btn btn-primary" disabled>รอเผยแพร่ข้อกำหนดมาตรฐาน</button>}
 </form>;
}
