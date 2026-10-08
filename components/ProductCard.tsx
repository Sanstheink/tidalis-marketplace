import Link from 'next/link';
import type {Product} from '@/lib/catalog';
import {money} from '@/lib/catalog';
import {ArrowUpRight} from 'lucide-react';
export function ProductCard({product}:{product:Product}){return <Link href={`/products/${product.slug}`} className="product-card"><div className={`product-art ${product.artClass}`}><span className="art-sigil" aria-hidden>{product.artEmoji}</span><span className="art-caption">TIDALIS · ARTWORK</span>{product.exclusive&&<span className="art-ribbon">EXCLUSIVE</span>}</div><div className="product-info"><div><span className="product-type">{product.workType}</span><h3>{product.name}</h3><p>{product.shopName}</p></div><div className="product-card-bottom"><strong>{product.pricingMode==='quote'?'เริ่มต้น '+money(product.personalPrice):money(product.personalPrice)}</strong><ArrowUpRight size={19}/></div></div></Link>}
