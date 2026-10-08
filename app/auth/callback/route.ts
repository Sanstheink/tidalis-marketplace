import {NextRequest,NextResponse} from 'next/server';
import {supabaseServer} from '@/lib/supabase/server';
import {safeNextPath} from '@/lib/auth-routes';

export async function GET(request:NextRequest){
  const {searchParams,origin}=new URL(request.url);
  const code=searchParams.get('code');
  const next=safeNextPath(searchParams.get('next'));
  if(code){
    const client=await supabaseServer();
    if(client){
      const {error}=await client.auth.exchangeCodeForSession(code);
      if(!error)return NextResponse.redirect(new URL(next,origin));
    }
  }
  return NextResponse.redirect(new URL('/login?error=callback',origin));
}
