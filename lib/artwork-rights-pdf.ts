import 'server-only';
import QRCode from 'qrcode';
import type {OrderDocument} from './order-document-pdf';
import {rightsKinds,rightsUsage,rightsModes,rightsDate,rightsDuration,type RightsDocument} from '@/lib/artwork-rights';
export async function artworkRightsPdf(d:RightsDocument,thumbnail:Buffer,url:string,orderStatus:string):Promise<OrderDocument>{
 if(!d.accepted_at||!d.buyer_signature||!d.execution_hash||!['effective','superseded'].includes(d.status))throw Error('rights_offer_closed');
 const s=d.snapshot,assignment=d.kind==='assignment';
 const history=d.status==='superseded'?' / ประวัติฉบับถูกแทนที่':'';
 const refund=orderStatus==='refunded'?(assignment?'คำสั่งซื้อคืนเงินแล้ว การโอนลิขสิทธิ์คืนต้องมีข้อตกลงที่ลงนามใหม่':'คืนเงินเต็มจำนวนแล้ว สิทธิ์การใช้งานสิ้นสุด เอกสารเก็บเพื่อแสดงประวัติ'):'';
 const qr=await QRCode.toBuffer(url,{type:'png',width:360,margin:4,errorCorrectionLevel:'M'});
 return {title:rightsKinds[d.kind],subtitle:assignment?'COPYRIGHT ASSIGNMENT AGREEMENT':'LICENSE CERTIFICATE',number:`TD-${assignment?'CA':'LC'}-${d.id}-V${d.version}`,edition:'ต้นฉบับอิเล็กทรอนิกส์'+history,reference:`คำสั่งซื้อ: ${d.order_id}`,sections:[
 {title:'ข้อมูลธุรกรรม / Transaction',lines:[`รหัสธุรกรรม: ${s.payment_id}`,`วันที่มีผล: ${rightsDate(d.accepted_at)} | ใบเสร็จ: ${s.receipt_number}`]},
 {title:'คู่สัญญา / Parties',lines:[`${assignment?'ผู้โอนสิทธิ์ (Assignor)':'ผู้ให้สิทธิ์ (Licensor)'}: ${s.licensor}`,`${assignment?'ผู้รับโอน (Assignee)':'ผู้รับสิทธิ์ (Licensee)'}: ${s.licensee.name}`,...(s.licensee.tax_id?[`เลขประจำตัวผู้เสียภาษี: ${s.licensee.tax_id}`]:[])]},
 {title:'ผลงานและขอบเขตสิทธิ์ / Artwork and rights',lines:[`ชื่อผลงาน: ${s.title}`,s.artwork_type,rightsUsage[s.usage],`ลักษณะสิทธิ์: ${rightsModes[s.exclusivity]}`,`พื้นที่: ${s.territory} | ระยะเวลา: ${rightsDuration(s)}`],media:{thumbnail,qr,url}},
 {title:'รายละเอียดข้อตกลงและการลงนาม',startPage:true,lines:[s.scope,`ที่มาข้อตกลง: ${s.agreement_reference}`,`ผู้เสนอ/ลงนาม: ${d.seller_signature} | ${rightsDate(d.offered_at)}`,`ผู้รับ/ลงนาม: ${d.buyer_signature} | ${rightsDate(d.accepted_at)}`,...(refund?[refund]:[]),`คู่สัญญาทั้งสองฝ่ายแสดงเจตนายอมรับเอกสารฉบับนี้และ ${s.policy.title} ฉบับ ${s.policy.version} ผ่านระบบอิเล็กทรอนิกส์ตามบันทึกด้านล่าง`]},
 {title:`${s.policy.title} / ฉบับ ${s.policy.version}`,lines:[s.policy.content]},
 {title:'หลักฐานความครบถ้วน / Record integrity',lines:[`บัญชีผู้เสนอ: ${d.seller_id}`,`บัญชีผู้รับ: ${d.buyer_id}`,`Content SHA-256: ${d.content_hash}`,`Execution SHA-256: ${d.execution_hash}`]}],
 footer:'เอกสารออกจากข้อมูลและการลงนามที่บันทึกในระบบ QR เปิดฉบับสัญญาโดยต้องเข้าสู่ระบบของคู่สัญญา ไม่ใช่หนังสือรับรองลิขสิทธิ์จากหน่วยงานรัฐ'};
}
