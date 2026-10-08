'use server';
import {revalidatePath} from 'next/cache';
import {requirePlatformAdmin} from '@/lib/auth';
export async function approveApplication(formData:FormData){const id=formData.get('applicationId');if(typeof id!=='string'||! /^[0-9a-f-]{36}$/i.test(id))return;const {client}=await requirePlatformAdmin();const {error}=await client.rpc('approve_seller_application',{p_application_id:id});if(error)throw Error('ไม่สามารถอนุมัติร้าน: '+error.message);revalidatePath('/admin/seller-applications');revalidatePath('/admin')}
