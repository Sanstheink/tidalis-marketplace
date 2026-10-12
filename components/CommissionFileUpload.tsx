'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {supabaseBrowser} from '@/lib/supabase/browser';
const mime:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',zip:'application/zip',pdf:'application/pdf',psd:'application/octet-stream',clip:'application/octet-stream',kra:'application/octet-stream'};
export default function CommissionFileUpload({orderId,count}:{orderId:string;count:number}){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');const router=useRouter();
 async function upload(file?:File){
  if(!file)return;const ext=file.name.split('.').pop()?.toLowerCase()||'';
  if(!mime[ext]||!file.size||file.size>26214400||count>=3){setNotice('เลือกไฟล์ที่รองรับ ไม่เกิน 25 MB และรวมไม่เกิน 3 ไฟล์ต่อรอบ');return;}
  const client=supabaseBrowser();if(!client){setNotice('เชื่อมต่อไม่ได้ กรุณาลองใหม่');return;}setBusy(true);setNotice('');
  const path=`orders/${orderId}/${crypto.randomUUID()}.${ext}`;
  try{const {error}=await client.storage.from('tidalis-order-deliveries').upload(path,file,{contentType:mime[ext],upsert:false});if(error)throw error;
  const {error:attach}=await client.rpc('attach_commission_file',{p_order:orderId,p_path:path,p_filename:file.name.slice(0,160)});if(attach){await client.storage.from('tidalis-order-deliveries').remove([path]);throw attach;}setNotice('เพิ่มไฟล์แล้ว กรุณาส่งงานให้ผู้ซื้อตรวจ');router.refresh();
  }catch{setNotice('เพิ่มไฟล์ไม่สำเร็จ กรุณาตรวจสถานะงานและยืนยัน Authenticator');}finally{setBusy(false);}
 }
 return <div className="operations-form"><label>เพิ่มไฟล์ส่งมอบส่วนตัว<input type="file" accept=".zip,.psd,.clip,.kra,.pdf,.png,.jpg,.jpeg,.webp" disabled={busy||count>=3} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label><small>ไม่เกิน 25 MB/ไฟล์ · 3 ไฟล์ต่อรอบ · ผู้ซื้อเฉพาะคำสั่งซื้อนี้เข้าถึงได้</small>{notice?<p role="status">{notice}</p>:null}</div>;
}
