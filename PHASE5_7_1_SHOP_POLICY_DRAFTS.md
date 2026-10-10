# Tidalis — Phase 5.7.1: บันทึก Draft + แนบ PDF นโยบายร้าน

> เวอร์ชันนี้เป็น **Patch เพิ่มจาก Phase 5.7** ไม่ใช่ระบบซื้อขาย และไม่มีการเผยแพร่นโยบายหรือเปิดร้านอัตโนมัติ

## สิ่งที่เปลี่ยน

- `/seller/policies`: สร้าง/แก้ Draft จากข้อความสั้นเริ่มต้น **1 ตัวอักษร** และส่งตรวจได้เมื่อข้อความยาวอย่างน้อย **200 ตัวอักษร**
- หากมี Draft ประเภทเดียวกัน ระบบจะช่วยแก้ฉบับเดิม ไม่สร้างซ้ำ; หากฉบับนั้นกำลังตรวจอยู่จะรอผลก่อน
- Seller เลือกแนบ **PDF เท่านั้น** ขนาดไม่เกิน **8 MB**, ตรวจ `%PDF-` เบื้องต้นแล้วอัปโหลดไปยัง private Supabase Storage bucket `tidalis-policy-documents`
- Admin ดูไฟล์แนบของเอกสารที่รอตรวจที่ `/admin/shop-policies`; ไม่ควรกดอนุมัติ PDF ที่เปิดตรวจไม่ได้
- เมื่อ Admin อนุมัติและร้านอยู่สถานะ `active`, `/shops/[slug]` แสดงลิงก์ PDF ของเวอร์ชันที่เผยแพร่เท่านั้น
- ไฟล์ Draft ไม่มีลิงก์สาธารณะ; PDF ถูกเสิร์ฟด้วย **signed URL อายุ 300 วินาที** และเลือกดาวน์โหลด; หากลิงก์หมดอายุ ให้ Refresh หน้า
- เก็บเวอร์ชันและ Audit Log; ห้ามแก้ไฟล์อ้างอิงของฉบับที่เผยแพร่แล้ว

**ขอบเขต:** การแนบไฟล์หมายถึง PDF ไม่รองรับ DOC/DOCX ในเวอร์ชันนี้ เพื่อหลีกเลี่ยงความคลาดเคลื่อนของการแปลงเอกสาร; ไม่มีระบบสแกนมัลแวร์อัตโนมัติ ดังนั้นต้องตรวจไฟล์ก่อนเผยแพร่ อย่าใช้ PDF ตัวอย่างแทนนโยบายที่ตรวจแล้ว

## ติดตั้ง Source Code

ใน VS Code เริ่มจาก Branch ที่มี Phase 5.7 ครบแล้วและ Commit งานเดิมก่อน:

```bash
cd ~/Downloads/tidalis-marketplace
git status
git switch -c feat/phase5-7-1-policy-drafts
git apply --check ~/Downloads/tidalis-phase5-7-1-policy-drafts.patch
git apply ~/Downloads/tidalis-phase5-7-1-policy-drafts.patch

npm install
npm run check:source
npm run test:phase5-7-1
npm run test:phase5-7
npm run typecheck
npm run build
```

ตรวจลิงก์ `https://<preview-domain>/seller/policies`, `/admin/shop-policies`, `/shops/<slug>` ผ่าน Vercel Preview ก่อน Merge

## ฐานข้อมูล: Migration 007 (ต้องทดลอง Staging ก่อน)

ไฟล์: `supabase/migrations/007_shop_policy_documents.sql`

1. สำรองฐานข้อมูลและ Storage สำคัญ; สร้าง **Supabase Staging แยกจาก Production** และใช้บัญชี/ร้านที่อนุมัติด้วยขั้นตอนปกติ อย่าสร้างร้าน QA ด้วยการข้ามอนุมัติบน Production
2. ตรวจว่าตารางและ RPC จาก 001–006 มีครบ แล้วรัน 007 ใน Staging; ทดสอบ Storage RLS ด้วย **คนละบัญชีและ anonymous session** ก่อนพิจารณา Production
3. Vercel Preview อาจยังใช้ environment variables Production อยู่โดยไม่รู้ตัว ต้องตั้ง `NEXT_PUBLIC_SUPABASE_URL` และ public key ให้ชี้ Staging สำหรับ Preview หรือจำกัดการทดสอบไว้เฉพาะการเปิดหน้าแบบอ่านอย่างเดียว
4. หลังการทดสอบผ่านและได้รับอนุญาต จึงมีขั้นตอนแยกสำหรับ Migration Production โดยตรวจการสำรองและช่วงเวลาบำรุงรักษา

**Production preflight (read-only):**

```sql
select to_regclass('public.shop_policy_versions') as shop_policies,
       to_regprocedure('public.save_shop_policy_draft(uuid,text,text,uuid)') as text_save,
       to_regprocedure('public.submit_shop_policy_draft(uuid)') as submit_draft,
       to_regprocedure('public.save_shop_policy_document_draft(uuid,text,text,text,bigint,uuid)') as pdf_save;

select id,public,file_size_limit,allowed_mime_types
from storage.buckets where id='tidalis-policy-documents';

select policyname,cmd,qual,with_check
from pg_policies where schemaname='storage' and tablename='objects'
  and policyname in ('tidalis_policy_pdf_upload','tidalis_policy_pdf_read');
```

