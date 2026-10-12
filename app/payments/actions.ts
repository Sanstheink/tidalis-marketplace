'use server';
import {randomUUID,createHash} from 'node:crypto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireUser,requireMfa,requireSellerFinance,requirePlatformAdmin} from '@/lib/auth';
import {supabaseService} from '@/lib/supabase/service';
import {uuidPattern} from '@/lib/marketplace-cart-utils';

function id(form:FormData,key:string){const v=String(form.get(key)||'');return uuidPattern.test(v)?v:null;}
function failure(path:string,code:string):never{redirect(`${path}?notice=${encodeURIComponent(code)}`);}
function proofType(bytes:Buffer){
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',extension:'png'};
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',extension:'jpg'};
 if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return {mime:'image/webp',extension:'webp'};
 if(bytes.toString('ascii',0,5)==='%PDF-')return {mime:'application/pdf',extension:'pdf'};
 return null;
}
export async function startPayment(form:FormData){
 const order=id(form,'orderId'),invoice=id(form,'invoiceId');const back=order?`/account/orders/${order}`:invoice?`/seller/finance/${invoice}`:'/account/orders';
 const {client}=await requireUser(back);if(invoice)await requireMfa(client,back);
 const method=String(form.get('method')||'');
 if((!order&&!invoice)||(order&&invoice)||!['bank_transfer','qr_code','promptpay'].includes(method))failure(back,'method_unavailable');
 if(!supabaseService())failure(back,'payment_configuration_required');
 const {data,error}=await client.rpc('create_payment_attempt',{p_order_id:order,p_invoice_id:invoice,p_method:method});
 if(error)failure(back,error.message);revalidatePath(back);redirect(`/payments/${data}`);
}
export async function uploadPaymentProof(form:FormData){
 const attemptId=id(form,'attemptId');if(!attemptId)redirect('/account/orders');
 const back=`/payments/${attemptId}`;const {client,user}=await requireUser(back);const service=supabaseService();
 if(!service)failure(back,'payment_configuration_required');
 const {data:attempt}=await client.from('payment_attempts').select('*').eq('id',attemptId).eq('payer_id',user.id).maybeSingle();
 if(!attempt||!['pending','expired'].includes(attempt.status)||!['bank_transfer','promptpay','qr_code'].includes(attempt.method))failure(back,'proof_unavailable');
 if(attempt.invoice_id)await requireMfa(client,back);
 const file=form.get('proof');if(!(file instanceof File)||file.size<8||file.size>3145728)failure(back,'invalid_proof');
 const bytes=Buffer.from(await file.arrayBuffer()),type=proofType(bytes);if(!type)failure(back,'invalid_proof');
 const hash=createHash('sha256').update(bytes).digest('hex'),path=`attempts/${attemptId}/${randomUUID()}.${type.extension}`;
 const {error:uploadError}=await client.storage.from('tidalis-payment-proofs').upload(path,bytes,{contentType:type.mime,upsert:false});
 if(uploadError)failure(back,'proof_upload_failed');
 const {error}=await service.rpc('submit_payment_proof',{p_attempt_id:attemptId,p_actor:user.id,p_path:path,p_sha256:hash});
 if(error){await client.storage.from('tidalis-payment-proofs').remove([path]);failure(back,error.code==='23505'?'duplicate_proof':error.message);}
 revalidatePath(back);revalidatePath('/seller/payments');redirect(`${back}?notice=proof_received`);
}
export async function cancelPayment(form:FormData){
 const attemptId=id(form,'attemptId');if(!attemptId)redirect('/account/orders');const back=`/payments/${attemptId}`;const {client}=await requireUser(back);
 const {data:attempt}=await client.from('payment_attempts').select('order_id,invoice_id').eq('id',attemptId).maybeSingle();
 if(attempt?.invoice_id)await requireMfa(client,back);
 const {error}=await client.rpc('cancel_payment_attempt',{p_attempt_id:attemptId});if(error)failure(back,error.message);
 const target=attempt?.order_id?`/account/orders/${attempt.order_id}`:`/seller/finance/${attempt?.invoice_id}`;revalidatePath(target);redirect(target);
}
export async function reviewPayment(form:FormData){
 const attemptId=id(form,'attemptId');const admin=form.get('scope')==='platform';let client;
 if(admin){({client}=await requirePlatformAdmin());}else{const seller=await requireSellerFinance();await requireMfa(seller.client,'/seller/payments');client=seller.client;}
 const back=admin?'/admin/finance/payments':'/seller/payments',approve=form.get('decision')==='approve',note=String(form.get('note')||'').trim();
 if(!attemptId||(approve&&form.get('bankConfirmed')!=='yes')||(!approve&&(note.length<10||note.length>1000)))failure(back,'review_confirmation_required');
 const {data:result,error}=await client.rpc('review_manual_payment',{p_attempt_id:attemptId,p_approve:approve,p_note:note});if(error)failure(back,error.message);
 revalidatePath(back);revalidatePath('/account/library');revalidatePath('/admin/finance/documents');redirect(`${back}?notice=${approve?(result==='needs_review'?'needs_review':'confirmed'):'rejected'}`);
}
