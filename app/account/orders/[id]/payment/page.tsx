import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {ownedDocumentOrder} from '@/lib/order-documents';
import PaymentOptions from '@/components/PaymentOptions';
import {paymentError} from '@/lib/payment-utils';
export const dynamic='force-dynamic';
export default async function OrderPayment({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string}>}){
 const {id}=await params;if(!uuidPattern.test(id))notFound();const {client,user}=await requireUser(`/account/orders/${id}/payment`);const order=await ownedDocumentOrder(client,id,{buyerId:user.id});const {notice}=await searchParams;
 return <main className="container page-pad order-payment-page"><Link className="back-link" href={`/account/orders/${id}`}>← กลับคำสั่งซื้อ</Link><div className="commerce-heading"><div><div className="eyebrow">PAYMENT / {id.slice(0,8).toUpperCase()}</div><h1>ชำระเงิน<em>ให้ร้านค้า.</em></h1><p>{order.shop_snapshot?.name||'ร้านศิลปิน'} · ตรวจข้อมูลก่อนเลือกวิธีชำระ</p></div></div>{notice?<p className="form-error" role="alert">{paymentError(notice)}</p>:null}<PaymentOptions client={client} orderId={id}/><div className="payment-help"><h2>หลังชำระเงิน</h2><p>แนบหลักฐานในรายการชำระ รอร้านตรวจยอดเงินจริง แล้วดาวน์โหลดใบเสร็จจากหน้าคำสั่งซื้อได้ทันที สำหรับสินค้าสำเร็จรูปและ Assets จะมีไฟล์งานและใบ Licence พร้อมกัน</p></div></main>;
}
