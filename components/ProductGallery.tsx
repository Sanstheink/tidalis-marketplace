'use client';
import {useEffect,useState} from 'react';
import type {Product} from '@/lib/catalog';
import {ChevronLeft,ChevronRight,Expand,X} from 'lucide-react';
const VIEWS=[{sigil:'✦',label:'ภาพหลัก'},{sigil:'✧',label:'รายละเอียดผลงาน'},{sigil:'☾',label:'ภาพประกอบ'}];
export function ProductGallery({product}:{product:Product}){
  const [view,setView]=useState(0);const [lightbox,setLightbox]=useState(false);
  const go=(delta:number)=>setView(v=>(v+delta+VIEWS.length)%VIEWS.length);
  useEffect(()=>{if(!lightbox)return;const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')setLightbox(false);if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[lightbox]);
  return <div className="gallery"><div className="gallery-stage"><button type="button" onClick={()=>setLightbox(true)} className={`gallery-feature product-art ${product.artClass} gallery-view-${view}`} aria-label={`ดูภาพ ${view+1} ของ ${product.name} ขนาดใหญ่`}><span className="gallery-sigil" aria-hidden>{view===0?product.artEmoji:VIEWS[view].sigil}</span><span className="gallery-label">{product.name.toUpperCase()}</span><span className="zoom-hint"><Expand size={16}/> ขยายภาพ</span></button>
    <span className="gallery-index">{String(view+1).padStart(2,'0')} / {String(VIEWS.length).padStart(2,'0')}</span></div>
    <div className="gallery-thumbs" role="group" aria-label="ภาพตัวอย่างสินค้า">{VIEWS.map((item,i)=><button type="button" key={item.label} aria-pressed={view===i} aria-label={`เลือก${item.label}`} onClick={()=>setView(i)} className={`gallery-thumb product-art ${product.artClass} gallery-view-${i} ${view===i?'active':''}`}><span>{i===0?product.artEmoji:item.sigil}</span></button>)}</div>
    <p className="gallery-disclaimer">ภาพจำลองงานศิลปะเพื่อทดสอบดีไซน์ ยังไม่มีไฟล์ภาพผลงานจากผู้ขายจริง</p>
    {lightbox&&<div className="lightbox" role="dialog" aria-modal="true" aria-label={`ภาพตัวอย่างสินค้า ${product.name}`} onMouseDown={e=>{if(e.target===e.currentTarget)setLightbox(false)}}><button autoFocus onClick={()=>setLightbox(false)} className="lightbox-close" aria-label="ปิดภาพ"><X/></button><button className="lightbox-prev" onClick={()=>go(-1)} aria-label="ภาพก่อนหน้า"><ChevronLeft/></button><div className={`product-art lightbox-art ${product.artClass} gallery-view-${view}`}><span>{view===0?product.artEmoji:VIEWS[view].sigil}</span></div><button className="lightbox-next" onClick={()=>go(1)} aria-label="ภาพถัดไป"><ChevronRight/></button><p>{product.name} — {VIEWS[view].label} ({view+1}/{VIEWS.length}) · Placeholder</p></div>}
  </div>;
}
