import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

async function cleanupStalledBuilds() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧹 Investigating RAPTOR build logs...');

    const { data: logs, error: fetchError } = await supabase
        .from('raptor_build_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(5);

    if (fetchError) {
        console.error('❌ Error fetching logs:', fetchError.message);
        return;
    }

    console.log('\nLast 5 Build Logs:');
    console.table(logs.map(l => ({
        id: l.id,
        status: l.status,
        started: l.started_at,
        error: l.error_msg || 'none'
    })));

    const running = logs.filter(l => l.status === 'running');
    if (running.length > 0) {
        console.log(`\nFound ${running.length} running build(s). Cleaning up...`);
        const { error: updateError } = await supabase
            .from('raptor_build_log')
            .update({ 
                status: 'failed', 
                error_msg: 'Stalled build cleaned up (manual reset)',
                completed_at: new Date().toISOString() 
            })
            .eq('status', 'running');

        if (updateError) {
            console.error('❌ Error updating logs:', updateError.message);
        } else {
            console.log('✅ Cleaned up all running builds.');
        }
    } else {
        console.log('\nNo running builds found.');
    }
}

cleanupStalledBuilds();
