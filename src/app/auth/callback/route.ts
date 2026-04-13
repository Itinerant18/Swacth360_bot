/**
 * src/app/auth/callback/route.ts
 *
 * Handles email confirmation and password-reset redirects from Supabase.
 * After user confirms their email, they are redirected here.
 * We exchange the token and redirect appropriately.
 *
 * Admin users are routed to /admin after login —
 * but that routing happens on the login page after signInWithPassword, not here.
 * The callback just confirms the email and sends them back to /login.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAdminEmail } from '@/lib/admin-emails';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'magiclink' | 'email' | 'recovery' | null;
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

    // ── PKCE code exchange ───────────────────────────────────────────────────
    if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) sessionError = error.message;
        else userEmail = data.session?.user?.email ?? null;
    }
    // ── token_hash (email confirmation / recovery link) ──────────────────────
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

    if (!userEmail) {
        return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    // ── Password reset flow → redirect to reset-password page ────────────────
    if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`);
    }

    // ── Email confirmed → redirect appropriately ─────────────────────────────
    const isAdmin = isAdminEmail(userEmail, process.env.ALLOWED_ADMIN_EMAILS ?? '');

    // For normal signUp confirmation: sign them out so they have to log in with password
    if (type === 'signup' || type === 'email') {
        await supabase.auth.signOut();
        return NextResponse.redirect(
            `${origin}/login?confirmed=1`
        );
    }

    // For code-based (PKCE) — already signed in, route by role
    return NextResponse.redirect(`${origin}${isAdmin ? '/admin' : next}`);
}
