export type PublicProductType = 'commission' | 'ready_made' | 'digital_asset';
export type PublicLicense = { usageType: 'personal' | 'commercial'; priceMinor: number; terms: string };
export type PublicProduct = {
  id: string; slug: string; name: string; description: string;
  productType: PublicProductType; pricingMode: 'quote' | 'fixed';
  shopId: string; shopSlug: string; shopName: string;
  workType: string; exclusive: boolean; stock: number | null;
  currency?: string; licenses: PublicLicense[]; previewUrl?: string | null;
};
export type PublicShop = { id: string; slug: string; name: string; description: string };


export function publicProductHref(product: PublicProduct) {
  // Slugs are only unique per shop, so append the immutable UUID to avoid collisions.
  return `/products/${encodeURIComponent(product.slug)}--${product.id}`;
}
export const publicPrice = (minor: number,currency='THB') => new Intl.NumberFormat('th-TH', { style:'currency', currency:['THB','USD','LAK'].includes(currency)?currency:'THB',minimumFractionDigits:2,maximumFractionDigits:2 }).format(minor / 100);
