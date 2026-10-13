import Link from 'next/link';
import PageNav from '@/components/PageNav';
import {pageWindow} from '@/lib/pagination';
import {productStatusLabels} from '@/lib/product-readiness';
import {requireSeller} from '@/lib/auth';
import {sellerAccessMode} from '@/lib/seller-access';
import {changeSellerProductReview} from './review-actions';
const names:Record<string,string>={commission:'Commission',ready_made:'Ready-made Artwork',digital_asset:'Digital Asset'};
export default async function SellerProducts({searchParams}:{searchParams:Promise<{notice?:string;page?:string}>}){
  const [{client,member},{notice,page}]=await Promise.all([requireSeller(),searchParams]);
  const window=pageWindow(page);
  const {data,error,count}=await client.from('products').select('id,name,product_type,pricing_mode,status,review_note,created_at',{count:'exact'}).eq('shop_id',member.shop_id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(window.from,window.to);
  const {data:assurance}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const elevated=assurance?.currentLevel==='aal2';
  const mode=await sellerAccessMode(client);
  const canWrite=['owner','manager','artist'].includes(member.role);
  const messages:Record<string,string>={published:'เผยแพร่สินค้าแล้ว ลูกค้าเปิดดูได้จากหน้าร้าน',
    'confirmation-required':'กรุณายืนยันว่าข้อมูลและไฟล์พร้อมเผยแพร่',updated:'บันทึกสถานะสินค้าแล้ว',failed:'เปลี่ยนสถานะไม่ได้: ตรวจความครบของราคา License ภาพและไฟล์ หรือสถานะร้าน',invalid:'ข้อมูลสินค้าไม่ถูกต้อง'};
  return <div className="container page-pad phase5-page"><div className="page-heading"><div className="eyebrow">SELLER / PHASE 5 CATALOG</div><h1>My <em>artworks.</em></h1><p>สร้างสินค้า กำหนด Work Type และ License ของร้าน บันทึกร่าง เพิ่มภาพและไฟล์ แล้วเผยแพร่เองโดยไม่รอแอดมินตรวจ</p></div>
    {notice&&messages[notice]&&<div role="status" className="phase4-alert">{messages[notice]}</div>}
    {notice==='read-only'&&<div role="alert" className="phase4-alert">บัญชีนี้มีสิทธิ์ดูข้อมูล แต่ไม่มีสิทธิ์แก้ไขสินค้า</div>}
    {!elevated&&<div className="info-panel">เข้า Seller Studio ได้แล้วโดยไม่ต้องกรอก MFA ทุกครั้ง — <Link href="/mfa?next=%2Fseller%2Fproducts" className="text-link">ยืนยัน Authenticator</Link> เมื่อต้องการเผยแพร่ ถอนคำขอ หรือเก็บสินค้า</div>}
    <div className="phase5-toolbar"><Link href="/seller/readiness" className="btn btn-outline">ความพร้อมร้าน →</Link><Link href="/seller/work-types" className="btn btn-outline">จัดการประเภทงาน</Link>{canWrite&&<Link href="/seller/products/new" className="btn btn-primary">+ สร้างสินค้าใหม่</Link>}</div>
    <div className="phase5-note">สินค้าของร้านที่อนุมัติแล้วอาจถูกเก็บเป็น Draft ได้แม้ร้านมีสถานะ Paused แต่เผยแพร่สินค้าได้เมื่อข้อมูลและไฟล์ครบ ร้านที่พักไว้จะแสดงสินค้าเมื่อเปิดร้านอีกครั้ง</div>
    {error?<div className="info-panel" role="alert">ไม่สามารถอ่านรายการสินค้า กรุณาตรวจ RLS และ Migration: {error.message}</div>:data?.length?<div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr><th>ชื่อผลงาน</th><th>ประเภท</th><th>ราคา</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{data.map(p=><tr key={p.id}><td>{p.name}{p.review_note&&<p className="phase5-help">Admin: {p.review_note}</p>}</td><td>{names[p.product_type]||p.product_type}</td><td>{p.pricing_mode==='quote'?'ราคาเริ่มต้น / เสนอราคา':'ราคาคงที่'}</td><td><span className="status-chip">{productStatusLabels[p.status]||p.status}</span></td><td>{p.status==='draft'&&canWrite?<><Link className="text-link" href={`/seller/products/${p.id}`}>แก้ไข / ไฟล์ →</Link><form action={changeSellerProductReview}><input type="hidden" name="id" value={p.id}/><input type="hidden" name="action" value="submit"/>{mode.selfPublishing?<label className="operations-check"><input name="confirmed" value="yes" type="checkbox" required/> ตรวจข้อมูลและไฟล์พร้อมเผยแพร่แล้ว</label>:null}<button className="btn btn-outline" type="submit" disabled={!elevated||!mode.available}>{mode.selfPublishing?'เผยแพร่สินค้า':'ส่งให้ Admin ตรวจ'}</button></form></>:p.status==='under_review'&&canWrite?<><Link className="text-link" href={`/seller/products/${p.id}`}>ตรวจรายละเอียด →</Link>{mode.selfPublishing?<form action={changeSellerProductReview}><input name="id" value={p.id} type="hidden"/><input name="action" value="publish" type="hidden"/><label className="operations-check"><input name="confirmed" value="yes" type="checkbox" required/> ตรวจข้อมูลและไฟล์พร้อมเผยแพร่แล้ว</label><button className="btn btn-primary" type="submit" disabled={!elevated||!mode.available}>เผยแพร่สินค้าเลย</button></form>:null}<form action={changeSellerProductReview}><input type="hidden" name="id" value={p.id}/><input type="hidden" name="action" value="withdraw"/><button className="btn btn-outline" type="submit" disabled={!elevated}>ถอนคำขอ</button></form></>:p.status==='published'&&['owner','manager'].includes(member.role)?<form action={changeSellerProductReview}><input type="hidden" name="id" value={p.id}/><input type="hidden" name="action" value="archive"/><button className="btn btn-outline" type="submit" disabled={!elevated}>นำออกจากหน้าร้าน</button></form>:<span>อ่านอย่างเดียว</span>}</td></tr>)}</tbody></table></div>:<div className="empty-state"><h2>ยังไม่มีสินค้าในร้าน</h2><p>เพิ่มสินค้าชิ้นแรกและกำหนด License เริ่มต้นได้เลย</p>{canWrite&&<Link className="btn btn-primary" href="/seller/products/new">สร้าง Draft แรก</Link>}</div>}
    {!error?<PageNav path="/seller/products" page={window.page} total={count||0}/>:null}
  </div>;
}
