'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireSellerFinance,requireMfa} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
export async function issueShopReceipt(form:FormData){
 const order=String(form.get('order')||'');if(!uuidPattern.test(order))redirect('/seller/orders');const back=`/seller/orders/${order}`;const {client}=await requireSellerFinance();await requireMfa(client,back);
 if(form.get('confirmed')!=='yes')redirect(back+'?notice=invalid');
 const {data,error}=await client.rpc('issue_shop_receipt',{p_order:order,p_name:String(form.get('recipientName')||'').trim(),p_address:String(form.get('recipientAddress')||'').trim()});
 if(error)redirect(back+'?notice='+encodeURIComponent(error.message));revalidatePath(back);revalidatePath('/seller/documents');redirect(`/seller/documents/${data}`);
}
export async function voidShopReceipt(form:FormData){
 const doc=String(form.get('document')||'');if(!uuidPattern.test(doc))redirect('/seller/documents');const back=`/seller/documents/${doc}`;const {client}=await requireSellerFinance();await requireMfa(client,back);
 if(form.get('confirmed')!=='yes')redirect(back+'?notice=invalid');const {error}=await client.rpc('void_shop_receipt',{p_document:doc,p_reason:String(form.get('reason')||'').trim()});
 if(error)redirect(back+'?notice=failed');revalidatePath('/seller/documents');revalidatePath(back);redirect(back+'?notice=voided');
}
