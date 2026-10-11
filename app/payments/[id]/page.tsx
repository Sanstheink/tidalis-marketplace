import Link from 'next/link';
import {notFound} from 'next/navigation';
import QRCode from 'qrcode';
import PaymentStatusRefresh from '@/components/PaymentStatusRefresh';
import {PendingButton} from '@/components/PendingButton';
import {requireUser,requireMfa} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {formatMoney,paymentMethods,paymentStates,paymentError,type PaymentAttempt} from '@/lib/payment-utils';
import {promptPayPayload} from '@/lib/promptpay';
import {cancelPayment,uploadPaymentProof} from '../actions';
export const dynamic='force-dynamic';
export default async function PaymentPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string}>}){
 const {id}=await params;if(!uuidPattern.test(id))notFound();const {client,user}=await requireUser(`/payments/${id}`);
 const {data,error}=await client.from('payment_attempts').select('*').eq('id',id).eq('payer_id',user.id).maybeSingle();if(error)throw Error('Payment unavailable');if(!data)notFound();
 const a=data as PaymentAttempt;if(a.invoice_id)await requireMfa(client,`/payments/${id}`);const query=await searchParams;
 const expired=a.status==='pending'&&Date.parse(a.expires_at)<=Date.now(),r=a.recipient_snapshot;
 let qr:string|null=null;if(a.method==='promptpay'&&r.promptpay)qr=await QRCode.toDataURL(promptPayPayload(r.promptpay,a.amount_minor),{width:300,margin:2,errorCorrectionLevel:'M'});
 if(a.method==='qr_code'&&r.qrPath){const {data}=await client.storage.from('tidalis-payment-qr').createSignedUrl(r.qrPath,300);qr=data?.signedUrl||null;}
 let proof:string|null=null;if(a.proof_private_path){const {data}=await client.storage.from('tidalis-payment-proofs').createSignedUrl(a.proof_private_path,300);proof=data?.signedUrl||null;}
 const back=a.order_id?`/account/orders/${a.order_id}`:`/seller/finance/${a.invoice_id}`;
 return <div className="container page-pad commerce-page"><Link className="back-link" href={back}>← กลับไปรายการ</Link><div className="commerce-heading"><div><div className="eyebrow">SECURE PAYMENT</div><h1>ชำระเงิน<em>อย่างมั่นใจ.</em></h1><p>รายการ {id.slice(0,8)} · {paymentMethods[a.method]}</p></div><span className={`status-chip state-${expired?'expired':a.status}`}>{expired?'หมดเวลาชำระ':paymentStates[a.status]}</span></div>
 {query.notice?<p className="form-message" role="status">{query.notice==='proof_received'?'ส่งหลักฐานแล้ว ผู้รับเงินจะตรวจยอดก่อนยืนยัน':paymentError(query.notice)}</p>:null}
 <div className="commerce-layout"><section className="commerce-card recipient-card"><div className="eyebrow">{a.invoice_id?'PLATFORM RECIPIENT':'SHOP RECIPIENT'}</div><h2>{r.label}</h2><p className="recipient-name">{r.name}</p><div className="payment-amount">{formatMoney(a.amount_minor,a.currency)}</div>
 {qr&&!expired?<div className="payment-qr"><img src={qr} alt={`QR รับเงินของ ${r.name}`} width={280} height={280}/><p>ตรวจชื่อผู้รับและยอด {formatMoney(a.amount_minor,a.currency)} ในแอปก่อนยืนยัน</p></div>:null}
 <dl className="receipt-details">{r.bank?<><dt>ธนาคาร</dt><dd>{r.bank}</dd></>:null}{r.account?<><dt>เลขบัญชี</dt><dd className="recipient-number">{r.account}</dd></>:null}{r.promptpay?<><dt>เลขพร้อมเพย์</dt><dd className="recipient-number">{r.promptpay}</dd></>:null}</dl>
 {expired?<p className="form-error" role="alert">รายการนี้หมดเวลาแล้ว กรุณากลับไปสร้างคำสั่งซื้อใหม่ก่อนโอนเงิน</p>:null}
 <p className="payment-assurance">ข้อมูลผู้รับเงินนี้บันทึกไว้ตั้งแต่เริ่มรายการ หากข้อมูลไม่ตรง กรุณาติดต่อผู้รับเงินก่อนชำระ</p></section>
 <aside className="commerce-card"><h2>{a.status==='confirmed'?'ชำระเรียบร้อย':a.status==='proof_submitted'?'รอผู้รับเงินตรวจสอบ':expired?'หมดเวลารายการ':'ดำเนินการชำระ'}</h2>
 {a.review_note?<p className="form-message">{a.review_note}</p>:null}
 {a.status==='pending'&&!expired?<form action={uploadPaymentProof} className="operations-form"><input type="hidden" name="attemptId" value={id}/><p>โอนเงินตามยอดและผู้รับข้างต้น แล้วแนบหลักฐานหนึ่งรายการ</p><label>หลักฐานการโอน<input type="file" name="proof" accept="image/png,image/jpeg,image/webp,application/pdf" required/></label><small>PNG, JPG, WEBP หรือ PDF ไม่เกิน 3 MB</small><PendingButton className="btn btn-primary wide">ส่งหลักฐานให้ตรวจสอบ</PendingButton></form>:a.status==='confirmed'?<><p>ยืนยันรับเงินแล้ว {a.confirmed_at?new Date(a.confirmed_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):''}</p><Link className="btn btn-primary wide" href={a.order_id?'/account/library':'/seller/finance'}>{a.order_id?'เปิดคลังไฟล์ของฉัน':'กลับไปดูใบแจ้งหนี้'}</Link></>:<p>{a.status==='proof_submitted'?'ผู้รับเงินจะตรวจยอดที่เข้าบัญชีจริงก่อนส่งมอบไฟล์':a.status==='needs_review'?'กรุณาติดต่อผู้รับเงินเพื่อตรวจสอบหรือคืนเงิน': 'กลับไปรายการเพื่อเริ่มใหม่เมื่อยังมีเวลาจอง'}</p>}
 {a.status==='rejected'?<Link className="btn btn-primary wide" href={back}>เริ่มส่งหลักฐานใหม่</Link>:null}
 {a.status==='proof_submitted'||a.status==='pending'?<PaymentStatusRefresh/>:null}
 {proof?<a className="btn btn-outline wide" href={proof} target="_blank" rel="noreferrer">ดูหลักฐานที่ส่ง ↗</a>:null}
 {a.status==='pending'?<form action={cancelPayment}><input type="hidden" name="attemptId" value={id}/><button className="btn btn-outline wide">ยกเลิกรายการชำระและเปลี่ยนวิธี</button></form>:null}
 <p className="payment-assurance">กำหนดชำระ: {new Date(a.expires_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</p></aside></div></div>;
}
