import type {Metadata} from 'next';
import {PublicShopGrid} from '@/components/PublicShopGrid';
import {getPublicCatalogPage} from '@/lib/public-catalog';
import type {CatalogQuery} from '@/lib/catalog-query';
export const metadata:Metadata={title:'Shop'};
export const dynamic='force-dynamic';
export default async function Shop({searchParams}:{searchParams:Promise<CatalogQuery>}){
  const result=await getPublicCatalogPage(await searchParams);
  return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">THE TIDALIS COLLECTION</div><h1>Discover <em>artwork.</em></h1><p>ผลงานที่เผยแพร่แล้วจากร้านที่เปิดให้บริการ · สินค้าที่ยังเป็น Draft จะไม่แสดง</p></div><PublicShopGrid {...result}/></div>;
}
