import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { publicPrice, publicProductHref, type PublicProduct } from '@/lib/public-catalog-shared';

const categoryLabels = {commission:'Commission',ready_made:'Ready-made',digital_asset:'Digital Asset'};
export function PublicProductCard({product}:{product:PublicProduct}) {
  const startingPrice = Math.min(...product.licenses.map(l => l.priceMinor));
  return <Link href={publicProductHref(product)} className="product-card live-product-card">
    <div className={`product-art live-product-art live-product-${product.productType}`}>
      {product.previewUrl&&<img src={product.previewUrl} alt={`ภาพตัวอย่างของ ${product.name}`} className="phase58-art-image" loading="lazy"/>}
      {!product.previewUrl&&<span className="live-art-symbol" aria-hidden="true">{product.productType === 'commission' ? '✧' : product.productType === 'digital_asset' ? '◇' : '✦'}</span>}
      {!product.previewUrl&&<span className="live-placeholder-caption">ยังไม่มีภาพตัวอย่าง</span>}<span className="art-caption">TIDALIS · {categoryLabels[product.productType].toUpperCase()}</span>
      {product.exclusive && <span className="art-ribbon">EXCLUSIVE</span>}
    </div>
    <div className="product-info"><div><span className="product-type">{product.workType}</span><h3>{product.name}</h3><p>{product.shopName}</p></div>
      <div className="product-card-bottom"><strong>{product.pricingMode==='quote'?'เริ่มต้น ':''}{publicPrice(startingPrice,product.currency)}</strong><ArrowUpRight size={19}/></div>
    </div>
  </Link>;
}
