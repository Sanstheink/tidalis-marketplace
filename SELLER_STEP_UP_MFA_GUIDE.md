# Tidalis Seller Step-up MFA — Phase 5.8.1

**Target:** Phase 5.8 **with** `tidalis-auth-optional-buyer-mfa.patch` already applied. This patch does not grant Seller roles or alter any user's actual MFA factors. **Migration 009 is NOT executed automatically by applying the Git patch.**

## บทบาทและขอบเขตสิทธิ์

| กิจกรรม | การตรวจสิทธิ์ |
|---|---|
| Buyer Login / My Account | AAL1 ไม่ต้องตั้ง MFA |
| Seller ที่ยังไม่มี verified TOTP | ยังเข้า `/seller` ไม่ได้, ต้องตั้งค่าผ่าน `/mfa` |
| Seller หลังเคยตั้งและยืนยัน TOTP แล้ว | AAL1 เข้า `/seller`, `/seller/products`, `/seller/work-types`, `/seller/policies`, `/seller/readiness` ได้ |
| สร้าง/แก้ Product Draft, License, Work Type, Policy Draft, PDF Policy Draft, Preview Image | AAL1 + สมาชิกของร้านจริง + live verified TOTP factor |
| ส่ง Product/Shop Policy ให้ Admin ตรวจ, ถอนคำขอ, นำสินค้าออกจากรายการ, ขอเปิด/พักร้าน | AAL2 ผ่านแอป Authenticator |
| อัปโหลด/อ่านต้นฉบับไฟล์ส่งมอบ | AAL2 (Storage RLS and RPC) |
| Seller Payments, Refunds, Finance, VAT, Sales Documents | AAL2 ก่อนเปิดหน้าจอ; **RLS การเงินเดิมยังเป็น AAL2** |
| Admin Console, review/publish ร้านและสินค้า | AAL2 เหมือนเดิม |
| เปลี่ยนอีเมลหรือรหัสผ่านสำหรับบัญชีที่มี MFA | AAL2 ตาม Supabase Auth |

**กติกา:** การยืนยันตัวตนครั้งแรกคือการลงทะเบียน/ยืนยัน TOTP factor ไม่ใช่การตรวจบัตรประชาชน/KYC. AAL1 ครั้งถัดไปทำงานได้ตราบใดที่ปัจจัย TOTP ยังมีสถานะ verified ใน `auth.mfa_factors` และมีสมาชิกของร้านจริง. การลบปัจจัยต้องทำให้ Seller Routine mode ใช้งานไม่ได้อีก. แอปตรวจ factor ด้วย `mfa.listFactors()` และ DB ตรวจข้อมูล factor จริงแยกชั้น. ไม่ใช้ Client UI เป็นขอบเขตความปลอดภัยหลัก.

## ติดตั้ง Patch บน VS Code

```bash
cd ~/Downloads/tidalis-marketplace
git status
# ตรวจว่ามี Phase 5.8 และ Auth Optional Buyer MFA ใน Branch นี้แล้ว
git switch -c feat/seller-step-up-mfa
git apply --check ~/Downloads/tidalis-seller-step-up-mfa.patch
git apply ~/Downloads/tidalis-seller-step-up-mfa.patch
npm install
npm run check:source
npm run test:seller-step-up
npm run test:phase5-8
npm run test:phase5-7-1
npm run test:phase3
npm run typecheck
npm run build
```

หาก `git apply --check` ไม่ผ่าน หยุดทันที อย่าใช้ `--force` หรือรัน SQL ล่วงหน้า. หาก Branch ซ้ำ ให้ `git switch feat/seller-step-up-mfa` แทนการสร้างซ้ำ. **Preview ที่ชี้ Production ไม่ปลอดภัยสำหรับ Integration QA**: ตรวจ `NEXT_PUBLIC_SUPABASE_URL` และ Key แยกกันสำหรับ Preview/Production ใน Vercel.

```bash
git add .
git diff --cached --check
git commit -m "feat(auth): seller step-up MFA with scoped AAL1 draft access"
git push -u origin feat/seller-step-up-mfa
```

สร้าง PR แต่ยังไม่ Merge เข้า `main`.

## ตรวจ Schema Staging แบบอ่านอย่างเดียว ก่อน Migration 009

```sql
select to_regclass('public.shops') as shops,
       to_regclass('public.shop_members') as members,
       to_regclass('public.products') as products,
       to_regclass('public.shop_policy_versions') as policies,
       to_regclass('public.shop_readiness_requests') as readiness,
       to_regclass('auth.mfa_factors') as mfa_factors;

select column_name, data_type
from information_schema.columns
where table_schema='auth' and table_name='mfa_factors'
  and column_name in ('user_id','factor_type','status');

select id,public from storage.buckets
where id in ('tidalis-product-files','tidalis-policy-documents');
```

ทั้งหมดต้องมี Schema ตามคาด และ Storage Buckets ต้อง `public=false`. ต้องมี Migrations 001–008 ครบ โดยเฉพาะ 007 และ 008. หากคอลัมน์ factor ไม่ครบ หยุดให้ตรวจ Supabase Auth Schema ก่อน. **ห้ามให้ SQL Editor เปลี่ยน role หรือสถานะ factor เพื่อทดสอบ.**

## เปิดใช้บน Staging และทดสอบด้วยบัญชีจริงของ Staging

