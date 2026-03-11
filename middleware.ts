/**
 * middleware.ts  (root of project, next to package.json)
 *
 * Protects the chat page (/) from unauthenticated access.
 * Redirects to /login if no valid session cookie is found.
 * /admin is intentionally left unprotected.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that do NOT need auth
const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/api/',          // all API routes stay open (chat API needs to work)
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
