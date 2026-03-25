

export interface RAGSettings {
    useHybridSearch: boolean;
    useReranker: boolean;
    useQueryExpansion: boolean;
    useGraphBoost: boolean;
    topK: number;
    alpha: number;
    mmrLambda: number;
}

export const DEFAULT_RAG_SETTINGS: RAGSettings = {
    useHybridSearch: true,
    useReranker: true,
    useQueryExpansion: true,
    useGraphBoost: true,
    topK: 10,
    alpha: 0.5,
    mmrLambda: 0.5,
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function parseRAGSettings(value: unknown): RAGSettings | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidate = value as Partial<RAGSettings>;

    return {
        useHybridSearch: candidate.useHybridSearch !== false,
        useReranker: candidate.useReranker !== false,
        useQueryExpansion: candidate.useQueryExpansion !== false,
        useGraphBoost: candidate.useGraphBoost !== false,
        topK: Number.isFinite(candidate.topK) ? clamp(Number(candidate.topK), 1, 20) : DEFAULT_RAG_SETTINGS.topK,
        alpha: Number.isFinite(candidate.alpha) ? clamp(Number(candidate.alpha), 0, 1) : DEFAULT_RAG_SETTINGS.alpha,
        mmrLambda: Number.isFinite(candidate.mmrLambda) ? clamp(Number(candidate.mmrLambda), 0, 1) : DEFAULT_RAG_SETTINGS.mmrLambda,
    };
}