`pdf_save = NULL` หรือไม่มี bucket ใหม่ = Migration 007 ยังไม่ติดตั้ง (ตามคาดก่อน rollout)

## ทดสอบบนเว็บไซต์ (Staging)

1. Seller owner/manager ที่ผ่าน MFA เปิด `/seller/policies`, เลือก Refund > เขียนเอง, กรอก **20 ตัวอักษร** และบันทึก Draft — ต้องสำเร็จ; กดส่ง Admin ตอนยังน้อยกว่า 200 ต้องไม่สำเร็จ
2. เพิ่มข้อความ Draft เดิมเป็น ≥200 ตัวอักษรแล้วกดบันทึกอีกครั้ง — ต้องไม่มีเวอร์ชัน Draft ซ้ำ; กดส่งตรวจ — สถานะ `under_review`
3. เลือก Delivery > แนบ PDF ขนาดไม่เกิน 8 MB บันทึก — ต้องเห็นไฟล์เป็น Draft, เปิดลิงก์ดาวน์โหลดใน Seller ได้
4. ใช้ PDF ไม่ถูกต้อง, .exe เปลี่ยนนามสกุล หรือ >8 MB — ต้องถูกปฏิเสธ
5. ลองล็อกอินเป็น Seller ร้านอื่น หรือบัญชีที่ไม่มี MFA — ต้องบันทึกและดาวน์โหลด PDF ของร้านนี้ไม่ได้
6. เปิด Private Storage link ด้วย anonymous user ในช่วงที่เป็น Draft — ต้องดาวน์โหลดไม่ได้
7. Admin ที่ผ่าน MFA เปิด `/admin/shop-policies`, คลิกอ่าน PDF, กด "ขอแก้ไข" ก่อนเพื่อทดสอบฟอร์มและความเป็นส่วนตัว; ทดลองอนุมัติจริง **เฉพาะใน Staging** หลังตรวจเอกสาร
8. หลังอนุมัติและร้าน Staging เปิดเป็น `active` ด้วยขั้นตอน Shop Readiness ปกติเท่านั้น หน้าสาธารณะ `/shops/[slug]` จึงเห็นลิงก์ PDF ที่เผยแพร่; Draft และร้าน `paused` ต้องไม่แสดงไฟล์สาธารณะ
9. ทดสอบการแก้ไฟล์อ้างอิงของเวอร์ชัน `published` ด้วยบัญชีธรรมดา — ต้องถูกปฏิเสธ

**ข้อควรระวัง:** การอัปโหลดสำเร็จแต่บันทึก RPC ล้มเหลวอาจทิ้งไฟล์ที่ยังไม่ผูกกับ Draft ใน Private Storage ไว้ชั่วคราว ห้ามอัปโหลดซ้ำโดยไม่ตรวจรายการไฟล์และบันทึก error ให้ผู้ดูแลใช้ cleanup ที่มี Audit ภายหลัง

## ความหมาย Error ที่ UI จะแสดง

- `PGRST202` / `42883`: หา RPC ไม่พบ — Migration 006/007 หรือ schema cache ยังไม่พร้อม
- `42501` / `403`: ถูกปฏิเสธสิทธิ์ — ตรวจว่าเป็น owner/manager และเข้า Supabase MFA แบบ AAL2 แล้ว
- `23505`: มีข้อมูลเวอร์ชันหรือไฟล์อ้างอิงซ้ำ — เลือก Draft เดิมแทนสร้างใหม่
- `23514`: ข้อมูลไม่ตรง CHECK constraint — ตรวจประเภทและขนาด PDF
- `42P01` / `42703`: ตารางหรือคอลัมน์ยังไม่พร้อม — Migration ยังไม่ครบ

UI แสดง error.code และ error.message สำหรับผู้ขายที่ลงชื่อเข้าใช้ เพื่อช่วยวินิจฉัยจริง อย่าแชร์ Auth token, Access Key, โค้ด OTP, เลขบัญชี, ไฟล์ที่มีข้อมูลส่วนตัวหรือข้อความเอกสารที่ยังไม่เผยแพร่

## ข้อจำกัดการตรวจโดยผู้จัดทำ Patch

มีการทดสอบโครงสร้าง, ตรวจ import/syntax และ regression tests เท่านั้น ไม่สามารถยืนยัน `next build`, SQL Execution หรือ Storage RLS กับ Supabase ของผู้ใช้จริงในสภาพแวดล้อมนี้ ต้องยืนยันใน VS Code และ Staging ก่อนใช้งานจริง

## Roadmap หลัง 5.7.1

**เหลือ 1 Patch หลักของ Phase 5:** `Phase 5.8 — Product Publishing & Shop Readiness` (การตรวจความพร้อมร้านและสินค้า เผยแพร่บนหน้าร้านอย่างปลอดภัย) จากนั้นคือ `Phase 6 — Orders & Payments` นอกเหนือจาก Hotfix/QA ที่อาจจำเป็นตามผลทดสอบ
