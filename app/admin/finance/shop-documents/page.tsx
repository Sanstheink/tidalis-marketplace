import ShopReceiptView from '@/components/ShopReceiptView';
import Link from 'next/link';
import {pageWindow} from '@/lib/pagination';
import PageNav from '@/components/PageNav';
import {requirePlatformAdmin} from '@/lib/auth';
import {dateThai,uuid} from '@/lib/admin-finance';
export const dynamic='force-dynamic';

export default async function AdminShopDocuments({searchParams}:{searchParams:Promise<{shop?:string;document?:string;page?:string}>}){
 const {client}=await requirePlatformAdmin('/admin/finance/shop-documents');const params=await searchParams;const window=pageWindow(params.page);
 if(uuid.test(params.document||''))return <ShopReceiptView client={client} id={params.document!} scope="admin"/>;
 const {data:shops}=await client.from('shops').select('id,name').order('name').limit(500);
 const shop=uuid.test(params.shop||'')?params.shop||'':null;
 let query=client.from('financial_documents')
  .select('id,shop_id,order_id,document_type,document_number,status,issued_at,document_snapshot,pdf_private_path',{count:'exact'})
  .order('issued_at',{ascending:false}).order('id',{ascending:false}).range(window.from,window.to);
 if(shop)query=query.eq('shop_id',shop);
 const {data,error,count}=await query;
 const names=new Map((shops||[]).map(s=>[s.id,s.name]));
 return <main className="container page-pad">
  <div className="page-heading"><div className="eyebrow">ADMIN / SHOP FINANCIAL DOCUMENTS</div>
   <h1>Shop <em>documents.</em></h1><p>ตรวจเอกสารที่ผู้ขายออกให้ผู้ซื้อ (ไม่ใช่เอกสารเรียกเก็บค่าธรรมเนียมของ Tidalis)</p></div>
  <Link href="/admin/finance" className="text-link">← Finance Center</Link>
  <form method="get" className="phase4-action-form"><label>ร้าน<select name="shop" defaultValue={shop||''}>
   <option value="">ทุกร้าน</option>{(shops||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <button type="submit" className="btn btn-outline">ค้นหา</button></form>
  <div className="legal-alert">ไฟล์เอกสารเป็นข้อมูลส่วนบุคคล: หน้านี้ไม่สร้าง Public URL ให้ Private Storage และไม่แสดงหลักฐานที่ยังไม่มีการจัดสิทธิ์ดาวน์โหลดเฉพาะเอกสาร</div>
  {error&&<p role="alert">อ่านเอกสารไม่สำเร็จ: {error.code}</p>}
  <div className="phase4-table-scroll"><table className="dashboard-table"><thead><tr>
   <th>ร้าน</th><th>วันที่</th><th>เลขที่</th><th>ชนิด</th><th>สถานะ</th><th>ข้อมูลที่บันทึก</th></tr></thead>
   <tbody>{(data||[]).map(d=><tr key={d.id}><td>{names.get(d.shop_id)||d.shop_id}</td>
    <td>{dateThai(d.issued_at)}</td><td><Link href={`/admin/finance/shop-documents?document=${d.id}`}>{d.document_number}</Link></td><td>{d.document_type}</td>
    <td>{d.status}</td><td><details><summary>ดูข้อมูลเอกสาร</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(d.document_snapshot,null,2)}</pre>
     <small>Order: {d.order_id}</small>{d.pdf_private_path&&<p>มีไฟล์ต้นฉบับใน Private Storage — ต้องเชื่อมช่องทางดาวน์โหลดที่ตรวจสิทธิ์ก่อน</p>}</details></td>
   </tr>)}</tbody></table></div>
  {!error&&!data?.length&&<div className="empty-state">ยังไม่มีเอกสารจากร้านในระบบ</div>}
 <PageNav path="/admin/finance/shop-documents" page={window.page} total={count||0} params={{shop:shop||undefined}}/>
 </main>;
}
