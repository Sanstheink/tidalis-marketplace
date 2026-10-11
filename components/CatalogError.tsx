'use client';
export function CatalogError({reset}:{reset:()=>void}) {
  return <div className="container page-pad"><div className="phase4-card" role="alert">
    <h1>โหลดรายการไม่สำเร็จ</h1><p>ไม่สามารถเชื่อมต่อข้อมูลร้านหรือสินค้าได้ในขณะนี้ กรุณาลองใหม่</p>
    <button className="btn btn-primary" onClick={reset}>ลองอีกครั้ง</button>
  </div></div>;
}
