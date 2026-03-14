import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { invalidateCache } from '@/lib/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const supabase = getSupabase();

    try {
        const { questionId, answer, category, englishQuestion } = await req.json();
        const trimmedAnswer = answer?.trim();
        const trimmedCategory = category?.trim();
        const trimmedQuestion = englishQuestion?.trim();

        console.info('[admin.seed_answer] request', {
            questionId,
            category: trimmedCategory || 'general',
        });

        if (!questionId || !trimmedAnswer || !trimmedQuestion) {
            return NextResponse.json(
                { error: 'questionId, answer, and englishQuestion are required' },
                { status: 400 }
            );
        }

        const { data: existingQuestion, error: questionError } = await supabase
            .from('unknown_questions')
            .select('id, status')
            .eq('id', questionId)
            .maybeSingle();

        if (questionError) throw questionError;
        if (!existingQuestion) {
            return NextResponse.json({ error: 'Question not found' }, { status: 404 });
        }
        if (existingQuestion.status === 'dismissed') {
            return NextResponse.json({ error: 'Dismissed question cannot be trained' }, { status: 409 });
        }

        const embeddingText = [
            'Source: Admin Dashboard',
            `Category: ${trimmedCategory || 'Admin Added'}`,
            `Keywords: ${(trimmedCategory || 'admin').toLowerCase()}`,
            `Question: ${trimmedQuestion}`,
            `Answer: ${trimmedAnswer}`,
            `Summary: ${(trimmedCategory || 'admin')} - ${trimmedQuestion}`,
        ].join('\n');

        const vector = await embedText(embeddingText);

        const knowledgeId = `admin_seed_${Date.now()}`;
        const { error: insertError } = await supabase.from('hms_knowledge').insert({
            id: knowledgeId,
            question: trimmedQuestion,
            answer: trimmedAnswer,
            category: trimmedCategory || 'Admin Added',
            subcategory: 'Admin Reviewed',
            product: 'HMS Panel',
            tags: [],
            content: embeddingText,
            embedding: vector,
            source: 'admin',
            source_name: 'Admin Dashboard',
        });

        if (insertError) throw insertError;

        const { data: updatedQuestion, error: updateError } = await supabase
            .from('unknown_questions')
            .update({
                status: 'reviewed',
                admin_answer: trimmedAnswer,
                category: trimmedCategory || 'admin-added',
                updated_at: new Date().toISOString(),
            })
            .eq('id', questionId)
            .select('id')
            .maybeSingle();

        if (updateError) throw updateError;
        if (!updatedQuestion) {
            return NextResponse.json({ error: 'Question not found during update' }, { status: 404 });
        }

        console.info('[admin.seed_answer] success', { questionId, knowledgeId });

        // Evict any cached answer for this question so users immediately get the new answer
        void invalidateCache(trimmedQuestion);

        return NextResponse.json({
            success: true,
            knowledgeId,
            message: 'Answer saved and bot trained successfully.',
        });
    } catch (err: unknown) {
        console.error('[admin.seed_answer] error', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
