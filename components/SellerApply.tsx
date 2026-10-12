'use client';
import Link from 'next/link';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
import {supabaseBrowser} from '@/lib/supabase/browser';

type PublishedPolicy={id:string;version:number;title:string};
type Existing={id:string;shop_name:string;requested_slug:string;portfolio_url:string;description:string;review_note:string|null};
export function SellerApply({policy,enabled,existing,selfService=false}:{policy:PublishedPolicy|null;enabled:boolean;existing?:Existing;selfService?:boolean}){
  const [name,setName]=useState(existing?.shop_name||'');
  const [slug,setSlug]=useState(existing?.requested_slug||'');
  const [portfolio,setPortfolio]=useState(existing?.portfolio_url||'');
  const [about,setAbout]=useState(existing?.description||'');
  const [agree,setAgree]=useState(false);
  const [error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const router=useRouter();
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!enabled||!policy||!agree){setError('Seller Agreement ยังไม่พร้อม หรือคุณยังไม่ได้ยอมรับข้อตกลง');return;}
    const client=supabaseBrowser();
    if(!client){setError('ไม่สามารถเชื่อมต่อระบบสมาชิกได้');return;}
    setError('');setSubmitting(true);
    try{
      const params={p_shop_name:name.trim(),p_requested_slug:slug.trim(),
        p_portfolio_url:portfolio.trim(),p_description:about.trim(),p_agreement_version_id:policy.id};
      const {error:rpcError}=existing
        ?await client.rpc('resubmit_seller_application',{p_application_id:existing.id,...params})
        :await client.rpc('submit_seller_application',params);
      if(rpcError)throw rpcError;
      router.push(selfService?'/workspace?notice=shop-opened':'/sell/application?updated=1');router.refresh();
    }catch(e){
      setError(e instanceof Error?e.message:'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
    }finally{setSubmitting(false);}
  }
  return <form className="seller-apply panel phase4-form" onSubmit={submit}>
    <div className="eyebrow">SELLER ONBOARDING</div>
    <h2>{existing?'แก้ไขใบสมัครร้าน':'สมัครเปิดร้าน Tidalis'}</h2>
    <p>{selfService?'กรอกข้อมูลร้านและยอมรับข้อตกลง แล้วระบบจะเปิดร้านให้บัญชีของคุณ ตั้งค่า Authenticator ก่อนจัดการสินค้า':'กรอกข้อมูลให้ครบ ทีมงานจะตรวจสอบ Portfolio และข้อตกลงก่อนอนุมัติ'}</p>
    {existing?.review_note&&<div className="phase4-review-note"><strong>ข้อความจากผู้ตรวจสอบ</strong><p>{existing.review_note}</p></div>}
    <label htmlFor="seller-shop-name">ชื่อร้าน</label>
    <input id="seller-shop-name" value={name} onChange={e=>setName(e.target.value)} minLength={3} maxLength={100} required placeholder="ชื่อ Studio หรือแบรนด์" />
    <label htmlFor="seller-shop-slug">URL ของร้าน</label>
    <div className="phase4-url-input"><span>marketplace.tidalis.site/shops/</span>
      <input id="seller-shop-slug" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}
        minLength={3} maxLength={50} pattern="[a-z0-9-]{3,50}" required placeholder="your-studio"/></div>
    <label htmlFor="seller-portfolio">ลิงก์ Portfolio (HTTPS)</label>
    <input id="seller-portfolio" type="url" value={portfolio} onChange={e=>setPortfolio(e.target.value)} maxLength={800} required placeholder="https://www.behance.net/yourart" pattern="https://.*" />
    <label htmlFor="seller-description">เกี่ยวกับงานและร้านของคุณ</label>
    <textarea id="seller-description" rows={6} value={about} onChange={e=>setAbout(e.target.value)} minLength={30} maxLength={4000}
      required placeholder="ประเภทงานที่รับวาด ตัวอย่างผลงาน ประสบการณ์ และความเชี่ยวชาญ (อย่างน้อย 30 ตัวอักษร)"/>
    <div className="phase4-agreement">
      <div className="eyebrow">LEGAL AGREEMENT</div>
      {policy?<><strong>{policy.title}</strong><span>เวอร์ชัน {policy.version} • เผยแพร่แล้ว</span>
        <Link className="text-link" href="/policies/seller-agreement" target="_blank" rel="noopener noreferrer">อ่านข้อตกลงฉบับเต็ม ↗</Link></>
        :<p>ยังไม่มี Seller Agreement ที่ผ่านการรับรองและเผยแพร่</p>}
      <label className="checkbox-label"><input type="checkbox" required checked={agree} disabled={!enabled}
        onChange={e=>setAgree(e.target.checked)}/>
        ฉันได้อ่านและยอมรับ Seller Agreement เวอร์ชันที่ระบุข้างต้น</label>
    </div>
    {error&&<div className="form-message" role="alert">{error}</div>}
    <button className="btn btn-primary wide" disabled={!enabled||!agree||submitting||!policy}>
      {submitting?'กำลังส่งใบสมัคร…':selfService?(existing?'บันทึกข้อมูลและเปิดร้าน':'เปิดร้านของฉัน'):existing?'ส่งข้อมูลใหม่ให้ตรวจสอบ':'ส่งคำขอเปิดร้าน'}</button>
    <small>{enabled?(selfService?'ระบบเปิดร้านเมื่อข้อมูลและข้อตกลงครบ ตั้งค่า Authenticator ก่อนจัดการสินค้า':'การส่งใบสมัครไม่ได้ทำให้เปิดร้านทันที'):'ระบบรับสมัครจริงยังปิดอยู่จนกว่านโยบายและการเปิดรับสมัครจะพร้อม'}</small>
  </form>;
}
