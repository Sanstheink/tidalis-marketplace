import {readFileSync,existsSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {resolve} from 'node:path';
const root=process.cwd();
const read=p=>readFileSync(resolve(root,p),'utf8');
const checks=[
 ['migration 010 exists',()=>existsSync(resolve(root,'supabase/migrations/010_admin_operations_finance.sql'))],
 ['admin AAL2 gate unchanged',()=>read('lib/auth.ts').includes('await requireMfa(client,')&&read('lib/auth.ts').includes("eq('role','admin')")],
 ['migration checks AAL2 role through helper',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('public.is_platform_admin(auth.uid())')],
 ['announcements only RPC writes',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('revoke insert,update,delete on public.platform_announcements')],
 ['announcements audit trail',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes("'announcement_'||p_action")],
 ['announcements published via status',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes("status='published'")],
 ['template public announcements',()=>read('app/template.tsx').includes("eq('status','published')")],
 ['announcement UI popup only homepage',()=>read('components/PlatformAnnouncements.tsx').includes("pathname==='/'")],
 ['sale pages admin gate',()=>read('app/admin/sales/page.tsx').includes('requirePlatformAdmin(')],
 ['sales confirmed payments only',()=>read('app/admin/sales/page.tsx').includes(".eq('status','confirmed')")],
 ['sales not demo catalog',()=>!read('app/admin/sales/page.tsx').includes("from '@/lib/catalog'")],
 ['finance view admin gate',()=>read('app/admin/finance/page.tsx').includes('requirePlatformAdmin(')],
 ['shop docs admin gate',()=>read('app/admin/finance/shop-documents/page.tsx').includes('requirePlatformAdmin(')],
 ['finance docs RLS',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('alter table public.platform_billing_documents enable row level security')],
 ['no direct finance insert grants',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('revoke all on public.platform_billing_documents')],
 ['receipt requires confirmed payment',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes("v_pay.status<>'confirmed'")],
 ['receipt requires confirmed_at and confirmed_by',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('v_pay.confirmed_at is null or v_pay.confirmed_by is null')],
 ['tax issuance disabled until explicitly enabled',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('v_issuer.tax_invoice_enabled')],
 ['tax reconciles gross and VAT',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('v_net+v_vat<>v_pay.amount_minor')],
 ['document number uniqueness',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('document_number text not null unique')],
 ['document immutability',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes('Financial document snapshots are immutable')],
 ['audit document issuance',()=>read('supabase/migrations/010_admin_operations_finance.sql').includes("'platform_document_issued'")],
 ['direct payment writes not enabled',()=>!read('supabase/migrations/010_admin_operations_finance.sql').includes('grant insert on public.platform_fee_payments')],
 ['no service_role credentials introduced',()=>!read('app/admin/finance/documents/actions.ts').includes('SUPABASE_SERVICE_ROLE_KEY')]
];
let passed=0;
for(const [name,test] of checks){try{assert.ok(test());console.log('PASS',name);passed++;}catch(e){console.error('FAIL',name,e.message);process.exitCode=1;}}
console.log('Phase 5.9:',passed,'/',checks.length);
