# Marketplace Tidalis — Phase 5: Seller Catalog Drafts

**ฐานโค้ด:** Phase 4 + Supabase/Auth Phase 3.1
**เป้าหมาย:** ให้ผู้ขายสร้าง/แก้ไขสินค้า (Draft), ราคา License และอัปโหลดไฟล์ Private ได้ โดยยังไม่เปิดขายจริง

## ขอบเขตที่ทำแล้ว

- `/seller/products`: รายการสินค้าจริงของร้านที่ล็อกอินอยู่ (ดึง Supabase, RLS)
- `/seller/products/new`: สร้างสินค้า Commission, Ready-made, Digital Asset ผ่าน Server Action และ RPC แบบธุรกรรมเดียว
- `/seller/products/[id]`: แก้ไข Draft, License Personal/Commercial, Work Type, สต็อก, Exclusive
- `/seller/work-types`: ใช้ตัวจัดการประเภทงานเฉพาะร้านที่มีอยู่แล้วใน Phase 1
- `tidalis-product-files` (Private Supabase Storage): อัปโหลดภาพตัวอย่าง และไฟล์ต้นฉบับ/ส่งมอบของงานราคาคงที่
- `/preview/phase5`: หน้าโชว์ดีไซน์ **ข้อมูลสาธิต ไม่มีการเขียนฐานข้อมูล** ดูบน Vercel ได้โดยไม่ต้องมีบัญชี Seller

**ไม่อยู่ใน Phase 5:** การเผยแพร่สินค้าสู่หน้าร้านจริง การตรวจสินค้าจาก Admin การเรียกดูสินค้าจริงใน public `/shop`, การรับชำระ, การสั่งซื้อ, Quote/Revision/Commission Workflow, signed buyer download, Refund, Seller Policies Publication, การลบหรือเปลี่ยนเวอร์ชันไฟล์, Virus Scan และการจัดการไฟล์ขนาดใหญ่

## 1) อัปเดตโค้ดอย่างปลอดภัย

โปรดใช้ Git branch ที่มี **Phase 4 อยู่ครบแล้ว** และ `git status` ต้องสะอาด:

```bash
cd ~/Downloads/tidalis-marketplace
git status
git switch -c feat/phase5-seller-catalog
git apply --check ~/Downloads/tidalis-phase5.patch
git apply ~/Downloads/tidalis-phase5.patch
npm install
npm run check:source
npm run test:phase2
npm run test:phase3
npm run test:otp-email
npm run test:phase4
npm run test:phase5
npm run typecheck
npm run build
```

**หาก apply --check ไม่ผ่าน:** หยุดก่อน ส่ง Git log และ error เพื่อปรับ Patch ให้ตรงฐานโค้ด ห้ามใช้ `git reset --hard` หรือแตก ZIP ทับโฟลเดอร์ Git ที่มีงานคุณ

เมื่อ Build ผ่าน:

```bash
git add .
git commit -m "feat: phase 5 seller draft catalog and private assets"
git push -u origin feat/phase5-seller-catalog
```

สร้าง GitHub Pull Request -> Vercel Preview Deployment ของ branch; เปิด URL ของ Preview ต่อท้าย `/preview/phase5` ก่อนทดลอง backend.

## 2) ความปลอดภัยสำหรับ Supabase Production

**ไม่ควรนำ `005_seller_catalog_drafts.sql` รันบน Production โดยยังไม่ได้ตรวจสอบและทดสอบบน Staging ที่แยกจากกัน**

1. เก็บ Database backup/snapshot ล่าสุด และตรวจ Recovery Plan ของ Production
2. สร้าง Supabase Staging Project โดยไม่คัดลอก PII/อีเมล/ไฟล์ของลูกค้าจริงเข้า Staging
3. ตรวจว่า Migration 001–004 ถูกใช้อย่างครบถ้วนใน Staging; ตรวจ SQL 005 โดยเฉพาะ function privileges และ Storage policies
4. รัน **`supabase/migrations/005_seller_catalog_drafts.sql`** บน Staging
5. ทดสอบบัญชี Seller ที่ผ่านการอนุมัติอย่างถูกต้อง + MFA AAL2, การแยกร้าน และอัปโหลดไฟล์ PRIVATE
6. ทดสอบบัญชี Buyer, Seller อีก Shop, ผู้ใช้ AAL1 ให้ไม่สามารถเรียก RPC หรืออ่าน Storage ของร้านอื่นได้
7. ตรวจ `storage.objects` policies ทั้งหมดใน Project เพราะ policy เก่าที่เขียนกว้างอาจกระทบสิทธิ์ของ Bucket ใหม่
8. ตรวจขนาด upload limits ที่ Storage/API กำหนดและข้อกำหนด Antivirus/การสแกนไฟล์ก่อนเปิดขาย
9. เฉพาะเมื่อผ่านการทดสอบบน Staging และผ่านการทบทวนโดยผู้ดูแลฐานข้อมูล จึงค่อยนัดวาง Migration บน Production

