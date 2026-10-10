'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ShieldCheck} from 'lucide-react';
import {supabaseBrowser} from '@/lib/supabase/browser';
import {safeNextPath} from '@/lib/auth-routes';
import {OtpCodeInput} from '@/components/OtpCodeInput';

export function MfaSetup({next='/workspace'}:{next?:string}){
 const [factorId,setFactorId]=useState('');const [qr,setQr]=useState('');const [code,setCode]=useState('');const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [hasVerifiedFactor,setHasVerifiedFactor]=useState(false);
 const router=useRouter();const destination=safeNextPath(next,'/workspace');
 useEffect(()=>{const client=supabaseBrowser();if(!client){setLoading(false);setError('โปรเจกต์ยังไม่เชื่อม Supabase');return}
  void (async()=>{
   const {data:assurance}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
   if(assurance?.currentLevel==='aal2'){router.replace(destination);router.refresh();return}
   const {data,error}=await client.auth.mfa.listFactors();
   if(error)setError(error.message);
   const verified=data?.totp?.find(f=>f.status==='verified');
   if(verified){setFactorId(verified.id);setHasVerifiedFactor(true)}
   else if(data?.totp?.length){setFactorId(data.totp[0].id);setHasVerifiedFactor(false)}
   setLoading(false);
  })();
 },[router,destination]);
 async function enroll(){const client=supabaseBrowser();if(!client)return;setLoading(true);setError('');
  const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Tidalis Authenticator'});
  setLoading(false);if(error){setError(error.message);return}
  if(data){setFactorId(data.id);setQr(data.totp.qr_code);setHasVerifiedFactor(false)}
 }
 async function resetUnverified(){const client=supabaseBrowser();if(!client||!factorId||hasVerifiedFactor)return;setLoading(true);setError('');const {error}=await client.auth.mfa.unenroll({factorId});setLoading(false);if(error){setError(error.message);return}setFactorId('');setQr('');setCode('')}
 async function verify(){const client=supabaseBrowser();if(!client||!factorId||code.length!==6)return;
  setLoading(true);setError('');
  const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({factorId});
  if(challengeError||!challenge){setError(challengeError?.message||'ไม่สามารถเริ่มการยืนยันได้');setLoading(false);return}
  const {error:verifyError}=await client.auth.mfa.verify({factorId,challengeId:challenge.id,code});
  setLoading(false);if(verifyError){setError(verifyError.message);return}
  router.replace(destination);router.refresh();
 }
 return <div className="simple-form"><ShieldCheck size={32}/><h2>Authenticator App</h2><p>ผู้ซื้อไม่จำเป็นต้องเปิด MFA เพื่อเข้าสู่ระบบ แต่สามารถเลือกเปิดเพื่อเพิ่มความปลอดภัยได้ Seller ต้องลงทะเบียน Authenticator ที่ยืนยันแล้ว และสามารถเข้า Studio ที่ AAL1 ได้ ส่วนงานอนุมัติ/การเงินและ Admin ต้องยืนยัน AAL2</p>
 {loading?<p>กำลังตรวจสอบ MFA...</p>:!factorId?<button className="btn btn-primary wide" onClick={enroll}>สร้าง QR สำหรับเปิด MFA</button>:<>
 {!hasVerifiedFactor&&<div><p>หากเคยลงทะเบียนแล้วแต่ไม่มี QR ให้เริ่มตั้งค่า Factor ที่ยังไม่ยืนยันใหม่ได้</p>{!qr&&<button type="button" className="btn btn-outline" onClick={resetUnverified} disabled={loading}>เริ่มตั้งค่า MFA ใหม่</button>}</div>}
 {qr&&<div style={{background:'white',padding:15,display:'inline-flex',margin:'15px 0'}}><img src={qr} alt="สแกน QR ด้วยแอป Authenticator" width={200} height={200}/></div>}
 <OtpCodeInput value={code} onChange={setCode} disabled={loading} error={Boolean(error)} label={hasVerifiedFactor?'รหัสจากแอป Authenticator':'รหัสจากแอปเพื่อเปิดใช้งาน MFA'}/>
 <button className="btn btn-primary wide" onClick={verify} disabled={loading||code.length!==6}>ยืนยันรหัสและดำเนินการต่อ</button></>}
 {error&&<div role="alert" className="form-message">{error}</div>}
 <p className="helper">อย่าแชร์ QR หรือรหัส TOTP กับผู้อื่น และตั้งค่าวิธีกู้คืนการเข้าถึงบัญชีกับผู้ดูแลอย่างปลอดภัย</p><Link href="/workspace">กลับไปเลือก Workspace</Link></div>
}
