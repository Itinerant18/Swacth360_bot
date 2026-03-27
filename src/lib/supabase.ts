import 'server-only';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Force IPv4 + Google DNS (local DNS server refuses *.supabase.co)
dns.setDefaultResultOrder('ipv4first');

const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);

// Custom DNS lookup using Google DNS
function customLookup(
    hostname: string,
    _opts: unknown,
    cb: (err: Error | null, address?: string, family?: number) => void
) {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}

// Agent with custom DNS + IPv4
const agent = new Agent({
    connect: {
        family: 4,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lookup: customLookup as any, // Agent requires specific lookup signature
    },
});

// Custom fetch using our agent
const customFetch = (input: string | URL | Request, init?: RequestInit) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return undiciFetch(input as any, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(init as any),
        dispatcher: agent,
    }) as unknown as Promise<Response>;
};

// Singleton Supabase client — created once, reused for all requests
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: { persistSession: false },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                global: { fetch: customFetch as any },
            }
        );
    }
    return _supabase;
}

// Export for use in scripts
export { customFetch };
