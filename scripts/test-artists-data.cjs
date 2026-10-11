// Mocked Supabase read-contract test, not a live integration test.
// Requires devDependency TypeScript (npm install); no real network calls.
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const js = ts.transpileModule(fs.readFileSync('lib/public-catalog.ts', 'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022}
}).outputText;
let rows = [], fail = false, lastQuery = null;
const spy = () => {
  const req={steps:[]};
  const query={
    select(...args){req.steps.push(['select',...args]);return this},
    eq(...args){req.steps.push(['eq',...args]);return this},
    ilike(...args){req.steps.push(['ilike',...args]);return this},
    order(...args){req.steps.push(['order',...args]);return this},
    range(from,to){req.steps.push(['range',from,to]);lastQuery=req;
      return Promise.resolve(fail ? {data:null,count:null,error:{code:'DB_TEST'}} : {data:rows.slice(from,to+1),count:rows.length,error:null});
    }
  };
  return {from(name){assert.equal(name,'shops');return query}};
};
const sandbox={
  module:{exports:{}}, exports:{}, console:{error:()=>{}},
  process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-public-key'}},
  require(spec){if(spec==='server-only')return {};
    if(spec==='@supabase/supabase-js')return {createClient:()=>spy()};
    if(spec==='@/lib/catalog-query')return require('../tests/unit/load-typescript.cjs')('lib/catalog-query.ts');
    throw Error('Unexpected runtime dependency: '+spec);
  }
};
sandbox.exports=sandbox.module.exports;
vm.runInNewContext(js,sandbox,{filename:'public-catalog.js'});
const {getPublicArtists}=sandbox.module.exports;
const shop = i=>({id:String(i),slug:`artist-${i}`,name:`Artist ${i}`,description:''});
(async()=>{
  rows=[]; let result=await getPublicArtists();
  assert.equal(result.total,0); assert.equal(result.unavailable,false); assert.equal(result.shops.length,0);
  rows=[shop(1)]; result=await getPublicArtists();
  assert.equal(result.total,1); assert.equal(result.shops.length,1);
  assert.equal(lastQuery.steps.find(a=>a[0]==='eq')[2],'active');
  assert.equal(lastQuery.steps.find(a=>a[0]==='select')[1],'id,slug,name,description');
  rows=Array.from({length:27},(_,i)=>shop(i+1));
  result=await getPublicArtists({page:2,pageSize:12,search:'Artist'});
  assert.equal(result.total,27); assert.equal(result.shops.length,12);
  assert.equal(result.shops[0].slug,'artist-13');
  assert.deepEqual(Array.from(lastQuery.steps.find(a=>a[0]==='range').slice(1)),[12,23]);
  assert.equal(lastQuery.steps.find(a=>a[0]==='ilike')[2],'%Artist%');
  // Wildcard search is escaped rather than interpreted by SQL LIKE.
  await getPublicArtists({search:'%_'});
  assert.equal(lastQuery.steps.find(a=>a[0]==='ilike')[2],'%\\%\\_%');
  fail=true;result=await getPublicArtists();
  assert.equal(result.unavailable,true);assert.equal(result.total,0);
  console.log('Artist directory mocked read cases: 5/5 passed');
})().catch(error=>{console.error(error);process.exitCode=1});
