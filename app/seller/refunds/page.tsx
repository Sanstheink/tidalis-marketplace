import {requireSellerFinance,requireMfa} from '@/lib/auth';
import RefundQueue from '@/components/RefundQueue';
export default async function Refunds({searchParams}:{searchParams:Promise<{notice?:string;page?:string}>}){const {notice,page}=await searchParams;const {client,user,member}=await requireSellerFinance();await requireMfa(client,'/seller/refunds');return <RefundQueue client={client} scope="seller" userId={user.id} shopId={member.shop_id} notice={notice} page={page} canFinance={['owner','finance'].includes(member.role)}/>;}
