/* Static regression checks: not a substitute for real Auth + Resend staging tests. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=(p)=>fs.readFileSync(p,'utf8');
const tests=[
 ['six digit grouped accessible inputs',()=>{
   const s=read('components/OtpCodeInput.tsx');
   assert.match(s,/length:6/);assert.match(s,/role="group"/);assert.match(s,/inputMode="numeric"/);
   assert.match(s,/onPaste=/);assert.match(s,/Backspace/);assert.match(s,/autoComplete=/);
 }],
 ['signup, login, recovery server validated by Supabase',()=>{
   const s=read('components/VerifyEmailForm.tsx');
   assert.match(s,/verifyOtp/);assert.match(s,/type:flow==='login'\?'email':flow/);assert.match(s,/signInWithOtp/);assert.match(s,/resetPasswordForEmail/);assert.match(s,/resend\(\{/);
 }],
 ['login OTP refuses creating new users',()=>{
   const s=read('components/AuthForm.tsx');assert.match(s,/shouldCreateUser:false/);assert.match(s,/flow=login/);
 }],
 ['password recovery uses OTP, not client-made token',()=>{
   const s=read('components/PasswordRecovery.tsx');assert.match(s,/flow=recovery/);assert.match(s,/resetPasswordForEmail/);
 }],
 ['admin/seller MFA remains real TOTP with boxes',()=>{
   const s=read('components/MfaSetup.tsx');assert.match(s,/OtpCodeInput/);assert.match(s,/mfa\.challenge/);assert.match(s,/mfa\.verify/);
 }],
 ['3 email templates reference a Supabase-generated code',()=>{
   for(const f of ['confirm-signup','magic-link','recovery'])assert.match(read(`supabase/email-templates/${f}.html`),/\{\{ \.Token \}\}/);
 }],
 ['Resend credentials stay server-side, no public send route',()=>{
   const s=read('lib/email/resend.ts');assert.match(s,/import 'server-only'/);assert.match(s,/process\.env\.RESEND_API_KEY/);assert.doesNotMatch(s,/NEXT_PUBLIC_RESEND/);
   const s2=read('.env.example');assert.doesNotMatch(s2,/NEXT_PUBLIC_RESEND/);
 }],
 ['visual effects support motion preferences',()=>{
   const s=read('app/globals.css');assert.match(s,/\.otp-cell:focus-visible/);assert.match(s,/prefers-reduced-motion:reduce/);assert.match(s,/@keyframes otpRise/);
 }]
];
let fails=0;for(const [name,test] of tests){try{test();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,e.message)}}
console.log(`${tests.length-fails}/${tests.length} OTP/Resend static checks passed`);if(fails)process.exitCode=1;
