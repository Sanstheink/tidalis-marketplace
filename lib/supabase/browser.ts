'use client';
import {createBrowserClient} from '@supabase/ssr';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export function supabaseBrowser(){if(!url||!key) return null; return createBrowserClient(url,key)}
