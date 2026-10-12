import Link from 'next/link';
import {requireSeller} from '@/lib/auth';
import {sellerAccessMode} from '@/lib/seller-access';
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
  published_product_incomplete:'สินค้าที่เผยแพร่บางรายการไม่สมบูรณ์ ให้เก็บรายการนั้นและสร้างฉบับใหม่ให้ครบก่อนเปิดร้านอีกครั้ง'
};
const outcomes:Record<string,string>={activated:'เปิดร้านพร้อมรับคำสั่งซื้อแล้ว',submitted:'ส่งคำขอให้ Admin ตรวจแล้ว',failed:'ไม่สามารถส่งคำขอ กรุณาตรวจข้อมูลและสิทธิ์ MFA',forbidden:'เฉพาะ Owner/Manager ที่ผ่าน MFA เท่านั้น',paused:'พักหน้าร้านสาธารณะแล้ว เปิดใหม่ได้เมื่อข้อมูลพร้อม'};
export default async function SellerReadiness({searchParams}:{searchParams:Promise<{notice?:string}>}){
  const [{client,member},params]=await Promise.all([requireSeller(),searchParams]);
  if(!['owner','manager','artist'].includes(member.role))return <div className="container page-pad">
    <h1>ความพร้อมของร้าน</h1><p>การตรวจความพร้อมสินค้าเปิดให้ Owner, Manager และ Artist ของร้าน</p>
    <Link className="btn btn-outline" href="/seller">กลับภาพรวมร้าน</Link>
  </div>;
  const [{data:shop,error:shopError},{data:request,error:requestError},{data:readiness,error:readinessError}]=await Promise.all([
    client.from('shops').select('id,name,slug,status').eq('id',member.shop_id).single(),
    client.from('shop_readiness_requests').select('id,status,review_note,submitted_at,reviewed_at').eq('shop_id',member.shop_id).maybeSingle(),
    client.rpc('tidalis_shop_readiness_blockers',{p_shop_id:member.shop_id})
  ]);
  const {data:assurance}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const elevated=assurance?.currentLevel==='aal2';
  const blockers=Array.isArray(readiness)?readiness as string[]:[];
  const mode=await sellerAccessMode(client);
  const canSubmit=['owner','manager'].includes(member.role)&&mode.available&&elevated&&blockers.length===0&&(mode.selfService?['active','paused'].includes(shop?.status||''):shop?.status==='paused'&&['needs_information','rejected',undefined,null].includes(request?.status));
  return <div className="container page-pad phase5-page">
    <div className="page-heading"><div className="eyebrow">SELLER / SHOP READINESS</div><h1>เตรียม<em>เปิดร้าน.</em></h1><p>เปิดร้านและเผยแพร่สินค้าได้เอง ตั้งค่านโยบายและบัญชีรับเงินให้ครบก่อนรับคำสั่งซื้อ</p></div>
    <p><Link href="/seller" className="text-link">← ภาพรวมร้าน</Link> · <Link href="/seller/policies" className="text-link">นโยบายร้าน</Link> · <Link href="/seller/products" className="text-link">สินค้า</Link></p>
    {params.notice&&outcomes[params.notice]&&<div className="phase4-alert" role="status">{outcomes[params.notice]}</div>}
    {(shopError||requestError||readinessError)&&<div className="phase4-alert" role="alert">โหลดข้อมูลความพร้อมร้านไม่สำเร็จ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแล ({readinessError?.code||shopError?.code||requestError?.code||'unknown'})</div>}
    <div className="phase5-panel"><h2>{shop?.name||'ร้านของคุณ'} · {shop?.status||'—'}</h2><p>สถานะคำขอ: <strong>{request?.status||'ยังไม่ส่งคำขอ'}</strong></p>
      {request?.review_note&&<div className="phase5-note">ข้อความจาก Admin: {request.review_note}</div>}
      {shop?.status==='active'?<p role="status">ร้านเปิดให้เข้าชมแล้ว! <Link href={`/shops/${shop.slug}`} className="text-link">ดูหน้าร้านสาธารณะ →</Link></p>:null}
      <h3>เช็กลิสต์ความพร้อม</h3>
      {readinessError?<p>ยังประเมินความพร้อมไม่ได้</p>:blockers.length?<ul>{blockers.map(item=><li key={item}>○ {labels[item]||item}</li>)}</ul>:<p>✓ ข้อมูลร้าน นโยบาย และสินค้าเบื้องต้นครบแล้ว</p>}
      {!elevated&&<p><Link className="text-link" href="/mfa?next=%2Fseller%2Freadiness">ยืนยัน Authenticator ก่อนส่งคำขอเปิดร้านหรือพักร้าน →</Link></p>}
      {canSubmit&&!shopError&&!requestError&&!readinessError&&<form action={submitShopReadiness} className="phase4-action-form"><label>{mode.selfService?'บันทึกการเตรียมร้าน':'หมายเหตุถึง Admin'} (ไม่เกิน 1,500 ตัวอักษร)<textarea name="note" rows={3} maxLength={1500} placeholder="รายละเอียดความพร้อมร้านของคุณ"/></label><label className="checkbox-label"><input type="checkbox" required name="confirm"/> ฉันตรวจรายละเอียดร้าน นโยบาย และสินค้าให้ครบแล้ว</label><button type="submit" className="btn btn-primary">{mode.selfService?'เปิดร้าน / ตรวจความพร้อมอีกครั้ง':'ส่งคำขอเปิดร้านให้ Admin ตรวจ'}</button></form>}
      {elevated&&shop?.status==='active'&&['owner','manager'].includes(member.role)&&<form action={pauseOwnShopVisibility} className="phase4-action-form"><h3>พักหน้าร้านชั่วคราว</h3><p>ร้านและสินค้าที่เผยแพร่จะหายจากหน้าสาธารณะ แต่ลิงก์ภาพ Preview ที่ออกไปก่อนหน้าอาจใช้ได้จนหมดอายุ 5 นาที</p><label>เหตุผลการพักร้าน (อย่างน้อย 12 ตัวอักษร)<textarea name="reason" rows={3} required minLength={12} maxLength={1500}/></label><label className="checkbox-label"><input type="checkbox" value="yes" name="confirm" required/>ยืนยันพักหน้าร้าน และยอมรับว่าการเปิดอีกครั้งต้องตรวจข้อมูลให้ครบ</label><button type="submit" className="btn btn-outline">พักหน้าร้านสาธารณะ</button></form>}
      {request?.status==='submitted'&&<p>{mode.selfService?'คำขอเดิมยังรอตรวจ คุณเตรียมข้อมูลให้ครบแล้วเปิดร้านเองได้':'คำขออยู่ระหว่างตรวจ กรุณารอ Admin ยืนยัน'}</p>}
    </div>
  </div>;
}
