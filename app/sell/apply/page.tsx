import {requireUser} from '@/lib/auth';
import {SellerApply} from '@/components/SellerApply';
export default async function Apply(){await requireUser('/sell/apply');return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">BECOME A CREATOR</div><h1>Open your <em>studio.</em></h1><p>สร้างหน้าร้านศิลปะบน Tidalis และกำหนดผลงาน ราคา License และนโยบายได้ด้วยตัวเอง</p></div><SellerApply/></div>}
