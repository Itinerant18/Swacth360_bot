/**
 * src/lib/sarvam.ts
 *
 * Utility functions for processing Sarvam AI (sarvam-m) responses.
 *
 * Problem: Sarvam's `sarvam-m` model emits chain-of-thought reasoning
 * inside `<think>...</think>` tags before the actual answer. These must
 * be stripped before returning content to users, caching, or storing in DB.
 *
 * Edge case: For long-form generation (diagrams, summaries), Sarvam sometimes
 * puts the ACTUAL content inside think tags, leaving almost nothing outside.
 * In this case, we keep the think-tag content but strip the markers.
 */

// Minimum chars of useful content after stripping. If below this,
// the model likely put the real answer inside <think> tags.
const MIN_CONTENT_AFTER_STRIP = 150;

/**
 * Strips `<think>...</think>` blocks from Sarvam AI responses.
 * Handles multiline content, nested tags, and partial/unclosed tags.
 *
 * Smart fallback: if stripping leaves almost no content but the original
 * was substantial (>300 chars), the model put real content inside think tags.
 * In that case, we remove only the `<think>` and `</think>` markers but
 * keep the inner content.
 */
export function stripThinkTags(text: string): string {
    if (!text) return '';

    // Try standard stripping first
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Remove any unclosed <think> tag at the start (partial response)
    cleaned = cleaned.replace(/^<think>[\s\S]*$/gi, '');
    // Remove orphaned closing tags
    cleaned = cleaned.replace(/<\/think>/gi, '');
    cleaned = cleaned.trim();

    // Smart fallback: if stripping removed almost everything,
    // the model put substantive content inside <think> tags.
    // Keep the content, just remove the tag markers.
    if (cleaned.length < MIN_CONTENT_AFTER_STRIP && text.length > 300) {
        const withoutMarkers = text
            .replace(/<think>/gi, '')
            .replace(/<\/think>/gi, '')
            .trim();
        if (withoutMarkers.length > cleaned.length) {
            return withoutMarkers;
        }
    }

    return cleaned;
}

/**
 * Detects and strips untagged chain-of-thought reasoning that the sarvam-m
 * model sometimes emits WITHOUT `<think>` wrappers.
 *
 * Reasoning patterns detected:
 *   - "Okay, the user is asking..."
 *   - "Let me think / start / recall / figure out..."
 *   - "First, I need to..." / "I should check if..."
 *   - "Wait, some panels..." / "But wait, ..."
 *   - "Alternatively, maybe..."
 *   - "Given the uncertainty, I should..."
 *
 * Strategy: Detect if the response starts with reasoning patterns.
 * If it does, try to extract the "clean answer" portion that follows.
 * If no clean answer portion exists, return a fallback.
 */
const COT_START_PATTERNS = [
    /^okay,?\s+(the\s+user|so\s+|let)/i,
    /^(let\s+me\s+(think|start|recall|figure|check|consider|verify))/i,
    /^(first,?\s+i\s+(need|should|want)\s+to)/i,
    /^(i\s+(need|should|think|recall|remember|don'?t\s+have)\s)/i,
    /^(hmm|hm),?\s/i,
    /^(so,?\s+(the\s+(user|question)|for|if))/i,
    /^(wait,?\s)/i,
    /^(alright,?\s+(so|let|the))/i,
    /^(if\s+there'?s\s+no\s+specific)/i,
    /^(if\s+(i|the)\s+(don'?t|do\s+not|can'?t))/i,
    /^(now,?\s+(let|the|i))/i,
];

const COT_LINE_PATTERNS = [
    /^(but\s+wait|alternatively|given\s+(the\s+)?uncertainty|i\s+should\s+(check|mention|note|provide|structure|outline)|since\s+(the\s+)?user|maybe\s+(the|there|i)|from\s+what\s+i\s+(know|remember|recall))/i,
    /^(the\s+user('s|\s+might|\s+is\s+asking))/i,
    /^(if\s+i'?m\s+not\s+(sure|certain))/i,
    /^(also,?\s+include|i\s+need\s+to\s+(make|verify|be|respond|figure|check))/i,
    /^(let\s+me\s+verify)/i,
    /^(if\s+(not|there),?\s+then)/i,
];

export function stripRawChainOfThought(text: string, fallbackMsg?: string): string {
    if (!text || text.length < 100) return text;

    // Quick check: does the text START with a reasoning pattern?
    const startsWithCoT = COT_START_PATTERNS.some(p => p.test(text.trim()));
    if (!startsWithCoT) return text;

    // The text starts with CoT. Try to find where the real answer begins.
    // Split into paragraphs and look for the first non-CoT paragraph.
    const paragraphs = text.split(/\n{2,}/);
    const cleanParagraphs: string[] = [];
    let foundCleanContent = false;

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        // Check if this paragraph is reasoning
        const isReasoning = COT_START_PATTERNS.some(p => p.test(trimmed)) ||
            COT_LINE_PATTERNS.some(p => p.test(trimmed));

        if (isReasoning && !foundCleanContent) {
            // Still in the CoT preamble — skip
            continue;
        }

        // Once we find non-CoT content, keep everything after
        foundCleanContent = true;
        cleanParagraphs.push(para);
    }

    const cleaned = cleanParagraphs.join('\n\n').trim();

    // If we stripped everything (entire response was reasoning), use fallback
    if (cleaned.length < 80) {
        return fallbackMsg ?? text;
    }

    return cleaned;
}

/**
 * Full cleanup pipeline for user-facing Sarvam responses.
 * 1. Strips think tags
 * 2. Trims whitespace
 * 3. Removes stray markdown code-fence artifacts
 */
export function cleanSarvamResponse(text: string): string {
    let cleaned = stripThinkTags(text);
    // Remove stray code fence wrappers that sometimes leak
    cleaned = cleaned.replace(/^```(?:json|markdown|text)?\n?/gm, '');
    cleaned = cleaned.replace(/\n?```$/gm, '');
    return cleaned.trim();
}

/**
 * Safely extracts and parses JSON from a Sarvam response that may
 * contain `<think>` tags and/or markdown code fences around the JSON.
 *
 * Returns the parsed object, or `null` if parsing fails.
 */
export function extractJsonFromSarvam<T = unknown>(raw: string): T | null {
    try {
        // Step 1: strip think tags (for JSON, always do full strip since
        // JSON is structured data, not prose — think tags never contain useful JSON)
        let content = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
        content = content.replace(/^<think>[\s\S]*$/gi, '');
        content = content.replace(/<\/think>/gi, '');
        // Step 2: unwrap markdown code fences
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        // Step 3: parse
        return JSON.parse(content) as T;
    } catch {
        return null;
    }
}
