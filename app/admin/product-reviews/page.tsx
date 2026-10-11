import Link from 'next/link';
import {requirePlatformAdmin} from '@/lib/auth';
import {reviewProductPublication} from './actions';
export const dynamic='force-dynamic';
const notices:Record<string,string>={invalid:'ข้อมูลหรือการยืนยันไม่ถูกต้อง',failed:'ดำเนินการไม่สำเร็จ ร้านอาจยังไม่ active หรือเงื่อนไขสินค้าเปลี่ยนไป',reviewed:'บันทึกผลการตรวจสินค้าแล้ว'};
export default async function AdminProductReviews({searchParams}:{searchParams:Promise<{notice?:string}>}){
  const [{client},params]=await Promise.all([requirePlatformAdmin('/admin/product-reviews'),searchParams]);
  const {data,error}=await client.from('products')
    .select('id,name,description,currency,product_type,shop_id,submitted_at,shops!inner(name,slug,status)')
    .eq('status','under_review').order('submitted_at',{ascending:true}).limit(100);
  const notes=new Map<string,string[]>();const previews=new Map<string,string>();const deliveries=new Map<string,string[]>();const licenses=new Map<string,{usage_type:string;price_minor:number;terms:string}[]>();
  const unavailable=new Set<string>();
  await Promise.all((data||[]).map(async p=>{
    const {data:issues,error:blockerError}=await client.rpc('tidalis_product_publish_blockers',{p_product_id:p.id});
    if(blockerError||!Array.isArray(issues))unavailable.add(p.id);
    notes.set(p.id,Array.isArray(issues)?issues:[]);
    const {data:prices,error:priceError}=await client.from('product_license_prices').select('usage_type,price_minor,terms').eq('product_id',p.id);
    if(priceError||prices?.length!==2)unavailable.add(p.id);
    licenses.set(p.id,prices||[]);
    const {data:files}=await client.from('product_files').select('file_path')
       .eq('product_id',p.id).eq('is_delivery_file',false).limit(1);
    if(files?.[0]){const {data:url}=await client.storage.from('tidalis-product-files').createSignedUrl(files[0].file_path,300);
      if(url?.signedUrl)previews.set(p.id,url.signedUrl)}
    const {data:deliverables}=await client.from('product_files').select('file_path').eq('product_id',p.id).eq('is_delivery_file',true).limit(3);
    const urls:string[]=[];
    for(const file of deliverables||[]){const {data:link}=await client.storage.from('tidalis-product-files').createSignedUrl(file.file_path,300);if(link?.signedUrl)urls.push(link.signedUrl)}
    deliveries.set(p.id,urls);
  }));
  return <div className="container page-pad policy-manager-page"><div className="page-heading"><div className="eyebrow">ADMIN / PRODUCT PUBLICATION</div><h1>Review <em>artworks.</em></h1><p>ตรวจภาพ คำอธิบาย สินค้าจริง ราคา License และไฟล์ส่วนตัว ก่อนเผยแพร่</p></div><Link href="/admin" className="text-link">← Admin Console</Link>
    {params.notice&&notices[params.notice]&&<div className="phase4-alert" role="status">{notices[params.notice]}</div>}
    {error&&<div className="phase4-alert" role="alert">อ่านรายการรอตรวจไม่ได้: {error.code}</div>}
    <div className="policy-version-list">{(data||[]).map(p=>{const s=Array.isArray(p.shops)?p.shops[0]:p.shops;const missing=notes.get(p.id)||[];return <article className="phase4-card" key={p.id}>
      <h2>{p.name}</h2><p>ร้าน {s?.name} · {s?.status} · {p.product_type} {s?.slug&&<Link href={`/shops/${s.slug}#shop-policies`} className="text-link">นโยบายร้าน ↗</Link>}</p><p>{p.description}</p>
      <div className="phase5-note">{(licenses.get(p.id)||[]).map(l=><p key={l.usage_type}><strong>{l.usage_type}:</strong> {(l.price_minor/100).toFixed(2)} {p.currency} · {l.terms}</p>)}</div>
      {previews.get(p.id)?<p><a href={previews.get(p.id)} target="_blank" rel="noopener noreferrer">เปิดภาพตัวอย่างส่วนตัวเพื่อตรวจ ↗</a></p>:<p role="alert">ยังไม่สามารถตรวจภาพได้ — ห้ามอนุมัติ</p>}
      {p.product_type!=='commission'&&<p>ไฟล์ส่งมอบส่วนตัวที่ตรวจได้: {deliveries.get(p.id)?.length||0} ไฟล์ {deliveries.get(p.id)?.map((url,i)=><a key={i} href={url} className="text-link" target="_blank" rel="noopener noreferrer">ตรวจไฟล์ {i+1} ↗ </a>)}</p>}
      {missing.length>0&&<p className="phase5-note" role="alert">ข้อกำหนดไม่ครบ: {missing.join(', ')}</p>}
      {unavailable.has(p.id)&&<p className="phase5-note" role="alert">ตรวจข้อกำหนดหรือราคาไม่สำเร็จ กรุณาลองใหม่ก่อนอนุมัติ</p>}
      <p className="phase5-help">โปรดตรวจไฟล์ส่งมอบและเงื่อนไขทั้งสอง License ผ่านบัญชี Seller/ระบบตรวจภายในก่อนกดอนุมัติ ระบบยังไม่มี Anti-malware อัตโนมัติ</p>
      <form action={reviewProductPublication} className="phase4-action-form"><input type="hidden" name="id" value={p.id}/><label>ผลตรวจ<select name="decision" defaultValue="changes_requested"><option value="changes_requested">ขอแก้ไข</option><option value="rejected">ไม่อนุมัติ</option><option value="approved" disabled={unavailable.has(p.id)||missing.length>0||s?.status!=='active'||!previews.get(p.id)||(p.product_type!=='commission'&&!deliveries.get(p.id)?.length)}>อนุมัติและเผยแพร่</option></select></label><label>เหตุผล / หมายเหตุ<textarea name="note" maxLength={1500} rows={3}/></label><label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes"/>ตรวจงาน ภาพ ไฟล์ License และสิทธิ์การเผยแพร่ครบแล้ว (บังคับเมื่ออนุมัติ)</label><button type="submit" className="btn btn-primary">บันทึกผลตรวจ</button></form>
    </article>})}</div>{!error&&!data?.length&&<div className="empty-state">ไม่มีสินค้าอยู่ระหว่างรอตรวจ</div>}
  </div>;
}
