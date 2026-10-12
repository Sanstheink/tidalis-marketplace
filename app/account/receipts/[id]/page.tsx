import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import ShopReceiptView from '@/components/ShopReceiptView';
export default async function Document({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!uuidPattern.test(id))notFound();const {client,user}=await requireUser(`/account/receipts/${id}`);return <ShopReceiptView client={client} id={id} scope="buyer" buyerId={user.id}/>;}
