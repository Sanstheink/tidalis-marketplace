'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Check,ShoppingBag,ArrowRight,Download,ShieldCheck,Minus,Plus,Info} from 'lucide-react';
import {type License,type Product,money} from '@/lib/catalog';
import {useCart} from '@/lib/cart';
export function ProductPurchase({product}:{product:Product}){
 const router=useRouter(); const {add}=useCart();const [license,setLicense]=useState<License>('personal');const [qty,setQty]=useState(1);const [added,setAdded]=useState(false);
 const price=license==='personal'?product.personalPrice:product.commercialPrice;
 const canAdd=product.pricingMode==='fixed';
 const addItem=()=>{add(product.id,license,qty);setAdded(true);setTimeout(()=>setAdded(false),2100)};
 const goToCheckout=()=>{if(canAdd){add(product.id,license,qty);router.push(`/checkout/${product.shopSlug}`)}else{router.push(`/checkout/${product.shopSlug}?product=${product.id}&license=${license}`)}};
 return <div className="purchase-panel"><div className="eyebrow">{product.shopName.toUpperCase()} / {product.category.replace('_',' ').toUpperCase()}</div><h1>{product.name}</h1><div className="price-main">{product.pricingMode==='quote'&&<span className="price-prefix">เริ่มต้น </span>}{money(price)}</div><p className="price-sub">{product.pricingMode==='fixed'?'ราคาสินค้ายืนยันแล้ว · ยอดสุทธิจะสรุปอีกครั้งก่อนชำระ':'ศิลปินจะตรวจบรีฟและยืนยันราคาสุดท้ายก่อนชำระ'}</p><div className="purchase-divider"/>
 <div className="form-label">ประเภทการใช้งาน / License</div><div className="variant-row"><button onClick={()=>setLicense('personal')} className={'variant '+(license==='personal'?'selected':'')}>Personal Use <span>{money(product.personalPrice)}</span></button><button onClick={()=>setLicense('commercial')} className={'variant '+(license==='commercial'?'selected':'')}>Commercial Use <span>{money(product.commercialPrice)}</span></button></div><p className="helper"><Info size={15}/> สิทธิ์ใช้งานและราคาเชิงพาณิชย์กำหนดโดยร้านผู้ขาย</p>
 <div className="status-line"><Check size={16}/>{product.pricingMode==='fixed'?'ไฟล์พร้อมดาวน์โหลดหลังร้านยืนยันชำระ':'เปิดรับบรีฟงานวาด · รอศิลปินเสนอราคา'}</div>
 {canAdd&&<><div className="form-label">จำนวน</div><div className="quantity-control"><button aria-label="ลดจำนวน" onClick={()=>setQty(q=>Math.max(1,q-1))}><Minus size={16}/></button><span>{qty}</span><button aria-label="เพิ่มจำนวน" onClick={()=>setQty(q=>Math.min(product.stock??20,q+1))} disabled={qty>=(product.stock??20)}><Plus size={16}/></button></div></>}
 <div className="purchase-actions">{canAdd&&<button className="btn btn-outline wide" onClick={addItem}><ShoppingBag size={17}/>{added?'เพิ่มลงตะกร้าแล้ว ✓':'เพิ่มลงตะกร้า'}</button>}<button className="btn btn-primary wide" onClick={goToCheckout}>{canAdd?'ซื้อเลย':'ส่งคำขอสั่งวาด'} <ArrowRight size={17}/></button></div><div className="purchase-assurances"><span><ShieldCheck size={17}/> ซื้อจากร้าน {product.shopName}</span><span><Download size={17}/> {product.pricingMode==='fixed'?'Secure digital delivery':'ส่งมอบไฟล์โดยศิลปิน'}</span></div><p className="demo-warning">สินค้าชุดนี้เป็นข้อมูลสาธิต ยังไม่มีการรับเงินหรือส่งออเดอร์จริง</p><div className="policy-short"><h3>ข้อมูลก่อนซื้อ</h3><ul><li>ดูรายละเอียด License และขอบเขตสิทธิ์การใช้งาน</li><li>อ่านนโยบายคืนเงินและส่งมอบงานของร้านก่อนยืนยัน</li><li>การคืนเงินเป็นไปตามนโยบายที่ใช้บังคับและสิทธิ์ตามกฎหมาย</li></ul><Link href="/policies/payment-refund">ดูแนวทางการชำระเงินและคืนเงิน <ArrowRight size={14}/></Link></div></div>}
