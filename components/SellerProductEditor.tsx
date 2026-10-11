'use client';
import {useState,useRef} from 'react';
import Link from 'next/link';
import {useFormStatus} from 'react-dom';
import {saveSellerProductDraft} from '@/app/seller/products/actions';

type WorkType={id:string;name:string};
type ProductData={id:string;name:string;slug:string;description:string;product_type:string;
  work_type_id:string|null;is_exclusive:boolean;stock:number|null;currency?:string;};
type License={usage_type:string;price_minor:number;terms:string};

function SubmitDraft(){const {pending}=useFormStatus();return <button type="submit" className="btn btn-primary" disabled={pending}>{pending?'กำลังบันทึก…':'บันทึกสินค้าแบบ Draft'}</button>}
export function SellerProductEditor({product,workTypes,licenses}: {product?:ProductData|null;workTypes:WorkType[];licenses?:License[]}){
  const [mode,setMode]=useState(product?.product_type||'digital_asset');
  const [exclusive,setExclusive]=useState(Boolean(product?.is_exclusive));
  const [name,setName]=useState(product?.name||'');
  const [slug,setSlug]=useState(product?.slug||'');
  const [slugEdited,setSlugEdited]=useState(Boolean(product));
  const generatedSlug=useRef('');
  const [currency,setCurrency]=useState(product?.currency||'THB');
  const lic=(usage:string)=>licenses?.find(x=>x.usage_type===usage);
  const baht=(minor?:number)=>minor===undefined?'':(minor/100).toFixed(2);
  function changeName(value:string){setName(value);if(!slugEdited){const latin=value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').slice(0,80);if(!generatedSlug.current)generatedSlug.current='artwork-'+crypto.randomUUID().slice(0,8);setSlug(latin.length>=3?latin:(value.trim()?generatedSlug.current:''));}}
  function changeMode(value:string){setMode(value);if(value!=='ready_made')setExclusive(false)}
  return <form action={saveSellerProductDraft} className="phase5-form">
    {product&&<input type="hidden" name="productId" value={product.id}/>}
    <section className="phase5-panel">
      <div className="eyebrow">01 / PRODUCT MODE</div><h2>ประเภทผลงาน</h2>
      <div className="phase5-mode-grid">
        {[['commission','Commission','รับบรีฟงานวาด · ราคาเริ่มต้นและเสนอราคาอีกครั้ง'],['ready_made','Ready-made','งานวาดสำเร็จ · ราคาคงที่ ซื้อได้ตาม License'],['digital_asset','Digital Asset','ไฟล์สำหรับดาวน์โหลด เช่น Brush / PSD / PNG']].map(([value,title,detail])=><label key={value} className={`phase5-mode ${mode===value?'active':''}`}>
          <input type="radio" name="productType" value={value} checked={mode===value} onChange={()=>changeMode(value)} required/>
          <strong>{title}</strong><small>{detail}</small>
        </label>)}
      </div>
    </section>
    <section className="phase5-panel"><div className="eyebrow">02 / ARTWORK</div><h2>รายละเอียดผลงาน</h2>
      <div className="phase5-form-grid"><label>ชื่อสินค้า<input name="name" value={name} onChange={e=>changeName(e.target.value)} required minLength={3} maxLength={120} placeholder="เช่น Custom Fantasy Character"/></label>
      <label>URL Slug (a-z, 0-9, -)<input name="slug" value={slug} onChange={e=>{setSlug(e.target.value.toLowerCase());setSlugEdited(true)}} pattern="[a-z0-9-]{3,80}" required maxLength={80} placeholder="custom-fantasy-character"/></label></div>
      <label>ประเภทงานที่ร้านกำหนดเอง<select name="workTypeId" defaultValue={product?.work_type_id||''}><option value="">ยังไม่เลือกประเภทงาน</option>{workTypes.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <p className="phase5-help">ยังไม่มีประเภทงานที่ต้องการ? <Link href="/seller/work-types">สร้างประเภทงานของร้าน</Link> แล้วกลับมาสร้างสินค้า</p>
      <label>คำอธิบาย ขอบเขตงาน และสิ่งที่จะได้รับ<textarea name="description" rows={7} maxLength={10000} defaultValue={product?.description||''} placeholder="รายละเอียดผลงาน ขนาดไฟล์ ขั้นตอนวาด จำนวนครั้งแก้งาน…"/></label>
      {mode==='commission'?<div className="phase5-note">สำหรับ Commission ราคาที่แสดงเป็นราคาเริ่มต้น ไม่ถือว่าเป็นราคาสุดท้าย ลูกค้าต้องได้รับใบเสนอราคาก่อนชำระเงิน</div>:
       <div className="phase5-form-grid"><label className="phase5-check"><input type="checkbox" name="exclusive" checked={exclusive} onChange={e=>setExclusive(e.target.checked)} disabled={mode!=='ready_made'}/> <span>Exclusive Artwork · ขายได้เพียง 1 ครั้ง</span></label>
       <label>จำนวนสต็อก {mode==='digital_asset'?'(เว้นว่าง = ไม่จำกัด)':'(กำหนดจำนวน)'}<input type="number" min="0" max="100000" name="stock" required={exclusive} value={exclusive?'1':undefined} defaultValue={!exclusive&&product?.stock!==null?product?.stock:undefined} readOnly={exclusive} key={`${mode}-${exclusive}`} placeholder="เว้นว่างได้"/></label></div>}
    </section>
    <section className="phase5-panel"><div className="eyebrow">03 / LICENSE</div><h2>กำหนดราคาตามสิทธิ์</h2>
      <p>ราคา Personal และ Commercial กำหนดแยกกันได้ ไม่ใช้ตัวคูณอัตโนมัติ และ Commercial Use ไม่ได้หมายถึงการโอนลิขสิทธิ์ทั้งหมด</p>
      <label>สกุลเงินของสินค้า<select name="currency" value={currency} onChange={e=>setCurrency(e.target.value)}><option value="THB">THB · บาทไทย</option><option value="LAK">LAK · กีบลาว</option><option value="USD">USD · ดอลลาร์สหรัฐ</option></select></label><p className="phase5-help">ราคาทั้งสองสิทธิ์ใช้สกุลเงินเดียวกัน ระบบไม่แปลงค่าเงิน</p><div className="phase5-license-grid">
        {[['personal','Personal Use','ใช้ส่วนตัว'],['commercial','Commercial Use','ใช้เชิงพาณิชย์ตามเงื่อนไข']].map(([key,title,detail])=><div key={key} className="phase5-license-card"><h3>{title}</h3><p>{detail}</p>
          <label>ราคา{mode==='commission'?'เริ่มต้น':''} ({currency})<input name={`${key}Price`} type="number" min="0" max="10000000" step="0.01" required defaultValue={baht(lic(key)?.price_minor)} placeholder="0.00"/></label>
          <label>เงื่อนไขสิทธิ์<textarea name={`${key}Terms`} rows={4} maxLength={2500} defaultValue={lic(key)?.terms||''} placeholder="อนุญาตให้ใช้งานอะไร และไม่อนุญาตอะไร…"/></label>
        </div>)}
      </div>
    </section>
    <div className="phase5-save-bar"><div><strong>จัดเก็บเป็น Draft เท่านั้น</strong><small>ขั้นตอนถัดไป: อัปโหลดไฟล์ → ส่งตรวจ → เผยแพร่</small></div><SubmitDraft/></div>
  </form>;
}
