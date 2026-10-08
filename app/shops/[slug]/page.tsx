import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ProductCard} from '@/components/ProductCard';
import {getShop,products,shops} from '@/lib/catalog';
import {MapPin,ShieldCheck} from 'lucide-react';
export function generateStaticParams(){return shops.map(s=>({slug:s.slug}))}
export default async function ShopPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const shop=getShop(slug);if(!shop)notFound();
  const items=products.filter(p=>p.shopSlug===slug);
  return <div className="container page-pad"><div className="shop-cover"><div className="shop-logo">✦</div></div><div className="shop-profile"><div><div className="eyebrow">INDEPENDENT CREATOR · PREVIEW</div><h1>{shop.name}</h1><p>{shop.subtitle}</p><div className="shop-trust"><ShieldCheck size={15}/> ร้านตัวอย่าง · <MapPin size={15}/> {shop.location}</div></div><Link href="/policies/payment-refund" className="btn btn-ghost">กรอบนโยบายแพลตฟอร์ม</Link></div><div className="preview-banner">นโยบายร้านเฉพาะผู้ขายและเอกสาร License จริงยังไม่ถูกเผยแพร่ · การสั่งซื้อจริงจะต้องตรวจเงื่อนไขของร้านก่อน</div><section className="section"><div className="section-top"><div><h2>Artwork collection</h2><p>แคตตาล็อกข้อมูลสาธิตของ {shop.name}</p></div></div><div className="product-grid">{items.map(p=><ProductCard product={p} key={p.id}/>)}</div></section></div>;
}
