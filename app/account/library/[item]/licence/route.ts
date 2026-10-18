import {notFound,redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {licenceDocument} from '@/lib/order-documents';
import {documentResponse} from '@/lib/order-document-pdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{item:string}>}){const {item}=await params;if(!uuidPattern.test(item))notFound();const {client,user}=await requireUser('/account/library');const legacy=await licenceDocument(client,item,user.id);const rights=await client.from('artwork_rights_documents').select('id').eq('order_item_id',item).eq('buyer_id',user.id).eq('status','effective').order('version',{ascending:false}).limit(1).maybeSingle();if(rights.error)throw Error('Artwork rights unavailable');if(rights.data)redirect(`/rights/${rights.data.id}/download`);return documentResponse(legacy,`licence-${item}`);}
