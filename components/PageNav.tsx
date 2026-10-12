import Link from 'next/link';
import {pageHref} from '@/lib/pagination';
export default function PageNav({path,page,total,pageSize=25,params={},queryKey='page',label='หน้ารายการ'}:{path:string;page:number;total:number;pageSize?:number;params?:Record<string,string|undefined>;queryKey?:string;label?:string}){
 const pages=Math.max(1,Math.ceil(total/pageSize));
 return <nav className="catalog-pagination" aria-label={label}>
  {page>1?<Link className="btn btn-outline" href={pageHref(path,page-1,params,queryKey)}>หน้าก่อนหน้า</Link>:null}
  <span>{label} {page} / {pages} · {total.toLocaleString('th-TH')} รายการ</span>
  {page<pages?<Link className="btn btn-outline" href={pageHref(path,page+1,params,queryKey)}>หน้าถัดไป</Link>:null}
  {page>pages?<Link className="btn btn-outline" href={pageHref(path,1,params,queryKey)}>กลับหน้าแรก</Link>:null}
 </nav>;
}
