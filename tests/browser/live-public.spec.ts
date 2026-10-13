import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
test.skip(process.env.TIDALIS_LIVE_TESTS!=='true','Opt in to read-only live Supabase and negative Auth tests with TIDALIS_LIVE_TESTS=true');
const publicClient=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {auth:{persistSession:false,autoRefreshToken:false}});

test('live Supabase catalog RPC matches the storefront count and filter URL',async({page})=>{
  const {data,error}=await publicClient().rpc('search_public_products');expect(error).toBeNull();
  await page.goto('/shop');await expect(page.locator('.result-count')).toContainText(`พบ ${data.total} ผลงาน`);
  await page.locator('.filter-pills a[href*="type=commission"]').click();
  await expect(page).toHaveURL(/type=commission/);
  await expect(page.locator('.filter-pills a[href*="type=commission"]')).toHaveAttribute('aria-current','page');
  await page.goBack();await expect(page.locator('.filter-pills a[href="/shop"]')).toHaveAttribute('aria-current','page');
});
test('live database search/sort survives submission, reload and mobile navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/shop');
  await page.getByRole('textbox',{name:'ค้นหางานศิลปะ'}).fill('tidalis-no-match-regression-20261011');
  await page.getByRole('combobox',{name:'เรียงสินค้า'}).selectOption('high');
  await page.getByRole('button',{name:'ค้นหา',exact:true}).click();
  await expect(page.locator('.result-count')).toContainText('พบ 0 ผลงาน');
  await page.reload();await expect(page.getByRole('textbox',{name:'ค้นหางานศิลปะ'})).toHaveValue('tidalis-no-match-regression-20261011');
  await expect(page.getByRole('combobox',{name:'เรียงสินค้า'})).toHaveValue('high');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
test('a valid but nonexistent published-product URL returns a true 404',async({page})=>{
  const response=await page.goto('/products/absent--00000000-0000-0000-0000-000000000000');expect(response?.status()).toBe(404);
});
test('invalid password is rejected by the actual Supabase Auth service',async({page})=>{
  // Optional transport for restricted test containers whose Chromium can't
  // trust their egress proxy. Forward the real request; never mock Auth results.
  if(process.env.TIDALIS_AUTH_TEST_NODE_TRANSPORT==='true')await page.route('**/auth/v1/token?**',async route=>{
    const request=route.request();
    const response=await fetch(request.url(),{
      method:request.method(),headers:request.headers(),body:request.postData(),redirect:'error'
    });
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  await page.goto('/login');
  await page.getByLabel('อีเมล',{exact:true}).fill(`regression-${Date.now()}@example.invalid`);
  await page.getByLabel('รหัสผ่าน',{exact:true}).fill('Invalid-test-password-2026!');
  const response=page.waitForResponse(r=>r.url().includes('/auth/v1/token')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
  expect((await response).status()).toBe(400);await expect(page.locator('.auth-card .form-message[role=alert]')).toContainText(/Invalid login credentials/i);
  await expect(page).toHaveURL(/\/login$/);
});
