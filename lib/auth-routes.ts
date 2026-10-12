/** Accept only same-origin paths for post-auth navigation; never trust `next` from a URL. */
export function safeNextPath(value: string | null | undefined, fallback = '/account'): string {
  if (!value || value.length > 500 || !value.startsWith('/') || value.startsWith('//') || /%2f|%5c/i.test(value) || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const base = 'https://tidalis.local';
    const resolved = new URL(value, base);
    if (resolved.origin !== base || resolved.pathname.startsWith('/auth/')) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch { return fallback; }
}
export function hasVerifiedEmail(user: {email_confirmed_at?: string | null} | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at);
}
