

import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const supabase = getSupabase();
    try {
        const { questionId, answer, category, englishQuestion } = await req.json();

        if (!questionId || !answer || !englishQuestion) {
            return NextResponse.json(
                { error: 'questionId, answer, and englishQuestion are required' },
                { status: 400 }
            );
        }

        // 1. Build rich embedding text
        const embeddingText = [
            `Source: Admin Dashboard`,
            `Category: ${category || 'Admin Added'}`,
            `Keywords: ${(category || 'admin').toLowerCase()}`,
            `Question: ${englishQuestion}`,
            `Answer: ${answer}`,
            `Summary: ${category || 'admin'} — ${englishQuestion}`,
        ].join('\n');

        // 2. Embed with OpenAI text-embedding-3-small (1536 dims)
        const vector = await embedText(embeddingText);

        // 3. Insert into hms_knowledge
        const knowledgeId = `admin_seed_${Date.now()}`;
        const { error: insertError } = await supabase.from('hms_knowledge').insert({
            id: knowledgeId,
            question: englishQuestion,
            answer: answer,
            category: category || 'Admin Added',
            subcategory: 'Admin Reviewed',
            product: 'HMS Panel',
            tags: [],
            content: embeddingText,
            embedding: vector,
            source: 'admin',
            source_name: 'Admin Dashboard',
        });

        if (insertError) throw insertError;

        // 4. Mark the unknown question as reviewed
        const { error: updateError } = await supabase
            .from('unknown_questions')
            .update({
                status: 'reviewed',
                admin_answer: answer,
                category: category || 'admin-added',
                updated_at: new Date().toISOString(),
            })
            .eq('id', questionId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            knowledgeId,
            message: 'Answer saved and bot trained successfully!',
        });

    } catch (err: unknown) {
        console.error('❌ Seed answer error:', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}