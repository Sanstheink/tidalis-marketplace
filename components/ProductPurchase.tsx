'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Check,ShoppingBag,ArrowRight,Download,ShieldCheck,Minus,Plus,Info,Store} from 'lucide-react';
import {type License,type Product,money,priceFor,quantityLimit} from '@/lib/catalog';
import {useCart} from '@/lib/cart';

export function ProductPurchase({product}:{product:Product}){
  const router=useRouter();const {add}=useCart();
  const [license,setLicense]=useState<License>('personal');const [qty,setQty]=useState(1);const [added,setAdded]=useState(false);
  const price=priceFor(product,license);
  const isFixed=product.pricingMode==='fixed';
  const limit=quantityLimit(product);
  const addItem=()=>{if(!isFixed)return;add(product.id,license,qty);setAdded(true)};
  const goToCheckout=()=>router.push(`/checkout/${product.shopSlug}?product=${encodeURIComponent(product.id)}&license=${license}&qty=${isFixed?qty:1}`);
  return <div className="purchase-panel"><div className="eyebrow"><Store size={13}/> {product.shopName.toUpperCase()} / {product.category.replace('_',' ').toUpperCase()}</div>
    <h1>{product.name}</h1><div className="price-main">{!isFixed&&<span className="price-prefix">เริ่มต้น </span>}{money(price)}</div>
    <p className="price-sub">{isFixed?'ราคาสินค้าสาธิตตาม License ที่เลือก':'ราคาเริ่มต้น · ศิลปินต้องตรวจบรีฟและเสนอราคาสุดท้ายก่อนชำระ'}</p><div className="purchase-divider"/>
    <div className="form-label">เลือกสิทธิ์การใช้งาน / License</div>
    <div className="variant-row" role="group" aria-label="เลือกประเภท License">
      <button type="button" aria-pressed={license==='personal'} onClick={()=>setLicense('personal')} className={'variant '+(license==='personal'?'selected':'')}><span>Personal Use</span><strong>{money(product.personalPrice)}</strong></button>
      <button type="button" aria-pressed={license==='commercial'} onClick={()=>setLicense('commercial')} className={'variant '+(license==='commercial'?'selected':'')}><span>Commercial Use</span><strong>{money(product.commercialPrice)}</strong></button>
    </div>
    <div className="license-explainer"><Info size={17}/><div><strong>{license==='personal'?'Personal Use':'Commercial Use'}</strong><p>{license==='personal'?'สำหรับการใช้งานส่วนบุคคลตามขอบเขตที่ผู้ขายระบุ ไม่อนุญาตให้นำไปใช้เชิงพาณิชย์โดยอัตโนมัติ':'สำหรับการใช้งานเชิงพาณิชย์ภายในขอบเขต License ที่ผู้ขายกำหนด ไม่ได้หมายถึงการโอนลิขสิทธิ์ทั้งหมด'}</p></div></div>
    <div className="status-line"><Check size={16}/>{isFixed?'ไฟล์จะส่งมอบหลังร้านตรวจสอบการรับเงินจริง':'ศิลปินจะส่งใบเสนอราคาหลังตรวจบรีฟ'}</div>
    {isFixed&&<><div className="form-label">จำนวน {product.exclusive&&<span className="exclusive-note">· Exclusive ซื้อได้สูงสุด 1 สิทธิ์</span>}</div><div className="quantity-control"><button aria-label="ลดจำนวน" disabled={qty<=1} onClick={()=>setQty(q=>Math.max(1,q-1))}><Minus size={16}/></button><span>{qty}</span><button aria-label="เพิ่มจำนวน" onClick={()=>setQty(q=>Math.min(limit,q+1))} disabled={qty>=limit}><Plus size={16}/></button></div></>}
    <div className="purchase-actions">{isFixed&&<button className="btn btn-outline wide" onClick={addItem}><ShoppingBag size={17}/>{added?'เพิ่มลงตะกร้าแล้ว ✓':'เพิ่มลงตะกร้า'}</button>}
      <button className="btn btn-primary wide" onClick={goToCheckout}>{isFixed?'ซื้อเลย (พรีวิว)':'ส่งบรีฟ (พรีวิว)'} <ArrowRight size={17}/></button></div>
    {added&&<p role="status" className="added-notice">เพิ่มสินค้าลงตะกร้าสาธิตแล้ว · <Link href="/cart">ดูตะกร้า</Link></p>}
    <div className="purchase-assurances"><span><ShieldCheck size={17}/> ขายโดยร้าน {product.shopName}</span><span><Download size={17}/> {isFixed?'Digital delivery after confirmation':'ส่งมอบงานโดยศิลปิน'}</span></div>
    <p className="demo-warning">โหมดพรีวิว: ยังไม่ล็อกสต็อก ไม่สร้างออเดอร์ และไม่รับเงินจริง</p>
    <div className="policy-short"><h3>ตรวจสอบก่อนสั่งซื้อ</h3><ul><li>License เป็นเงื่อนไขเฉพาะร้านและเฉพาะสินค้า</li><li>ตรวจนโยบายคืนเงินและส่งมอบงานของร้านผู้ขาย</li><li>สิทธิ์ตามกฎหมายไม่ถูกจำกัดด้วยเงื่อนไขร้าน</li></ul><Link href={`/shops/${product.shopSlug}`}>ไปดูร้านและนโยบายร้าน (ตัวอย่าง) <ArrowRight size={14}/></Link></div>
  </div>;
}
