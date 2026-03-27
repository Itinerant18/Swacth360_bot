import { ChatOpenAI } from '@langchain/openai';
import { embedText } from './embeddings';
import { generateHYDE } from './query-expansion';

export interface HydeResult {
    text: string | null;
    embedding: number[] | null;
    timedOut: boolean;
    attempted: boolean;
    skipped: boolean;
}

export function shouldGenerateHyde(params: {
    enabled: boolean;
    queryType: string;
    complexity: 'simple' | 'medium' | 'complex';
    preliminaryConfidence?: number;
    elapsedMs?: number;
    maxLatencyMs?: number;
    hasEntities?: boolean;
}): boolean {
    const {
        enabled,
        queryType,
        complexity,
        preliminaryConfidence,
        elapsedMs = 0,
        maxLatencyMs = 650,
        hasEntities = false,
    } = params;

    if (!enabled || complexity === 'simple' || queryType === 'visual') {
        return false;
    }

    if (elapsedMs > maxLatencyMs) {
        return false;
    }

    if (preliminaryConfidence !== undefined && preliminaryConfidence >= 0.63) {
        return false;
    }

    return complexity === 'complex' || !hasEntities || (preliminaryConfidence ?? 0) < 0.58;
}

export async function generateHydeEmbedding(params: {
    query: string;
    queryType: string;
    llm: ChatOpenAI;
    timeoutMs?: number;
    enabled?: boolean;
}): Promise<HydeResult> {
    const {
        query,
        queryType,
        llm,
        timeoutMs = 1800,
        enabled = true,
    } = params;

    if (!enabled) {
        return {
            text: null,
            embedding: null,
            timedOut: false,
            attempted: false,
            skipped: true,
        };
    }

    const text = await generateHYDE(query, queryType, llm, timeoutMs);
    if (!text) {
        console.log('[HYDE] Timed out - skipping hypothetical embedding');
        return {
            text: null,
            embedding: null,
            timedOut: true,
            attempted: true,
            skipped: false,
        };
    }

    return {
        text,
        embedding: await embedText(text),
        timedOut: false,
        attempted: true,
        skipped: false,
    };
}
