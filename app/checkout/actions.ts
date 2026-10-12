'use server';
import {revalidatePath} from 'next/cache';
import {getIdentity} from '@/lib/auth';
import {getCheckoutContext} from '@/lib/orders';
import {uuidPattern,type OrderItemInput} from '@/lib/marketplace-cart-utils';
export async function loadCheckout(shopId:string,ids:string[]){
  if(!uuidPattern.test(shopId)||!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!uuidPattern.test(id)))return null;
  return getCheckoutContext(shopId,ids);
}
export async function placeFixedOrder(input:{shopId:string;items:OrderItemInput[];note:string;policyIds:string[];key:string;accepted:boolean}){
  const {client,user}=await getIdentity();
  if(!client||!user)return {error:'login_required'};
  if(!user.email_confirmed_at)return {error:'verified_email_required'};
  if(!input||input.accepted!==true||typeof input.note!=='string'||input.note.length>2000||!uuidPattern.test(input.shopId)||!uuidPattern.test(input.key)
    ||!Array.isArray(input.items)||input.items.length<1||input.items.length>20||!Array.isArray(input.policyIds)||input.policyIds.length!==8)return {error:'invalid_items'};
  const {data,error}=await client.rpc('create_fixed_order',{p_shop_id:input.shopId,p_items:input.items,p_note:input.note,p_policy_ids:input.policyIds,p_idempotency_key:input.key});
  if(error||!data)return {error:error?.message||'unavailable'};
  revalidatePath('/account/orders');return {orderId:String(data)};
}
export async function cancelFixedOrder(id:string){
  const {client,user}=await getIdentity();
  if(!client||!user||!user.email_confirmed_at)return {error:'verified_email_required'};
  if(!uuidPattern.test(id))return {error:'order_unavailable'};
  const {error}=await client.rpc('cancel_fixed_order',{p_order_id:id});
  if(error)return {error:error.message};
  revalidatePath('/account/orders');revalidatePath(`/account/orders/${id}`);return {ok:true};
}
