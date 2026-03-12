/**
 * src/middleware.ts
 *
 * Supabase SSR middleware — refreshes the session cookie on every request
 * so that server-side route handlers can read a valid session.
 *
 * IMPORTANT: This middleware does NOT protect any routes.
 * Route-level protection is handled in each page/API route individually.
 * The root `/` must remain accessible to guests (guest chat experience).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    // Write cookies into the request headers so server components pick them up
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    // Recreate the response with updated request headers
                    response = NextResponse.next({
                        request,
                    });
                    // Write the cookies into the response so the browser stores them
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh the session token — this prevents silent expiry.
    // We intentionally do NOT check the result or redirect based on it.
    await supabase.auth.getUser();

    return response;
}

// Run on all routes except static assets
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};

