import {requirePlatformAdmin} from '@/lib/auth';
import RefundQueue from '@/components/RefundQueue';
export default async function Refunds({searchParams}:{searchParams:Promise<{notice?:string;page?:string}>}){const {notice,page}=await searchParams;const {client,user}=await requirePlatformAdmin('/admin/refunds');return <RefundQueue client={client} scope="admin" userId={user.id} notice={notice} page={page}/>;}
