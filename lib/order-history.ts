import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {pageWindow} from './pagination';
import {orderLabels} from './marketplace-cart-utils';
export type HistoryQuery={page?:string;q?:string;status?:string;kind?:string};
export type HistoryOrder={id:string;shop_id:string;order_kind:string;currency:string;status:string;total_minor:number;subtotal_minor:number;vat_minor:number;created_at:string;reservation_expires_at:string|null;commission_due_at:string|null;shop_snapshot:{name?:string;slug?:string}|null;order_items:{quantity:number;item_snapshot:{name?:string}}[]};
export async function orderHistory(client:SupabaseClient,scope:'buyer'|'seller'|'admin',query:HistoryQuery={},shopId?:string){
 const window=pageWindow(query.page);
 const filters={q:typeof query.q==='string'?query.q.trim().slice(0,80):'',status:query.status&&Object.hasOwn(orderLabels,query.status)&&query.status!=='expired'?query.status:'all',kind:query.kind&&['fixed','commission'].includes(query.kind)?query.kind:'all'};
 const {data,error}=await client.rpc('search_order_history',{p_scope:scope,p_shop:shopId||null,p_search:filters.q,p_status:filters.status,p_kind:filters.kind,p_page:window.page});
 if(error||!data||!Array.isArray(data.items)||!Number.isSafeInteger(data.total))throw Error('Order history unavailable');
 return {orders:data.items as HistoryOrder[],total:data.total as number,window,filters};
}
