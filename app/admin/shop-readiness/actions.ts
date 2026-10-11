'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requirePlatformAdmin} from '@/lib/auth';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function reviewShopReadiness(form:FormData){
  const {client}=await requirePlatformAdmin();
  const id=String(form.get('id')||'');const decision=String(form.get('decision')||'');
  const note=String(form.get('note')||'').trim();const confirm=form.get('confirmed')==='yes';
  if(!uuid.test(id)||!['approved','needs_information','rejected'].includes(decision)||note.length>1500||
    (decision==='approved'&&!confirm)||(decision!=='approved'&&note.length<12)) redirect('/admin/shop-readiness?notice=invalid');
  const {error}=await client.rpc('review_shop_readiness',{p_request_id:id,p_decision:decision,p_note:note,p_confirmed:confirm});
  if(error){console.error('[Tidalis shop readiness review]',error.code);redirect('/admin/shop-readiness?notice=failed')}
  revalidatePath('/admin/shop-readiness');revalidatePath('/artists');revalidatePath('/');
  redirect('/admin/shop-readiness?notice=reviewed');
}

export async function adminPauseShopVisibility(form:FormData){
  const {client}=await requirePlatformAdmin();
  const id=String(form.get('shop_id')||'');const reason=String(form.get('reason')||'').trim();
  if(!uuid.test(id)||reason.length<12||reason.length>1500||form.get('confirm')!=='yes')
    redirect('/admin/shop-readiness?notice=invalid');
  const {error}=await client.rpc('pause_shop_visibility',{p_shop_id:id,p_reason:reason});
  if(error){console.error('[Tidalis admin shop pause]',error.code);redirect('/admin/shop-readiness?notice=failed')}
  revalidatePath('/admin/shop-readiness');revalidatePath('/artists');revalidatePath('/shop');revalidatePath('/');
  redirect('/admin/shop-readiness?notice=paused');
}
