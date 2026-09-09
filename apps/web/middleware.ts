import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Route protection and session refresh.
 *
 * This is a convenience layer only: it redirects signed-out users to /login so
 * they never see an empty shell. Actual authorization is enforced by the Node
 * API on every request — nothing here is load-bearing for security.
 */

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/auth'];

const IS_DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';

/**
 * Paths this middleware must never touch.
 *
 * The API is served from this same origin in production (a Netlify Function
 * behind an /api/* redirect), so without this guard the middleware would
 * intercept every API call, find no session cookie on a bearer-token request,
 * and redirect it to the login page — turning a JSON API into 307s to HTML.
 *
 * The matcher below already excludes them, so this is belt-and-braces: a
 * regex that stops matching should degrade to "API still works", not "API
 * silently redirects".
 */
function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname === '/health' ||
    pathname.startsWith('/health/') ||
    pathname.startsWith('/.netlify/')
  );
}

export async function middleware(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Demo mode has no Supabase project to talk to, so there is no session to
  // check and nothing to redirect. Every route renders from fixtures.
  if (IS_DEMO_MODE) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  // Refreshes an expiring token and writes the new cookie onto the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    // Preserve where they were headed so sign-in lands them there.
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && pathname === '/login') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except the API, the health endpoint, Netlify's own function
    // paths, and static assets. The API shares this origin in production, so
    // excluding it here is what keeps it an API rather than a redirect.
    '/((?!api/|health(?:$|/)|\\.netlify/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
