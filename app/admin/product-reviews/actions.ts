'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function reviewProductPublication(form:FormData){
  const {client}=await requirePlatformAdmin();
  const id=String(form.get('id')||'');const decision=String(form.get('decision')||'');
  const note=String(form.get('note')||'').trim();const confirmed=form.get('confirmed')==='yes';
  if(!uuid.test(id)||!['approved','changes_requested','rejected'].includes(decision)||note.length>1500||
    (decision==='approved'&&!confirmed)||(decision!=='approved'&&note.length<12)) redirect('/admin/product-reviews?notice=invalid');
  const {error}=await client.rpc('review_product_publication',{p_product_id:id,p_decision:decision,p_note:note,p_confirmed:confirmed});
  if(error){console.error('[Tidalis product admin review]',error.code);redirect('/admin/product-reviews?notice=failed')}
  revalidatePath('/admin/product-reviews');revalidatePath('/seller/products');revalidatePath('/shop');revalidatePath('/');
  redirect('/admin/product-reviews?notice=reviewed');
}
