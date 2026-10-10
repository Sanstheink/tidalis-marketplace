import Link from 'next/link';
import {ArrowUpRight, Palette, Sparkles} from 'lucide-react';
import type {PublicShop} from '@/lib/public-catalog-shared';

/** Public shop identity only. Never show private seller contact, files or payment info. */
export function ArtistCard({shop, featured = false}:{shop:PublicShop; featured?:boolean}) {
  return <Link href={`/shops/${encodeURIComponent(shop.slug)}`} className={`artist-directory-card${featured ? ' artist-directory-featured' : ''}`}>
    <div className="artist-directory-cover" aria-hidden="true">
      <span className="artist-directory-orbit"/><Sparkles className="artist-directory-sparkle" size={33}/>
      <span className="artist-directory-sigil"><Palette size={31}/></span>
    </div>
    <div className="artist-directory-info">
      <div className="artist-directory-meta">TIDALIS CREATOR <span>✦</span> ACTIVE SHOP</div>
      <div className="artist-directory-title"><h3>{shop.name}</h3><ArrowUpRight size={19} aria-hidden="true"/></div>
      <p>{shop.description?.trim() || 'พบกับผลงานสร้างสรรค์และพื้นที่ของศิลปินบน Tidalis'}</p>
      <span className="artist-directory-visit">เยี่ยมชมร้าน <ArrowUpRight size={15}/></span>
    </div>
  </Link>;
}
