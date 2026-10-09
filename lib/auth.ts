import {redirect} from 'next/navigation';
import {supabaseServer} from '@/lib/supabase/server';

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

export async function requirePlatformAdmin(){
  const {client,user}=await requireUser('/admin');
  const {data,error}=await client.from('platform_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();
  if(error||!data)redirect('/account?denied=admin');
  await requireMfa(client,'/admin');
  return {client,user};
}

export async function requireSeller(){
  const {client,user}=await requireUser('/seller');
  const {data,error}=await client.from('shop_members').select('shop_id,role,shops!inner(status,name)').eq('user_id',user.id).in('shops.status',['active','paused']).limit(1);
  if(error||!data?.length)redirect('/sell/application');
  await requireMfa(client,'/seller');
  return {client,user,member:data[0]};
}

export async function getWorkspaceAccess(client:NonNullable<Awaited<ReturnType<typeof supabaseServer>>>,userId:string){
  const [admin,seller,applications]=await Promise.all([
    client.from('platform_roles').select('role').eq('user_id',userId).eq('role','admin').maybeSingle(),
    client.from('shop_members').select('shop_id,role,shops!inner(name,status)').eq('user_id',userId).in('shops.status',['active','paused']).limit(5),
    client.from('seller_applications').select('id,status,shop_name,submitted_at').eq('user_id',userId).order('submitted_at',{ascending:false}).limit(1)
  ]);
  return {isAdmin:!admin.error&&Boolean(admin.data),shops:seller.data||[],lastApplication:applications.data?.[0]||null};
}