1. สำรองฐานข้อมูล Staging; ตรวจว่าสามารถกู้คืนได้, ตรวจว่า Vercel Preview ชี้เฉพาะ Staging แล้วรัน `009_seller_step_up_mfa.sql` บน Staging **เพียงครั้งเดียว** ตามการจัดการ Migration ของโครงการ. ถ้า error อย่าฝืนรันซ้ำโดยไม่ตรวจว่า statement ไหนสำเร็จ.
2. Seller A เป็น Owner/Manager/Artist ที่ผ่านอนุมัติร้านจริงและเคยยืนยัน TOTP แล้ว: Logout → Login ด้วย Email OTP หรือ Password ใหม่เพื่อให้ current AAL เป็น `aal1`; เปิด `/seller` และ `/seller/products` ได้ทันทีโดยไม่ขอรหัส MFA.
3. Seller A (AAL1) บันทึก Draft สินค้า, ราคา License, Work Type, ภาพ Preview และ Draft Policy แบบข้อความ/PDF; ตรวจว่ายังไม่เผยแพร่และ Storage ยัง Private.
4. Seller A (AAL1) ส่งสินค้าให้ตรวจ/ส่งนโยบายให้ตรวจ/ขอเปิดร้าน/พักร้าน/เข้าการเงิน/อ่านไฟล์ส่งมอบไม่ได้ จะแสดงปุ่มยืนยัน MFA หรือนำไป `/mfa`. **ทดสอบเรียก RPC/Storage จาก Supabase Client ตรง ๆ ด้วย Session AAL1 ด้วย** ไม่ใช่เช็กแค่ปุ่ม Disabled.
5. Seller A ยืนยัน TOTP → AAL2 แล้วส่งตรวจ, ดูต้นฉบับไฟล์ของร้านตัวเอง และเข้า Seller Finance ได้; Admin AAL2 ตรวจและอนุมัติแบบปกติบน Staging เท่านั้น.
6. Seller B จากอีกร้าน (AAL1 ทั้งที่มี TOTP แล้ว) อ่าน/แก้ Draft, Policy PDF, Preview และ Delivery ของร้าน A ไม่ได้ รวมทั้ง RPC ที่ระบุ `p_shop_id` ของ A.
7. Buyer ที่ไม่เคยเปิด MFA เข้า `/account` ได้ แต่เข้า `/seller`/`/admin` ไม่ได้; ผู้ที่ยังไม่ได้ verified TOTP ถึงมี shop_members ก็ต้องลงทะเบียนก่อน. ตรวจ Admin AAL1 เข้า `/admin` ไม่ได้.
8. Seller A ลบปัจจัย TOTP บน **บัญชีทดสอบ Staging** ผ่านขั้นตอนที่ Supabase อนุญาตตามปกติ → เมื่อ Session กลับเป็น AAL1 จะเข้า routine Seller ไม่ได้. ห้ามทดสอบลบ MFA ของ Admin/บัญชี Production.
9. ตรวจ Audit Log หลัง Draft และหลัง Submit, การล็อก published content และ PDF visibility ของร้าน active / paused.
10. ตรวจว่า Vercel Build และ Server Logs ไม่มี Permission denied / RLS recursion / 403 Storage จากคำขอที่ควรสำเร็จ.

### SQL ตรวจสถานะหลังติดตั้ง (Read-only)

```sql
select to_regprocedure('public.tidalis_seller_routine_access(uuid,text[])') as seller_routine_helper;
select schemaname,tablename,policyname,cmd,roles
from pg_policies
where policyname like 'tidalis_routine_%'
order by schemaname,tablename,policyname;
select proname, prosecdef
from pg_proc join pg_namespace n on n.oid=pronamespace
where n.nspname='public' and proname in ('tidalis_seller_routine_access','is_shop_member');
```

ควรได้ helper และ `tidalis_routine_*` **13 นโยบาย**. การมีชื่อ Policy ไม่เท่ากับทดสอบความปลอดภัยผ่าน; ต้องตรวจ Session จริงในข้อข้างต้น.

## Production rollout — Not automatic

- ห้าม Merge หรือรัน 009 บน Production จนกว่าการทดสอบ 10 กรณีข้างต้นผ่านทั้งหมด, Next.js `npm run build` ผ่าน และได้รับการทบทวน SQL/RLS โดยผู้ดูแลที่เชื่อถือได้.
- ยืนยันว่า `Preview` และ `Production` ไม่แชร์ Supabase Project; แผน Deploy DB-first บน Production ต้องอยู่ใน maintenance window ที่แจ้งทีมและมี backup + restore drill.
- ติดตั้ง SQL 009 ที่ตรวจผ่านก่อน Deploy โค้ด Phase 5.8.1 เพื่อไม่ให้เว็บใหม่เรียก helper ที่ยังไม่มี. บน Production ต้องใช้กระบวนการ migration ที่ควบคุม version/rollback และดู logs.
- มีไฟล์ `supabase/rollback/009_seller_step_up_mfa.rollback.sql` สำหรับย้อนสิทธิ์/RPC เฉพาะที่ Patch เปลี่ยน **หลังตรวจบน Staging** และย้อนโค้ดหน้าเว็บไปเวอร์ชันก่อน; อย่านำไฟล์ rollback ใส่ระบบ migration อัตโนมัติ.
- ตรวจการเข้าถึงซ้ำระหว่าง 24–48 ชั่วโมงหลัง deploy; บัญชีที่ยังไม่มี TOTP ต้องไม่ได้สิทธิ์ AAL1 Seller.

## ข้อจำกัดการทดสอบในแพ็กนี้

`npm run test:seller-step-up` เป็นการตรวจ Source/SQL Contracts ไม่ใช่ Postgres/GoTrue Integration หรือ Penetration Test. สภาพแวดล้อมแพ็กไฟล์ไม่มี Dependencies ของ Next.js/React จึงยังไม่ยืนยัน `tsc` และ `next build` เต็ม หรือความเข้ากันได้กับ Schema จริงของ Supabase ของคุณ.
