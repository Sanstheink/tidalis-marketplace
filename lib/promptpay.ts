function field(id:string,value:string){return id+String(value.length).padStart(2,'0')+value;}
export function promptPayPayload(recipient:string,amountMinor:number|string|bigint){
 if(!/^(0[0-9]{9}|[0-9]{13})$/.test(recipient))throw Error('invalid_recipient');
 const amount=BigInt(amountMinor);if(amount<=0n||amount>999999999999n)throw Error('invalid_amount');
 const account=recipient.length===10?field('01','0066'+recipient.slice(1)):field('02',recipient);
 const merchant=field('00','A000000677010111')+account;
 const text=field('00','01')+field('01','12')+field('29',merchant)+field('53','764')+field('54',`${amount/100n}.${(amount%100n).toString().padStart(2,'0')}`)+field('58','TH')+'6304';
 let crc=0xffff;for(const byte of new TextEncoder().encode(text)){crc^=byte<<8;for(let i=0;i<8;i++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;crc&=0xffff;}
 return text+crc.toString(16).toUpperCase().padStart(4,'0');
}
