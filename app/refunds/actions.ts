'use server';
import {proofFileType} from '@/lib/proof-file';
import {randomUUID,createHash} from 'node:crypto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireUser,requireSellerFinance,requireMfa,requirePlatformAdmin} from '@/lib/auth';
import {supabaseService} from '@/lib/supabase/service';
import {decimalToMinor} from '@/lib/payment-utils';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
const text=(f:FormData,k:string)=>String(f.get(k)||'').trim();
const id=(f:FormData,k:string)=>uuidPattern.test(text(f,k))?text(f,k):null;
function renew(){for(const p of ['/account/refunds','/seller/refunds','/admin/refunds','/account/orders','/seller/orders','/account/library','/seller/finance','/admin/finance'])revalidatePath(p);}
export async function requestRefund(form:FormData){
 const order=id(form,'order');if(!order)redirect('/account/orders');const back=`/account/orders/${order}`;const {client}=await requireUser(back);
 let amount:string;try{amount=decimalToMinor(text(form,'amount')).toString();}catch{redirect(back+'?notice=invalid');}
 if(form.get('confirmed')!=='yes')redirect(back+'?notice=invalid');
 const {error}=await client.rpc('request_refund',{p_order:order,p_amount:amount,p_reason:text(form,'reason'),p_name:text(form,'recipientName'),p_bank:text(form,'bank'),p_account:text(form,'account')});
 if(error)redirect(back+'?notice='+encodeURIComponent(error.message));renew();revalidatePath(back);redirect('/account/refunds?notice=sent');
}
export async function refundAction(form:FormData){
 const refund=id(form,'refund');if(!refund)redirect('/account/refunds');const scope=text(form,'scope'),action=text(form,'action');const back=scope==='admin'?'/admin/refunds':scope==='seller'?'/seller/refunds':'/account/refunds';
 const identity=scope==='admin'?await requirePlatformAdmin(back):scope==='seller'?await requireSellerFinance():await requireUser(back);const client=identity.client;
 if(scope==='seller')await requireMfa(client,back);
 let rpc:string,params:Record<string,unknown>;
 if(['approve','reject'].includes(action)&&['seller','admin'].includes(scope)&&form.get('confirmed')==='yes'){rpc='review_refund';params={p_refund:refund,p_approve:action==='approve',p_note:text(form,'note')};}
 else if(['received','dispute'].includes(action)&&scope==='buyer'&&(action!=='received'||form.get('confirmed')==='yes')){rpc='acknowledge_refund';params={p_refund:refund,p_received:action==='received',p_note:text(form,'note')};}
 else if(['resolve_received','resolve_retry'].includes(action)&&scope==='admin'&&form.get('confirmed')==='yes'){rpc='resolve_refund_dispute';params={p_refund:refund,p_received:action==='resolve_received',p_note:text(form,'note')};}
 else redirect(back+'?notice=invalid');
 const {error}=await client.rpc(rpc,params);if(error)redirect(back+'?notice='+encodeURIComponent(error.message));renew();redirect(back+'?notice=saved');
}
export async function recordRefundTransfer(form:FormData){
 const back='/seller/refunds';const {client,user}=await requireSellerFinance();await requireMfa(client,back);const refund=id(form,'refund'),service=supabaseService();
 if(!service)redirect(back+'?notice=payment_configuration_required');if(!refund||form.get('confirmed')!=='yes')redirect(back+'?notice=invalid');
 const {data:r}=await client.from('refund_requests').select('id,status').eq('id',refund).eq('status','approved').maybeSingle();if(!r)redirect(back+'?notice=failed');
 const file=form.get('proof');if(!(file instanceof File)||file.size<8||file.size>3145728)redirect(back+'?notice=invalid');const bytes=Buffer.from(await file.arrayBuffer());
 const kind=proofFileType(bytes);
 if(!kind)redirect(back+'?notice=invalid');const path=`refunds/${refund}/${randomUUID()}.${kind.ext}`,hash=createHash('sha256').update(bytes).digest('hex');
 const {error:upload}=await client.storage.from('tidalis-refund-proofs').upload(path,bytes,{contentType:kind.mime,upsert:false});if(upload)redirect(back+'?notice=failed');
 const {error}=await service.rpc('record_refund_transfer',{p_refund:refund,p_actor:user.id,p_path:path,p_sha:hash});
 if(error){await client.storage.from('tidalis-refund-proofs').remove([path]);redirect(back+'?notice='+encodeURIComponent(error.code==='23505'?'duplicate_proof':error.message));}renew();redirect(back+'?notice=sent');
}
export async function reconcilePayment(form:FormData){
 const scope=text(form,'scope'),back=scope==='admin'?'/admin/reconciliation':'/seller/payments';
 const {client}=scope==='admin'?await requirePlatformAdmin(back):await requireSellerFinance();if(scope!=='admin')await requireMfa(client,back);
 const attempt=id(form,'attempt');if(!attempt||form.get('confirmed')!=='yes')redirect(back+'?notice=invalid');
 if(scope==='admin'&&text(form,'resolution')==='flag'){const {error}=await client.rpc('flag_payment_for_reconciliation',{p_attempt:attempt,p_note:text(form,'note')});if(error)redirect(back+'?notice=failed');renew();revalidatePath(back);redirect(back+'?notice=saved');}
 const {data:result,error}=await client.rpc(text(form,'resolution')==='fulfil'?'restore_order_payment':'reconcile_order_payment',{p_attempt:attempt,p_note:text(form,'note')});if(error)redirect(back+'?notice='+encodeURIComponent(error.message));renew();revalidatePath(back);redirect(back+'?notice='+(text(form,'resolution')==='fulfil'?(result==='confirmed'?'saved':'failed'):'reconciled'));
}

