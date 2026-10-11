'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Clock3,CheckCircle2} from 'lucide-react';
import {cancelFixedOrder} from '@/app/checkout/actions';
import {checkoutError} from '@/lib/marketplace-cart-utils';
export function OrderReservation({id,expiresAt}:{id:string;expiresAt:string}){
  const [now,setNow]=useState<number|null>(null);const [pending,setPending]=useState(false);const [confirm,setConfirm]=useState(false);const [message,setMessage]=useState('');const router=useRouter();
  useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer)},[]);
  const remaining=now===null?null:Math.max(0,Math.ceil((Date.parse(expiresAt)-now)/1000));
  async function cancel(){setPending(true);setMessage('');try{const result=await cancelFixedOrder(id);if(result.error)setMessage(checkoutError(result.error));else router.refresh()}catch{setMessage('ยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง')}finally{setPending(false)}}
  return <section className="commerce-card reservation-card"><div className="reservation-heading"><CheckCircle2 size={23}/><div><h2>{remaining===0?'หมดเวลาจองแล้ว':'บันทึกคำสั่งซื้อแล้ว'}</h2><p>{remaining===0?'สินค้ากลับไปพร้อมให้ผู้อื่นจองแล้ว':'สินค้าถูกจองให้คุณชั่วคราว'}</p></div></div><div className="reservation-timer"><Clock3 size={20}/><span>{remaining===null?'กำลังตรวจเวลาจอง':remaining===0?'สิ้นสุดการจอง':`${Math.floor(remaining/60).toString().padStart(2,'0')}:${(remaining%60).toString().padStart(2,'0')}`}</span><small>หมดเขต {new Date(expiresAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</small></div>
    <p className="commerce-muted">ระบบชำระเงินและส่งมอบไฟล์ยังไม่เปิด โปรดอย่าโอนเงินสำหรับรายการนี้</p>
    {confirm?<div className="cancel-confirmation"><p>ยืนยันการยกเลิกคำสั่งซื้อและคืนสิทธิ์การจอง?</p><div className="button-row"><button className="btn btn-outline" disabled={pending} onClick={cancel}>{pending?'กำลังยกเลิก…':'ยืนยันยกเลิก'}</button><button className="btn btn-ghost" disabled={pending} onClick={()=>setConfirm(false)}>เก็บรายการไว้</button></div></div>:<button className="btn btn-outline wide" onClick={()=>setConfirm(true)}>ยกเลิกคำสั่งซื้อ</button>}
    {message?<p className="form-message" role="alert">{message}</p>:null}
  </section>;
}
