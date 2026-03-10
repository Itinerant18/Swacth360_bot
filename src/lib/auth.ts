/**
 * src/lib/auth.ts
 *
 * Supabase Auth helper with @seple.in domain enforcement.
 * Uses the browser client for client-side auth flows.
 */

import { createBrowserClient } from '@supabase/ssr';

const ALLOWED_DOMAIN = '@seple.in';

// ─── Supabase browser client ──────────────────────────────────────────────────
export function getSupabaseAuth() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

// ─── Domain check ─────────────────────────────────────────────────────────────
export function isAllowedEmail(email: string): boolean {
    return email.trim().toLowerCase().endsWith(ALLOWED_DOMAIN);
}

// ─── Send magic link ──────────────────────────────────────────────────────────
export async function sendMagicLink(email: string): Promise<{ error: string | null }> {
    if (!isAllowedEmail(email)) {
        return { error: `Only ${ALLOWED_DOMAIN} email addresses are allowed.` };
    }

    const supabase = getSupabaseAuth();
    const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
    });

    if (error) return { error: error.message };
    return { error: null };
}

// ─── Sign out ─────────────────────────────────────────────────────────────────
export async function signOut(): Promise<void> {
    const supabase = getSupabaseAuth();
    await supabase.auth.signOut();
}

// ─── Get current session ──────────────────────────────────────────────────────
export async function getSession() {
    const supabase = getSupabaseAuth();
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}