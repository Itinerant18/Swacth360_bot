/**
 * src/lib/sanitize.ts
 *
 * Input sanitization for prompt injection defense.
 * Applied to both user queries and conversation history before LLM calls.
 *
 * Defense-in-depth: these are pattern-based filters that catch common
 * injection attempts. They are NOT a complete solution - the system prompt
 * structure (role separation) is the primary defense.
 */

const INJECTION_PATTERNS: RegExp[] = [
    // Direct instruction override attempts
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|directives|rules)/gi,
    /forget\s+(all\s+)?(previous|prior|your)\s+(instructions|rules|context)/gi,
    /override\s+(all\s+)?(previous|system)\s+(instructions|prompt|rules)/gi,

    // System prompt extraction
    /system\s*prompt/gi,
    /reveal\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions|message)/gi,
    /what\s+(are|is)\s+your\s+(system|initial|original)\s+(prompt|instructions)/gi,
    /show\s+(me\s+)?(your|the)\s+(system|hidden|secret)\s+(prompt|instructions)/gi,
    /repeat\s+(your|the)\s+(system|initial)\s+(prompt|instructions|message)/gi,

    // Role hijacking
    /you\s+are\s+(now\s+)?(chatgpt|gpt|a\s+new|an?\s+evil|an?\s+unrestricted)/gi,
    /act\s+as\s+(if\s+you\s+are\s+)?/gi,
    /pretend\s+(to\s+be|you\s+are)/gi,
    /roleplay\s+as/gi,
    /switch\s+to\s+.{0,20}\s*mode/gi,
    /enter\s+.{0,20}\s*mode/gi,
    /you\s+must\s+now\s+/gi,
    /from\s+now\s+on\s*,?\s*(you|ignore|forget)/gi,

    // Injection delimiters (fake system/user tags)
    /<\s*system\s*>/gi,
    /<\s*\/\s*system\s*>/gi,
    /<\s*instruction\s*>/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<<\s*SYS\s*>>/gi,

    // Encoded/obfuscated attempts (zero-width chars between letters)
    /i[\u200B\u200C\u200D\uFEFF]*g[\u200B\u200C\u200D\uFEFF]*n[\u200B\u200C\u200D\uFEFF]*o[\u200B\u200C\u200D\uFEFF]*r[\u200B\u200C\u200D\uFEFF]*e/gi,
];

const XSS_PATTERNS: RegExp[] = [
    // HTML script/event handler injection
    /<\s*script[\s>]/gi,
    /<\s*\/\s*script\s*>/gi,
    /on(error|load|click|mouseover|focus|blur|submit|change|input)\s*=/gi,
    /javascript\s*:/gi,
    /<\s*img[^>]+src\s*=\s*['"]?x/gi,
    /<\s*iframe/gi,
    /<\s*object/gi,
    /<\s*embed/gi,
    /<\s*svg[^>]*on/gi,
];

const KB_DISCLOSURE_PATTERNS: RegExp[] = [
    // Knowledge base/source disclosure attempts
    /list\s+(all\s+)?(the\s+)?(document|file|pdf|source|knowledge\s*base)/gi,
    /what\s+(files|documents|pdfs|sources)\s+(are|were)\s+(in|uploaded|used|loaded)/gi,
    /knowledge\s*base\s*(source|file|document|table|schema|structure)/gi,
    /database\s*(schema|table|column|structure)/gi,
    /kb_sources/gi,
    /show\s+(me\s+)?(your|the)\s+(database|schema|table|internal|backend)/gi,
    /what\s+tables?\s+(exist|are\s+there|do\s+you\s+have)/gi,
];

/**
 * Strips zero-width characters that can be used to bypass pattern matching.
 */
function stripZeroWidth(text: string): string {
    return text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060]/g, '');
}

/**
 * Sanitizes text to remove prompt injection attempts.
 * Returns cleaned text with injection patterns replaced by [filtered].
 */
export function sanitizeInput(text: string): string {
    if (!text) return '';

    // First strip zero-width characters so patterns can match
    let cleaned = stripZeroWidth(text);

    // Strip HTML/XSS payloads
    for (const pattern of XSS_PATTERNS) {
        pattern.lastIndex = 0;
        cleaned = cleaned.replace(pattern, '[removed]');
    }

    for (const pattern of INJECTION_PATTERNS) {
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        cleaned = cleaned.replace(pattern, '[filtered]');
    }

    return cleaned;
}

/**
 * Checks if text contains likely injection attempts.
 * Use for logging/monitoring - does not modify the text.
 */
export function hasInjectionSignals(text: string): boolean {
    const stripped = stripZeroWidth(text);
    return [...INJECTION_PATTERNS, ...XSS_PATTERNS].some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(stripped);
    });
}

/**
 * Checks if text attempts to extract knowledge base metadata.
 * Use to block or redirect such queries before they reach the LLM.
 */
export function hasKBDisclosureAttempt(text: string): boolean {
    const stripped = stripZeroWidth(text);
    return KB_DISCLOSURE_PATTERNS.some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(stripped);
    });
}
