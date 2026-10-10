'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireSeller} from '@/lib/auth';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function changeSellerProductReview(form:FormData){
  const {client,member}=await requireSeller();
  if(!['owner','manager','artist'].includes(member.role))redirect('/seller/products?notice=read-only');
  const id=String(form.get('id')||'');const action=String(form.get('action')||'');
  if(!uuid.test(id)||!['submit','withdraw','archive'].includes(action))redirect('/seller/products?notice=invalid');
  if(action==='archive'&&!['owner','manager'].includes(member.role))redirect('/seller/products?notice=read-only');
  const {data:product}=await client.from('products').select('id').eq('id',id).eq('shop_id',member.shop_id).maybeSingle();
  if(!product)redirect('/seller/products?notice=invalid');
  const fn=action==='submit'?'submit_product_for_review':action==='withdraw'?'withdraw_product_for_review':'archive_published_product';
  const {error}=await client.rpc(fn,{p_product_id:id});
  if(error){console.error('[Tidalis product review transition]',fn,error.code);redirect('/seller/products?notice=failed')}
  revalidatePath('/seller/products');revalidatePath('/shop');revalidatePath('/');
  redirect('/seller/products?notice=updated');
}
