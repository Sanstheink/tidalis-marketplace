'use client';
import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {supabaseBrowser} from '@/lib/supabase/browser';
import {shopPolicyTypes} from '@/lib/policy-labels';

const BUCKET='tidalis-policy-documents';
const MAX_PDF=8*1024*1024;
type Draft={id:string;policy_type:string;status:string;source_type:string;content:string};
export function SellerPolicyComposer({shopId,existing,initialType='refund',fixedDraftId,compact=false}:{shopId:string;existing:Draft[];initialType?:string;fixedDraftId?:string;compact?:boolean}){
  const router=useRouter();
  const [policyType,setPolicyType]=useState(initialType);
  const [mode,setMode]=useState<'text'|'pdf'>(fixedDraftId?'pdf':'text');
  const [content,setContent]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const matched=existing.find(p=>p.policy_type===policyType&&['draft','under_review'].includes(p.status));
  const draft=fixedDraftId?existing.find(p=>p.id===fixedDraftId):matched;
  useEffect(()=>{if(!fixedDraftId){setContent(draft?.status==='draft'&&draft.source_type==='text'?draft.content:'');setFile(null);setMessage('');}},[policyType,fixedDraftId,draft?.id,draft?.status,draft?.source_type]);
  const modeConflict=Boolean(draft&&draft.source_type!==mode);
  const locked=Boolean(draft?.status==='under_review');
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(busy||locked||modeConflict)return;
    const client=supabaseBrowser();
    if(!client){setMessage('ยังไม่เชื่อม Supabase กรุณาตรวจ Environment Variables');return;}
    setBusy(true);setMessage('');
    try{
      if(mode==='text'){
        const text=content.trim();
        if(text.length<1||text.length>30000){setMessage('Draft ต้องมีข้อความ 1–30,000 ตัวอักษร (ส่งตรวจต้องอย่างน้อย 200)');return;}
        const {error}=await client.rpc('save_shop_policy_draft',{p_shop_id:shopId,p_policy_type:policyType,p_content:text,p_draft_id:draft?.id||null});
        if(error){setMessage(`บันทึกไม่ได้ (${error.code||'RPC'}): ${error.message}`);return;}
      }else{
        if(!file){setMessage('กรุณาเลือกไฟล์ PDF ก่อนบันทึก');return;}
        if(file.size===0||file.size>MAX_PDF||!file.name.toLowerCase().endsWith('.pdf')||(file.type!==''&&file.type!=='application/pdf')||file.name.length>160||/[\/\\]/.test(file.name)){
          setMessage('รองรับเฉพาะ PDF ขนาดไม่เกิน 8 MB และชื่อไฟล์ต้องสั้นกว่า 160 ตัวอักษร');return;
        }
        const magic=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
        if(magic!=='%PDF-'){setMessage('ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง');return;}
        const path=`shops/${shopId}/policies/${crypto.randomUUID()}.pdf`;
        const {error:uploadError}=await client.storage.from(BUCKET).upload(path,file,{contentType:'application/pdf',upsert:false,cacheControl:'120'});
        if(uploadError){setMessage(`อัปโหลดไม่สำเร็จ (${uploadError.statusCode||'Storage'}): ${uploadError.message} — ตรวจ Migration 007 และสิทธิ์ MFA`);return;}
        const {error:saveError}=await client.rpc('save_shop_policy_document_draft',{p_shop_id:shopId,p_policy_type:policyType,p_file_path:path,p_document_name:file.name,p_document_size:file.size,p_draft_id:draft?.id||null});
        if(saveError){
          await client.storage.from(BUCKET).remove([path]);
          setMessage('เพิ่มเอกสารไม่สำเร็จ กรุณาตรวจสถานะฉบับร่างและลองใหม่');
          return;
        }
      }
      setFile(null);setMessage('บันทึก Draft สำเร็จ (ยังไม่เผยแพร่)');
      router.refresh();
    }catch(error){setMessage(error instanceof Error?`การเชื่อมต่อผิดพลาด: ${error.message}`:'การเชื่อมต่อผิดพลาด โปรดลองอีกครั้ง');}
    finally{setBusy(false);}
  }
  return <form onSubmit={e=>void save(e)} className="phase4-action-form">
    {!fixedDraftId&&<><label htmlFor={compact?'policy-edit-type':'policy-create-type'}>ประเภทนโยบาย</label>
      <select id={compact?'policy-edit-type':'policy-create-type'} value={policyType} onChange={e=>setPolicyType(e.target.value)} disabled={busy}>
        {shopPolicyTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
      </select></>}
    {!fixedDraftId&&<><label>รูปแบบเอกสาร</label><div className="policy-mode-switch">
      <label><input type="radio" name="policy-source" checked={mode==='text'} onChange={()=>setMode('text')} disabled={busy}/> เขียนเองในเว็บไซต์</label>
      <label><input type="radio" name="policy-source" checked={mode==='pdf'} onChange={()=>setMode('pdf')} disabled={busy}/> แนบเอกสาร PDF</label>
    </div></>}
    {locked&&<p role="alert" className="form-message">มีฉบับส่งตรวจอยู่แล้ว กรุณารอผลก่อนสร้างหรือแก้ไข</p>}
    {modeConflict&&<p role="alert" className="form-message">ประเภทนี้มี Draft แบบ {draft?.source_type==='pdf'?'PDF':'เขียนเอง'} อยู่แล้ว โปรดแก้ฉบับเดิมด้วยรูปแบบเดิมหรือส่งตรวจให้เสร็จก่อน</p>}
    {draft?.status==='draft'&&!modeConflict&&<p className="phase5-help">มี Draft v{draft.id.slice(0,8)} อยู่แล้ว การกดบันทึกจะปรับปรุงฉบับเดิม ไม่สร้างซ้ำ</p>}
    {mode==='text'?<><label htmlFor="shop-policy-composer-text">ข้อความนโยบาย Draft (1–30,000 ตัวอักษร; ส่งตรวจต้องอย่างน้อย 200)</label>
      <textarea id="shop-policy-composer-text" rows={compact?8:12} minLength={1} maxLength={30000} value={content} onChange={e=>setContent(e.target.value)} disabled={busy||locked||modeConflict} placeholder="ระบุขอบเขต เงื่อนไข ข้อยกเว้น และช่องทางติดต่อให้ชัดเจน" required/></>:
      <><label htmlFor={fixedDraftId?`policy-pdf-${fixedDraftId}`:'shop-policy-pdf'}>แนบเอกสาร PDF (สูงสุด 8 MB)</label>
        <input type="file" id={fixedDraftId?`policy-pdf-${fixedDraftId}`:'shop-policy-pdf'} accept=".pdf,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)} disabled={busy||locked||modeConflict} required/>
        <p className="phase5-help">เอกสารจะอยู่ใน Private Storage จนกว่าจะผ่านการตรวจและร้านเปิดใช้งาน; ไม่รองรับ Word/DOCX เพื่อหลีกเลี่ยงความคลาดเคลื่อนจากการแปลงเอกสาร</p></>}
    <button type="submit" className="btn btn-outline" disabled={busy||locked||modeConflict}>{busy?'กำลังบันทึก…':draft?'บันทึกการแก้ไข Draft':'บันทึก Draft'}</button>
    {message&&<p role="status" className="phase5-message">{message}</p>}
  </form>;
}
