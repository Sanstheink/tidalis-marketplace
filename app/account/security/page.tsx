import Link from 'next/link';
import {ShieldCheck,LockKeyhole,ArrowRight} from 'lucide-react';
import {requireUser} from '@/lib/auth';

export const metadata={title:'Account security | Tidalis',robots:{index:false,follow:false}};

/** Account security overview. This page deliberately does not require MFA for buyers. */
export default async function AccountSecurity(){
  const {client}=await requireUser('/account/security');
  const {data,error}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const enrolled=data?.nextLevel==='aal2';
  const verified=data?.currentLevel==='aal2';

  return <div className="container page-pad">
    <div className="page-heading"><div className="eyebrow">ACCOUNT SECURITY</div><h1>ความปลอดภัย<em>บัญชี</em></h1><p>ผู้ซื้อไม่จำเป็นต้องใช้ MFA เพื่อเข้าสู่ระบบ แต่สามารถเปิดได้ด้วยตัวเอง</p></div>
    <div className="preview-panels">
      <div className="preview-panel">
        <h3><ShieldCheck size={22}/> การยืนยันสองขั้นตอน (MFA)</h3>
        {error?<p>ไม่สามารถตรวจสถานะ MFA ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง</p>:<>
          <p>{!enrolled?'ยังไม่ได้เปิด MFA — คุณยังใช้บัญชีผู้ซื้อได้ตามปกติ':verified?'เปิด MFA แล้ว และเซสชันนี้ยืนยันถึง AAL2 แล้ว':'เปิด MFA แล้ว แต่เซสชันนี้ยังต้องยืนยันจากแอป Authenticator'}</p>
          <Link className="btn btn-outline" href="/mfa?next=%2Faccount%2Fsecurity">{!enrolled?'เลือกเปิด MFA':'ยืนยัน MFA'} <ArrowRight size={16}/></Link>
        </>}
      </div>
      <div className="preview-panel"><h3><LockKeyhole size={22}/> สิทธิ์ Seller และ Admin</h3><p>การเข้า Seller Studio และ Admin Console ต้องมีสิทธิ์ตามบทบาท และยืนยัน MFA ระดับ AAL2 ทุกครั้งที่เซสชันยังไม่ถึงระดับดังกล่าว</p><Link className="btn btn-outline" href="/workspace">ไปหน้า Workspace <ArrowRight size={16}/></Link></div>
    </div>
    <div className="info-panel">หากคุณเลือกเปิด MFA เอง Supabase อาจขอให้ยืนยันด้วย Authenticator ก่อนเปลี่ยนอีเมลหรือรหัสผ่าน แม้คุณจะเป็นผู้ซื้อก็ตาม</div>
  </div>;
}
