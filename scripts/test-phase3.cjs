/* Auth routing and authorization surface regression checks (not RLS integration tests). */
const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const src=fs.readFileSync('lib/auth-routes.ts','utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const moduleImpl={exports:{}};new Function('module','exports',js)(moduleImpl,moduleImpl.exports);
const {safeNextPath,hasVerifiedEmail}=moduleImpl.exports;
const tests=[
 ['allow own-account links',()=>{assert.equal(safeNextPath('/seller?tab=products'),'/seller?tab=products');assert.equal(safeNextPath('/workspace'),'/workspace')}],
 ['block open redirect attacks',()=>{for(const payload of ['https://evil.example','//evil.example','/\\evil.example','/%5c%5cevil.example','javascript:alert(1)','/auth/callback','/a\nLocation:https://evil.example'])assert.equal(safeNextPath(payload),'/account',payload)}],
 ['email verified guard',()=>{assert.equal(hasVerifiedEmail({email_confirmed_at:'2026-10-09T00:00:00Z'}),true);assert.equal(hasVerifiedEmail({email_confirmed_at:null}),false)}],
 ['role checks are server-side and membership-scoped',()=>{const a=fs.readFileSync('lib/auth.ts','utf8');assert.match(a,/auth\.getUser\(\)/);assert.match(a,/from\('platform_roles'\)/);assert.match(a,/from\('shop_members'\)/);assert.match(a,/\.in\('shops\.status',\['active','paused'\]\)/);assert.match(a,/getAuthenticatorAssuranceLevel/)}],
 ['admin RPC requires MFA and identity',()=>{const sql=fs.readFileSync('supabase/migrations/003_phase3_auth_hardening.sql','utf8');assert.match(sql,/is_platform_admin\(auth\.uid\(\)\)/);assert.match(sql,/auth\.jwt\(\)->>'aal'/);assert.match(sql,/for update/)}]
];
let failed=0;for(const [label,fn] of tests){try{fn();console.log('PASS',label)}catch(err){failed++;console.error('FAIL',label,err.message)}}console.log(`${tests.length-failed}/${tests.length} Phase 3 source-level tests passing`);if(failed)process.exitCode=1;
