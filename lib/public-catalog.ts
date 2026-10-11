/** Public storefront reads only. Never exposes private Storage file paths. */
import 'server-only';
import { createClient } from '@supabase/supabase-js';

import {type PublicProduct, type PublicShop, type PublicLicense, type PublicProductType} from '@/lib/public-catalog-shared';
import {catalogFilters, type CatalogQuery} from '@/lib/catalog-query';

export class CatalogUnavailableError extends Error {
  constructor() { super('Public catalog temporarily unavailable'); this.name='CatalogUnavailableError'; }
}
// Using a cookie-free client avoids expanding public visibility via an admin/seller session.
// Supabase RLS still applies, and every read below ALSO filters for publication.
function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const PRODUCT_SELECTION = 'id,slug,name,description,product_type,pricing_mode,is_exclusive,stock,currency,shop_id,shop:shops!inner(id,slug,name,status),work_type:shop_work_types(name),product_license_prices(usage_type,price_minor,terms)';

type RecordLike = Record<string, unknown>;
const single = (v: unknown): RecordLike | null => {
  if (Array.isArray(v)) return (v[0] ?? null) as RecordLike | null;
  return v && typeof v === 'object' ? v as RecordLike : null;
};
const asText = (v: unknown) => typeof v === 'string' ? v : '';
const asPrice = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
function normalizeProduct(row: RecordLike): PublicProduct | null {
  const shop = single(row.shop);
  if (!shop || asText(shop.status) !== 'active') return null;
  const productType = asText(row.product_type);
  if (!['commission','ready_made','digital_asset'].includes(productType)) return null;
  const licenses = (Array.isArray(row.product_license_prices) ? row.product_license_prices : [])
    .flatMap(v => {
      const license = single(v);
      if (!license) return [];
      const type = asText(license.usage_type);
      const price = asPrice(license.price_minor);
      if (!['personal','commercial'].includes(type) || price === null) return [];
      return [{ usageType: type as PublicLicense['usageType'], priceMinor: price, terms: asText(license.terms) }];
    });
  if (!licenses.length) return null; // Don't show a product without a valid public price.
  const workType = single(row.work_type);
  return {
    id: asText(row.id), slug: asText(row.slug), name: asText(row.name),
    description: asText(row.description), productType: productType as PublicProductType,
    pricingMode: row.pricing_mode === 'quote' ? 'quote' : 'fixed',
    shopId: asText(shop.id), shopSlug: asText(shop.slug), shopName: asText(shop.name),
    workType: asText(workType?.name) || 'Digital artwork',
    exclusive: row.is_exclusive === true,
    stock: typeof row.stock === 'number' ? row.stock : null,
    currency: ['THB','USD','LAK'].includes(asText(row.currency))?asText(row.currency):'THB', licenses,
  };
}

// Images are previews explicitly attached to PUBLISHED products only. Never sign deliverable paths.
// This works with anon RLS from Migration 008; failures do not leak private paths.
async function withPublicPreviews(products:PublicProduct[],client:NonNullable<ReturnType<typeof publicClient>>):Promise<PublicProduct[]> {
  if(!products.length)return products;
  const {data,error}=await client.from('product_files').select('product_id,file_path')
    .in('product_id',products.map(p=>p.id)).eq('is_delivery_file',false)
    .order('created_at',{ascending:true});
  if(error){console.error('[Tidalis public previews] metadata unavailable',error.code);return products}
  const first=new Map<string,string>();
  for(const row of data||[]){
    if(first.has(row.product_id))continue;
    if(!row.file_path.startsWith('shops/')||!row.file_path.includes('/previews/'))continue;
    first.set(row.product_id,row.file_path);
  }
  const paths=[...first.values()];
  if(!paths.length)return products;
  const {data:signed,error:signError}=await client.storage.from('tidalis-product-files').createSignedUrls(paths,300);
  if(signError){console.error('[Tidalis public previews] signing unavailable',signError.message);return products}
  const urls=new Map<string,string>();
  [...first.entries()].forEach(([productId,path])=>{
    const result=signed?.find(s=>s.path===path);
    if(result?.signedUrl)urls.set(productId,result.signedUrl);
  });
  return products.map(p=>({...p,previewUrl:urls.get(p.id)||null}));
}

