import { getRecentMetrics, computeAggregates } from '@/lib/pipelineMetrics';
import { requireAdmin } from '@/lib/admin-auth';
import { createSseResponse } from '@/lib/sse';

function buildRealtimeMetricsPayload() {
    const recent = getRecentMetrics();

    return {
        source: 'memory',
        window: `last ${recent.length} requests`,
        ...computeAggregates(recent),
    };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            signal?.removeEventListener('abort', handleAbort);
            resolve();
        }, ms);

        const handleAbort = () => {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', handleAbort);
            resolve();
        };

        signal?.addEventListener('abort', handleAbort, { once: true });
    });
}

export async function GET(req: Request) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    return createSseResponse({
        request: req,
        meta: {
            requestId: null,
            conversationId: null,
            stream: 'admin-metrics',
            source: 'memory',
        },
        stream: async ({ send, comment, isClosed }) => {
            send('metrics', buildRealtimeMetricsPayload());

            while (!isClosed()) {
                await sleep(10000, req.signal);
                if (isClosed()) {
                    break;
                }

                comment('heartbeat');
                send('metrics', buildRealtimeMetricsPayload());
            }
        },
    });
}
