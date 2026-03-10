/**
 * src/app/auth/callback/route.ts
 *
 * Handles the magic link redirect from Supabase email.
 * Supabase redirects here with ?code=... after the user clicks the email link.
 * We exchange the code for a session, set cookies, and redirect to the app.
 *
 * PKCE note: Supabase stores a code_verifier in cookies when signInWithOtp is called.
 * getAll() MUST read the real request cookies or the exchange will fail.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';

    if (code) {
        // Build the redirect response first so we can attach cookies to it
        const response = NextResponse.redirect(`${origin}${next}`);

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        // Must read real request cookies for PKCE code_verifier
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            response.cookies.set(name, value, options);
                        });
                    },
                },
            }
        );

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && data.session) {
            // Domain validation — block non-@seple.in logins
            const email = data.session.user.email ?? '';
            if (!email.endsWith('@seple.in')) {
                await supabase.auth.signOut();
                return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`);
            }

            return response;
        } else {
            console.error('Auth callback error:', error?.message);
            return NextResponse.redirect(`${origin}/login?error=auth_failed`);
        }
    }

    // No code parameter — redirect to login with error
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
}