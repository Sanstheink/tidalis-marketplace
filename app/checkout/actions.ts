'use server';
import {revalidatePath} from 'next/cache';
import {getIdentity} from '@/lib/auth';
import {getCheckoutContext} from '@/lib/orders';
import {uuidPattern,type OrderItemInput} from '@/lib/marketplace-cart-utils';
import type {RecoveredFixedOrder} from '@/lib/checkout-attempt';
export async function loadCheckout(shopId:string,ids:string[]){
  if(!uuidPattern.test(shopId)||!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!uuidPattern.test(id)))return null;
  return getCheckoutContext(shopId,ids);
}
export async function recoverFixedOrder(shopId:string,key:string):Promise<{order:RecoveredFixedOrder|null;error?:string}>{
  if(!uuidPattern.test(shopId)||!uuidPattern.test(key))return {order:null,error:'invalid_items'};
  const {client,user}=await getIdentity();
  if(!client||!user)return {order:null,error:'login_required'};
  if(!user.email_confirmed_at)return {order:null,error:'verified_email_required'};
  // Use the buyer's RLS-scoped client, including explicit ownership and kind.
  // Recovery deliberately does not depend on today's stock, prices or policies.
  const {data,error}=await client.from('orders').select('id,order_items(product_id,usage_type,quantity)')
    .eq('buyer_id',user.id).eq('shop_id',shopId).eq('order_kind','fixed').eq('idempotency_key',key).maybeSingle();
  if(error)return {order:null,error:'order_recovery_unavailable'};
  if(!data)return {order:null};
  return {order:{orderId:data.id,items:data.order_items.map(item=>({productId:item.product_id,license:item.usage_type,quantity:item.quantity}))}};
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
