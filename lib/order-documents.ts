import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {notFound} from 'next/navigation';
import type {OrderDocument} from './order-document-pdf';
export const documentOrderColumns='id,shop_id,buyer_id,order_kind,status,currency,total_minor,accepted_quote_id,shop_snapshot,created_at';
type Order={id:string;shop_id:string;buyer_id:string;order_kind:string;status:string;currency:string;total_minor:number;accepted_quote_id:string|null;shop_snapshot:{name?:string}|null;created_at:string};
const date=(value:string)=>new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'});
const money=(amount:number,currency:string)=>`${new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount/100)} ${currency}`;
export async function ownedDocumentOrder(client:SupabaseClient,id:string,owner:{buyerId:string}|{shopId:string}):Promise<Order>{
 let q=client.from('orders').select(documentOrderColumns).eq('id',id);q='buyerId' in owner?q.eq('buyer_id',owner.buyerId):q.eq('shop_id',owner.shopId);
 const {data,error}=await q.maybeSingle();if(error)throw Error('Order document unavailable');if(!data)notFound();return data as Order;
}
export async function quotationDocument(client:SupabaseClient,order:Order,original=false):Promise<OrderDocument>{
 if(order.order_kind!=='commission'||!order.accepted_quote_id)notFound();
 const {data:q,error}=await client.from('commission_quotes').select('*').eq('id',order.accepted_quote_id).eq('order_id',order.id).maybeSingle();if(error)throw Error('Quotation unavailable');if(!q)notFound();
 // Legacy accepted quotations use only historical order/quote fields, never today's product or shop data.
 const s=q.document_snapshot||{...q,number:`TD-Q-${q.id}`,shop:order.shop_snapshot,currency:order.currency,issued_at:q.created_at};
 return {title:'ใบเสนอราคา',subtitle:'QUOTATION',number:s.number,edition:original?'ต้นฉบับสำหรับร้านค้า':'สำเนาสำหรับลูกค้า',reference:`คำสั่งซื้อ ${order.id}`,sections:[
 {title:'ร้านค้าและรายการ',lines:[s.shop?.name||'ร้านศิลปิน',`ผู้ซื้อ ${order.buyer_id}`,`ใบเสนอราคาฉบับ ${s.version} / บรีฟฉบับ ${s.brief_version}`,`ออกเมื่อ ${date(s.issued_at)}`,`ลูกค้ายอมรับเมื่อ ${date(s.accepted_at)}`]},
 {title:'ขอบเขตงาน',lines:[s.scope]},
 {title:'ราคาและการส่งมอบ',layout:'summary',lines:[`ยอดรวม ${money(s.amount_minor,s.currency)}`,`ส่งภายใน ${s.delivery_days} วันหลังยืนยันรับเงิน / แก้ไขได้ ${s.revisions} ครั้ง`,`ใบเสนอราคาใช้ได้ถึง ${date(s.expires_at)}`]},
 {title:'สิทธิ์การใช้งานตามที่ตกลง',lines:[s.license_terms]}],footer:original?'ต้นฉบับเก็บในระบบของร้านค้า ใบเสนอราคาไม่ใช่หลักฐานการรับเงิน':'สำเนาจากต้นฉบับที่ร้านค้าเก็บในระบบ ใบเสนอราคาไม่ใช่หลักฐานการรับเงิน'};
}
export async function receiptDocument(client:SupabaseClient,id:string,owner:{buyerId:string}|{shopId:string}):Promise<OrderDocument>{
 const {data:d,error}=await client.from('financial_documents').select('id,order_id,shop_id,document_type,document_number,status,document_snapshot,issued_at,void_reason').eq('id',id).in('document_type',['receipt','credit_note']).in('status',['issued','void']).maybeSingle();if(error)throw Error('Receipt unavailable');if(!d)notFound();
 await ownedDocumentOrder(client,d.order_id,owner);const s=d.document_snapshot;if(!s.issuer||!s.recipient||!Array.isArray(s.items))notFound();
 const original='shopId' in owner;
 return {title:d.status==='void'?'เอกสารยกเลิก':d.document_type==='receipt'?'ใบเสร็จรับเงิน':'เอกสารยืนยันคืนเงิน',subtitle:d.status==='void'?'CANCELLED DOCUMENT':d.document_type==='receipt'?'RECEIPT':'CREDIT NOTE',number:d.document_number,edition:(d.status==='void'?'เอกสารยกเลิก / ':'')+(original?'ต้นฉบับสำหรับร้านค้า':'สำเนาสำหรับลูกค้า'),reference:`คำสั่งซื้อ ${d.order_id}`,sections:[
 {title:'ผู้ออกเอกสาร',lines:[s.issuer.name,s.issuer.address,`วันที่ออก ${date(d.issued_at)}`]},
 {title:'ผู้รับเอกสาร',lines:[s.recipient.name,...(s.recipient.tax_id?[`เลขประจำตัวผู้เสียภาษี ${s.recipient.tax_id}`]:[]),...(s.recipient.address?[s.recipient.address]:[])]},
 {title:'รายการ',layout:'items',lines:s.items.map((i:{name:string;license:string;quantity:number;total_minor:number})=>`${i.name} / ${i.license==='commercial'?'ใช้เชิงพาณิชย์':i.license==='personal'?'ใช้ส่วนตัว':''} / จำนวน ${i.quantity} / ${money(i.total_minor,s.currency)}`)},
 {title:d.document_type==='receipt'?'ยอดรับเงินที่ยืนยัน':'ยอดคืนเงินที่ยืนยัน',layout:'summary',lines:[money(s.total_minor,s.currency),`อ้างอิงการรับเงิน ${s.payment_id}`,...(d.status==='void'?[`เหตุผลยกเลิก: ${d.void_reason}`]:[])]}],footer:'เอกสารบันทึกจากรายการเงินจริง ไม่เรียกเก็บ VAT ต้นฉบับเก็บในระบบของร้านค้า'};
}
export async function licenceDocument(client:SupabaseClient,itemId:string,buyerId:string):Promise<OrderDocument>{
 const {data:e,error:ee}=await client.from('download_entitlements').select('created_at').eq('order_item_id',itemId).eq('buyer_id',buyerId).is('revoked_at',null).maybeSingle();if(ee)throw Error('Licence entitlement unavailable');if(!e)notFound();
 const {data:i,error:ie}=await client.from('order_items').select('id,order_id,product_id,quantity,usage_type,item_snapshot').eq('id',itemId).maybeSingle();if(ie)throw Error('Licence item unavailable');if(!i)notFound();
 const order=await ownedDocumentOrder(client,i.order_id,{buyerId});const s=i.item_snapshot;if(!s.license_terms)notFound();
 const {data:receipt,error:re}=await client.from('financial_documents').select('document_snapshot').eq('order_id',order.id).eq('document_type','receipt').eq('status','issued').maybeSingle();if(re)throw Error('Licence recipient unavailable');const recipient=receipt?.document_snapshot?.recipient;
 return {title:'ใบรับรองสิทธิ์การใช้งานผลงานศิลปกรรม (งานวาด)',subtitle:'LICENSE CERTIFICATE',number:`TD-L-${itemId}`,edition:'ต้นฉบับอิเล็กทรอนิกส์ / สิทธิ์ตามรายการซื้อเดิม',reference:`คำสั่งซื้อ ${order.id}`,sections:[
 {title:'ผลงานและผู้ให้สิทธิ์',lines:[s.name||'ผลงาน',order.shop_snapshot?.name||'ร้านศิลปิน',`รหัสสินค้า ${i.product_id}`]},
 {title:'ผู้รับสิทธิ์',lines:[recipient?.name||`บัญชีผู้ซื้อ ${buyerId}`,...(recipient?.tax_id?[`เลขประจำตัวผู้เสียภาษี ${recipient.tax_id}`]:[]),`ประเภท ${i.usage_type==='commercial'?'Commercial Use / ใช้เชิงพาณิชย์':'Personal Use / ใช้ส่วนตัว'}`,`จำนวน ${i.quantity} สิทธิ์`,`ได้รับสิทธิ์เมื่อ ${date(e.created_at)}`]},
 {title:'เงื่อนไขที่ร้านค้าระบุสำหรับรายการนี้',lines:[s.license_terms]}],footer:'เงื่อนไขนี้บันทึกไว้ตอนซื้อ (งานรับวาดใช้ใบเสนอราคาที่ยอมรับ) การคืนเงินเต็มจำนวนยกเลิกสิทธิ์ตามสถานะในระบบ'};
}
