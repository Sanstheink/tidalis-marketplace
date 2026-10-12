import {redirect} from 'next/navigation';
import {supabaseServer} from '@/lib/supabase/server';
import {cookies} from 'next/headers';
import {chooseSellerMembership,SELLER_SHOP_COOKIE} from '@/lib/seller-workspace';

export async function getIdentity(){
  const client=await supabaseServer();
  if(!client)return {client:null,user:null};
  const {data:{user},error}=await client.auth.getUser();
  return {client,user:error?null:user};
}

export async function requireUser(next:string){
  const identity=await getIdentity();
  if(!identity.user)redirect(`/login?next=${encodeURIComponent(next)}`);
  if(!identity.user.email_confirmed_at)redirect(`/verify-email?next=${encodeURIComponent(next)}&email=${encodeURIComponent(identity.user.email||'')}`);
  return {...identity,client:identity.client!,user:identity.user!};
}

export async function requireMfa(client:NonNullable<Awaited<ReturnType<typeof supabaseServer>>>,next:string){
  const {data,error}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(error||data?.currentLevel!=='aal2')redirect(`/mfa?next=${encodeURIComponent(next)}`);
}

export async function requirePlatformAdmin(next='/admin'){
  const {client,user}=await requireUser(next);
  const {data,error}=await client.from('platform_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();
  if(error||!data)redirect('/account?denied=admin');
  await requireMfa(client,next);
  return {client,user};
}

/**
 * Seller Studio routine access: an approved shop member with a VERIFIED TOTP
 * enrollment may use AAL1. Enrollment is not the same as an elevated session.
 * Postgres independently checks live TOTP enrollment for AAL1 RLS/RPC paths.
 */
export async function requireSeller(){
  const {client,user}=await requireUser('/seller');
  // Lookup own membership first; self-read of shop_members never requires AAL2.
  const {data:members,error:memberError}=await client.from('shop_members')
    .select('shop_id,role').eq('user_id',user.id).order('shop_id');
  if(memberError||!members?.length)redirect('/sell/application');
  const {data:factors,error:factorError}=await client.auth.mfa.listFactors();
  if(factorError)redirect('/account?denied=mfa-unavailable');
  if(!factors?.totp?.some(f=>f.status==='verified'))
    redirect('/mfa?next=%2Fseller');
  const ids=members.map(m=>m.shop_id);
  const {data:shops,error:shopError}=await client.from('shops')
    .select('id,name,status').in('id',ids).in('status',['active','paused']).order('id');
  if(shopError||!shops?.length)redirect('/sell/application');
  const selected=(await cookies()).get(SELLER_SHOP_COOKIE)?.value;
  const member=chooseSellerMembership(members,shops.map(shop=>shop.id),selected);
  if(!member)redirect('/workspace?notice=choose-shop');
  const shop=shops.find(shop=>shop.id===member.shop_id)!;
  return {client,user,member,shop};
}

export async function getWorkspaceAccess(client:NonNullable<Awaited<ReturnType<typeof supabaseServer>>>,userId:string){
  const [admin,seller,applications]=await Promise.all([
    client.from('platform_roles').select('role').eq('user_id',userId).eq('role','admin').maybeSingle(),
    client.from('shop_members').select('shop_id,role,shops!inner(name,status)').eq('user_id',userId).order('shop_id'),
    client.from('seller_applications').select('id,status,shop_name,submitted_at').eq('user_id',userId).order('submitted_at',{ascending:false}).limit(1)
  ]);
  return {isAdmin:!admin.error&&Boolean(admin.data),shops:seller.data||[],lastApplication:applications.data?.[0]||null};
}

/** Finance/history remain available for a suspended or closed owned shop. This
 * does not reopen its catalog or authorize new sales. All access requires AAL2. */
export async function requireSellerFinance(next='/seller/finance'){
 const {client,user}=await requireUser(next);await requireMfa(client,next);
 const {data:members,error}=await client.from('shop_members').select('shop_id,role').eq('user_id',user.id).in('role',['owner','finance']).order('shop_id');
 if(error||!members?.length)redirect('/workspace?notice=finance-denied');
 const {data:shops,error:shopError}=await client.from('shops').select('id,name,status').in('id',members.map(m=>m.shop_id)).order('id');
 if(shopError||!shops?.length)redirect('/workspace?notice=finance-denied');
 const selected=(await cookies()).get(SELLER_SHOP_COOKIE)?.value;const member=chooseSellerMembership(members,shops.map(s=>s.id),selected);if(!member)redirect('/workspace?notice=choose-shop');
 return {client,user,member,shop:shops.find(s=>s.id===member.shop_id)!};
}

/** History and order messages remain accessible to the existing shop team after
 * closure. This guard grants no catalog mutation or financial approval rights. */
export async function requireSellerHistory(next='/seller/orders'){
 const {client,user}=await requireUser(next);
 await requireMfa(client,next);
 const {data:members,error}=await client.from('shop_members').select('shop_id,role').eq('user_id',user.id).order('shop_id');
 if(error||!members?.length)redirect('/workspace?notice=shop-unavailable');
 const {data:shops,error:shopError}=await client.from('shops').select('id,name,status').in('id',members.map(m=>m.shop_id)).order('id');
 if(shopError||!shops?.length)redirect('/workspace?notice=shop-unavailable');
 const selected=(await cookies()).get(SELLER_SHOP_COOKIE)?.value;
 const member=chooseSellerMembership(members,shops.map(s=>s.id),selected);
 if(!member)redirect('/workspace?notice=choose-shop');
 return {client,user,member,shop:shops.find(s=>s.id===member.shop_id)!};
}
