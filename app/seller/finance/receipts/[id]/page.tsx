import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireSellerFinance,requireMfa} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import ReceiptDocument,{type ReceiptData} from '@/components/ReceiptDocument';
import {PrintButton} from '@/components/PrintButton';
export default async function SellerReceipt({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!uuidPattern.test(id))notFound();const {client,member}=await requireSellerFinance();await requireMfa(client,`/seller/finance/receipts/${id}`);
 const {data,error}=await client.from('platform_billing_documents').select('*').eq('id',id).eq('shop_id',member.shop_id).maybeSingle();if(error||!data)notFound();
 return <div className="container page-pad"><div className="receipt-toolbar"><Link className="back-link" href={`/seller/finance/${data.invoice_id}`}>← ใบแจ้งหนี้</Link><PrintButton/></div><ReceiptDocument document={data as ReceiptData}/></div>;
}
