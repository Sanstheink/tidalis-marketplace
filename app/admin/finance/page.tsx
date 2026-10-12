import Link from 'next/link';
import PageNav from '@/components/PageNav';
import {pageWindow} from '@/lib/pagination';
import {requirePlatformAdmin} from '@/lib/auth';
import {PendingButton} from '@/components/PendingButton';
import {issueFeeInvoice} from '@/app/admin/settings/payments/actions';
import {formatMoney} from '@/lib/payment-utils';
import {baht,dateThai} from '@/lib/admin-finance';
export const dynamic='force-dynamic';

export default async function AdminFinance({searchParams}:{searchParams:Promise<{notice?:string;page?:string;feePage?:string}>}){
 const {client}=await requirePlatformAdmin('/admin/finance');const params=await searchParams;const notice=params.notice;const window=pageWindow(params.page);const feePage=pageWindow(params.feePage);
 const [shops,invoices,commissions]=await Promise.all([
  client.from('shops').select('id,name').order('name').limit(500),
  client.from('seller_invoices').select('id,shop_id,invoice_number,total_minor,gross_minor,credited_minor,currency,status,issued_at,period_from,period_to',{count:'exact'}).order('issued_at',{ascending:false}).order('id',{ascending:false}).range(window.from,window.to),
  client.from('commission_entries').select('id,shop_id,order_id,fee_minor,currency,created_at',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(feePage.from,feePage.to)
 ]);
 const invoiceIds=(invoices.data||[]).map(i=>i.id);
 const payments=invoiceIds.length?await client.from('platform_fee_payments').select('id,invoice_id,amount_minor,status,confirmed_at').in('invoice_id',invoiceIds).eq('status','confirmed'):{data:[],error:null};
 const names=new Map((shops.data||[]).map(s=>[s.id,s.name]));
 const paidMap=new Map<string,bigint>();
 for(const p of payments.data||[])if(p.status==='confirmed'&&p.confirmed_at)
   paidMap.set(p.invoice_id,(paidMap.get(p.invoice_id)||BigInt(0))+BigInt(p.amount_minor));
 return <main className="container page-pad">
  <div className="page-heading"><div className="eyebrow">ADMIN / PLATFORM FINANCE</div><h1>ศูนย์การเงิน<em>แพลตฟอร์ม.</em></h1>
   <p>ค่าธรรมเนียมที่เรียกเก็บจาก Seller ไม่ใช่ยอดขายรวมของศิลปิน</p></div>
  {notice?<p className="form-message" role="status">{notice==='invoice_issued'?'ออกใบแจ้งหนี้แล้ว':notice==='no_unbilled_fees'?'ไม่มีค่าธรรมเนียมที่ยังไม่ออกบิลในช่วงนี้':'กรุณาตรวจร้าน สกุลเงิน และรอบบิลอีกครั้ง'}</p>:null}
  <Link href="/admin" className="text-link">← Admin Console</Link>
  <div className="info-panel">
   <Link className="btn btn-outline" href="/admin/settings/payments">ตั้งค่ารับเงิน →</Link>{' '}<Link className="btn btn-outline" href="/admin/finance/payments">ตรวจรับค่าบริการ →</Link>{' '}<Link className="btn btn-outline" href="/admin/finance/documents">เอกสารของแพลตฟอร์ม →</Link>{' '}
   <Link className="btn btn-outline" href="/admin/finance/shop-documents">เอกสารจากร้าน →</Link>{' '}
   <Link className="btn btn-outline" href="/admin/sales">ยอดขายทุกร้าน →</Link>
  </div>
  <div className="legal-alert">การกระทบยอดและการยืนยันการรับชำระเงินยังต้องอ้างอิงกระบวนการที่ได้รับอนุมัติ ระบบนี้เป็นหน้าตรวจข้อมูลจริง ไม่สร้างยอดหรือเปลี่ยนสถานะการชำระเงินเอง</div>
  {[invoices,payments,commissions].some(x=>x.error)&&<p role="alert">โหลดข้อมูลการเงินไม่ครบ กรุณาลองใหม่</p>}
  <div className="dashboard-metrics"><div className="metric"><span>ใบแจ้งหนี้ในหน้านี้</span><strong>{invoices.data?.length??0}</strong></div>
   <div className="metric"><span>รายการค่าธรรมเนียมในหน้านี้</span><strong>{commissions.data?.length??0}</strong></div></div>
  <section className="commerce-card"><h2>ออกใบแจ้งหนี้จากค่าธรรมเนียมที่บันทึกไว้</h2><form action={issueFeeInvoice} className="operations-form"><div className="form-columns"><label>ร้านผู้ขาย<select name="shopId" required><option value="">เลือกร้าน</option>{(shops.data||[]).map(shop=><option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label><label>สกุลเงิน<select name="currency"><option>THB</option><option>LAK</option><option>USD</option></select></label></div><div className="form-columns"><label>เริ่มรอบบิล<input type="date" name="from" required/></label><label>สิ้นสุดรอบบิล<input type="date" name="to" required/></label><label>ครบกำหนดชำระ<input type="date" name="due" required/></label></div><label className="operations-check"><input type="checkbox" name="confirmed" value="yes" required/> ตรวจรอบบิลแล้ว เรียกเก็บเฉพาะรายการที่ยืนยันและยังไม่เคยออกบิล</label><PendingButton>ออกใบแจ้งหนี้</PendingButton></form></section>
  <h2>ใบแจ้งหนี้ผู้ขาย</h2>
  <div className="phase4-table-scroll"><table className="dashboard-table">
   <thead><tr><th>เลขใบแจ้งหนี้</th><th>ร้าน</th><th>ช่วงเวลา</th><th>ก่อนหักเครดิต</th><th>เครดิต</th><th>เรียกเก็บสุทธิ</th><th>ยืนยันรับแล้ว</th><th>สถานะ</th></tr></thead>
   <tbody>{(invoices.data||[]).map(v=><tr key={v.id}><td>{v.invoice_number}</td>
    <td>{names.get(v.shop_id)||v.shop_id}</td><td>{v.period_from} – {v.period_to}</td>
    <td>{formatMoney(v.gross_minor??v.total_minor,v.currency)}</td><td>{formatMoney(v.credited_minor||0,v.currency)}</td><td>{formatMoney(v.total_minor,v.currency)}</td><td>{payments.error?'ยังโหลดไม่ได้':formatMoney(paidMap.get(v.id)||BigInt(0),v.currency)}</td><td>{v.status}</td>
   </tr>)}</tbody>
  </table></div>
  {!invoices.error&&!invoices.data?.length&&<div className="empty-state">ยังไม่มีใบแจ้งหนี้จากรายการจริง</div>}
  <PageNav path="/admin/finance" page={window.page} total={invoices.count||0} params={{feePage:params.feePage}}/>
  <h2>รายการค่าธรรมเนียมที่ระบบบันทึกไว้</h2>
  <div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr><th>วันที่</th><th>ร้าน</th><th>ออเดอร์</th><th>ค่าธรรมเนียม</th></tr></thead>
   <tbody>{(commissions.data||[]).map(c=><tr key={c.id}><td>{dateThai(c.created_at)}</td>
    <td>{names.get(c.shop_id)||c.shop_id}</td><td><code>{c.order_id}</code></td><td>{formatMoney(c.fee_minor,c.currency)}</td></tr>)}</tbody></table></div>
  <PageNav path="/admin/finance" page={feePage.page} total={commissions.count||0} queryKey="feePage" params={{page:params.page}} label="รายการค่าธรรมเนียม"/>
 </main>;
}
