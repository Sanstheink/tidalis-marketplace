import Link from 'next/link';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import RightsOfferForm,{type RightsPolicy} from './RightsOfferForm';
import {requestAssignment} from '@/app/rights/actions';
import {rightsKinds,rightsStates,rightsNotice,type RightsDocument} from '@/lib/artwork-rights';
export default async function OrderRights({client,order,scope,canIssue=false,shopName='',notice}:{client:SupabaseClient;order:{id:string;status:string};scope:'buyer'|'seller';canIssue?:boolean;shopName?:string;notice?:string}){
 const [docs,items,policies]=await Promise.all([
 client.from('artwork_rights_documents').select('*').eq('order_id',order.id).order('offered_at',{ascending:false}),
 client.from('order_items').select('id,item_snapshot').eq('order_id',order.id),
 client.from('platform_policy_versions').select('id,policy_type,title,version,content').in('policy_type',['standard-license','standard-assignment']).eq('status','published').not('approved_by','is',null).lte('effective_from',new Date().toISOString())]);
 if(docs.error||items.error||policies.error)throw Error('Artwork agreements unavailable');
 const eligible=['fulfilled','partially_refunded'].includes(order.status);const message=rightsNotice(notice);
 return <section className="commerce-card rights-panel"><div className="eyebrow">ARTWORK RIGHTS</div><h2>เอกสารสิทธิ์ในผลงาน</h2>{message?<p role="status" className="form-message">{message}</p>:null}
 <p>ร้านเป็นผู้จัดทำเอกสารตามข้อตกลง ผู้ซื้ออ่านและลงนามก่อนดาวน์โหลดต้นฉบับอิเล็กทรอนิกส์</p>
 {(docs.data as RightsDocument[]).map(d=><article className="rights-row" key={d.id}><div><strong>{rightsKinds[d.kind]} · ฉบับ {d.version}</strong><p>{d.snapshot.title} · {rightsStates[d.status]}{d.status==='offered'&&new Date(d.expires_at).getTime()<Date.now()?' (หมดเวลาแล้ว)':''}</p></div><Link className="btn btn-outline" href={`/rights/${d.id}`}>{d.status==='offered'&&scope==='buyer'?'อ่านและลงนาม':'เปิดเอกสาร'}</Link></article>)}
 {scope==='buyer'&&!['cancelled','refunded'].includes(order.status)?<details className="rights-terms"><summary>แจ้งความประสงค์ขอโอนสิทธิ์ขาด</summary><form action={requestAssignment} className="operations-form"><input type="hidden" name="order" value={order.id}/><label>รายละเอียดที่ต้องการแจ้งร้าน<textarea name="note" minLength={10} maxLength={1500} required rows={3}/></label><p>ข้อความจะส่งเข้าแชทคำสั่งซื้อนี้ การส่งคำขอยังไม่ถือว่าโอนสิทธิ์</p><button className="btn btn-outline">แจ้งร้านค้า</button></form></details>:null}
 {scope==='seller'&&canIssue?(eligible?<details className="rights-terms"><summary>จัดทำเอกสารสิทธิ์ฉบับใหม่</summary><RightsOfferForm order={order.id} shopName={shopName} requestKey={randomUUID()} policies={policies.data as RightsPolicy[]} items={(items.data||[]).map(i=>({id:i.id,name:i.item_snapshot?.name||'ผลงาน',terms:i.item_snapshot?.license_terms||''}))}/></details>:<p>จัดทำเอกสารได้เมื่อชำระเงินและผู้ซื้อได้รับงานแล้ว</p>):null}
 </section>;
}
