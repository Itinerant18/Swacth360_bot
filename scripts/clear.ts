import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';

dns.setDefaultResultOrder('ipv4first');

const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);

function customLookup(hostname: string, _opts: unknown, cb: (err: Error | null, address?: string, family?: number) => void) {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}

const agent = new Agent({ connect: { family: 4, lookup: customLookup as never } });
const customFetch = (input: unknown, init?: unknown) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: agent } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;

const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function clearDatabase() {
    console.log('🧹 Starting cleanup process...');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    }

    console.log('🗄️  Connecting to Supabase...');
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch },
    });

    console.log('🗑️  Deleting all vectors from "hms_knowledge"...');

    try {
        const { error } = await supabase
            .from('hms_knowledge')
            .delete()
            .not('id', 'is', null);

        if (error) throw error;

        console.log('✅ Database cleared successfully!');
    } catch (err) {
        console.error('❌ Error clearing database:', err);
    }
}

clearDatabase().catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
