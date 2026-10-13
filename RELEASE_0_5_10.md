# Tidalis 0.5.10 — การแก้ไข ผลทดสอบ และการนำขึ้น Production

ตรวจและแก้ไขวันที่ 11 ตุลาคม 2026 บนสาขา `fix/marketplace-stability-20261011`

ชุดนี้ต่อจาก `feat/phase5-9-admin-operations` ที่ commit `52ee2877f32bdf501804d968a6eae7378d43a9a7` และรักษาฟีเจอร์ของเฟสก่อนหน้าไว้ ขณะเริ่มงาน `main` ยังเป็น 0.1.0 ดังนั้น PR จะรวมฟีเจอร์ที่อยู่ใน feature branches เข้าด้วยกันด้วย

**การตรวจบน GitHub:** ชุดแก้ไขอยู่บนสาขา `fix/marketplace-stability-20261011` สำหรับตรวจผ่าน PR ก่อนรวมเข้า Production Branch การตรวจในเครื่องและ Supabase จริงด้านล่างเป็นผลที่ได้แล้ว ส่วน GitHub CI และ Vercel Preview ต้องตรวจผลของ commit บน PR แยกต่างหาก ดู [GITHUB_HANDOFF.md](GITHUB_HANDOFF.md) สำหรับการดึงสาขาและขั้นตอนส่งต่อ

## สิ่งที่แก้ไข

| ปัญหา | ผลหลังแก้ | หลักฐานการตรวจ |
|---|---|---|
| Session refresh ไม่ส่ง cache headers ของ Supabase SSR | ส่ง cookie และ headers ไปด้วยกัน เก็บ cookie เดิมเมื่อ SDK เรียกหลายครั้ง; auth redirects ใช้ private/no-store | Unit และ HTTP browser tests |
| เปิดรับสมัครผ่าน environment flag อย่างเดียว | ใช้สถานะฐานข้อมูลเดียวกันทั้ง UI และ submit/resubmit; Admin AAL2 เปลี่ยนสถานะพร้อม audit | Live SQL/RLS |
| ร้าน suspended ยังเพิ่ม/แก้ประเภทงานที่ AAL2 ได้ | แก้ original permissive policies ให้ตรวจสถานะ active/paused ด้วย | Live AAL1/AAL2 SQL probes |
| ผู้ถูกปฏิเสธสมัคร URL เดิมไม่ได้ | ถอด unique constraint ที่ครอบคลุมประวัติทั้งหมด; คง partial unique index ของใบสมัครที่ยังเปิดอยู่ | Live submit/reapply/index tests |
| ลบ OTP ช่องกลางแล้วเลขถัดไปเลื่อน | เก็บตำแหน่งช่องว่างและตรวจครบหกตัวเลขก่อนส่ง | Unit, keyboard/paste browser tests |
| ค้นหา/เรียงเฉพาะสินค้า 60 ชิ้นแรก | SQL กรองและเรียงก่อนแบ่งหน้า; ทั้ง marketplace และหน้าร้านใช้ URL เป็นสถานะตัวกรอง | Live fixture 70 ชิ้น + browser reload/back/mobile |
| บัญชีหลายร้านเลือกแถวแรกโดยอัตโนมัติ | มีตัวเลือกร้านใน Workspace; cookie เป็นเพียงค่าที่เลือก และตรวจสมาชิก/สถานะ/MFA ใหม่ทุกครั้ง | Unit selection/invalid-membership cases; server guard/build |
| Support/Finance เรียก readiness แล้วล้มเหลวใน RPC ซ้อน | จำกัด aggregate และหน้า UI ให้ Owner/Manager/Artist; งานการเงินยังต้อง AAL2 | Live role probes |
| ข้อมูลโหลดไม่ได้ถูกแสดงเป็นรายการว่าง/404 | ส่ง error ไปหน้าลองใหม่; Admin ไม่เปิดตัวเลือกอนุมัติเมื่อประเมินข้อกำหนด/ราคาไม่ได้ | Mocked failure regressions, build, real missing-product 404 |
| Tests เก่าเช็ค asset/MFA คนละเวอร์ชันกับโค้ด | แก้ assertions ให้ตรง business contract, รวม scripts ที่ตกหล่น, เพิ่ม regression tests และ CI | `npm test`, typecheck, production build |
| Schema จริงขาด `agreement_version_id` และ `review_note` | เพิ่มสองคอลัมน์พร้อม FK/index โดยไม่เติมข้อมูลประวัติเอง | Schema comparison + live submit/resubmit |

