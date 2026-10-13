import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {receiptDocument} from '@/lib/order-documents';
import {documentResponse} from '@/lib/order-document-pdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;if(!uuidPattern.test(id))notFound();const {client,user}=await requireUser(`/account/receipts/${id}`);const owner={buyerId:user.id};return documentResponse(await receiptDocument(client,id,owner),`receipt-copy-${id}`);}
