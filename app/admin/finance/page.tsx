import Link from 'next/link';
import {requirePlatformAdmin} from '@/lib/auth';
import {baht,dateThai} from '@/lib/admin-finance';
export const dynamic='force-dynamic';

export default async function AdminFinance(){
 const {client}=await requirePlatformAdmin();
 const [shops,invoices,payments,commissions]=await Promise.all([
  client.from('shops').select('id,name').order('name').limit(500),
  client.from('seller_invoices').select('id,shop_id,invoice_number,total_minor,status,issued_at,period_from,period_to').order('issued_at',{ascending:false}).limit(100),
  client.from('platform_fee_payments').select('id,invoice_id,amount_minor,status,confirmed_at').limit(100),
  client.from('commission_entries').select('id,shop_id,order_id,fee_minor,created_at').order('created_at',{ascending:false}).limit(100)
 ]);
 const names=new Map((shops.data||[]).map(s=>[s.id,s.name]));
 const paidMap=new Map<string,bigint>();
 for(const p of payments.data||[])if(p.status==='confirmed'&&p.confirmed_at)
   paidMap.set(p.invoice_id,(paidMap.get(p.invoice_id)||BigInt(0))+BigInt(p.amount_minor));
 return <main className="container page-pad">
  <div className="page-heading"><div className="eyebrow">ADMIN / PLATFORM FINANCE</div><h1>Finance <em>center.</em></h1>
   <p>ค่าธรรมเนียมที่เรียกเก็บจาก Seller ไม่ใช่ยอดขายรวมของศิลปิน</p></div>
  <Link href="/admin" className="text-link">← Admin Console</Link>
  <div className="info-panel">
   <Link className="btn btn-outline" href="/admin/finance/documents">เอกสารของแพลตฟอร์ม →</Link>{' '}
   <Link className="btn btn-outline" href="/admin/finance/shop-documents">เอกสารจากร้าน →</Link>{' '}
   <Link className="btn btn-outline" href="/admin/sales">ยอดขายทุกร้าน →</Link>
  </div>
  <div className="legal-alert">การกระทบยอดและการยืนยันการรับชำระเงินยังต้องอ้างอิงกระบวนการที่ได้รับอนุมัติ ระบบนี้เป็นหน้าตรวจข้อมูลจริง ไม่สร้างยอดหรือเปลี่ยนสถานะการชำระเงินเอง</div>
  {[invoices,payments,commissions].some(x=>x.error)&&<p role="alert">อ่านบางตารางไม่สำเร็จ โปรดตรวจ RLS และ Migration 002</p>}
  <div className="dashboard-metrics"><div className="metric"><span>ใบแจ้งหนี้ใน 100 รายการล่าสุด</span><strong>{invoices.data?.length??0}</strong></div>
   <div className="metric"><span>รายการค่าธรรมเนียมใน 100 รายการล่าสุด</span><strong>{commissions.data?.length??0}</strong></div></div>
  <h2>ใบแจ้งหนี้ผู้ขาย (100 รายการล่าสุด)</h2>
  <div className="phase4-table-scroll"><table className="dashboard-table">
   <thead><tr><th>เลขใบแจ้งหนี้</th><th>ร้าน</th><th>ช่วงเวลา</th><th>เรียกเก็บ</th><th>ยืนยันรับแล้ว</th><th>สถานะ</th></tr></thead>
   <tbody>{(invoices.data||[]).map(v=><tr key={v.id}><td>{v.invoice_number}</td>
    <td>{names.get(v.shop_id)||v.shop_id}</td><td>{v.period_from} – {v.period_to}</td>
    <td>{baht(v.total_minor)}</td><td>{baht(paidMap.get(v.id)||BigInt(0))}</td><td>{v.status}</td>
   </tr>)}</tbody>
  </table></div>
  {!invoices.error&&!invoices.data?.length&&<div className="empty-state">ยังไม่มีใบแจ้งหนี้จากรายการจริง</div>}
  <h2>รายการค่าธรรมเนียมที่ระบบบันทึกไว้</h2>
  <div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr><th>วันที่</th><th>ร้าน</th><th>ออเดอร์</th><th>ค่าธรรมเนียม</th></tr></thead>
   <tbody>{(commissions.data||[]).map(c=><tr key={c.id}><td>{dateThai(c.created_at)}</td>
    <td>{names.get(c.shop_id)||c.shop_id}</td><td><code>{c.order_id}</code></td><td>{baht(c.fee_minor)}</td></tr>)}</tbody></table></div>
 </main>;
}
