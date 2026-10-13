import {notFound} from 'next/navigation';
import {requireSellerFinance,requireMfa} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {ownedDocumentOrder,quotationDocument} from '@/lib/order-documents';
import {documentResponse} from '@/lib/order-document-pdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;if(!uuidPattern.test(id))notFound();const {client,member}=await requireSellerFinance();await requireMfa(client,`/seller/orders/${id}`);const order=await ownedDocumentOrder(client,id,{shopId:member.shop_id});return documentResponse(await quotationDocument(client,order,true),`quotation-original-${id}`);}
