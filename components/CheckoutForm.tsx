'use client';
import {useParams,useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {useMemo,useState,type ChangeEvent} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,FileText,Info,LockKeyhole,ShoppingBag,Store,UploadCloud,X,ShieldCheck} from 'lucide-react';
import {useCart} from '@/lib/cart';
import {resolveLines} from '@/lib/cart-utils';
import {getShop,products,priceFor,quantityLimit,money,type Product,type License} from '@/lib/catalog';

type CheckoutRow={product:Product;license:License;qty:number;subtotal:number};
const MAX_FILES=3;const MAX_FILE_BYTES=5*1024*1024;
export default function Checkout(){
  const params=useParams<{shop:string}>();const query=useSearchParams();const {lines,hydrated}=useCart();
  const [note,setNote]=useState('');const [brief,setBrief]=useState('');
  const [accepted,setAccepted]=useState(false);const [step,setStep]=useState<'details'|'review'>('details');
  const [refs,setRefs]=useState<File[]>([]);const [uploadError,setUploadError]=useState('');
  const seller=getShop(params.shop);
  const directId=query.get('product');const directProduct=directId?products.find(p=>p.id===directId&&p.shopSlug===params.shop):undefined;
  const isDirect=directId!==null;const isCommission=directProduct?.pricingMode==='quote';
  const saleLines=useMemo<CheckoutRow[]>(()=>{
    if(isDirect){
      if(!directProduct)return [];
      const license:License=query.get('license')==='commercial'?'commercial':'personal';
      const qtyRaw=Number(query.get('qty')||1);
      const qty=directProduct.pricingMode==='quote'?1:(Number.isSafeInteger(qtyRaw)?Math.min(Math.max(qtyRaw,1),quantityLimit(directProduct)):1);
      return [{product:directProduct,license,qty,subtotal:priceFor(directProduct,license)*qty}];
    }
    return resolveLines(lines).filter(x=>x.product.shopSlug===params.shop).map(x=>({product:x.product,license:x.line.license,qty:x.line.quantity,subtotal:x.subtotal}));
  },[directProduct,isDirect,lines,params.shop,query]);
  const total=saleLines.reduce((s,x)=>s+x.subtotal,0);
  const handleReferences=(e:ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(e.target.files||[]);e.target.value='';
    if(refs.length+files.length>MAX_FILES){setUploadError(`แนบไฟล์ตัวอย่างได้สูงสุด ${MAX_FILES} ไฟล์`);return}
    if(files.some(f=>f.size>MAX_FILE_BYTES || !(f.type.startsWith('image/')||f.type==='application/pdf'))){setUploadError('เลือกเฉพาะไฟล์ภาพหรือ PDF ขนาดไม่เกิน 5 MB ต่อไฟล์');return}
    setUploadError('');setRefs(old=>[...old,...files]);
  };
  const prevUrl=isDirect&&directProduct?`/products/${directProduct.slug}`:'/preview/cart';
  const ready=accepted&&(!isCommission||brief.trim().length>=15);
  return <div className="container page-pad checkout-width">
    <Link className="back-link" href={prevUrl}><ArrowLeft size={16}/> กลับไปแก้รายการ</Link>
    <div className="page-heading"><div className="eyebrow">CHECKOUT / {seller?.name.toUpperCase()||'UNKNOWN SHOP'} / PREVIEW</div><h1>{step==='details'?'Order details.':'Review order.'}</h1><p>ขั้นตอนตัวอย่างเท่านั้น · ยังไม่มีการสั่งซื้อหรือรับเงิน</p></div>
    {!seller||saleLines.length===0||(!isDirect&&!hydrated)?<div className="empty-state">{!hydrated&&!isDirect?'กำลังโหลดรายการ...':<>ไม่พบสินค้าสำหรับร้านนี้ <Link href="/shop">กลับไปเลือกสินค้า</Link></>}</div>:
    <div className="checkout-layout"><div className="checkout-main">
      <div className="stepper"><span className={step==='details'?'active':'complete'}>01 รายละเอียด</span><span className={step==='review'?'active':''}>02 ตรวจสอบ</span><span>03 ชำระเงิน (ปิดอยู่)</span></div>
      <div className="preview-banner"><ShieldCheck size={18}/> แต่ละร้าน Checkout แยกกัน · ข้อมูลในหน้านี้เป็นตัวอย่าง ยังไม่บันทึกลงฐานข้อมูล</div>
      <div className="panel"><h2><ShoppingBag size={19}/> สินค้าที่เลือก · {seller.name}</h2>
        {saleLines.map(x=><div className="checkout-line" key={`${x.product.id}:${x.license}`}><div className={`tiny-art product-art ${x.product.artClass}`}>{x.product.artEmoji}</div><div><strong>{x.product.name}</strong><p>{x.license==='commercial'?'Commercial Use':'Personal Use'} · จำนวน {x.qty}</p></div><strong>{money(x.subtotal)}</strong></div>)}
      </div>
      {step==='details'?<>
        <div className="panel"><h2><FileText size={19}/> {isCommission?'บรีฟงาน Commission':'หมายเหตุถึงร้านค้า'}</h2>
          {isCommission&&<><p className="field-explain">อธิบายตัวละคร ท่าทาง สี ฉาก และข้อกำหนดที่ศิลปินต้องพิจารณาเพื่อเสนอราคาจริง</p><label className="field-label" htmlFor="brief">บรีฟงานวาด <span aria-hidden="true">*</span></label><textarea id="brief" value={brief} onChange={e=>setBrief(e.target.value)} rows={6} maxLength={4000} placeholder={'เช่น ตัวละครผมสีเงิน / ชุดแฟนตาซี / ท่ายืนถือดาบ / ฉากกลางคืน'} required/><small>{brief.length}/4000 อักขระ · โปรดระบุอย่างน้อย 15 อักขระ</small>
          <label className="field-label" htmlFor="references">ไฟล์อ้างอิง (เลือกได้ · พรีวิวในเครื่องเท่านั้น)</label><label className="reference-upload" htmlFor="references"><UploadCloud size={22}/><span>เลือกภาพหรือ PDF สูงสุด {MAX_FILES} ไฟล์ · ไม่เกิน 5 MB/ไฟล์</span><input type="file" id="references" accept="image/*,application/pdf" multiple onChange={handleReferences}/></label>
          {uploadError&&<p role="alert" className="form-error">{uploadError}</p>}
          {refs.length>0&&<ul className="reference-file-list">{refs.map((file,i)=><li key={`${file.name}-${i}`}><span>{file.name}</span><button type="button" aria-label={`ลบ ${file.name}`} onClick={()=>setRefs(old=>old.filter((_,index)=>index!==i))}><X size={15}/></button></li>)}</ul>}
          <div className="hint-line"><Info size={15}/> ไฟล์เหล่านี้ยังไม่ถูกอัปโหลดหรือส่งให้ร้านค้า</div></>}
          <label className="field-label" htmlFor="orderNote">หมายเหตุเพิ่มเติม (ไม่บังคับ)</label><textarea id="orderNote" value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} rows={3} placeholder="รายละเอียดเพิ่มเติมที่ต้องการแจ้งผู้ขาย..."/>
        </div>
        <div className="panel"><h2><LockKeyhole size={19}/> ตรวจสอบนโยบายก่อนสั่งซื้อ</h2>
          <p>ร้าน <Link href={`/shops/${seller.slug}`}>{seller.name}</Link> จะต้องเผยแพร่เงื่อนไข License, ระยะเวลาส่งมอบและนโยบายคืนเงินของตนเอง ก่อนเปิดรับคำสั่งซื้อจริง</p>
          <p>นอกจากนี้ยังมี <Link href="/policies/terms">ข้อกำหนดแพลตฟอร์ม</Link> และ <Link href="/policies/payment-refund">กรอบการชำระเงินและคืนเงิน</Link></p>
          <label className="checkbox-label"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>รับทราบว่าหน้านี้เป็นพรีวิว และยังไม่ใช่การยอมรับนโยบายสำหรับออเดอร์จริง</span></label>
          <small>ระบบจริงต้องแสดงนโยบายผู้ขายฉบับที่มีผลและบันทึกการยอมรับพร้อมเวอร์ชันในฐานข้อมูล</small>
        </div>
        <button className="btn btn-primary wide" disabled={!ready} onClick={()=>{setStep('review');window.scrollTo({top:0,behavior:'smooth'})}}>ตรวจสอบรายละเอียด <ArrowRight size={17}/></button>
      </>:<>
        <div className="panel"><h2><CheckCircle2 size={19}/> ตรวจสอบก่อนดำเนินการจริง</h2>
          {isCommission&&<><b>บรีฟงานวาด</b><p className="multiline">{brief}</p><b>ไฟล์อ้างอิง (ไม่ได้อัปโหลด)</b><p>{refs.length?refs.map(f=>f.name).join(' · '):'ไม่มีไฟล์แนบ'}</p></>}
          <b>หมายเหตุเพิ่มเติม</b><p className="multiline">{note||'ไม่มีหมายเหตุเพิ่มเติม'}</p>
          <div className="checkout-reminder">{isCommission?'ในระบบจริง: ส่งบรีฟ → ศิลปินเสนอราคา → ผู้ซื้อยืนยันราคา → จึงเริ่มขั้นตอนชำระเงิน':'ในระบบจริง: ตรวจสต็อกและสิทธิ์ → สร้างคำสั่งซื้อ → โอนเข้าร้านโดยตรง → แนบหลักฐาน → ร้านตรวจเงิน → เปิดสิทธิ์ดาวน์โหลด'}</div>
        </div>
        <div className="button-row"><button className="btn btn-ghost" onClick={()=>setStep('details')}>กลับไปแก้ไข</button><button className="btn btn-primary" disabled title="รอเชื่อมต่อ Backend, การยืนยันตัวตน และกระบวนการชำระเงินจริง">{isCommission?'ส่งบรีฟจริง':'ยืนยันซื้อจริง'} (ยังไม่เปิด)</button></div>
        <p className="demo-warning">โหมดพรีวิวไม่สร้างออเดอร์ ไม่ล็อกสต็อก ไม่ส่งไฟล์ และไม่ตัดหรือรับเงิน</p>
      </>}
    </div><aside className="checkout-summary"><div className="eyebrow">ORDER PREVIEW</div><h3>{seller.name}</h3><div className="amount-row"><span>ยอดสินค้า</span><strong>{money(total)}</strong></div>
      {isCommission?<p>เป็นเพียงราคาเริ่มต้น รอศิลปินเสนอราคา ไม่ใช่ยอดที่ต้องโอน</p>:<p>ราคา License ตัวอย่าง · VAT จะแสดงเฉพาะเมื่อร้านผ่านการตรวจสอบและกฎหมายกำหนด</p>}
      <div className="divider"/><div className="amount-row grand"><span>{isCommission?'ราคาเริ่มต้น':'ยอดก่อนคำนวณภาษี'}</span><strong>{money(total)}</strong></div>
      <p className="helper"><LockKeyhole size={14}/> ชำระตรงถึงบัญชีผู้ขาย หลังเปิดระบบธุรกรรมจริงเท่านั้น</p>
      <Link href={`/shops/${seller.slug}`} className="text-link"><Store size={14}/> หน้าร้านผู้ขาย</Link>
    </aside></div>}
  </div>;
}
