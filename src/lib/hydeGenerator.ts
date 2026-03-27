import { ChatOpenAI } from '@langchain/openai';
import { embedText } from './embeddings';
import { generateHYDE } from './query-expansion';

export interface HydeResult {
    text: string | null;
    embedding: number[] | null;
    timedOut: boolean;
}

export async function generateHydeEmbedding(params: {
    query: string;
    queryType: string;
    llm: ChatOpenAI;
    timeoutMs?: number;
}): Promise<HydeResult> {
    const {
        query,
        queryType,
        llm,
        timeoutMs = 1800,
    } = params;

    const text = await generateHYDE(query, queryType, llm, timeoutMs);
    if (!text) {
        console.log('[HYDE] Timed out - skipping hypothetical embedding');
        return {
            text: null,
            embedding: null,
            timedOut: true,
        };
    }

    return {
        text,
        embedding: await embedText(text),
        timedOut: false,
    };
}
