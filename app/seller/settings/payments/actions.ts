'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {randomUUID} from 'node:crypto';
import {requireSeller,requireMfa,requirePlatformAdmin} from '@/lib/auth';

export async function saveRecipient(form:FormData){
 const platform=form.get('scope')==='platform';let client,shopId:string|null=null;
 if(platform){({client}=await requirePlatformAdmin('/admin/settings/payments'));}else{const seller=await requireSeller();client=seller.client;shopId=seller.member.shop_id;await requireMfa(client,'/seller/settings/payments');}
 const back=platform?'/admin/settings/payments':'/seller/settings/payments';
 if(form.get('confirmed')!=='yes')redirect(`${back}?notice=confirm_required`);
 const {error}=await client.rpc('save_payment_profile',{p_shop_id:shopId,p_name:String(form.get('name')||'').trim(),p_bank:String(form.get('bank')||'').trim(),p_account:String(form.get('account')||'').replace(/\s/g,''),p_promptpay:String(form.get('promptpay')||'').replace(/[-\s]/g,''),p_bank_enabled:form.get('bankEnabled')==='on',p_promptpay_enabled:form.get('promptpayEnabled')==='on',p_address:String(form.get('address')||'').trim(),p_currency:String(form.get('currency')||'THB')});
 if(error)redirect(`${back}?notice=${encodeURIComponent(error.message)}`);revalidatePath(back);revalidatePath('/seller/readiness');redirect(`${back}?notice=saved`);
}
export async function saveRecipientQR(form:FormData){
 const platform=form.get('scope')==='platform';let client,shopId:string|null=null;
 if(platform){({client}=await requirePlatformAdmin('/admin/settings/payments'));}else{const seller=await requireSeller();client=seller.client;shopId=seller.member.shop_id;await requireMfa(client,'/seller/settings/payments');}
 const back=platform?'/admin/settings/payments':'/seller/settings/payments';let query=client.from('payment_profiles').select('id');query=shopId?query.eq('shop_id',shopId):query.is('shop_id',null);const {data:profile}=await query.maybeSingle();
 const file=form.get('qr');if(!profile||!(file instanceof File)||file.size<12||file.size>3145728||form.get('confirmed')!=='yes')redirect(`${back}?notice=invalid_qr`);
 const bytes=Buffer.from(await file.arrayBuffer());let extension='',mime='';
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){extension='png';mime='image/png';}
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){extension='jpg';mime='image/jpeg';}
 else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){extension='webp';mime='image/webp';}
 else redirect(`${back}?notice=invalid_qr`);
 const path=`profiles/${profile.id}/${randomUUID()}.${extension}`;
 const {error:upload}=await client.storage.from('tidalis-payment-qr').upload(path,bytes,{contentType:mime,upsert:false});
 if(upload)redirect(`${back}?notice=qr_upload_failed`);
 const {error}=await client.rpc('save_payment_qr',{p_profile_id:profile.id,p_path:path,p_currency:String(form.get('currency')||'')});if(error){await client.storage.from('tidalis-payment-qr').remove([path]);redirect(`${back}?notice=${encodeURIComponent(error.message)}`);}
 revalidatePath(back);redirect(`${back}?notice=qr_saved`);
}
export async function removeRecipientQR(form:FormData){
 const platform=form.get('scope')==='platform';let client,shopId:string|null=null;
 const back=platform?'/admin/settings/payments':'/seller/settings/payments';
 if(platform){({client}=await requirePlatformAdmin(back));}else{const seller=await requireSeller();client=seller.client;shopId=seller.member.shop_id;await requireMfa(client,back);}
 if(form.get('confirmed')!=='yes')redirect(`${back}?notice=confirm_required`);
 let query=client.from('payment_profiles').select('id');query=shopId?query.eq('shop_id',shopId):query.is('shop_id',null);const {data:profile}=await query.maybeSingle();
 if(!profile)redirect(`${back}?notice=invalid_qr`);
 const {error}=await client.rpc('save_payment_qr',{p_profile_id:profile.id,p_path:null,p_currency:String(form.get('currency')||'')});
 if(error)redirect(`${back}?notice=${encodeURIComponent(error.message)}`);revalidatePath(back);redirect(`${back}?notice=qr_removed`);
}
