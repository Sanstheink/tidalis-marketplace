import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PublicShopGrid} from '@/components/PublicShopGrid';
import type {CatalogQuery} from '@/lib/catalog-query';
import {getPublicCatalogPage,getPublicShop} from '@/lib/public-catalog';
import {getPublishedShopPolicies} from '@/lib/public-policies';
import {shopPolicyLabel} from '@/lib/policy-labels';
import {MapPin,ShieldCheck} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function ShopPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<CatalogQuery>}){
  const {slug}=await params;
  const shop=await getPublicShop(slug);
  if(!shop)notFound();
  const [catalog,policies]=await Promise.all([getPublicCatalogPage(await searchParams,shop.id),getPublishedShopPolicies(shop.id)]);
  return <div className="container page-pad"><div className="shop-cover"><div className="shop-logo">✦</div></div><div className="shop-profile"><div><div className="eyebrow">INDEPENDENT CREATOR</div><h1>{shop.name}</h1><p>{shop.description}</p><div className="shop-trust"><ShieldCheck size={15}/> ร้านที่เปิดใช้งาน · <MapPin size={15}/> Tidalis Marketplace</div></div><Link href="/policies/payment-refund" className="btn btn-ghost">กรอบนโยบายแพลตฟอร์ม</Link></div><div className="preview-banner">เลือกผลงาน อ่านสิทธิ์และนโยบายร้าน แล้วชำระตรงถึงผู้ขายผ่านคำสั่งซื้อ</div><section className="section"><div className="section-top"><div><h2>Artwork collection</h2><p>ผลงานที่เผยแพร่จาก {shop.name}</p></div></div><PublicShopGrid {...catalog} basePath={`/shops/${shop.slug}`}/></section><section id="shop-policies" className="section shop-public-policies">
    <div className="section-top"><div><h2>นโยบายของร้านค้า</h2><p>ข้อกำหนดที่เผยแพร่จริงจากร้าน {shop.name}</p></div>
      <Link href="/policies" className="btn btn-outline">นโยบายแพลตฟอร์ม</Link></div>
    {policies.length?<div className="policy-version-list">{policies.map(p=><article className="phase4-card" key={p.id}>
      <h3>{shopPolicyLabel(p.policy_type)}</h3>
      <p>เวอร์ชัน {p.version} · เผยแพร่ {p.published_at?new Date(p.published_at).toLocaleDateString('th-TH'):'—'}</p>
      {p.source_type==='pdf'?<p>{p.document_url?<a className="btn btn-outline" href={p.document_url} target="_blank" rel="noopener noreferrer">ดาวน์โหลด PDF: {p.document_name||'Shop Policy'} ↗</a>:<span>ไม่สามารถเปิดเอกสารได้ชั่วคราว</span>}</p>:<details><summary>อ่านนโยบายของร้าน</summary><div className="phase4-policy-body">{p.content}</div></details>}
    </article>)}</div>:<div className="empty-state">ร้านนี้ยังไม่เผยแพร่นโยบายของร้าน การสั่งซื้อยังไม่เปิดให้บริการ</div>}
  </section></div>;
}
