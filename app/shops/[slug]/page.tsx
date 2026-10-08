import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ShopGrid} from '@/components/ShopGrid';
import {shop} from '@/lib/catalog';
import {MapPin,ShieldCheck} from 'lucide-react';
export default async function ShopPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;if(slug!==shop.slug)notFound();return <div className="container page-pad"><div className="shop-cover"><div className="shop-logo">✦</div></div><div className="shop-profile"><div><div className="eyebrow">INDEPENDENT CREATOR · THAILAND</div><h1>{shop.name}</h1><p>{shop.subtitle}</p><div className="shop-trust"><ShieldCheck size={15}/> ร้านตัวอย่างในเวอร์ชันพัฒนา · <MapPin size={15}/> Thailand</div></div><Link href="/policies/payment-refund" className="btn btn-ghost">อ่านนโยบายร้าน (ตัวอย่าง)</Link></div><div className="section-top"><div><h2>Artwork collection</h2><p>สินค้าตัวอย่างที่กำหนดราคาและ License โดยร้าน</p></div></div><ShopGrid/></div>}
