# Tidalis 0.6.7 — กู้คำสั่งซื้อหลังการเชื่อมต่อขาด

เริ่มแพตช์วันที่ 12 ตุลาคม 2026 และยืนยันผลวันที่ 13 ตุลาคม 2026 (Asia/Bangkok) ต่อจาก 0.6.6 บน commit `af21c20085f1bc4ea35986694857dac2bcfc245a` ของ PR #7 ชุดแก้ไขอยู่ที่ [PR #9](https://github.com/Sanstheink/tidalis-marketplace/pull/9)

## ปัญหาที่ตรวจพบและแก้ไข

1. Checkout เดิมกลืนข้อผิดพลาดของ sessionStorage แล้วส่งคำสั่งซื้อต่อแม้เก็บรหัส retry ไม่สำเร็จ เมื่อโหลดหน้าใหม่อาจได้รหัสใหม่และสร้างรายการซ้ำ พิสูจน์ด้วย storage ที่โยน quota error: โค้ดเดิมยังคืนรหัสให้ส่ง ส่วนโค้ดใหม่ปฏิเสธก่อนเรียกสร้างคำสั่งซื้อและแจ้งให้แก้พื้นที่จัดเก็บ
2. หลังคำสั่งซื้อสำเร็จแต่คำตอบหาย การ reload อาศัยราคา/นโยบาย/หมายเหตุปัจจุบันในการสร้าง fingerprint หากมีหมายเหตุที่หายไปตอน reload อาจสร้างรายการใหม่ และถ้าจองสินค้า Exclusive ชิ้นสุดท้ายไปแล้ว หน้าตรวจสต็อกจะปิดปุ่ม retry แพตช์นี้ค้นคำสั่งซื้อเดิมจากรหัสที่เก็บไว้ก่อน โดยไม่อาศัยข้อมูลสินค้าปัจจุบัน แล้วให้เปิดรายการที่บันทึกแล้ว
3. หากตรวจคำสั่งซื้อเดิมไม่สำเร็จ ระบบหยุดการสร้างรายการใหม่และมีปุ่มตรวจซ้ำ ไม่ตีความ query error ว่าไม่เคยมีคำสั่งซื้อ
4. หากคำขอแรกยังทำงานอยู่ตอน recovery query และผู้ซื้อแก้หมายเหตุหรือรายการ จะยังใช้ UUID เดิม ให้ database lock/idempotency ตรวจคำขอที่แข่งกัน แทนการออก UUID ใหม่ก่อนรู้ผลของรายการเดิม

Recovery ใช้ session ผู้ซื้อและ RLS เดิม พร้อมกรอง buyer_id, shop_id, order_kind=fixed และ idempotency_key ไม่ใช้ service role ไม่คืนหมายเหตุ/ข้อมูลชำระเงินในผล recovery และยังตรวจสิทธิ์หน้ารายการปลายทาง

เก็บเพียง SHA-256 fingerprint กับ UUID ใน namespace v1 เดิม จึงอ่านรหัสที่สร้างก่อนแพตช์ได้ ไม่เก็บหมายเหตุหรือข้อความ License การเปิดรายการเดิมนำออกจากตะกร้าเฉพาะบรรทัดที่ตรงกับจำนวนที่ซื้อ สินค้าร้านอื่น รายการเพิ่มใหม่ หรือจำนวนที่ผู้ใช้แก้ไว้ยังอยู่

## การตรวจสอบ

- เพิ่ม unit regressions 9 กรณี: retry/remount, การแยกบัญชี/ร้านและข้อมูล v1, การแก้ payload ขณะยังไม่รู้ผล, storage อ่าน/เขียนล้มเหลว, ข้อมูลเสียหาย, การรักษาตะกร้าที่เปลี่ยนแล้ว, ownership filters, authentication/validation และ query failure
- เพิ่ม browser regressions 3 กรณี: Exclusive ชิ้นสุดท้ายพร้อม recovery outage, storage ถูกบล็อกแล้วกลับมาใช้ได้ และรหัส recovery ที่คัดลอกจากผู้ซื้ออื่น
- เสริม browser response-loss เดิมด้วยหมายเหตุที่ไม่ว่าง และตรวจเปิดรายการเดิมหลัง reload โดยไม่ต้องกรอกใหม่
- เสริม concurrent PostgREST test: คำขอสองชุดใช้ UUID เดียวแต่ข้อความต่างกัน บันทึกสำเร็จเพียงหนึ่งชุด อีกชุดถูกปฏิเสธด้วย idempotency_conflict และตรวจฐานข้อมูลว่ามีหนึ่งรายการ
- ผลสุดท้ายผ่าน 188 กรณี: unit 43, database regressions 114, browser ทั่วไป 10 และ user flows ที่ใช้ Auth/MFA/Postgres/Storage จริงในระบบแยก 21 พร้อม source/import checks, TypeScript และ production build

ทั้ง jobs `verify` และ `user-flow` สำเร็จใน [GitHub Actions run 38293483131](https://github.com/Sanstheink/tidalis-marketplace/actions/runs/38293483131) บน code commit `212b6d419ef6a9cb66875fdbbfe7f9c5f878f32e` การอัปเดตหลังจากนี้แก้เฉพาะรายงานและ OPERATIONS.md ไม่เปลี่ยนโค้ดหรือ tests ที่ตรวจผ่าน

## การติดตั้งและขอบเขต

ไม่เพิ่ม migration หรือ env vars ในแพตช์นี้ ตรวจ RLS ของ hosted orders/order_items แล้วใช้สิทธิ์เดิม ไม่มีการเขียนข้อมูลธุรกิจลง hosted Supabase การทดสอบ browser ที่มีบัญชีและคำสั่งซื้อใช้ Supabase แยกของ CI เท่านั้น

ยังไม่ได้ merge เข้า main หรือ deploy Production ต้องรวม dependencies ของ PR #7 ก่อนนำโค้ดนี้ขึ้นเว็บไซต์ การตั้งค่า Leaked Password Protection และข้อมูลรับเงินจริงยังเป็นรายการเดิมที่เจ้าของต้องจัดการใน Dashboard/หน้าตั้งค่า
