'use client';
import Link from 'next/link';
import {ArrowRight,ShoppingBag,Trash2,Minus,Plus,Info,Store,ShieldAlert} from 'lucide-react';
import {useCart} from '@/lib/cart';
import {groupByShop} from '@/lib/cart-utils';
import {money,quantityLimit} from '@/lib/catalog';

export default function Cart(){
  const {lines,update,remove,hydrated}=useCart();
  const groups=groupByShop(lines);
  const total=groups.reduce((sum,g)=>sum+g.subtotal,0);
  return <div className="container page-pad">
    <div className="page-heading"><div className="eyebrow">YOUR COLLECTION / PREVIEW</div><h1>Shopping <em>cart.</em></h1><p>สินค้าแต่ละร้านต้องแยกตรวจสอบและชำระเข้าร้านผู้ขายโดยตรง</p></div>
    {!hydrated?<div className="empty-state">กำลังโหลดตะกร้า...</div>:groups.length===0?
      <div className="empty-state"><ShoppingBag size={46}/><h2>ตะกร้าของคุณยังว่างอยู่</h2><p>ค้นพบงานที่ใช่แล้วเพิ่มลงในตะกร้าได้เลย</p><Link className="btn btn-primary" href="/shop">เลือกดูสินค้า <ArrowRight size={16}/></Link></div>:
      <div className="cart-layout"><div className="cart-lines">
        <div className="preview-banner"><Info size={18}/> ตะกร้าบันทึกในเบราว์เซอร์เพื่อทดสอบหน้าตาเท่านั้น ไม่ใช่การจองสินค้า</div>
        {groups.map(group=><section className="cart-shop-group" key={group.shopSlug} aria-labelledby={`shop-${group.shopSlug}`}>
          <div className="cart-shop-head" id={`shop-${group.shopSlug}`}><Store size={18}/> <Link href={`/shops/${group.shopSlug}`}>{group.shopName}</Link> <span>· ร้านตัวอย่าง</span></div>
          {group.lines.map(({line,product,unitPrice,subtotal})=><div className="cart-item" key={line.key}>
            <Link href={`/products/${product.slug}`} className={`cart-art product-art ${product.artClass}`} aria-label={`ดู ${product.name}`}><span>{product.artEmoji}</span></Link>
            <div className="cart-details"><Link href={`/products/${product.slug}`}><h3>{product.name}</h3></Link>
              <p>{line.license==='personal'?'Personal Use':'Commercial Use'} {product.exclusive?'· Exclusive':''}</p>
              <strong>{money(unitPrice)}</strong>
              <div className="quantity-control compact"><button aria-label={`ลดจำนวน ${product.name}`} disabled={line.quantity<=1} onClick={()=>update(line.key,line.quantity-1)}><Minus size={13}/></button><span>{line.quantity}</span><button aria-label={`เพิ่มจำนวน ${product.name}`} disabled={line.quantity>=quantityLimit(product)} onClick={()=>update(line.key,line.quantity+1)}><Plus size={13}/></button></div>
            </div><div className="cart-item-end"><b>{money(subtotal)}</b><button className="remove-cart" title="ลบออกจากตะกร้า" aria-label={`ลบ ${product.name}`} onClick={()=>remove(line.key)}><Trash2 size={18}/></button></div>
          </div>)}
          <div className="shop-subtotal"><span>ยอดสินค้าในร้านนี้</span><strong>{money(group.subtotal)}</strong></div>
          <Link className="btn btn-outline" href={`/preview/checkout/${group.shopSlug}`}>ไป Checkout ร้าน {group.shopName} <ArrowRight size={16}/></Link>
        </section>)}
      </div><aside className="cart-summary"><h2>Cart Summary</h2><div className="amount-row"><span>ร้านค้า</span><strong>{groups.length} ร้าน</strong></div><div className="amount-row"><span>รายการทั้งหมด</span><strong>{groups.reduce((n,g)=>n+g.lines.reduce((s,l)=>s+l.line.quantity,0),0)} ชิ้น</strong></div><div className="divider"/><div className="amount-row grand"><span>รวมราคาสินค้า</span><strong>{money(total)}</strong></div><p><ShieldAlert size={16}/> ยังไม่รวมภาษีที่อาจใช้บังคับและยังไม่ใช่ใบเสนอราคาหรือยอดชำระที่ยืนยันแล้ว</p><p className="demo-warning">เลือก Checkout ทีละร้าน · ยังไม่เปิดรับชำระเงินจริง</p></aside></div>}
  </div>;
}
