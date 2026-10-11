import Link from 'next/link';
import {requirePlatformAdmin} from '@/lib/auth';
import {changeAnnouncementStatus,saveAnnouncement} from './actions';
export const dynamic='force-dynamic';

type Announcement={id:string;title:string;message:string;link_url:string|null;show_ribbon:boolean;
 show_popup:boolean;priority:number;starts_at:string|null;ends_at:string|null;status:string;version:number};
const notice:Record<string,string>={
 invalid:'ตรวจข้อมูลประกาศ วันที่ ลิงก์ และการยืนยันอีกครั้ง',
 failed:'บันทึกไม่สำเร็จ โปรดยืนยัน Authenticator และลองบันทึกอีกครั้ง',
 saved:'บันทึกเป็น Draft แล้ว (ยังไม่เผยแพร่)',
 updated:'เปลี่ยนสถานะประกาศสำเร็จ'
};
function localTime(iso:string|null) {
 if(!iso)return '';
 // datetime-local accepts no timezone; display Asia/Bangkok consistently
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',
 day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso)).replace(' ','T');
}
function Editor({item}:{item?:Announcement}) {
 return <form action={saveAnnouncement} className="phase4-action-form">
   {item&&<input type="hidden" name="id" value={item.id}/>}
   <label>หัวข้อ<input name="title" required minLength={5} maxLength={160} defaultValue={item?.title}/></label>
   <label>ข้อความประกาศ<textarea name="message" required minLength={10} maxLength={4000} rows={4} defaultValue={item?.message}/></label>
   <label>ลิงก์ (ไม่บังคับ / รองรับ https:// หรือ path ภายในเว็บ)
    <input name="link_url" maxLength={500} defaultValue={item?.link_url||''} placeholder="/shop"/>
   </label>
   <label>ความสำคัญ (-100 ถึง 100)<input type="number" name="priority" min={-100} max={100} defaultValue={item?.priority||0}/></label>
   <label className="checkbox-label"><input type="checkbox" name="show_ribbon" defaultChecked={item?.show_ribbon??true}/>แสดง Ribbon</label>
   <label className="checkbox-label"><input type="checkbox" name="show_popup" defaultChecked={item?.show_popup??false}/>แสดง Popup หน้าแรก</label>
   <label>เริ่มแสดง (เวลาไทย GMT+7; ว่าง = ทันที)
    <input type="datetime-local" name="starts_at" defaultValue={localTime(item?.starts_at||null)}/></label>
   <label>สิ้นสุด (เวลาไทย GMT+7; ว่าง = ไม่หมดอายุ)
    <input type="datetime-local" name="ends_at" defaultValue={localTime(item?.ends_at||null)}/></label>
   <button className="btn btn-outline" type="submit">{item?'อัปเดต Draft':'สร้าง Draft ใหม่'}</button>
 </form>;
}
export default async function AdminAnnouncements({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const {client}=await requirePlatformAdmin('/admin/announcements');const {notice:code}=await searchParams;
 const {data,error}=await client.from('platform_announcements')
  .select('id,title,message,link_url,show_ribbon,show_popup,priority,starts_at,ends_at,status,version')
  .order('created_at',{ascending:false}).limit(100);
 const items=(data||[]) as Announcement[];
 return <main className="container page-pad policy-manager-page">
  <div className="page-heading"><div className="eyebrow">ADMIN / CONTENT</div><h1>ประกาศ<em>ถึงสมาชิก.</em></h1>
  <p>เขียนข้อความ ตรวจตัวอย่าง และเลือกเวลาแสดงบนแถบประกาศหรือหน้าต่างต้อนรับ</p></div>
  <Link href="/admin" className="text-link">← Admin Console</Link>
  {code&&notice[code]&&<div className="phase4-alert" role="status">{notice[code]}</div>}
  {error&&<p role="alert">โหลดประกาศไม่ได้: {error.code} (ตรวจ Migration 010)</p>}
  <section className="phase4-card"><h2>สร้างประกาศ</h2><Editor/></section>
  <section className="section"><h2>ประวัติประกาศ · สูงสุด 100 รายการ</h2>
  <div className="policy-version-list">{items.map(item=><article className="phase4-card" key={item.id}>
   <h3>{item.title} <span className="status-chip">{({draft:'ฉบับร่าง',published:'เผยแพร่แล้ว',archived:'ปิดแล้ว'} as Record<string,string>)[item.status]||item.status}</span></h3>
   <p style={{whiteSpace:'pre-wrap'}}>{item.message}</p>
   <p className="phase4-small">v{item.version} · {item.show_ribbon?'Ribbon ':''}{item.show_popup?'Popup ':''}
   · เริ่ม {item.starts_at?new Date(item.starts_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ทันที'}
   · จบ {item.ends_at?new Date(item.ends_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ไม่กำหนด'}</p>
   {item.status==='draft'&&<details><summary>แก้ไขร่าง</summary><Editor item={item}/></details>}
   {item.status!=='archived'&&<form className="phase4-action-form" action={changeAnnouncementStatus}>
    <input type="hidden" name="id" value={item.id}/>
    <label className="checkbox-label"><input type="checkbox" required name="confirmed" value="yes"/>ฉันตรวจข้อความ/เวลาและยืนยันการดำเนินการ</label>
    {item.status==='draft'&&<button className="btn btn-primary" name="action" value="publish" type="submit">เผยแพร่ / ตั้งเวลา</button>}
    <button className="btn btn-outline" name="action" value="archive" type="submit">ปิดประกาศ</button>
   </form>}
  </article>)}</div>
  {!items.length&&!error&&<div className="empty-state">ยังไม่มีประกาศ</div>}
  </section></main>;
}
