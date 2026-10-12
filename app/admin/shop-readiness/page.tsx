import Link from 'next/link';
import {requirePlatformAdmin} from '@/lib/auth';
import {reviewShopReadiness,adminPauseShopVisibility} from './actions';
export const dynamic='force-dynamic';
const notices:Record<string,string>={invalid:'ตรวจการเลือกผลหรือเหตุผลและการยืนยัน',failed:'การตรวจคำขอไม่สำเร็จ อาจมีเงื่อนไขไม่ครบหรือสิทธิ์ MFA ไม่ถูกต้อง',reviewed:'บันทึกผลการตรวจคำขอแล้ว',paused:'ระงับร้านจากหน้าสาธารณะแล้ว',released:'ปลดการระงับแล้ว ร้านกลับสู่ขั้นตอนเตรียมความพร้อม'};
export default async function AdminShopReadiness({searchParams}:{searchParams:Promise<{notice?:string}>}){
  const [{client},params]=await Promise.all([requirePlatformAdmin('/admin/shop-readiness'),searchParams]);
  const {data,error}=await client.from('shop_readiness_requests')
    .select('id,shop_id,status,seller_note,submitted_at,shops!inner(name,slug,status)')
    .eq('status','submitted').order('submitted_at',{ascending:true}).limit(100);
  const {data:activeShops,error:activeError}=await client.from('shops').select('id,name,slug,status').in('status',['active','paused','suspended']).order('created_at',{ascending:false}).limit(100);
  const blockers=new Map<string,string[]>();
  const unavailable=new Set<string>();
  await Promise.all((data||[]).map(async req=>{
    const {data:values,error:blockerError}=await client.rpc('tidalis_shop_readiness_blockers',{p_shop_id:req.shop_id});
    if(blockerError||!Array.isArray(values))unavailable.add(req.id);
    blockers.set(req.id,Array.isArray(values)?values:[]);
  }));
  return <div className="container page-pad policy-manager-page"><div className="page-heading"><div className="eyebrow">ADMIN / SHOP OPENING</div><h1>ตรวจความพร้อม<em>เปิดร้าน.</em></h1><p>ติดตามคำขอในโหมดตรวจด้วยแอดมิน และดูแลร้านที่เปิดด้วยตนเอง</p></div>
    <Link href="/admin" className="text-link">← Admin Console</Link>
    {params.notice&&notices[params.notice]&&<div role="status" className="phase4-alert">{notices[params.notice]}</div>}
    {error&&<div role="alert" className="phase4-alert">อ่านคำขอไม่ได้: {error.code}</div>}
    <div className="policy-version-list">{(data||[]).map(req=>{const s=Array.isArray(req.shops)?req.shops[0]:req.shops;const missing=blockers.get(req.id)||[];return <article key={req.id} className="phase4-card"><h2>{s?.name||req.shop_id}</h2><p>ร้าน {s?.status} · ส่งคำขอ {new Date(req.submitted_at).toLocaleDateString('th-TH')}</p><p>Seller: {req.seller_note||'ไม่มีหมายเหตุ'}</p>
      {unavailable.has(req.id)&&<div role="alert" className="phase5-note">ประเมินความพร้อมไม่สำเร็จ กรุณาลองใหม่ก่อนอนุมัติ</div>}
      {missing.length>0&&<div role="alert" className="phase5-note">ความพร้อมเปลี่ยนไประหว่างรอตรวจ: {missing.join(', ')} — ห้ามอนุมัติ</div>}
      <form action={reviewShopReadiness} className="phase4-action-form"><input type="hidden" name="id" value={req.id}/><label>การตัดสินใจ<select name="decision" defaultValue="needs_information" required><option value="needs_information">ขอข้อมูลเพิ่มเติม</option><option value="rejected">ไม่อนุมัติ</option><option value="approved" disabled={missing.length>0||unavailable.has(req.id)}>อนุมัติเปิดหน้าร้าน</option></select></label><label>เหตุผล / บันทึกผลตรวจ<textarea name="note" rows={3} maxLength={1500}/></label><label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes"/>ยืนยันว่าตรวจสถานะร้านและนโยบายจริงครบแล้ว (บังคับสำหรับอนุมัติ)</label><button className="btn btn-primary" type="submit">บันทึกผลตรวจ</button></form></article>})}
    </div>{!error&&!data?.length&&<div className="empty-state">ยังไม่มีคำขอเปิดร้านรอตรวจ</div>}
    <section className="section"><h2>ระงับการขายของร้าน</h2><p>แอดมินระงับการขายใหม่ได้เมื่อมีเหตุจำเป็น เจ้าของร้านเปิดข้ามการระงับไม่ได้ และยังติดตามงานเดิมหรือคืนเงินได้</p>
      {activeError&&<p role="alert">อ่านรายชื่อร้าน active ไม่สำเร็จ: {activeError.code}</p>}
      <div className="policy-version-list">{(activeShops||[]).map(shop=><article className="phase4-card" key={shop.id}><h3>{shop.name}</h3><p>{shop.status==='suspended'?'ถูกระงับ':shop.status==='paused'?'พักร้าน/เตรียมร้าน':'เปิดร้าน'}</p>
      <form className="phase4-action-form" action={adminPauseShopVisibility}><input type="hidden" name="shop_id" value={shop.id}/><input type="hidden" name="operation" value={shop.status==='suspended'?'restore':'suspend'}/><label>{shop.status==='suspended'?'เหตุผลและผลแก้ไขเพื่อปลดการระงับ':'เหตุผลที่ระงับร้าน'} (12–1,500 ตัวอักษร)<textarea name="reason" required minLength={12} maxLength={1500} rows={2}/></label><label className="checkbox-label"><input type="checkbox" required name="confirm" value="yes"/>{shop.status==='suspended'?'ยืนยันว่าตรวจผลแก้ไขและให้ร้านเตรียมเปิดใหม่ได้':'ยืนยันระงับร้านจากหน้าสาธารณะ'}</label><button type="submit" className="btn btn-outline">{shop.status==='suspended'?'ปลดการระงับ ให้เตรียมเปิดใหม่':'ระงับร้าน'}</button></form></article>)}</div>
      {!activeError&&!activeShops?.length&&<div className="empty-state">ไม่มีร้านในรายการนี้</div>}
    </section>
  </div>;
}
