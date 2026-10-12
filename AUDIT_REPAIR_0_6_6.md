# รายงานตรวจและซ่อม Tidalis 0.6.6

ตรวจใหม่วันที่ 12 ตุลาคม 2026 จาก GitHub `Sanstheink/tidalis-marketplace` สาขา `feat/phase6-completion` commit `86e45c8731efc29844c156c3f32353f6bb61a428` เทียบ Supabase `fdwiwaawqrenxxvdsnqs` โดยตรง

## ข้อผิดพลาดที่ยืนยันและแก้ไข

| ปัญหา | การแก้ไข |
|---|---|
| คอลัมน์/RLS ตรง แต่ฟังก์ชันจริง 5 ตัวเป็นรุ่นเก่า | ซ่อมเฉพาะฟังก์ชันด้วย migration เพิ่มเติม ไม่ replay migrations เก่า |
| ผู้ขายที่ลงทะเบียน MFA แล้วบันทึกร่างนโยบายด้วย session AAL1 ไม่ได้ | คืนสิทธิ์งานร่างตาม helper ที่ตรวจสมาชิกจริงและ verified TOTP; การเผยแพร่ยังต้อง AAL2 |
| ร่างข้อความสั้นและการส่งนโยบาย PDF ถูกปฏิเสธ | รองรับร่างข้อความ 1–30,000 ตัว; ส่งข้อความต้องครบ 200 ตัว ส่วน PDF ตรวจไฟล์จริง ผู้ส่งและขนาด |
| ฟังก์ชันจริงยังไม่ล็อกข้อมูล PDF ที่เผยแพร่/เก็บถาวร | ล็อก source_type, document_path, document_name และ document_size; ห้ามใช้ RPC ข้อความแทนร่าง PDF |
| อนุมัติผู้ขายด้วยอีเมลหรือการยอมรับข้อตกลงที่ไม่ครบ | ตรวจอีเมลยืนยัน การยอมรับฉบับที่มีผลล่าสุด และหลักฐาน acceptance; manual approval เริ่มร้านสถานะ paused เพื่อตรวจ readiness |
| Commission โหลดหน้าใหม่หลังคำตอบหายอาจสร้างงานซ้ำ | เก็บ UUID และ hash ของคำขอใน sessionStorage แล้วใช้รหัสเดิมเมื่อ retry; เก็บเฉพาะ hash ไม่เก็บข้อความบรีฟ และหยุดส่งถ้าเก็บรหัสไม่ได้ |
| หน้า VAT แสดงไม่มีข้อมูลเมื่อ query ล้มเหลว | ให้ error boundary แจ้งโหลดไม่สำเร็จ; แบ่งหน้าคิวตรวจภาษีแทน limit 50 ที่ตัดประวัติ |
| Foreign key ที่ใช้อ่าน/เชื่อมประวัติไม่มีดัชนี 44 จุด | เพิ่มดัชนีที่ advisor ระบุ โดยรักษาดัชนีเดิมและประวัติทั้งหมด |

ฟังก์ชันที่ซ่อม: `approve_seller_application`, `save_shop_policy_draft`, `save_shop_policy_document_draft`, `submit_shop_policy_draft`, `tidalis_lock_published_shop_policy`

## หลักฐานฐานข้อมูลจริง

- ก่อนซ่อม SQL/RLS probe ยืนยันปัญหา 8 กรณี; หลังซ่อมกรณีเดิมผ่านครบ 8/8
- ตรวจ 444 คอลัมน์, 176 ฟังก์ชันของแอป และ 89 policies: ไม่พบความต่างเชิงพฤติกรรมกับ migrations หลังซ่อม ความต่างเฉพาะรูปแบบ/คอมเมนต์และตำแหน่ง pgcrypto extension ไม่ใช่ defect
- จำนวนข้อมูลก่อน/หลังเท่าเดิม: ผู้ใช้ 3, ร้าน 2, สินค้า 4, คำสั่งซื้อ 0 และ payment transactions 0 ข้อมูล probes rollback ทั้งหมด รวม synthetic auth fixture ไม่มีการสร้างบัญชีทดสอบถาวรหรือแก้บัญชีจริง
- Storage ทั้ง 7 buckets เป็น private และมีขนาด/MIME allowlist; ทุก public table มี RLS ไม่มี advisor ระดับ ERROR
- `unindexed_foreign_keys` หายจาก performance advisor หลังเพิ่มดัชนี
- ไฟล์ `20261012132920_audit_integrity_repairs.sql` ติดตั้งแล้ว; hosted migration ledger บันทึกเป็น `20261012134242` ชื่อ `audit_integrity_repairs` ห้ามติดตั้งซ้ำหรือใช้ `db push --include-all` เพราะ historical 001–010 เคยติดตั้งด้วยมือ

