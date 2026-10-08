import type {Metadata} from 'next';
import {ShopGrid} from '@/components/ShopGrid';
export const metadata:Metadata={title:'Shop'};
export default async function Shop({searchParams}:{searchParams:Promise<{type?:string}>}){const {type}=await searchParams;return <div className="container page-pad"><div className="page-heading"><div className="eyebrow">THE TIDALIS COLLECTION</div><h1>Discover <em>artwork.</em></h1><p>งาน Commission, Ready-made และ Digital Assets จากร้านศิลปิน</p></div><ShopGrid initialType={type||'all'}/></div>}