Dependencies ยึดเวอร์ชันที่ติดตั้งและตรวจแล้วด้วย exact versions และ lockfile: Next 16.4.0, React 19.3.0, Supabase JS 2.117.3, SSR 0.12.7, TypeScript 5.9.3 เพิ่ม PGlite 0.5.8 และ Playwright 1.64.0 สำหรับการทดสอบ

## ฐานข้อมูลจริงที่อัปเดตแล้ว

เป้าหมายคือ Supabase project `fdwiwaawqrenxxvdsnqs` (`Marketplace`, PostgreSQL 17) เท่านั้น ใช้ incremental migrations สองไฟล์แล้ว:

1. `20261011122813_marketplace_stability.sql`
2. `20261011124647_schema_alignment.sql`

เลข timestamp ในไฟล์ตรงกับ migration history ของฐานข้อมูลจริง เดิมเฟส 001–010 ถูกใช้ผ่าน SQL โดยไม่ได้ลง migration history จึง **ห้าม replay 001–010 หรือใช้ `supabase db push --include-all` กับโปรเจกต์นี้** เพียงเพราะ history ไม่มีรายการเก่า สำหรับฐานข้อมูลใหม่ให้ติดตั้งตามลำดับจาก 001 แล้วตรวจ preflight ก่อนเสมอ

หลังทดสอบพบ 37 public tables, 309 columns และทุก public table เปิด RLS คอลัมน์/ชนิดข้อมูล/nullable ของ schema จริงตรงกับ migration model จำนวนข้อมูลหลักก่อนและหลังเท่ากัน:

| รายการ | ก่อน | หลัง |
|---|---:|---:|
| ผู้ใช้ | 2 | 2 |
| ร้าน | 1 | 1 |
| สินค้า | 1 | 1 |
| ใบสมัคร | 0 | 0 |
| คำสั่งซื้อ | 0 | 0 |
| ร้าน fixture ที่เหลือ | 0 | 0 |

การรับสมัครผู้ขายยัง **ปิด** ไม่มีการเปิดร้าน เผยแพร่สินค้า ออกเอกสารเงินจริง หรือเปิดระบบรับเงิน ข้อมูล fixture และการเปลี่ยนสถานะใน SQL tests ถูก rollback ก่อนจบแต่ละชุด ไม่สร้าง/แก้ผู้ใช้ รหัสผ่าน หรือ MFA factors ในฐานข้อมูลจริง

## ผลทดสอบ

| การตรวจ | ผล | ขอบเขต |
|---|---|---|
| `npm test` | ผ่าน | Source checks, legacy scripts ทุกตัว, mocked artist cases, unit 11 กรณี, isolated DB 35 กรณี |
| `npm run typecheck` | ผ่าน | รวม application, test code และ Playwright config |
| `npm run build` | ผ่าน | Optimized production build |
| SQL/RLS บน Supabase จริง | 26/26 ผ่าน | แบ่ง query เป็น 15+5+6 กรณีเพื่อลดขนาดคำขอ; rollback fixtures ทุกชุด |
| Read-only live RLS เพิ่มเติม | 3/3 ผ่าน | Anonymous ไม่เห็น draft/ร้านที่ไม่ active; enrolled AAL1 เห็น catalog ของตน |
| Browser กับ production build ที่เชื่อม Supabase จริง | 14/14 ผ่าน | OTP, URL filters/search/sort/reload/back, mobile, protected routes, auth cache headers, 404 และ invalid-password rejection |
| `npm audit --omit=dev` | 0 vulnerabilities | Dependencies ฝั่ง application ณ เวลาตรวจ |

SQL role tests ใช้ claims ใน SQL session เพื่อทดสอบนโยบาย และอ่าน TOTP enrollment ที่มีอยู่จริง ผลเหล่านี้ **ไม่ใช่การพิสูจน์ login หรือ MFA สำเร็จด้วย signed GoTrue session**

ในเครื่องทดสอบ Chromium ติดต่อบริการภายนอกตรง ๆ ไม่ได้และไม่ trust certificate ของ egress proxy จึงใช้ Node transport ที่ตรวจ TLS แล้วส่งคำขอ Auth จริงต่อให้ Supabase เฉพาะ negative-password test ไม่สร้าง response จำลอง บริการตอบ HTTP 400 `Invalid login credentials` และ UI แสดงข้อความถูกต้อง ต้องตรวจการเชื่อมต่อ Auth โดยตรงอีกครั้งบน Vercel Preview/Production

