import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@supabase/ssr';
export async function proxy(request:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anon)return NextResponse.next({request});
 let response=NextResponse.next({request});
 const client=createServerClient(url,anon,{cookies:{getAll(){return request.cookies.getAll()},setAll(toSet){toSet.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});toSet.forEach(({name,value,options})=>response.cookies.set(name,value,options))}}});
 // Refresh auth on request so Server Components receive a valid session.
 await client.auth.getUser();
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
