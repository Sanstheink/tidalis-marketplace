import {MfaSetup} from '@/components/MfaSetup';
import {requireUser} from '@/lib/auth';
import {safeNextPath} from '@/lib/auth-routes';
export default async function Mfa({searchParams}:{searchParams:Promise<{next?:string}>}){
 await requireUser('/mfa');const {next}=await searchParams;
 return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">ACCOUNT SECURITY</div><h1>Two-factor <em>authentication.</em></h1><p>ผู้ซื้อเปิด MFA ได้ตามต้องการ ส่วน Seller และ Admin ต้องยืนยันด้วยแอป Authenticator ก่อนเข้าพื้นที่จัดการ</p></div><MfaSetup next={safeNextPath(next,'/workspace')}/></div>;
}
