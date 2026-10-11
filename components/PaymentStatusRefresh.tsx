'use client';
import {useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {RefreshCw} from 'lucide-react';

export default function PaymentStatusRefresh(){
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  return <button type="button" className="btn btn-outline wide" disabled={pending}
    onClick={()=>startTransition(()=>router.refresh())}>
    <RefreshCw size={16}/>{pending?'กำลังตรวจสถานะ…':'ตรวจสถานะการรับเงินอีกครั้ง'}
  </button>;
}
