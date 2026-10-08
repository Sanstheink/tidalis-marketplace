import {NextRequest,NextResponse} from 'next/server';
import {supabaseServer} from '@/lib/supabase/server';
export async function GET(request:NextRequest){const {searchParams,origin}=new URL(request.url);const code=searchParams.get('code');const next=searchParams.get('next')||'/account';if(code){const client=await supabaseServer();if(client){const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(next.startsWith('/')&&!next.startsWith('//')?next:'/account',origin))}}return NextResponse.redirect(new URL('/login?error=callback',origin))}
