import {MfaSetup} from '@/components/MfaSetup';
import {requireUser} from '@/lib/auth';
import {safeNextPath} from '@/lib/auth-routes';
export default async function Mfa({searchParams}:{searchParams:Promise<{next?:string}>}){
 await requireUser('/mfa');const {next}=await searchParams;
 return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">ACCOUNT SECURITY</div><h1>Two-factor <em>authentication.</em></h1><p>ใช้แอป Authenticator เพื่อยืนยันก่อนเข้า Seller Studio และ Admin Console</p></div><MfaSetup next={safeNextPath(next,'/workspace')}/></div>;
}
