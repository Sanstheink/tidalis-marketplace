'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';

export async function createSellerAgreementDraft(formData:FormData){
  const {client}=await requirePlatformAdmin();
  const title=formData.get('title');const content=formData.get('content');
  if(typeof title!=='string'||typeof content!=='string'||title.trim().length<8||content.trim().length<500)
    redirect('/admin/policies?result=invalid');
  const {error}=await client.rpc('create_seller_agreement_draft',{
    p_title:title.trim(),p_content:content.trim()});
  if(error)redirect('/admin/policies?result=draft-failed');
  revalidatePath('/admin/policies');redirect('/admin/policies?result=draft-created');
}
export async function publishSellerAgreement(formData:FormData){
  const {client}=await requirePlatformAdmin();
  const id=formData.get('id');
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||formData.get('reviewed')!=='yes')
    redirect('/admin/policies?result=not-confirmed');
  const {error}=await client.rpc('publish_seller_agreement',{
    p_policy_version_id:id,p_reviewed_and_authorized:true});
  if(error)redirect('/admin/policies?result=publish-failed');
  revalidatePath('/admin/policies');revalidatePath('/policies/seller-agreement');revalidatePath('/sell/apply');
  redirect('/admin/policies?result=published');
}

// General policies only. Seller Agreement continues to use its Phase 4 RPCs.
export async function createGeneralPlatformPolicyDraft(formData:FormData){
  const {client}=await requirePlatformAdmin();
  const type=formData.get('policy_type'),title=formData.get('title'),content=formData.get('content');
  const allowed=['terms','privacy','cookies','buyer-protection','payment-refund','copyright','community','standard-license','standard-assignment'];
  if(typeof type!=='string'||!allowed.includes(type)||typeof title!=='string'||typeof content!=='string'||
     title.trim().length<8||title.trim().length>160||content.trim().length<500||content.trim().length>30000)
    redirect('/admin/policies?result=invalid');
  const {error}=await client.rpc('create_platform_policy_draft',{p_policy_type:type,p_title:title.trim(),p_content:content.trim()});
  if(error){console.error('Platform policy draft failed',error.code);redirect('/admin/policies?result=draft-failed');}
  revalidatePath('/admin/policies');
  redirect('/admin/policies?result=draft-created');
}
export async function publishGeneralPlatformPolicy(formData:FormData){
  const {client}=await requirePlatformAdmin();
  const id=formData.get('id');
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||formData.get('reviewed')!=='yes')
    redirect('/admin/policies?result=not-confirmed');
  const {error}=await client.rpc('publish_platform_policy',{p_policy_version_id:id,p_reviewed_and_authorized:true});
  if(error){console.error('Platform policy publish failed',error.code);redirect('/admin/policies?result=publish-failed');}
  revalidatePath('/admin/policies');revalidatePath('/policies');
  redirect('/admin/policies?result=published');
}

export async function editGeneralPlatformPolicyDraft(formData:FormData){
  const {client}=await requirePlatformAdmin();
  const id=formData.get('id'),title=formData.get('title'),content=formData.get('content');
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||typeof title!=='string'||typeof content!=='string'||
    title.trim().length<8||title.trim().length>160||content.trim().length<500||content.trim().length>30000)
    redirect('/admin/policies?result=invalid');
  const {error}=await client.rpc('update_platform_policy_draft',{
    p_policy_version_id:id,p_title:title.trim(),p_content:content.trim(),
  });
  if(error){console.error('Edit platform draft failed',error.code);redirect('/admin/policies?result=draft-failed');}
  revalidatePath('/admin/policies');redirect('/admin/policies?result=draft-updated');
}
