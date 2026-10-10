'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';

function readId(value:FormDataEntryValue|null){
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))return null;
  return value;
}
export async function approveApplication(formData:FormData){
  const {client}=await requirePlatformAdmin();
  const id=readId(formData.get('applicationId'));
  if(!id||formData.get('confirm')!=='yes') redirect('/admin/seller-applications?review=confirmation-required');
  const {error}=await client.rpc('approve_seller_application',{p_application_id:id});
  if(error)redirect('/admin/seller-applications?review=approval-failed');
  revalidatePath('/admin/seller-applications');revalidatePath('/admin');
  redirect('/admin/seller-applications?review=approved');
}
export async function reviewApplication(formData:FormData){
  const {client}=await requirePlatformAdmin();
  const id=readId(formData.get('applicationId'));
  const decision=formData.get('decision');
  const reason=formData.get('reason');
  if(!id||!['rejected','needs_information'].includes(String(decision))||typeof reason!=='string'||reason.trim().length<12||reason.length>1500)
    redirect('/admin/seller-applications?review=invalid-reason');
  const {error}=await client.rpc('review_seller_application',{
    p_application_id:id,p_decision:decision as string,p_review_note:reason.trim()
  });
  if(error)redirect('/admin/seller-applications?review=review-failed');
  revalidatePath('/admin/seller-applications');
  redirect('/admin/seller-applications?review=updated');
}
