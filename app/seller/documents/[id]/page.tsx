import {notFound} from 'next/navigation';
import {requireSellerFinance,requireMfa} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import ShopReceiptView from '@/components/ShopReceiptView';
export default async function Document({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string}>}){const {id}=await params;if(!uuidPattern.test(id))notFound();const {notice}=await searchParams;const {client,member}=await requireSellerFinance();await requireMfa(client,`/seller/documents/${id}`);return <ShopReceiptView client={client} id={id} scope="seller" shopId={member.shop_id} notice={notice}/>;}
