import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requirePlatformAdmin} from '@/lib/auth';
import {uuidPattern,orderLabels} from '@/lib/marketplace-cart-utils';
import {visibleOrder} from '@/lib/phase6';
import OrderOperations from '@/components/OrderOperations';
export default async function Order({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string;messagePage?:string}>}){const {id}=await params;if(!uuidPattern.test(id))notFound();const {notice,messagePage}=await searchParams;const {client,user}=await requirePlatformAdmin(`/admin/orders/${id}`);const order=await visibleOrder(client,id,'admin',user.id);if(!order)notFound();return <main className="container page-pad commerce-page"><Link href="/admin/sales" className="text-link">← ประวัติการขาย</Link><div className="page-heading"><h1>ตรวจ<em>คำสั่งซื้อ.</em></h1><p>#{id.slice(0,8).toUpperCase()} · {orderLabels[order.status]}</p></div><OrderOperations client={client} order={order} scope="admin" userId={user.id} notice={notice} messagePage={messagePage}/></main>;}
