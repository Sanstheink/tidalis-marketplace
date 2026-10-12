export const paymentMethods:Record<string,string>={qr_code:'QR ของผู้รับเงิน',promptpay:'QR / เลขพร้อมเพย์',bank_transfer:'โอนผ่านเลขบัญชี'};
export const paymentStates:Record<string,string>={pending:'รอชำระเงิน',proof_submitted:'รอตรวจหลักฐาน',confirmed:'รับเงินแล้ว',rejected:'ต้องแก้ไขหลักฐาน',expired:'หมดเวลาชำระ',needs_review:'ต้องตรวจสอบเพิ่มเติม'};
export const currencies=['THB','LAK','USD'] as const;
export type Currency=typeof currencies[number];
export function formatMoney(value:number|string|bigint|null|undefined,currency:string='THB'){
 const minor=BigInt(value??0),abs=minor<0n?-minor:minor;
 const amount=(abs/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(abs%100n).toString().padStart(2,'0');
 return `${minor<0n?'-':''}${amount} ${currency==='THB'?'฿':currency==='LAK'?'₭':'USD'}`;
}
export function decimalToMinor(value:string){
 if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(value))throw Error('invalid_amount');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
export function paymentError(code:string){
 const errors:Record<string,string>={payment_configuration_required:'ผู้รับเงินกำลังตั้งค่าระบบตรวจรับเงิน กรุณากลับมาอีกครั้ง',duplicate_proof:'หลักฐานนี้มีอยู่ในรายการอื่นแล้ว กรุณาติดต่อผู้รับเงินเพื่อตรวจสอบ',review_confirmation_required:'ตรวจยอดเข้าบัญชีและทำเครื่องหมายยืนยัน หรือระบุเหตุผลที่ขอแก้ไข',proof_upload_failed:'อัปโหลดหลักฐานไม่สำเร็จ กรุณาลองใหม่',shop_unavailable:'ร้านหยุดรับรายการใหม่แล้ว กรุณาติดต่อผู้ขายจากคำสั่งซื้อเดิม',method_unavailable:'ช่องทางนี้ยังไม่พร้อม กรุณาเลือกช่องทางอื่น',order_not_payable:'คำสั่งซื้อนี้ยังชำระไม่ได้ หรือชำระแล้ว',reservation_expired:'หมดเวลาชำระ กรุณากลับไปตรวจคำสั่งซื้อ หากเป็นงานรับวาดให้ขอขยายเวลาจากศิลปิน',payment_already_started:'มีรายการชำระอยู่แล้ว กรุณาดำเนินการรายการเดิมหรือยกเลิกก่อน',proof_unavailable:'ไม่พบรายการที่คุณสามารถส่งหลักฐานได้',invalid_proof:'กรุณาใช้ภาพหรือ PDF ขนาดไม่เกิน 3 MB',finance_mfa_required:'กรุณายืนยันรหัส Authenticator สำหรับงานการเงิน',invalid_recipient:'ตรวจชื่อผู้รับเงินและเลขบัญชีอีกครั้ง',invalid_qr_currency:'บันทึกบัญชีของสกุลเงินนี้ก่อนเพิ่ม QR',invalid_billing_address:'กรุณาระบุที่อยู่จริงและสกุลเงินของบัญชี'};
 return errors[code]||'ดำเนินการไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้รับเงิน';
}
export function paymentReviewNotice(code:string){
 return code==='confirmed'?'ยืนยันรับเงินแล้ว':code==='rejected'?'ส่งคำขอแก้ไขหลักฐานแล้ว':code==='needs_review'?'รับเงินแล้ว แต่ต้องกระทบยอดก่อนส่งมอบ กรุณาตรวจรายการด้านล่าง':paymentError(code);
}
export type PaymentAttempt={id:string;order_id:string|null;invoice_id:string|null;shop_id:string|null;payer_id:string;amount_minor:number;currency:string;method:string;status:string;expires_at:string;recipient_snapshot:{label?:string;name?:string;bank?:string;account?:string;promptpay?:string;qrPath?:string};proof_private_path:string|null;review_note:string|null;created_at:string;confirmed_at:string|null};
export type BankAccount={bank?:string|null;account?:string|null;enabled?:boolean;qrPath?:string|null};
export type PaymentProfile={id:string;shop_id:string|null;recipient_name:string;billing_address:string|null;bank_name:string|null;bank_account:string|null;bank_currency:string;bank_accounts?:Record<string,BankAccount>;promptpay_id:string|null;qr_private_path:string|null;bank_enabled:boolean;promptpay_enabled:boolean};
