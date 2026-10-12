import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {pageWindow} from '@/lib/pagination';
import PageNav from '@/components/PageNav';
export default async function Documents({searchParams}:{searchParams:Promise<{page?:string}>}){
 const {client,user}=await requireUser('/account/documents');const window=pageWindow((await searchParams).page);
 const {data,error,count}=await client.from('financial_documents').select('id,document_number,document_type,status,issued_at,order:orders!inner(buyer_id)',{count:'exact'}).eq('order.buyer_id',user.id).in('document_type',['receipt','credit_note']).order('issued_at',{ascending:false}).order('id',{ascending:false}).range(window.from,window.to);
 return <main className="container page-pad"><Link href="/account" className="text-link">← บัญชีของฉัน</Link><div className="page-heading"><h1>เอกสาร<em>ของคุณ.</em></h1><p>ใบเสร็จและเอกสารคืนเงินที่ร้านออกให้กับคำสั่งซื้อของคุณ</p></div>{error?<p role="alert">โหลดเอกสารไม่ได้ กรุณาลองใหม่</p>:<><div className="phase6-list">{data?.map(d=><Link key={d.id} href={`/account/receipts/${d.id}`} className="commerce-card"><h2>{d.document_number}</h2><p>{d.document_type==='receipt'?'ใบเสร็จรับเงิน':'เอกสารยืนยันคืนเงิน'} · {d.status==='void'?'ยกเลิกแล้ว':'ออกแล้ว'}</p><span>ดู / พิมพ์ →</span></Link>)}</div>{!data?.length?<div className="empty-state">ยังไม่มีเอกสารที่ร้านออกให้ <Link href="/account/orders">ตรวจคำสั่งซื้อ →</Link></div>:null}<PageNav path="/account/documents" page={window.page} total={count||0}/></>}</main>;
}
