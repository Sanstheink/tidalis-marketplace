import {requireSeller} from '@/lib/auth';
import {saveShopPolicy,submitShopPolicy} from './actions';
import {shopPolicyTypes,shopPolicyLabel} from '@/lib/policy-labels';

export const dynamic='force-dynamic';
const messages:Record<string,string>={
  invalid:'กรุณาตรวจประเภทและข้อความนโยบาย (200–30,000 ตัวอักษร)',
  'role-denied':'เฉพาะเจ้าของหรือผู้จัดการร้านเท่านั้นที่แก้ไขนโยบายได้',
  'save-failed':'บันทึกไม่สำเร็จ ตรวจสิทธิ์ MFA/SQL Migration 006 หรืออาจมี Draft ที่ต้องแก้ไขอยู่แล้ว',
  'submit-failed':'ส่งตรวจไม่สำเร็จ กรุณาตรวจสถานะและ MFA',
  saved:'บันทึกฉบับร่างแล้ว ยังไม่เผยแพร่',submitted:'ส่งนโยบายให้ Admin ตรวจสอบแล้ว',
};
export default async function SellerPolicies({searchParams}:{searchParams:Promise<{result?:string}>}){
  const {client,member}=await requireSeller();
  const {data,error}=await client.from('shop_policy_versions')
    .select('id,policy_type,version,content,status,created_at,review_note,review_outcome,reviewed_at,published_at')
    .eq('shop_id',member.shop_id).order('created_at',{ascending:false}).limit(120);
  const {result}=await searchParams;
  const canEdit=['owner','manager'].includes(member.role);
  const latestPublished=new Set((data||[]).filter(p=>p.status==='published').map(p=>p.policy_type));
  return <div className="container page-pad policy-manager-page">
    <div className="page-heading"><div className="eyebrow">SELLER / POLICY STUDIO</div><h1>Shop <em>policies.</em></h1>
      <p>เขียนนโยบายของร้าน บันทึกเวอร์ชัน และส่งให้ผู้ดูแลตรวจ ก่อนเผยแพร่ต่อผู้ซื้อ</p></div>
    <div className="legal-alert">นโยบายร้านต้องไม่ขัดกับกฎหมายหรือนโยบายแพลตฟอร์ม เงื่อนไขที่เผยแพร่แล้วจะถูกเก็บเป็นประวัติและไม่แก้ย้อนหลัง ร้านยังไม่เปิดขายอัตโนมัติหลังอนุมัตินโยบาย</div>
    {result&&messages[result]&&<div role="status" className="phase4-alert">{messages[result]}</div>}
    {error&&<div role="alert" className="form-message">โหลดข้อมูลนโยบายร้านไม่สำเร็จ กรุณาตรวจ Migration 006 และ RLS</div>}
    <div className="policy-readiness"><h2>ความพร้อมด้านนโยบายร้าน</h2><div className="policy-readiness-grid">
      {shopPolicyTypes.filter(t=>t.value!=='other').map(t=><div className="policy-readiness-item" key={t.value}><strong>{t.short}</strong><span>{latestPublished.has(t.value)?'เผยแพร่แล้ว':'ยังไม่เผยแพร่'}</span></div>)}
    </div></div>
    {canEdit&&<section className="phase4-card"><div className="eyebrow">NEW DRAFT / VERSIONED</div><h2>สร้างนโยบายร้านฉบับใหม่</h2>
      <p>ไม่ต้องสร้างใหม่หากมี Draft อยู่แล้ว ให้แก้ไขจากรายการด้านล่างแทน</p>
      <form action={saveShopPolicy} className="phase4-action-form">
        <label htmlFor="policy-type">ประเภทนโยบาย</label><select id="policy-type" name="policy_type" required>{shopPolicyTypes.map(t=><option value={t.value} key={t.value}>{t.label}</option>)}</select>
        <label htmlFor="policy-content">ข้อความนโยบาย (200–30,000 ตัวอักษร)</label>
        <textarea id="policy-content" name="content" minLength={200} maxLength={30000} rows={12} required placeholder="ใส่ข้อความนโยบายจริงของร้าน ระบุเงื่อนไขให้ชัดเจน…"/>
        <button className="btn btn-outline" type="submit">บันทึก Draft</button>
      </form></section>}
    <section className="section"><div className="section-top"><div><h2>เวอร์ชันนโยบายของร้าน</h2><p>สถานะและประวัติการส่งตรวจ</p></div></div>
      {data?.length?<div className="policy-version-list">{data.map(p=><article key={p.id} className="phase4-card policy-version-card">
        <div className="policy-version-head"><h3>{shopPolicyLabel(p.policy_type)} · v{p.version}</h3><span className="status-chip">{p.status}</span></div>
        {p.review_outcome&&p.status==='draft'&&<p role="status"><strong>ผลตรวจ: {p.review_outcome==='rejected'?'ไม่อนุมัติ':'ขอให้แก้ไข'}</strong> — {p.review_note}</p>}
        {p.status==='published'&&<p>เผยแพร่เมื่อ {p.published_at?new Date(p.published_at).toLocaleDateString('th-TH'):'—'}</p>}
        {p.status==='under_review'&&<p>รอ Admin ตรวจสอบ · ยังไม่เผยแพร่</p>}
        <details><summary>ดูข้อความฉบับนี้</summary><div className="phase4-policy-body">{p.content}</div></details>
        {canEdit&&p.status==='draft'&&<div className="policy-draft-actions">
          <form action={saveShopPolicy} className="phase4-action-form">
            <input type="hidden" name="draft_id" value={p.id}/><input type="hidden" name="policy_type" value={p.policy_type}/>
            <label htmlFor={`draft-${p.id}`}>แก้ไข Draft v{p.version}</label>
            <textarea id={`draft-${p.id}`} name="content" rows={8} minLength={200} maxLength={30000} defaultValue={p.content} required/>
            <button className="btn btn-outline" type="submit">บันทึกการแก้ไข</button>
          </form>
          <form action={submitShopPolicy}><input type="hidden" name="id" value={p.id}/><button className="btn btn-primary" type="submit">ส่งให้ Admin ตรวจสอบ</button></form>
        </div>}
      </article>)}</div>:!error&&<div className="empty-state">ยังไม่มีนโยบายร้าน เริ่มสร้าง Refund, Delivery และ License Policy</div>}
    </section>
  </div>;
}
