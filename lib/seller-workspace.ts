export const SELLER_SHOP_COOKIE = 'tidalis-selected-shop';
export const isShopId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** A cookie is a preference, never proof of membership. Validate against live rows. */
export function chooseSellerMembership<T extends {shop_id: string}>(members: T[], eligibleIds: string[], selected?: string) {
  const eligible = members.filter(member => eligibleIds.includes(member.shop_id));
  if (selected) return eligible.find(member => member.shop_id === selected) ?? null;
  return eligible.length === 1 ? eligible[0] : null;
}
