import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import ReceiptDocument,{type ReceiptData} from '@/components/ReceiptDocument';
import {PrintButton} from '@/components/PrintButton';
export const dynamic='force-dynamic';
export default async function PlatformBillingPrintable({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!uuidPattern.test(id))notFound();const {client}=await requirePlatformAdmin('/admin/finance/documents');
 const {data,error}=await client.from('platform_billing_documents').select('*').eq('id',id).maybeSingle();if(error||!data)notFound();
 return <div className="container page-pad"><div className="receipt-toolbar"><Link className="back-link" href="/admin/finance/documents">← เอกสารการเงิน</Link><PrintButton/></div><ReceiptDocument document={data as ReceiptData}/></div>;
}
