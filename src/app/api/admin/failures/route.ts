import { NextResponse } from 'next/server';
import { getFailureSummary } from '@/lib/logger';

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const limit = Math.min(
            Math.max(Number.parseInt(url.searchParams.get('limit') || '50', 10), 1),
            200,
        );

        const data = await getFailureSummary(limit);
        return NextResponse.json(data);
    } catch (err) {
        console.error('[admin.failures] error', err);
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
