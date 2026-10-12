import {uuidPattern,type LiveCartLine} from '@/lib/marketplace-cart-utils';

type AttemptStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type CheckoutAttempt={key:string;fingerprint:string;storageKey:string};
export type RecoveredFixedOrder={orderId:string;items:Pick<LiveCartLine,'productId'|'license'|'quantity'>[]};

/** Keep the existing v1 namespace so orders submitted before this patch recover. */
export function storedCheckoutAttempt(userId:string,shopId:string,storage:AttemptStorage):CheckoutAttempt|null{
 const storageKey=`tidalis:order-attempt:v1:${userId}:${shopId}`;
 const value=storage.getItem(storageKey);if(value===null)return null;
 const previous=JSON.parse(value) as {key?:unknown;fingerprint?:unknown}|null;
 if(typeof previous?.key!=='string'||!uuidPattern.test(previous.key)||typeof previous.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(previous.fingerprint))throw Error('Invalid checkout retry identity');
 return {key:previous.key,fingerprint:previous.fingerprint,storageKey};
}

/** A request may leave the browser only after its retry identity is durable. */
export async function checkoutAttempt(userId:string,shopId:string,payload:unknown,storage:AttemptStorage):Promise<CheckoutAttempt>{
 const previous=storedCheckoutAttempt(userId,shopId,storage);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
 const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(previous?.fingerprint===fingerprint)return previous;
 // A recovery SELECT may run before an earlier request commits. Keep its key
 // even when the user edits the payload: the database lock then returns the
 // original order or idempotency_conflict instead of inserting a second order.
 const key=previous?.key??crypto.randomUUID(),storageKey=`tidalis:order-attempt:v1:${userId}:${shopId}`;
 const value=JSON.stringify({fingerprint,key});storage.setItem(storageKey,value);
 if(storage.getItem(storageKey)!==value)throw Error('Checkout retry identity was not retained');
 return {key,fingerprint,storageKey};
}

/** Preserve lines edited or added after an uncertain request. */
export function recoveredCartKeys(lines:LiveCartLine[],shopId:string,order:RecoveredFixedOrder){
 return lines.filter(line=>line.shopId===shopId&&order.items.some(item=>item.productId===line.productId&&item.license===line.license&&item.quantity===line.quantity))
  .map(line=>`${line.productId}:${line.license}`);
}
