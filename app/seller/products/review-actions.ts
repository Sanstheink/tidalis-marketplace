'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireSeller,requireMfa} from '@/lib/auth';
import {sellerAccessMode} from '@/lib/seller-access';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
export async function changeSellerProductReview(form:FormData){
  const {client,member}=await requireSeller();
  await requireMfa(client,'/seller/products');
  if(!['owner','manager','artist'].includes(member.role))redirect('/seller/products?notice=read-only');
  const id=String(form.get('id')||'');const action=String(form.get('action')||'');
  if(!uuidPattern.test(id)||!['submit','publish','withdraw','archive'].includes(action))redirect('/seller/products?notice=invalid');
  if(action==='archive'&&!['owner','manager'].includes(member.role))redirect('/seller/products?notice=read-only');
  const {data:product}=await client.from('products').select('id').eq('id',id).eq('shop_id',member.shop_id).maybeSingle();
  if(!product)redirect('/seller/products?notice=invalid');
  const mode=await sellerAccessMode(client);
  if(!mode.available)redirect('/seller/products?notice=failed');
  const publish=action==='publish'||(action==='submit'&&mode.selfPublishing);
  if(publish&&form.get('confirmed')!=='yes')redirect('/seller/products?notice=confirmation-required');
  const fn=publish?'publish_own_product':action==='submit'?'submit_product_for_review':action==='withdraw'?'withdraw_product_for_review':'archive_published_product';
  const {error}=await client.rpc(fn,publish?{p_product:id,p_confirmed:true}:{p_product_id:id});
  if(error){console.error('[Tidalis product review transition]',fn,error.code);redirect('/seller/products?notice=failed')}
  revalidatePath('/seller/products');revalidatePath('/shop');revalidatePath('/');
  redirect('/seller/products?notice='+(publish?'published':'updated'));
}
