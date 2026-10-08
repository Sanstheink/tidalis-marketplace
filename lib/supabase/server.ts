import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export async function supabaseServer(){
  if(!url||!key)return null;
  const cookieStore=await cookies();
  return createServerClient(url,key,{cookies:{getAll(){return cookieStore.getAll()},setAll(toSet){try{toSet.forEach(({name,value,options})=>cookieStore.set(name,value,options))}catch{/* Server Components cannot set response cookies; proxy refreshes the session. */}}}});
}
