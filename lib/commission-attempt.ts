import {uuidPattern} from '@/lib/marketplace-cart-utils';

type AttemptStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type CommissionAttempt={key:string;storageKey:string};
/** Retain only a payload hash and UUID, never the buyer's brief. */
export async function commissionAttempt(userId:string,productId:string,payload:unknown,storage:AttemptStorage):Promise<CommissionAttempt>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
 const fingerprint=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 const storageKey=`tidalis:commission-attempt:v1:${userId}:${productId}`;
 // Fail before contacting the server if persistence is unavailable: a lost
 // response must never be retried with a silently generated new identity.
 const previous=JSON.parse(storage.getItem(storageKey)||'null') as {fingerprint?:string;key?:string}|null;
 if(previous?.fingerprint===fingerprint&&typeof previous.key==='string'&&uuidPattern.test(previous.key))return {key:previous.key,storageKey};
 const key=crypto.randomUUID();storage.setItem(storageKey,JSON.stringify({fingerprint,key}));
 return {key,storageKey};
}
