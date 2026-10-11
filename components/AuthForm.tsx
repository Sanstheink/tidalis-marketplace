'use client';

import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Eye,EyeOff,LockKeyhole,ArrowRight,AlertCircle,Mail} from 'lucide-react';
import {supabaseBrowser} from '@/lib/supabase/browser';
import {safeNextPath} from '@/lib/auth-routes';

export function AuthForm({mode,next='/account',initialError}:{mode:'login'|'register';next?:string;initialError?:string}){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [show,setShow]=useState(false);
  const [passwordless,setPasswordless]=useState(false);
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState(initialError?'ลิงก์ยืนยันใช้ไม่ได้หรือหมดอายุ กรุณาลองอีกครั้ง':'');
  const client=supabaseBrowser();
  const destination=safeNextPath(next);

  async function submit(event:FormEvent){
    event.preventDefault();setMessage('');
    if(!client){setMessage('ยังไม่ได้เชื่อม Supabase กรุณาตั้งค่า Environment Variables');return}
    setPending(true);
    try{
      if(mode==='login'){
        if(passwordless){
          const {error}=await client.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`}});
          if(error)throw error;
          router.push(`/verify-email?flow=login&email=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(destination)}`);
        }else{
          const {error}=await client.auth.signInWithPassword({email:email.trim(),password});
          if(error)throw error;
          router.push(destination);router.refresh();
        }
      }else{
        const name=username.trim().toLowerCase();
        if(!/^[a-z0-9_]{3,30}$/.test(name))throw Error('ชื่อผู้ใช้ต้องใช้ a-z, 0-9 หรือ _ จำนวน 3–30 ตัวอักษร');
        const {error}=await client.auth.signUp({email:email.trim(),password,options:{data:{username:name},emailRedirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`}});
        if(error)throw error;
        router.push(`/verify-email?flow=signup&email=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(destination)}`);
      }
    }catch(err){setMessage(err instanceof Error?err.message:'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง')}
    finally{setPending(false)}
  }

  async function google(){
    if(!client){setMessage('ยังไม่ได้เชื่อม Supabase');return}
    setPending(true);
    const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`}});
    if(error){setMessage(error.message);setPending(false)}
  }

  return <div className="auth-shell">
    <div className="auth-art"><div className="auth-art-core">☾</div><div className="eyebrow">THE ART OF POSSIBILITY</div><h2>Every creator<br/>has a <em>story.</em></h2><p>Join the creative world of Marketplace Tidalis.</p></div>
    <div className="auth-card">
      <Link href="/" className="auth-logo"><img src="/brand/tidalis-horizontal.png" alt="Tidalis"/></Link>
      <div className="eyebrow">YOUR CREATIVE SPACE</div>
      <h1>{mode==='login'?'Welcome back.':'Create your account.'}</h1>
      <p>{mode==='login'?'เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน หรือรับรหัส OTP ทางอีเมล':'สมัครสมาชิกเป็นผู้ซื้อได้ทันทีหลังยืนยันอีเมล โดยไม่ต้องตั้งค่า MFA'}</p>
      <div className="info-panel" role="note">MFA เป็นทางเลือกสำหรับบัญชีผู้ซื้อ แต่จำเป็นก่อนเข้า Seller Studio หรือ Admin Console ตามสิทธิ์ที่ได้รับ</div>
      {!client&&<div className="form-message warning">ยังไม่ได้เชื่อม Supabase Auth</div>}
      {message&&<div role="alert" className="form-message"><AlertCircle size={16}/>{message}</div>}
      {mode==='login'&&<div className="auth-mode-switch" role="group" aria-label="เลือกวิธีเข้าสู่ระบบ">
        <button type="button" className={!passwordless?'active':''} aria-pressed={!passwordless} onClick={()=>setPasswordless(false)} disabled={pending}><LockKeyhole size={15}/> รหัสผ่าน</button>
        <button type="button" className={passwordless?'active':''} aria-pressed={passwordless} onClick={()=>setPasswordless(true)} disabled={pending}><Mail size={15}/> Email OTP</button>
      </div>}
      <form className="auth-form" onSubmit={submit}>
        {mode==='register'&&<><label htmlFor="username">ชื่อผู้ใช้ (สำหรับแสดงบนเว็บ)</label><input id="username" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_]{3,30}" value={username} onChange={e=>setUsername(e.target.value)} placeholder="tidalis_artist" autoComplete="username"/></>}
        <label htmlFor="email">อีเมล</label><input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/>
        {(mode==='register'||!passwordless)&&<><label htmlFor="password">รหัสผ่าน</label><div className="password-box"><input id="password" type={show?'text':'password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" autoComplete={mode==='login'?'current-password':'new-password'}/><button type="button" onClick={()=>setShow(!show)} aria-label="แสดงรหัสผ่าน">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></>}
        <button type="submit" disabled={pending||!client} className="btn btn-primary wide">{pending?'กำลังดำเนินการ...':mode==='register'?'สมัครสมาชิก':passwordless?'ส่งรหัส OTP ทางอีเมล':'เข้าสู่ระบบ'} <ArrowRight size={17}/></button>
      </form>
      <div className="auth-separator">หรือเข้าสู่ระบบด้วย</div>
      <button type="button" className="btn btn-outline wide" onClick={google} disabled={pending||!client}>Google Account</button>
      {mode==='login'&&<p className="auth-switch"><Link href="/forgot-password">ลืมรหัสผ่าน?</Link></p>}
      <p className="auth-switch">{mode==='login'?'ยังไม่มีบัญชี?':'มีบัญชีแล้ว?'} <Link href={mode==='login'?'/register':'/login'}>{mode==='login'?'สมัครสมาชิก':'เข้าสู่ระบบ'}</Link></p>
      <div className="auth-security"><LockKeyhole size={15}/> Secured by Supabase Authentication</div>
      <p className="auth-privacy">โปรดอ่าน <Link href="/policies/terms">ข้อกำหนดการใช้บริการ</Link> และ <Link href="/policies/privacy">นโยบายความเป็นส่วนตัว</Link> (ฉบับร่างระหว่างพัฒนา)</p>
    </div>
  </div>;
}
