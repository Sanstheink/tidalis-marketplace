'use client';
export default function OrdersError({reset}:{reset:()=>void}){return <div className="container page-pad commerce-empty"><h2>โหลดคำสั่งซื้อไม่สำเร็จ</h2><p>กรุณาลองใหม่อีกครั้ง</p><button className="btn btn-outline" onClick={reset}>ลองใหม่</button></div>}
