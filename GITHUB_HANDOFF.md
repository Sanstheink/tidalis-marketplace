# ตรวจและนำชุด 0.5.10 ขึ้น Production

ชุดแก้ไขอยู่บนสาขา `fix/marketplace-stability-20261011` และต่อยอดฟีเจอร์ที่ยังไม่ได้ merge เข้า main ทุกเฟสจนถึง 5.9 ใช้ [RELEASE_0_5_10.md](RELEASE_0_5_10.md) ดูการแก้ไขและผลทดสอบจริง

ใช้สาขา `fix/marketplace-stability-20261011` บน GitHub เป็นชุดสำหรับตรวจทาน เปิด PR เทียบกับ `main` และตรวจผล GitHub CI/Preview ของ commit ล่าสุดก่อน merge การตรวจในเครื่องและ Supabase จริงบันทึกไว้ใน release guide; ผลเหล่านั้นไม่แทนผล GitHub CI หรือการทดสอบบัญชีที่ล็อกอินจริงบน Preview

สาขานี้ต่อจาก Phase 5.9 จึงมีฟีเจอร์ก่อนหน้าที่ `main` ยังไม่มีด้วย การส่งสาขาสำหรับตรวจทานไม่ได้รวมโค้ดเข้า Production Branch หรือยืนยันว่าเว็บไซต์ Production ใช้ 0.5.10 แล้ว

## ดึงสาขาที่ส่งขึ้น GitHub

ใน repository clone ที่ไม่มีงานค้างที่ต้องย้ายออก:

```bash
git fetch origin
git switch --track origin/fix/marketplace-stability-20261011
git log -1 --oneline
```

ถ้ามีสาขาชื่อนี้ในเครื่องอยู่แล้ว ให้ตรวจ commit และงานค้างก่อน ไม่ใช้ force push เพื่อทับงาน Git bundle ที่จัดเตรียมก่อนเชื่อมต่อ GitHub เขียนได้เป็นสำเนาชุดแก้ไข ณ เวลานั้น; ใช้สาขาบน GitHub เมื่อต้องการเอกสารสถานะล่าสุด

## นำขึ้น Vercel

1. ตรวจ GitHub checks และ Vercel Preview ของ PR
2. ตรวจ Production Branch ใน Vercel project ว่าติดตามสาขาใด หากเป็น `main` ให้ merge PR เข้า `main` เมื่อผลตรวจผ่าน
3. ตรวจ deployment ใหม่ว่าสถานะ Ready และ Source ตรงกับ commit ที่รวมชุด 0.5.10
4. ตรวจ Auth, Workspace, Seller และ Admin ด้วยบัญชีของเจ้าของตาม release guide

Supabase migrations สองไฟล์ของ 0.5.10 ใช้กับโปรเจกต์ `fdwiwaawqrenxxvdsnqs` แล้ว ไม่ต้องใช้ซ้ำหลัง merge หรือ deploy และไม่ replay migrations เก่าเพราะไม่มีรายการใน migration history

การ redeploy commit เก่าไม่เปลี่ยนโค้ดเว็บไซต์ ให้ส่งและ merge ชุดแก้เข้าสาขา Production ก่อน แล้วตรวจ Source ของ deployment ใหม่
