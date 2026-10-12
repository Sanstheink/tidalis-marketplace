import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowRight,Store,ShieldCheck,FileText} from 'lucide-react';
import {requireUser} from '@/lib/auth';
import {publicPrice} from '@/lib/public-catalog-shared';
import {orderState,orderLabels,uuidPattern,type CheckoutPolicy} from '@/lib/marketplace-cart-utils';
import OrderOperations from '@/components/OrderOperations';
import type {WorkOrder} from '@/lib/phase6';
import PaymentOptions from '@/components/PaymentOptions';
import {OrderReservation} from '@/components/OrderReservation';
export const dynamic='force-dynamic';
export default async function OrderDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string;messagePage?:string}>}){
  const {id}=await params;const {notice,messagePage}=await searchParams;
  const {client,user}=await requireUser(`/account/orders/${id}`);
  if(!uuidPattern.test(id))notFound();
  const {data:order,error}=await client.from('orders').select('id,shop_id,buyer_id,order_kind,accepted_quote_id,commission_due_at,currency,status,subtotal_minor,vat_minor,total_minor,buyer_note,created_at,reservation_expires_at,cancelled_at,shop_snapshot,policy_snapshot,idempotency_key').eq('id',id).eq('buyer_id',user.id).maybeSingle();
  if(error)throw Error('Order unavailable');if(!order)notFound();
  const {data:items,error:itemError}=await client.from('order_items').select('id,quantity,usage_type,price_minor,item_snapshot').eq('order_id',id);
  if(itemError)throw Error('Order items unavailable');
  const {data:lastPayment}=await client.from('payment_attempts').select('id,status').eq('order_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();const payment=lastPayment&&['pending','proof_submitted','confirmed','needs_review'].includes(lastPayment.status)?lastPayment:null;
  const shop=order.shop_snapshot as {name?:string;slug?:string}|null;const state=orderState(order.status,order.reservation_expires_at);
  const policies=Array.isArray(order.policy_snapshot)?order.policy_snapshot as CheckoutPolicy[]:[];
  const withUrls=await Promise.all(policies.map(async p=>{
    if(p.source_type!=='pdf'||!p.document_path)return p;
    const {data,error}=await client.storage.from('tidalis-policy-documents').createSignedUrl(p.document_path,300);
    return {...p,document_url:error?null:data?.signedUrl};
  }));
  const names:Record<string,string>={refund:'การยกเลิกและคืนเงิน',delivery:'การส่งมอบงาน',license:'สิทธิ์การใช้งาน',terms:'ข้อกำหนดการใช้บริการ',privacy:'ความเป็นส่วนตัว','seller-agreement':'ข้อตกลงผู้ขาย','payment-refund':'การชำระเงินและคืนเงิน',copyright:'ลิขสิทธิ์'};
  return <div className="container page-pad commerce-page"><Link className="back-link" href="/account/orders"><ArrowLeft size={15}/> คำสั่งซื้อทั้งหมด</Link><div className="commerce-heading"><div><div className="eyebrow">ORDER #{id.slice(0,8).toUpperCase()}</div><h1>รายละเอียด<em>คำสั่งซื้อ.</em></h1><p>{new Date(order.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</p></div><span className={`order-status ${state}`}>{orderLabels[state]||state}</span></div>
    <div className="commerce-layout"><div className="commerce-main"><section className="commerce-card"><div className="shop-cart-heading"><div><Store size={19}/><strong>{shop?.name||'ร้านศิลปิน'}</strong></div>{shop?.slug?<Link href={`/shops/${shop.slug}`}>ดูร้าน <ArrowRight size={14}/></Link>:null}</div>
      {items?.map(item=>{const snapshot=item.item_snapshot as {name?:string;license_terms?:string};return <div className="order-product-row" key={item.id}><span className="order-artwork" aria-hidden="true">✦</span><div><strong>{snapshot?.name||'ผลงาน'}</strong><p>{item.usage_type==='personal'?'Personal Use':'Commercial Use'} · {item.quantity} สิทธิ์</p><small>{snapshot?.license_terms}</small><small>{publicPrice(item.price_minor,order.currency)} / สิทธิ์</small></div><strong>{publicPrice(item.price_minor*item.quantity,order.currency)}</strong></div>})}
      <div className="order-totals"><div className="amount-row"><span>ยอดสินค้า</span><strong>{publicPrice(order.subtotal_minor,order.currency)}</strong></div>{order.vat_minor>0?<div className="amount-row"><span>ภาษีตามคำสั่งซื้อ</span><strong>{publicPrice(order.vat_minor,order.currency)}</strong></div>:null}<div className="commerce-total"><span>ยอดรวม</span><strong>{publicPrice(order.total_minor,order.currency)}</strong></div></div></section>
      <section className="commerce-card"><h2><FileText size={18}/> ข้อความถึงศิลปิน</h2><p className="order-note">{order.buyer_note||'ไม่ได้ระบุหมายเหตุ'}</p></section>
      {withUrls.length?<section className="commerce-card checkout-policies"><h2><ShieldCheck size={19}/> เงื่อนไขที่ยอมรับ</h2><p>ฉบับที่บันทึกตอนสั่งซื้อ</p>{withUrls.map(p=><details key={p.id}><summary>{names[p.policy_type]||p.policy_type}<span>{p.scope==='shop'?'ร้านผู้ขาย':'Tidalis'} · ฉบับ {p.version}</span></summary>{p.source_type==='pdf'?(p.document_url?<a href={p.document_url} target="_blank" rel="noreferrer">อ่าน {p.document_name||'เอกสาร'} ↗</a>:<p>เปิดเอกสารไม่ได้ กรุณาลองใหม่</p>):<p>{p.content}</p>}</details>)}</section>:null}
    <OrderOperations client={client} order={order as WorkOrder} scope="buyer" userId={user.id} notice={notice} messagePage={messagePage}/></div><aside>{order.status==='pending'&&order.idempotency_key&&order.reservation_expires_at?<OrderReservation id={id} expiresAt={order.reservation_expires_at} canCancel={!payment}/>:<section className="commerce-card"><h2>{orderLabels[state]||state}</h2><p>{state==='cancelled'?'คำสั่งซื้อนี้ถูกยกเลิกแล้ว หากโอนไปแล้วให้แนบหลักฐานในรายการชำระเพื่อให้ร้านกระทบยอด':'ติดตามสถานะได้จากหน้าคำสั่งซื้อของคุณ'}</p><Link className="btn btn-outline wide" href="/shop">สำรวจผลงานต่อ <ArrowRight size={16}/></Link></section>}{((['pending','awaiting_payment','payment_review'].includes(order.status)&&state!=='expired')||Boolean(payment))?<PaymentOptions client={client} orderId={id}/>:null}{lastPayment?<Link className="btn btn-outline wide" href={`/payments/${lastPayment.id}`}>ดูประวัติชำระ / หลักฐานการโอน →</Link>:null}{['fulfilled','partially_refunded'].includes(order.status)?<Link className="btn btn-primary wide" href="/account/library">เปิดคลังดาวน์โหลด →</Link>:null}</aside></div>
  </div>;
}
