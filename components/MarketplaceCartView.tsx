'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,ShoppingBag,Store,Minus,Plus,Trash2,ShieldCheck,Sparkles,RefreshCw} from 'lucide-react';
import {loadCheckout} from '@/app/checkout/actions';
import {useMarketplaceCart} from '@/lib/marketplace-cart';
import {checkoutRows,checkoutStockValid,liveLineKey,type CheckoutContext,type LiveCartLine} from '@/lib/marketplace-cart-utils';
import {publicPrice} from '@/lib/public-catalog-shared';

export function useLiveCheckout(lines:LiveCartLine[],hydrated:boolean){
  const [contexts,setContexts]=useState<Record<string,CheckoutContext>>({});const [loading,setLoading]=useState(true);const [error,setError]=useState(false);const [revision,setRevision]=useState(0);
  const key=JSON.stringify([...new Set(lines.map(l=>`${l.shopId}/${l.productId}`))].sort());
  useEffect(()=>{
    if(!hydrated)return;
    let active=true;setLoading(true);setError(false);
    const grouped=new Map<string,string[]>();
    for(const entry of JSON.parse(key) as string[]){const [shop,id]=entry.split('/');grouped.set(shop,[...(grouped.get(shop)||[]),id]);}
    Promise.all([...grouped].map(async([shop,ids])=>({shop,context:await loadCheckout(shop,ids)})))
      .then(results=>{if(!active)return;setContexts(Object.fromEntries(results.filter(r=>r.context).map(r=>[r.shop,r.context!])));setError(results.some(r=>!r.context));})
      .catch(()=>{if(active){setContexts({});setError(true)}}).finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[key,hydrated,revision]);
  return {contexts,loading,error,reload:()=>setRevision(r=>r+1)};
}
export default function MarketplaceCartView(){
  const {lines,hydrated,update,remove}=useMarketplaceCart();const {contexts,loading,error,reload}=useLiveCheckout(lines,hydrated);
  const shops=[...new Set(lines.map(l=>l.shopId))];
  const total=shops.reduce((sum,id)=>sum+(contexts[id]?checkoutRows(lines.filter(l=>l.shopId===id),contexts[id]).reduce((s,r)=>s+r.subtotal,0):0),0);
  return <div className="container page-pad commerce-page"><Link className="back-link" href="/shop"><ArrowLeft size={15}/> สำรวจผลงานต่อ</Link>
    <div className="commerce-heading"><div><div className="eyebrow">YOUR NEXT CREATIVE FIND</div><h1>ตะกร้า<em>ของคุณ.</em></h1><p>เก็บงานที่ใช่ แล้วตรวจสอบคำสั่งซื้อแยกตามร้านศิลปิน</p></div><div className="commerce-heading-icon"><ShoppingBag size={32}/><Sparkles size={17}/></div></div>
    {!hydrated||loading?<div className="commerce-loading" role="status">กำลังตรวจสอบราคาและสินค้าในตะกร้า…</div>:error?<div className="commerce-empty"><RefreshCw size={32}/><h2>ตรวจสอบสินค้าไม่สำเร็จ</h2><p>กรุณาลองโหลดข้อมูลอีกครั้ง</p><button className="btn btn-outline" onClick={reload}>ลองอีกครั้ง</button></div>:!lines.length?<div className="commerce-empty"><div className="empty-orbit"><ShoppingBag size={35}/></div><div className="eyebrow">A LITTLE SPACE FOR INSPIRATION</div><h2>งานชิ้นต่อไปกำลังรอคุณอยู่</h2><p>ค้นพบผลงานจากร้านศิลปิน แล้วเก็บรายการโปรดไว้ที่นี่</p><Link className="btn btn-primary" href="/shop">สำรวจผลงาน <ArrowRight size={16}/></Link></div>:
    <div className="commerce-layout"><div className="commerce-main">{shops.map(id=>{
      const context=contexts[id];const selected=lines.filter(l=>l.shopId===id);const rows=context?checkoutRows(selected,context):[];
      const missing=selected.filter(l=>!rows.some(r=>liveLineKey(r.line)===liveLineKey(l)));
      const valid=!missing.length&&checkoutStockValid(rows);
      return <section className="commerce-card shop-cart" key={id}><div className="shop-cart-heading"><div><Store size={19}/><strong>{context?.shop?.name||'ร้านที่ไม่พร้อมจำหน่าย'}</strong></div><span>{selected.length} รายการ</span></div>
        {rows.map(({line,product,price,subtotal})=><div className="live-cart-row" key={liveLineKey(line)}>
          <Link className="cart-artwork" href={`/products/${encodeURIComponent(product.slug)}--${product.id}`} aria-label={`ดู ${product.name}`}>✦</Link>
          <div className="live-cart-copy"><Link href={`/products/${encodeURIComponent(product.slug)}--${product.id}`}><h3>{product.name}</h3></Link><span className="license-pill">{line.license==='personal'?'Personal Use':'Commercial Use'}{product.exclusive?' · Exclusive':''}</span><p>{publicPrice(price.priceMinor)} / สิทธิ์</p>
            <div className="quantity-control compact"><button aria-label={`ลดจำนวน ${product.name}`} disabled={line.quantity<=1} onClick={()=>update(liveLineKey(line),line.quantity-1)}><Minus size={14}/></button><span>{line.quantity}</span><button aria-label={`เพิ่มจำนวน ${product.name}`} disabled={product.exclusive||line.quantity>=product.available} onClick={()=>update(liveLineKey(line),line.quantity+1)}><Plus size={14}/></button></div>
            {!checkoutStockValid(rows.filter(r=>r.product.id===product.id))?<p className="form-error" role="alert">จำนวนรวมของสินค้านี้ไม่พร้อมจำหน่าย กรุณาลดจำนวนหรือนำรายการออก</p>:null}</div>
          <div className="live-cart-end"><strong>{publicPrice(subtotal)}</strong><button aria-label={`ลบ ${product.name}`} onClick={()=>remove(liveLineKey(line))}><Trash2 size={17}/></button></div>
        </div>)}
        {missing.map(line=><div className="unavailable-cart-row" key={liveLineKey(line)}><span>สินค้าหรือ License นี้ไม่พร้อมจำหน่ายแล้ว</span><button className="btn btn-ghost" onClick={()=>remove(liveLineKey(line))}>นำออกจากตะกร้า</button></div>)}
        <div className="shop-cart-bottom"><div><span>ยอดสินค้าในร้านนี้</span><strong>{publicPrice(rows.reduce((s,r)=>s+r.subtotal,0))}</strong></div>{context?.shop&&valid?<Link className="btn btn-primary" href={`/checkout/${context.shop.slug}`}>ตรวจสอบรายการ <ArrowRight size={16}/></Link>:<span className="commerce-muted">แก้ไขรายการก่อนดำเนินการต่อ</span>}</div>
      </section>;
    })}</div><aside className="commerce-card commerce-summary"><div className="eyebrow">CURATED BY YOU</div><h2>สรุปตะกร้า</h2><div className="amount-row"><span>ร้านศิลปิน</span><strong>{shops.length} ร้าน</strong></div><div className="amount-row"><span>จำนวนสิทธิ์</span><strong>{lines.reduce((s,l)=>s+l.quantity,0)}</strong></div><div className="commerce-total"><span>ยอดสินค้ารวม</span><strong>{publicPrice(total)}</strong></div><div className="summary-assurance"><ShieldCheck size={19}/><p>ราคาและสต็อกจะตรวจสอบอีกครั้ง<br/>เมื่อคุณยืนยันคำสั่งซื้อ</p></div><p className="commerce-muted">สินค้าแต่ละร้านสร้างคำสั่งซื้อแยกกัน ตะกร้ายังไม่จองสินค้า</p><Link className="live-shop-link" href="/account/orders">ดูคำสั่งซื้อของฉัน <ArrowRight size={15}/></Link></aside></div>}
  </div>;
}
