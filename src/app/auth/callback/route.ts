/**
 * src/app/auth/callback/route.ts
 *
 * Handles email confirmation redirect from Supabase.
 * After user confirms their email, they are redirected here.
 * We exchange the token, validate the domain, and redirect to login.
 *
 * Admin email (aniket.karmakar@seple.in) is routed to /admin after login —
 * but that routing happens on the login page after signInWithPassword, not here.
 * The callback just confirms the email and sends them back to /login.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ALLOWED_DOMAIN = '@seple.in';
const ADMIN_EMAIL = 'aniket.karmakar@seple.in';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'magiclink' | 'email' | null;
    const next = searchParams.get('next') ?? '/';

    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
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

    let userEmail: string | null = null;
    let sessionError: string | null = null;

    // ── PKCE code exchange (signInWithPassword after confirmation) ────────────
    if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) sessionError = error.message;
        else userEmail = data.session?.user?.email ?? null;
    }
    // ── token_hash (email confirmation link from signUp) ──────────────────────
    else if (tokenHash && type) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) sessionError = error.message;
        else userEmail = data.session?.user?.email ?? null;
    } else {
        return NextResponse.redirect(`${origin}/login?error=missing_code`);
    }

    if (sessionError) {
        console.error('Auth callback error:', sessionError);
        return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    // ── Domain check ──────────────────────────────────────────────────────────
    if (!userEmail || !userEmail.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`);
    }

    // ── Email confirmed → redirect appropriately ──────────────────────────────
    // If admin and session was created (rare: only if they confirm via magic link)
    const isAdmin = userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // For normal signUp confirmation: sign them out so they have to log in with password
    // This gives them the proper password-based session
    if (type === 'signup' || type === 'email') {
        await supabase.auth.signOut();
        return NextResponse.redirect(
            `${origin}/login?confirmed=1`
        );
    }

    // For code-based (PKCE) — already signed in, route by role
    return NextResponse.redirect(`${origin}${isAdmin ? '/admin' : '/'}`);
}