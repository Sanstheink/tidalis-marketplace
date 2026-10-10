'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';
import {uuid} from '@/lib/admin-finance';

export async function issuePlatformDocument(form:FormData) {
 const {client}=await requirePlatformAdmin();
 const id=String(form.get('payment_id')||'');
 const kind=String(form.get('kind')||'');
 const recipientTax=String(form.get('recipient_tax_id')||'').trim();
 const net=String(form.get('net_minor')||'').trim();
 const vat=String(form.get('vat_minor')||'').trim();
 if(!uuid.test(id)||!['receipt','tax_invoice'].includes(kind)||form.get('confirmed')!=='yes')
   redirect('/admin/finance/documents?notice=invalid');
 if(kind==='tax_invoice'&&(!/^\d{13}$/.test(recipientTax)||!/^\d+$/.test(net)||!/^\d+$/.test(vat)))
   redirect('/admin/finance/documents?notice=invalid');
 const {error}=await client.rpc('tidalis_issue_platform_document',{
  p_payment_id:id,p_kind:kind,p_recipient_tax_id:kind==='tax_invoice'?recipientTax:null,
  p_net_minor:kind==='tax_invoice'?net:null,p_vat_minor:kind==='tax_invoice'?vat:null
 });
 if(error){console.error('[platform billing document]',error.code);redirect('/admin/finance/documents?notice=failed');}
 revalidatePath('/admin/finance/documents');revalidatePath('/admin/finance');
 redirect('/admin/finance/documents?notice=issued');
}
export async function voidPlatformDocument(form:FormData){
 const {client}=await requirePlatformAdmin();
 const id=String(form.get('document_id')||'');
 const reason=String(form.get('reason')||'').trim();
 if(!uuid.test(id)||reason.length<15||reason.length>1000||form.get('confirmed')!=='yes')
   redirect('/admin/finance/documents?notice=invalid');
 const {error}=await client.rpc('tidalis_void_platform_document',{p_document_id:id,p_reason:reason});
 if(error){console.error('[platform billing void]',error.code);redirect('/admin/finance/documents?notice=failed');}
 revalidatePath('/admin/finance/documents');redirect('/admin/finance/documents?notice=voided');
}
