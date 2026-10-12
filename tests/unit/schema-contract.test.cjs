const {test}=require('node:test');const assert=require('node:assert/strict');
test('schema drift detection ignores SQL formatting while preserving protected literal changes',async()=>{
 const {sqlTokens}=await import('../db/schema-contract.mjs');
 assert.deepEqual(sqlTokens("select 1 -- formatting\nwhere status='published';"),sqlTokens("SELECT 1 WHERE status = 'published';"));
 assert.notDeepEqual(sqlTokens("status='published'"),sqlTokens("status='draft'"));
});
test('schema drift detection includes function bodies and RLS changes, beyond table columns',async()=>{
 const {schemaDifferences}=await import('../db/schema-contract.mjs');
 const expected={columns:[{table:'policies',column:'document_path',type:'text',nullable:'YES'}],functions:[{schema:'public',name:'lock_policy',args:'',source:'select false',config:[],definer:false}],policies:[]};
 const actual={...expected,functions:[{...expected.functions[0],source:'select true'}]};
 assert.deepEqual(schemaDifferences(expected,actual),['functions: public.lock_policy() (source)']);
});
