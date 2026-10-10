'use client';

import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {supabaseBrowser} from '@/lib/supabase/browser';

export function PasswordRecovery({mode}:{mode:'request'|'reset'}){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [pending,setPending]=useState(false);
  const [status,setStatus]=useState('');
  const [done,setDone]=useState(false);

  async function submit(event:FormEvent){
    event.preventDefault();setPending(true);setStatus('');
    const client=supabaseBrowser();
    if(!client){setStatus('ยังไม่ได้เชื่อม Supabase');setPending(false);return}
    try{
      if(mode==='request'){
        const address=email.trim();
        const {error}=await client.auth.resetPasswordForEmail(address,{redirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`});
        if(error){setStatus('ไม่สามารถส่งรหัสได้ในขณะนี้ โปรดรอสักครู่แล้วลองอีกครั้ง');return}
        router.push(`/verify-email?flow=recovery&email=${encodeURIComponent(address)}`);
      }else{
        if(password.length<8||password!==confirm){setStatus('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษรและตรงกันทั้งสองช่อง');return}
        const {data:{user},error:authError}=await client.auth.getUser();
        if(authError||!user){setStatus('เซสชันยืนยันหมดอายุ กรุณาขอรหัสยืนยันใหม่');return}
        // Supabase rejects password/email updates at AAL1 if a verified MFA factor exists.
        // An OTP session does not automatically satisfy TOTP MFA. Never bypass this check.
        const {data:assurance,error:assuranceError}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if(assuranceError)throw assuranceError;
        if(assurance?.nextLevel==='aal2'&&assurance.currentLevel!=='aal2'){
          setStatus('บัญชีนี้เปิด MFA อยู่ กรุณายืนยันรหัสจากแอป Authenticator ก่อนตั้งรหัสผ่านใหม่ (ไม่ใช่ Email OTP)');
          router.push('/mfa?next=%2Freset-password');
          return;
        }
        const {error}=await client.auth.updateUser({password});
        if(error){
          // AAL can change when sessions refresh; provide an explicit recovery route.
          if(/aal2|mfa.*(required|enabled)/i.test(error.message)){
            setStatus('ต้องยืนยัน MFA ด้วยแอป Authenticator ก่อนเปลี่ยนรหัสผ่าน');
            router.push('/mfa?next=%2Freset-password');
            return;
          }
          throw error;
        }
        await client.auth.signOut();setDone(true);router.refresh();setStatus('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง');
      }
    }catch(err){setStatus(err instanceof Error?err.message:'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง')}
    finally{setPending(false)}
  }

  return <div className="container page-pad"><div className="simple-form">
    <div className="eyebrow">ACCOUNT RECOVERY</div>
    <h1>{mode==='request'?'ลืมรหัสผ่าน':'ตั้งรหัสผ่านใหม่'}</h1>
    <p>{mode==='request'?'ระบุอีเมลที่ใช้สมัครเพื่อรับรหัส OTP จากระบบอีเมล':'ใช้รหัสผ่านใหม่ที่ไม่เคยใช้กับบริการอื่น'}</p>
    {!done&&<form className="auth-form" onSubmit={submit}>
      {mode==='request'?<><label htmlFor="recovery-email">อีเมล</label><input id="recovery-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></>:<>
        <label htmlFor="new-password">รหัสผ่านใหม่</label><input id="new-password" type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/>
        <label htmlFor="confirm-password">ยืนยันรหัสผ่านใหม่</label><input id="confirm-password" type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
      </>}
      <button className="btn btn-primary wide" disabled={pending||!supabaseBrowser()}>{pending?'กำลังดำเนินการ...':mode==='request'?'ส่งรหัส OTP':'เปลี่ยนรหัสผ่าน'}</button>
    </form>}
    {status&&<div role="status" className="info-panel">{status}</div>}
    <Link href="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
  </div></div>;
}
