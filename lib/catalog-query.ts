export type CatalogQuery = {q?: string | string[]; type?: string | string[]; sort?: string | string[]; page?: string | string[]};
const text = (value?: string | string[]) => typeof value === 'string' ? value : '';
export function catalogFilters(query: CatalogQuery = {}) {
  const rawPage=text(query.page);
  return {
    q:text(query.q).trim().slice(0,80),
    type:['commission','ready_made','digital_asset'].includes(text(query.type)) ? text(query.type) : 'all',
    sort:['low','high'].includes(text(query.sort)) ? text(query.sort) : 'featured',
    page:/^[0-9]+$/.test(rawPage) ? Math.min(10000,Math.max(1,Number(rawPage))) : 1
  };
}
export type CatalogFilters = ReturnType<typeof catalogFilters>;
export function catalogHref(basePath: string, filters: CatalogFilters, changes: Partial<CatalogFilters> = {}) {
  const next={...filters,...changes};
  const params=new URLSearchParams();
  if(next.q)params.set('q',next.q);
  if(next.type!=='all')params.set('type',next.type);
  if(next.sort!=='featured')params.set('sort',next.sort);
  if(next.page>1)params.set('page',String(next.page));
  return basePath+(params.size?'?'+params.toString():'');
}
