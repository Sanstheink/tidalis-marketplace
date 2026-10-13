# Tidalis 0.6.7 — คู่มือส่งต่อให้เจ้าของโครงการ

ชุดแก้ไขล่าสุดเผยแพร่ที่ [PR #9](https://github.com/Sanstheink/tidalis-marketplace/pull/9), branch `fix/checkout-resilience-20261012`, ต่อจาก [PR #7](https://github.com/Sanstheink/tidalis-marketplace/pull/7) และ dependencies เดิม ยังไม่ได้ merge เข้า main หรือ promote เว็บไซต์ production

## ลำดับติดตั้ง

คำสั่งล่าสุดวันที่ 13 ตุลาคม 2026 อนุญาตให้ทำแพตช์ถัดไปและทดสอบต่อแล้ว โค้ดส่งขึ้น PR #9; เจ้าของยังจัดการข้อมูลบัญชีจริง การเพิ่ม env และ deploy เว็บไซต์เอง ห้ามติดตั้ง migration ที่บันทึกว่าติดตั้งแล้วซ้ำ

1. สำรองฐานข้อมูลและตรวจ migration history ของโครงการที่จะใช้ก่อน
2. โครงการเดิม `fdwiwaawqrenxxvdsnqs` ติดตั้งไฟล์ต่อไปนี้เรียบร้อยแล้ว ส่วนฐานใหม่ให้ติดตั้งตามลำดับ:
   - `supabase/migrations/20261011223939_phase6_commissions_refunds_receipts.sql`
   - `supabase/migrations/20261012025119_self_service_zero_documents.sql`
3. ไฟล์แรกเพิ่ม Commission/คืนเงิน/เครดิต/ใบเสร็จร้าน/กระทบยอด/ledger ไฟล์ที่สองเพิ่มเปิดร้านและเผยแพร่เอง เอกสารยอดศูนย์ ประวัติแบ่งหน้า จำนวนสินค้าสาธารณะ และการนำไฟล์ร่างออก
4. ไฟล์ที่สองตั้ง `seller_intake_open=true`, `fixed_orders_enabled=true`, `self_service_shops=true`, `seller_self_publish=true` ตามคำสั่งเปิดร้าน/ลงสินค้าเอง ตรวจค่าหลังติดตั้งในโครงการที่คุณจะใช้งาน โค้ดยังตรวจนโยบายจริง ความพร้อม และข้อมูลรับเงินของร้าน
5. สำหรับฐานข้อมูลใหม่ทั้งหมด อ่านและติดตั้ง migration source เรียงตามชื่อ ส่วนโครงการเดิมอย่าติดตั้งย้อนหลังซ้ำหรือใช้ `db push --include-all` โดยไม่ปรับประวัติให้ตรงก่อน

## ประวัติ timestamp ของโครงการเดิม

ตรวจ migration ledger หลังติดตั้งเมื่อ 12 ตุลาคม 2026 รวมแพตช์ audit 0.6.6 แล้ว Historical 001–010 เคยติดตั้งด้วยมือ ต้องตรวจ ledger ให้ตรงก่อนใช้ CLI

| Source | Hosted version ที่บันทึกไว้ |
| --- | --- |
| `20261011150057_phase61_fixed_orders.sql` | `20261011153923` |
| `20261011180717_payment_operations.sql` | `20261011214422` |
| `20261011193105_marketplace_operations.sql` | `20261011214426` |
| `20261011214338_public_catalog_currency_access.sql` | `20261011214431` |
| `20261011223939_phase6_commissions_refunds_receipts.sql` | `20261012041028` |
| `20261012025119_self_service_zero_documents.sql` | `20261012041102` |
| `20261012132920_audit_integrity_repairs.sql` | `20261012134242` |

## สถานะหลังติดตั้ง

- `seller_intake_open`, `fixed_orders_enabled`, `self_service_shops`, `seller_self_publish` เป็น true
- มีนโยบายแพลตฟอร์มจริงที่เผยแพร่และมีผลครบ 5 ประเภท
- ยังไม่มีข้อมูลผู้รับค่าบริการหรือผู้ออกใบเสร็จแพลตฟอร์มที่ตั้งค่าจริง ต้องกรอกผ่าน `/admin/settings/payments`
- จำนวนคำสั่งซื้อ เอกสารและ ledger ยังคงเป็น 0 ไม่มีการเพิ่มผู้ใช้หรือรายการธุรกิจเพื่อทดสอบ
- Security advisors ไม่มีหมวดคำเตือนใหม่: RLS ไม่มี policy 1 รายการเป็นตารางจองที่ตั้งใจปิดสิทธิ์ตรง; helper definer ที่ anon เรียกได้ 2 รายการเดิม; definer ที่ authenticated เรียกได้ลดจาก 31 เป็น 29; leaked-password protection ยังไม่ได้เปิด
- ดูแนวทาง [definer function permissions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RLS policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) และ [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## การตั้งค่าจริง

- `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (หรือ anon key เดิม) สำหรับโครงการที่เลือก
- `SUPABASE_SECRET_KEY` หรือ legacy `SUPABASE_SERVICE_ROLE_KEY` อยู่ฝั่ง server เท่านั้น ใช้ตรวจ/บันทึกหลักฐานที่คำนวณ hash จากไฟล์จริง ไม่มี provider key
- `NEXT_PUBLIC_SITE_URL`, Auth redirect URLs, email templates และ SMTP ต้องตรงกับ origin ที่เจ้าของ deploy การแจ้งเตือนธุรกรรมทางอีเมลแอปไม่ได้เปิดอัตโนมัติ
- `/admin/policies`: ตรวจและเผยแพร่นโยบายจริง 5 ประเภท ไม่มีการเติมข้อความกฎหมายสมมติ
- `/seller/policies`: ร้านเผยแพร่ refund/delivery/license เองได้ด้วย MFA
- `/seller/products`: เตรียมสินค้า ราคา สิทธิ์ ภาพ และไฟล์จริง แล้วเผยแพร่เอง
- `/seller/readiness`: ตรวจความพร้อม/เปิดร้านอีกครั้งหลังพักด้วยตนเอง
- `/seller/settings/payments`: Owner/Finance บันทึกชื่อ ที่อยู่ และบัญชี/QR ที่รับ THB, LAK, USD ได้จริง สกุลเงินแยกกัน ไม่มีอัตราแลกเปลี่ยน PromptPay เฉพาะ THB
- `/admin/settings/payments`: ผู้รับเงินแพลตฟอร์ม ชื่อ/ที่อยู่ผู้ออกใบเสร็จจริง และค่าธรรมเนียมจริง ใช้ชื่อบุคคลหรือคณะบุคคลตามข้อเท็จจริง ไม่สร้างทะเบียนบริษัทหรือ VAT

## เอกสารและคืนเงิน

- `/admin/finance/documents`: ใบเสร็จจากค่าธรรมเนียมที่ยืนยันรับ หรือเอกสารยอด 0 ตามร้าน/สกุลเงิน/รอบบริการ กรอกผู้รับจริงได้แม้ร้านยังไม่มีบัญชีรับเงิน ต้องมีผู้ออกเอกสารจริงก่อน
- ยอดศูนย์ผูกกับใบแจ้งหนี้ยอดศูนย์ และ `issuance_source='zero_balance'`; `payment_id=null` ไม่มีเงินสดหรือรายการโอนที่ระบบสร้างขึ้น
- ร้านที่มีค่าธรรมเนียมจริงออกเอกสารศูนย์แทนหนี้ไม่ได้ ใบแจ้งหนี้ที่ถูกเครดิตหักครบจะคงยอดก่อนเครดิตและเครดิตจริงในประวัติ
- ใบกำกับภาษีสงวนสำหรับผู้ออกที่มีสิทธิ์ VAT จริงและผู้รับที่ผ่านการตรวจข้อมูล ปัจจุบันคณะบุคคลใช้ใบเสร็จธรรมดา
- `/seller/orders`: ดูบรีฟ เสนอราคา ส่งงานและข้อความ ออกใบเสร็จได้เฉพาะ Owner/Finance จากยอดรับจริง
- `/account/documents`, `/seller/documents`: เปิด/พิมพ์เอกสารจากรายการที่มีสิทธิ์
- `/seller/payments`, `/admin/reconciliation`: ตรวจหลักฐานเทียบรายการเข้าบัญชีจริง ห้ามใช้ภาพหลักฐานเพียงอย่างเดียวสรุปว่าเงินเข้า รายการหมดเวลาหรือส่งมอบไม่ได้เข้ากระทบยอด
- `/account/refunds`, `/seller/refunds`, `/admin/refunds`: คืนเงินจริงภายนอกแอป เก็บหลักฐานและการยืนยัน/ข้อพิพาท คืนเต็มยอดปิดสิทธิ์ดาวน์โหลด ไม่คืนสต็อกสิทธิ์ดิจิทัลไปขายซ้ำอัตโนมัติ
- `/seller/finance/refunds/[attempt]`, `/admin/finance/refunds/[attempt]`: รายละเอียดคืนค่าบริการที่ส่งมอบไม่ได้ พร้อมหลักฐานทุกครั้ง ผู้ขายแจ้งไม่ได้รับได้ แอดมินกระทบยอด/เตรียมโอนใหม่ได้โดยไม่ลบประวัติเก่า
- `/admin/shop-readiness`: ระงับการขายใหม่โดยแอดมิน ร้านที่ถูกระงับเปิดข้ามไม่ได้ แอดมินปลดการระงับกลับสู่ขั้นตอนเตรียมร้านได้ งานเดิมและประวัติใช้สิทธิ์สมาชิก/MFA เดิม

## รายการทดสอบสำหรับเจ้าของ

1. ผู้ขายใหม่และคำขอเดิม: ยืนยันอีเมล/ข้อตกลง → เปิดร้าน → MFA → ประเภทงาน/นโยบาย/สินค้า → เผยแพร่โดยไม่รอแอดมิน
2. สินค้าราคาปกติและฟรี, Exclusive, ภาพ/ไฟล์ร่างที่นำออก, เงื่อนไขไม่ครบ และบัญชีรับเงินแต่ละสกุลเงิน
3. ซื้อราคาคงที่ → หลักฐาน → ตรวจยอดจริง → ดาวน์โหลด และไม่ให้บัญชีอื่นเข้ารายการ/ไฟล์
4. Commission → บรีฟใหม่/ราคาใหม่/ตอบรับ → หมดเวลา/ขยายเวลา → ชำระ → ส่งงาน → แก้ไข/รับงาน → คลังไฟล์
5. ยอดที่โอนหลังหมดเวลา, หลักฐานซ้ำ, ส่งมอบไม่ได้, ตรวจการกระทบยอดก่อนคืนเงิน
6. คืนบางส่วน/เต็มจำนวน → ตรวจหลักฐาน → ยืนยันรับหรือข้อพิพาท → เครดิตบิลถัดไป โดยไม่เปลี่ยนบิล/ใบเสร็จเก่า
7. ใบเสร็จร้าน, เอกสารแพลตฟอร์มยอดปกติ/0, ยกเลิก/ออกฉบับใหม่, บล็อกใบกำกับภาษีเมื่อไม่มีสิทธิ์ VAT
8. ร้านพัก/ระงับ: ห้ามขายใหม่ที่ไม่อนุญาต แต่ดูงาน/เอกสาร/คืนเงินตามบทบาทได้; Artist ทำงานได้และอนุมัติเงินไม่ได้
9. รายการมากกว่า 25, ค้นหา/กรอง/เปลี่ยนหน้า, หน้าเปล่า, โหลดข้อมูลไม่ครบ และประกาศตามช่วงเวลา

คำสั่ง typecheck/source check ตรวจเฉพาะ source ผล runtime, SQL migration, build และ browser ต้องตรวจแยกก่อนเจ้าของ deploy ดูผลที่ทำจริงใน PHASE6_COMPLETION.md


## ประวัติแพตช์ 0.6.5

แก้การเผยแพร่สินค้า ข้อมูลผู้รับเงินและผู้ออกเอกสาร โดยไม่ต้องเพิ่ม SQL migration หรือ env ในแพตช์นี้ ผ่าน unit 26, database 99, browser ทั่วไป 10 และ user flows 16 รวม 151 กรณี พร้อม typecheck/build บน GitHub Actions run 38210840232 โค้ดที่ทดสอบคือ commit 812d47ca44620d605a35f153a5e84a5073e2f01c ดู PAYMENT_HOTFIX_REPORT.md สำหรับขอบเขตจริงของการทดสอบ

ใช้ค่าบัญชี/ที่อยู่/ผู้ออกเอกสารจริงของเจ้าของเท่านั้น ไม่คัดลอก fixtures ของ tests ไปยังโครงการ hosted การยืนยันรับเงินจริงและการออกเอกสารยังต้องใช้ Authenticator AAL2 ข้อมูลที่ไม่ผ่านการตรวจจะแสดงที่ฟอร์มและยังเก็บค่าที่กรอกไว้

Vercel Git build check ผ่าน แต่บัญชีที่เชื่อมผ่านเครื่องมือจัดการไม่มีสิทธิ์ทีมโครงการ (403) ยังไม่มี production promotion หรือการยืนยัน active production commit ในการดำเนินการนี้ ไม่ได้เปลี่ยน env

## ประวัติแพตช์ 0.6.6

ซ่อมฟังก์ชัน hosted ที่เก่า 5 ตัว เพิ่ม foreign-key indexes 44 จุด แก้ Commission retry หลังคำตอบหาย และการรายงานข้อผิดพลาด/แบ่งหน้าข้อมูลภาษี Migration `20261012132920_audit_integrity_repairs.sql` ติดตั้งแล้วตาม ledger ด้านบน ไม่ต้องเพิ่ม env

โค้ด commit `faaddecbffaf54a77d014897b673a2432fd61d55` ผ่าน unit 34, database 114, browser ทั่วไป 10 และ user flows ที่ใช้ Auth/MFA/Storage จริงในระบบแยก 18 รวม 176 กรณี พร้อม typecheck/build ทั้งสอง jobs สำเร็จใน [GitHub Actions run 38272450706](https://github.com/Sanstheink/tidalis-marketplace/actions/runs/38272450706) Hosted SQL/RLS probes อีก 8/8 ผ่านและ rollback ข้อมูลทดสอบทั้งหมด

ดู [AUDIT_REPAIR_0_6_6.md](AUDIT_REPAIR_0_6_6.md) สำหรับหลักฐาน schema ขอบเขตทดสอบ และ advisory ที่ยังมีอยู่ Leaked Password Protection ยังต้องตรวจ/เปิดผ่าน Dashboard ส่วนข้อมูลบัญชีรับเงินและการเผยแพร่สินค้าให้ใช้ข้อมูลจริงของเจ้าของก่อนเปิดขาย

## แพตช์ 0.6.7

Checkout ตรวจคำสั่งซื้อที่บันทึกแล้วจากรหัส retry ก่อนส่งใหม่ จึงเปิดรายการเดิมได้เมื่อคำตอบหาย แม้สต็อกชิ้นสุดท้ายถูกจองหรือหมายเหตุบนฟอร์มหายไปตอน reload หากพื้นที่จัดเก็บหรือการอ่านรายการเดิมล้มเหลวจะหยุดการส่งซ้ำและให้ตรวจอีกครั้ง รหัส UUID เดิมยังคงใช้เมื่อแก้ payload ระหว่างที่คำขอแรกอาจยังทำงานอยู่

ไม่เพิ่ม migration หรือ env และไม่แก้ข้อมูลธุรกิจใน hosted Supabase การเปิดรายการเดิมตรวจสิทธิ์ผู้ซื้อและรักษารายการอื่นในตะกร้า ดูหลักฐานการทดสอบฉบับสุดท้ายใน [CHECKOUT_REPAIR_0_6_7.md](CHECKOUT_REPAIR_0_6_7.md)

โค้ด `212b6d419ef6a9cb66875fdbbfe7f9c5f878f32e` ผ่าน 188 กรณี (unit 43 + database 114 + browser ทั่วไป 10 + user flows 21) พร้อม TypeScript/build ทั้ง jobs `verify` และ `user-flow` สำเร็จใน [run 38293483131](https://github.com/Sanstheink/tidalis-marketplace/actions/runs/38293483131) วันที่ 13 ตุลาคม 2026 (Asia/Bangkok)


## Order payment documents 0.6.8

See [ORDER_DOCUMENTS_0_6_8.md](./ORDER_DOCUMENTS_0_6_8.md) and PR #10. Hosted migration `20261013122721` / `order_payment_documents` is already applied; its source is `20261012195555_order_payment_documents.sql`. Do not apply it a second time or replay older migrations.

Deploy code including PR #9 and its dependencies before PR #10. Buyers of new payments enter their receipt identity on `/account/orders/[id]/payment`. Shop confirmation creates the ordinary receipt atomically; uploading a slip alone does not. Legacy attempts without that identity retain shop issuance. Corrections use seller receipt void/reissue. Original quote and receipt snapshots remain immutable. Work and Licence downloads require active purchase entitlements; full refunds revoke both. PDFs require the checked-in `assets/fonts/Sarabun-Regular.ttf`, which Next.js output tracing includes automatically.

The final code passed 208 cases, TypeScript and production build in Actions run 38396633629. Production deployment remains owner-managed.
