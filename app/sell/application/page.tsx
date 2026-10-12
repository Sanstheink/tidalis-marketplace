import Link from 'next/link';
import {Store,Clock,CheckCircle2,ShieldAlert,MessageSquareText} from 'lucide-react';
import {requireUser} from '@/lib/auth';
import {sellerAccessMode} from '@/lib/seller-access';

const statuses:Record<string,string>={
  submitted:'ส่งใบสมัครแล้ว',under_review:'อยู่ระหว่างตรวจสอบ',needs_information:'ต้องแก้ไขข้อมูล',
  approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ',withdrawn:'ถอนใบสมัคร',draft:'ฉบับร่าง'
};
export default async function ApplicationStatus(){
  const {client,user}=await requireUser('/sell/application');
  const mode=await sellerAccessMode(client);
  const {data,error}=await client.from('seller_applications')
    .select('id,shop_name,requested_slug,status,review_note,submitted_at,reviewed_at,created_shop_id,agreement_version_id,approval_mode,self_opened_at')
    .eq('user_id',user.id).order('submitted_at',{ascending:false}).limit(10);
  return <div className="container page-pad">
    <div className="page-heading"><div className="eyebrow">SELLER ONBOARDING</div>
      <h1>Application <em>status.</em></h1>
      <p>ติดตามทุกขั้นตอนอย่างโปร่งใส ข้อมูลใบสมัครจะแสดงเฉพาะเจ้าของและ Admin ที่มีสิทธิ์</p></div>
    {error&&<div role="alert" className="form-message">ไม่สามารถอ่านสถานะใบสมัคร กรุณาลองใหม่ภายหลัง</div>}
    {data?.length?<div className="phase4-status-list">{data.map(app=><article className="phase4-card" key={app.id}>
      <div className="phase4-status-heading">
        <div>{app.status==='approved'?<CheckCircle2 size={23}/>:app.status==='rejected'?<ShieldAlert size={23}/>:app.status==='needs_information'?<MessageSquareText size={23}/>:<Clock size={23}/>}
          <h2>{app.shop_name}</h2></div>
        <span className="status-chip">{app.approval_mode==='self_service'&&app.status==='approved'?'เปิดร้านด้วยตนเองแล้ว':statuses[app.status]||app.status}</span>
      </div>
      <p>ชื่อร้านใน URL: <strong>{app.requested_slug}</strong></p>
      <p>ส่งเมื่อ: {new Date(app.submitted_at).toLocaleDateString('th-TH',{dateStyle:'medium'})}</p>
      {app.reviewed_at&&<p>ตรวจเมื่อ: {new Date(app.reviewed_at).toLocaleDateString('th-TH',{dateStyle:'medium'})}</p>}
      {app.review_note&&<div className="phase4-review-note"><strong>ข้อความจาก Admin</strong><p>{app.review_note}</p></div>}
      {(app.status==='needs_information'||(mode.selfService&&['submitted','under_review'].includes(app.status)))&&<Link className="btn btn-primary" href="/sell/apply">ตรวจข้อมูลและดำเนินการเปิดร้าน</Link>}
      {app.status==='approved'&&<Link className="btn btn-primary" href="/workspace">เข้าสู่ร้านของคุณ (ต้องเปิด MFA)</Link>}
    </article>)}</div>:<div className="empty-state"><Store size={40}/><p>ยังไม่มีคำขอเปิดร้าน</p><Link className="btn btn-outline" href="/sell/apply">สมัครเปิดร้าน</Link></div>}
    <div className="info-panel">{mode.selfService?'กรอกข้อมูลจริง ยืนยันอีเมลและยอมรับข้อตกลงปัจจุบัน แล้วเปิดร้านด้วยตนเองได้ การจัดการร้านและการรับเงินต้องเปิด Authenticator':'คำขอเปิดร้านจะเข้าสู่ขั้นตอนตรวจตามการตั้งค่าปัจจุบันของแพลตฟอร์ม'}</div>
  </div>;
}
