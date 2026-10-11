import Link from 'next/link';
import {requirePlatformAdmin} from '@/lib/auth';
import {shopPolicyLabel} from '@/lib/policy-labels';
import {reviewShopPolicy} from './actions';
export const dynamic='force-dynamic';
const BUCKET='tidalis-policy-documents';
const messages:Record<string,string>={invalid:'กรุณาตรวจเหตุผลการตัดสินใจและยืนยันการตรวจเนื้อหา', 'review-failed':'ดำเนินการไม่สำเร็จ ตรวจ Migration, MFA และสถานะนโยบาย',reviewed:'บันทึกผลการตรวจสอบแล้ว'};
export default async function AdminShopPolicies({searchParams}:{searchParams:Promise<{result?:string}>}){
  const {client}=await requirePlatformAdmin('/admin/shop-policies');
  const {data,error}=await client.from('shop_policy_versions')
    .select('id,shop_id,policy_type,version,content,source_type,document_path,document_name,status,created_at,submitted_at,shops(name,slug,status)')
    .eq('status','under_review').order('submitted_at',{ascending:true}).limit(100);
  const links=new Map<string,string>();
  await Promise.all((data||[]).filter(p=>p.source_type==='pdf'&&p.document_path).map(async p=>{
    const {data:signed,error:signError}=await client.storage.from(BUCKET).createSignedUrl(p.document_path!,300,{download:p.document_name||'shop-policy.pdf'});
    if(!signError&&signed?.signedUrl)links.set(p.id,signed.signedUrl);
  }));
  const {result}=await searchParams;
  return <div className="container page-pad policy-manager-page">
    <div className="page-heading"><div className="eyebrow">ADMIN / SHOP POLICY REVIEW</div>
      <h1>Review <em>shop policies.</em></h1><p>ตรวจนโยบายแบบข้อความหรือ PDF ให้ครบทุกข้อ ก่อนเผยแพร่</p></div>
    <div className="legal-alert">โปรดอ่านฉบับเต็ม ตรวจความสอดคล้องกับนโยบายแพลตฟอร์มและกฎหมายก่อนอนุมัติ เอกสารนี้ไม่มีระบบสแกนมัลแวร์อัตโนมัติ อย่าดาวน์โหลดไฟล์ที่ไม่น่าเชื่อถือบนอุปกรณ์สำคัญ</div>
    <p><Link className="back-link" href="/admin/policies">← จัดการนโยบายแพลตฟอร์ม</Link></p>
    {result&&messages[result]&&<div role="status" className="phase4-alert">{messages[result]}</div>}
    {error&&<div role="alert" className="form-message">โหลดคำขอไม่ได้ กรุณาตรวจ RLS/SQL Migration 007</div>}
    {data?.length?<div className="policy-version-list">{data.map(p=>{const shop=Array.isArray(p.shops)?p.shops[0]:p.shops;return <article className="phase4-card policy-version-card" key={p.id}>
      <div className="eyebrow">SHOP POLICY REVIEW / v{p.version}</div>
      <h2>{shopPolicyLabel(p.policy_type)}</h2>
      <p>ร้าน: {shop?.name||p.shop_id} · ส่งตรวจ {p.submitted_at?new Date(p.submitted_at).toLocaleDateString('th-TH'):'—'}</p>
      {p.source_type==='pdf'?<p><strong>เอกสาร PDF:</strong> {p.document_name||'ไม่ระบุ'} {links.get(p.id)?<a className="btn btn-outline" href={links.get(p.id)} target="_blank" rel="noopener noreferrer">ดาวน์โหลด PDF เพื่อตรวจ ↗</a>:<span role="alert">ไม่สามารถเข้าถึงเอกสารได้ — ห้ามอนุมัติจนกว่าจะแก้ Storage Policy</span>}</p>:
      <details className="phase4-policy-preview"><summary>อ่านนโยบายฉบับเต็มที่ร้านส่งตรวจ</summary><div className="phase4-policy-body">{p.content}</div></details>}
      <form action={reviewShopPolicy} className="phase4-action-form">
        <input type="hidden" name="id" value={p.id}/>
        <label htmlFor={`decision-${p.id}`}>ผลการตรวจสอบ</label>
        <select id={`decision-${p.id}`} name="decision" required defaultValue="changes_requested">
          <option value="changes_requested">ขอแก้ไขและส่งตรวจใหม่</option>
          <option value="rejected">ไม่อนุมัติฉบับนี้</option>
          <option value="approved" disabled={p.source_type==='pdf'&&!links.get(p.id)}>อนุมัติและเผยแพร่</option>
        </select>
        <label htmlFor={`review-note-${p.id}`}>เหตุผลหรือบันทึกการตรวจ (กรณีขอแก้ไข/ไม่อนุมัติต้องอย่างน้อย 12 ตัวอักษร)</label>
        <textarea id={`review-note-${p.id}`} name="review_note" rows={3} maxLength={1500} placeholder="อธิบายส่วนที่ต้องแก้ไข หรือลงบันทึกการตรวจสอบ"/>
        <label className="checkbox-label"><input name="reviewed" type="checkbox" value="yes"/>ยืนยันว่าตรวจเอกสารฉบับเต็มแล้วและมีอำนาจอนุมัติให้เผยแพร่ (บังคับเมื่อเลือกอนุมัติ)</label>
        <button type="submit" className="btn btn-primary">บันทึกผลตรวจ</button>
      </form>
    </article>})}</div>:!error&&<div className="empty-state">ไม่มีนโยบายร้านรอตรวจในขณะนี้</div>}
  </div>;
}
