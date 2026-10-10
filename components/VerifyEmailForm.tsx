'use client';

import {useEffect,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {MailCheck,ShieldCheck,RefreshCcw,ArrowRight} from 'lucide-react';
import {supabaseBrowser} from '@/lib/supabase/browser';
import {safeNextPath} from '@/lib/auth-routes';
import {OtpCodeInput} from '@/components/OtpCodeInput';

type Flow='signup'|'login'|'recovery';
const FLOW:{[F in Flow]:{title:string;description:string;action:string}}={
  signup:{title:'ยืนยันอีเมลของคุณ',description:'ยืนยันรหัส OTP แล้วใช้บัญชีผู้ซื้อได้ทันที ไม่ต้องเปิด MFA (เว้นแต่คุณเลือกเปิดเอง)',action:'ยืนยันและเข้าสู่ระบบ'},
  login:{title:'ตรวจสอบรหัสเข้าสู่ระบบ',description:'เราได้ส่งรหัสยืนยันสำหรับเข้าสู่ระบบไปยังอีเมลที่ระบุ',action:'ยืนยันและเข้าสู่ระบบ'},
  recovery:{title:'ยืนยันการกู้คืนบัญชี',description:'กรอกรหัสที่ได้รับเพื่อไปตั้งรหัสผ่านใหม่',action:'ยืนยันและตั้งรหัสผ่านใหม่'}
};

export function VerifyEmailForm({initialEmail='',next='/account',flow='signup'}:{initialEmail?:string;next?:string;flow?:Flow}){
  const router=useRouter();
  const [email,setEmail]=useState(initialEmail);
  const [code,setCode]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState(false);
  const [pending,setPending]=useState(false);
  const [cooldown,setCooldown]=useState(60);
  const client=supabaseBrowser();
  const copy=FLOW[flow];
  const destination=flow==='recovery'?'/reset-password':safeNextPath(next);

  useEffect(()=>{
    if(cooldown<=0)return;
    const timer=window.setTimeout(()=>setCooldown(seconds=>Math.max(0,seconds-1)),1000);
    return ()=>window.clearTimeout(timer);
  },[cooldown]);

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!client||pending||code.length!==6)return;
    setPending(true);setMessage('');setError(false);
    try{
      const {error:verifyError}=await client.auth.verifyOtp({email:email.trim(),token:code,type:flow==='login'?'email':flow});
      if(verifyError)throw verifyError;
      setCode('');
      router.replace(destination);router.refresh();
    }catch(err){
      setError(true);setMessage(err instanceof Error?err.message:'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาลองอีกครั้ง');
      setCode('');
    }finally{setPending(false)}
  }

  async function resend(){
    if(!client||pending||cooldown>0||!email.trim())return;
    setPending(true);setError(false);setMessage('');
    try{
      const address=email.trim();
      const redirectTo=`${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;
      const response=flow==='signup'
        ?await client.auth.resend({type:'signup',email:address,options:{emailRedirectTo:redirectTo}})
        :flow==='login'
          ?await client.auth.signInWithOtp({email:address,options:{shouldCreateUser:false,emailRedirectTo:redirectTo}})
          :await client.auth.resetPasswordForEmail(address,{redirectTo});
      if(response.error)throw response.error;
      setCooldown(60);setCode('');
      setMessage('หากอีเมลนี้สามารถรับรหัสได้ ระบบได้ดำเนินการส่งอีกครั้งแล้ว กรุณาตรวจ Inbox หรือ Spam');
    }catch(err){
      setError(true);setMessage(err instanceof Error?err.message:'ไม่สามารถส่งรหัสได้ กรุณาลองใหม่ภายหลัง');
    }finally{setPending(false)}
  }

  return <div className="container page-pad otp-page">
    <div className="otp-card">
      <div className="otp-halo" aria-hidden="true"><MailCheck size={34}/></div>
      <div className="eyebrow otp-eyebrow">TIDALIS • EMAIL SECURITY</div>
      <h1>{copy.title}</h1>
      <p className="otp-description">{copy.description}</p>
      <div className="otp-destination"><ShieldCheck size={15}/><span>{email||'กรอกอีเมลของคุณด้านล่าง'}</span></div>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="verify-email">ที่อยู่อีเมล</label>
        <input id="verify-email" type="email" required autoComplete="email" value={email} onChange={e=>{setEmail(e.target.value);setCode('')}} placeholder="you@example.com"/>
        <OtpCodeInput value={code} onChange={value=>{setCode(value);setError(false)}} disabled={pending} error={error}/>
        <button type="submit" className="btn btn-primary wide" disabled={!client||pending||code.length!==6||!email.trim()}>
          {pending?'กำลังตรวจสอบ...':copy.action}<ArrowRight size={16}/>
        </button>
      </form>
      <div className="otp-resend">
        <span>ยังไม่ได้รับอีเมล?</span>
        <button type="button" onClick={resend} disabled={!client||pending||cooldown>0||!email.trim()}>
          <RefreshCcw size={14}/>{cooldown>0?`ส่งใหม่ได้ใน ${cooldown} วินาที`:'ส่งรหัสอีกครั้ง'}
        </button>
      </div>
      {message&&<div className={'form-message'+(error?' otp-alert':'')} role={error?'alert':'status'}>{message}</div>}
      {!client&&<div className="form-message warning">ยังไม่เชื่อม Supabase Auth</div>}
      <p className="otp-help">รหัสใช้ได้เพียงระยะเวลาที่ Supabase กำหนด ไม่ควรแชร์รหัสนี้กับใคร</p>
      <Link className="otp-back" href="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
    </div>
  </div>;
}
