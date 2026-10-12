import Link from 'next/link';
import {ArrowRight,ShieldCheck,Store,UserRound} from 'lucide-react';
import {getWorkspaceAccess,requireUser} from '@/lib/auth';
import {selectSellerShop} from './actions';

export default async function Workspace(){
 const {client,user}=await requireUser('/workspace');
 const {isAdmin,shops,lastApplication}=await getWorkspaceAccess(client,user.id);
 return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">TIDALIS ACCOUNT</div><h1>Choose your <em>workspace.</em></h1><p>หนึ่งบัญชีสามารถใช้พื้นที่ผู้ซื้อได้โดยไม่ต้องเปิด MFA ส่วน Seller/Admin ต้องยืนยัน Authenticator ก่อนเข้าพื้นที่จัดการ</p></div><div className="preview-panels">
 <div className="preview-panel"><h3><UserRound size={22}/> Buyer Account</h3><p>เข้าสู่ระบบได้ด้วยอีเมลและรหัสผ่านหรือ Email OTP โดยไม่บังคับ MFA; เลือกเปิด MFA เองได้ในหน้าความปลอดภัย</p><Link className="btn btn-outline" href="/account">เข้าสู่บัญชีผู้ซื้อ <ArrowRight size={17}/></Link></div>
 {shops.length?<div className="preview-panel"><h3><Store size={22}/> Seller Studio</h3><p>เลือกร้านที่ต้องการจัดการ · {shops.length} ร้าน</p>
   {shops.map(member=>{const shop=Array.isArray(member.shops)?member.shops[0]:member.shops;return <form action={selectSellerShop} key={member.shop_id}>
     <input type="hidden" name="shopId" value={member.shop_id}/>
     <input type="hidden" name="history" value={shop&&!['active','paused'].includes(shop.status)?'yes':'no'}/>
     <button className="btn btn-outline" type="submit">{shop?.name||'ร้านของคุณ'} · {member.role}{shop&&!['active','paused'].includes(shop.status)?' · ประวัติร้านที่ปิดแล้ว':''} <ArrowRight size={17}/></button>
   </form>})}<p className="helper">ต้องลงทะเบียน Authenticator ที่ยืนยันแล้วก่อนเข้า Studio</p></div>:<div className="preview-panel"><h3><Store size={22}/> เปิดร้านศิลปิน</h3><p>{lastApplication?`คำขอล่าสุด: ${lastApplication.shop_name} — ${lastApplication.status}`:'ยังไม่มีร้านที่ได้รับอนุมัติ'}</p><Link className="btn btn-outline" href={lastApplication?'/sell/application':'/sell/apply'}>{lastApplication?'ดูสถานะคำขอ':'สมัครเป็นผู้ขาย'} <ArrowRight size={17}/></Link></div>}
 {isAdmin&&<div className="preview-panel"><h3><ShieldCheck size={22}/> Tidalis Admin Console</h3><p>พื้นที่เฉพาะผู้ดูแลที่ได้รับสิทธิ์จากระบบเท่านั้น</p><Link className="btn btn-outline" href="/admin">เข้าสู่ Admin Console <ArrowRight size={17}/></Link><p className="helper">ต้องยืนยัน MFA ก่อนเข้า</p></div>}
 </div>{!shops.length&&lastApplication?.status==='approved'?<p className="info-panel"><Link className="text-link" href="/mfa?next=%2Fworkspace">ยืนยัน Authenticator เพื่อดูร้านและประวัติร้านที่ปิดแล้ว →</Link></p>:null}<div className="info-panel">Seller/Admin Roles ไม่ได้เกิดจากการสมัครสมาชิกอัตโนมัติ ระบบตรวจสิทธิ์จากฐานข้อมูลทุกครั้ง</div></div>
}
