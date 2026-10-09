import Link from 'next/link';
import {ArrowRight,ShieldCheck,Store,UserRound} from 'lucide-react';
import {getWorkspaceAccess,requireUser} from '@/lib/auth';

export default async function Workspace(){
 const {client,user}=await requireUser('/workspace');
 const {isAdmin,shops,lastApplication}=await getWorkspaceAccess(client,user.id);
 return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">TIDALIS ACCOUNT</div><h1>Choose your <em>workspace.</em></h1><p>หนึ่งบัญชีสามารถใช้พื้นที่ผู้ซื้อ ผู้ขาย และผู้ดูแลได้ตามสิทธิ์ที่ได้รับจริง</p></div><div className="preview-panels">
 <div className="preview-panel"><h3><UserRound size={22}/> Buyer Account</h3><p>ติดตามคำสั่งซื้อ คลังไฟล์ และการสื่อสารกับร้านผู้ขาย</p><Link className="btn btn-outline" href="/account">เข้าสู่บัญชีผู้ซื้อ <ArrowRight size={17}/></Link></div>
 {shops.length?<div className="preview-panel"><h3><Store size={22}/> Seller Studio</h3><p>ร้านที่คุณมีสิทธิ์: {shops.length} ร้าน (รวมร้านที่อนุมัติแล้วแต่ยังไม่เปิดขาย)</p><Link className="btn btn-outline" href="/seller">เข้าสู่ Seller Studio <ArrowRight size={17}/></Link><p className="helper">ต้องยืนยันตัวตนแบบ MFA ก่อนเข้า</p></div>:<div className="preview-panel"><h3><Store size={22}/> เปิดร้านศิลปิน</h3><p>{lastApplication?`คำขอล่าสุด: ${lastApplication.shop_name} — ${lastApplication.status}`:'ยังไม่มีร้านที่ได้รับอนุมัติ'}</p><Link className="btn btn-outline" href={lastApplication?'/sell/application':'/sell/apply'}>{lastApplication?'ดูสถานะคำขอ':'สมัครเป็นผู้ขาย'} <ArrowRight size={17}/></Link></div>}
 {isAdmin&&<div className="preview-panel"><h3><ShieldCheck size={22}/> Tidalis Admin Console</h3><p>พื้นที่เฉพาะผู้ดูแลที่ได้รับสิทธิ์จากระบบเท่านั้น</p><Link className="btn btn-outline" href="/admin">เข้าสู่ Admin Console <ArrowRight size={17}/></Link><p className="helper">ต้องยืนยัน MFA ก่อนเข้า</p></div>}
 </div><div className="info-panel">Seller/Admin Roles ไม่ได้เกิดจากการสมัครสมาชิกอัตโนมัติ ระบบตรวจสิทธิ์จากฐานข้อมูลทุกครั้ง</div></div>
}
