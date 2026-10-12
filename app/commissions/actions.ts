'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireUser,requireSeller,requireSellerHistory,requireMfa,requirePlatformAdmin} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {decimalToMinor} from '@/lib/payment-utils';
function text(form:FormData,key:string){return String(form.get(key)||'').trim();}
function uid(form:FormData,key:string){const id=text(form,key);return uuidPattern.test(id)?id:null;}
function refresh(id:string){for(const path of [`/account/orders/${id}`,`/seller/orders/${id}`,'/account/orders','/seller/orders','/account/library',`/admin/orders/${id}`,'/admin/sales'])revalidatePath(path);}
export async function requestCommission(form:FormData){
 const product=uid(form,'product'),key=uid(form,'key');if(!product||!key)return {error:'invalid'};const target=`/account/commissions/new?product=${product}`;
 const {client}=await requireUser(target);const policies=form.getAll('policies').map(String);
 if(form.get('confirmed')!=='yes'||policies.length!==8||policies.some(p=>!uuidPattern.test(p)))return {error:'invalid'};
 const {data,error}=await client.rpc('request_commission',{p_product:product,p_usage:text(form,'usage'),p_brief:text(form,'brief'),p_policies:policies,p_key:key});
 if(error||typeof data!=='string'||!uuidPattern.test(data))return {error:error?.message||'failed'};
 revalidatePath('/account/orders');revalidatePath('/seller/orders');return {orderId:data};
}
export async function workOrderAction(form:FormData){
 const id=uid(form,'order');if(!id)redirect('/account/orders');const scope=text(form,'scope'),action=text(form,'action');
 const back=scope==='seller'?`/seller/orders/${id}`:scope==='admin'?`/admin/orders/${id}`:`/account/orders/${id}`;
 const identity=scope==='seller'?(['message','cancel','deliver','remove_file'].includes(action)?await requireSellerHistory(back):await requireSeller()):scope==='admin'?await requirePlatformAdmin(back):await requireUser(back);const client=identity.client;
 if(scope==='seller')await requireMfa(client,back);
 let name:string,params:Record<string,unknown>;
 if(action==='remove_file'&&scope==='seller'&&uid(form,'file')){const {data:path,error}=await client.rpc('remove_commission_file',{p_file:uid(form,'file')});if(error)redirect(back+'?notice=failed');if(typeof path==='string')await client.storage.from('tidalis-order-deliveries').remove([path]);refresh(id);redirect(back+'?notice=saved');}
 if(action==='extend_payment'&&scope==='seller'){name='extend_commission_payment';params={p_order:id};}
 else if(action==='message'){name='post_order_message';params={p_order:id,p_body:text(form,'body')};}
 else if(action==='brief'){name='revise_commission_brief';params={p_order:id,p_brief:text(form,'brief')};}
 else if(action==='cancel'){name='cancel_commission';params={p_order:id,p_reason:text(form,'reason')};}
 else if(action==='quote'&&scope==='seller'){
  let amount:string;try{amount=decimalToMinor(text(form,'amount')).toString();}catch{redirect(back+'?notice=invalid');}
  name='offer_commission_quote';params={p_order:id,p_amount:amount,p_scope:text(form,'quoteScope'),p_terms:text(form,'terms'),p_days:Number(text(form,'days')),p_revisions:Number(text(form,'revisions')),p_valid_days:Number(text(form,'validDays'))};
 }else if(action==='accept_quote'&&scope==='buyer'&&uid(form,'quote')&&form.get('confirmed')==='yes'){name='accept_commission_quote';params={p_quote:uid(form,'quote')};}
 else if(action==='deliver'&&scope==='seller'){name='submit_commission_delivery';params={p_order:id,p_note:text(form,'note')};}
 else if(['accept_delivery','revise_delivery'].includes(action)&&scope==='buyer'&&uid(form,'delivery')&&(action!=='accept_delivery'||form.get('confirmed')==='yes')){name='review_commission_delivery';params={p_delivery:uid(form,'delivery'),p_accept:action==='accept_delivery',p_note:text(form,'note')};}
 else redirect(back+'?notice=invalid');
 const {error}=await client.rpc(name,params);if(error){console.error('[phase6 order action]',name,error.code);redirect(back+'?notice='+encodeURIComponent(error.message));}refresh(id);redirect(back+'?notice=saved');
}
