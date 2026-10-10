'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireSeller,requireMfa} from '@/lib/auth';

export async function submitShopReadiness(form:FormData){
  const {client,member}=await requireSeller();
  await requireMfa(client,'/seller/readiness');
  if(!['owner','manager'].includes(member.role)) redirect('/seller/readiness?notice=forbidden');
  if(form.get('confirm')!=='on')redirect('/seller/readiness?notice=failed');
  const note=String(form.get('note')||'').trim().slice(0,1501);
  const {error}=await client.rpc('submit_shop_readiness',{p_shop_id:member.shop_id,p_seller_note:note});
  if(error){console.error('[Tidalis readiness submit]',error.code);redirect('/seller/readiness?notice=failed')}
  revalidatePath('/seller/readiness');
  revalidatePath('/admin/shop-readiness');
  redirect('/seller/readiness?notice=submitted');
}

export async function pauseOwnShopVisibility(form:FormData){
  const {client,member}=await requireSeller();
  await requireMfa(client,'/seller/readiness');
  if(!['owner','manager'].includes(member.role)||form.get('confirm')!=='yes')
    redirect('/seller/readiness?notice=forbidden');
  const reason=String(form.get('reason')||'').trim();
  if(reason.length<12||reason.length>1500)redirect('/seller/readiness?notice=failed');
  const {error}=await client.rpc('pause_shop_visibility',{p_shop_id:member.shop_id,p_reason:reason});
  if(error){console.error('[Tidalis shop pause]',error.code);redirect('/seller/readiness?notice=failed')}
  revalidatePath('/seller/readiness');revalidatePath('/artists');revalidatePath('/shop');revalidatePath('/');
  redirect('/seller/readiness?notice=paused');
}
