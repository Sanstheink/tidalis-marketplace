/* Fixture-level checkout/cart rules. Run with npm run test:phase2. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
// Minimal TS transpiler for self-contained catalog/commerce modules; no app runtime dependency.
require.extensions['.ts']=(module,filename)=>{
  const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  module._compile(js,filename);
};
const {products,quantityLimit,priceFor}=require('../lib/catalog.ts');
const {normalizeCartLines,groupByShop,resolveLines,lineKey}=require('../lib/cart-utils.ts');
const sample=(productId,license='personal',quantity=1)=>({key:'malicious-or-stale-key',productId,license,quantity});
const tests=[
  ['reject malformed cart data',()=>{
    assert.deepEqual(normalizeCartLines(null),[]);
    assert.deepEqual(normalizeCartLines([sample('not-real'),sample('pr-003'),sample('pr-002','invalid'),sample('pr-002','personal',-1)]),[]);
  }],
  ['prevent exclusive quantities and conflicting license',()=>{
    const x=normalizeCartLines([sample('pr-001','personal',9),sample('pr-001','commercial',1)]);
    assert.equal(x.length,1);assert.equal(x[0].quantity,1);assert.equal(quantityLimit(products[0]),1);
  }],
  ['canonicalize keys and merge duplicate nonexclusive quantities',()=>{
    const x=normalizeCartLines([sample('pr-002','personal',7),sample('pr-002','personal',19)]);
    assert.deepEqual(x,[{key:lineKey('pr-002','personal'),productId:'pr-002',license:'personal',quantity:20}]);
  }],
  ['separate every seller checkout and compute exact preview subtotals',()=>{
    const cart=[sample('pr-002','personal',2),sample('pr-006','commercial',3),sample('pr-007','personal',1)];
    const groups=groupByShop(cart);
    assert.equal(groups.length,2);
    assert.equal(groups[0].shopSlug,'moonlight-studio');
    assert.equal(groups[1].shopSlug,'aurora-atelier');
    assert.equal(groups[0].subtotal,700);
    assert.equal(groups[1].subtotal,990*3+320);
    assert.equal(resolveLines(cart).length,3);
  }],
  ['personal and commercial are independent seller prices',()=>{
    const p=products.find(p=>p.id==='pr-002');
    assert.equal(priceFor(p,'personal'),350);
    assert.equal(priceFor(p,'commercial'),690);
  }]
];
let failed=0;
for(const [label,fn] of tests){try{fn();console.log('PASS',label)}catch(err){failed++;console.error('FAIL',label,err.message)}}
console.log(`${tests.length-failed}/${tests.length} Phase 2 logic tests passing`);
if(failed)process.exitCode=1;
