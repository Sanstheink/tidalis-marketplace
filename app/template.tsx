import PlatformAnnouncements, {type PublishedAnnouncement} from '@/components/PlatformAnnouncements';
import {supabaseServer} from '@/lib/supabase/server';
export default async function SiteTemplate({children}:{children:React.ReactNode}){
 const client=await supabaseServer();
 let items:PublishedAnnouncement[]=[];
 if(client){
   const {data,error}=await client.from('platform_announcements')
    .select('id,title,message,link_url,show_ribbon,show_popup,priority,starts_at,ends_at')
    .eq('status','published').order('priority',{ascending:false}).limit(50);
   if(!error){
    const now=Date.now();
    items=(data||[]).filter(a=>
     (!a.starts_at||new Date(a.starts_at).getTime()<=now)&&
     (!a.ends_at||new Date(a.ends_at).getTime()>now))
    .map(a=>({id:a.id,title:a.title,message:a.message,link_url:a.link_url,
      show_ribbon:a.show_ribbon,show_popup:a.show_popup,priority:a.priority}));
   }
 }
 return <><PlatformAnnouncements items={items}/>{children}</>;
}
