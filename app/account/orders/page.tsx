import Link from 'next/link';
import {ArrowLeft,ArrowRight,Package,ShoppingBag,Store} from 'lucide-react';
import {requireUser} from '@/lib/auth';
import {orderLabels,orderState} from '@/lib/marketplace-cart-utils';
import {publicPrice} from '@/lib/public-catalog-shared';
export const dynamic='force-dynamic';
export default async function Orders(){
  const {client,user}=await requireUser('/account/orders');
  const {data,error}=await client.from('orders').select('id,status,total_minor,created_at,reservation_expires_at,shop_snapshot,order_items(quantity,item_snapshot)').eq('buyer_id',user.id).order('created_at',{ascending:false}).limit(40);
  if(error)throw Error('Orders unavailable');
  return <div className="container page-pad commerce-page"><Link className="back-link" href="/account"><ArrowLeft size={15}/> บัญชีของฉัน</Link><div className="commerce-heading"><div><div className="eyebrow">YOUR CREATIVE JOURNEY</div><h1>คำสั่งซื้อ<em>ของคุณ.</em></h1><p>ติดตามผลงานที่คุณเลือกจากแต่ละร้านศิลปิน</p></div><Link href="/shop" className="btn btn-outline">ค้นพบงานใหม่ <ArrowRight size={16}/></Link></div>
    {!data?.length?<div className="commerce-empty"><div className="empty-orbit"><Package size={37}/></div><h2>ยังไม่มีคำสั่งซื้อ</h2><p>เลือกผลงานที่ใช่ แล้วตรวจสอบรายการจากตะกร้าของคุณ</p><Link className="btn btn-primary" href="/shop">สำรวจผลงาน <ArrowRight size={16}/></Link></div>:<div className="order-list">{data.map(order=>{
      const state=orderState(order.status,order.reservation_expires_at);const shop=order.shop_snapshot as {name?:string}|null;
      return <Link className="commerce-card order-card" href={`/account/orders/${order.id}`} key={order.id}><div className="order-card-top"><span><Store size={16}/> {shop?.name||'ร้านศิลปิน'}</span><span className={`order-status ${state}`}>{orderLabels[state]||state}</span></div><div className="order-card-middle"><div className="order-card-art"><ShoppingBag size={23}/></div><div><h2>{order.order_items.map(i=>(i.item_snapshot as {name?:string})?.name||'ผลงาน').slice(0,2).join(' · ')}</h2><p>{order.order_items.reduce((s,i)=>s+i.quantity,0)} สิทธิ์ · #{order.id.slice(0,8).toUpperCase()}</p></div><strong>{publicPrice(order.total_minor)}</strong></div><div className="order-card-bottom"><span>{new Date(order.created_at).toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok'})}</span><span>ดูรายละเอียด <ArrowRight size={15}/></span></div></Link>;
    })}</div>}
  </div>;
}
