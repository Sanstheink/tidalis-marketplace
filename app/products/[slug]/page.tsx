import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowRight,ShieldCheck,Info} from 'lucide-react';
import {getPublicProductByRoute,getPublicProducts} from '@/lib/public-catalog';
import {LivePurchase} from '@/components/LivePurchase';
import {PublicProductCard} from '@/components/PublicProductCard';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;
  const product=await getPublicProductByRoute(slug);
  return {title:product?.name||'Product',robots:product?undefined:{index:false,follow:false}};
}
export default async function ProductDetail({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const product=await getPublicProductByRoute(slug);
  if(!product)notFound();
  const recommended=(await getPublicProducts({limit:8})).filter(p=>p.id!==product.id).slice(0,3);
  return <div className="container page-pad">
    <div className="breadcrumb"><Link href="/">หน้าแรก</Link><span>/</span><Link href="/shop">สินค้า</Link><span>/</span><span>{product.name}</span></div>
    <div className="product-detail-grid">
      <div className="gallery"><div className={`live-detail-cover product-art live-product-${product.productType}`}>{product.previewUrl?<img src={product.previewUrl} alt={`ภาพตัวอย่างของ ${product.name}`} className="phase58-art-image"/>:<span className="live-detail-sigil" aria-hidden="true">✧</span>}<span className="art-caption">TIDALIS · {product.productType.replace('_',' ').toUpperCase()}</span></div><p className="gallery-disclaimer">ภาพ Preview ที่ได้รับอนุญาตให้แสดง · ไฟล์ต้นฉบับของผู้ขายยังคงเป็น Private ไม่เปิดให้สาธารณะดาวน์โหลด</p></div>
      <div className="purchase-panel"><LivePurchase product={product}/></div>
    </div>
    <section className="product-bottom"><div className="product-bottom-main"><h2>รายละเอียดผลงาน</h2><p className="phase55-description">{product.description}</p><p>การซื้อ Commercial Use ไม่ได้หมายถึงการโอนลิขสิทธิ์ทั้งหมด ต้องตรวจข้อกำหนดของผู้ขายเมื่อเปิดระบบซื้อขาย</p></div><aside className="seller-mini"><div className="small-title">ABOUT THE CREATOR</div><div className="seller-avatar">✦</div><h3>{product.shopName}</h3><div className="verified-line"><ShieldCheck size={16}/> ร้านที่เปิดใช้งานบน Tidalis</div><Link className="btn btn-outline wide" href={`/shops/${product.shopSlug}`}>ดูร้าน <ArrowRight size={16}/></Link></aside></section>
    {recommended.length>0&&<section className="section related-products"><div className="section-top"><div><div className="eyebrow">YOU MAY ALSO LIKE</div><h2>Explore more <em>art.</em></h2></div></div><div className="product-grid">{recommended.map(p=><PublicProductCard key={p.id} product={p}/>)}</div></section>}
  </div>;
}
