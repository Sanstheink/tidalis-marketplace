import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowRight,ShieldCheck,Info} from 'lucide-react';
import {getPublicProductByRoute,getPublicProducts} from '@/lib/public-catalog';
import {publicPrice} from '@/lib/public-catalog-shared';
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
      <div className="gallery"><div className={`live-detail-cover product-art live-product-${product.productType}`}><span className="live-detail-sigil" aria-hidden="true">✧</span><span className="art-caption">TIDALIS · {product.productType.replace('_',' ').toUpperCase()}</span></div><p className="gallery-disclaimer">ภาพ Placeholder — ไฟล์ต้นฉบับของผู้ขายยังคงเป็น Private และไม่ได้เปิดให้สาธารณะเข้าถึง</p></div>
      <div className="purchase-panel"><div className="eyebrow">{product.shopName.toUpperCase()} / {product.productType.replace('_',' ').toUpperCase()}</div>
        <h1>{product.name}</h1><p>{product.workType}</p>
        <div className="purchase-divider"/><div className="form-label">License และราคาจากร้านผู้ขาย</div>
        <div className="phase55-license-list">{product.licenses.map(license=><div className="phase55-license" key={license.usageType}><div><strong>{license.usageType==='personal'?'Personal Use':'Commercial Use'}</strong><p>{license.terms||'โปรดตรวจสอบเงื่อนไขสิทธิ์การใช้งานก่อนสั่งซื้อ'}</p></div><strong>{product.pricingMode==='quote'?'เริ่มต้น ':''}{publicPrice(license.priceMinor)}</strong></div>)}</div>
        {product.exclusive&&<p className="phase55-exclusivity"><Info size={16}/> Exclusive artwork · สต็อก {product.stock ?? 0} (ยังไม่สามารถจองได้)</p>}
        <div className="phase55-disabled-purchase"><ShieldCheck size={20}/><div><strong>ระบบสั่งซื้ออยู่ระหว่างพัฒนา</strong><p>Phase 5.5 แสดงสินค้าที่เผยแพร่จากฐานข้อมูลเท่านั้น ยังไม่เปิดรับเงิน ยืนยันสลิป หรือสร้างออเดอร์</p></div></div>
        <Link className="btn btn-outline wide" href={`/shops/${product.shopSlug}`}>ไปยังร้านผู้ขาย <ArrowRight size={16}/></Link>
      </div>
    </div>
    <section className="product-bottom"><div className="product-bottom-main"><h2>รายละเอียดผลงาน</h2><p className="phase55-description">{product.description}</p><p>การซื้อ Commercial Use ไม่ได้หมายถึงการโอนลิขสิทธิ์ทั้งหมด ต้องตรวจข้อกำหนดของผู้ขายเมื่อเปิดระบบซื้อขาย</p></div><aside className="seller-mini"><div className="small-title">ABOUT THE CREATOR</div><div className="seller-avatar">✦</div><h3>{product.shopName}</h3><div className="verified-line"><ShieldCheck size={16}/> ร้านที่เปิดใช้งานบน Tidalis</div><Link className="btn btn-outline wide" href={`/shops/${product.shopSlug}`}>ดูร้าน <ArrowRight size={16}/></Link></aside></section>
    {recommended.length>0&&<section className="section related-products"><div className="section-top"><div><div className="eyebrow">YOU MAY ALSO LIKE</div><h2>Explore more <em>art.</em></h2></div></div><div className="product-grid">{recommended.map(p=><PublicProductCard key={p.id} product={p}/>)}</div></section>}
  </div>;
}
