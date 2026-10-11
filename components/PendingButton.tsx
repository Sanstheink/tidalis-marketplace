'use client';
import {useFormStatus} from 'react-dom';
export function PendingButton({children,disabled=false,className='btn btn-primary'}:{children:React.ReactNode;disabled?:boolean;className?:string}){const {pending}=useFormStatus();return <button type="submit" className={className} disabled={disabled||pending}>{pending?'กำลังดำเนินการ…':children}</button>;}
