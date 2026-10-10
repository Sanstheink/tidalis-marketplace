'use client';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
export type PublishedAnnouncement={id:string;title:string;message:string;link_url:string|null;
 show_ribbon:boolean;show_popup:boolean;priority:number};
export default function PlatformAnnouncements({items}:{items:PublishedAnnouncement[]}){
 const pathname=usePathname();
 const [dismissed,setDismissed]=useState<string[]>([]);
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  try {setDismissed(items.filter(a=>sessionStorage.getItem('tidalis:announcement:'+a.id)==='closed').map(a=>a.id));}
  catch {/* storage blocked */} setReady(true);
 },[items]);
 const safeUrl=(url:string|null)=>!!url&&((url.startsWith('/')&&!url.startsWith('//')&&!/[\\\s]/.test(url))||/^https:\/\/[^\s]+$/.test(url));
 const live=items.filter(a=>!dismissed.includes(a.id));
 const ribbon=live.find(a=>a.show_ribbon);
 const popup=ready&&pathname==='/'?live.find(a=>a.show_popup):null;
 function dismiss(id:string){
  setDismissed(old=>old.includes(id)?old:[...old,id]);
  try {sessionStorage.setItem('tidalis:announcement:'+id,'closed');}catch{/* noop */}
 }
 return <>
  {ribbon&&<aside role="status" style={{background:'#251a37',color:'#fff',padding:'10px 20px',
    display:'flex',alignItems:'center',justifyContent:'center',gap:16,flexWrap:'wrap'}}>
    <span><strong>{ribbon.title}</strong> — {ribbon.message}</span>
    {safeUrl(ribbon.link_url)&&<a href={ribbon.link_url||undefined} style={{color:'#e2cfff',textDecoration:'underline'}}>รายละเอียด ↗</a>}
    <button type="button" aria-label="ปิดประกาศ" onClick={()=>dismiss(ribbon.id)}
      style={{background:'none',border:0,color:'#fff',cursor:'pointer',fontSize:20}}>×</button>
   </aside>}
  {popup&&<div role="presentation" style={{position:'fixed',inset:0,zIndex:1000,
    background:'rgba(0,0,0,.66)',display:'grid',placeItems:'center',padding:16}}>
    <section role="dialog" aria-modal="true" aria-labelledby={'announcement-'+popup.id}
      style={{width:'min(560px,100%)',background:'#22172f',color:'#fff',padding:26,borderRadius:18,
      border:'1px solid #765a95',boxShadow:'0 15px 80px #0009'}}>
      <div className="eyebrow">TIDALIS / ANNOUNCEMENT</div>
      <h2 id={'announcement-'+popup.id}>{popup.title}</h2>
      <p style={{whiteSpace:'pre-wrap',lineHeight:1.6}}>{popup.message}</p>
      <div style={{display:'flex',gap:12,marginTop:20}}>
       {safeUrl(popup.link_url)&&<a className="btn btn-outline" href={popup.link_url||undefined}>รายละเอียด ↗</a>}
       <button type="button" className="btn btn-primary" autoFocus onClick={()=>dismiss(popup.id)}>ปิดประกาศ</button>
      </div>
    </section>
   </div>}
 </>;
}
