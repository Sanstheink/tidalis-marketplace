import {notFound} from 'next/navigation';
import {requireSellerFinance,requireMfa} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {receiptDocument} from '@/lib/order-documents';
import {documentResponse} from '@/lib/order-document-pdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;if(!uuidPattern.test(id))notFound();const {client,member}=await requireSellerFinance();await requireMfa(client,`/seller/documents/${id}`);const owner={shopId:member.shop_id};return documentResponse(await receiptDocument(client,id,owner),`receipt-original-${id}`);}
