import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {uuidPattern,type CheckoutPolicy} from '@/lib/marketplace-cart-utils';
import CommissionRequestForm from '@/components/CommissionRequestForm';
import {phase6Notice} from '@/lib/phase6';
export default async function CommissionRequest({searchParams}:{searchParams:Promise<{product?:string;notice?:string}>}){
 const {product,notice}=await searchParams;if(!product||!uuidPattern.test(product))notFound();const {client,user}=await requireUser(`/account/commissions/new?product=${product}`);
 const {data,error}=await client.rpc('get_commission_context',{p_product:product});if(error||!data?.product||!Array.isArray(data.product.licenses)||!data.product.licenses.length)notFound();
 const policies=await Promise.all((Array.isArray(data.policies)?data.policies as CheckoutPolicy[]:[]).map(async p=>{if(p.source_type!=='pdf'||!p.document_path)return p;const {data:signed}=await client.storage.from('tidalis-policy-documents').createSignedUrl(p.document_path,300);return {...p,document_url:signed?.signedUrl};}));
 const ready=data.enabled&&data.eligible&&policies.length===8&&policies.every(p=>p.source_type!=='pdf'||p.document_url);
 return <main className="container page-pad commerce-page"><div className="page-heading"><div className="eyebrow">COMMISSION / BRIEF</div><h1>เล่าไอเดีย<em>ให้ศิลปิน.</em></h1><p>{data.product.name} · {data.shop?.name} · {data.product.currency}</p></div>{notice?<p className="form-message" role="status">{phase6Notice(notice)}</p>:null}<section className="commerce-card"><p>ส่งบรีฟให้ผู้ขายเสนอราคา ขอบเขตงาน วันส่งมอบ และจำนวนครั้งแก้ไข คุณตรวจใบเสนอราคาและยอมรับก่อนชำระเงิน</p>{!ready?<div className="info-panel">ร้านหรือระบบรับงานกำลังเตรียมความพร้อม กรุณากลับมาอีกครั้ง</div>:null}<CommissionRequestForm productId={product} userId={user.id} licenses={data.product.licenses} policies={policies} ready={Boolean(ready)}/><Link className="text-link" href="/account/orders">คำสั่งซื้อของฉัน →</Link></section></main>;
}
