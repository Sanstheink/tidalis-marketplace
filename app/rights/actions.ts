'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {createHash} from 'node:crypto';
import {requireUser,requireSellerHistory} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {rightsRecord,rightsUrl,validateRightsPreview} from '@/lib/rights-server';
import {assignmentRequest,rightsNotice} from '@/lib/artwork-rights';
import {validateRightsForm,type RightsOfferState} from '@/lib/rights-form-validation';
const text=(f:FormData,k:string)=>String(f.get(k)||'').trim();
function fail(back:string,code:string):never{redirect(`${back}?rights=${encodeURIComponent(code)}`);}
function refresh(order:string,document?:string){revalidatePath(`/account/orders/${order}`);revalidatePath(`/seller/orders/${order}`);revalidatePath('/account/library');if(document)revalidatePath(`/rights/${document}`);}
export async function offerRights(_state:RightsOfferState,form:FormData):Promise<RightsOfferState>{
 const failOffer=(code:string):RightsOfferState=>({errors:{},message:rightsNotice(code)||'ดำเนินการไม่สำเร็จ กรุณาลองใหม่'});
 const order=text(form,'order'),item=text(form,'item'),key=text(form,'key');
 if(![order,item,key].every(v=>uuidPattern.test(v)))redirect('/seller/orders');
 const back=`/seller/orders/${order}`;const {client,member}=await requireSellerHistory(back);
 if(!['owner','manager'].includes(member.role))return failOffer('rights_seller_required');
 const {data:o,error:oe}=await client.from('orders').select('id').eq('id',order).eq('shop_id',member.shop_id).maybeSingle();
 const {data:i,error:ie}=await client.from('order_items').select('id').eq('id',item).eq('order_id',order).maybeSingle();
 if(oe||ie||!o||!i)return failOffer('rights_unavailable');
 try{rightsUrl(key);}catch{return failOffer('rights_site_url_required');}
 const details=Object.fromEntries(['title','licensor','usage','exclusivity','territory','duration','ends_on','scope','source','agreement_reference'].map(k=>[k,text(form,k)]));
 const errors=validateRightsForm({...details,kind:text(form,'kind'),signature:text(form,'signature')});
 if(Object.keys(errors).length)return {errors,message:'ตรวจช่องที่ระบุด้านล่าง ข้อมูลที่กรอกยังอยู่ครบ'};
 const file=form.get('preview');if(!(file instanceof File)||!file.size||file.size>2097152)return failOffer('rights_preview_required');
 const bytes=Buffer.from(await file.arrayBuffer());let format;
 try{format=await validateRightsPreview(bytes);}catch{return failOffer('rights_preview_required');}
 details.preview_sha256=createHash('sha256').update(bytes).digest('hex');
 const path=`orders/${order}/${key}.${format.extension}`,bucket=client.storage.from('tidalis-rights-previews');
 // A retry uses exactly the same immutable object, and rejects changed bytes.
 const uploaded=await bucket.upload(path,bytes,{contentType:format.contentType,upsert:false});
 if(uploaded.error){const prior=await bucket.download(path);if(prior.error||!prior.data)return failOffer('rights_preview_required');const old=Buffer.from(await prior.data.arrayBuffer());if(!createHash('sha256').update(bytes).digest().equals(createHash('sha256').update(old).digest()))return failOffer('rights_request_conflict');}
 const {data,error}=await client.rpc('offer_artwork_rights',{p_item:item,p_kind:text(form,'kind'),p_details:details,p_policy:text(form,'policy'),p_preview:path,p_signature:text(form,'signature'),p_confirmed:form.get('confirmed')==='yes',p_key:key});
 if(error||typeof data!=='string')return failOffer(error?.message||'rights_unavailable');refresh(order,data);redirect(`/rights/${data}?rights=offered`);
}
export async function acceptRights(form:FormData){
 const id=text(form,'document');if(!uuidPattern.test(id))redirect('/account/orders');const back=`/rights/${id}`;
 const {client,user}=await requireUser(back);const d=await rightsRecord(client,id,user.id);if(d.buyer_id!==user.id)fail(back,'rights_unavailable');
 const {error}=await client.rpc('accept_artwork_rights',{p_document:id,p_hash:text(form,'hash'),p_signature:text(form,'signature'),p_confirmed:form.get('confirmed')==='yes'});
 if(error)fail(back,error.message);refresh(d.order_id,id);redirect(back+'?rights=accepted');
}
export async function closeRights(form:FormData){
 const id=text(form,'document');if(!uuidPattern.test(id))redirect('/account/orders');const back=`/rights/${id}`;
 const {client,user}=await requireUser(back);const d=await rightsRecord(client,id,user.id);
 const {error}=await client.rpc('close_artwork_rights',{p_document:id,p_decline:d.buyer_id===user.id});if(error)fail(back,error.message);refresh(d.order_id,id);redirect(back+'?rights=closed');
}
export async function requestAssignment(form:FormData){
 const order=text(form,'order');if(!uuidPattern.test(order))redirect('/account/orders');const back=`/account/orders/${order}`;
 const {client,user}=await requireUser(back);const {data,error}=await client.from('orders').select('id').eq('id',order).eq('buyer_id',user.id).maybeSingle();if(error||!data)fail(back,'rights_unavailable');
 const note=text(form,'note');if(note.length<10||note.length>1500)fail(back,'rights_invalid_details');
 const result=await client.rpc('post_order_message',{p_order:order,p_body:assignmentRequest+'\n'+note});if(result.error)fail(back,result.error.message);refresh(order);redirect(back+'?rights=requested');
}
