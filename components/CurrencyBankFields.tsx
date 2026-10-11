'use client';
import {useState} from 'react';
import type {PaymentProfile} from '@/lib/payment-utils';
export default function CurrencyBankFields({profile}:{profile:PaymentProfile|null}){
 const [currency,setCurrency]=useState(profile?.bank_currency||'THB'),current=profile?.bank_accounts?.[currency];
 function change(value:string){setCurrency(value);}
 return <div key={currency} className="operations-form"><div className="form-columns"><label>สกุลเงินบัญชี<select name="currency" value={currency} onChange={e=>change(e.target.value)}><option value="THB">THB · บาทไทย</option><option value="LAK">LAK · กีบลาว</option><option value="USD">USD · ดอลลาร์สหรัฐ</option></select></label><label>ธนาคาร<input name="bank" maxLength={120} defaultValue={current?.bank||''}/></label></div><label>เลขบัญชี<input name="account" maxLength={40} defaultValue={current?.account||''} autoComplete="off" placeholder="เลขบัญชีในสกุลเงินที่เลือก"/></label><label className="operations-check"><input name="bankEnabled" type="checkbox" defaultChecked={current?.enabled||false}/> เปิดโอนตรงผ่านเลขบัญชีนี้</label><small>บันทึกบัญชีแยกได้สำหรับ THB, LAK และ USD โดยไม่ลบบัญชีสกุลเงินอื่น</small></div>;
}
