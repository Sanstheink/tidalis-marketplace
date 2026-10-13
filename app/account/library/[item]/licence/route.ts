import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import {licenceDocument} from '@/lib/order-documents';
import {documentResponse} from '@/lib/order-document-pdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{item:string}>}){const {item}=await params;if(!uuidPattern.test(item))notFound();const {client,user}=await requireUser('/account/library');return documentResponse(await licenceDocument(client,item,user.id),`licence-${item}`);}
