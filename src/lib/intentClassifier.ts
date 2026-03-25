import type { QueryAnalysis } from './rag-engine';

export type UserIntent = 'informational' | 'troubleshooting' | 'action-based' | 'casual';
type CasualSubtype = 'greeting' | 'thanks' | 'farewell' | 'acknowledgement';

export interface IntentClassification {
    intent: UserIntent;
    confidence: number;
    reason: string;
    responseStyle: {
        useSections: boolean;
        includeSteps: boolean;
        keepItShort: boolean;
        preferFriendlyTone: boolean;
    };
}

const CASUAL_PATTERNS: Array<{ pattern: RegExp; subtype: CasualSubtype }> = [
    { pattern: /^\s*(hi|hello|hey|good morning|good afternoon|good evening)\b/i, subtype: 'greeting' },
    { pattern: /\b(thanks|thank you|thx|appreciate it)\b/i, subtype: 'thanks' },
    { pattern: /\b(bye|goodbye|see you|talk later|take care)\b/i, subtype: 'farewell' },
    { pattern: /^\s*(ok|okay|cool|great|got it|understood|noted)\b/i, subtype: 'acknowledgement' },
];

const ACTION_PATTERNS = [
    /^\s*(how\s+do\s+i|how\s+to|steps?\s+to|guide\s+for|show\s+me|walk me through)\b/i,
    /^\s*(install|configure|setup|set up|connect|wire|reset|restart|enable|disable|update|create|change|clear|fix)\b/i,
];