export async function getPublicProducts(options: {limit?:number; type?:PublicProductType; shopId?:string} = {}): Promise<PublicProduct[]> {
  const client = publicClient();
  if (!client) throw new CatalogUnavailableError();
  const limit = Math.min(60, Math.max(1, options.limit ?? 24));
  let query = client.from('products')
    .select(PRODUCT_SELECTION)
    .eq('status','published').eq('shop.status','active')
    .order('created_at',{ascending:false}).limit(limit);
  if (options.type) query = query.eq('product_type', options.type);
  if (options.shopId) query = query.eq('shop_id',options.shopId);
  const {data,error} = await query;
  if (error) { console.error('[Tidalis public catalog] read failed', error.code); throw new CatalogUnavailableError(); }
  const visible=(data ?? []).flatMap(record => {
    const product = normalizeProduct(record as unknown as RecordLike);
    return product ? [product] : [];
  });
  return withPublicPreviews(visible,client);
}

export async function getPublicCatalogPage(query: CatalogQuery = {}, shopId?: string) {
  const filters=catalogFilters(query);
  const client=publicClient();
  if(!client)throw new CatalogUnavailableError();
  const {data,error}=await client.rpc('search_public_products',{
    p_search:filters.q,p_type:filters.type,p_sort:filters.sort,p_page:filters.page,p_page_size:24,p_shop_id:shopId??null
  });
  if(error||!data||!Array.isArray(data.items)||!Number.isSafeInteger(data.total)||data.total<0){
    console.error('[Tidalis public catalog] search unavailable',error?.code??'invalid-response');
    throw new CatalogUnavailableError();
  }
  const products=(data.items as RecordLike[]).flatMap(row=>{const product=normalizeProduct(row);return product?[product]:[]});
  return {products:await withPublicPreviews(products,client),total:data.total as number,pageSize:24,filters};
}

export async function getPublicProductByRoute(routeSlug: string): Promise<PublicProduct | null> {
  // Require a UUID suffix: a product slug alone isn't globally unique across shops.
  const match = routeSlug.match(/^(.+)--([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (!match) return null;
  const client = publicClient();
  if (!client) throw new CatalogUnavailableError();
  const {data,error} = await client.from('products').select(PRODUCT_SELECTION)
    .eq('id',match[2]).eq('slug',match[1])
    .eq('status','published').eq('shop.status','active').maybeSingle();
  if (error) { console.error('[Tidalis public product] read failed',error.code); throw new CatalogUnavailableError(); }
  const normalized=data ? normalizeProduct(data as unknown as RecordLike) : null;
  if(!normalized)return null;
  return (await withPublicPreviews([normalized],client))[0]||null;
}

export async function getPublicShop(slug: string): Promise<PublicShop | null> {
  const client = publicClient();
  if (!client) throw new CatalogUnavailableError();
  const {data,error} = await client.from('shops')
    .select('id,slug,name,description').eq('slug',slug).eq('status','active').maybeSingle();
  if (error) { console.error('[Tidalis public shop] read failed',error.code); throw new CatalogUnavailableError(); }
  return data ? {id:data.id,slug:data.slug,name:data.name,description:data.description ?? ''} : null;
}

/** Only active shops are indexed. Uses a cookie-free anon client and a public-column allowlist. */
export type PublicArtistDirectoryResult = {
  shops: PublicShop[];
  total: number;
  unavailable: boolean;
};

export async function getPublicArtists(options: {page?: number; pageSize?: number; search?: string} = {}): Promise<PublicArtistDirectoryResult> {
  const client = publicClient();
  if (!client) return { shops: [], total: 0, unavailable: true };
  const pageSize = Math.min(24, Math.max(1, Math.trunc(options.pageSize ?? 12)));
  const page = Math.min(10000, Math.max(1, Math.trunc(options.page ?? 1)));
  const search = (options.search ?? '').trim().slice(0, 80);
  let query = client.from('shops')
    .select('id,slug,name,description', {count: 'exact'})
    .eq('status', 'active');
  // Escape SQL LIKE wildcards so a user's search is treated as text.
  if (search) query = query.ilike('name', `%${search.replace(/[%_\\]/g, '\\$&')}%`);
  const {data, count, error} = await query.order('created_at', {ascending: false}).order('id', {ascending: false})
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) {
    console.error('[Tidalis artist directory] read failed', error.code);
    return {shops: [], total: 0, unavailable: true};
  }
  return {
    shops: (data ?? []).map(shop => ({
      id: shop.id, slug: shop.slug, name: shop.name, description: shop.description ?? ''
    })),
    total: count ?? 0,
    unavailable: false
  };
}
