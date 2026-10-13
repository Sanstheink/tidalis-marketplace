import Link from 'next/link';
import {orderHistory,type HistoryQuery} from '@/lib/order-history';
import PageNav from '@/components/PageNav';
import {requirePlatformAdmin} from '@/lib/auth';
import {formatMoney} from '@/lib/payment-utils';
import {orderLabels} from '@/lib/marketplace-cart-utils';
import {baht,dateThai,uuid} from '@/lib/admin-finance';
export const dynamic='force-dynamic';

export default async function AdminSales({searchParams}:{searchParams:Promise<HistoryQuery&{shop?:string}>}){
 const {client}=await requirePlatformAdmin('/admin/sales');const filters=await searchParams;
 const {data:shops}=await client.from('shops').select('id,name,slug').order('name').limit(500);
 const statuses=['pending','awaiting_quote','awaiting_acceptance','awaiting_payment','payment_review',
  'paid','fulfilling','delivery_review','fulfilled','cancelled','refund_pending','partially_refunded','refunded'];
 const shop=uuid.test(filters.shop||'')?filters.shop||'':null;
 const status=statuses.includes(filters.status||'')?filters.status||'':null;
 const {orders,total,window,filters:historyFilters}=await orderHistory(client,'admin',filters,shop||undefined);
 const paymentIds=(orders||[]).map(o=>o.id);
 const payment=paymentIds.length?await client.from('payment_transactions')
  .select('order_id,amount_minor,confirmed_at,status').in('order_id',paymentIds)
  .eq('status','confirmed'):null;
 const refunds=paymentIds.length?await client.from('refund_requests').select('order_id,amount_minor').in('order_id',paymentIds).eq('status','completed'):null;const returned=new Map<string,bigint>();for(const r of refunds?.data||[])returned.set(r.order_id,(returned.get(r.order_id)||0n)+BigInt(r.amount_minor));
 const confirmed=new Map<string,string>();
 for(const p of payment?.data||[])confirmed.set(p.order_id,String(p.amount_minor));
 const shopsById=new Map((shops||[]).map(s=>[s.id,s]));
 const moneyUnavailable=Boolean(payment?.error||refunds?.error);
 const totals=new Map<string,bigint>();for(const o of orders||[])totals.set(o.currency,(totals.get(o.currency)||0n)+BigInt(confirmed.get(o.id)||'0')-(returned.get(o.id)||0n));
 return <main className="container page-pad">
  <div className="page-heading"><div className="eyebrow">ADMIN / ALL SHOPS</div><h1>ประวัติ<em>ยอดขาย.</em></h1>
   <p>แสดงคำสั่งซื้อจริงพร้อมหลักฐานสถานะการชำระเงิน ไม่ใช้ข้อมูลสินค้าสาธิต</p></div>
  <Link href="/admin" className="text-link">← Admin Console</Link>
  <div className="legal-alert">ยอดยืนยันด้านล่างเป็นผลรวมเฉพาะแถวที่แสดง (25 รายการต่อหน้า) หักเฉพาะรายการคืนเงินที่ยืนยันสำเร็จแล้ว แยกตามสกุลเงิน</div>
  <form method="get" className="phase4-action-form">
   <label>ร้านค้า<select name="shop" defaultValue={shop||''}><option value="">ทุกร้าน</option>
    {(shops||[]).map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
   <label>ค้นหาคำสั่งซื้อ<input name="q" defaultValue={historyFilters.q} maxLength={80} placeholder="เลขรายการ ชื่อผลงาน หรือร้าน"/></label><label>ประเภท<select name="kind" defaultValue={historyFilters.kind}><option value="all">ทุกประเภท</option><option value="fixed">สินค้าราคาคงที่</option><option value="commission">Commission</option></select></label><label>สถานะ<select name="status" defaultValue={status||''}><option value="">ทุกสถานะ</option>
    {statuses.map(s=><option value={s} key={s}>{s}</option>)}</select></label>
   <button type="submit" className="btn btn-outline">ค้นหา</button>
  </form>
  <div className="dashboard-metrics"><div className="metric"><span>คำสั่งซื้อในหน้าปัจจุบัน</span><strong>{orders?.length??0}</strong></div>
   <div className="metric"><span>ยอดรับสุทธิหลังคืนเงินในหน้าปัจจุบัน</span><strong>{moneyUnavailable?'ยังโหลดข้อมูลไม่ครบ':[...totals].map(([currency,total])=><span className="currency-total" key={currency}>{formatMoney(total,currency)}</span>)}</strong></div></div>

  {refunds?.error&&<p role="alert">อ่านยอดคืนเงินไม่ได้ กรุณาลองใหม่</p>}
  {payment?.error&&<p role="alert">อ่านรายการ Payment ไม่ได้: {payment.error.code}</p>}
  <div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr>
   <th>วันที่</th><th>ร้าน</th><th>Order ID</th><th>สถานะ</th><th>ยอดคำสั่งซื้อ</th><th>รับเงินจริงที่ยืนยัน</th><th>คืนเงินสำเร็จ</th><th>สุทธิ</th>
  </tr></thead><tbody>{(orders||[]).map(o=><tr key={o.id}>
   <td>{dateThai(o.created_at)}</td><td>{shopsById.get(o.shop_id)?.name||o.shop_id}</td>
   <td><Link href={`/admin/orders/${o.id}`}>#{o.id.slice(0,8).toUpperCase()}</Link></td><td>{orderLabels[o.status]||o.status}</td><td>{formatMoney(o.total_minor,o.currency)}</td>
   <td>{payment?.error?'ยังโหลดไม่ได้':confirmed.has(o.id)?formatMoney(confirmed.get(o.id),o.currency):'ยังไม่พบธุรกรรมยืนยัน'}</td><td>{refunds?.error?'ยังโหลดไม่ได้':formatMoney(returned.get(o.id)||0n,o.currency)}</td><td>{moneyUnavailable?'ยังโหลดไม่ได้':formatMoney(BigInt(confirmed.get(o.id)||'0')-(returned.get(o.id)||0n),o.currency)}</td>
  </tr>)}</tbody></table></div>
  {!orders?.length&&<div className="empty-state">ไม่พบคำสั่งซื้อในเงื่อนไขนี้ </div>}
  <PageNav path="/admin/sales" page={window.page} total={total} params={{...historyFilters,shop:shop||undefined}}/>
 </main>;
}
