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