export async function platformRefundAction(form:FormData){
 const scope=text(form,'scope'),back=scope==='seller'?'/seller/finance':'/admin/reconciliation';const {client}=scope==='seller'?await requireSellerFinance():await requirePlatformAdmin(back);if(scope==='seller')await requireMfa(client,back);
 const attempt=id(form,'attempt');if(!attempt||form.get('confirmed')!=='yes')redirect(back+'?notice=invalid');
 const action=text(form,'action')||(scope==='seller'?'received':'prepare');
 let rpc:string,params:Record<string,unknown>={p_attempt:attempt};
 if(scope==='seller'&&action==='received')rpc='acknowledge_platform_refund';
 else if(scope==='seller'&&action==='dispute'){rpc='dispute_platform_refund';params.p_note=text(form,'note');}
 else if(scope!=='seller'&&action==='prepare')rpc='prepare_platform_refund';
 else if(scope!=='seller'&&['resolve_received','resolve_retry'].includes(action)){rpc='resolve_platform_refund';params.p_received=action==='resolve_received';params.p_note=text(form,'note');}
 else if(scope!=='seller'&&action==='refresh_recipient'){rpc='refresh_platform_refund_recipient';params.p_note=text(form,'note');}
 else redirect(back+'?notice=invalid');
 const {error}=await client.rpc(rpc,params);if(error)redirect(back+'?notice='+encodeURIComponent(error.message));renew();revalidatePath('/admin/reconciliation');redirect(back+'?notice=saved');
}
export async function reportPlatformRefund(form:FormData){
 const back='/admin/reconciliation';const {client,user}=await requirePlatformAdmin(back);const attempt=id(form,'attempt'),service=supabaseService();if(!service)redirect(back+'?notice=payment_configuration_required');if(!attempt||form.get('confirmed')!=='yes')redirect(back+'?notice=invalid');
 const file=form.get('proof');if(!(file instanceof File)||file.size<8||file.size>3145728)redirect(back+'?notice=invalid');const bytes=Buffer.from(await file.arrayBuffer()),kind=proofFileType(bytes);if(!kind)redirect(back+'?notice=invalid');const path=`refunds/${attempt}/${randomUUID()}.${kind.ext}`,sha=createHash('sha256').update(bytes).digest('hex');
 const {error:upload}=await client.storage.from('tidalis-platform-refund-proofs').upload(path,bytes,{contentType:kind.mime,upsert:false});if(upload)redirect(back+'?notice=failed');
 const {error}=await service.rpc('report_platform_refund',{p_attempt:attempt,p_actor:user.id,p_path:path,p_sha:sha});if(error){await client.storage.from('tidalis-platform-refund-proofs').remove([path]);redirect(back+'?notice='+encodeURIComponent(error.code==='23505'?'duplicate_proof':error.message));}renew();revalidatePath('/admin/reconciliation');redirect(back+'?notice=sent');
}
