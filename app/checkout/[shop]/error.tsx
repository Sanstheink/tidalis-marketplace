'use client';
export default function CheckoutError({reset}:{reset:()=>void}){return <div className="container page-pad commerce-empty"><h2>เตรียมคำสั่งซื้อไม่สำเร็จ</h2><p>กรุณาลองโหลดหน้าอีกครั้ง</p><button className="btn btn-outline" onClick={reset}>ลองใหม่</button></div>}
