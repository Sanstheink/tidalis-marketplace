'use client';
import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowLeft,ArrowRight,Clock3,FileText,ShieldCheck,Store,RefreshCw} from 'lucide-react';
import {placeFixedOrder,recoverFixedOrder} from '@/app/checkout/actions';
import {checkoutAttempt,storedCheckoutAttempt,recoveredCartKeys,type CheckoutAttempt,type RecoveredFixedOrder} from '@/lib/checkout-attempt';
import {useMarketplaceCart} from '@/lib/marketplace-cart';
import {checkoutError,checkoutRows,checkoutStockValid,liveLineKey,type OrderItemInput,type CheckoutPolicy} from '@/lib/marketplace-cart-utils';
import {publicPrice,type PublicShop} from '@/lib/public-catalog-shared';
import {useLiveCheckout} from './MarketplaceCartView';
export const policyName=(p:CheckoutPolicy)=>({refund:'การยกเลิกและคืนเงิน',delivery:'การส่งมอบงาน',license:'สิทธิ์การใช้งาน',terms:'ข้อกำหนดการใช้บริการ',privacy:'ความเป็นส่วนตัว','seller-agreement':'ข้อตกลงผู้ขาย','payment-refund':'การชำระเงินและคืนเงิน',copyright:'ลิขสิทธิ์'} as Record<string,string>)[p.policy_type]||p.policy_type;
export default function FixedCheckout({shop,userId}:{shop:PublicShop;userId:string|null}){
  const {lines,hydrated,remove}=useMarketplaceCart();const selected=lines.filter(l=>l.shopId===shop.id);
  const {contexts,loading,error,reload}=useLiveCheckout(selected,hydrated);const context=contexts[shop.id];
  const [selectedCurrency,setSelectedCurrency]=useState<string|null>(null);const [note,setNote]=useState('');const [accepted,setAccepted]=useState(false);const [pending,setPending]=useState(false);const [message,setMessage]=useState('');const sending=useRef(false);const router=useRouter();
  const [checking,setChecking]=useState(true),[recoveryError,setRecoveryError]=useState(false),[recoveryRevision,setRecoveryRevision]=useState(0);
  const [recovered,setRecovered]=useState<{order:RecoveredFixedOrder;attempt:CheckoutAttempt}|null>(null);
  useEffect(()=>{
    let active=true;setChecking(true);setRecoveryError(false);setRecovered(null);
    async function recover(){
      if(!userId)return;
      const attempt=storedCheckoutAttempt(userId,shop.id,sessionStorage);if(!attempt)return;
      const result=await recoverFixedOrder(shop.id,attempt.key);if(result.error)throw Error(result.error);
      if(active&&result.order)setRecovered({order:result.order,attempt});
    }
    void recover().catch(()=>{if(active)setRecoveryError(true)}).finally(()=>{if(active)setChecking(false)});
    return ()=>{active=false};
  },[userId,shop.id,recoveryRevision]);
  const allRows=context?checkoutRows(selected,context):[];const availableCurrencies=[...new Set(allRows.map(r=>r.product.currency||'THB'))];const currency=selectedCurrency&&availableCurrencies.includes(selectedCurrency)?selectedCurrency:availableCurrencies[0];const rows=allRows.filter(r=>(r.product.currency||'THB')===currency);const total=rows.reduce((s,r)=>s+r.subtotal,0);
  const valid=allRows.length===selected.length&&rows.length>0&&checkoutStockValid(rows)&&new Set(rows.map(r=>r.product.currency||'THB')).size===1;
  const policiesReady=context?.policies.length===8&&context.policies.every(p=>p.source_type!=='pdf'||p.document_url);
  const paymentReady=total===0||Boolean(context?.paymentMethods?.[currency]?.length);
  const canOrder=Boolean(!checking&&!recoveryError&&!recovered&&context?.enabled&&context.eligible&&valid&&policiesReady&&paymentReady);
  function openRecovered(){
    if(!recovered)return;
    for(const key of recoveredCartKeys(lines,shop.id,recovered.order))remove(key);
    try{sessionStorage.removeItem(recovered.attempt.storageKey)}catch{}
    router.push(`/account/orders/${recovered.order.orderId}`);router.refresh();
  }
  function refresh(){setAccepted(false);setMessage('');reload()}
  async function submit(event:FormEvent){
    event.preventDefault();if(sending.current||!accepted||!canOrder)return;
    if(!userId){router.push(`/login?next=${encodeURIComponent(`/checkout/${shop.slug}`)}`);return;}
    sending.current=true;setPending(true);setMessage('');
    try{
      const previous=storedCheckoutAttempt(userId,shop.id,sessionStorage);
      if(previous){
        const result=await recoverFixedOrder(shop.id,previous.key);
        if(result.error){setRecoveryError(true);return;}
        if(result.order){setRecovered({order:result.order,attempt:previous});return;}
      }
      const items:OrderItemInput[]=rows.map(r=>({productId:r.product.id,license:r.line.license,quantity:r.line.quantity,expectedPriceMinor:r.price.priceMinor,expectedTerms:r.price.terms,expectedCurrency:r.product.currency||'THB'})).sort((a,b)=>a.productId.localeCompare(b.productId)||a.license.localeCompare(b.license));
      const policyIds=context!.policies.map(p=>p.id).sort();const payload={items,note:note.trim(),policyIds};
      let attempt:CheckoutAttempt;
      try{attempt=await checkoutAttempt(userId,shop.id,payload,sessionStorage)}catch{setMessage('ยังบันทึกรหัสคำขอในเบราว์เซอร์ไม่ได้ กรุณาอนุญาตพื้นที่จัดเก็บแล้วลองใหม่');return;}
      const result=await placeFixedOrder({shopId:shop.id,...payload,key:attempt.key,accepted});
      if(result.error==='login_required'){router.push(`/login?next=${encodeURIComponent(`/checkout/${shop.slug}`)}`);return;}
      if(result.error){setMessage(checkoutError(result.error));setAccepted(false);return;}
      if(!result.orderId)throw Error('unavailable');
      try{sessionStorage.removeItem(attempt.storageKey)}catch{}
      for(const row of rows)remove(liveLineKey(row.line));router.push(`/account/orders/${result.orderId}`);router.refresh();
    }catch{setMessage('ยังยืนยันผลไม่ได้ กรุณากดลองอีกครั้ง ระบบจะใช้รายการเดิมเพื่อป้องกันคำสั่งซื้อซ้ำ')}
    finally{sending.current=false;setPending(false)}
  }
  return <div className="container page-pad commerce-page"><Link href="/cart" className="back-link"><ArrowLeft size={15}/> กลับไปแก้ตะกร้า</Link>
    <div className="commerce-heading"><div><div className="eyebrow">A THOUGHTFUL CHECKOUT</div><h1>ตรวจสอบ<em>คำสั่งซื้อ.</em></h1><p><Store size={16}/> {shop.name} · ตรวจสินค้าและเงื่อนไขก่อนยืนยัน</p></div></div>
    {checking?<p role="status">กำลังตรวจสอบคำสั่งซื้อก่อนหน้า…</p>:recoveryError?<section className="commerce-card" role="alert"><p>ยังตรวจสอบคำสั่งซื้อก่อนหน้าไม่ได้ กรุณาตรวจการเชื่อมต่อและอนุญาตพื้นที่จัดเก็บของเบราว์เซอร์ก่อนลองใหม่</p><button type="button" className="btn btn-outline" onClick={()=>setRecoveryRevision(r=>r+1)}>ตรวจสอบคำสั่งซื้อเดิมอีกครั้ง</button> <Link href="/account/orders">ดูคำสั่งซื้อของฉัน</Link></section>:recovered?<section className="commerce-card" role="status"><h2>พบคำสั่งซื้อที่บันทึกแล้ว</h2><p>ระบบบันทึกคำขอก่อนหน้าแล้ว เปิดรายการเดิมเพื่อตรวจสถานะและดำเนินการต่อ</p><button type="button" className="btn btn-primary" onClick={openRecovered}>ดูคำสั่งซื้อที่บันทึกแล้ว</button></section>:null}
    {!hydrated||loading?<div className="commerce-loading" role="status">กำลังตรวจสอบรายการ…</div>:error?<div className="commerce-empty"><h2>โหลดรายการไม่สำเร็จ</h2><button className="btn btn-outline" onClick={refresh}>ลองอีกครั้ง</button></div>:!selected.length?<div className="commerce-empty"><h2>ยังไม่มีสินค้าในร้านนี้</h2><Link href={`/shops/${shop.slug}`} className="btn btn-primary">เลือกผลงานจากร้าน <ArrowRight size={16}/></Link></div>:
    <form className="commerce-layout" onSubmit={submit}><div className="commerce-main"><div className="checkout-progress"><span className="complete">01 เลือกผลงาน</span><span className="active">02 ตรวจสอบ</span><span>03 ชำระและรับไฟล์</span></div>
      <section className="commerce-card">{availableCurrencies.length>1?<label className="currency-selector">เลือกสกุลเงินที่จะสั่งซื้อ<select value={currency} disabled={pending} onChange={e=>{setSelectedCurrency(e.target.value);setAccepted(false);setMessage('')}}>{availableCurrencies.map(c=><option key={c} value={c}>{c}</option>)}</select><small>สินค้าอีกสกุลเงินจะยังอยู่ในตะกร้าเพื่อสั่งซื้อแยก</small></label>:null}<h2>ผลงานที่เลือก <span className="commerce-count">{rows.length} รายการ</span></h2>{rows.map(r=><div className="order-product-row" key={liveLineKey(r.line)}><span className="order-artwork" aria-hidden="true">✦</span><div><strong>{r.product.name}</strong><p>{r.line.license==='personal'?'Personal Use':'Commercial Use'} · {r.line.quantity} สิทธิ์</p><small>{r.price.terms}</small></div><strong>{publicPrice(r.subtotal,r.product.currency)}</strong></div>)}
        {!valid?<p className="form-error" role="alert">ตรวจจำนวนสินค้าและสกุลเงินให้ตรงกันก่อนดำเนินการ กรุณากลับไปแก้ตะกร้า</p>:null}</section>
      <section className="commerce-card"><h2><FileText size={19}/> ฝากข้อความถึงศิลปิน</h2><label className="field-label" htmlFor="buyer-note">หมายเหตุ (ไม่บังคับ)</label><textarea className="commerce-textarea" id="buyer-note" maxLength={2000} rows={3} disabled={pending} placeholder="บอกข้อมูลเพิ่มเติมที่คุณอยากให้ร้านทราบ…" value={note} onChange={e=>setNote(e.target.value)}/><span className="commerce-character-count">{note.length}/2000</span></section>
      <section className="commerce-card checkout-policies"><h2><ShieldCheck size={19}/> เงื่อนไขที่คุณตกลง</h2><p>เก็บฉบับที่คุณยอมรับไว้กับคำสั่งซื้อ</p>{context?.policies.map(p=><details key={p.id}><summary>{policyName(p)} <span>{p.scope==='shop'?'ร้านผู้ขาย':'Tidalis'} · ฉบับ {p.version}</span></summary>{p.source_type==='pdf'?(p.document_url?<a href={p.document_url} target="_blank" rel="noreferrer">อ่าน {p.document_name||'เอกสารนโยบาย'} ↗</a>:<p role="alert">เปิดเอกสารไม่ได้ กรุณาโหลดรายการใหม่</p>):<p>{p.content}</p>}</details>)}
        <label className="commerce-consent"><input type="checkbox" checked={accepted} disabled={pending||!canOrder} onChange={e=>setAccepted(e.target.checked)}/><span>ฉันอ่านและยอมรับ License และนโยบายฉบับที่แสดงข้างต้นแล้ว</span></label></section>
    </div><aside className="commerce-card commerce-summary"><div className="eyebrow">ORDER SUMMARY</div><h2>{shop.name}</h2><div className="amount-row"><span>จำนวนสิทธิ์</span><strong>{rows.reduce((s,r)=>s+r.line.quantity,0)}</strong></div><div className="commerce-total"><span>ยอดคำสั่งซื้อ</span><strong>{publicPrice(total,rows[0]?.product.currency)}</strong></div><div className="summary-assurance"><Clock3 size={20}/><p>จองสินค้า 30 นาที<br/>นับจากยืนยันคำสั่งซื้อ</p></div>
      {!context?.enabled?<div className="order-notice"><strong>เตรียมเปิดรับคำสั่งซื้อ</strong><p>ขณะนี้คุณเก็บสินค้าในตะกร้าได้ เมื่อระบบเปิดแล้วจึงยืนยันคำสั่งซื้อได้</p></div>:!context.eligible?<div className="order-notice"><strong>ร้านกำลังตั้งค่าระบบสั่งซื้อ</strong><p>โปรดกลับมาอีกครั้งเมื่อร้านพร้อม</p></div>:!paymentReady?<div className="order-notice"><strong>ร้านกำลังตั้งค่ารับเงิน {currency}</strong><p>เมื่อร้านเพิ่มบัญชีหรือ QR สำหรับสกุลเงินนี้แล้ว จึงยืนยันคำสั่งซื้อได้</p></div>:<div className="order-notice"><strong>การจองยังไม่ใช่การชำระเงิน</strong><p>เมื่อยืนยันรายการแล้ว ให้เลือกช่องทางรับเงินของร้าน ผู้รับเงินจะยืนยันยอดก่อนส่งมอบไฟล์</p></div>}
      {message?<p className="form-message" role="alert">{message}</p>:null}
      {userId?<button type="submit" className="btn btn-primary wide" disabled={pending||!accepted||!canOrder}>{pending?'กำลังสร้างคำสั่งซื้อ…':'ยืนยันและจองสินค้า'} <ArrowRight size={17}/></button>:<Link className="btn btn-primary wide" href={`/login?next=${encodeURIComponent(`/checkout/${shop.slug}`)}`}>เข้าสู่ระบบเพื่อดำเนินการต่อ <ArrowRight size={17}/></Link>}
      <button type="button" className="commerce-refresh" disabled={pending} onClick={refresh}><RefreshCw size={14}/> ตรวจราคาและสต็อกอีกครั้ง</button>
    </aside></form>}
  </div>;
}
