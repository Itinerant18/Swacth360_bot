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

type FeedbackBody = {
    queryText?: unknown;
    resultId?: unknown;
    rating?: unknown;
    isRelevant?: unknown;
    feedbackText?: unknown;
};

type KnowledgeLookupRow = {
    id: string;
    question: string | null;
    category: string | null;
    source_name: string | null;
};

type FeedbackRow = {
    id: string;
    query_text: string;
    result_id: string;
    rating: number;
    is_relevant: boolean | null;
    feedback_text?: string | null;
    created_at: string;
};

function getFeedbackErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Failed to submit feedback';
    const normalized = message.toLowerCase();

    if (normalized.includes('foreign key') || normalized.includes('violates')) {
        return 'Feedback must reference a valid knowledge base entry.';
    }

    if (normalized.includes('invalid input syntax') || normalized.includes('invalid id')) {
        return 'Invalid feedback result ID.';
    }

    return message;
}

function getFeedbackErrorStatus(error: unknown): number {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (
        message.includes('foreign key')
        || message.includes('violates')
        || message.includes('invalid input syntax')
        || message.includes('invalid id')
    ) {
        return 400;
    }

    return 500;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as FeedbackBody;
        const queryText = typeof body.queryText === 'string' ? body.queryText.trim() : '';
        const resultId = typeof body.resultId === 'string' ? body.resultId.trim() : '';
        const rating = typeof body.rating === 'number' ? body.rating : Number(body.rating);
        const isRelevant = typeof body.isRelevant === 'boolean' ? body.isRelevant : null;
        const feedbackText = typeof body.feedbackText === 'string' ? body.feedbackText.trim() : '';
        console.info('[admin.feedback.post] request', { resultId, rating });

        if (!queryText || !resultId || !Number.isFinite(rating)) {
            return NextResponse.json(
                { error: 'Missing required fields: queryText, resultId, rating' },
                { status: 400 }
            );
        }

        if (rating < 1 || rating > 5) {
            return NextResponse.json(
                { error: 'Rating must be between 1 and 5' },
                { status: 400 }
            );
        }

        const supabase = getSupabase();
        const { count, error: knowledgeLookupError } = await supabase
            .from('hms_knowledge')
            .select('id', { count: 'exact', head: true })
            .eq('id', resultId);

        if (knowledgeLookupError) {
            throw knowledgeLookupError;
        }

        if ((count ?? 0) === 0) {
            return NextResponse.json(
                { error: 'Feedback must reference a valid knowledge base entry.' },
                { status: 404 },
            );
        }

        await submitFeedback(queryText, resultId, rating, isRelevant, feedbackText || undefined);

        if (rating !== 3) {
            await recordFeedback(resultId, rating >= 4, queryText);
        }

        return NextResponse.json({
            success: true,
            message: 'Feedback submitted successfully'
        });
    } catch (error) {
        console.error('[admin.feedback.post] error', error);
        return NextResponse.json(
            { error: getFeedbackErrorMessage(error) },
            { status: getFeedbackErrorStatus(error) }
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

        const feedbackRows = (data ?? []) as FeedbackRow[];
        const knowledgeIds = [...new Set(feedbackRows.map((item) => item.result_id).filter(Boolean))];
        let knowledgeById: Record<string, KnowledgeLookupRow> = {};

        if (knowledgeIds.length > 0) {
            const { data: knowledgeRows, error: knowledgeError } = await supabase
                .from('hms_knowledge')
                .select('id, question, category, source_name')
                .in('id', knowledgeIds);

            if (knowledgeError) {
                return NextResponse.json(
                    { error: knowledgeError.message },
                    { status: 500 }
                );
            }

            knowledgeById = Object.fromEntries(
                ((knowledgeRows ?? []) as KnowledgeLookupRow[]).map((row) => [row.id, row]),
            );
        }

        return NextResponse.json({
            feedback: feedbackRows.map((item) => ({
                ...item,
                knowledge: knowledgeById[item.result_id] ?? null,
            })),
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
