'use client';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
import {MailCheck} from 'lucide-react';
import {supabaseBrowser} from '@/lib/supabase/browser';
import {safeNextPath} from '@/lib/auth-routes';
export function VerifyEmailForm({initialEmail='',next='/account'}:{initialEmail?:string;next?:string}){
 const router=useRouter();const [email,setEmail]=useState(initialEmail);const [code,setCode]=useState('');const [status,setStatus]=useState('');const [pending,setPending]=useState(false);const client=supabaseBrowser();
 async function submit(e:FormEvent){
  e.preventDefault();if(!client)return;setPending(true);setStatus('');
  const {error}=await client.auth.verifyOtp({email:email.trim(),token:code,type:'signup'});
  setPending(false);
  if(error)setStatus(error.message);else{router.push(safeNextPath(next));router.refresh()}
 }
 async function resend(){
  if(!client||!email.trim())return;setPending(true);setStatus('');
  const {error}=await client.auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`}});
  setPending(false);setStatus(error?error.message:'ส่งอีเมลยืนยันอีกครั้งแล้ว หากไม่ได้รับให้ตรวจโฟลเดอร์ Spam');
 }
 return <div className="container page-pad"><div className="simple-form"><MailCheck size={34}/><div className="eyebrow">EMAIL VERIFICATION</div><h1>ยืนยันอีเมล</h1><p>กรอกรหัส OTP 6 หลักจากอีเมล หรือคลิกลิงก์ยืนยัน หากตั้งค่า Supabase ให้ส่งอีเมลแบบลิงก์</p><form onSubmit={submit} className="auth-form"><label htmlFor="verify-email">อีเมล</label><input id="verify-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/><label htmlFor="verify-otp">รหัสยืนยัน</label><input id="verify-otp" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder="000000"/><button className="btn btn-primary wide" disabled={!client||pending||code.length!==6}>ยืนยันอีเมล</button></form><button type="button" className="btn btn-outline wide" onClick={resend} disabled={!client||pending||!email}>ส่งอีเมลยืนยันอีกครั้ง</button>{status&&<div className="form-message" role="status">{status}</div>}</div></div>;
}
