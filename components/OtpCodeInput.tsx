'use client';

import {useId, useRef, type ClipboardEvent, type KeyboardEvent} from 'react';
import {otpSlots, otpValue} from '@/lib/otp';

/** Controlled six-cell OTP input. Code is never logged or stored in localStorage. */
export function OtpCodeInput({value,onChange,disabled=false,error=false,label='รหัสยืนยัน 6 หลัก'}:{
  value:string;
  onChange:(code:string)=>void;
  disabled?:boolean;
  error?:boolean;
  label?:string;
}){
  const id=useId();
  const fields=useRef<Array<HTMLInputElement|null>>([]);
  const digits=otpSlots(value);
  const go=(position:number)=>fields.current[Math.max(0,Math.min(5,position))]?.focus();
  function fill(raw:string,position:number){
    const clean=raw.replace(/\D/g,'').slice(0,6);
    if(!clean)return;
    const next=Array.from({length:6},(_,i)=>digits[i]||'');
    for(let i=0;i<clean.length&&position+i<6;i++)next[position+i]=clean[i];
    onChange(otpValue(next));
    go(Math.min(position+clean.length,5));
  }
  function keyDown(event:KeyboardEvent<HTMLInputElement>,i:number){
    if(event.key==='Backspace'){
      event.preventDefault();
      const next=Array.from({length:6},(_,index)=>digits[index]||'');
      if(next[i])next[i]='';else if(i>0){next[i-1]='';go(i-1)}
      onChange(otpValue(next));
    }else if(event.key==='Delete'){
      event.preventDefault();const next=Array.from({length:6},(_,index)=>digits[index]||'');next[i]='';onChange(otpValue(next));
    }else if(event.key==='ArrowLeft'){event.preventDefault();go(i-1)}
    else if(event.key==='ArrowRight'){event.preventDefault();go(i+1)}
    else if(event.key==='Home'){event.preventDefault();go(0)}
    else if(event.key==='End'){event.preventDefault();go(5)}
  }
  function paste(event:ClipboardEvent<HTMLInputElement>,i:number){
    event.preventDefault();
    const text=event.clipboardData.getData('text');
    // Complete pasted codes always start at the first cell.
    fill(text,text.replace(/\D/g,'').length>=6?0:i);
  }
  return <div className={'otp-field'+(error?' otp-field-error':'')}>
    <label id={`${id}-label`} className="otp-label">{label}</label>
    <div className="otp-inputs" role="group" aria-labelledby={`${id}-label`}>
      {Array.from({length:6},(_,i)=><input
        key={i}
        ref={element=>{fields.current[i]=element}}
        className={'otp-cell'+(digits[i]?' otp-cell-filled':'')}
        aria-label={`หลักที่ ${i+1} จาก 6`}
        aria-invalid={error}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={i===0?'one-time-code':'off'}
        maxLength={i===0?6:1}
        value={digits[i]||''}
        disabled={disabled}
        onFocus={e=>e.currentTarget.select()}
        onKeyDown={e=>keyDown(e,i)}
        onPaste={e=>paste(e,i)}
        onChange={e=>{
          const input=e.target.value.replace(/\D/g,'');
          if(input.length>1){fill(input,i);return}
          const next=Array.from({length:6},(_,index)=>digits[index]||'');
          next[i]=input;
          onChange(otpValue(next));
          if(input)go(i+1);
        }}/>) }
    </div>
    <span className="otp-instruction">วางรหัสทั้ง 6 หลักพร้อมกันได้ • ใช้ปุ่มลูกศรและ Backspace ได้</span>
  </div>;
}
