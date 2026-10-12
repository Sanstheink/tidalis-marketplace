import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
export async function sellerAccessMode(client:SupabaseClient){
 const {data,error}=await client.from('marketplace_settings').select('self_service_shops,seller_self_publish').eq('singleton',true).single();
 return {available:!error&&Boolean(data),selfService:data?.self_service_shops===true,selfPublishing:data?.seller_self_publish===true};
}