**SQL อ่านข้อมูลอย่างเดียวสำหรับตรวจสภาพ:**

```sql
select to_regclass('public.products') as products,
       to_regclass('public.product_license_prices') as prices,
       to_regclass('public.product_files') as files,
       to_regclass('public.shop_work_types') as work_types;

select id,name,public,file_size_limit
from storage.buckets where id='tidalis-product-files';
```

การวาง SQL ผ่าน Dashboard ไม่ใช่ข้ออ้างให้ข้าม Staging — SQL Editor สามารถทำงานด้วยสิทธิ์สูงกว่าผู้ใช้ปกติได้

## 3) ทดสอบหน้าสินค้าและผู้ขาย

**ตรวจดีไซน์แบบไม่แตะฐานข้อมูล:** `https://<vercel-preview-domain>/preview/phase5`

**ทดสอบ Seller จริงบน Staging ที่ตรวจแล้ว:**

- ผู้ขายสมัครและได้รับอนุมัติอย่างถูกต้องตาม Phase 4; ร้านมีสถานะ `paused` ได้ (เตรียมสินค้าได้ ไม่เปิดขาย)
- เข้าระบบและตั้ง MFA Authenticator ให้ระดับ AAL2
- เข้า `/seller/work-types` เพิ่มประเภทงานของร้าน เช่น Chibi, VTuber
- เข้า `/seller/products/new` เลือก Commission แล้วตั้งราคาเริ่มต้น Personal/Commercial ต่างกัน บันทึก Draft
- ไปหน้าแก้ไขสินค้าที่ Redirect มา อัปโหลดภาพตัวอย่าง Private แล้วตรวจการแสดงผล Signed URL ชั่วคราว
- สร้าง Digital Asset และอัปโหลดไฟล์ ZIP/PSD/PNG ในส่วน Delivery File (Private)
- ลองเปลี่ยน License/ราคาและบันทึกซ้ำ ตรวจค่าบนฐานข้อมูล
- ทดสอบผู้ใช้คนละร้านสร้าง/แก้ไข/ดูไฟล์ไม่ได้; ทดสอบผู้ใช้ที่ยังไม่มี MFA ไม่สามารถผ่าน RPC
- ตรวจ `/shop` ว่ายัง **ไม่มีสินค้าจริงที่ถูกนำไปแสดงจาก Draft** และยังไม่มีปุ่มซื้อจาก Draft

## 4) ข้อจำกัดทางเทคนิค

- ราคาเก็บเป็นจำนวนเต็มหน่วย **สตางค์** (`price_minor`) เลี่ยง float สำหรับจำนวนเงิน
- รูป preview ไม่เกิน 8MB/ไฟล์ 6 ไฟล์; delivery ไม่เกิน 25MB/ไฟล์ 3 ไฟล์; Supabase Plan อาจจำกัดต่ำกว่า
- ชื่อไฟล์ใน Storage เป็น UUID ไม่ใช้ไฟล์ต้นทางเป็น Public URL
- Delivery files ของ Commission อยู่ในระบบ Order Phase ถัดไป ไม่อยู่ใน Product Draft
- File removal/cleanup and antivirus ยังไม่มี: หาก RPC ผูกไฟล์หลังอัปโหลดล้มเหลว อาจมี orphan file ใน Private Bucket ที่ผู้ดูแลต้องตรวจเอง
- Product Type เปลี่ยนไม่ได้หลังมีไฟล์แล้ว เพื่อป้องกันการผูกไฟล์ส่งมอบเข้ากับ Product Mode ที่ไม่ถูกต้อง
- สินค้าที่มีอยู่ก่อนในสถานะ `published` ไม่อนุญาตให้แก้ผ่าน RPC ใหม่นี้
- `requireSeller()` ของ Phase 4 เลือกร้านแรกจากบัญชีที่มีหลายร้าน; สลับหลายร้านจะทำในเฟสถัดไป
- Public storefront ยังเป็น **ข้อมูลตัวอย่างที่ฝังอยู่ในโค้ด** ไม่ใช่ข้อมูล Draft นี้
- ต้องทดสอบ Next.js build และ Storage/RLS ด้วย Supabase จริงก่อนใช้กับ Production

## 5) คำเตือนการเปิดขาย

ไม่ควรเปลี่ยน `products.status` หรือ `shops.status` ผ่าน SQL เพื่อให้สินค้า Draft ปรากฏในร้านจริง ทั้งการรับเงิน, Seller Shop Policies, Stock Reservation และ Download Entitlements ยังไม่พร้อม ต้องผ่าน Approval Flow และ Checkout จริงในเฟสต่อไป