ยังไม่ได้ทดสอบ successful login, การรับอีเมล OTP, recovery/OAuth, successful MFA, multi-shop UI ผ่านบัญชีที่ล็อกอินจริง, upload/download ส่วนตัว หรือการชำระเงิน การตรวจส่วนนี้ต้องใช้บัญชีทดสอบที่เจ้าของอนุญาตและช่องทาง Auth ปกติ

## ขั้นตอนที่เจ้าของทำต่อบน Vercel

1. เปิด PR ของ `fix/marketplace-stability-20261011` ตรวจ GitHub checks และ Vercel Preview ถ้ามี การตรวจในเครื่องผ่านแล้ว; GitHub CI และ Vercel Preview เป็นผลตรวจแยกต่างหาก
2. ใน [Vercel project](https://vercel.com/hoshi12/tidalis-marketplace) ตรวจ Settings → Environments → Production → Branch Tracking ว่า Production Branch คืออะไร การเข้าถึง team-scoped Vercel API จาก session นี้ตอบ 403 จึงไม่ได้ยืนยัน/เปลี่ยน branch tracking หรือ deploy แทนเจ้าของ
3. ตรวจ Production environment ว่า `NEXT_PUBLIC_SUPABASE_URL` ชี้โปรเจกต์ข้างต้น และมี `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ที่ถูกต้อง ใช้ Node 24 ซึ่งเป็น runtime ที่ตรวจ build แล้ว คีย์ส่วนตัวและ service-role ไม่จำเป็นสำหรับชุดแก้นี้
4. ถ้า Production Branch เป็น `main` ให้ merge PR นี้เข้า `main` เมื่อ Preview/CI ผ่าน ถ้า Git integration เปิดอยู่ Vercel จะ build/deploy commit ใหม่ให้เอง หากเป็น branch อื่น ให้รวมชุดแก้เข้าที่ Production Branch ที่กำหนดจริง
5. ตรวจ Deployment ว่า Source มีชุด 0.5.10 นี้และสถานะ Ready แล้วตรวจหน้า `/shop`, `/verify-email`, `/workspace`, `/seller` และ `/admin` ด้วยบัญชีของคุณ
6. ใช้ **Redeploy** เมื่อ deployment ใช้โค้ดชุดใหม่แล้วและต้อง build ใหม่ เช่น หลังแก้ environment variables การ redeploy commit เก่าของ main 0.1.0 จะไม่ได้รับชุดแก้นี้

ไม่ต้องรัน SQL สองไฟล์ข้างต้นซ้ำกับโปรเจกต์นี้ ตัวแปร `NEXT_PUBLIC_LEGAL_DOCUMENTS_APPROVED` เดิมไม่ใช้ควบคุม intake แล้ว หลังทดสอบบัญชีจริงและตรวจข้อตกลง ให้ Admin ที่ AAL2 เปิดรับสมัครจาก `/admin/seller-applications` เมื่อพร้อม

อ้างอิง deployment behavior: [Vercel Git deployments](https://vercel.com/docs/git)

## การ rollback และสิ่งที่ยังติดตาม

หาก deployment มีปัญหาให้ rollback application ก่อน โดยคง additive schema นี้ไว้ แนบ SQL rollback ของ stability migration ไว้ใน `supabase/rollback/` ซึ่งใช้ transaction และจะหยุดหากการคืน unique constraint ขัดกับประวัติใบสมัครที่ใช้ slug ซ้ำ ไม่มีคำสั่งลบประวัติเพื่อฝืน rollback ไม่จำเป็นต้องถอดสองคอลัมน์ที่ซ่อมจาก schema เดิม

Supabase security advisor หลังแก้ยังเตือน helper functions ที่ anonymous เรียกได้ 2 ตัว และ authenticated SECURITY DEFINER functions 32 ตัว ซึ่งใช้กับ RLS/RPC ที่ตรวจบทบาทและ AAL ไม่ควรถอดสิทธิ์แบบเหมารวมเพราะจะทำให้ระบบอ่านหรือ workflow เสีย Trigger functions ที่ไม่ใช่ application RPC ถูกถอด direct EXECUTE แล้ว และยังมี warning ของ leaked-password protection ที่ปิดอยู่ใน Auth config:

- [Anonymous SECURITY DEFINER guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated SECURITY DEFINER guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Password protection settings](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

งานถัดไป: signed-session E2E สำหรับแต่ละบทบาท, วงจรเปลี่ยน/ลบไฟล์ draft และจัดการ orphan uploads, entitlements/downloads, การชำระเงิน/คืนเงิน/stock reservation และทดสอบ workflow ทางการเงินเต็มเส้นทางก่อนเปิดขายจริง
