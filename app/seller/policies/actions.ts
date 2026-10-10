'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireSeller} from '@/lib/auth';

const types=['refund','delivery','license','other'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveShopPolicy(formData:FormData){
  const {client,member}=await requireSeller();
  if(!['owner','manager'].includes(member.role))redirect('/seller/policies?result=role-denied');
  const type=formData.get('policy_type');
  const content=formData.get('content');
  const draftId=formData.get('draft_id');
  if(typeof type!=='string'||!types.includes(type)||typeof content!=='string'||
    content.trim().length<200||content.trim().length>30000||
    (typeof draftId==='string'&&draftId!==''&&!uuid.test(draftId)))
    redirect('/seller/policies?result=invalid');
  const {error}=await client.rpc('save_shop_policy_draft',{
    p_shop_id:member.shop_id,p_policy_type:type,p_content:content.trim(),
    p_draft_id:typeof draftId==='string'&&draftId?draftId:null,
  });
  if(error){console.error('Save shop policy failed',error.code);redirect('/seller/policies?result=save-failed');}
  revalidatePath('/seller/policies');
  redirect('/seller/policies?result=saved');
}

export async function submitShopPolicy(formData:FormData){
  const {client,member}=await requireSeller();
  if(!['owner','manager'].includes(member.role))redirect('/seller/policies?result=role-denied');
  const id=formData.get('id');
  if(typeof id!=='string'||!uuid.test(id))redirect('/seller/policies?result=invalid');
  const {error}=await client.rpc('submit_shop_policy_draft',{p_policy_version_id:id});
  if(error){console.error('Submit shop policy failed',error.code);redirect('/seller/policies?result=submit-failed');}
  revalidatePath('/seller/policies');revalidatePath('/admin/shop-policies');
  redirect('/seller/policies?result=submitted');
}
