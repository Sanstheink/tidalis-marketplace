import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';
import {baht,dateThai,uuid} from '@/lib/admin-finance';
export const dynamic='force-dynamic';
export default async function PlatformBillingPrintable({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const {client}=await requirePlatformAdmin();
 const {data,error}=await client.from('platform_billing_documents')
  .select('id,document_number,document_type,status,net_minor,vat_minor,total_minor,issued_at,issuer_snapshot,recipient_snapshot,void_reason,voided_at,invoice_id,payment_id')
  .eq('id',id).maybeSingle();
 if(error||!data)notFound();
 const issuer=data.issuer_snapshot as Record<string,string>;
 const recipient=data.recipient_snapshot as Record<string,string>;
 return <main className="container page-pad">
  <Link href="/admin/finance/documents" className="text-link">← เอกสารการเงิน</Link>
  <div className="phase4-card" style={{background:'#fff',color:'#171717',maxWidth:800,margin:'25px auto'}}>
   <p style={{fontWeight:'bold'}}>TIDALIS MARKETPLACE</p>
   <h1>{data.document_type==='receipt'?'ใบเสร็จรับเงินค่าธรรมเนียมแพลตฟอร์ม':'ใบกำกับภาษีค่าธรรมเนียมแพลตฟอร์ม'}</h1>
   {data.status==='void'&&<h2 style={{color:'darkred'}}>ยกเลิก (VOID)</h2>}
   <p>เลขที่เอกสาร: <strong>{data.document_number}</strong></p>
   <p>ออกเมื่อ: {dateThai(data.issued_at)}</p>
   <hr/>
   <h3>ผู้ออก</h3><p>{issuer.legal_name}</p><p>{issuer.address}</p>
   <p>เลขประจำตัวผู้เสียภาษี: {issuer.tax_id} · สาขา {issuer.branch_code}</p>
   <h3>ผู้รับ</h3><p>{recipient.legal_name}</p><p>{recipient.address}</p>
   <p>สาขา {recipient.branch_code} {recipient.tax_id?'· Tax ID '+recipient.tax_id:''}</p><hr/>
   <h3>รายการ</h3><p>ค่าธรรมเนียมแพลตฟอร์ม Marketplace Tidalis</p>
   {data.document_type==='tax_invoice'&&<>
    <p>ฐานภาษี: {baht(data.net_minor)}</p><p>ภาษีมูลค่าเพิ่ม: {baht(data.vat_minor)}</p>
   </>}
   <h2>รวมยอดเงินที่ยืนยันรับ: {baht(data.total_minor)}</h2>
   <p style={{fontSize:12}}>อ้างอิง Invoice: {data.invoice_id} · Payment: {data.payment_id}</p>
   {data.status==='void'&&<p>เหตุผลยกเลิก: {data.void_reason} · {dateThai(data.voided_at)}</p>}
  </div>
  <div className="legal-alert">พิมพ์จาก Browser (Ctrl+P) หรือบันทึกเป็น PDF ได้ แต่ไม่ใช่การรับรองเป็น e-Tax Invoice หรือเอกสารอิเล็กทรอนิกส์ลงลายมือชื่อตามกฎหมายโดยอัตโนมัติ</div>
 </main>;
}
