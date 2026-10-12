import {notFound} from 'next/navigation';
import {
 requirePlatformAdmin
} from '@/lib/auth';
import {uuidPattern} from '@/lib/marketplace-cart-utils';
import PlatformRefundOperations from '@/components/PlatformRefundOperations';
export default async function Refund({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{historyPage?:string}>}){
 const {id}=await params;if(!uuidPattern.test(id))notFound();const {client}=await requirePlatformAdmin('/admin/reconciliation');
 const {data,error}=await client.from('platform_payment_refunds').select('attempt_id').eq('attempt_id',id).maybeSingle();if(error)throw Error('Refund unavailable');if(!data)notFound();
 return <main className="container page-pad"><div className="page-heading"><h1>เงินคืน<em>แพลตฟอร์ม.</em></h1></div><PlatformRefundOperations client={client} scope="admin" attemptId={id} historyPage={(await searchParams).historyPage}/></main>;
}
