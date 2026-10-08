import {redirect} from 'next/navigation';
import {supabaseServer} from '@/lib/supabase/server';
export async function getIdentity(){
  const client=await supabaseServer();if(!client)return {client:null,user:null};
  const {data:{user}}=await client.auth.getUser();return {client,user};
}
export async function requireUser(next:string){
  const identity=await getIdentity();if(!identity.user)redirect(`/login?next=${encodeURIComponent(next)}`);return {...identity,user:identity.user!};
}
export async function requirePlatformAdmin(){
  const {client,user}=await requireUser('/admin');
  await requireMfa(client!, '/admin');
  const {data}=await client!.from('platform_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();
  if(!data)redirect('/account?denied=admin');return {client:client!,user};
}
export async function requireSeller(){
  const {client,user}=await requireUser('/seller');
  await requireMfa(client!, '/seller');
  const {data}=await client!.from('shop_members').select('shop_id,role,shops!inner(status,name)').eq('user_id',user.id).limit(1);
  if(!data?.length)redirect('/sell/apply');return {client:client!,user,member:data[0]};
}

async function requireMfa(client:NonNullable<Awaited<ReturnType<typeof supabaseServer>>>, next:string){
  const {data,error}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(error || data?.currentLevel!=='aal2') redirect(`/mfa?next=${encodeURIComponent(next)}`);
}
