import PlatformRefundOperations from './PlatformRefundOperations';
import Link from 'next/link';
import type {SupabaseClient} from '@supabase/supabase-js';
import {reconcilePayment} from '@/app/refunds/actions';
import {formatMoney} from '@/lib/payment-utils';
import {pageWindow} from '@/lib/pagination';
import {PendingButton} from './PendingButton';
import PageNav from './PageNav';
import {phase6Notice} from '@/lib/phase6';
export default async function ReconciliationQueue({client,scope,shopId,notice,page}:{client:SupabaseClient;scope:'seller'|'admin';shopId?:string;notice?:string;page?:string}){
 const window=pageWindow(page);
 let query=client.from('payment_attempts').select('id,order_id,invoice_id,status,amount_minor,currency,review_note,proof_private_path',{count:'exact'}).in('status',scope==='admin'?['proof_submitted','needs_review']:['needs_review']).order('created_at').order('id').range(window.from,window.to);
 if(scope==='seller')query=query.eq('shop_id',shopId!);
 const {data,error,count}=await query;
 if(error)return <section className="section"><h2>รายการที่ต้องกระทบยอด</h2><p role="alert">โหลดรายการไม่สำเร็จ กรุณาลองใหม่ก่อนดำเนินการ</p></section>;
 const proofUrls=new Map<string,string>();
 await Promise.all((data||[]).map(async a=>{if(!a.proof_private_path)return;const {data:signed}=await client.storage.from('tidalis-payment-proofs').createSignedUrl(a.proof_private_path,60);if(signed?.signedUrl)proofUrls.set(a.id,signed.signedUrl);}));
 return <section className="section"><h2>รายการที่ต้องกระทบยอด</h2>
  {notice?<p role="status" className="form-message">{phase6Notice(notice)}</p>:null}
  {error?<p role="alert">โหลดรายการกระทบยอดไม่ได้ กรุณาลองใหม่</p>:null}
  {!error&&!data?.length?<div className="empty-state">ไม่มีรายการในหน้านี้</div>:null}
  <div className="phase6-list">{data?.map(a=><article className="commerce-card" key={a.id}>
   <h3>{formatMoney(a.amount_minor,a.currency)} · #{a.id.slice(0,8)}</h3><p>{a.review_note}</p>
   {proofUrls.has(a.id)?<a className="text-link" href={proofUrls.get(a.id)} target="_blank" rel="noreferrer">เปิดหลักฐานการรับเงินส่วนตัว ↗</a>:null}
   {a.order_id?<>
    <Link className="text-link" href={scope==='seller'?`/seller/orders/${a.order_id}`:`/admin/orders/${a.order_id}`}>ตรวจคำสั่งซื้อ →</Link>
    {a.status==='proof_submitted'&&scope==='admin'?<form action={reconcilePayment} className="operations-form">
     <input name="attempt" value={a.id} type="hidden"/><input name="scope" value="admin" type="hidden"/><input name="resolution" value="flag" type="hidden"/>
     <label>เหตุผลที่ต้องกระทบยอด<textarea name="note" required minLength={15} maxLength={1000}/></label>
     <label className="operations-check"><input name="confirmed" type="checkbox" value="yes" required/> ฉันตรวจข้อร้องเรียนและต้องติดต่อผู้รับเงินเพื่อตรวจยอด</label>
     <PendingButton>ส่งเข้ากระทบยอดโดยยังไม่ยืนยันรับเงิน</PendingButton>
    </form>:null}
    {a.status==='needs_review'?<form action={reconcilePayment} className="operations-form">
     <input name="attempt" value={a.id} type="hidden"/><input name="scope" value={scope} type="hidden"/>
     <label>การดำเนินการ<select name="resolution" defaultValue="" required><option value="" disabled>เลือกผลการกระทบยอด</option><option value="fulfil">ยืนยันรับเงินและตรวจส่งมอบ / เริ่มงาน</option><option value="refund">ยืนยันรับเงินเพื่อดำเนินการคืนเงิน</option></select></label>
     <label>ผลตรวจธนาคารและเหตุผล<textarea name="note" required minLength={15} maxLength={1000}/></label>
     <label className="operations-check"><input name="confirmed" type="checkbox" value="yes" required/> ฉันตรวจแล้วว่าเงินเข้าจริงครบยอดและเลือกขั้นตอนตามข้อตกลง</label>
     <PendingButton>บันทึกผลกระทบยอด</PendingButton>
    </form>:null}
   </>:a.status==='needs_review'?<PlatformRefundOperations client={client} scope="admin" attemptId={a.id}/>:<Link className="btn btn-outline" href="/admin/finance/payments">ตรวจรับค่าบริการตามปกติ →</Link>}
  </article>)}</div>
  {!error?<PageNav path={scope==='admin'?'/admin/reconciliation':'/seller/payments'} page={window.page} total={count||0} queryKey={scope==='admin'?'page':'reconciliationPage'}/>:null}
 </section>;
}
