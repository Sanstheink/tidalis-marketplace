'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function reviewShopPolicy(formData:FormData){
  const {client}=await requirePlatformAdmin();
  const id=formData.get('id'),decision=formData.get('decision'),note=formData.get('review_note');
  const reviewed=formData.get('reviewed')==='yes';
  if(typeof id!=='string'||!uuid.test(id)||typeof decision!=='string'||
    !['approved','changes_requested','rejected'].includes(decision)||
    typeof note!=='string'||note.trim().length>1500||
    (decision!=='approved'&&note.trim().length<12)||
    (decision==='approved'&&!reviewed))
    redirect('/admin/shop-policies?result=invalid');
  const {error}=await client.rpc('review_shop_policy',{
    p_policy_version_id:id,p_decision:decision,p_review_note:note.trim(),p_reviewed_and_authorized:reviewed,
  });
  if(error){console.error('Policy review failed',error.code);redirect('/admin/shop-policies?result=review-failed');}
  revalidatePath('/admin/shop-policies');revalidatePath('/seller/policies');
  revalidatePath('/artists');
  redirect('/admin/shop-policies?result=reviewed');
}
