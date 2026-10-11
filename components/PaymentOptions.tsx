import Link from 'next/link';
import {Landmark,ArrowRight,ShieldCheck} from 'lucide-react';
import {startPayment} from '@/app/payments/actions';
import {paymentMethods,formatMoney,paymentStates} from '@/lib/payment-utils';
import {supabaseService} from '@/lib/supabase/service';
import type {SupabaseClient} from '@supabase/supabase-js';
export default async function PaymentOptions({client,orderId,invoiceId}:{client:SupabaseClient;orderId?:string;invoiceId?:string}){
 const [{data:context,error},{data:attempt}]=await Promise.all([
 client.rpc('get_payment_context',{p_order_id:orderId||null,p_invoice_id:invoiceId||null}),
 client.from('payment_attempts').select('id,status').eq(orderId?'order_id':'invoice_id',orderId||invoiceId!).in('status',['pending','proof_submitted','confirmed','needs_review']).order('created_at',{ascending:false}).limit(1).maybeSingle()]);
 if(attempt)return <section className="commerce-card payment-choices"><div className="eyebrow">PAYMENT</div><h2>{paymentStates[attempt.status]}</h2><p>ตรวจข้อมูลผู้รับเงินและติดตามผลได้ในรายการชำระนี้</p><Link className="btn btn-primary wide" href={`/payments/${attempt.id}`}>เปิดรายการชำระ <ArrowRight size={16}/></Link></section>;
 if(error||!context)return null;
 const methods:string[]=(context.methods||[]).filter((m:string)=>Object.hasOwn(paymentMethods,m));const serviceReady=Boolean(supabaseService());
 return <section className="commerce-card payment-choices"><div className="eyebrow">PAYMENT TO {invoiceId?'TIDALIS':'THE SHOP'}</div><h2><Landmark size={20}/> เลือกวิธีชำระ</h2><p>ผู้รับเงิน: <strong>{context.recipientLabel}</strong></p><div className="commerce-total"><span>ยอดที่ต้องชำระ</span><strong>{formatMoney(context.amountMinor,context.currency)}</strong></div>
 {methods.length&&serviceReady?<form action={startPayment}><input type="hidden" name="orderId" value={orderId||''}/><input type="hidden" name="invoiceId" value={invoiceId||''}/><div className="payment-method-grid">{methods.map(m=><button className="payment-method" name="method" value={m} key={m}><span>{paymentMethods[m]}</span><ArrowRight size={17}/></button>)}</div></form>:<div className="order-notice"><strong>ผู้รับเงินกำลังตั้งค่าช่องทางชำระ</strong><p>เมื่อพร้อมแล้ว ช่องทางที่รองรับ {context.currency} จะแสดงที่นี่</p></div>}
 <p className="payment-assurance"><ShieldCheck size={17}/> เงินเข้าบัญชีผู้รับโดยตรง ผู้รับเงินตรวจยอดจริงก่อนยืนยันและส่งมอบไฟล์</p></section>;
}
