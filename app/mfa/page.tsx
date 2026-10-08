import {MfaSetup} from '@/components/MfaSetup';
import {requireUser} from '@/lib/auth';
export default async function Mfa(){await requireUser('/mfa');return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">ACCOUNT SECURITY</div><h1>Two-factor <em>authentication.</em></h1><p>ตั้งค่าแอป Authenticator เพื่อป้องกัน Seller Studio และ Admin Console</p></div><MfaSetup/></div>}
