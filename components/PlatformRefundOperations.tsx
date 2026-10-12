import Link from 'next/link';
import type {SupabaseClient} from '@supabase/supabase-js';
import {platformRefundAction,reportPlatformRefund} from '@/app/refunds/actions';
import {formatMoney} from '@/lib/payment-utils';
import {supabaseService} from '@/lib/supabase/service';
import {pageWindow} from '@/lib/pagination';
import {PendingButton} from './PendingButton';
import PageNav from './PageNav';
export default async function PlatformRefundOperations({client,scope,attemptId,shopId,page,historyPage}:{client:SupabaseClient;scope:'admin'|'seller';attemptId?:string;shopId?:string;page?:string;historyPage?:string}){
 const window=pageWindow(page),history=pageWindow(historyPage);
 let q=client.from('platform_payment_refunds').select('*',{count:'exact'}).order('prepared_at',{ascending:false}).order('attempt_id').range(window.from,window.to);
 if(attemptId)q=q.eq('attempt_id',attemptId);if(shopId)q=q.eq('shop_id',shopId);
 const {data:records,error,count}=await q;
 if(error)return <p role="alert">โหลดรายการคืนเงินแพลตฟอร์มไม่ได้ กรุณาลองใหม่</p>;
 if(!records?.length&&scope==='admin'&&attemptId)return <form action={platformRefundAction} className="operations-form"><input type="hidden" name="attempt" value={attemptId}/><input type="hidden" name="scope" value="admin"/><input type="hidden" name="action" value="prepare"/><p>ตรวจยอดเงินเข้าจริงและบัญชีรับคืนกับผู้ขายก่อน ระบบจะเก็บข้อมูลผู้รับสำหรับรายการนี้</p><label className="operations-check"><input type="checkbox" name="confirmed" value="yes" required/> ฉันตรวจยอดเงินจริงและตกลงคืนเงินกับผู้ขายแล้ว</label><PendingButton disabled={!supabaseService()}>เตรียมข้อมูลคืนเงินให้ผู้ขาย</PendingButton></form>;
 if(!records?.length)return count?<PageNav path="/seller/finance" page={window.page} total={count} queryKey="refundPage" label="เงินคืนแพลตฟอร์ม"/>:null;
 let txQuery=client.from('platform_refund_transfers').select('*',{count:'exact'}).in('attempt_id',records.map(r=>r.attempt_id)).order('recorded_at',{ascending:false}).order('id');
 txQuery=attemptId?txQuery.range(history.from,history.to):txQuery.in('proof_private_path',records.flatMap(r=>r.proof_private_path?[r.proof_private_path]:[]));
 const {data:transfers,error:txError,count:txCount}=await txQuery;
 if(txError)return <p role="alert">โหลดประวัติการโอนไม่สำเร็จ กรุณาโหลดหน้าใหม่ก่อนดำเนินการ</p>;
 const urls=new Map<string,string>();
 await Promise.all((transfers||[]).map(async t=>{const {data}=await client.storage.from('tidalis-platform-refund-proofs').createSignedUrl(t.proof_private_path,60);if(data?.signedUrl)urls.set(t.id,data.signedUrl);}));
 return <section className="phase6-list"><h2>เงินคืนจากแพลตฟอร์ม</h2>{records.map(r=>{
  const recipient=r.recipient_snapshot as {name:string;bank:string;account:string};const entries=(transfers||[]).filter(t=>t.attempt_id===r.attempt_id);
  const detail=scope==='admin'?`/admin/finance/refunds/${r.attempt_id}`:`/seller/finance/refunds/${r.attempt_id}`;
  return <article className="commerce-card" key={r.attempt_id}>
   <h3>{formatMoney(r.amount_minor,r.currency)} · {({confirmed:'ยืนยันรับแล้ว',reported:'โอนแล้ว รอผู้ขายยืนยัน',disputed:'ผู้ขายแจ้งปัญหา รอกระทบยอด',prepared:'เตรียมคืนเงิน'} as Record<string,string>)[r.status]}</h3>
   <p>ผู้รับเงิน: {recipient.name} · {recipient.bank} · {recipient.account}</p>{r.resolution_note?<p>{r.resolution_note}</p>:null}
   <Link className="text-link" href={detail}>รายละเอียดและประวัติการโอน →</Link>
   {(attemptId?entries:entries.slice(0,1)).map(t=>{const target=t.recipient_snapshot as {name:string;bank:string;account:string};return <div className="info-panel" key={t.id}><p>{({reported:'รายงานว่าโอนแล้ว',disputed:'รอกระทบยอด',failed:'รายการเดิมยังไม่สำเร็จ',confirmed:'ยืนยันรับเงินจริงแล้ว'} as Record<string,string>)[t.status]} · {new Date(t.recorded_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</p><p>บัญชีในรอบนี้: {target.name} · {target.bank} · {target.account}</p>{urls.has(t.id)?<a href={urls.get(t.id)} target="_blank" rel="noreferrer" className="text-link">เปิดหลักฐานส่วนตัว ↗</a>:<p>ยังเปิดหลักฐานไม่ได้ กรุณาโหลดหน้าใหม่</p>}</div>;})}
   {scope==='admin'&&r.status==='prepared'?<>
    <form action={reportPlatformRefund} className="operations-form"><input type="hidden" name="attempt" value={r.attempt_id}/><p>โอนยอดนี้ไปยังบัญชีที่บันทึกไว้ก่อนแนบหลักฐาน</p><label>หลักฐานการคืนเงินจริง<input name="proof" type="file" required accept="image/png,image/jpeg,image/webp,application/pdf"/></label><label className="operations-check"><input type="checkbox" name="confirmed" value="yes" required/> ฉันตรวจว่าโอนเงินจริงครบยอดและตรงบัญชีนี้แล้ว</label><PendingButton disabled={!supabaseService()}>บันทึกการคืนเงิน</PendingButton></form>
    <details><summary>ตรวจบัญชีผู้รับใหม่ก่อนโอน</summary><form action={platformRefundAction} className="operations-form"><input name="attempt" type="hidden" value={r.attempt_id}/><input name="scope" type="hidden" value="admin"/><input name="action" type="hidden" value="refresh_recipient"/><p>ให้ผู้ขายแก้ข้อมูลรับเงินของร้านก่อน ระบบจะเก็บบัญชีล่าสุดไว้สำหรับรอบใหม่ โดยรักษาประวัติรอบก่อน</p><label>เหตุผลและผลยืนยันกับผู้ขาย<textarea name="note" required minLength={15} maxLength={1000}/></label><label className="operations-check"><input type="checkbox" name="confirmed" value="yes" required/> ฉันยืนยันบัญชีที่ใช้รับคืนกับผู้ขายแล้ว</label><PendingButton className="btn btn-outline">บันทึกบัญชีล่าสุดสำหรับรอบใหม่</PendingButton></form></details>
   </>:null}
   {scope==='seller'&&['reported','disputed'].includes(r.status)?<form action={platformRefundAction} className="operations-form"><input type="hidden" name="attempt" value={r.attempt_id}/><input type="hidden" name="scope" value="seller"/><input type="hidden" name="action" value="received"/><label className="operations-check"><input type="checkbox" name="confirmed" value="yes" required/> ฉันตรวจบัญชีและได้รับเงินจริงครบยอดแล้ว</label><PendingButton>ยืนยันรับเงินคืน</PendingButton></form>:null}
   {scope==='seller'&&r.status==='reported'?<form action={platformRefundAction} className="operations-form"><input name="attempt" type="hidden" value={r.attempt_id}/><input name="scope" type="hidden" value="seller"/><input name="action" type="hidden" value="dispute"/><input name="confirmed" type="hidden" value="yes"/><label>รายละเอียดที่ต้องตรวจสอบ<textarea name="note" required minLength={10} maxLength={1000}/></label><PendingButton className="btn btn-outline">ยังไม่ได้รับเงิน / แจ้งปัญหา</PendingButton></form>:null}
   {scope==='admin'&&r.status==='disputed'?<form action={platformRefundAction} className="operations-form"><input name="attempt" type="hidden" value={r.attempt_id}/><input name="scope" type="hidden" value="admin"/><label>ผลการติดต่อและกระทบยอด<textarea name="note" required minLength={15} maxLength={1000}/></label><label className="operations-check"><input name="confirmed" type="checkbox" value="yes" required/> ฉันติดต่อผู้ขายและตรวจรายการธนาคารแล้ว</label><div className="button-row"><button className="btn btn-primary" name="action" value="resolve_received">เงินถึงผู้ขายแล้ว</button><button className="btn btn-outline" name="action" value="resolve_retry">ยังไม่สำเร็จ เตรียมโอนใหม่</button></div></form>:null}
  </article>;
 })}
 {attemptId?<PageNav path={scope==='admin'?`/admin/finance/refunds/${attemptId}`:`/seller/finance/refunds/${attemptId}`} page={history.page} total={txCount||0} queryKey="historyPage" label="ประวัติการโอน"/>:<PageNav path="/seller/finance" page={window.page} total={count||0} queryKey="refundPage" label="เงินคืนแพลตฟอร์ม"/>}
 </section>;
}
