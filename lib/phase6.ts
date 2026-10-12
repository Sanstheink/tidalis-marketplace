import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
export type OrderScope='buyer'|'seller'|'admin';
export type WorkOrder={id:string;shop_id:string;buyer_id:string;order_kind:string;status:string;currency:string;total_minor:number;commission_due_at:string|null;reservation_expires_at?:string|null;accepted_quote_id:string|null};
export type Quote={id:string;version:number;brief_version:number;amount_minor:number;scope:string;license_terms:string;delivery_days:number;revisions:number;expires_at:string;status:string};
export type Delivery={id:string;version:number;status:string;seller_note:string;buyer_note:string|null;submitted_at:string};
export type DeliveryFile={id:string;order_id:string;delivery_id:string|null;filename:string;file_path:string};
export const refundLabels:Record<string,string>={requested:'รอตรวจคำขอ',under_review:'กำลังตรวจสอบ',approved:'อนุมัติ รอผู้ขายคืนเงิน',rejected:'ไม่อนุมัติ',processing:'คืนเงินแล้ว รอผู้ซื้อยืนยัน',completed:'คืนเงินสำเร็จ',failed:'ต้องตรวจสอบเพิ่มเติม'};
export {phase6Notice} from './phase6-notice';
export async function visibleOrder(client:SupabaseClient,id:string,scope:OrderScope,userId:string,shopId?:string){
 let query=client.from('orders').select('id,shop_id,buyer_id,order_kind,status,currency,total_minor,commission_due_at,reservation_expires_at,accepted_quote_id').eq('id',id);
 if(scope==='buyer')query=query.eq('buyer_id',userId);if(scope==='seller')query=query.eq('shop_id',shopId!);
 const {data,error}=await query.maybeSingle();if(error)throw Error('Order unavailable');return data as WorkOrder|null;
}
