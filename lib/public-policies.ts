/** Cookie-free public reads: never expose pending policy drafts to anonymous visitors. */
import 'server-only';
import {createClient} from '@supabase/supabase-js';

export type PublishedPolicy={id:string;policy_type:string;version:number;title:string;content:string;effective_from:string|null};
export type PublishedShopPolicy={id:string;policy_type:string;version:number;content:string;published_at:string|null;source_type:string;document_name:string|null;document_url:string|null};

function anonymousClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}

export async function getPublishedPlatformPolicy(type:string):Promise<PublishedPolicy|null>{
  const client=anonymousClient();
  if(!client)return null;
  const {data,error}=await client.from('platform_policy_versions')
    .select('id,policy_type,version,title,content,effective_from')
    .eq('policy_type',type).eq('status','published')
    .lte('effective_from',new Date().toISOString()).not('approved_by','is',null)
    .order('version',{ascending:false}).limit(1).maybeSingle();
  if(error||!data)return null;
  return data as PublishedPolicy;
}

export async function getPublishedShopPolicies(shopId:string):Promise<PublishedShopPolicy[]>{
  const client=anonymousClient();
  if(!client)return [];
  // Defence in depth: join only shops marked active, regardless of RLS configuration.
  const {data,error}=await client.from('shop_policy_versions')
    .select('id,policy_type,version,content,published_at,source_type,document_path,document_name,shop:shops!inner(status)')
    .eq('shop_id',shopId).eq('status','published').eq('shop.status','active')
    .order('version',{ascending:false}).limit(80);
  if(error||!data)return [];
  const seen=new Set<string>();
  const published=data.flatMap(row=>{
    const policyType=String(row.policy_type||'');
    if(seen.has(policyType))return [];
    seen.add(policyType);
    return [row];
  });
  return Promise.all(published.map(async row=>{
    let document_url:string|null=null;
    if(row.source_type==='pdf'&&row.document_path){
      const {data:signed,error:signError}=await client.storage.from('tidalis-policy-documents')
        .createSignedUrl(row.document_path,300,{download:row.document_name||'shop-policy.pdf'});
      if(!signError)document_url=signed?.signedUrl||null;
    }
    return {id:row.id,policy_type:row.policy_type,version:row.version,content:row.content,
      published_at:row.published_at,source_type:row.source_type,document_name:row.document_name,document_url};
  }));
}
