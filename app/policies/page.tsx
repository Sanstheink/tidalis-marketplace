import Link from 'next/link';
import {policyPages} from '@/lib/policies';
import {getPublishedPlatformPolicy} from '@/lib/public-policies';
export const dynamic='force-dynamic';
export default async function Policies(){
  const versions=await Promise.all(policyPages.map(p=>getPublishedPlatformPolicy(p.slug)));
  return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">TIDALIS / LEGAL CENTER</div>
    <h1>Terms & <em>Policies.</em></h1><p>ข้อกำหนดแพลตฟอร์มที่เผยแพร่จริง แยกจากนโยบายของผู้ขายแต่ละร้าน</p></div>
    <div className="policy-list">{policyPages.map(({slug,title,desc,icon:Icon},i)=><Link href={`/policies/${slug}`} className="policy-link" key={slug}>
      <Icon size={25}/><h2>{title}</h2><p>{desc}</p>
      <small>{versions[i]?`เผยแพร่แล้ว · v${versions[i]?.version}`:'ยังไม่มีฉบับเผยแพร่'}</small>
    </Link>)}</div>
    <div className="legal-alert">นโยบายร้านค้าศิลปินอยู่บนหน้าโปรไฟล์ของแต่ละร้าน เงื่อนไขร้านไม่อาจจำกัดสิทธิ์ของผู้ซื้อที่กฎหมายคุ้มครอง</div>
  </div>;
}
