import {requirePlatformAdmin} from '@/lib/auth';
import Link from 'next/link';
import {policyPages} from '@/lib/policies';
import {createSellerAgreementDraft,publishSellerAgreement,createGeneralPlatformPolicyDraft,publishGeneralPlatformPolicy,editGeneralPlatformPolicyDraft} from './actions';

const messages:Record<string,string>={
  invalid:'ชื่อข้อตกลงหรือเนื้อหาไม่ครบ (เนื้อหาต้องยาวอย่างน้อย 500 ตัวอักษร)',
  'draft-failed':'ไม่สามารถสร้างฉบับร่างได้ กรุณาตรวจ SQL Migration และสิทธิ์ Admin MFA',
  'draft-created':'บันทึกฉบับร่างแล้ว ยังไม่ได้เผยแพร่',
  'draft-updated':'แก้ไขร่างสำเร็จ เวอร์ชันเดิมยังไม่เผยแพร่',
  'not-confirmed':'ต้องยืนยันว่าผ่านการตรวจด้านกฎหมายและได้รับอนุญาตให้เผยแพร่',
  'publish-failed':'เผยแพร่ไม่สำเร็จ กรุณาตรวจเวอร์ชันและ MFA',published:'เผยแพร่ข้อตกลงแล้ว ตรวจหน้า Seller Agreement อีกครั้ง'
};
export default async function PlatformPolicies({searchParams}:{searchParams:Promise<{result?:string}>}){
  const {client}=await requirePlatformAdmin('/admin/policies');
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
    <div className="info-panel"><Link href="/admin/shop-policies" className="btn btn-outline">ตรวจนโยบายร้านค้า →</Link></div>
    <section className="phase4-card phase4-policy-editor"><div className="eyebrow">GENERAL PLATFORM POLICIES</div>
      <h2>สร้างร่างนโยบายแพลตฟอร์ม</h2><p>สำหรับนโยบายทั่วไปเท่านั้น ส่วน Seller Agreement ใช้เครื่องมือเฉพาะด้านล่าง</p>
      <form action={createGeneralPlatformPolicyDraft} className="phase4-action-form">
        <label htmlFor="general-policy-type">หมวดนโยบาย</label>
        <select id="general-policy-type" name="policy_type" required>
          {policyPages.filter(p=>p.slug!=='seller-agreement').map(p=><option key={p.slug} value={p.slug}>{p.title}</option>)}
        </select>
        <label htmlFor="general-policy-title">หัวข้อ</label><input id="general-policy-title" name="title" minLength={8} maxLength={160} required/>
        <label htmlFor="general-policy-content">เนื้อหาเต็ม (ข้อความ ไม่ใช่ HTML)</label>
        <textarea id="general-policy-content" name="content" minLength={500} maxLength={30000} rows={10} required/>
        <button className="btn btn-outline" type="submit">บันทึกร่างนโยบาย</button>
      </form>
    </section>
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
    {data?.filter(p=>p.policy_type!=='seller-agreement'&&['draft','under_review'].includes(p.status)).map(p=><section key={p.id} className="phase4-card phase4-publish">
      <div className="eyebrow">PLATFORM POLICY / {p.policy_type} · v{p.version}</div>
      <h2>{p.title}</h2><details className="phase4-policy-preview"><summary>อ่านเนื้อหาเต็มก่อนเผยแพร่</summary>
        <div className="phase4-policy-body">{p.content}</div></details>
      {p.status==='draft'&&<form action={editGeneralPlatformPolicyDraft} className="phase4-action-form">
        <input type="hidden" name="id" value={p.id}/>
        <label htmlFor={`platform-title-${p.id}`}>แก้ไขชื่อ Draft</label>
        <input id={`platform-title-${p.id}`} name="title" defaultValue={p.title} minLength={8} maxLength={160} required/>
        <label htmlFor={`platform-content-${p.id}`}>แก้ไขข้อความ Draft</label>
        <textarea id={`platform-content-${p.id}`} name="content" defaultValue={p.content} minLength={500} maxLength={30000} rows={9} required/>
        <button type="submit" className="btn btn-outline">บันทึกการแก้ไขร่าง</button>
      </form>}
      <form action={publishGeneralPlatformPolicy} className="phase4-action-form">
        <input type="hidden" name="id" value={p.id}/>
        <label className="checkbox-label"><input type="checkbox" name="reviewed" value="yes" required/>ฉันตรวจเอกสารจริงและได้รับอนุญาตให้เผยแพร่แล้ว</label>
        <button type="submit" className="btn btn-primary">เผยแพร่ {p.policy_type} v{p.version}</button>
      </form>
    </section>)}
    <div className="info-panel">เมื่อตรวจเอกสารจริงและเผยแพร่ Seller Agreement แล้ว ให้เปิดรับสมัครจาก <Link href="/admin/seller-applications" className="text-link">หน้าการรับสมัครผู้ขาย</Link></div>
  </div>;
}
