import {createHmac} from 'node:crypto';
export function totp(secret,now=Date.now()){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
 for(const c of secret.toUpperCase().replace(/=/g,'')){const digit=alphabet.indexOf(c);if(digit<0)throw Error('Invalid local test TOTP secret');bits+=digit.toString(2).padStart(5,'0');}
 const key=Buffer.from(bits.match(/.{8}/g)?.map(b=>parseInt(b,2))||[]),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
 const digest=createHmac('sha1',key).update(counter).digest(),offset=digest[19]&15;
 return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
