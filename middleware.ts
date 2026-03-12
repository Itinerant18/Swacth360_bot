/**
 * middleware.ts  (root of project, next to package.json)
 *
 * Refreshes Supabase session cookies on every request.
 * Route protection is handled at the component level, NOT here.
 *
 * The root `/` is intentionally PUBLIC — it shows a guest chat experience
 * with a "Sign In" button. Users can use the chat as a guest.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that are accessible without auth (do not redirect)
const PUBLIC_PATHS = [
  '/',              // Guest chat — intentionally public
  '/login',
  '/auth/callback',
  '/reset-password',
  '/api/',          // All API routes stay open (chat API needs to work)
  '/_next/',
  '/favicon.ico',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow /admin without auth
  if (pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // ── Initialize Supabase Server Client for Middleware ───────────────────────
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Check for the user session (also refreshes it if needed and updates cookies)
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // No user session — redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
