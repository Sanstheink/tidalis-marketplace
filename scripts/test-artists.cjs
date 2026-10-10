// Structural checks only. Verify database/RLS and UI manually on staging/preview.
const fs = require('fs');
const assert = require('assert/strict');
const read = path => fs.readFileSync(path,'utf8');
let passed = 0;
function check(description, fn) {
  try {fn(); passed++; console.log('PASS: '+description)}
  catch(error){console.error('FAIL: '+description);console.error(error.message);process.exitCode=1;}
}
const catalog=read('lib/public-catalog.ts');
const artists=read('app/artists/page.tsx');
const homepage=read('app/page.tsx');
const chrome=read('components/Chrome.tsx');
const card=read('components/ArtistCard.tsx');
const stylesheet=read('app/globals.css');
check('artist list uses the anonymous client',()=>assert.match(catalog,/getPublicArtists[\s\S]*?const client = publicClient\(\)/));
check('directory only includes active shops',()=>assert.match(catalog,/\.from\('shops'\)[\s\S]*?\.eq\('status', 'active'\)/));
check('directory reads public columns only',()=>assert.match(catalog,/\.select\('id,slug,name,description', \{count: 'exact'\}\)/));
check('directory search & bounded pagination are server-side',()=>{
  assert.match(catalog,/\.ilike\('name',/);assert.match(catalog,/\.range\(/);assert.match(catalog,/Math\.min\(24/);
});
check('directory distinguishes unavailable from empty shops',()=>{
  assert.match(artists,/unavailable \?/);assert.match(artists,/total === 0 \?/);
});
check('directory singles have special layout',()=>assert.match(artists,/total === 1 \? ' artist-directory-single'/));
check('directory provides link to real shop',()=>assert.match(card,/href=\{`\/shops\/\$\{encodeURIComponent\(shop.slug\)\}`\}/));
check('homepage features real artists and links /artists',()=>{
  assert.match(homepage,/getPublicArtists\(\{pageSize:3\}\)/);assert.match(homepage,/<h2><Link href="\/artists"/);
});
check('navbar and footer use directory not demo shop',()=>{
  assert.match(chrome,/\['ร้านศิลปิน','\/artists'\]/);
  assert.match(chrome,/\['ร้านค้าศิลปิน','\/artists'\]/);
  assert.doesNotMatch(chrome,/\/shops\/moonlight-studio/);
});
check('responsive empty and single shop states',()=>{
  assert.match(stylesheet,/artist-directory-single/);assert.match(stylesheet,/artist-directory-empty/);
  assert.match(stylesheet,/@media\(max-width:600px\)/);
});
check('directory does not expose seller finance or private files',()=>{
  assert.doesNotMatch(catalog.slice(catalog.indexOf('export async function getPublicArtists')),/shop_payment_methods|seller_tax|product_files|storage\.from|service_role/);
});
console.log(`Artist Directory structural checks: ${passed}/11 passed`);
