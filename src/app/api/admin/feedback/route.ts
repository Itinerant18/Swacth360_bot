/**
 * src/app/api/admin/feedback/route.ts
 * 
 * API endpoint for retrieval feedback
 * Allows users to rate retrieval results to improve the system
 */

import { NextRequest, NextResponse } from 'next/server';
import { submitFeedback } from '@/lib/knowledge-graph';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { queryText, resultId, rating, isRelevant, feedbackText } = body;

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

        // Submit feedback
        await submitFeedback(queryText, resultId, rating, isRelevant ?? null, feedbackText);

        return NextResponse.json({
            success: true,
            message: 'Feedback submitted successfully'
        });
    } catch (error) {
        console.error('Feedback submission error:', error);
        return NextResponse.json(
            { error: 'Failed to submit feedback' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    // Get feedback analytics
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // This would query the database - simplified for now
    return NextResponse.json({
        message: 'Feedback analytics endpoint',
        note: 'Implement database query for production'
    });
}
