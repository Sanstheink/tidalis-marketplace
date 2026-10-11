'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {isShopId,SELLER_SHOP_COOKIE} from '@/lib/seller-workspace';

export async function selectSellerShop(formData: FormData) {
  const {client,user}=await requireUser('/workspace');
  const shopId=formData.get('shopId');
  if(!isShopId(shopId))redirect('/workspace?notice=choose-shop');
  const [{data:member,error:memberError},{data:factors,error:factorError}]=await Promise.all([
    client.from('shop_members').select('shop_id').eq('user_id',user.id).eq('shop_id',shopId).maybeSingle(),
    client.auth.mfa.listFactors()
  ]);
  if(memberError||!member)redirect('/workspace?notice=shop-unavailable');
  if(factorError)redirect('/workspace?notice=mfa-unavailable');
  if(!factors?.totp?.some(factor=>factor.status==='verified'))redirect('/mfa?next=%2Fworkspace');
  const {data:shop,error:shopError}=await client.from('shops').select('id').eq('id',shopId).in('status',['active','paused']).maybeSingle();
  if(shopError||!shop)redirect('/workspace?notice=shop-unavailable');
  (await cookies()).set(SELLER_SHOP_COOKIE,shopId,{
    httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*24*30
  });
  redirect('/seller');
}
