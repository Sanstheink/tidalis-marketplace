'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Plus} from 'lucide-react';
import {supabaseBrowser} from '@/lib/supabase/browser';
export function WorkTypesForm({shopId}:{shopId:string}){const [name,setName]=useState('');const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);const router=useRouter();async function add(e:React.FormEvent){e.preventDefault();const client=supabaseBrowser();if(!client)return;setBusy(true);setStatus('');const {error}=await client.from('shop_work_types').insert({shop_id:shopId,name:name.trim()});setBusy(false);if(error){setStatus(error.message);return}setName('');router.refresh()}return <form className="panel" onSubmit={add}><h2><Plus size={17}/> เพิ่มประเภทงานของร้าน</h2><p>เช่น Full Body, Chibi, Emote, VTuber Model, Background — ผู้ขายเป็นผู้กำหนด</p><div className="button-row"><input style={{flex:1}} minLength={2} maxLength={80} required value={name} onChange={e=>setName(e.target.value)} placeholder="ชื่อประเภทงาน"/><button className="btn btn-primary" disabled={busy||!name.trim()}>{busy?'กำลังบันทึก':'เพิ่มประเภทงาน'}</button></div>{status&&<p>{status}</p>}</form>}
