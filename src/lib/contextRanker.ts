import type { RankedMatch } from './rag-engine';
import type { PreferredChunkType } from './vectorSearch';

export interface RankedContextResult {
    matches: RankedMatch[];
    contextString: string;
    filteredCount: number;
    duplicateCount: number;
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function bm25LikeScore(query: string, document: string): number {
    const queryTerms = normalize(query).split(' ').filter((term) => term.length > 2);
    if (queryTerms.length === 0) {
        return 0;
    }

    const doc = normalize(document);
    let score = 0;
    for (const term of queryTerms) {
        const count = (doc.match(new RegExp(term, 'g')) || []).length;
        if (count > 0) {
            score += Math.log(1 + term.length / 3) * Math.min(count, 3);
        }
    }

    return Math.min(score / (queryTerms.length * 2 + 1), 1);
}

function lexicalCoverage(query: string, candidate: RankedMatch): number {
    const queryTerms = normalize(query).split(' ').filter((token) => token.length > 2);
    if (queryTerms.length === 0) {
        return 0;
    }

    const candidateText = normalize(`${candidate.question} ${candidate.answer}`);
    const overlap = queryTerms.filter((term) => candidateText.includes(term)).length;
    return overlap / queryTerms.length;
}

function specificityScore(answer: string): number {
    let score = 0;

    if (answer.length > 140) {
        score += 0.08;
    }

    if (/\b\d+(?:\.\d+)?\s*(?:v|a|ma|hz|bps|ohm|%|ms|sec|s|dc|ac)\b/i.test(answer)) {
        score += 0.08;
    }

    if (/\b(step|check|verify|connect|error|fault|terminal|configure)\b/i.test(answer)) {
        score += 0.06;
    }

    return Math.min(score, 0.18);
}

function extractRelevantPassage(query: string, answer: string): string {
    const sentences = answer.match(/[^.!?]+[.!?]+/g) || [answer];
    if (sentences.length <= 2) {
        return answer;
    }

    const queryTerms = normalize(query).split(' ').filter((term) => term.length > 3);
    const scored = sentences.map((sentence) => {
        const lower = sentence.toLowerCase();
        let score = 0;

        for (const term of queryTerms) {
            if (lower.includes(term)) {
                score++;
            }
        }

        if (/\d+/.test(sentence)) {
            score += 0.5;
        }

        return { sentence: sentence.trim(), score };
    });

    return scored
        .sort((left, right) => right.score - left.score)
        .slice(0, 2)
        .map((item) => item.sentence)
        .join(' ');
}

function chunkTypeBoost(chunkType: string | undefined, preferredChunkType: PreferredChunkType): number {
    if (preferredChunkType === 'any') {
        return 0;
    }

    const normalizedType = (chunkType || 'chunk').toLowerCase();
    if (normalizedType === preferredChunkType) {
        return 0.08;
    }

    return normalizedType === 'proposition' || normalizedType === 'chunk' ? 0.02 : -0.02;
}

function buildDeduplicationKey(match: RankedMatch): string {
    return `${normalize(match.question).slice(0, 120)}|${normalize(match.answer).slice(0, 220)}|${match.source_name || match.source}`;
}

function isLowValue(match: RankedMatch): boolean {
    const answer = match.answer.toLowerCase();
    return answer.length < 60
        && (
            answer.includes('contact technical support')
            || answer.includes("don't have specific information")
            || answer.includes('please consult')
        );
}

function extractNumericFacts(text: string): Set<string> {
    const matches = text.match(/\b\d+(?:\.\d+)?\s*(?:v|a|ma|hz|bps|kbps|mbps|ohm|%|ms|sec|s|dc|ac)?\b/gi) || [];
    return new Set(matches.map((match) => normalize(match)));
}

function contradictsExisting(candidate: RankedMatch, accepted: RankedMatch[]): boolean {
    const candidateQuestion = normalize(candidate.question).slice(0, 80);
    const candidateFacts = extractNumericFacts(candidate.answer);

    if (candidateFacts.size === 0) {
        return false;
    }

    return accepted.some((existing) => {
        const sameTopic = normalize(existing.question).slice(0, 80) === candidateQuestion;
        if (!sameTopic) {
            return false;
        }

        const existingFacts = extractNumericFacts(existing.answer);
        if (existingFacts.size === 0) {
            return false;
        }

        const shared = [...candidateFacts].filter((fact) => existingFacts.has(fact));
        return shared.length === 0;
    });
}

export function rankAndDeduplicateContext(params: {
    query: string;
    matches: RankedMatch[];
    maxContexts?: number;
    preferredChunkType?: PreferredChunkType;
}): RankedContextResult {
    const {
        query,
        matches,
        maxContexts = 5,
        preferredChunkType = 'any',
    } = params;

    const enriched = matches.map((match) => {
        const coverage = lexicalCoverage(query, match);
        const bm25Score = bm25LikeScore(query, `${match.question} ${match.answer}`);
        const specificity = specificityScore(match.answer);
        const raptorBoost = match.raptorLevel ? Math.min(match.raptorLevel * 0.03, 0.08) : 0;
        const baseVector = Math.max(match.vectorSimilarity || 0, match.finalScore || 0);
        const finalScore =
            baseVector * 0.55
            + bm25Score * 0.2
            + coverage * 0.15
            + specificity
            + chunkTypeBoost(match.chunkType, preferredChunkType)
            + raptorBoost;

        return {
            ...match,
            bm25Score,
            finalScore,
            relevantPassage: extractRelevantPassage(query, match.answer),
        };
    }).sort((left, right) => right.finalScore - left.finalScore);

    const topScore = enriched[0]?.finalScore ?? 0;
    const deduped: RankedMatch[] = [];
    const seen = new Set<string>();
    let duplicateCount = 0;
    let filteredCount = 0;

    for (const match of enriched) {
        const key = buildDeduplicationKey(match);
        const coverage = lexicalCoverage(query, match);
        const tooWeak = match.finalScore < 0.22 && match.finalScore < topScore - 0.08;

        if (seen.has(key)) {
            duplicateCount++;
            continue;
        }

        if (isLowValue(match) || tooWeak || coverage < 0.16) {
            filteredCount++;
            continue;
        }

        if (contradictsExisting(match, deduped)) {
            filteredCount++;
            continue;
        }

        seen.add(key);
        deduped.push(match);

        if (deduped.length >= maxContexts) {
            break;
        }
    }

    const contextString = deduped.map((match, index) => {
        const answer = (match.relevantPassage || match.answer).replace(/\s+/g, ' ').trim().slice(0, 260);
        return `[${index + 1}] Q: ${match.question}\n    A: ${answer}`;
    }).join('\n\n');

    return {
        matches: deduped,
        contextString,
        filteredCount,
        duplicateCount,
    };
}