const TROUBLESHOOTING_PATTERNS = [
    /\b(error|issue|problem|fault|alarm|not working|failed|failure|unable|cannot|can't|offline|down|broken|troubleshoot|diagnose|fix)\b/i,
];

const INFORMATIONAL_PATTERNS = [
    /^\s*(what|why|which|when|where|who|can|does|is|are|tell me|explain)\b/i,
];

function detectCasualSubtype(query: string): CasualSubtype | null {
    const normalized = query.trim();
    if (!normalized) {
        return 'acknowledgement';
    }

    for (const candidate of CASUAL_PATTERNS) {
        if (candidate.pattern.test(normalized)) {
            return candidate.subtype;
        }
    }

    return null;
}

function responseStyleFor(intent: UserIntent): IntentClassification['responseStyle'] {
    if (intent === 'casual') {
        return {
            useSections: false,
            includeSteps: false,
            keepItShort: true,
            preferFriendlyTone: true,
        };
    }

    if (intent === 'troubleshooting') {
        return {
            useSections: true,
            includeSteps: true,
            keepItShort: false,
            preferFriendlyTone: true,
        };
    }

    if (intent === 'action-based') {
        return {
            useSections: true,
            includeSteps: true,
            keepItShort: false,
            preferFriendlyTone: true,
        };
    }

    return {
        useSections: true,
        includeSteps: false,
        keepItShort: false,
        preferFriendlyTone: true,
    };
}

export function classifyIntent(query: string, analysis?: QueryAnalysis): IntentClassification {
    const normalized = query.trim();
    const casualSubtype = detectCasualSubtype(normalized);

    if (casualSubtype) {
        const casualPattern = CASUAL_PATTERNS.find((c) => c.pattern.test(normalized));
        const remainder = casualPattern
            ? normalized.replace(casualPattern.pattern, '').trim()
            : '';

        const strippedRemainder = remainder
            .replace(/^\s*(so|then|now|but|and|also)\s+/i, '')
            .trim();

        const hasTechnicalContent = strippedRemainder.length > 12
            && (TROUBLESHOOTING_PATTERNS.some((p) => p.test(strippedRemainder))
                || ACTION_PATTERNS.some((p) => p.test(strippedRemainder))
                || INFORMATIONAL_PATTERNS.some((p) => p.test(strippedRemainder)));

        if (!hasTechnicalContent) {
            return {
                intent: 'casual',
                confidence: 0.96,
                reason: `Matched casual pattern: ${casualSubtype}`,
                responseStyle: responseStyleFor('casual'),
            };
        }
        // Fall through to technical classification
    }

    if (analysis?.type === 'diagnostic' || TROUBLESHOOTING_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return {
            intent: 'troubleshooting',
            confidence: analysis?.type === 'diagnostic' ? 0.92 : 0.84,
            reason: 'Query asks for diagnosis or issue resolution',
            responseStyle: responseStyleFor('troubleshooting'),
        };
    }

    if (
        analysis?.type === 'procedural'
        || analysis?.type === 'visual'
        || ACTION_PATTERNS.some((pattern) => pattern.test(normalized))
    ) {
        return {
            intent: 'action-based',
            confidence: analysis?.type === 'procedural' || analysis?.type === 'visual' ? 0.9 : 0.82,
            reason: 'Query asks for steps, wiring, or direct action',
            responseStyle: responseStyleFor('action-based'),
        };
    }

    if (
        analysis?.type === 'factual'
        || analysis?.type === 'comparative'
        || INFORMATIONAL_PATTERNS.some((pattern) => pattern.test(normalized))
    ) {
        return {
            intent: 'informational',
            confidence: analysis?.type ? 0.86 : 0.74,
            reason: 'Query asks for explanation, comparison, or factual information',
            responseStyle: responseStyleFor('informational'),
        };
    }

    return {
        intent: 'informational',
        confidence: 0.58,
        reason: 'Defaulted to informational intent',
        responseStyle: responseStyleFor('informational'),
    };
}

export function buildIntentStylePrompt(intentResult: IntentClassification): string {
    switch (intentResult.intent) {
        case 'troubleshooting':
            return [
                'FINAL ANSWER STYLE:',
                '- Use simple, beginner-friendly language.',
                '- Start with the likely issue in one short sentence.',
                '- Give short numbered troubleshooting steps.',
                '- Explain technical terms immediately when you use them.',
                '- Never sound more certain than the evidence supports.',
            ].join('\n');
        case 'action-based':
            return [
                'FINAL ANSWER STYLE:',
                '- Use simple, practical language.',
                '- Start with what the user is trying to achieve.',
                '- Give clear numbered steps in execution order.',
                '- Include a quick verification step when helpful.',
                '- Avoid unnecessary jargon or long background sections.',
            ].join('\n');
        case 'casual':
            return [
                'FINAL ANSWER STYLE:',
                '- Reply briefly and naturally.',
                '- Invite the user to share the exact issue or task if needed.',
            ].join('\n');
        default:
            return [
                'FINAL ANSWER STYLE:',
                '- Use simple, human-friendly language.',
                '- Start with a direct answer in one or two sentences.',
                '- Add a short explanation only if it helps the user act on the answer.',
                '- Avoid raw technical dump formatting.',
            ].join('\n');
    }
}

const CASUAL_RESPONSES: Record<string, Record<CasualSubtype, string>> = {
    en: {
        greeting: 'Hello. Tell me the issue, task, or product name, and I will help.',
        thanks: 'You are welcome. Send the next question whenever you are ready.',
        farewell: 'Goodbye. If you need more help later, send the issue details.',
        acknowledgement: 'Understood. Send the next question when you are ready.',
    },
    hi: {
        greeting: '\u0928\u092e\u0938\u094d\u0924\u0947. \u0905\u092a\u0928\u0940 \u0938\u092e\u0938\u094d\u092f\u093e, \u0915\u093e\u0930\u094d\u092f, \u092f\u093e \u092a\u094d\u0930\u094b\u0921\u0915\u094d\u091f \u0915\u093e \u0928\u093e\u092e \u092d\u0947\u091c\u093f\u090f, \u092e\u0948\u0902 \u092e\u0926\u0926 \u0915\u0930\u0942\u0901\u0917\u093e.',
        thanks: '\u0906\u092a\u0915\u093e \u0938\u094d\u0935\u093e\u0917\u0924 \u0939\u0948. \u0905\u0917\u0932\u093e \u0938\u0935\u093e\u0932 \u0924\u092f\u093e\u0930 \u0939\u094b \u0924\u094b \u092d\u0947\u091c\u093f\u090f.',
        farewell: '\u0905\u0932\u0935\u093f\u0926\u093e. \u0906\u0917\u0947 \u0914\u0930 \u092e\u0926\u0926 \u091a\u093e\u0939\u093f\u090f \u0924\u094b \u0935\u093f\u0935\u0930\u0923 \u092d\u0947\u091c\u093f\u090f.',
        acknowledgement: '\u0920\u0940\u0915 \u0939\u0948. \u0924\u092f\u093e\u0930 \u0939\u094b\u0928\u0947 \u092a\u0930 \u0905\u0917\u0932\u093e \u0938\u0935\u093e\u0932 \u092d\u0947\u091c\u093f\u090f.',
    },
    bn: {
        greeting: '\u09b9\u09cd\u09af\u09be\u09b2\u09cb. \u0986\u09aa\u09a8\u09be\u09b0 \u09b8\u09ae\u09b8\u09cd\u09af\u09be, \u0995\u09be\u099c, \u09ac\u09be \u09aa\u09a3\u09cd\u09af\u09c7\u09b0 \u09a8\u09be\u09ae \u09aa\u09be\u09a0\u09be\u09a8, \u0986\u09ae\u09bf \u09b8\u09be\u09b9\u09be\u09af\u09cd\u09af \u0995\u09b0\u09ac.',
        thanks: '\u0986\u09aa\u09a8\u09be\u0995\u09c7 \u09b8\u09cd\u09ac\u09be\u0997\u09a4\u09ae. \u09aa\u09b0\u09c7\u09b0 \u09aa\u09cd\u09b0\u09b6\u09cd\u09a8 \u09a4\u09c8\u09b0\u09bf \u09b9\u09b2\u09c7 \u09aa\u09be\u09a0\u09be\u09a8.',
        farewell: '\u09ac\u09bf\u09a6\u09be\u09af\u09bc. \u09aa\u09b0\u09c7 \u0986\u09b0\u0993 \u09b8\u09be\u09b9\u09be\u09af\u09cd\u09af \u09b2\u09be\u0997\u09b2\u09c7 \u09b8\u09ae\u09b8\u09cd\u09af\u09be\u09b0 \u09ac\u09bf\u09ac\u09b0\u09a3 \u09aa\u09be\u09a0\u09be\u09a8.',
        acknowledgement: '\u09a0\u09bf\u0995 \u0986\u099b\u09c7. \u09aa\u09cd\u09b0\u09b8\u09cd\u09a4\u09c1\u09a4 \u09b9\u09b2\u09c7 \u09aa\u09b0\u09c7\u09b0 \u09aa\u09cd\u09b0\u09b6\u09cd\u09a8 \u09aa\u09be\u09a0\u09be\u09a8.',
    },
};

export function buildCasualResponse(query: string, language: string = 'en'): string {
    const subtype = detectCasualSubtype(query) ?? 'acknowledgement';
    const templates = CASUAL_RESPONSES[language] || CASUAL_RESPONSES.en;
    return templates[subtype];
}
