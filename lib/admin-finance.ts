export const baht=(minor:number|string|bigint|null|undefined)=>{
 const value=BigInt(minor??0);const negative=value<BigInt(0);const abs=negative?-value:value;
 const baht=abs/BigInt(100);const satang=(abs%BigInt(100)).toString().padStart(2,'0');
 return (negative?'-':'')+baht.toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+satang+' ฿';
};
export const dateThai=(value:string|null|undefined)=>
 value?new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'—';
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
