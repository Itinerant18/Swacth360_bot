import { NextResponse } from 'next/server';
import { getPerformanceSummary } from '@/lib/logger';

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const windowHours = Math.min(
            Math.max(Number.parseInt(url.searchParams.get('hours') || '24', 10), 1),
            24 * 30,
        );

        const data = await getPerformanceSummary(windowHours);
        return NextResponse.json(data);
    } catch (err) {
        console.error('[admin.performance] error', err);
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
