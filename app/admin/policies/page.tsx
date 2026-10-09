import {requirePlatformAdmin} from '@/lib/auth';
import {createSellerAgreementDraft,publishSellerAgreement} from './actions';

const messages:Record<string,string>={
  invalid:'ชื่อข้อตกลงหรือเนื้อหาไม่ครบ (เนื้อหาต้องยาวอย่างน้อย 500 ตัวอักษร)',
  'draft-failed':'ไม่สามารถสร้างฉบับร่างได้ กรุณาตรวจ SQL Migration และสิทธิ์ Admin MFA',
  'draft-created':'บันทึกฉบับร่างแล้ว ยังไม่ได้เผยแพร่',
  'not-confirmed':'ต้องยืนยันว่าผ่านการตรวจด้านกฎหมายและได้รับอนุญาตให้เผยแพร่',
  'publish-failed':'เผยแพร่ไม่สำเร็จ กรุณาตรวจเวอร์ชันและ MFA',published:'เผยแพร่ข้อตกลงแล้ว ตรวจหน้า Seller Agreement อีกครั้ง'
};
export default async function PlatformPolicies({searchParams}:{searchParams:Promise<{result?:string}>}){
  const {client}=await requirePlatformAdmin();
  const {data,error}=await client.from('platform_policy_versions')
    .select('id,policy_type,version,title,content,status,effective_from,approved_by')
    .order('policy_type').order('version',{ascending:false});
  const {result}=await searchParams;
  return <div className="container page-pad">
    <div className="page-heading"><div className="eyebrow">ADMIN / LEGAL</div>
      <h1>Platform <em>Policy Manager.</em></h1><p>ควบคุมฉบับร่างและเวอร์ชันที่มีผลใช้จริง พร้อม Audit Trail</p></div>
    <div className="legal-alert"><strong>Production Safety</strong> — ห้ามเผยแพร่ข้อความตัวอย่างหรือฉบับร่างเพียงเพื่อทดลองเปิดร้าน ต้องให้ผู้รับผิดชอบตรวจสอบด้านกฎหมายและอนุมัติข้อความจริงก่อนทุกครั้ง</div>
    {result&&messages[result]&&<div role="status" className="phase4-alert">{messages[result]}</div>}
    {error&&<div role="alert" className="form-message">อ่านข้อมูลนโยบายไม่สำเร็จ</div>}
    {data?.length?<div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr><th>ชนิด</th><th>เวอร์ชัน</th><th>หัวข้อ</th><th>สถานะ</th><th>เริ่มใช้</th></tr></thead><tbody>
      {data.map(p=><tr key={p.id}><td>{p.policy_type}</td><td>v{p.version}</td><td>{p.title}</td><td><span className="status-chip">{p.status}</span></td><td>{p.effective_from?new Date(p.effective_from).toLocaleDateString('th-TH'):'—'}</td></tr>)}
    </tbody></table></div>:<div className="empty-state">ยังไม่มี Policy Version ในฐานข้อมูล</div>}
    <section className="phase4-card phase4-policy-editor"><div className="eyebrow">SELLER AGREEMENT / DRAFT</div>
      <h2>บันทึกร่างข้อตกลงผู้ขาย</h2>
      <p>ต้องใช้ข้อความจริงที่ได้รับการตรวจสอบจากผู้รับผิดชอบ ระบบจะสร้างเลขเวอร์ชันใหม่โดยอัตโนมัติ และไม่เปิดรับสมัครทันที</p>
      <form action={createSellerAgreementDraft} className="phase4-action-form">
        <label htmlFor="agreement-title">ชื่อข้อตกลง</label>
        <input id="agreement-title" name="title" minLength={8} maxLength={160} required placeholder="Seller Agreement — Tidalis Marketplace"/>
        <label htmlFor="agreement-content">เนื้อหาเต็ม (ข้อความ ไม่ใช่ HTML)</label>
        <textarea id="agreement-content" name="content" minLength={500} maxLength={30000} rows={12} required placeholder="วางเนื้อหาที่ได้รับการตรวจแล้ว…"/>
        <button type="submit" className="btn btn-outline">บันทึกเป็นฉบับร่าง</button>
      </form>
    </section>
    {data?.filter(p=>p.policy_type==='seller-agreement'&&['draft','under_review'].includes(p.status)).map(p=><section className="phase4-card phase4-publish" key={p.id}>
      <div className="eyebrow">MANUAL LEGAL APPROVAL / v{p.version}</div><h2>{p.title}</h2>
      <p>ตรวจเนื้อหาเต็มจากฉบับร่างและบันทึกหลักฐานการตรวจนอกระบบให้ครบก่อนเผยแพร่ การเผยแพร่มีผลทันทีและเปลี่ยนฉบับเก่าเป็น Archived</p>
      <details className="phase4-policy-preview"><summary>เปิดอ่านเนื้อหาฉบับนี้ทั้งหมดก่อนเผยแพร่</summary><div className="phase4-policy-body">{p.content}</div></details>
      <form action={publishSellerAgreement} className="phase4-action-form">
        <input name="id" type="hidden" value={p.id}/>
        <label className="checkbox-label"><input name="reviewed" type="checkbox" value="yes" required/>ฉันได้รับอนุมัติให้เผยแพร่ข้อตกลงฉบับนี้ และได้ตรวจสอบเนื้อหาฉบับเต็มแล้ว</label>
        <button type="submit" className="btn btn-primary">เผยแพร่ Seller Agreement v{p.version}</button>
      </form>
    </section>)}
    <div className="info-panel">เมื่อเผยแพร่แล้ว ให้เปิด NEXT_PUBLIC_LEGAL_DOCUMENTS_APPROVED=true บน Vercel และ Redeploy <strong>หลังจาก</strong> ตรวจเอกสารจริงเรียบร้อยเท่านั้น</div>
  </div>;
}
