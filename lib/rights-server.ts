import 'server-only';
import {notFound} from 'next/navigation';
import type {SupabaseClient} from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import {uuidPattern} from './marketplace-cart-utils';
import type {RightsDocument} from './artwork-rights';

export function rightsUrl(id:string){
 if(!uuidPattern.test(id))throw Error('rights_unavailable');
 try{const url=new URL(process.env.NEXT_PUBLIC_SITE_URL||'');if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||((process.env.NODE_ENV!=='production'||process.env.TIDALIS_LOCAL_USER_TESTS==='true')&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw Error();return new URL(`/rights/${id}`,url).toString();}catch{throw Error('rights_site_url_required');}
}
export async function rightsRecord(client:SupabaseClient,id:string,userId:string){
 if(!uuidPattern.test(id))notFound();
 const {data,error}=await client.from('artwork_rights_documents').select('*').eq('id',id).maybeSingle();
 if(error)throw Error('Artwork document unavailable');if(!data)notFound();
 const d=data as RightsDocument;
 if(d.buyer_id!==userId){
  const [member,aal]=await Promise.all([client.from('shop_members').select('role').eq('shop_id',d.shop_id).eq('user_id',userId).in('role',['owner','manager']).maybeSingle(),client.auth.mfa.getAuthenticatorAssuranceLevel()]);
  if(member.error||!member.data||aal.error||aal.data?.currentLevel!=='aal2')notFound();
 }
 return d;
}
export async function validateRightsPreview(bytes:Buffer){
 if(bytes.length<24||bytes.length>2097152)throw Error('rights_preview_required');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!png&&!jpg)throw Error('rights_preview_required');
 const pdf=new PDFDocument({autoFirstPage:false});
 try{
  const img=(pdf as unknown as {openImage(b:Buffer):{width:number;height:number}}).openImage(bytes);
  if(img.width<16||img.height<16||img.width>4096||img.height>4096)throw Error();
  await new Promise<void>((resolve,reject)=>{pdf.on('data',()=>{});pdf.on('error',reject);pdf.on('end',resolve);try{pdf.addPage();pdf.image(bytes,0,0,{fit:[100,100]});pdf.end();}catch(e){reject(e);}});
 }catch{throw Error('rights_preview_required');}
 return {extension:png?'png':'jpg',contentType:png?'image/png':'image/jpeg'};
}
