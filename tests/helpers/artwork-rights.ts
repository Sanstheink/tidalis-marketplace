import {expect,type Page} from '@playwright/test';
import QRCode from 'qrcode';
export async function verifyArtworkRights(buyer:Page,seller:Page,admin:Page,order:string){
 await admin.goto('/admin/policies');
 for(const type of ['standard-license','standard-assignment']){
  const block=admin.locator('section.phase4-publish').filter({hasText:`PLATFORM POLICY / ${type}`});
  await block.getByLabel('ฉันตรวจเอกสารจริงและได้รับอนุญาตให้เผยแพร่แล้ว').check();await block.getByRole('button',{name:`เผยแพร่ ${type} v1`,exact:true}).click();await expect(admin).toHaveURL(/result=published/);
 }
 await buyer.goto(`/account/orders/${order}`);await buyer.getByText('แจ้งความประสงค์ขอโอนสิทธิ์ขาด',{exact:true}).click();await buyer.getByLabel('รายละเอียดที่ต้องการแจ้งร้าน').fill('Synthetic buyer request to transfer the agreed artwork.');await buyer.getByRole('button',{name:'แจ้งร้านค้า',exact:true}).click();await expect(buyer).toHaveURL(/rights=requested/);
 const ids:string[]=[];
 for(const kind of ['license','assignment']){
  await seller.goto(`/seller/orders/${order}`);await seller.getByText('จัดทำเอกสารสิทธิ์ฉบับใหม่',{exact:true}).click();const form=seller.locator('.rights-form');
  await form.getByLabel('ประเภทเอกสาร',{exact:true}).selectOption(kind);
  if(kind==='license'){await form.getByLabel('ประเภทการใช้สิทธิ์',{exact:true}).selectOption('merchandise');await form.getByLabel('ลักษณะการให้สิทธิ์',{exact:true}).selectOption('sole');}
  await form.getByLabel('ขอบเขต สิทธิ์เดิม และข้อจำกัดที่ตกลง').fill('Synthetic terms: allow reproduction of the agreed illustration; no third-party material is included.');await form.getByLabel('รายละเอียดอ้างอิงข้อตกลง').fill('Buyer and seller agreed in the local test order chat.');await form.getByLabel('ภาพตัวอย่างผลงาน').setInputFiles({name:'artwork.png',mimeType:'image/png',buffer:await QRCode.toBuffer('Synthetic artwork fixture only',{width:256})});await form.getByLabel('ชื่อผู้ลงนามแทนผู้ให้สิทธิ์').fill('Synthetic Artist Signer');await form.getByLabel(/ฉันมีอำนาจให้หรือโอนสิทธิ์/).check();
  const title=form.getByLabel('ชื่อผลงาน',{exact:true});const originalTitle=await title.inputValue();
  await title.fill('  A  ');await form.getByRole('button',{name:'ลงนามและเสนอเอกสารให้ผู้ซื้อ',exact:true}).click();
  await expect(form.getByRole('alert')).toContainText('ชื่อผลงานต้องมี 3–200 ตัวอักษร');
  await expect(title).toHaveValue('  A  ');
  await expect(form.getByLabel('รายละเอียดอ้างอิงข้อตกลง')).toHaveValue('Buyer and seller agreed in the local test order chat.');
  expect(await form.getByLabel('ภาพตัวอย่างผลงาน').evaluate((input:HTMLInputElement)=>input.files?.length)).toBe(1);
  await title.fill(originalTitle);
  // A server-side rejection must also keep text, consent and the selected file.
  await form.getByLabel('ภาพตัวอย่างผลงาน').setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('This is not a real PNG image, despite its file name.')});
  await form.getByRole('button',{name:'ลงนามและเสนอเอกสารให้ผู้ซื้อ',exact:true}).click();
  await expect(form.getByRole('alert').filter({hasText:'แนบภาพ JPG หรือ PNG'})).toBeVisible();
  await expect(title).toHaveValue(originalTitle);
  await expect(form.getByLabel(/ฉันมีอำนาจให้หรือโอนสิทธิ์/)).toBeChecked();
  expect(await form.getByLabel('ภาพตัวอย่างผลงาน').evaluate((input:HTMLInputElement)=>input.files?.[0]?.name)).toBe('invalid.png');
  await form.getByLabel('ภาพตัวอย่างผลงาน').setInputFiles({name:'artwork.png',mimeType:'image/png',buffer:await QRCode.toBuffer('Synthetic artwork fixture only',{width:256})});
  await form.getByRole('button',{name:'ลงนามและเสนอเอกสารให้ผู้ซื้อ',exact:true}).click();await expect(seller).toHaveURL(/\/rights\/[0-9a-f-]{36}\?rights=offered$/);
  const id=new URL(seller.url()).pathname.split('/').at(-1)!;ids.push(id);
  expect((await seller.request.get(`/rights/${id}/download`)).status()).toBe(404);
  await buyer.goto(`/rights/${id}`);await expect(buyer.locator('.rights-document')).toContainText('ผู้ซื้อทดสอบ Local Test Buyer');await expect(buyer.locator('.rights-preview img')).toBeVisible();
  await buyer.getByLabel('ชื่อผู้ลงนามรับสิทธิ์ / ผู้มีอำนาจแทน').fill('Synthetic Buyer Signer');await buyer.getByLabel(/ฉันเป็นผู้รับสิทธิ์หรือผู้มีอำนาจแทน/).check();await buyer.getByRole('button',{name:'ลงนามยอมรับเอกสารฉบับนี้',exact:true}).click();await expect(buyer).toHaveURL(/rights=accepted/);
  const pdf=await buyer.request.get(`/rights/${id}/download`);expect(pdf.status()).toBe(200);expect(pdf.headers()['content-type']).toContain('application/pdf');expect(pdf.headers()['cache-control']).toContain('no-store');expect((await pdf.body()).subarray(0,5).toString()).toBe('%PDF-');
 }
 await buyer.goto(`/account/orders/${order}`);await expect(buyer.locator('.order-action-row a[href*="/rights/"]')).toHaveCount(2);await buyer.setViewportSize({width:390,height:844});expect(await buyer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await buyer.screenshot({path:'test-results/checkout-ui/artwork-rights-mobile.png',fullPage:true});await buyer.setViewportSize({width:1440,height:1000});
 // Admin is not a contract party; privileged UI identity does not grant document access.
 expect((await admin.request.get(`/rights/${ids[1]}/download`)).status()).toBe(404);
 return ids;
}
