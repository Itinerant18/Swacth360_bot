import { isLikelyFollowUp, type ConversationMessage } from './conversation-retrieval';

export interface ConversationMemory {
    recentUserQueries: string[];
    recentAssistantReplies: string[];
    promptContext: string;
    relatedHistory: ConversationMessage[];
    attached: boolean;
    similarity: number;
}

const MEMORY_SIMILARITY_THRESHOLD = 0.22;
const TOPIC_SHIFT_THRESHOLD = 0.2;

function normalizeForMemory(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function lexicalSimilarity(a: string, b: string): number {
    const left = new Set(normalizeForMemory(a).split(' ').filter((token) => token.length > 2));
    const right = new Set(normalizeForMemory(b).split(' ').filter((token) => token.length > 2));

    if (left.size === 0 || right.size === 0) {
        return 0;
    }

    let overlap = 0;
    for (const token of left) {
        if (right.has(token)) {
            overlap++;
        }
    }

    return overlap / Math.max(left.size, right.size);
}

export function isTopicShift(current: string, previous: string): boolean {
    return lexicalSimilarity(current, previous) < TOPIC_SHIFT_THRESHOLD;
}

export function buildConversationMemory(
    history: ConversationMessage[],
    latestQuery: string,
): ConversationMemory {
    const recentHistory = history.slice(-6);
    const recentUserMessages = recentHistory.filter((message) => message.role === 'user');
    const previousUserQuery = recentUserMessages.length > 0
        ? recentUserMessages[recentUserMessages.length - 1].content
        : '';
    const topicShifted = previousUserQuery ? isTopicShift(latestQuery, previousUserQuery) : false;
    const memoryHistory = topicShifted ? [] : recentHistory;
    const recentUserQueries = memoryHistory
        .filter((message) => message.role === 'user')
        .slice(-3)
        .map((message) => message.content.replace(/\s+/g, ' ').trim().slice(0, 180));
    const recentAssistantReplies = memoryHistory
        .filter((message) => message.role === 'assistant')
        .slice(-2)
        .map((message) => message.content.replace(/\s+/g, ' ').trim().slice(0, 220));

    const similarity = recentUserQueries.reduce((maxScore, candidate) => {
        return Math.max(maxScore, lexicalSimilarity(latestQuery, candidate));
    }, 0);

    const attached = !topicShifted && (isLikelyFollowUp(latestQuery) || similarity >= MEMORY_SIMILARITY_THRESHOLD);
    const relatedHistory = attached ? memoryHistory : [];
    const sections: string[] = [];

    if (attached && recentUserQueries.length > 0) {
        sections.push(
            `Recent user queries:\n${recentUserQueries.map((query, index) => `${index + 1}. ${query}`).join('\n')}`
        );
    }

    if (attached && recentAssistantReplies.length > 0) {
        sections.push(
            `Recent assistant replies:\n${recentAssistantReplies.map((reply, index) => `${index + 1}. ${reply}`).join('\n')}`
        );
    }

    return {
        recentUserQueries,
        recentAssistantReplies,
        promptContext: sections.join('\n\n'),
        relatedHistory,
        attached,
        similarity,
    };
}
