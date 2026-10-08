import Link from 'next/link';
import {Store,Clock,CheckCircle2,ShieldAlert} from 'lucide-react';
import {requireUser} from '@/lib/auth';
export default async function ApplicationStatus(){
 const {client,user}=await requireUser('/sell/application');
 const {data,error}=await client.from('seller_applications').select('id,shop_name,requested_slug,status,submitted_at,reviewed_at,created_shop_id').eq('user_id',user.id).order('submitted_at',{ascending:false}).limit(10);
 return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">SELLER ONBOARDING</div><h1>Application <em>status.</em></h1><p>การเปิดร้านต้องได้รับการอนุมัติจาก Admin ไม่สามารถกำหนดบทบาท Seller ด้วยตนเอง</p></div>
 {error&&<div role="alert" className="form-message">ไม่สามารถอ่านสถานะใบสมัคร: {error.message}</div>}
 {data?.length?<div className="preview-panels">{data.map(app=><div className="preview-panel" key={app.id}><h3>{app.status==='approved'?<CheckCircle2 size={22}/>:app.status==='rejected'?<ShieldAlert size={22}/>:<Clock size={22}/>} {app.shop_name}</h3><p>URL: {app.requested_slug}</p><p>สถานะ: <strong>{app.status}</strong></p><p>ส่งเมื่อ: {new Date(app.submitted_at).toLocaleDateString('th-TH')}</p>{app.status==='approved'&&<Link className="btn btn-primary" href="/seller">เข้า Seller Studio (ต้องเปิด MFA)</Link>}</div>)}</div>:<div className="empty-state"><Store size={40}/><p>ยังไม่มีคำขอเปิดร้าน</p><Link className="btn btn-outline" href="/sell/apply">สมัครเปิดร้าน</Link></div>}
 <div className="info-panel">ไม่อนุญาตให้สร้างร้านจากหน้าฟอร์มโดยตรง — การอนุมัติและสร้างร้านทำผ่าน RPC ที่ตรวจ Admin และบันทึก Audit เท่านั้น</div></div>
}
