import Link from 'next/link';
import {requirePlatformAdmin} from '@/lib/auth';
import {baht,dateThai} from '@/lib/admin-finance';
import {issuePlatformDocument,voidPlatformDocument} from './actions';
export const dynamic='force-dynamic';
const notices:Record<string,string>={
 invalid:'ตรวจข้อมูลและการยืนยันก่อนออก/ยกเลิกเอกสาร',
 failed:'ดำเนินการไม่สำเร็จ: ต้องมีใบแจ้งหนี้ รับเงินยืนยันแล้ว ข้อมูลนิติบุคคล/ผู้ขายครบ และ Admin MFA AAL2',
 issued:'ออกเอกสารสำเร็จแล้ว กรุณาตรวจฉบับพิมพ์',voided:'บันทึกการยกเลิกเอกสารแล้ว'
};
export default async function AdminPlatformBilling({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const {client}=await requirePlatformAdmin();const params=await searchParams;
 const [docs,payments,invoices,shops,issuer]=await Promise.all([
  client.from('platform_billing_documents').select('id,shop_id,invoice_id,payment_id,document_type,document_number,status,total_minor,issued_at,voided_at,void_reason')
    .order('issued_at',{ascending:false}).limit(100),
  client.from('platform_fee_payments').select('id,invoice_id,amount_minor,status,confirmed_by,confirmed_at')
    .eq('status','confirmed').limit(100),
  client.from('seller_invoices').select('id,shop_id,invoice_number,total_minor,status').limit(500),
  client.from('shops').select('id,name').limit(500),
  client.from('platform_issuer_profile').select('legal_name,tax_id,vat_registered,tax_invoice_enabled,approved_at').maybeSingle()
 ]);
 const invoicesById=new Map((invoices.data||[]).map(v=>[v.id,v]));
 const names=new Map((shops.data||[]).map(s=>[s.id,s.name]));
 const existing=new Set((docs.data||[]).map(d=>d.payment_id+':'+d.document_type));
 return <main className="container page-pad">
  <div className="page-heading"><div className="eyebrow">ADMIN / PLATFORM BILLING</div><h1>Platform <em>documents.</em></h1>
   <p>Tidalis ออกเอกสารให้ Seller สำหรับค่าธรรมเนียมที่ได้รับจริงเท่านั้น</p></div>
  <Link href="/admin/finance" className="text-link">← Finance Center</Link>
  {params.notice&&notices[params.notice]&&<p role="status" className="phase4-alert">{notices[params.notice]}</p>}
  <div className="legal-alert">
   เอกสารนี้เป็นทะเบียนและรูปแบบพิมพ์ทั่วไป ไม่ใช่ e-Tax Invoice หรือเอกสารลงลายมือชื่อดิจิทัลตามข้อกำหนด e-Tax
   ต้องให้ฝ่ายบัญชี/ภาษีตรวจข้อมูลและวิธีส่งมอบจริงก่อนนำไปใช้เป็นเอกสารทางภาษี
  </div>
  {[docs,payments,invoices,shops,issuer].some(x=>x.error)&&<p role="alert">อ่านบางตารางไม่สำเร็จ ตรวจ Migration 010 และ Admin AAL2</p>}
  <section className="phase4-card">
   <h2>ผู้ออกเอกสาร (ตั้งค่าโดย Trusted SQL Operator)</h2>
   {issuer.data?<p><strong>{issuer.data.legal_name}</strong> · VAT {issuer.data.vat_registered?'ลงทะเบียน':'ยังไม่เปิด'}
     · Tax invoice {issuer.data.tax_invoice_enabled?'อนุญาตโดยผู้ดูแล':'ปิดอยู่'}</p>:
    <p role="alert">ยังไม่มีโปรไฟล์ Tidalis ที่ได้รับการอนุมัติ จึงไม่อนุญาตให้ออกเอกสาร</p>}
   <p>ห้ามกรอกข้อมูลนิติบุคคลสมมติ หรือเปิด Tax Invoice เพียงเพื่อทดสอบบน Production</p>
  </section>
  <section className="section">
   <h2>รายการรับค่าธรรมเนียมที่ยืนยันแล้ว · สูงสุด 100</h2>
   {(payments.data||[]).filter(p=>p.confirmed_by&&p.confirmed_at).map(p=>{
    const invoice=invoicesById.get(p.invoice_id);return <article className="phase4-card" key={p.id}>
    <h3>{invoice?.invoice_number||p.invoice_id} · {baht(p.amount_minor)}</h3>
    <p>ร้าน {invoice?names.get(invoice.shop_id)||invoice.shop_id:'—'} · ยืนยันรับ {dateThai(p.confirmed_at)}</p>
    {!existing.has(p.id+':receipt')&&<form action={issuePlatformDocument} className="phase4-action-form">
      <input type="hidden" name="payment_id" value={p.id}/>
      <input type="hidden" name="kind" value="receipt"/>
      <label className="checkbox-label"><input type="checkbox" required name="confirmed" value="yes"/>ยืนยันว่าได้ตรวจหลักฐานรับเงิน รายละเอียดผู้ขาย และการลงบัญชีแล้ว</label>
      <button className="btn btn-primary" type="submit" disabled={!issuer.data||!invoice||invoice.status==='draft'||invoice.status==='void'}>ออกใบเสร็จค่าธรรมเนียม</button>
     </form>}
    {issuer.data?.vat_registered&&issuer.data.tax_invoice_enabled&&!existing.has(p.id+':tax_invoice')&&
      <details><summary>ออกใบกำกับภาษี (เฉพาะผู้ได้รับอนุญาตและผ่านการตรวจสอบ)</summary>
       <form action={issuePlatformDocument} className="phase4-action-form">
        <input type="hidden" name="payment_id" value={p.id}/>
        <input type="hidden" name="kind" value="tax_invoice"/>
        <label>เลขประจำตัวผู้เสียภาษีผู้รับเอกสาร (13 หลัก)
         <input name="recipient_tax_id" required pattern="[0-9]{13}" minLength={13} maxLength={13}/></label>
        <label>ฐานภาษี หน่วยสตางค์<input type="text" name="net_minor" required pattern="[0-9]+"/></label>
        <label>VAT หน่วยสตางค์<input type="text" name="vat_minor" required pattern="[0-9]+"/></label>
        <p className="phase5-note">ฐานภาษี + VAT ต้องเท่ากับยอดเงินรับที่ยืนยัน และต้องตรงกับอัตรา VAT ที่ได้รับอนุมัติในฐานข้อมูล</p>
        <label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>ฉันตรวจข้อมูลภาษีผู้ซื้อ/ผู้ขายและมีอำนาจออกเอกสารฉบับนี้</label>
        <button type="submit" className="btn btn-primary">ออกใบกำกับภาษี</button>
       </form></details>}
    </article>;
   })}
   {!payments.error&&!payments.data?.length&&<div className="empty-state">ยังไม่มีรายการรับค่าธรรมเนียมที่ยืนยันแล้ว (ระบบไม่สร้างรายการสมมติ)</div>}
  </section>
  <section className="section">
   <h2>ทะเบียนเอกสารที่ออกแล้ว · สูงสุด 100 รายการ</h2>
   <div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr>
    <th>เลขที่</th><th>ร้าน</th><th>ชนิด</th><th>ยอด</th><th>วันที่ออก</th><th>สถานะ</th><th>ดูฉบับพิมพ์</th></tr></thead>
    <tbody>{(docs.data||[]).map(d=><tr key={d.id}>
     <td>{d.document_number}</td><td>{names.get(d.shop_id)||d.shop_id}</td><td>{d.document_type}</td>
     <td>{baht(d.total_minor)}</td><td>{dateThai(d.issued_at)}</td><td>{d.status}</td>
     <td><Link href={'/admin/finance/documents/'+d.id} className="text-link">ตรวจ/พิมพ์ ↗</Link>
      {d.status==='issued'&&d.document_type==='receipt'&&<details><summary>ยกเลิกเอกสาร</summary>
        <form action={voidPlatformDocument} className="phase4-action-form">
         <input type="hidden" name="document_id" value={d.id}/>
         <label>เหตุผลอย่างน้อย 15 ตัวอักษร<textarea name="reason" required minLength={15} maxLength={1000}/></label>
         <label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>รับทราบว่าต้องแจ้งผู้รับเอกสารและเก็บสำเนาที่ออกแล้ว</label>
         <button type="submit" className="btn btn-outline">บันทึกการยกเลิก</button>
        </form>
       </details>}</td>
    </tr>)}</tbody></table></div>
   {!docs.error&&!docs.data?.length&&<div className="empty-state">ยังไม่มีเอกสารจากค่าธรรมเนียมแพลตฟอร์ม</div>}
  </section>
 </main>;
}
