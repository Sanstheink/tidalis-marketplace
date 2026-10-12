import Link from 'next/link';
import {requireSeller} from '@/lib/auth';
import {sellerAccessMode} from '@/lib/seller-access';
import {saveShopPolicy,submitShopPolicy} from './actions';
import {shopPolicyTypes,shopPolicyLabel} from '@/lib/policy-labels';
import {SellerPolicyComposer} from '@/components/SellerPolicyComposer';

export const dynamic='force-dynamic';
const BUCKET='tidalis-policy-documents';
const messages:Record<string,string>={
  invalid:'กรุณาตรวจประเภทและข้อความ Draft (1–30,000 ตัวอักษร)',
  'role-denied':'เฉพาะเจ้าของหรือผู้จัดการร้านเท่านั้นที่แก้ไขนโยบายได้',
  'save-failed':'บันทึกไม่สำเร็จ ตรวจสิทธิ์ผู้ขาย การลงทะเบียน MFA และ Migration 009 (รายละเอียดอยู่ใน Vercel Logs)',
  'submit-failed':'ส่งตรวจไม่สำเร็จ กรุณาตรวจสถานะนโยบายและ MFA',
  published:'เผยแพร่นโยบายร้านแล้ว',
  'confirmation-required':'กรุณายืนยันว่าตรวจนโยบายจริงก่อนเผยแพร่',saved:'บันทึกฉบับร่างแล้ว ยังไม่เผยแพร่',submitted:'ส่งนโยบายให้ Admin ตรวจสอบแล้ว',
};
export default async function SellerPolicies({searchParams}:{searchParams:Promise<{result?:string}>}){
  const {client,member}=await requireSeller();
  const mode=await sellerAccessMode(client);
  const {data,error}=await client.from('shop_policy_versions')
    .select('id,policy_type,version,content,status,source_type,document_path,document_name,document_size,created_at,review_note,review_outcome,reviewed_at,published_at')
    .eq('shop_id',member.shop_id).order('created_at',{ascending:false}).limit(120);
  const {result}=await searchParams;
  const {data:assurance}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const elevated=assurance?.currentLevel==='aal2';
  const canEdit=['owner','manager'].includes(member.role);
  const latestPublished=new Set((data||[]).filter(p=>p.status==='published').map(p=>p.policy_type));
  const existing=(data||[]).map(p=>({id:p.id,policy_type:p.policy_type,status:p.status,source_type:p.source_type,content:p.content}));
  const links=new Map<string,string>();
  await Promise.all((data||[]).filter(p=>p.source_type==='pdf'&&p.document_path).map(async p=>{
    const {data:signed,error:signError}=await client.storage.from(BUCKET).createSignedUrl(p.document_path!,300,{download:p.document_name||'shop-policy.pdf'});
    if(!signError&&signed?.signedUrl)links.set(p.id,signed.signedUrl);
  }));
  return <div className="container page-pad policy-manager-page">
    <div className="page-heading"><div className="eyebrow">SELLER / POLICY STUDIO</div><h1>Shop <em>policies.</em></h1>
      <p>เขียนข้อความหรือแนบ PDF ตรวจเนื้อหา แล้วเผยแพร่เงื่อนไขร้านของคุณได้เอง</p></div>
    <div className="legal-alert">นโยบายร้านต้องไม่ขัดกับกฎหมายหรือนโยบายแพลตฟอร์ม ไฟล์ PDF ถูกเก็บเป็น Private และเผยแพร่เฉพาะฉบับที่เผยแพร่แล้วและร้านเปิดใช้งานเท่านั้น</div>
    {result&&messages[result]&&<div role="status" className="phase4-alert">{messages[result]}</div>}
    {error&&<div role="alert" className="form-message">โหลดข้อมูลนโยบายร้านไม่สำเร็จ: {error.code||'DATABASE'} — ตรวจ Migration 007 และ RLS ก่อนบันทึก</div>}
    <div className="policy-readiness"><h2>ความพร้อมด้านนโยบายร้าน</h2><div className="policy-readiness-grid">
      {shopPolicyTypes.filter(t=>t.value!=='other').map(t=><div className="policy-readiness-item" key={t.value}><strong>{t.short}</strong><span>{latestPublished.has(t.value)?'เผยแพร่แล้ว':'ยังไม่เผยแพร่'}</span></div>)}
    </div></div>
    {canEdit&&!error&&<section className="phase4-card"><div className="eyebrow">NEW DRAFT / VERSIONED</div><h2>สร้างหรือแก้ไขนโยบายร้าน</h2>
      <p>เลือกเขียนข้อความหรือแนบ PDF ได้เลย หากมี Draft ประเภทเดียวกัน ระบบจะปรับปรุงฉบับเดิมแทนการสร้างซ้ำ</p>
      <SellerPolicyComposer shopId={member.shop_id} existing={existing}/>
    </section>}
    <section className="section"><div className="section-top"><div><h2>เวอร์ชันนโยบายของร้าน</h2><p>สถานะและประวัติการส่งตรวจ</p></div></div>
      {data?.length?<div className="policy-version-list">{data.map(p=><article key={p.id} className="phase4-card policy-version-card">
        <div className="policy-version-head"><h3>{shopPolicyLabel(p.policy_type)} · v{p.version}</h3><span className="status-chip">{p.status}</span></div>
        {p.review_outcome&&p.status==='draft'&&<p role="status"><strong>ผลตรวจ: {p.review_outcome==='rejected'?'ไม่อนุมัติ':'ขอให้แก้ไข'}</strong> — {p.review_note}</p>}
        {p.status==='published'&&<p>เผยแพร่เมื่อ {p.published_at?new Date(p.published_at).toLocaleDateString('th-TH'):'—'}</p>}
        {p.status==='under_review'&&<><p>{mode.selfService?'ยังไม่เผยแพร่ คุณตรวจข้อมูลและเผยแพร่เองได้':'รอ Admin ตรวจสอบ · ยังไม่เผยแพร่'}</p>{mode.selfService&&canEdit?<form action={submitShopPolicy}><input name="id" value={p.id} type="hidden"/><label className="operations-check"><input name="confirmed" value="yes" type="checkbox" required/> ฉันตรวจนโยบายฉบับนี้แล้ว</label><button className="btn btn-primary" type="submit" disabled={!elevated||!mode.available}>เผยแพร่นโยบายเลย</button></form>:null}</>}
        {p.source_type==='pdf'?<p><strong>เอกสาร PDF:</strong> {p.document_name||'ไม่ทราบชื่อไฟล์'} {links.get(p.id)?<a className="btn btn-outline" href={links.get(p.id)} target="_blank" rel="noopener noreferrer">ดาวน์โหลดเพื่อตรวจเอกสาร ↗</a>:<span>ไม่สามารถสร้างลิงก์ดาวน์โหลดได้ (ตรวจ Storage Policy)</span>}</p>
          :<details><summary>ดูข้อความฉบับนี้</summary><div className="phase4-policy-body">{p.content}</div></details>}
        {canEdit&&p.status==='draft'&&<div className="policy-draft-actions">
          {p.source_type==='pdf'?<div><h4>อัปเดต PDF ฉบับร่าง</h4><SellerPolicyComposer shopId={member.shop_id} existing={existing} initialType={p.policy_type} fixedDraftId={p.id} compact/></div>:
          <form action={saveShopPolicy} className="phase4-action-form">
            <input type="hidden" name="draft_id" value={p.id}/><input type="hidden" name="policy_type" value={p.policy_type}/>
            <label htmlFor={`draft-${p.id}`}>แก้ไข Draft v{p.version}</label>
            <textarea id={`draft-${p.id}`} name="content" rows={8} minLength={1} maxLength={30000} defaultValue={p.content} required/>
            <button className="btn btn-outline" type="submit">บันทึกการแก้ไข</button>
          </form>}
          {!elevated&&<p><Link className="text-link" href="/mfa?next=%2Fseller%2Fpolicies">ยืนยัน Authenticator ก่อนเผยแพร่นโยบาย →</Link></p>}
          <form action={submitShopPolicy}><input type="hidden" name="id" value={p.id}/>{mode.selfService?<label className="operations-check"><input name="confirmed" value="yes" type="checkbox" required/> ฉันอ่านและตรวจนโยบายฉบับนี้ครบแล้ว</label>:null}<button className="btn btn-primary" type="submit" disabled={!elevated||!mode.available}>{mode.selfService?'เผยแพร่นโยบายร้าน':'ส่งให้ Admin ตรวจสอบ'}</button></form>
        </div>}
      </article>)}</div>:!error&&<div className="empty-state">ยังไม่มีนโยบายร้าน เริ่มสร้าง Refund, Delivery และ License Policy</div>}
    </section>
  </div>;
}
