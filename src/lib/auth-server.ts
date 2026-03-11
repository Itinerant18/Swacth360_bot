/**
 * src/lib/auth-server.ts
 *
 * Server-only Supabase client helper.
 * Use in API routes and server components ONLY.
 * Separated from auth.ts to avoid pulling server-only imports into client bundles.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // setAll can throw in Server Components — safe to ignore
                    }
                },
            },
        }
    );
}
