'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {FileUp,LockKeyhole,Image as ImageIcon,PackageCheck} from 'lucide-react';
import {supabaseBrowser} from '@/lib/supabase/browser';

const BUCKET='tidalis-product-files';
const imageExtensions=new Set(['png','jpg','jpeg','webp']);
const deliveryExtensions=new Set(['png','jpg','jpeg','webp','zip','pdf','psd','clip','kra']);
const MIME:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',zip:'application/zip',pdf:'application/pdf',psd:'application/octet-stream',clip:'application/octet-stream',kra:'application/octet-stream'};
type ExistingFile={id:string;file_path:string;is_delivery_file:boolean;url:string|null};
export function SellerProductFiles({shopId,productId,files,productType,elevated}: {shopId:string;productId:string;files:ExistingFile[];productType:string;elevated:boolean}){
  const [busy,setBusy]=useState<'preview'|'delivery'|null>(null);
  const [message,setMessage]=useState('');
  const previewInput=useRef<HTMLInputElement>(null);
  const deliveryInput=useRef<HTMLInputElement>(null);
  const router=useRouter();
  const previews=files.filter(f=>!f.is_delivery_file);
  const deliveries=files.filter(f=>f.is_delivery_file);
  async function upload(file:File|undefined,kind:'preview'|'delivery'){
    if(!file)return;
    if(kind==='delivery'&&!elevated){setMessage('กรุณายืนยัน Authenticator (AAL2) ก่อนอัปโหลดไฟล์ส่งมอบ');return;}
    const extension=file.name.split('.').pop()?.toLowerCase()||'';
    const allowed=kind==='preview'?imageExtensions:deliveryExtensions;
    const limit=kind==='preview'?8*1024*1024:25*1024*1024;
    if(!allowed.has(extension)||file.size===0||file.size>limit){setMessage(`ไฟล์ไม่ถูกต้อง: ${kind==='preview'?'ภาพ JPG/PNG/WebP สูงสุด 8MB':'ไฟล์ส่งมอบสูงสุด 25MB'} เท่านั้น`);return}
    if((kind==='preview'?previews.length:deliveries.length)>=(kind==='preview'?6:3)){setMessage('ไฟล์ประเภทนี้ครบจำนวนที่กำหนดแล้ว');return}
    const client=supabaseBrowser();if(!client){setMessage('ยังไม่ได้เชื่อม Supabase Auth');return}
    setBusy(kind);setMessage('');
    const folder=kind==='preview'?'previews':'deliverables';
    const path=`shops/${shopId}/products/${productId}/${folder}/${crypto.randomUUID()}.${extension}`;
    try {
    const {error:uploadError}=await client.storage.from(BUCKET).upload(path,file,{contentType:MIME[extension],cacheControl:'3600',upsert:false});
    if(uploadError){setMessage('อัปโหลดไม่สำเร็จ: '+uploadError.message);setBusy(null);return}
    const {error:attachError}=await client.rpc('attach_seller_product_file',{p_product_id:productId,p_file_path:path,p_is_delivery_file:kind==='delivery'});
    if(attachError){setMessage('ไฟล์อัปโหลดแล้วแต่ยังบันทึกรายการไม่สำเร็จ โปรดติดต่อผู้ดูแลให้ตรวจไฟล์ค้างใน Private Storage: '+attachError.message);setBusy(null);return}
    setMessage('บันทึกไฟล์เข้าพื้นที่ส่วนตัวของร้านเรียบร้อยแล้ว');
    if(previewInput.current)previewInput.current.value='';
    if(deliveryInput.current)deliveryInput.current.value='';
    router.refresh();
    }catch{setMessage('การเชื่อมต่อถูกขัดจังหวะ โปรดตรวจรายการไฟล์ก่อนอัปโหลดซ้ำ');}
    finally{setBusy(null)}
  }
  return <section className="phase5-panel phase5-files"><div className="eyebrow">04 / PRIVATE STORAGE</div>
    <h2>ไฟล์ผลงาน <LockKeyhole size={22}/></h2>
    <p>ภาพตัวอย่างจะแสดงเมื่อสินค้าเผยแพร่แล้ว ไฟล์ส่งมอบเก็บในพื้นที่ <strong>Private</strong> และดาวน์โหลดได้เฉพาะผู้ซื้อที่ได้รับสิทธิ์แล้ว การจัดการไฟล์ส่งมอบต้องยืนยัน Authenticator</p>
    <div className="phase5-file-grid">
      <div className="phase5-file-group"><h3><ImageIcon size={18}/> ภาพตัวอย่างสินค้า</h3><p>JPG, PNG, WebP · ไม่เกิน 8MB/ไฟล์ · สูงสุด 6 ไฟล์</p>
        <div className="phase5-preview-grid">{previews.map(file=><div key={file.id} className="phase5-preview-tile">{file.url?<a href={file.url} target="_blank" rel="noopener noreferrer"><img src={file.url} alt="ตัวอย่างผลงานที่อัปโหลด"/></a>:<span>ไม่มีสิทธิ์เปิดไฟล์</span>}</div>)}{previews.length===0&&<div className="phase5-file-empty">ยังไม่มีภาพตัวอย่าง</div>}</div>
        <input ref={previewInput} id="phase5-preview-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0],'preview')} disabled={Boolean(busy)||previews.length>=6}/>
        <label htmlFor="phase5-preview-upload" className="btn btn-outline phase5-upload-label"><FileUp size={16}/> {busy==='preview'?'กำลังอัปโหลด…':'เพิ่มภาพตัวอย่าง'}</label>
      </div>
      <div className="phase5-file-group"><h3><PackageCheck size={18}/> ไฟล์ต้นฉบับ / ไฟล์ส่งมอบ</h3>
        {productType==='commission'?<p>Commission ยังไม่อัปโหลดไฟล์ส่งมอบที่นี่ เพราะต้องส่งในขั้นตอน Order หลังงานเสร็จ</p>:<><p>ZIP, PSD, CLIP, KRA, PDF หรือไฟล์ภาพ · สูงสุด 25MB/ไฟล์ · ไม่เกิน 3 ไฟล์</p>{!elevated&&<p><a className="text-link" href={`/mfa?next=${encodeURIComponent(`/seller/products/${productId}`)}`}>ยืนยัน MFA เพื่อจัดการไฟล์ส่งมอบ →</a></p>}
          <div className="phase5-file-list">{deliveries.length?deliveries.map(f=><div key={f.id}><LockKeyhole size={14}/><span>{f.file_path.split('/').pop()}</span>{f.url&&<a href={f.url} target="_blank" rel="noopener noreferrer">ตรวจไฟล์ ↗</a>}</div>):<div className="phase5-file-empty">ยังไม่มีไฟล์ส่งมอบ</div>}</div>
          <input ref={deliveryInput} id="phase5-delivery-upload" type="file" accept=".zip,.psd,.clip,.kra,.pdf,.png,.jpg,.jpeg,.webp" onChange={e=>void upload(e.target.files?.[0],'delivery')} disabled={!elevated||Boolean(busy)||deliveries.length>=3}/>
          <label htmlFor="phase5-delivery-upload" className="btn btn-outline phase5-upload-label"><FileUp size={16}/>{busy==='delivery'?'กำลังอัปโหลด…':'อัปโหลดไฟล์ส่งมอบ (Private)'}</label>
        </>}
      </div>
    </div>
    {message&&<p role="status" className="phase5-message">{message}</p>}
    <small className="phase5-help">ระบบจัดการเวอร์ชัน ลบไฟล์ สแกนไฟล์ และดาวน์โหลดหลังชำระเงินยังอยู่ในเฟสถัดไป ห้ามใช้เป็นช่องทางส่งมอบให้ลูกค้าจริง</small>
  </section>;
}
