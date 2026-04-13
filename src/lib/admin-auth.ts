/**
 * src/lib/admin-auth.ts
 *
 * Server-side admin authorization guard.
 * Import and call at the top of every /api/admin/* route handler.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/auth-server';
import { isAdminEmail } from '@/lib/admin-emails';

export interface AdminAuthResult {
    authorized: boolean;
    response?: NextResponse;
    userId?: string;
    email?: string;
}

/**
 * Call at the TOP of every admin route handler.
 *
 * Usage:
 *   const auth = await requireAdmin();
 *   if (!auth.authorized) return auth.response;
 *   // ... rest of handler
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
    try {
        const supabase = await createServerSupabaseClient();
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();

        if (error || !user) {
            return {
                authorized: false,
                response: NextResponse.json(
                    { error: 'Authentication required' },
                    { status: 401 },
                ),
            };
        }

        if (!isAdminEmail(user.email, process.env.ALLOWED_ADMIN_EMAILS ?? '')) {
            return {
                authorized: false,
                response: NextResponse.json(
                    { error: 'Admin access required' },
                    { status: 403 },
                ),
            };
        }

        return {
            authorized: true,
            userId: user.id,
            email: user.email!,
        };
    } catch {
        return {
            authorized: false,
            response: NextResponse.json(
                { error: 'Authentication failed' },
                { status: 401 },
            ),
        };
    }
}
