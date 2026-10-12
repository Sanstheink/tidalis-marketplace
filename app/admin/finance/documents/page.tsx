import Link from 'next/link';
import PageNav from '@/components/PageNav';
import {pageWindow} from '@/lib/pagination';
import ZeroPlatformDocumentForm from '@/components/ZeroPlatformDocumentForm';
import {requirePlatformAdmin} from '@/lib/auth';
import {formatMoney} from '@/lib/payment-utils';
import {dateThai} from '@/lib/admin-finance';
import {issuePlatformDocument,voidPlatformDocument} from './actions';
export const dynamic='force-dynamic';
const notices:Record<string,string>={
 invalid:'ตรวจข้อมูลและการยืนยันก่อนออก/ยกเลิกเอกสาร',
 failed:'ยังออกใบเสร็จไม่ได้ กรุณาตรวจการยืนยันรับเงิน ข้อมูลผู้ออกและผู้รับเอกสาร และยืนยัน Authenticator',
 issued:'ออกเอกสารสำเร็จแล้ว กรุณาตรวจฉบับพิมพ์',voided:'บันทึกการยกเลิกเอกสารแล้ว',zero_balance_required:'รอบนี้มีค่าธรรมเนียม จึงออกเป็นศูนย์ไม่ได้ กรุณาใช้ยอดตามใบแจ้งหนี้จริง',invalid_period:'ตรวจรอบบริการ ต้องไม่เกินวันที่ปัจจุบัน',issuer_required:'ตั้งค่าผู้ออกเอกสารจริงก่อน',billing_identity_required:'กรอกชื่อและที่อยู่จริงของผู้รับเอกสารให้ครบ',vat_issuance_disabled:'ผู้ออกเอกสารยังไม่ได้เปิดสิทธิ์ออกใบกำกับภาษี',verified_tax_identity_required:'ต้องใช้ข้อมูลภาษีผู้รับเอกสารที่ผ่านการตรวจแล้ว',tax_zero_context_required:'ใบแจ้งหนี้ที่ใช้เครดิตต้องใช้เอกสารให้ตรงกับรายการเดิม'
};
export default async function AdminPlatformBilling({searchParams}:{searchParams:Promise<{notice?:string;page?:string;paymentPage?:string}>}){
 const {client}=await requirePlatformAdmin('/admin/finance/documents');const params=await searchParams;const docPage=pageWindow(params.page);const payPage=pageWindow(params.paymentPage);
 const [docs,payments,shops,issuer,profiles]=await Promise.all([
  client.from('platform_billing_documents').select('id,shop_id,invoice_id,payment_id,document_type,document_number,status,total_minor,currency,issued_at,voided_at,void_reason',{count:'exact'}).order('issued_at',{ascending:false}).order('id',{ascending:false}).range(docPage.from,docPage.to),
  client.from('platform_fee_payments').select('id,invoice_id,amount_minor,status,confirmed_by,confirmed_at,invoice:seller_invoices!inner(id,shop_id,invoice_number,total_minor,currency,status)',{count:'exact'}).eq('status','confirmed').order('confirmed_at',{ascending:false}).order('id',{ascending:false}).range(payPage.from,payPage.to),
  client.from('shops').select('id,name').order('name').limit(500),
  client.from('platform_issuer_profile').select('legal_name,tax_id,vat_registered,tax_invoice_enabled,approved_at').maybeSingle(),
  client.from('payment_profiles').select('shop_id,recipient_name,billing_address').not('shop_id','is',null)
 ]);
 const paidIds=(payments.data||[]).map(p=>p.id);
 const issued=paidIds.length?await client.from('platform_billing_documents').select('payment_id,document_type').in('payment_id',paidIds).eq('status','issued'):{data:[],error:null};
 const names=new Map((shops.data||[]).map(s=>[s.id,s.name]));
 const existing=new Set((issued.data||[]).map(d=>d.payment_id+':'+d.document_type));
 const recipients=new Map((profiles.data||[]).map(p=>[p.shop_id,p]));
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return <main className="container page-pad">
  <div className="page-heading"><div className="eyebrow">ADMIN / PLATFORM BILLING</div><h1>ใบเสร็จ<em>แพลตฟอร์ม.</em></h1>
   <p>ออกเอกสารจากค่าธรรมเนียมรับจริง หรือยอดค่าบริการศูนย์โดยไม่สร้างรายการโอน</p></div>
  <Link href="/admin/finance" className="text-link">← Finance Center</Link>
  {params.notice&&notices[params.notice]&&<p role="status" className="phase4-alert">{notices[params.notice]}</p>}
  <div className="legal-alert">
   เอกสารนี้เป็นทะเบียนและรูปแบบพิมพ์ทั่วไป ไม่ใช่ e-Tax Invoice หรือเอกสารลงลายมือชื่อดิจิทัลตามข้อกำหนด e-Tax
   ต้องให้ฝ่ายบัญชี/ภาษีตรวจข้อมูลและวิธีส่งมอบจริงก่อนนำไปใช้เป็นเอกสารทางภาษี
  </div>
  {[docs,payments,shops,issuer,profiles,issued].some(x=>x.error)&&<p role="alert">อ่านบางตารางไม่สำเร็จ กรุณาลองใหม่และตรวจว่าติดตั้ง migration ครบแล้ว</p>}
  <section className="phase4-card">
   <h2>ผู้ออกใบเสร็จรับเงิน</h2>
   {issuer.data?<p><strong>{issuer.data.legal_name}</strong> · VAT {issuer.data.vat_registered?'ลงทะเบียน':'ยังไม่เปิด'}
     · Tax invoice {issuer.data.tax_invoice_enabled?'อนุญาตโดยผู้ดูแล':'ปิดอยู่'}</p>:
    <p role="alert">ยังไม่มีโปรไฟล์ Tidalis ที่ได้รับการอนุมัติ จึงไม่อนุญาตให้ออกเอกสาร</p>}
   <p><Link className="text-link" href="/admin/settings/payments">ตั้งค่าข้อมูลผู้ออกเอกสาร →</Link></p>
  </section>
  <section className="phase4-card"><h2>ออกเอกสารยอดศูนย์</h2><ZeroPlatformDocumentForm shops={(shops.data||[]).map(shop=>({id:shop.id,name:shop.name,recipientName:recipients.get(shop.id)?.recipient_name,recipientAddress:recipients.get(shop.id)?.billing_address||undefined}))} issuerReady={Boolean(issuer.data?.approved_at)&&![shops,issuer,profiles].some(r=>r.error)} taxEnabled={Boolean(issuer.data?.vat_registered&&issuer.data.tax_invoice_enabled&&issuer.data.tax_id)} today={today}/></section>
  <section className="section">
   <h2>รายการรับค่าธรรมเนียมที่ยืนยันแล้ว</h2>
   {(payments.data||[]).filter(p=>p.confirmed_at).map(p=>{
    const invoice=Array.isArray(p.invoice)?p.invoice[0]:p.invoice;return <article className="phase4-card" key={p.id}>
    <h3>{invoice?.invoice_number||p.invoice_id} · {formatMoney(p.amount_minor,invoice?.currency)}</h3>
    <p>ร้าน {invoice?names.get(invoice.shop_id)||invoice.shop_id:'—'} · ยืนยันรับ {dateThai(p.confirmed_at)}</p>
    {!issued.error&&!existing.has(p.id+':receipt')&&<form action={issuePlatformDocument} className="phase4-action-form">
      <input type="hidden" name="payment_id" value={p.id}/>
      <input type="hidden" name="kind" value="receipt"/>
      <label className="checkbox-label"><input type="checkbox" required name="confirmed" value="yes"/>ยืนยันว่าได้ตรวจหลักฐานรับเงิน รายละเอียดผู้ขาย และการลงบัญชีแล้ว</label>
      <button className="btn btn-primary" type="submit" disabled={!issuer.data||!invoice||invoice.status==='draft'||invoice.status==='void'}>ออกใบเสร็จค่าธรรมเนียม</button>
     </form>}
    {!issued.error&&issuer.data?.vat_registered&&issuer.data.tax_invoice_enabled&&!existing.has(p.id+':tax_invoice')&&
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
   <PageNav path="/admin/finance/documents" page={payPage.page} total={payments.count||0} queryKey="paymentPage" params={{page:params.page}} label="รายการรับค่าบริการ"/>
  </section>
  <section className="section">
   <h2>ทะเบียนเอกสารที่ออกแล้ว</h2>
   <div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr>
    <th>เลขที่</th><th>ร้าน</th><th>ชนิด</th><th>ยอด</th><th>วันที่ออก</th><th>สถานะ</th><th>ดูฉบับพิมพ์</th></tr></thead>
    <tbody>{(docs.data||[]).map(d=><tr key={d.id}>
     <td>{d.document_number}</td><td>{names.get(d.shop_id)||d.shop_id}</td><td>{d.document_type}</td>
     <td>{formatMoney(d.total_minor,d.currency)}</td><td>{dateThai(d.issued_at)}</td><td>{d.status}</td>
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
   <PageNav path="/admin/finance/documents" page={docPage.page} total={docs.count||0} params={{paymentPage:params.paymentPage}} label="ทะเบียนเอกสาร"/>
  </section>
 </main>;
}
