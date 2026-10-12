'use client';
import {useState} from 'react';
import {issueZeroPlatformDocument} from '@/app/admin/finance/documents/actions';
import {PendingButton} from './PendingButton';
type Shop={id:string;name:string;recipientName?:string;recipientAddress?:string};
export default function ZeroPlatformDocumentForm({shops,taxEnabled,issuerReady,today}:{shops:Shop[];taxEnabled:boolean;issuerReady:boolean;today:string}){
 const [shopId,setShopId]=useState(''),[kind,setKind]=useState('receipt');const shop=shops.find(s=>s.id===shopId);
 return <form action={issueZeroPlatformDocument} className="operations-form">
  <p>ใช้สำหรับรอบที่ค่าบริการเป็นศูนย์ หรือใบแจ้งหนี้ที่หักเครดิตครบยอด ระบบไม่สร้างรายการโอนเงิน</p>
  <div className="form-columns"><label>ร้านผู้รับเอกสาร<select name="shopId" value={shopId} onChange={e=>setShopId(e.target.value)} required><option value="">เลือกร้าน</option>{shops.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>สกุลเงิน<select name="currency" defaultValue="THB"><option>THB</option><option>LAK</option><option>USD</option></select></label></div>
  <div className="form-columns"><label>เริ่มรอบบริการ<input name="from" type="date" required defaultValue={today.slice(0,8)+'01'} max={today}/></label><label>สิ้นสุดรอบบริการ<input name="to" type="date" required defaultValue={today} max={today}/></label></div>
  <label>ประเภทเอกสาร<select name="kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="receipt">ใบเสร็จรับเงินยอดศูนย์</option>{taxEnabled?<option value="tax_invoice">ใบกำกับภาษีสำหรับบริการยอดศูนย์</option>:null}</select></label>
  <div key={shopId} className="operations-form"><label>ชื่อผู้รับเอกสารจริง<input name="recipientName" required minLength={3} maxLength={160} defaultValue={shop?.recipientName||''}/></label><label>ที่อยู่ผู้รับเอกสารจริง<textarea name="recipientAddress" required minLength={15} maxLength={1000} defaultValue={shop?.recipientAddress||''}/></label></div>
  {kind==='tax_invoice'?<label>เลขประจำตัวผู้เสียภาษีผู้รับที่ตรวจสอบแล้ว<input name="recipientTaxId" required pattern="[0-9]{13}" maxLength={13}/></label>:null}
  <label className="operations-check"><input name="confirmed" type="checkbox" value="yes" required/> ฉันตรวจรอบบริการ ข้อมูลผู้ออกและผู้รับแล้ว ยอดสุทธิของเอกสารนี้เป็นศูนย์จริง</label>
  <PendingButton disabled={!issuerReady||!shopId}>ออกเอกสาร 0 บาท / ยอดศูนย์</PendingButton>
 </form>;
}
