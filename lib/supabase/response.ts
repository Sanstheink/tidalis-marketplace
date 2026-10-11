import {NextRequest, NextResponse} from 'next/server';
import type {CookieOptions} from '@supabase/ssr';

/** Keep refreshed cookies and the SSR SDK's cache protections on the same response. */
export function updateSessionResponse(
  request: NextRequest,
  previous: NextResponse,
  cookies: {name: string; value: string; options: CookieOptions}[],
  headers: Record<string, string>,
) {
  for (const {name, value} of cookies) request.cookies.set(name, value);
  const response = NextResponse.next({request});
  previous.headers.forEach((value, name) => {
    if (name !== 'set-cookie' && !name.startsWith('x-middleware-')) response.headers.set(name, value);
  });
  for (const cookie of previous.cookies.getAll()) response.cookies.set(cookie);
  for (const {name, value, options} of cookies) response.cookies.set(name, value, options);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export function preventAuthCaching<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0');
  response.headers.set('Expires', '0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
