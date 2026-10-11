import Link from 'next/link';
import {notFound} from 'next/navigation';
import {policyPages} from '@/lib/policies';
import {getPublishedPlatformPolicy} from '@/lib/public-policies';

export const dynamic='force-dynamic';
export function generateStaticParams(){return policyPages.map(p=>({slug:p.slug}));}
export default async function PlatformPolicyPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const metadata=policyPages.find(p=>p.slug===slug);
  if(!metadata)notFound();
  const published=await getPublishedPlatformPolicy(slug);
  return <article className="container page-pad legal-content">
    <Link href="/policies" className="back-link">← กลับสู่ศูนย์นโยบาย</Link>
    <div className="eyebrow">TIDALIS / LEGAL CENTER</div>
    <h1>{published?.title||metadata.title}</h1>
    {published?<>
      <p>ฉบับเผยแพร่ · เวอร์ชัน {published.version} · มีผลตั้งแต่ {published.effective_from?new Date(published.effective_from).toLocaleDateString('th-TH',{dateStyle:'long'}):'—'}</p>
      <section className="phase4-policy-body" aria-label="เนื้อหานโยบายที่เผยแพร่">{published.content}</section>
      {slug==='seller-agreement'&&<p className="phase4-small">การยอมรับข้อตกลงผู้ขายจะเกิดขึ้นเมื่อผู้สมัครยืนยันในแบบฟอร์ม ไม่ใช่เพียงการอ่านหน้านี้</p>}
    </>:<div className="legal-alert" role="status"><strong>นโยบายนี้ยังไม่ได้เผยแพร่</strong> — ขณะนี้ยังไม่มีเอกสารฉบับที่มีผลใช้จริง กรุณากลับมาตรวจสอบอีกครั้ง ไม่ควรถือข้อความตัวอย่างเป็นข้อกำหนดที่ตกลงกันแล้ว</div>}
  </article>;
}
