import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowLeft, ArrowRight, Search, Store, Sparkles} from 'lucide-react';
import {ArtistCard} from '@/components/ArtistCard';
import {getPublicArtists} from '@/lib/public-catalog';

export const metadata:Metadata = {
  title: 'ร้านค้าศิลปิน',
  description: 'ค้นพบร้านค้าศิลปินที่เปิดให้เข้าชมบน Marketplace Tidalis',
};
export const dynamic = 'force-dynamic';
const PAGE_SIZE = 12;

function directoryHref(page:number, search:string) {
  const params = new URLSearchParams();
  if (search) params.set('q',search);
  if (page > 1) params.set('page',String(page));
  const qs=params.toString();
  return `/artists${qs ? `?${qs}` : ''}`;
}

export default async function ArtistsPage({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}) {
  const params = await searchParams;
  const search = typeof params.q === 'string' ? params.q.trim().slice(0,80) : '';
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage,10000) : 1;
  const {shops,total,unavailable} = await getPublicArtists({page,pageSize:PAGE_SIZE,search});
  const totalPages = Math.max(1,Math.ceil(total/PAGE_SIZE));
  const hasOutOfRangePage = page > totalPages && total > 0;

  return <div className="container page-pad artist-directory-page">
    <header className="artist-directory-heading">
      <div>
        <div className="eyebrow"><Sparkles size={13}/> THE CREATIVE COMMUNITY</div>
        <h1>Discover our <em>artists.</em></h1>
        <p>รู้จักร้านค้าศิลปินบน Tidalis และค้นพบผลงานจากผู้สร้างสรรค์ที่คุณชื่นชอบ</p>
      </div>
      <Link className="btn btn-ghost" href="/sell/apply">สมัครเปิดร้าน <ArrowRight size={16}/></Link>
    </header>

    <form action="/artists" method="get" className="artist-directory-search" role="search">
      <label htmlFor="artist-search"><Search size={19}/><span className="sr-only">ค้นหาชื่อร้านศิลปิน</span></label>
      <input id="artist-search" type="search" name="q" maxLength={80} placeholder="ค้นหาชื่อร้านศิลปิน..." defaultValue={search}/>
      <button type="submit" className="btn btn-primary">ค้นหาร้าน</button>
      {search && <Link href="/artists" className="artist-search-clear">ล้างคำค้น</Link>}
    </form>

    {unavailable ? <div className="artist-directory-empty" role="status">
      <Store size={40}/><h2>ยังโหลดข้อมูลร้านค้าไม่ได้</h2>
      <p>กรุณาลองใหม่อีกครั้ง หรือแจ้งผู้ดูแลให้ตรวจการเชื่อมต่อ Supabase</p>
      <Link href="/artists" className="btn btn-ghost">ลองใหม่</Link>
    </div> : total === 0 ? <div className="artist-directory-empty" role="status">
      <div className="artist-directory-empty-symbol"><Store size={38}/></div>
      <h2>{search ? 'ไม่พบร้านที่ตรงกับคำค้น' : 'เรื่องราวของศิลปินกำลังจะเริ่มต้น'}</h2>
      <p>{search ? 'ลองเปลี่ยนชื่อร้านหรือดูรายชื่อร้านทั้งหมด' : 'ยังไม่มีร้านศิลปินที่เปิดให้เข้าชมในขณะนี้ กลับมาพบผู้สร้างสรรค์คนแรกของ Tidalis ได้เร็ว ๆ นี้'}</p>
      <Link href={search ? '/artists' : '/sell/apply'} className="btn btn-ghost">{search ? 'ดูร้านทั้งหมด' : 'สนใจเปิดร้านบน Tidalis'} <ArrowRight size={16}/></Link>
    </div> : hasOutOfRangePage ? <div className="artist-directory-empty" role="status">
      <Store size={35}/><h2>ไม่พบหน้าที่เลือก</h2>
      <Link className="btn btn-ghost" href={directoryHref(totalPages,search)}>ไปหน้าสุดท้าย</Link>
    </div> : <>
      <div className="artist-directory-count"><strong>{total.toLocaleString('th-TH')}</strong> ร้านศิลปินที่เปิดให้เข้าชม{search ? ' ตรงกับคำค้น' : ''}</div>
      <div className={`artist-directory-grid${total === 1 ? ' artist-directory-single' : ''}`}>
        {shops.map(shop=><ArtistCard key={shop.id} shop={shop} featured={total===1}/>)}
      </div>
      {totalPages > 1 && <nav className="artist-directory-pages" aria-label="หน้ารายชื่อศิลปิน">
        {page > 1 ? <Link href={directoryHref(page-1,search)}><ArrowLeft size={16}/> ก่อนหน้า</Link> : <span/>}
        <span>หน้า {page.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}</span>
        {page < totalPages ? <Link href={directoryHref(page+1,search)}>ถัดไป <ArrowRight size={16}/></Link> : <span/>}
      </nav>}
    </>}
  </div>;
}
