/**
 * src/lib/auth.ts
 *
 * Supabase Auth helper - Email + Password flow.
 * Open registration (any valid email).
 * Admin email: aniket.karmakar@seple.in
 */

import { createBrowserClient } from '@supabase/ssr';

export const ADMIN_EMAIL = 'aniket.karmakar@seple.in';

let _supabaseAuth: ReturnType<typeof createBrowserClient> | null = null;

// Supabase browser client
export function getSupabaseAuth() {
    if (!_supabaseAuth) {
        _supabaseAuth = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
    }

    return _supabaseAuth;
}

function isInvalidRefreshTokenMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('invalid refresh token')
        || normalized.includes('refresh token not found');
}

async function clearLocalSession(): Promise<void> {
    const supabase = getSupabaseAuth();
    try {
        await supabase.auth.signOut({ scope: 'local' });
    } catch {
        // best-effort cleanup
    }
}

/**
 * Clears stale local auth state when a refresh token is no longer valid.
 */
export async function sanitizeAuthSession(): Promise<void> {
    const supabase = getSupabaseAuth();

    try {
        const { error } = await supabase.auth.getSession();
        if (error && isInvalidRefreshTokenMessage(error.message)) {
            await clearLocalSession();
        }
    } catch (err: unknown) {
        if (isInvalidRefreshTokenMessage((err as Error).message || '')) {
            await clearLocalSession();
        }
    }
}

// Admin check
export function isAdminEmail(email: string): boolean {
    return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// Friendly error mapper
function mapAuthError(raw: string): { message: string; needsConfirmation: boolean } {
    const msg = raw.toLowerCase();
    if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
        return {
            message: 'Your email is not confirmed yet. Check your inbox for the confirmation link.',
            needsConfirmation: true,
        };
    }
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        return { message: 'Incorrect email or password.', needsConfirmation: false };
    }
    if (msg.includes('user not found') || msg.includes('no user found')) {
        return { message: 'No account found with this email. Please register first.', needsConfirmation: false };
    }
    if (msg.includes('over_email_send_rate_limit') || msg.includes('rate limit')) {
        return { message: 'Too many emails sent. Please wait a few minutes and try again.', needsConfirmation: false };
    }
    if (msg.includes('email already registered') || msg.includes('already registered')) {
        return { message: 'An account already exists with this email. Please sign in.', needsConfirmation: false };
    }
    return { message: 'Authentication failed. Please try again.', needsConfirmation: false };
}

// Register (email + password + name + phone)
export async function register(
    email: string,
    password: string,
    fullName: string,
    phone: string,
): Promise<{ error: string | null }> {
    const normalizedEmail = email.trim().toLowerCase();

    if (password.length < 8) {
        return { error: 'Password must be at least 8 characters.' };
    }
    if (!fullName.trim()) {
        return { error: 'Full name is required.' };
    }

    const supabase = getSupabaseAuth();
    const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
            data: { full_name: fullName.trim(), phone: phone.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
    });

    if (error) return { error: mapAuthError(error.message).message };
    return { error: null };
}

// Login (email + password)
export async function login(
    email: string,
    password: string,
): Promise<{ error: string | null; needsConfirmation?: boolean; redirectTo?: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const supabase = getSupabaseAuth();
    const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
    });

    if (error) {
        const { message, needsConfirmation } = mapAuthError(error.message);
        return { error: message, needsConfirmation };
    }

    const redirectTo = isAdminEmail(normalizedEmail) ? '/admin' : '/';
    return { error: null, redirectTo };
}

// Resend confirmation email
export async function resendConfirmation(
    email: string,
): Promise<{ error: string | null }> {
    const normalizedEmail = email.trim().toLowerCase();
    const supabase = getSupabaseAuth();
    const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
    });
    if (error) return { error: mapAuthError(error.message).message };
    return { error: null };
}

// Reset password
export async function resetPassword(
    email: string,
): Promise<{ error: string | null }> {
    const normalizedEmail = email.trim().toLowerCase();
    const supabase = getSupabaseAuth();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) return { error: mapAuthError(error.message).message };
    return { error: null };
}

// Sign out
export async function signOut(): Promise<void> {
    const supabase = getSupabaseAuth();
    await supabase.auth.signOut({ scope: 'local' });
}

// Get current session
export async function getSession() {
    const supabase = getSupabaseAuth();
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error && isInvalidRefreshTokenMessage(error.message)) {
            await clearLocalSession();
            return null;
        }
        return session;
    } catch (err: unknown) {
        if (isInvalidRefreshTokenMessage((err as Error).message || '')) {
            await clearLocalSession();
        }
        return null;
    }
}
