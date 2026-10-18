'use client';
import {useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {requestCommission} from '@/app/commissions/actions';
import {commissionBriefWithRights} from '@/lib/artwork-rights';
import {commissionAttempt} from '@/lib/commission-attempt';
import {phase6Notice} from '@/lib/phase6-notice';
import type {CheckoutPolicy} from '@/lib/marketplace-cart-utils';

export default function CommissionRequestForm({productId,userId,licenses,policies,ready}:{productId:string;userId:string;licenses:{usageType:string}[];policies:CheckoutPolicy[];ready:boolean}){
 const router=useRouter();const sending=useRef(false);
 const [pending,setPending]=useState(false),[message,setMessage]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(sending.current||!ready)return;
  const form=new FormData(event.currentTarget);if(form.get('confirmed')!=='yes')return;
  sending.current=true;setPending(true);setMessage('');
  const payload={usage:String(form.get('usage')||''),brief:commissionBriefWithRights(String(form.get('brief')||''),form.get('assignmentRequested')==='yes'),policies:policies.map(p=>p.id).sort()};
  if(payload.brief.length>10000){setMessage('รายละเอียดรวมคำขอต้องไม่เกิน 10,000 ตัวอักษร');sending.current=false;setPending(false);return;}
  let attempt;
  try{attempt=await commissionAttempt(userId,productId,payload,sessionStorage);}catch{
   setMessage('ยังบันทึกรหัสคำขอในเบราว์เซอร์ไม่ได้ กรุณาอนุญาตพื้นที่จัดเก็บแล้วลองใหม่');sending.current=false;setPending(false);return;
  }
  form.set('product',productId);form.set('key',attempt.key);form.set('brief',payload.brief);
  for(const policy of payload.policies)form.append('policies',policy);
  try{
   const result=await requestCommission(form);
   if('error' in result){setMessage(phase6Notice(result.error)||'ส่งบรีฟไม่สำเร็จ');return;}
   try{sessionStorage.removeItem(attempt.storageKey);}catch{}
   router.push(`/account/orders/${result.orderId}`);router.refresh();
  }catch{setMessage('ยังยืนยันผลไม่ได้ กรุณาลองอีกครั้ง ระบบจะใช้คำขอเดิมเพื่อป้องกันงานซ้ำ');}
  finally{sending.current=false;setPending(false);}
 }
 return <form onSubmit={event=>void submit(event)} className="operations-form">
  <label>สิทธิ์การใช้งาน<select name="usage" disabled={pending}>{licenses.map(l=><option key={l.usageType} value={l.usageType}>{l.usageType==='personal'?'ใช้ส่วนตัว':'ใช้เชิงพาณิชย์'}</option>)}</select></label>
  <label>รายละเอียดงานและสิ่งที่ต้องการ<textarea name="brief" rows={8} required minLength={30} maxLength={10000} disabled={pending} placeholder="แนวภาพ ขนาดไฟล์ สิ่งที่ต้องมี อ้างอิง และวันที่ต้องการใช้งาน"/></label>
  <label className="operations-check"><input type="checkbox" name="assignmentRequested" value="yes" disabled={pending}/> แจ้งความประสงค์ขอโอนสิทธิ์ขาด (ร้านต้องจัดทำสัญญาและทั้งสองฝ่ายลงนามก่อนมีผล)</label>
  <div className="checkout-policies">{policies.map(p=><details key={p.id}><summary>{p.policy_type} · ฉบับ {p.version}</summary>{p.source_type==='pdf'?(p.document_url?<a href={p.document_url} target="_blank" rel="noreferrer">อ่านเอกสารนโยบาย</a>:<p role="alert">เปิดเอกสารไม่ได้ กรุณาโหลดหน้าใหม่</p>):<p>{p.content}</p>}</details>)}</div>
  <label className="operations-check"><input name="confirmed" value="yes" type="checkbox" required disabled={pending||!ready}/> ฉันอ่านและยอมรับนโยบายและสิทธิ์การใช้งานข้างต้นแล้ว</label>
  {message?<p role="alert" className="form-message">{message}</p>:null}
  <button type="submit" className="btn btn-primary" disabled={pending||!ready}>{pending?'กำลังส่งบรีฟ…':'ส่งบรีฟให้ศิลปิน'}</button>
 </form>;
}
