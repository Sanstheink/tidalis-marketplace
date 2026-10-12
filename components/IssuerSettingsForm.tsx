'use client';
import Link from 'next/link';
import {useActionState,useState,useEffect,useRef,type FormEvent} from 'react';
import {saveIssuer} from '@/app/admin/settings/payments/actions';
import {emptyPaymentSettings,validateIssuer} from '@/lib/payment-settings-validation';
import PaymentFormErrors from './PaymentFormErrors';
import {PendingButton} from './PendingButton';
export default function IssuerSettingsForm({issuer}:{issuer:{legal_name:string;registered_address:string;tax_id:string|null}|null}){
 const [state,action]=useActionState(saveIssuer,emptyPaymentSettings),[errors,setErrors]=useState<Record<string,string>>({});
 const [name,setName]=useState(issuer?.legal_name||''),[address,setAddress]=useState(issuer?.registered_address||''),[taxId,setTaxId]=useState(issuer?.tax_id||''),[confirmed,setConfirmed]=useState(false);
 const formRef=useRef<HTMLFormElement>(null),errorId='platform-issuer-errors';
 useEffect(()=>{setErrors(state.errors);},[state]);
 useEffect(()=>{if(Object.keys(errors).length)formRef.current?.querySelector<HTMLElement>('[role=alert]')?.focus();},[errors]);
 function submit(event:FormEvent<HTMLFormElement>){const validation=validateIssuer(new FormData(event.currentTarget));setErrors(validation.errors);if(Object.keys(validation.errors).length)event.preventDefault();}
 return <form ref={formRef} className="commerce-card operations-form" action={action} onSubmit={submit} noValidate><div className="eyebrow">RECEIPT ISSUER</div><h2>ผู้ออกใบเสร็จรับเงิน</h2><p>ระบุชื่อบุคคลหรือคณะบุคคลผู้รับค่าบริการจริง ใช้สำหรับใบเสร็จรับเงินทั่วไป</p>
 <label>ชื่อผู้ออกเอกสาร<input name="name" required minLength={3} maxLength={160} value={name} onChange={e=>setName(e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name?errorId:undefined}/></label>
 <label>ที่อยู่จริง<textarea name="address" required minLength={15} maxLength={1000} rows={3} value={address} onChange={e=>setAddress(e.target.value)} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address?errorId:undefined}/></label>
 <label>เลขประจำตัวผู้เสียภาษี (ถ้ามี)<input name="taxId" inputMode="numeric" maxLength={25} value={taxId} onChange={e=>setTaxId(e.target.value)} aria-invalid={Boolean(errors.taxId)} aria-describedby={errors.taxId?errorId:'issuer-tax-hint'}/></label><small id="issuer-tax-hint">ถ้ายังไม่มีให้เว้นว่าง ออกใบเสร็จรับเงินทั่วไปได้ เมื่อกรอกให้ใช้เลข 13 หลัก ใส่ขีดหรือเว้นวรรคได้</small>
 <label className="operations-check"><input type="checkbox" name="confirmed" value="yes" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} aria-invalid={Boolean(errors.confirmed)} aria-describedby={errors.confirmed?errorId:undefined}/> ฉันตรวจข้อมูลผู้ออกเอกสารแล้ว</label>
 <PaymentFormErrors id={errorId} errors={errors}/><PendingButton>บันทึกผู้ออกใบเสร็จ</PendingButton><Link className="text-link" href="/admin/finance/documents">ออกใบเสร็จจากเงินที่รับแล้ว →</Link></form>;
}
