import {NextRequest,NextResponse} from 'next/server';
import type {EmailOtpType} from '@supabase/supabase-js';
import {supabaseServer} from '@/lib/supabase/server';
import {safeNextPath} from '@/lib/auth-routes';

/** Optional email template route: /auth/confirm?token_hash=...&type=signup|recovery */
export async function GET(request:NextRequest){
 const {searchParams,origin}=new URL(request.url);
 const hash=searchParams.get('token_hash');
 const type=searchParams.get('type');
 if(hash && (type==='signup'||type==='recovery')){
  const client=await supabaseServer();
  if(client){
   const {error}=await client.auth.verifyOtp({token_hash:hash,type:type as EmailOtpType});
   if(!error){
    const destination=type==='recovery'?'/reset-password':safeNextPath(searchParams.get('next'));
    return NextResponse.redirect(new URL(destination,origin));
   }
  }
 }
 return NextResponse.redirect(new URL('/login?error=confirm',origin));
}
