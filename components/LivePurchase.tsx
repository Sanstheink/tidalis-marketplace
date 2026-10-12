'use client';
import Link from 'next/link';
import {useState} from 'react';
import {ArrowRight,Check,ShoppingBag,ShieldCheck,Minus,Plus,Store} from 'lucide-react';
import {publicPrice,type PublicProduct} from '@/lib/public-catalog-shared';
import {useMarketplaceCart} from '@/lib/marketplace-cart';
import type {LiveLicense} from '@/lib/marketplace-cart-utils';
export function LivePurchase({product}:{product:PublicProduct}){
  const {add,lines,hydrated}=useMarketplaceCart();
  const [license,setLicense]=useState<LiveLicense>(product.licenses[0].usageType);const [quantity,setQuantity]=useState(1);const [notice,setNotice]=useState('');
  const selected=product.licenses.find(l=>l.usageType===license)!;
  const limit=product.exclusive?Math.min(1,product.stock??0):Math.min(20,product.stock??20);
  const fixed=product.pricingMode==='fixed';
  function addItem(){
    if(!hydrated||product.availabilityKnown===false||limit<1||quantity>limit)return;
    if(lines.length>=20&&!lines.some(l=>l.productId===product.id)){setNotice('ตะกร้าเต็มแล้ว กรุณาลบบางรายการก่อน');return;}
    add(product,license,quantity);setNotice('เพิ่มลงตะกร้าแล้ว');
  }
  return <div className="live-purchase"><div className="eyebrow"><Store size={14}/> {product.shopName} · {product.workType}</div>
    <h1>{product.name}</h1><div className="live-price">{!fixed?<small>เริ่มต้น </small>:null}{publicPrice(selected.priceMinor,product.currency)}</div>
    <p className="live-price-caption">เลือกสิทธิ์ที่ตรงกับการใช้งานของคุณ</p>
    <div className="live-license-options" role="group" aria-label="เลือก License">{product.licenses.map(l=><button type="button" key={l.usageType} aria-pressed={license===l.usageType} className={license===l.usageType?'selected':''} onClick={()=>{setLicense(l.usageType);setNotice('')}}><span>{l.usageType==='personal'?'Personal Use':'Commercial Use'}{license===l.usageType?<Check size={16}/>:null}</span><strong>{publicPrice(l.priceMinor,product.currency)}</strong></button>)}</div>
    <div className="live-license-terms"><ShieldCheck size={18}/><p>{selected.terms||'โปรดตรวจสอบสิทธิ์การใช้งานกับร้านผู้ขาย'}</p></div>
    {fixed?<><div className="live-purchase-quantity"><span>{product.exclusive?'Exclusive · 1 สิทธิ์เท่านั้น':'จำนวน'}</span><div className="quantity-control"><button type="button" aria-label="ลดจำนวน" disabled={quantity<=1} onClick={()=>setQuantity(q=>q-1)}><Minus size={16}/></button><span>{quantity}</span><button type="button" aria-label="เพิ่มจำนวน" disabled={quantity>=limit} onClick={()=>setQuantity(q=>q+1)}><Plus size={16}/></button></div></div>
      <button type="button" className="btn btn-primary wide" disabled={!hydrated||product.availabilityKnown===false||limit<1} onClick={addItem}><ShoppingBag size={18}/>{product.availabilityKnown===false?'ยังตรวจจำนวนไม่ได้ กรุณาโหลดใหม่':limit<1?'สินค้าหมด':'เพิ่มลงตะกร้า'}</button>
      {notice?<p role="status" className="added-notice">{notice} · <Link href="/cart">ตรวจสอบตะกร้า <ArrowRight size={14}/></Link></p>:null}
      <p className="live-purchase-help">ตะกร้ายังไม่จองสินค้า · ระบบตรวจราคาและจำนวนอีกครั้งเมื่อยืนยันคำสั่งซื้อ</p></>:<div className="order-notice"><strong>งานรับวาดตามบรีฟของคุณ</strong><p>ศิลปินตรวจบรีฟและเสนอราคาให้คุณยอมรับก่อนชำระเงิน</p><Link className="btn btn-primary wide" href={`/account/commissions/new?product=${product.id}`}>ส่งบรีฟให้ศิลปิน <ArrowRight size={16}/></Link></div>}
    <Link className="live-shop-link" href={`/shops/${product.shopSlug}`}>ดูร้านและนโยบายผู้ขาย <ArrowRight size={15}/></Link>
  </div>;
}
