/* Static regression checks only; integration tests must use a separate Supabase Staging project. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const auth=read('lib/auth.ts');
const form=read('components/AuthForm.tsx');
const verify=read('components/VerifyEmailForm.tsx');
const reset=read('components/PasswordRecovery.tsx');
const security=read('app/account/security/page.tsx');
const account=read('app/account/page.tsx');
const workspace=read('app/workspace/page.tsx');
const mfa=read('components/MfaSetup.tsx');
const tests=[
 ['regular user is verified by email only',()=>{const block=auth.split('export async function requireUser(')[1].split('export async function requireMfa(')[0];assert.match(block,/email_confirmed_at/);assert.doesNotMatch(block,/requireMfa|aal2|getAuthenticatorAssuranceLevel/)}],
 ['admin guard retains role and AAL2 verification',()=>{const b=auth.split('export async function requirePlatformAdmin()')[1].split('export async function requireSeller()')[0];assert.match(b,/platform_roles/);assert.match(b,/requireMfa\(client/)}],
 ['seller guard retains active or paused membership and AAL2',()=>{const b=auth.split('export async function requireSeller()')[1].split('export async function getWorkspaceAccess(')[0];assert.match(b,/shop_members/);assert.match(b,/requireMfa\(client/)}],
 ['requireMfa verifies AAL2 via Supabase authenticator assurance',()=>assert.match(auth,/data\?\.currentLevel!=='aal2'/)],
 ['password + otp login keep existing authentication',()=>{assert.match(form,/auth\.signInWithPassword/);assert.match(form,/auth\.signInWithOtp/)}],
 ['registration needs email/password but does not enroll MFA',()=>{assert.match(form,/auth\.signUp/);assert.doesNotMatch(form,/auth\.mfa\.enroll/)}],
 ['signup OTP leads to normal buyer account without MFA gate',()=>{assert.match(verify,/signup:.*ไม่ต้องเปิด MFA/);assert.match(verify,/safeNextPath\(next\)/)}],
 ['Buyer account and workspace explain role based MFA',()=>{assert.match(account,/\/account\/security/);assert.match(workspace,/โดยไม่ต้องเปิด MFA/)}],
 ['account security page is protected by user-only guard',()=>{assert.match(security,/requireUser\('\/account\/security'\)/);assert.doesNotMatch(security,/requireMfa\(/)}],
 ['account security page uses Supabase real session status',()=>{assert.match(security,/getAuthenticatorAssuranceLevel/);assert.match(security,/data\?\.nextLevel==='aal2'/)}],
 ['password change requires extra factor if already enrolled',()=>{assert.match(reset,/nextLevel==='aal2'&&assurance\.currentLevel!=='aal2'/);assert.match(reset,/\/mfa\?next=%2Freset-password/)}],
 ['password update not bypassed via service key or admin endpoint',()=>{assert.match(reset,/auth\.updateUser\(\{password\}\)/);assert.doesNotMatch(reset,/service_role|SUPABASE_SERVICE_ROLE|auth\.admin\./)}],
 ['existing factor enrollment/challenge flows remain',()=>{assert.match(mfa,/auth\.mfa\.enroll/);assert.match(mfa,/auth\.mfa\.challenge/);assert.match(mfa,/auth\.mfa\.verify/)}]
];
let passed=0;
for(const [name,test] of tests){try{test();passed++;console.log('PASS',name)}catch(e){process.exitCode=1;console.error('FAIL',name,e.message)}}
console.log(`Optional buyer MFA checks: ${passed}/${tests.length} passed`);
