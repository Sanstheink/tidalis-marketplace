'use client';
import Link from 'next/link';
import {useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowLeft,ArrowRight,Clock3,FileText,ShieldCheck,Store,RefreshCw} from 'lucide-react';
import {placeFixedOrder} from '@/app/checkout/actions';
import {useMarketplaceCart} from '@/lib/marketplace-cart';
import {checkoutError,checkoutRows,liveLineKey,type OrderItemInput,type CheckoutPolicy} from '@/lib/marketplace-cart-utils';
import {publicPrice,type PublicShop} from '@/lib/public-catalog-shared';
import {useLiveCheckout} from './MarketplaceCartView';
export const policyName=(p:CheckoutPolicy)=>({refund:'การยกเลิกและคืนเงิน',delivery:'การส่งมอบงาน',license:'สิทธิ์การใช้งาน',terms:'ข้อกำหนดการใช้บริการ',privacy:'ความเป็นส่วนตัว','seller-agreement':'ข้อตกลงผู้ขาย','payment-refund':'การชำระเงินและคืนเงิน',copyright:'ลิขสิทธิ์'} as Record<string,string>)[p.policy_type]||p.policy_type;
async function attemptKey(userId:string,shopId:string,payload:unknown){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const storageKey=`tidalis:order-attempt:v1:${userId}:${shopId}`;
  try{const previous=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(previous?.fingerprint===fingerprint&&typeof previous.key==='string')return {key:previous.key as string,storageKey};}catch{}
  const key=crypto.randomUUID();try{sessionStorage.setItem(storageKey,JSON.stringify({fingerprint,key}))}catch{}
  return {key,storageKey};
}
export default function FixedCheckout({shop,userId}:{shop:PublicShop;userId:string|null}){
  const {lines,hydrated,clearShop}=useMarketplaceCart();const selected=lines.filter(l=>l.shopId===shop.id);
  const {contexts,loading,error,reload}=useLiveCheckout(selected,hydrated);const context=contexts[shop.id];
  const [note,setNote]=useState('');const [accepted,setAccepted]=useState(false);const [pending,setPending]=useState(false);const [message,setMessage]=useState('');const sending=useRef(false);const retry=useRef<{payload:string;key:string;storageKey:string}|null>(null);const router=useRouter();
  const rows=context?checkoutRows(selected,context):[];const total=rows.reduce((s,r)=>s+r.subtotal,0);
  const valid=rows.length===selected.length&&rows.length>0&&rows.every(r=>r.line.quantity<=r.product.available&&(!r.product.exclusive||r.line.quantity===1));
  const policiesReady=context?.policies.length===8&&context.policies.every(p=>p.source_type!=='pdf'||p.document_url);
  const canOrder=Boolean(context?.enabled&&context.eligible&&valid&&policiesReady);
  function refresh(){setAccepted(false);setMessage('');reload()}
  async function submit(event:FormEvent){
    event.preventDefault();if(sending.current||!accepted||!canOrder)return;
    if(!userId){router.push(`/login?next=${encodeURIComponent(`/checkout/${shop.slug}`)}`);return;}
    sending.current=true;setPending(true);setMessage('');
    try{
      const items:OrderItemInput[]=rows.map(r=>({productId:r.product.id,license:r.line.license,quantity:r.line.quantity,expectedPriceMinor:r.price.priceMinor,expectedTerms:r.price.terms})).sort((a,b)=>a.productId.localeCompare(b.productId)||a.license.localeCompare(b.license));
      const policyIds=context!.policies.map(p=>p.id).sort();const payload={items,note:note.trim(),policyIds};const serialized=JSON.stringify(payload);
      if(retry.current?.payload!==serialized)retry.current={payload:serialized,...await attemptKey(userId,shop.id,payload)};
      const result=await placeFixedOrder({shopId:shop.id,...payload,key:retry.current.key,accepted});
      if(result.error==='login_required'){router.push(`/login?next=${encodeURIComponent(`/checkout/${shop.slug}`)}`);return;}
      if(result.error){setMessage(checkoutError(result.error));setAccepted(false);return;}
      if(!result.orderId)throw Error('unavailable');
      try{sessionStorage.removeItem(retry.current.storageKey)}catch{}
      clearShop(shop.id);router.push(`/account/orders/${result.orderId}`);router.refresh();
    }catch{setMessage('ยังยืนยันผลไม่ได้ กรุณากดลองอีกครั้ง ระบบจะใช้รายการเดิมเพื่อป้องกันคำสั่งซื้อซ้ำ')}
    finally{sending.current=false;setPending(false)}
  }
  return <div className="container page-pad commerce-page"><Link href="/cart" className="back-link"><ArrowLeft size={15}/> กลับไปแก้ตะกร้า</Link>
    <div className="commerce-heading"><div><div className="eyebrow">A THOUGHTFUL CHECKOUT</div><h1>ตรวจสอบ<em>คำสั่งซื้อ.</em></h1><p><Store size={16}/> {shop.name} · ตรวจสินค้าและเงื่อนไขก่อนยืนยัน</p></div></div>
    {!hydrated||loading?<div className="commerce-loading" role="status">กำลังตรวจสอบรายการ…</div>:error?<div className="commerce-empty"><h2>โหลดรายการไม่สำเร็จ</h2><button className="btn btn-outline" onClick={refresh}>ลองอีกครั้ง</button></div>:!selected.length?<div className="commerce-empty"><h2>ยังไม่มีสินค้าในร้านนี้</h2><Link href={`/shops/${shop.slug}`} className="btn btn-primary">เลือกผลงานจากร้าน <ArrowRight size={16}/></Link></div>:
    <form className="commerce-layout" onSubmit={submit}><div className="commerce-main"><div className="checkout-progress"><span className="complete">01 เลือกผลงาน</span><span className="active">02 ตรวจสอบ</span><span>03 จองสินค้า</span></div>
      <section className="commerce-card"><h2>ผลงานที่เลือก <span className="commerce-count">{rows.length} รายการ</span></h2>{rows.map(r=><div className="order-product-row" key={liveLineKey(r.line)}><span className="order-artwork" aria-hidden="true">✦</span><div><strong>{r.product.name}</strong><p>{r.line.license==='personal'?'Personal Use':'Commercial Use'} · {r.line.quantity} สิทธิ์</p><small>{r.price.terms}</small></div><strong>{publicPrice(r.subtotal)}</strong></div>)}
        {!valid?<p className="form-error" role="alert">บางรายการไม่พร้อมจำหน่ายตามจำนวนที่เลือก กรุณากลับไปแก้ตะกร้า</p>:null}</section>
      <section className="commerce-card"><h2><FileText size={19}/> ฝากข้อความถึงศิลปิน</h2><label className="field-label" htmlFor="buyer-note">หมายเหตุ (ไม่บังคับ)</label><textarea className="commerce-textarea" id="buyer-note" maxLength={2000} rows={3} disabled={pending} placeholder="บอกข้อมูลเพิ่มเติมที่คุณอยากให้ร้านทราบ…" value={note} onChange={e=>setNote(e.target.value)}/><span className="commerce-character-count">{note.length}/2000</span></section>
      <section className="commerce-card checkout-policies"><h2><ShieldCheck size={19}/> เงื่อนไขที่คุณตกลง</h2><p>เก็บฉบับที่คุณยอมรับไว้กับคำสั่งซื้อ</p>{context?.policies.map(p=><details key={p.id}><summary>{policyName(p)} <span>{p.scope==='shop'?'ร้านผู้ขาย':'Tidalis'} · ฉบับ {p.version}</span></summary>{p.source_type==='pdf'?(p.document_url?<a href={p.document_url} target="_blank" rel="noreferrer">อ่าน {p.document_name||'เอกสารนโยบาย'} ↗</a>:<p role="alert">เปิดเอกสารไม่ได้ กรุณาโหลดรายการใหม่</p>):<p>{p.content}</p>}</details>)}
        <label className="commerce-consent"><input type="checkbox" checked={accepted} disabled={pending||!canOrder} onChange={e=>setAccepted(e.target.checked)}/><span>ฉันอ่านและยอมรับ License และนโยบายฉบับที่แสดงข้างต้นแล้ว</span></label></section>
    </div><aside className="commerce-card commerce-summary"><div className="eyebrow">ORDER SUMMARY</div><h2>{shop.name}</h2><div className="amount-row"><span>จำนวนสิทธิ์</span><strong>{rows.reduce((s,r)=>s+r.line.quantity,0)}</strong></div><div className="commerce-total"><span>ยอดคำสั่งซื้อ</span><strong>{publicPrice(total)}</strong></div><div className="summary-assurance"><Clock3 size={20}/><p>จองสินค้า 30 นาที<br/>นับจากยืนยันคำสั่งซื้อ</p></div>
      {!context?.enabled?<div className="order-notice"><strong>เตรียมเปิดรับคำสั่งซื้อ</strong><p>ขณะนี้คุณเก็บสินค้าในตะกร้าได้ เมื่อระบบเปิดแล้วจึงยืนยันคำสั่งซื้อได้</p></div>:!context.eligible?<div className="order-notice"><strong>ร้านกำลังตั้งค่าระบบสั่งซื้อ</strong><p>โปรดกลับมาอีกครั้งเมื่อร้านพร้อม</p></div>:<div className="order-notice"><strong>การจองยังไม่ใช่การชำระเงิน</strong><p>ระบบชำระเงินและส่งมอบไฟล์ยังไม่เปิด โปรดอย่าโอนเงินสำหรับรายการจองนี้</p></div>}
      {message?<p className="form-message" role="alert">{message}</p>:null}
      {userId?<button type="submit" className="btn btn-primary wide" disabled={pending||!accepted||!canOrder}>{pending?'กำลังสร้างคำสั่งซื้อ…':'ยืนยันและจองสินค้า'} <ArrowRight size={17}/></button>:<Link className="btn btn-primary wide" href={`/login?next=${encodeURIComponent(`/checkout/${shop.slug}`)}`}>เข้าสู่ระบบเพื่อดำเนินการต่อ <ArrowRight size={17}/></Link>}
      <button type="button" className="commerce-refresh" disabled={pending} onClick={refresh}><RefreshCw size={14}/> ตรวจราคาและสต็อกอีกครั้ง</button>
    </aside></form>}
  </div>;
}
