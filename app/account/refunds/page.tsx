import {requireUser} from '@/lib/auth';
import RefundQueue from '@/components/RefundQueue';
export default async function Refunds({searchParams}:{searchParams:Promise<{notice?:string;page?:string}>}){const {notice,page}=await searchParams;const {client,user}=await requireUser('/account/refunds');return <RefundQueue client={client} scope="buyer" userId={user.id} notice={notice} page={page}/>;}
