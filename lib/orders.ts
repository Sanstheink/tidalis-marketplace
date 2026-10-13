import 'server-only';
import {supabaseServer} from './supabase/server';
import type {CheckoutContext} from './marketplace-cart-utils';
export async function getCheckoutContext(shopId:string,ids:string[]):Promise<CheckoutContext|null>{
  const client=await supabaseServer();if(!client)return null;
  const {data,error}=await client.rpc('get_fixed_checkout',{p_shop_id:shopId,p_product_ids:ids});
  if(error||!data||!Array.isArray(data.products)||!Array.isArray(data.policies))return null;
  const context=data as CheckoutContext;
  context.policies=await Promise.all(context.policies.map(async policy=>{
    if(policy.source_type!=='pdf'||!policy.document_path)return policy;
    const {data:signed,error}=await client.storage.from('tidalis-policy-documents').createSignedUrl(policy.document_path,300);
    return {...policy,document_url:error?null:signed?.signedUrl??null};
  }));
  return context;
}
