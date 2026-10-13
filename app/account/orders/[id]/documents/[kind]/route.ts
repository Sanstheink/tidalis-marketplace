import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {ownedDocumentOrder,quotationDocument,receiptDocument} from '@/lib/order-documents';
import {documentResponse} from '@/lib/order-document-pdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;kind:string}>}){
 const {id,kind}=await params;if(!uuidPattern.test(id)||!['quotation','receipt'].includes(kind))notFound();
 const {client,user}=await requireUser(`/account/orders/${id}`);const owner={buyerId:user.id};const order=await ownedDocumentOrder(client,id,owner);
 if(kind==='quotation')return documentResponse(await quotationDocument(client,order),`quotation-copy-${id}`);
 const {data:d,error}=await client.from('financial_documents').select('id').eq('order_id',id).eq('document_type','receipt').eq('status','issued').maybeSingle();if(error)throw Error('Receipt unavailable');if(!d)notFound();
 return documentResponse(await receiptDocument(client,d.id,owner),`receipt-copy-${id}`);
}
