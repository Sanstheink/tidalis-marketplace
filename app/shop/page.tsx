import type {Metadata} from 'next';
import {PublicShopGrid} from '@/components/PublicShopGrid';
import {getPublicProducts} from '@/lib/public-catalog';
export const metadata:Metadata={title:'Shop'};
export const dynamic='force-dynamic';
export default async function Shop({searchParams}:{searchParams:Promise<{type?:string}>}){
  const {type}=await searchParams;
  const products=await getPublicProducts({limit:60});
  return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">THE TIDALIS COLLECTION</div><h1>Discover <em>artwork.</em></h1><p>ผลงานที่เผยแพร่แล้วจากร้านที่เปิดให้บริการ · สินค้าที่ยังเป็น Draft จะไม่แสดง</p></div><PublicShopGrid products={products} initialType={type||'all'}/></div>;
}
