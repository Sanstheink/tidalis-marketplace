import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireSellerHistory,requireMfa} from '@/lib/auth';
import {uuidPattern,orderLabels} from '@/lib/marketplace-cart-utils';
import {visibleOrder} from '@/lib/phase6';
import OrderOperations from '@/components/OrderOperations';
import {formatMoney} from '@/lib/payment-utils';
export default async function Order({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string;messagePage?:string}>}){const {id}=await params;if(!uuidPattern.test(id))notFound();const {notice,messagePage}=await searchParams;const {client,user,member,shop}=await requireSellerHistory(`/seller/orders/${id}`);await requireMfa(client,`/seller/orders/${id}`);const order=await visibleOrder(client,id,'seller',user.id,member.shop_id);if(!order)notFound();return <main className="container page-pad commerce-page"><Link href="/seller/orders" className="text-link">← คำสั่งซื้อในร้าน</Link><div className="page-heading"><h1>ดูแล<em>คำสั่งซื้อ.</em></h1><p>#{id.slice(0,8).toUpperCase()} · {orderLabels[order.status]||order.status} · {formatMoney(order.total_minor,order.currency)}</p></div><OrderOperations client={client} order={order} scope="seller" userId={user.id} notice={notice} messagePage={messagePage} canFinance={['owner','finance'].includes(member.role)} canWork={['owner','manager','artist'].includes(member.role)} canQuote={['owner','manager','artist'].includes(member.role)&&['active','paused'].includes(shop.status)}/></main>;}
