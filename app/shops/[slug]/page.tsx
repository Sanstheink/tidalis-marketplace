import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PublicProductCard} from '@/components/PublicProductCard';
import {getPublicProducts,getPublicShop} from '@/lib/public-catalog';
import {MapPin,ShieldCheck} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function ShopPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const shop=await getPublicShop(slug);
  if(!shop)notFound();
  const products=await getPublicProducts({limit:60,shopId:shop.id});
  return <div className="container page-pad"><div className="shop-cover"><div className="shop-logo">✦</div></div><div className="shop-profile"><div><div className="eyebrow">INDEPENDENT CREATOR</div><h1>{shop.name}</h1><p>{shop.description}</p><div className="shop-trust"><ShieldCheck size={15}/> ร้านที่เปิดใช้งาน · <MapPin size={15}/> Tidalis Marketplace</div></div><Link href="/policies/payment-refund" className="btn btn-ghost">กรอบนโยบายแพลตฟอร์ม</Link></div><div className="preview-banner">กำลังพัฒนาระบบการสั่งซื้อและชำระเงิน · ไม่สามารถชำระเงินผ่านหน้านี้ได้ในขณะนี้</div><section className="section"><div className="section-top"><div><h2>Artwork collection</h2><p>ผลงานที่เผยแพร่จาก {shop.name}</p></div></div>{products.length?<div className="product-grid">{products.map(p=><PublicProductCard product={p} key={p.id}/>)}</div>:<div className="empty-state">ร้านนี้ยังไม่มีสินค้าที่เผยแพร่</div>}</section></div>;
}
