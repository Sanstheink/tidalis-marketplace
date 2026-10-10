import Link from 'next/link';
import {requireSeller} from '@/lib/auth';
import {submitShopReadiness,pauseOwnShopVisibility} from './actions';
export const dynamic='force-dynamic';
const labels:Record<string,string>={
  seller_approval_missing:'การอนุมัติผู้ขายยังไม่ครบ',
  ready_product_missing:'เตรียมสินค้าให้สมบูรณ์อย่างน้อย 1 ชิ้น (ภาพ, ประเภทงาน, ราคา, License, ไฟล์ส่งมอบถ้าจำเป็น)',
  shop_not_eligible:'ร้านยังไม่อยู่ในสถานะเตรียมเปิด',
  'platform_policy_terms':'นโยบายแพลตฟอร์ม Terms ยังไม่เผยแพร่',
  'platform_policy_privacy':'นโยบาย Privacy ยังไม่เผยแพร่',
  'platform_policy_seller-agreement':'Seller Agreement ยังไม่เผยแพร่',
  'platform_policy_payment-refund':'นโยบาย Payment & Refund ยังไม่เผยแพร่',
  platform_policy_copyright:'นโยบาย Copyright ยังไม่เผยแพร่',
  shop_policy_refund:'นโยบายคืนเงินร้านยังไม่เผยแพร่',
  shop_policy_delivery:'นโยบายส่งมอบร้านยังไม่เผยแพร่',
  shop_policy_license:'นโยบาย License ร้านยังไม่เผยแพร่',
  published_product_incomplete:'สินค้าที่เผยแพร่บางรายการไม่สมบูรณ์ ต้องให้ Admin ตรวจหรือเก็บสินค้าก่อนเปิดร้านอีกครั้ง'
};
const outcomes:Record<string,string>={submitted:'ส่งคำขอให้ Admin ตรวจแล้ว',failed:'ไม่สามารถส่งคำขอ กรุณาตรวจข้อมูลและสิทธิ์ MFA',forbidden:'เฉพาะ Owner/Manager ที่ผ่าน MFA เท่านั้น',paused:'พักหน้าร้านสาธารณะแล้ว ต้องได้รับอนุมัติอีกครั้งก่อนเปิด'};
export default async function SellerReadiness({searchParams}:{searchParams:Promise<{notice?:string}>}){
  const [{client,member},params]=await Promise.all([requireSeller(),searchParams]);
  const [{data:shop,error:shopError},{data:request,error:requestError},{data:readiness,error:readinessError}]=await Promise.all([
    client.from('shops').select('id,name,slug,status').eq('id',member.shop_id).single(),
    client.from('shop_readiness_requests').select('id,status,review_note,submitted_at,reviewed_at').eq('shop_id',member.shop_id).maybeSingle(),
    client.rpc('tidalis_shop_readiness_blockers',{p_shop_id:member.shop_id})
  ]);
  const {data:assurance}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const elevated=assurance?.currentLevel==='aal2';
  const blockers=Array.isArray(readiness)?readiness as string[]:[];
  const canSubmit=['owner','manager'].includes(member.role)&&shop?.status==='paused'&&elevated&&blockers.length===0&&['needs_information','rejected',undefined,null].includes(request?.status);
  return <div className="container page-pad phase5-page">
    <div className="page-heading"><div className="eyebrow">SELLER / SHOP READINESS</div><h1>Prepare your <em>store.</em></h1><p>เปิดร้านให้สาธารณะเห็นหลัง Admin ตรวจสอบเท่านั้น ระบบรับเงินและ Checkout ยังไม่เปิด</p></div>
    <p><Link href="/seller" className="text-link">← Seller Studio</Link> · <Link href="/seller/policies" className="text-link">นโยบายร้าน</Link> · <Link href="/seller/products" className="text-link">สินค้า</Link></p>
    {params.notice&&outcomes[params.notice]&&<div className="phase4-alert" role="status">{outcomes[params.notice]}</div>}
    {(shopError||requestError||readinessError)&&<div className="phase4-alert" role="alert">โหลดข้อมูลความพร้อมร้านไม่สำเร็จ กรุณาตรวจ Migration 008 และสิทธิ์ RLS ({readinessError?.code||shopError?.code||requestError?.code||'unknown'})</div>}
    <div className="phase5-panel"><h2>{shop?.name||'ร้านของคุณ'} · {shop?.status||'—'}</h2><p>สถานะคำขอ: <strong>{request?.status||'ยังไม่ส่งคำขอ'}</strong></p>
      {request?.review_note&&<div className="phase5-note">ข้อความจาก Admin: {request.review_note}</div>}
      {shop?.status==='active'?<p role="status">ร้านเปิดให้เข้าชมแล้ว! <Link href={`/shops/${shop.slug}`} className="text-link">ดูหน้าร้านสาธารณะ →</Link></p>:null}
      <h3>เช็กลิสต์ความพร้อม</h3>
      {readinessError?<p>ยังประเมินความพร้อมไม่ได้</p>:blockers.length?<ul>{blockers.map(item=><li key={item}>○ {labels[item]||item}</li>)}</ul>:<p>✓ ผ่านข้อกำหนดด้านนโยบาย การอนุมัติร้าน และสินค้าเบื้องต้น</p>}
      {!elevated&&<p><Link className="text-link" href="/mfa?next=%2Fseller%2Freadiness">ยืนยัน Authenticator ก่อนส่งคำขอเปิดร้านหรือพักร้าน →</Link></p>}
      {canSubmit&&!shopError&&!requestError&&!readinessError&&<form action={submitShopReadiness} className="phase4-action-form"><label>หมายเหตุถึง Admin (ไม่เกิน 1,500 ตัวอักษร)<textarea name="note" rows={3} maxLength={1500} placeholder="รายละเอียดความพร้อมร้านของคุณ"/></label><label className="checkbox-label"><input type="checkbox" required name="confirm"/> ยืนยันว่ารายละเอียดร้านและนโยบายผ่านการตรวจสอบแล้ว</label><button type="submit" className="btn btn-primary">ส่งคำขอเปิดร้านให้ Admin ตรวจ</button></form>}
      {elevated&&shop?.status==='active'&&['owner','manager'].includes(member.role)&&<form action={pauseOwnShopVisibility} className="phase4-action-form"><h3>พักหน้าร้านชั่วคราว</h3><p>ร้านและสินค้าที่เผยแพร่จะหายจากหน้าสาธารณะ แต่ลิงก์ภาพ Preview ที่ออกไปก่อนหน้าอาจใช้ได้จนหมดอายุ 5 นาที</p><label>เหตุผลการพักร้าน (อย่างน้อย 12 ตัวอักษร)<textarea name="reason" rows={3} required minLength={12} maxLength={1500}/></label><label className="checkbox-label"><input type="checkbox" value="yes" name="confirm" required/>ยืนยันพักหน้าร้าน และยอมรับว่าการเปิดอีกครั้งต้องผ่าน Admin</label><button type="submit" className="btn btn-outline">พักหน้าร้านสาธารณะ</button></form>}
      {request?.status==='submitted'&&<p>คำขออยู่ระหว่างตรวจ กรุณารอ Admin ยืนยัน</p>}
    </div>
  </div>;
}
