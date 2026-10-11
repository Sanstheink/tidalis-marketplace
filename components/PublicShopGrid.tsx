import Link from 'next/link';
import {Search,SlidersHorizontal} from 'lucide-react';
import {categories} from '@/lib/catalog';
import {catalogHref,type CatalogFilters} from '@/lib/catalog-query';
import type {PublicProduct} from '@/lib/public-catalog-shared';
import {PublicProductCard} from '@/components/PublicProductCard';

/** The URL is the source of truth; the database filters before pagination. */
export function PublicShopGrid({products,total,pageSize,filters,basePath='/shop'}:{
  products:PublicProduct[];total:number;pageSize:number;filters:CatalogFilters;basePath?:string
}) {
  const pages=Math.max(1,Math.ceil(total/pageSize));
  return <>
    <div className="shop-controls">
      <div className="filter-pills">{categories.map(category=><Link
        className={'filter-pill '+(filters.type===category.value?'active':'')}
        aria-current={filters.type===category.value?'page':undefined}
        href={catalogHref(basePath,filters,{type:category.value,page:1})} key={category.value}>{category.label}</Link>)}</div>
      <form action={basePath} className="catalog-search" key={`${filters.q}:${filters.type}:${filters.sort}`}>
        <input type="hidden" name="type" value={filters.type}/>
        <div className="search-wrap"><Search size={17}/><input name="q" aria-label="ค้นหางานศิลปะ"
          defaultValue={filters.q} maxLength={80} placeholder="ค้นหาประเภทงาน สินค้า หรือชื่อร้าน..."/></div>
        <label className="sort-wrap"><SlidersHorizontal size={16}/><select name="sort" aria-label="เรียงสินค้า" defaultValue={filters.sort}>
          <option value="featured">ล่าสุด</option><option value="low">ราคาต่ำ → สูง</option><option value="high">ราคาสูง → ต่ำ</option>
        </select></label>
        <button className="btn btn-outline" type="submit">ค้นหา</button>
      </form>
    </div>
    <p className="result-count">พบ {total} ผลงานที่เผยแพร่ · หน้า {filters.page} / {pages}</p>
    {products.length?<div className="product-grid">{products.map(product=><PublicProductCard product={product} key={product.id}/>)}</div>
      :<div className="empty-state">{total?'ไม่มีผลงานในหน้านี้':'ไม่พบสินค้าที่ตรงกับคำค้น ลองเปลี่ยนตัวกรองดูครับ'}</div>}
    {(pages>1||filters.page>1)&&<nav className="catalog-pagination" aria-label="หน้ารายการสินค้า">
      {filters.page>1&&<Link className="btn btn-outline" href={catalogHref(basePath,filters,{page:filters.page-1})}>หน้าก่อนหน้า</Link>}
      {filters.page<pages&&<Link className="btn btn-outline" href={catalogHref(basePath,filters,{page:filters.page+1})}>หน้าถัดไป</Link>}
      {filters.page>pages&&<Link className="btn btn-outline" href={catalogHref(basePath,filters,{page:1})}>กลับหน้าแรก</Link>}
    </nav>}
  </>;
}
