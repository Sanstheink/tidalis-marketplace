'use client';
import Link from 'next/link';
import {useActionState,useState,useEffect,useRef,type FormEvent} from 'react';
import {Landmark} from 'lucide-react';
import {saveRecipient} from '@/app/seller/settings/payments/actions';
import {emptyPaymentSettings,validateRecipient} from '@/lib/payment-settings-validation';
import type {PaymentProfile} from '@/lib/payment-utils';
import CurrencyBankFields from './CurrencyBankFields';
import PaymentFormErrors from './PaymentFormErrors';
import {PendingButton} from './PendingButton';
export default function RecipientSettingsForm({profile,scope,name}:{profile:PaymentProfile|null;scope:'shop'|'platform';name:string}){
 const [state,action]=useActionState(saveRecipient,emptyPaymentSettings);
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [recipient,setRecipient]=useState(profile?.recipient_name||''),[address,setAddress]=useState(profile?.billing_address||''),[promptpay,setPromptpay]=useState(profile?.promptpay_id||''),[promptpayEnabled,setPromptpayEnabled]=useState(profile?.promptpay_enabled||false),[confirmed,setConfirmed]=useState(false);
 const formRef=useRef<HTMLFormElement>(null),errorId=`${scope}-recipient-errors`;
 useEffect(()=>{setErrors(state.errors);},[state]);
 useEffect(()=>{if(Object.keys(errors).length)formRef.current?.querySelector<HTMLElement>('[role=alert]')?.focus();},[errors]);
 function submit(event:FormEvent<HTMLFormElement>){const validation=validateRecipient(new FormData(event.currentTarget));setErrors(validation.errors);if(Object.keys(validation.errors).length)event.preventDefault();}
 return <form ref={formRef} className="commerce-card operations-form" action={action} onSubmit={submit} noValidate><input type="hidden" name="scope" value={scope}/><div className="eyebrow">DIRECT PAYMENTS</div><h2><Landmark size={21}/> บัญชีผู้รับเงิน</h2><p>{name} รับเงินผ่านบัญชีที่ระบุด้านล่าง ใช้ชื่อผู้รับและที่อยู่จริงสำหรับเอกสาร</p>
 <label>ชื่อผู้รับเงิน / ชื่อบัญชี<input name="name" required minLength={3} maxLength={160} value={recipient} onChange={e=>setRecipient(e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name?errorId:undefined} placeholder="ชื่อผู้รับเงินจริง"/></label>
 <label>ที่อยู่สำหรับออกเอกสาร<textarea name="address" required minLength={15} maxLength={1000} rows={3} value={address} onChange={e=>setAddress(e.target.value)} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address?errorId:undefined} placeholder="บ้านเลขที่ ถนน แขวง/ตำบล จังหวัด ประเทศ รหัสไปรษณีย์"/></label>
 <CurrencyBankFields profile={profile} errors={errors} errorId={errorId}/>
 <div className="saved-bank-accounts">{Object.entries(profile?.bank_accounts||{}).map(([currency,bank])=><Link key={currency} href={`${scope==='shop'?'/seller/settings/payments':'/admin/settings/payments'}?currency=${currency}`}><strong>{currency}</strong> · {bank.bank||'QR ธนาคาร'} · {bank.enabled?'เปิดเลขบัญชี':'ปิดเลขบัญชี'}{bank.qrPath?' · มี QR':''}</Link>)}</div>
 <label>เลขพร้อมเพย์<input name="promptpay" inputMode="numeric" maxLength={25} value={promptpay} onChange={e=>setPromptpay(e.target.value)} required={promptpayEnabled} aria-invalid={Boolean(errors.promptpay)} aria-describedby={errors.promptpay?errorId:undefined} placeholder="โทรศัพท์ 10 หลัก หรือเลขประจำตัว 13 หลัก"/></label><label className="operations-check"><input name="promptpayEnabled" type="checkbox" checked={promptpayEnabled} onChange={e=>setPromptpayEnabled(e.target.checked)}/> เปิดพร้อมเพย์สำหรับยอด THB</label>
 <label className="operations-check"><input name="confirmed" type="checkbox" value="yes" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} aria-invalid={Boolean(errors.confirmed)} aria-describedby={errors.confirmed?errorId:undefined}/> ฉันตรวจแล้วว่าบัญชีนี้เป็นของผู้รับเงิน และชื่อผู้รับตรงกับข้อมูลธนาคาร</label>
 <PaymentFormErrors id={errorId} errors={errors}/><PendingButton>บันทึกผู้รับเงิน</PendingButton></form>;
}
