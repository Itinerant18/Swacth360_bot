import type { UserIntent } from './intentClassifier';
import type { RankedMatch } from './rag-engine';

export interface FormatResponseOptions {
    intent?: UserIntent;
    confidence?: number;
    fallbackMessage?: string;
    matches?: RankedMatch[];
}

const META_OPENERS = [
    /^based on (the )?(provided|available) (context|information),?\s*/i,
    /^according to (the )?(knowledge base|context),?\s*/i,
    /^here('?s| is) (the )?(answer|information):?\s*/i,
    /^sure,?\s*/i,
];

const NOTE_PATTERNS = [
    /^note[:\s-]/i,
    /^warning[:\s-]/i,
    /^caution[:\s-]/i,
    /^important[:\s-]/i,
];

const STEP_PATTERNS = [
    /^\d+\.\s+/,
    /^[-*]\s+/,
];

const IMPLIED_STEP_PATTERN = /^(check|verify|ensure|connect|measure|restart|reset|open|select|set|turn|inspect|confirm|update|disconnect)\b/i;

function cleanLead(text: string): string {
    let cleaned = text.trim();
    for (const pattern of META_OPENERS) {
        cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.replace(/\s+/g, ' ').trim();
}

function hasStructuredSections(text: string): boolean {
    const headerPattern = /\*\*(?:Answer|Root Cause|Immediate Action|Connection Summary|Comparison|Short Answer|Steps|Explanation|Technical Detail|Full Resolution|Wiring Notes|Key Difference|Recommendation|Specifications|Context|Next Step|Verify|Escalation Threshold)\*\*/i;
    const matches = text.match(new RegExp(headerPattern.source, 'gi'));
    return (matches?.length ?? 0) >= 2;
}

function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function splitParagraphs(text: string): string[] {
    return normalizeText(text)
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

function extractNumberedOrBulletedLines(text: string): string[] {
    return normalizeText(text)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => STEP_PATTERNS.some((pattern) => pattern.test(line)))
        .map((line) => line.replace(/^\d+\.\s+/, '').replace(/^[-*]\s+/, '').trim())
        .filter(Boolean);
}

function deriveImpliedSteps(text: string): string[] {
    return text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => cleanLead(sentence))
        .filter((sentence) => IMPLIED_STEP_PATTERN.test(sentence))
        .slice(0, 4);
}

function summarize(text: string): string {
    const firstSentence = cleanLead(text).split(/(?<=[.!?])\s+/)[0]?.trim();
    if (!firstSentence) {
        return cleanLead(text);
    }

    return firstSentence.length > 220
        ? `${firstSentence.slice(0, 217).trim()}...`
        : firstSentence;
}

function explanationFromParagraphs(paragraphs: string[], shortAnswer: string): string {
    const cleaned = paragraphs
        .map((paragraph) => {
            const normalizedParagraph = cleanLead(paragraph);
            if (normalizedParagraph.startsWith(shortAnswer)) {
                return normalizedParagraph.slice(shortAnswer.length).trim().replace(/^[.:\s-]+/, '').trim();
            }
            return normalizedParagraph;
        })
        .filter((paragraph) => paragraph && paragraph !== shortAnswer && !STEP_PATTERNS.some((pattern) => pattern.test(paragraph)))
        .filter((paragraph) => !NOTE_PATTERNS.some((pattern) => pattern.test(paragraph)));

    return cleaned.join('\n\n').trim();
}

function notesFromParagraphs(paragraphs: string[]): string[] {
    return paragraphs
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => NOTE_PATTERNS.some((pattern) => pattern.test(paragraph)))
        .map((paragraph) => paragraph.replace(/^(note|warning|caution|important)[:\s-]*/i, '').trim());
}

function fallbackExplanation(matches: RankedMatch[] | undefined): string {
    if (!matches || matches.length === 0) {
        return '';
    }

    return matches
        .slice(0, 2)
        .map((match) => cleanLead(match.relevantPassage || match.answer))
        .filter(Boolean)
        .join('\n\n');
}

function appendFallbackNote(output: string, fallbackMessage: string): string {
    if (/notes/i.test(output)) {
        return `${output}\n- ${fallbackMessage}`;
    }

    return `${output}\n\nNotes\n- ${fallbackMessage}`;
}

export function formatResponse(rawAnswer: string, options: FormatResponseOptions = {}): string {
    const {
        intent = 'informational',
        confidence = 1,
        fallbackMessage,
        matches,
    } = options;

    const normalized = normalizeText(rawAnswer);
    if (!normalized) {
        return fallbackMessage || 'I could not generate a useful answer.';
    }

    if (intent === 'casual') {
        return cleanLead(normalized);
    }

    if (hasStructuredSections(normalized)) {
        return fallbackMessage && confidence < 0.52
            ? appendFallbackNote(normalized, fallbackMessage)
            : normalized;
    }

    const paragraphs = splitParagraphs(normalized);
    const shortAnswerSource = paragraphs[0] || normalized;
    const shortAnswer = summarize(shortAnswerSource);
    const explicitSteps = extractNumberedOrBulletedLines(normalized);
    const steps = explicitSteps.length > 0
        ? explicitSteps
        : intent === 'action-based' || intent === 'troubleshooting'
            ? deriveImpliedSteps(normalized)
            : [];

    let explanation = explanationFromParagraphs(paragraphs, shortAnswer);
    if (!explanation) {
        explanation = fallbackExplanation(matches);
    }

    const notes = notesFromParagraphs(paragraphs);
    if (fallbackMessage && confidence < 0.52) {
        notes.unshift(fallbackMessage);
    }

    const sections: string[] = [
        `Short Answer\n${shortAnswer}`,
    ];

    if (explanation) {
        sections.push(`📖 Explanation\n${explanation}`);
    }

    if (steps.length > 0) {
        sections.push(`🛠 Steps\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`);
    }

    if (notes.length > 0) {
        sections.push(`Notes\n${notes.map((note) => `- ${note}`).join('\n')}`);
    }

    return sections.join('\n\n').trim();
}
