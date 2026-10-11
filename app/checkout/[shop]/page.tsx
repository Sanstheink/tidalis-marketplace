import {notFound} from 'next/navigation';
import {getPublicShop} from '@/lib/public-catalog';
import {getIdentity} from '@/lib/auth';
import FixedCheckout from '@/components/FixedCheckout';
export const dynamic='force-dynamic';
export default async function CheckoutPage({params}:{params:Promise<{shop:string}>}){
  const {shop:slug}=await params;
  const [shop,{user}]=await Promise.all([getPublicShop(slug),getIdentity()]);
  if(!shop)notFound();
  return <FixedCheckout shop={shop} userId={user?.id??null}/>;
}
