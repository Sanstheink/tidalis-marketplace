'use client';
import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { categories } from '@/lib/catalog';
import type { PublicProduct } from '@/lib/public-catalog-shared';
import { PublicProductCard } from '@/components/PublicProductCard';

export function PublicShopGrid({products,initialType='all'}:{products:PublicProduct[];initialType?:string}) {
  const [type,setType] = useState(initialType);
  const [search,setSearch] = useState('');
  const [sort,setSort] = useState('featured');
  const matching = useMemo(() => products.filter(p =>
    (type==='all' || p.productType===type) &&
    `${p.name} ${p.workType} ${p.shopName}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ).sort((a,b) => {
    const priceA=Math.min(...a.licenses.map(l=>l.priceMinor));
    const priceB=Math.min(...b.licenses.map(l=>l.priceMinor));
    return sort==='low'?priceA-priceB:sort==='high'?priceB-priceA:0;
  }),[products,type,search,sort]);
  return <><div className="shop-controls"><div className="filter-pills">{categories.map(c=><button type="button" className={'filter-pill '+(type===c.value?'active':'')} onClick={()=>setType(c.value)} key={c.value}>{c.label}</button>)}</div>
    <div className="search-wrap"><Search size={17}/><input aria-label="ค้นหางานศิลปะ" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาประเภทงาน สินค้า หรือชื่อร้าน..."/></div>
    <label className="sort-wrap"><SlidersHorizontal size={16}/><select aria-label="เรียงสินค้า" value={sort} onChange={e=>setSort(e.target.value)}><option value="featured">ล่าสุด</option><option value="low">ราคาต่ำ → สูง</option><option value="high">ราคาสูง → ต่ำ</option></select></label>
  </div><p className="result-count">พบ {matching.length} ผลงานที่เผยแพร่</p>
  {matching.length ? <div className="product-grid">{matching.map(p=><PublicProductCard product={p} key={p.id}/>)}</div> : <div className="empty-state">{products.length ? 'ไม่พบสินค้าที่ตรงกับคำค้น ลองเปลี่ยนตัวกรองดูครับ' : 'ยังไม่มีผลงานที่เปิดเผยแพร่บน Tidalis กรุณากลับมาดูอีกครั้ง'}</div>}
  </>;
}
