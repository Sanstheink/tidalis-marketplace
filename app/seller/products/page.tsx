import Link from 'next/link';
import {requireSeller} from '@/lib/auth';
const names:Record<string,string>={commission:'Commission',ready_made:'Ready-made Artwork',digital_asset:'Digital Asset'};
export default async function SellerProducts({searchParams}:{searchParams:Promise<{notice?:string}>}){
  const [{client,member},{notice}]=await Promise.all([requireSeller(),searchParams]);
  const {data,error}=await client.from('products').select('id,name,product_type,pricing_mode,status,created_at').eq('shop_id',member.shop_id).order('created_at',{ascending:false}).limit(100);
  const canWrite=['owner','manager','artist'].includes(member.role);
  return <div className="container page-pad phase5-page"><div className="page-heading"><div className="eyebrow">SELLER / PHASE 5 CATALOG</div><h1>My <em>artworks.</em></h1><p>สร้างสินค้า กำหนด Work Type และ License ของร้าน ทุกอย่างยังอยู่ในโหมด Draft</p></div>
    {notice==='read-only'&&<div role="alert" className="phase4-alert">บัญชีนี้มีสิทธิ์ดูข้อมูล แต่ไม่มีสิทธิ์แก้ไขสินค้า</div>}
    <div className="phase5-toolbar"><Link href="/seller/work-types" className="btn btn-outline">จัดการประเภทงาน</Link>{canWrite&&<Link href="/seller/products/new" className="btn btn-primary">+ สร้างสินค้าใหม่</Link>}</div>
    <div className="phase5-note">สินค้าของร้านที่อนุมัติแล้วอาจถูกเก็บเป็น Draft ได้แม้ร้านมีสถานะ Paused แต่ยังไม่แสดงในหน้าร้านหรือเปิดซื้อขายจนกว่านโยบายและขั้นตอนอนุมัติสินค้าจะพร้อม</div>
    {error?<div className="info-panel" role="alert">ไม่สามารถอ่านรายการสินค้า กรุณาตรวจ RLS และ Migration: {error.message}</div>:data?.length?<div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr><th>ชื่อผลงาน</th><th>ประเภท</th><th>ราคา</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{data.map(p=><tr key={p.id}><td>{p.name}</td><td>{names[p.product_type]||p.product_type}</td><td>{p.pricing_mode==='quote'?'ราคาเริ่มต้น / เสนอราคา':'ราคาคงที่'}</td><td><span className="status-chip">{p.status}</span></td><td>{p.status==='draft'&&canWrite?<Link className="text-link" href={`/seller/products/${p.id}`}>แก้ไข / ไฟล์ →</Link>:<span>อ่านอย่างเดียว</span>}</td></tr>)}</tbody></table></div>:<div className="empty-state"><h2>ยังไม่มีสินค้าในร้าน</h2><p>เพิ่มสินค้าชิ้นแรกและกำหนด License เริ่มต้นได้เลย</p>{canWrite&&<Link className="btn btn-primary" href="/seller/products/new">สร้าง Draft แรก</Link>}</div>}
  </div>;
}
