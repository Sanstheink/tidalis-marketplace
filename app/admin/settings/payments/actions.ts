'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requirePlatformAdmin} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
export async function saveIssuer(form:FormData){
 const {client}=await requirePlatformAdmin();if(form.get('confirmed')!=='yes')redirect('/admin/settings/payments?notice=confirm_required');
 const {error}=await client.rpc('save_platform_issuer',{p_name:String(form.get('name')||'').trim(),p_address:String(form.get('address')||'').trim(),p_tax_id:String(form.get('taxId')||'').trim()});
 if(error)redirect('/admin/settings/payments?notice=invalid_issuer');revalidatePath('/admin/settings/payments');revalidatePath('/admin/finance/documents');redirect('/admin/settings/payments?notice=issuer_saved');
}
export async function setSales(form:FormData){
 const {client}=await requirePlatformAdmin();if(form.get('confirmed')!=='yes')redirect('/admin/settings/payments?notice=confirm_required');
 const {error}=await client.rpc('set_sales_enabled',{p_enabled:form.get('enabled')==='on'});if(error)redirect('/admin/settings/payments?notice=policies_required');
 revalidatePath('/admin/settings/payments');revalidatePath('/shop');redirect('/admin/settings/payments?notice=sales_saved');
}
export async function saveFee(form:FormData){
 const {client}=await requirePlatformAdmin();const value=String(form.get('rate')||''),shop=String(form.get('shopId')||'');
 if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)||(shop&&!uuidPattern.test(shop))||form.get('confirmed')!=='yes')redirect('/admin/settings/payments?notice=invalid_fee');
 const [whole,decimal='']=value.split('.'),rate=Number(whole)*100+Number(decimal.padEnd(2,'0'));if(rate>10000)redirect('/admin/settings/payments?notice=invalid_fee');
 const {error}=await client.rpc('save_fee_rule',{p_shop_id:shop||null,p_rate:rate});if(error)redirect('/admin/settings/payments?notice=invalid_fee');revalidatePath('/admin/settings/payments');redirect('/admin/settings/payments?notice=fee_saved');
}
export async function issueFeeInvoice(form:FormData){
 const {client}=await requirePlatformAdmin();const shop=String(form.get('shopId')||'');if(!uuidPattern.test(shop)||form.get('confirmed')!=='yes')redirect('/admin/finance?notice=invalid_invoice');
 const {error}=await client.rpc('issue_fee_invoice',{p_shop_id:shop,p_currency:String(form.get('currency')||''),p_from:String(form.get('from')||''),p_to:String(form.get('to')||''),p_due:String(form.get('due')||'')});
 if(error)redirect('/admin/finance?notice='+encodeURIComponent(error.message));revalidatePath('/admin/finance');revalidatePath('/seller/finance');redirect('/admin/finance?notice=invoice_issued');
}
