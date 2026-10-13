'use client';
import {useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {RefreshCw} from 'lucide-react';
export default function PaymentStatusRefresh({label='ตรวจสถานะการรับเงินอีกครั้ง'}:{label?:string}={}){
 const router=useRouter();const [pending,startTransition]=useTransition();
 return <button type="button" className="btn btn-outline wide" disabled={pending} onClick={()=>startTransition(()=>router.refresh())}><RefreshCw size={16}/>{pending?'กำลังตรวจสถานะ…':label}</button>;
}
