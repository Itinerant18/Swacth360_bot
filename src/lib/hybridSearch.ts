import type { RankedMatch } from './rag-engine';
import { getSupabase } from './supabase';
import { calculateBM25Score } from './reranker';

interface KeywordSearchRow {
    id: string;
    question: string;
    answer: string;
    category: string;
    subcategory?: string;
    content: string;
    source: string;
    source_name: string;
    chunk_type?: string;
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractTerms(query: string): string[] {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'for', 'with', 'that', 'this', 'what', 'why',
        'how', 'when', 'where', 'which', 'who', 'from', 'into', 'about', 'please',
    ]);

    return [...new Set(
        normalize(query)
            .split(' ')
            .filter((term) => term.length > 2 && !stopWords.has(term))
    )].slice(0, 5);
}

function escapeLike(term: string): string {
    return term.replace(/[%_]/g, '').trim();
}

function buildKeywordMatch(query: string, row: KeywordSearchRow): RankedMatch {
    const bm25Score = calculateBM25Score(query, `${row.question} ${row.answer} ${row.content}`);

    return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        category: row.category,
        subcategory: row.subcategory || '',
        content: row.content,
        source: row.source,
        source_name: row.source_name,
        chunkType: row.chunk_type,
        vectorSimilarity: 0,
        crossScore: 0,
        bm25Score,
        finalScore: Math.min(1, bm25Score),
        retrievalVector: 'expanded',
    };
}

export async function searchKeywordMatches(params: {
    query: string;
    topK?: number;
    minimumScore?: number;
}): Promise<RankedMatch[]> {
    const { query, topK = 8, minimumScore = 0.08 } = params;
    const terms = extractTerms(query);

    if (terms.length === 0) {
        return [];
    }

    const filters = terms.flatMap((term) => {
        const escaped = escapeLike(term);
        return [
            `question.ilike.%${escaped}%`,
            `answer.ilike.%${escaped}%`,
            `content.ilike.%${escaped}%`,
        ];
    });

    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('hms_knowledge')
            .select('id, question, answer, category, subcategory, content, source, source_name, chunk_type')
            .eq('is_archived', false)
            .or(filters.join(','))
            .limit(Math.max(topK * 3, 12));

        if (error || !data) {
            return [];
        }

        return (data as KeywordSearchRow[])
            .map((row) => buildKeywordMatch(query, row))
            .filter((match) => match.bm25Score >= minimumScore)
            .sort((left, right) => right.bm25Score - left.bm25Score)
            .slice(0, topK);
    } catch (err) {
        console.warn('[hybridSearch] keyword search failed:', (err as Error).message);
        return [];
    }
}

export function mergeHybridMatches(params: {
    query: string;
    vectorMatches: RankedMatch[];
    keywordMatches: RankedMatch[];
    topK?: number;
}): RankedMatch[] {
    const { query, vectorMatches, keywordMatches, topK = 10 } = params;
    const merged = new Map<string, RankedMatch>();

    for (const match of vectorMatches) {
        merged.set(match.id, { ...match });
    }

    for (const keywordMatch of keywordMatches) {
        const existing = merged.get(keywordMatch.id);

        if (!existing) {
            merged.set(keywordMatch.id, {
                ...keywordMatch,
                finalScore: Math.min(1, keywordMatch.bm25Score * 0.6 + 0.2),
            });
            continue;
        }

        const lexicalBoost = calculateBM25Score(query, `${existing.question} ${existing.answer}`);
        merged.set(keywordMatch.id, {
            ...existing,
            bm25Score: Math.max(existing.bm25Score, keywordMatch.bm25Score, lexicalBoost),
            finalScore: Math.min(
                1,
                existing.finalScore * 0.72
                + Math.max(existing.bm25Score, keywordMatch.bm25Score, lexicalBoost) * 0.28
            ),
        });
    }

    return [...merged.values()]
        .sort((left, right) => right.finalScore - left.finalScore)
        .slice(0, topK);
}
