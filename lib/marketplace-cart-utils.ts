export type LiveLicense='personal'|'commercial';
export type LiveCartLine={productId:string;shopId:string;license:LiveLicense;quantity:number};
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const liveLineKey=(line:Pick<LiveCartLine,'productId'|'license'>)=>`${line.productId}:${line.license}`;
export function normalizeLiveCart(value:unknown):LiveCartLine[]{
  if(!Array.isArray(value))return [];
  const result:LiveCartLine[]=[];
  for(const row of value.slice(0,100)){
    if(!row||typeof row!=='object')continue;
    const x=row as Record<string,unknown>;
    if(typeof x.productId!=='string'||!uuidPattern.test(x.productId)||typeof x.shopId!=='string'||!uuidPattern.test(x.shopId)
      ||(x.license!=='personal'&&x.license!=='commercial')||typeof x.quantity!=='number'||!Number.isInteger(x.quantity)||x.quantity<1)continue;
    const item:LiveCartLine={productId:x.productId.toLowerCase(),shopId:x.shopId.toLowerCase(),license:x.license,quantity:Math.min(20,x.quantity)};
    const existing=result.find(l=>liveLineKey(l)===liveLineKey(item));
    if(existing){if(existing.shopId===item.shopId)existing.quantity=Math.min(20,existing.quantity+item.quantity)}
    else if(result.length<20)result.push(item);
  }
  return result;
}
export type CheckoutPolicy={id:string;scope:'shop'|'platform';policy_type:string;version:number;content:string;source_type:string;document_path:string|null;document_name:string|null;document_url?:string|null};
export type CheckoutProduct={id:string;slug:string;name:string;exclusive:boolean;available:number;currency?:string;licenses:{usageType:LiveLicense;priceMinor:number;terms:string}[]};
export type CheckoutContext={enabled:boolean;eligible:boolean;reason:string|null;paymentMethods?:Record<string,string[]>;shop?:{id:string;name:string;slug:string};products:CheckoutProduct[];policies:CheckoutPolicy[];reservationMinutes:number};
export type OrderItemInput={productId:string;license:LiveLicense;quantity:number;expectedPriceMinor:number;expectedTerms:string;expectedCurrency?:string};
export function checkoutRows(lines:LiveCartLine[],context:CheckoutContext){
  return lines.flatMap(line=>{
    const product=context.products.find(p=>p.id===line.productId);
    const price=product?.licenses.find(l=>l.usageType===line.license);
    return product&&price?[{line,product,price,subtotal:price.priceMinor*line.quantity}]:[];
  });
}
export function orderState(status:string,expiresAt:string|null,now=Date.now()){
  return status==='pending'&&expiresAt&&Date.parse(expiresAt)<=now?'expired':status;
}
export function checkoutStockValid(rows:ReturnType<typeof checkoutRows>){
  const requested=new Map<string,number>();
  for(const row of rows)requested.set(row.product.id,(requested.get(row.product.id)||0)+row.line.quantity);
  return rows.every(row=>{
    const count=requested.get(row.product.id)!;
    return count<=Math.min(20,row.product.available)&&(row.product.exclusive?count===1:true);
  });
}
export const orderLabels:Record<string,string>={pending:'จองสินค้าแล้ว',expired:'หมดเวลาจอง',cancelled:'ยกเลิกแล้ว',awaiting_quote:'รอใบเสนอราคา',awaiting_acceptance:'รอตอบรับ',awaiting_payment:'รอชำระเงิน',payment_review:'กำลังตรวจสอบ',paid:'ชำระแล้ว',fulfilling:'กำลังส่งมอบ',fulfilled:'ส่งมอบแล้ว'};
export const checkoutError=(code:string)=>({
  mixed_currencies:'หนึ่งคำสั่งซื้อใช้สกุลเงินเดียว กรุณาแยกสินค้าคนละสกุลเงินออกก่อน',orders_closed:'ระบบยังไม่เปิดรับคำสั่งซื้อ กรุณากลับมาอีกครั้ง',shop_unavailable:'ร้านนี้ไม่พร้อมรับคำสั่งซื้อแล้ว',
  payment_setup_pending:'ร้านยังไม่มีช่องทางรับเงินสำหรับสกุลเงินนี้ กรุณากลับมาเมื่อร้านตั้งค่าพร้อม',shop_setup_pending:'ร้านนี้กำลังตั้งค่าระบบสั่งซื้อ กรุณากลับมาอีกครั้ง',stock_unavailable:'สินค้าบางรายการถูกจองแล้ว กรุณาตรวจสอบจำนวนอีกครั้ง',
  product_unavailable:'สินค้าบางรายการไม่พร้อมจำหน่ายแล้ว กรุณากลับไปแก้ตะกร้า',license_unavailable:'License ที่เลือกไม่พร้อมจำหน่ายแล้ว',
  price_or_terms_changed:'ราคาหรือเงื่อนไขเปลี่ยนแล้ว กรุณาโหลดรายการใหม่และตรวจสอบอีกครั้ง',policies_changed:'นโยบายเปลี่ยนแล้ว กรุณาโหลดรายการใหม่และอ่านฉบับล่าสุด',
  active_order_limit:'คุณมีรายการจองที่ยังไม่สิ้นสุด 5 รายการ กรุณายกเลิกรายการที่ไม่ต้องการก่อน',own_shop_order:'ไม่สามารถสั่งซื้อสินค้าจากร้านที่คุณเป็นสมาชิกได้',
  verified_email_required:'กรุณาเข้าสู่ระบบและยืนยันอีเมลก่อนสั่งซื้อ',idempotency_conflict:'รายการเปลี่ยนระหว่างส่ง กรุณาโหลดหน้าใหม่',
  order_not_cancellable:'รายการนี้ไม่สามารถยกเลิกได้ กรุณาติดต่อร้านค้า',order_unavailable:'ไม่พบคำสั่งซื้อนี้',
} as Record<string,string>)[code]||'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง';
