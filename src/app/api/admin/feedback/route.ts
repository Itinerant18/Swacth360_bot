/**
 * src/app/api/admin/feedback/route.ts
 * 
 * API endpoint for retrieval feedback
 * Allows users to rate retrieval results to improve the system
 */

import { NextRequest, NextResponse } from 'next/server';
import { submitFeedback } from '@/lib/knowledge-graph';
import { getSupabase } from '@/lib/supabase';
import { recordFeedback } from '@/lib/feedback-reranker';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    try {
        const body = await request.json();
        const { queryText, resultId, rating, isRelevant, feedbackText } = body;
        console.info('[admin.feedback.post] request', { resultId, rating });

        // Validate required fields
        if (!queryText || !resultId || rating === undefined) {
            return NextResponse.json(
                { error: 'Missing required fields: queryText, resultId, rating' },
                { status: 400 }
            );
        }

        // Validate rating range
        if (rating < 1 || rating > 5) {
            return NextResponse.json(
                { error: 'Rating must be between 1 and 5' },
                { status: 400 }
            );
        }

        // Submit feedback to knowledge graph
        await submitFeedback(queryText, resultId, rating, isRelevant ?? null, feedbackText);

        // Update feedback-driven reranking scores
        // Rating 1-2 = negative, 4-5 = positive, 3 = neutral
        if (rating !== 3) {
            void recordFeedback(resultId, rating >= 4, queryText);
        }

        return NextResponse.json({
            success: true,
            message: 'Feedback submitted successfully'
        });
    } catch (error) {
        console.error('[admin.feedback.post] error', error);
        return NextResponse.json(
            { error: 'Failed to submit feedback' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    try {
        const searchParams = request.nextUrl.searchParams;
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
        const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
        const supabase = getSupabase();
        console.info('[admin.feedback.get] request', { limit, offset });

        const { data, error, count } = await supabase
            .from('retrieval_feedback')
            .select('id, query_text, result_id, rating, is_relevant, feedback_text, created_at', {
                count: 'exact',
            })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            feedback: data ?? [],
            total: count ?? 0,
            limit,
            offset,
        });
    } catch (error) {
        console.error('[admin.feedback.get] error', error);
        return NextResponse.json(
            { error: 'Failed to fetch feedback' },
            { status: 500 }
        );
    }
}