## ผลตรวจโค้ดและเว็บ

- Source/import, 34 unit tests, 114 database regressions, TypeScript และ production build ผ่าน
- Browser ทั่วไป 10/10 ผ่าน รวม OTP, เส้นทางที่ต้องล็อกอิน, no-store และ viewport มือถือ
- เพิ่ม SQL/RLS smoke test ที่ rollback, การตรวจ function/policy drift และ regressions สำหรับ PDF/การอนุมัติผู้ขาย
- Browser user flows ผ่านครบ 18/18 ด้วย Auth, MFA, Postgres และ Storage จริงในระบบแยก รวม Commission response loss/reload ที่ใช้คำขอเดิมและมี order เดียว การยกเลิกตรวจทั้งสถานะบนหน้าเว็บและฐานข้อมูล และการบันทึก PDF ด้วย AAL1 ก่อนเผยแพร่ด้วย MFA
- แก้ locator ของ regression test ให้เลือก alert ภายในฟอร์มคำขอและสถานะในส่วนหัวของหน้ารายการจริง ทำให้ทดสอบขั้นตอน retry และยกเลิกได้ครบ
- รวม 176 กรณีผ่าน (34 unit + 114 database + 10 browser ทั่วไป + 18 user flows) แยกจาก hosted SQL/RLS probes อีก 8/8
- ใช้บัญชีและรายการสังเคราะห์ใน Supabase แยกของ CI สำหรับ browser user flows; ไม่ทดสอบโอนเงินจริงหรือสร้างธุรกรรมถาวรใน hosted project

## หลักฐาน CI สุดท้าย

โค้ดที่ตรวจผ่านคือ commit `faaddecbffaf54a77d014897b673a2432fd61d55` บน [PR #7](https://github.com/Sanstheink/tidalis-marketplace/pull/7) ทั้ง jobs `verify` และ `user-flow` สำเร็จใน [run 38272450706](https://github.com/Sanstheink/tidalis-marketplace/actions/runs/38272450706) และ [run 38272448861](https://github.com/Sanstheink/tidalis-marketplace/actions/runs/38272448861) เมื่อ 12 ตุลาคม 2026 การอัปเดตเอกสารหลัง commit นี้ไม่เปลี่ยนโค้ดหรือ tests

## ข้อจำกัดและคำเตือนที่ตรวจแล้ว

`product_reservations` ไม่มี client policy/grant ตามการออกแบบ; clients ใช้ RPC จองเท่านั้น ดัชนี unused ยังไม่ควรถูกลบจากระบบที่ยังไม่มีการขายจริง หลาย permissive policies รวมสิทธิ์สาธารณะ/สมาชิก/ผู้ซื้อและถูกทดสอบการแยกสิทธิ์ ฟังก์ชัน SECURITY DEFINER ที่เปิดเป็น RPC เดิมมี role/ownership/MFA guards; advisor WARN ไม่เท่ากับพบการ bypass แล้ว อ้างอิง [Supabase linter](https://supabase.com/docs/guides/database/database-linter)

Supabase ยังแจ้ง Leaked Password Protection ปิดอยู่ เครื่องมือ Supabase ที่เชื่อมในงานนี้ไม่มี action สำหรับแก้ Auth configuration จึงยังไม่ได้เปิดให้ ต้องตรวจ/เปิดใน Dashboard ตาม [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) ไม่มีการเปลี่ยนแผนบริการหรือค่าใช้จ่าย

## นำขึ้นเว็บไซต์

ชุดแก้ไขอยู่บน `fix/audit-integrity-20261012` ซ้อนกับ `feat/phase6-completion` / PR #6 และ dependencies เดิม ยังไม่ merge เข้า main หรือ promote Production ต้อง merge โค้ดใหม่เข้าสาขาที่ Vercel ใช้เป็น Production แล้ว deploy commit ใหม่นั้น การ redeploy commit เก่าไม่รวมชุดแก้ไขนี้ Migration ใหม่ติดตั้งให้แล้วและแพตช์นี้ไม่เพิ่ม env vars
