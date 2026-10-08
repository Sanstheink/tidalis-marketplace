'use client';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {supabaseBrowser} from '@/lib/supabase/browser';

export function PasswordRecovery({mode}:{mode:'request'|'reset'}){
 const router=useRouter();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [pending,setPending]=useState(false);const [status,setStatus]=useState('');const [done,setDone]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setPending(true);setStatus('');const client=supabaseBrowser();if(!client){setStatus('ยังไม่ได้เชื่อม Supabase');setPending(false);return}
  if(mode==='request'){
   const {error}=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`});
   // Keep the message neutral to avoid leaking which emails are registered.
   setStatus(error?'ส่งลิงก์ไม่ได้ในขณะนี้ กรุณาลองอีกครั้ง':'หากอีเมลนี้มีบัญชีอยู่ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้');setDone(!error);
  }else{
   if(password.length<8||password!==confirm){setStatus('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษรและตรงกันทั้งสองช่อง');setPending(false);return}
   const {data:{user},error:authError}=await client.auth.getUser();
   if(authError||!user){setStatus('ลิงก์กู้คืนไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่');setPending(false);return}
   const {error}=await client.auth.updateUser({password});if(error)setStatus(error.message);else{await client.auth.signOut();setDone(true);router.refresh();setStatus('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง')}
  }
  setPending(false);
 }
 return <div className="container page-pad"><div className="simple-form"><div className="eyebrow">ACCOUNT RECOVERY</div><h1>{mode==='request'?'ลืมรหัสผ่าน':'ตั้งรหัสผ่านใหม่'}</h1><p>{mode==='request'?'ระบุอีเมลที่ใช้สมัคร เพื่อรับลิงก์กู้คืนบัญชี':'ใช้รหัสผ่านใหม่ที่ไม่เคยใช้กับบริการอื่น'}</p>{!done&&<form onSubmit={submit} className="auth-form">{mode==='request'?<><label htmlFor="recovery-email">อีเมล</label><input id="recovery-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></>:<><label htmlFor="new-password">รหัสผ่านใหม่</label><input id="new-password" type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><label htmlFor="confirm-password">ยืนยันรหัสผ่านใหม่</label><input id="confirm-password" type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></>}<button className="btn btn-primary wide" disabled={pending||!supabaseBrowser()}>{pending?'กำลังดำเนินการ...':mode==='request'?'ส่งลิงก์กู้คืน':'เปลี่ยนรหัสผ่าน'}</button></form>}{status&&<div role="status" className="info-panel">{status}</div>}<Link href="/login">กลับไปหน้าเข้าสู่ระบบ</Link></div></div>;
}
