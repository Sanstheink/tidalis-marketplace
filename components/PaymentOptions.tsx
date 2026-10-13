import Link from 'next/link';
import {Landmark,ArrowRight,ShieldCheck} from 'lucide-react';
import {startPayment} from '@/app/payments/actions';
import {paymentMethods,formatMoney,paymentStates} from '@/lib/payment-utils';
import {supabaseService} from '@/lib/supabase/service';
import type {SupabaseClient} from '@supabase/supabase-js';
export default async function PaymentOptions({client,orderId,invoiceId}:{client:SupabaseClient;orderId?:string;invoiceId?:string}){
 const [{data:context,error},{data:attempt,error:attemptError}]=await Promise.all([
 client.rpc('get_payment_context',{p_order_id:orderId||null,p_invoice_id:invoiceId||null}),
 client.from('payment_attempts').select('id,status').eq(orderId?'order_id':'invoice_id',orderId||invoiceId!).in('status',['pending','proof_submitted','confirmed','needs_review']).order('created_at',{ascending:false}).limit(1).maybeSingle()]);
 if(attemptError)throw Error('Payment attempt unavailable');
 if(attempt)return <section className="commerce-card payment-choices"><div className="eyebrow">PAYMENT</div><h2>{paymentStates[attempt.status]}</h2><p>ตรวจข้อมูลผู้รับเงินและติดตามผลได้ในรายการชำระนี้</p><Link className="btn btn-primary wide" href={`/payments/${attempt.id}`}>เปิดรายการชำระ <ArrowRight size={16}/></Link></section>;
 if(error||!context)return <section className="commerce-card"><h2>ยังไม่พร้อมชำระเงิน</h2><p>ตรวจสถานะคำสั่งซื้อและเวลาชำระ หากโอนไปแล้วให้เปิดประวัติชำระจากหน้าคำสั่งซื้อ</p></section>;
 const recipient=orderId?await client.from('order_receipt_recipients').select('name,address').eq('order_id',orderId).maybeSingle():{data:null,error:null};
 const prior=orderId?await client.from('payment_attempts').select('id').eq('order_id',orderId).limit(1).maybeSingle():{data:null,error:null};
 if(recipient.error||prior.error)throw Error('Receipt recipient unavailable');const collectRecipient=Boolean(orderId&&(recipient.data||!prior.data));
 const methods:string[]=(context.methods||[]).filter((m:string)=>Object.hasOwn(paymentMethods,m));const serviceReady=Boolean(supabaseService());
 return <section className="commerce-card payment-choices"><div className="eyebrow">PAYMENT TO {invoiceId?'TIDALIS':'THE SHOP'}</div><h2><Landmark size={20}/> เลือกวิธีชำระ</h2><p>ผู้รับเงิน: <strong>{context.recipientLabel}</strong></p><div className="commerce-total"><span>ยอดที่ต้องชำระ</span><strong>{formatMoney(context.amountMinor,context.currency)}</strong></div>
 {methods.length&&serviceReady?<form action={startPayment}><input type="hidden" name="orderId" value={orderId||''}/><input type="hidden" name="invoiceId" value={invoiceId||''}/>{collectRecipient?<fieldset className="receipt-recipient-fields"><legend>ข้อมูลผู้รับใบเสร็จ</legend><label>ชื่อผู้รับใบเสร็จ<input name="recipientName" autoComplete="name" required minLength={3} maxLength={160} defaultValue={recipient.data?.name||''} readOnly={Boolean(recipient.data)}/></label><label>ที่อยู่ผู้รับใบเสร็จ (ถ้ามี)<textarea name="recipientAddress" autoComplete="street-address" maxLength={1000} defaultValue={recipient.data?.address||''} readOnly={Boolean(recipient.data)}/></label><small>ข้อมูลจะบันทึกเมื่อเริ่มชำระเงิน หากต้องแก้ภายหลังให้ติดต่อร้าน</small></fieldset>:null}<div className="payment-method-grid">{methods.map(m=><button className="payment-method" name="method" value={m} key={m}><span>{paymentMethods[m]}</span><ArrowRight size={17}/></button>)}</div></form>:<div className="order-notice"><strong>ผู้รับเงินกำลังตั้งค่าช่องทางชำระ</strong><p>เมื่อพร้อมแล้ว ช่องทางที่รองรับ {context.currency} จะแสดงที่นี่</p></div>}
 <p className="payment-assurance"><ShieldCheck size={17}/> เงินเข้าบัญชีผู้รับโดยตรง ผู้รับเงินตรวจยอดจริงก่อนยืนยันและส่งมอบไฟล์</p></section>;
}
