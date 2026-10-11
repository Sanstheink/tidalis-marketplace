import Link from 'next/link';
import {FileUp,Image as ImageIcon,LockKeyhole,Paintbrush,Package,Layers3,ShieldCheck} from 'lucide-react';
export const metadata={title:'Phase 5 — Seller Catalog Preview | Tidalis'};
export default function Phase5Preview(){
  return <main className="container page-pad phase5-page"><div className="eyebrow">TIDALIS / PHASE 5 DESIGN PREVIEW</div>
    <h1>Seller <em>artwork studio.</em></h1><p>หน้าพรีวิวสาธิตสำหรับตรวจดีไซน์บน Vercel เท่านั้น ไม่มีข้อมูลร้านจริง และไม่สามารถบันทึกสินค้าได้จากหน้านี้</p>
    <div className="phase5-note"><ShieldCheck size={17} style={{verticalAlign:'middle'}}/> ข้อมูลตัวอย่าง · ระบบจริงที่ <code>/seller/products</code> ต้องเป็นผู้ขายที่ผ่านอนุมัติและ MFA</div>
    <section className="phase5-panel"><div className="eyebrow">01 / PRODUCT MODE</div><h2>เลือกประเภทผลงาน</h2><div className="phase5-mode-grid">
      <div className="phase5-mode active"><Paintbrush color="#c9a8ff"/><strong>Commission</strong><small>รับบรีฟงานวาดและเสนอราคา</small></div>
      <div className="phase5-mode"><Package color="#c9a8ff"/><strong>Ready-made</strong><small>ขายผลงานวาดสำเร็จ</small></div>
      <div className="phase5-mode"><Layers3 color="#c9a8ff"/><strong>Digital Asset</strong><small>Brush, PSD และไฟล์ดิจิทัล</small></div>
    </div></section>
    <section className="phase5-panel" style={{marginTop:22}}><div className="eyebrow">02 / LICENSE PRICING</div><h2>กำหนดราคาได้เองทั้งสอง License</h2>
      <div className="phase5-license-grid"><div className="phase5-license-card"><h3>Personal Use</h3><p>ราคาเริ่มต้นตัวอย่าง</p><h2>฿1,200</h2><small>ใช้ส่วนตัวตามเงื่อนไขของศิลปิน</small></div>
      <div className="phase5-license-card"><h3>Commercial Use</h3><p>ราคาเริ่มต้นตัวอย่าง</p><h2>฿4,500</h2><small>ใช้เชิงพาณิชย์ตามสิทธิ์ที่ผู้ขายกำหนด</small></div></div>
    </section>
    <section className="phase5-panel phase5-files"><div className="eyebrow">03 / PRIVATE STORAGE</div><h2><LockKeyhole size={22}/> Private product assets</h2>
      <div className="phase5-file-grid"><div className="phase5-file-group"><h3><ImageIcon size={18}/> ภาพตัวอย่าง</h3><p>JPG, PNG, WebP ไม่เกิน 8MB</p><div className="phase5-preview-grid"><div className="phase5-preview-tile"><span style={{fontSize:42,color:'#a77aff'}}>✦</span></div><div className="phase5-preview-tile"><span style={{fontSize:42,color:'#c7a8ff'}}>✧</span></div><div className="phase5-preview-tile"><span style={{fontSize:42,color:'#dbb7ff'}}>◈</span></div></div></div>
      <div className="phase5-file-group"><h3><FileUp size={18}/> ไฟล์ส่งมอบ</h3><p>ZIP / PSD / PDF และไฟล์ภาพ · ยังไม่เปิดให้ผู้ซื้อดาวน์โหลด</p><div className="phase5-file-empty">ตัวอย่างพื้นที่ Private Storage</div></div></div>
    </section>
    <div className="phase5-save-bar" style={{marginTop:24}}><div><strong>พร้อมดูหน้าสร้างสินค้าจริงแล้ว?</strong><small>ต้องผ่านการอนุมัติร้านและตั้งค่า Authenticator MFA ก่อน</small></div><Link href="/seller/products" className="btn btn-primary">เปิด Seller Studio →</Link></div>
  </main>;
}
