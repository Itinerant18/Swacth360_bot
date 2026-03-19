export const RAG_SETTINGS_STORAGE_KEY = 'rag_settings';

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
        useHybridSearch: Boolean(candidate.useHybridSearch),
        useReranker: candidate.useReranker !== false,
        useQueryExpansion: Boolean(candidate.useQueryExpansion),
        useGraphBoost: Boolean(candidate.useGraphBoost),
        topK: Number.isFinite(candidate.topK) ? clamp(Number(candidate.topK), 1, 20) : DEFAULT_RAG_SETTINGS.topK,
        alpha: Number.isFinite(candidate.alpha) ? clamp(Number(candidate.alpha), 0, 1) : DEFAULT_RAG_SETTINGS.alpha,
        mmrLambda: Number.isFinite(candidate.mmrLambda) ? clamp(Number(candidate.mmrLambda), 0, 1) : DEFAULT_RAG_SETTINGS.mmrLambda,
    };
}

export function loadStoredRAGSettings(): RAGSettings | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(RAG_SETTINGS_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        return parseRAGSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export async function fetchServerRAGSettings(): Promise<RAGSettings | null> {
    try {
        const res = await fetch('/api/admin/rag-settings');
        if (!res.ok) return null;
        const data = await res.json();
        return parseRAGSettings(data);
    } catch {
        return null;
    }
}
