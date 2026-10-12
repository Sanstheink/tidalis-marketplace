import Link from 'next/link';
import {Package,LibraryBig,ShieldQuestion,Settings,Paintbrush,FileText,ArrowRight,Boxes,Store,ShieldCheck} from 'lucide-react';
import {getWorkspaceAccess,requireUser} from '@/lib/auth';
import {SignOut} from '@/components/SignOut';
const tiles=[
 {title:'คำสั่งซื้อของฉัน',url:'/account/orders',icon:Package,desc:'ติดตามรายการจอง สถานะ และรายละเอียดคำสั่งซื้อ'},
 {title:'My Library',url:'/account/library',icon:LibraryBig,desc:'คลังไฟล์ดาวน์โหลดหลังการซื้อสำเร็จ'},
 {title:'งาน Commission',url:'/account/orders?kind=commission',icon:Paintbrush,desc:'ติดตามบรีฟ ใบเสนอราคา และการส่งมอบงาน'},
 {title:'ข้อพิพาทและคืนเงิน',url:'/account/refunds',icon:ShieldQuestion,desc:'คำขอคืนเงินและประวัติการช่วยเหลือ'},
 {title:'ใบเสร็จของฉัน',url:'/account/documents',icon:FileText,desc:'เปิดดูและพิมพ์ใบเสร็จหรือเอกสารคืนเงินจากร้าน'},
 {title:'ความปลอดภัย / MFA',url:'/account/security',icon:Settings,desc:'ผู้ซื้อเลือกเปิด MFA ได้เอง; Seller/Admin ต้องใช้ MFA ก่อนเข้าพื้นที่จัดการ'}
];
export default async function Account({searchParams}:{searchParams:Promise<{denied?:string}>}){
 const {client,user}=await requireUser('/account');const {denied}=await searchParams;
 const {isAdmin,shops,lastApplication}=await getWorkspaceAccess(client,user.id);
 return <div className="container page-pad"><div className="dashboard-welcome"><div><div className="eyebrow">CUSTOMER ACCOUNT</div><h1>My <em>workspace.</em></h1><p>ยินดีต้อนรับ {user.email}</p></div><SignOut/></div>
 {denied&&<div className="form-message" role="alert">บัญชีนี้ไม่ได้รับสิทธิ์เข้าถึงพื้นที่ดังกล่าว</div>}
 <div className="info-panel">คุณสามารถใช้บัญชีผู้ซื้อได้โดยไม่ต้องเปิด MFA หากต้องการเพิ่มความปลอดภัย สามารถตั้งค่าเองได้ที่ “ความปลอดภัย / MFA” ส่วน Seller/Admin จะต้องยืนยันด้วย Authenticator ก่อนเข้าพื้นที่จัดการ</div>
 <div className="dashboard-grid">{tiles.map(t=><Link href={t.url} key={t.title} className="dashboard-tile"><t.icon size={24}/><h3>{t.title}</h3><p>{t.desc}</p><ArrowRight size={16}/></Link>)}</div>
 <div className="preview-panels" style={{marginTop:28}}><div className="preview-panel"><h3><Boxes size={20}/> Workspace Switcher</h3><p>สลับบทบาทได้ตามสิทธิ์ที่ระบบตรวจสอบแล้ว</p><Link className="btn btn-outline" href="/workspace">เลือก Workspace <ArrowRight size={16}/></Link></div>
 <div className="preview-panel"><h3><Store size={20}/> Seller</h3><p>{shops.length?`คุณมีสิทธิ์เข้าร้าน ${shops.length} ร้าน`:(lastApplication?`ใบสมัครล่าสุด: ${lastApplication.status}`:'ยังไม่มีร้านที่ได้รับอนุมัติ')}</p><Link className="btn btn-outline" href={shops.length?'/seller':lastApplication?'/sell/application':'/sell/apply'}>ดูพื้นที่ผู้ขาย <ArrowRight size={16}/></Link></div>
 {isAdmin&&<div className="preview-panel"><h3><ShieldCheck size={20}/> Platform Admin</h3><p>ตรวจพบสิทธิ์ Admin — ต้องใช้ MFA เพื่อเข้าคอนโซล</p><Link className="btn btn-outline" href="/admin">ไป Admin Console <ArrowRight size={16}/></Link></div>}
 </div><div className="info-panel">ติดตามการรับเงิน ส่งมอบงาน และใบเสร็จได้ในคำสั่งซื้อ งานรับวาดดาวน์โหลดจากคลังได้หลังคุณตรวจรับงาน</div></div>;
}
