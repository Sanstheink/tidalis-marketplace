import {test,expect} from '@playwright/test';

test('OTP deletion/replacement keeps the other cells in place and rejects an incomplete code',async({page})=>{
  await page.goto('/verify-email?flow=login&email=regression%40example.invalid');
  const cells=page.locator('.otp-cell');
  await cells.nth(0).fill('123456');
  await expect(page.locator('button[type=submit]')).toBeEnabled();
  await cells.nth(2).press('Backspace');
  await expect(cells.nth(2)).toHaveValue('');
  for(const [index,value] of [[0,'1'],[1,'2'],[3,'4'],[4,'5'],[5,'6']] as const)await expect(cells.nth(index)).toHaveValue(value);
  await expect(page.locator('button[type=submit]')).toBeDisabled();
  await cells.nth(2).fill('9');
  await expect(page.locator('button[type=submit]')).toBeEnabled();
  await cells.nth(3).press('Delete');
  await expect(cells.nth(3)).toHaveValue('');await expect(cells.nth(4)).toHaveValue('5');
  await expect(page.locator('button[type=submit]')).toBeDisabled();
});
test('pasting a complete OTP from a middle cell fills all six cells',async({page})=>{
  await page.goto('/verify-email?flow=login&email=regression%40example.invalid');
  await page.locator('.otp-cell').nth(3).evaluate(input=>{
    const data=new DataTransfer();data.setData('text','001234');
    input.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));
  });
  for(const [index,value] of [...'001234'].entries())await expect(page.locator('.otp-cell').nth(index)).toHaveValue(value);
});
for(const path of ['/account','/workspace','/seller/products','/seller/readiness','/admin/announcements','/admin/finance']){
  test(`unauthenticated ${path} redirects to sign-in`,async({page})=>{
    await page.goto(path);await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
  });
}
test('auth error redirects use private/no-store caching',async({page})=>{
  for(const path of ['/auth/callback?next=https://example.invalid','/auth/confirm?type=signup']){
    const redirect=page.waitForResponse(response=>response.url().includes(path.split('?')[0])&&response.status()===307);
    await page.goto(path);
    const response=await redirect;
    const headers=await response.allHeaders();
    expect(response.status()).toBe(307);expect(headers['cache-control']).toContain('no-store');
    expect(headers['cache-control']).toContain('private');expect(headers['location']).toContain('/login?error=');
  }
});
test('OTP form fits a 390px mobile viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/verify-email?flow=login&email=regression%40example.invalid');
  await expect(page.locator('.otp-cell').last()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
