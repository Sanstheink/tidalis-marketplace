import {requirePlatformAdmin} from '@/lib/auth';
import {approveApplication,reviewApplication} from './actions';

const statusNames:Record<string,string>={submitted:'รอพิจารณา',under_review:'กำลังตรวจสอบ',
  needs_information:'ขอข้อมูลเพิ่มเติม',approved:'อนุมัติแล้ว',rejected:'ปฏิเสธ',withdrawn:'ถอนใบสมัคร'};
const notices:Record<string,string>={approved:'อนุมัติและสร้างร้านสำเร็จ',updated:'อัปเดตสถานะใบสมัครแล้ว',
  'approval-failed':'อนุมัติไม่สำเร็จ โปรดตรวจ Agreement, MFA หรือ URL ร้าน และตรวจฐานข้อมูล Log',
  'review-failed':'เปลี่ยนสถานะไม่สำเร็จ โปรดตรวจ MFA และสถานะใบสมัคร',
  'invalid-reason':'กรุณาระบุเหตุผลอย่างน้อย 12 ตัวอักษร',
  'confirmation-required':'ต้องยืนยันการอนุมัติร้านก่อนดำเนินการ'};

export default async function Applications({searchParams}:{searchParams:Promise<{review?:string}>}){
  const {client}=await requirePlatformAdmin();
  const [{data,error},{review}]=await Promise.all([
    client.from('seller_applications').select('id,user_id,shop_name,requested_slug,portfolio_url,description,status,submitted_at,agreement_version_id,review_note')
      .order('submitted_at',{ascending:false}).limit(60),searchParams
  ]);
  return <div className="container page-pad">
    <div className="page-heading"><div className="eyebrow">TIDALIS ADMIN / PHASE 4</div>
      <h1>Seller <em>applications.</em></h1>
      <p>ตรวจ Portfolio, ข้อตกลง และคำอธิบายก่อนตัดสินใจ การสร้างร้านเกิดขึ้นเฉพาะเมื่อกดอนุมัติ</p></div>
    {review&&notices[review]&&<div role="status" className="phase4-alert">{notices[review]}</div>}
    {error&&<div className="legal-alert" role="alert">ไม่สามารถอ่านรายการสมัครได้ โปรดตรวจสิทธิ์ Admin, MFA และ Migration</div>}
    <div className="phase4-application-grid">{data?.map(app=><article className="phase4-card" key={app.id}>
      <div className="phase4-status-heading"><div><span className="eyebrow">SELLER REVIEW</span><h2>{app.shop_name}</h2></div>
        <span className="status-chip">{statusNames[app.status]||app.status}</span></div>
      <p>URL ร้าน: <strong>{app.requested_slug}</strong></p>
      <p>Applicant UID: <code>{app.user_id}</code></p>
      <p>Portfolio: <a className="text-link" href={app.portfolio_url} target="_blank" rel="noopener noreferrer">เปิดพอร์ตภายนอก ↗</a></p>
      <p className="phase4-description">{app.description}</p>
      <div className="phase4-small">ส่งเมื่อ {new Date(app.submitted_at).toLocaleDateString('th-TH')} · Agreement ID: {app.agreement_version_id||'ยังไม่บันทึกเวอร์ชัน (Legacy)'}</div>
      {app.review_note&&<div className="phase4-review-note"><strong>ข้อความผู้ตรวจสอบล่าสุด</strong><p>{app.review_note}</p></div>}
      {['submitted','under_review'].includes(app.status)&&<div className="phase4-review-actions">
        <form action={approveApplication} className="phase4-action-form">
          <input type="hidden" name="applicationId" value={app.id}/>
          <label className="checkbox-label"><input type="checkbox" name="confirm" value="yes" required/>ยืนยันว่าตรวจ Portfolio, ข้อมูล และเวอร์ชันข้อตกลงแล้ว</label>
          <button className="btn btn-primary" type="submit" disabled={!app.agreement_version_id}>อนุมัติและสร้างร้าน</button>
          {!app.agreement_version_id&&<small>ใบสมัครเก่าไม่มี Agreement Version — ต้องให้ผู้ขายยอมรับใหม่ก่อน</small>}
        </form>
        <form action={reviewApplication} className="phase4-action-form">
          <input type="hidden" name="applicationId" value={app.id}/>
          <label htmlFor={`note-${app.id}`}>เหตุผล / ข้อมูลที่ต้องการเพิ่ม</label>
          <textarea id={`note-${app.id}`} name="reason" rows={3} minLength={12} maxLength={1500} required placeholder="อธิบายให้ผู้ขายเข้าใจและแก้ไขได้อย่างไร…"/>
          <div className="button-row">
            <button className="btn btn-outline" name="decision" value="needs_information" type="submit">ขอข้อมูลเพิ่ม</button>
            <button className="btn btn-ghost" name="decision" value="rejected" type="submit">ไม่อนุมัติ</button>
          </div>
        </form>
      </div>}
    </article>)}</div>
    {!data?.length&&!error&&<div className="empty-state">ยังไม่มีคำขอสมัครร้าน</div>}
  </div>;
}
