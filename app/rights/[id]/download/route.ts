import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {rightsRecord,rightsUrl,validateRightsPreview} from '@/lib/rights-server';
import {artworkRightsPdf} from '@/lib/artwork-rights-pdf';
import {documentResponse} from '@/lib/order-document-pdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const {client,user}=await requireUser(`/rights/${id}`);const d=await rightsRecord(client,id,user.id);
 if(!['effective','superseded'].includes(d.status))notFound();
 const [file,order]=await Promise.all([client.storage.from('tidalis-rights-previews').download(d.preview_path),client.from('orders').select('status').eq('id',d.order_id).maybeSingle()]);
 if(file.error||!file.data||order.error||!order.data)throw Error('Artwork document unavailable');
 const bytes=Buffer.from(await file.data.arrayBuffer());await validateRightsPreview(bytes);
 return documentResponse(await artworkRightsPdf(d,bytes,rightsUrl(id),order.data.status),`${d.kind}-${id}-v${d.version}`);
}
