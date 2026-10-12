'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function bangkokDatetime(value: FormDataEntryValue | null):string|null {
  if(typeof value!=='string'||!value.trim())return null;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('invalid date');
  const parsed=new Date(value+':00+07:00');
  if(!Number.isFinite(parsed.getTime())||new Date(parsed.getTime()+7*60*60*1000).toISOString().slice(0,16)!==value)throw Error('invalid date');
  return parsed.toISOString();
}

export async function saveAnnouncement(form:FormData) {
  const {client}=await requirePlatformAdmin();
  const rawId=String(form.get('id')||'');
  const id=rawId&&uuid.test(rawId)?rawId:null;
  const title=String(form.get('title')||'').trim();
  const message=String(form.get('message')||'').trim();
  const link=String(form.get('link_url')||'').trim();
  const priority=Number(form.get('priority')||0);
  const ribbon=form.get('show_ribbon')==='on';
  const popup=form.get('show_popup')==='on';
  if((rawId&&!id)||title.length<5||title.length>160||message.length<10||message.length>4000||
      !Number.isInteger(priority)||priority< -100||priority>100||(!ribbon&&!popup)||
      (link&&!((link.startsWith('/')&&!link.startsWith('//')&&!/[\s\\]/.test(link))||
        /^https:\/\/[^\s]+$/.test(link))))
    redirect('/admin/announcements?notice=invalid');
  let start:string|null=null,end:string|null=null;
  try {start=bangkokDatetime(form.get('starts_at'));end=bangkokDatetime(form.get('ends_at'));}
  catch {redirect('/admin/announcements?notice=invalid');}
  if(start&&end&&end<=start)redirect('/admin/announcements?notice=invalid');
  const {error}=await client.rpc('tidalis_save_announcement',{
    p_id:id,p_title:title,p_message:message,p_link_url:link||null,
    p_ribbon:ribbon,p_popup:popup,p_priority:priority,p_starts_at:start,p_ends_at:end
  });
  if(error){console.error('[admin announcement save]',error.code);redirect('/admin/announcements?notice=failed');}
  revalidatePath('/');revalidatePath('/admin/announcements');revalidatePath('/', 'layout');
  redirect('/admin/announcements?notice=saved');
}

export async function changeAnnouncementStatus(form:FormData) {
  const {client}=await requirePlatformAdmin();
  const id=String(form.get('id')||'');
  const action=String(form.get('action')||'');
  if(!uuid.test(id)||!['publish','archive'].includes(action)||form.get('confirmed')!=='yes')
    redirect('/admin/announcements?notice=invalid');
  const {error}=await client.rpc('tidalis_change_announcement_status',{p_id:id,p_action:action});
  if(error){console.error('[admin announcement status]',error.code);redirect('/admin/announcements?notice=failed');}
  revalidatePath('/');revalidatePath('/admin/announcements');revalidatePath('/', 'layout');
  redirect('/admin/announcements?notice=updated');
}
