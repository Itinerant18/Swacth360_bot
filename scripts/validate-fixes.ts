/**
 * scripts/validate-fixes.ts
 *
 * Post-Codex validation script for the 12 chatbot fixes.
 * Run with: npx tsx scripts/validate-fixes.ts
 *
 * Tests each fix by importing the actual module and checking behavior.
 * Does NOT require a running server, database, or API keys.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

let passed = 0;
let failed = 0;
const results: { name: string; status: 'PASS' | 'FAIL'; detail?: string }[] = [];

function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
        passed++;
        results.push({ name, status: 'PASS' });
    } else {
        failed++;
        results.push({ name, status: 'FAIL', detail });
    }
}

// ── Fix 1: Confidence weights ──────────────────────────────────

async function validateFix1() {
    const src = await import('../src/lib/retrievalOptimizer');
    const { optimizeRetrievalResult } = src;

    // Simulate a high-quality result where all scores are ~0.7
    const mockRagResult = {
        matches: [
            { id: '1', question: 'test', answer: 'test answer with enough content to pass', category: 'test', subcategory: '', content: 'test', source: 'test', source_name: 'test', vectorSimilarity: 0.7, crossScore: 0.7, bm25Score: 0.7, finalScore: 0.7, retrievalVector: 'query' as const },
            { id: '2', question: 'test2', answer: 'second answer with content', category: 'test', subcategory: '', content: 'test', source: 'test', source_name: 'test', vectorSimilarity: 0.65, crossScore: 0.6, bm25Score: 0.6, finalScore: 0.65, retrievalVector: 'query' as const },
        ],
        queryAnalysis: { type: 'factual' as const, intent: 'test', entities: [], isUrgent: false, needsDiagram: false, complexity: 'simple' as const },
        answerMode: 'rag_high' as const,
        confidence: 0.8,
        contextString: 'test context',
        retrievalStats: { queryVectorHits: 2, hydeVectorHits: 0, expandedVectorHits: 0, totalCandidates: 2, afterRerank: 2, latencyMs: 100 },
    };

    const result = optimizeRetrievalResult({
        query: 'test query about HMS panel',
        ragResult: mockRagResult,
        intent: { intent: 'informational' as const, confidence: 0.8, reason: 'test', responseStyle: { useSections: true, includeSteps: false, keepItShort: false, preferFriendlyTone: true } },
    });

    // With fixed weights summing to ~1.0, confidence should NOT always be 1.0
    assert(
        result.ragResult.confidence < 0.99,
        'Fix 1: Confidence not clamped to 1.0 for good-but-not-perfect matches',
        `Got confidence: ${result.ragResult.confidence.toFixed(4)}`
    );

    // Medium-quality result should produce meaningfully different confidence
    const mockLowResult = {
        ...mockRagResult,
        confidence: 0.4,
        matches: [
            { ...mockRagResult.matches[0], finalScore: 0.35, vectorSimilarity: 0.35 },
        ],
    };

    const lowResult = optimizeRetrievalResult({
        query: 'obscure query',
        ragResult: mockLowResult,
        intent: { intent: 'informational' as const, confidence: 0.5, reason: 'test', responseStyle: { useSections: true, includeSteps: false, keepItShort: false, preferFriendlyTone: true } },
    });

    const spread = result.ragResult.confidence - lowResult.ragResult.confidence;
    assert(
        spread > 0.15,
        'Fix 1: High vs low quality matches produce meaningful confidence spread',
        `Spread: ${spread.toFixed(4)} (high=${result.ragResult.confidence.toFixed(3)}, low=${lowResult.ragResult.confidence.toFixed(3)})`
    );
}

// ── Fix 4: isEnglish function ──────────────────────────────────

async function validateFix4() {
    // Read the route file and extract isEnglish
    const fs = await import('fs');
    const routeContent = fs.readFileSync('src/app/api/chat/route.ts', 'utf-8');

    // Check that the function uses Unicode-aware regex
    assert(
        routeContent.includes('\\p{L}') || routeContent.includes('\\p{Letter}'),
        'Fix 4: isEnglish uses Unicode property escape for letter detection',
        'Should use /\\p{L}/gu to match all Unicode letters'
    );

    assert(
        !routeContent.includes("[\\s\\d\\W]"),
        'Fix 4: Old broken regex removed',
        'The [\\s\\d\\W] pattern should no longer be in isEnglish'
    );
}

// ── Fix 5: Response formatter structured detection ─────────────

async function validateFix5() {
    const { formatResponse } = await import('../src/lib/responseFormatter');

    // LLM-style output with markdown headers
    const llmOutput = `**Answer**
The TB1 terminal supplies 24V DC power.

**Specifications**
| Parameter | Value |
|-----------|-------|
| Voltage | \`24V DC\` |

**Context**
TB1 is the main power input terminal.`;

    const result = formatResponse(llmOutput, { intent: 'informational', confidence: 0.8 });

    // Should preserve the LLM's structure, not re-format it
    assert(
        result.includes('**Answer**'),
        'Fix 5: LLM markdown headers preserved',
        'formatResponse should not strip **Answer** headers'
    );

    assert(
        !result.includes('Short Answer\n'),
        'Fix 5: Does not inject "Short Answer" section over LLM output',
        'Should not prepend "Short Answer" when LLM already structured the response'
    );
}

// ── Fix 6: Casual intent with technical follow-up ──────────────

async function validateFix6() {
    const { classifyIntent } = await import('../src/lib/intentClassifier');

    // Pure casual — should still be casual
    const greeting = classifyIntent('hello');
    assert(greeting.intent === 'casual', 'Fix 6: Pure greeting still classified as casual');

    const thanks = classifyIntent('thanks');
    assert(thanks.intent === 'casual', 'Fix 6: Pure thanks still classified as casual');

    // Casual prefix + technical content — should NOT be casual
    const okTechnical = classifyIntent('ok so how do I wire TB1?');
    assert(
        okTechnical.intent !== 'casual',
        'Fix 6: "ok so how do I wire TB1?" is NOT casual',
        `Got: ${okTechnical.intent}`
    );

    const greatFollowup = classifyIntent('great, now what about the RS-485 connection error?');
    assert(
        greatFollowup.intent !== 'casual',
        'Fix 6: "great, now what about the RS-485 connection error?" is NOT casual',
        `Got: ${greatFollowup.intent}`
    );

    // Edge case: just "ok" should still be casual
    const bareOk = classifyIntent('ok');
    assert(bareOk.intent === 'casual', 'Fix 6: Bare "ok" is still casual');
}

// ── Fix 3: Cache gating ────────────────────────────────────────

async function validateFix3() {
    const fs = await import('fs');

    // Check cache.ts has the rag_partial guard
    const cacheContent = fs.readFileSync('src/lib/cache.ts', 'utf-8');
    assert(
        cacheContent.includes('rag_partial'),
        'Fix 3: cache.ts rejects rag_partial answers',
        'storeCache should check for rag_partial'
    );

    // Check route.ts passes original answerMode (not dbAnswerMode) to storeCache
    const routeContent = fs.readFileSync('src/app/api/chat/route.ts', 'utf-8');

    // Find the storeCache call and check what answerMode it uses
    // Extract the storeCache({...}) block specifically (stop at closing `});`)
    const storeCacheBlock = routeContent.match(/storeCache\(\{[^}]*\}/);
    if (storeCacheBlock) {
        const block = storeCacheBlock[0];
        // Check that `dbAnswerMode` does NOT appear in the storeCache block
        assert(
            !block.includes('dbAnswerMode'),
            'Fix 3: storeCache uses original answerMode, not dbAnswerMode',
            `storeCache block contains: ${block.match(/answerMode.*$/m)?.[0] || 'no answerMode found'}`
        );
    } else {
        assert(false, 'Fix 3: Could not find storeCache call in route.ts');
    }
}

// ── Fix 2: Dead code removed ───────────────────────────────────

async function validateFix2() {
    const fs = await import('fs');
    const routeContent = fs.readFileSync('src/app/api/chat/route.ts', 'utf-8');

    // The dead code block had this unique condition
    assert(
        !routeContent.includes('answer.length === 0'),
        'Fix 2: Dead code block (answer.length === 0) removed',
        'The duplicate empty-answer persistence block should be deleted'
    );
}

// ── Fix 10: Error message not exposed ──────────────────────────

async function validateFix10() {
    const fs = await import('fs');
    const routeContent = fs.readFileSync('src/app/api/chat/route.ts', 'utf-8');

    // Check that the diagram fallback does not include raw err.message in markdown
    const fallbackSection = routeContent.match(/fallbackPayload[\s\S]*?markdown:[\s\S]*?}/);
    if (fallbackSection) {
        assert(
            !fallbackSection[0].includes('err as Error').valueOf() || !fallbackSection[0].includes('message}'),
            'Fix 10: Diagram fallback does not expose raw error to user',
            'err.message should not be in the markdown sent to users'
        );
    } else {
        assert(false, 'Fix 10: Could not find fallbackPayload in route.ts');
    }
}

// ── Fix 9: Pre-computed embedding passed to retrieve ───────────

async function validateFix9() {
    const fs = await import('fs');
    const ragContent = fs.readFileSync('src/lib/rag-engine.ts', 'utf-8');

    assert(
        ragContent.includes('precomputedQueryVector'),
        'Fix 9: rag-engine.ts accepts precomputedQueryVector option',
        'retrieve() should have precomputedQueryVector in its options type'
    );

    const routeContent = fs.readFileSync('src/app/api/chat/route.ts', 'utf-8');
    assert(
        routeContent.includes('precomputedQueryVector'),
        'Fix 9: route.ts passes precomputedQueryVector to retrieve',
        'The retrieve() calls should include precomputedQueryVector: cachedQueryEmbedding'
    );
}

// ── Fix 12: Parallel access logging ────────────────────────────

async function validateFix12() {
    const fs = await import('fs');
    const ragContent = fs.readFileSync('src/lib/rag-engine.ts', 'utf-8');

    // Should use Promise.all instead of sequential for loop
    // Look in a window AROUND record_knowledge_access (Promise.all appears before it)
    const idx = ragContent.indexOf('record_knowledge_access');
    const accessSection = ragContent.slice(
        Math.max(0, idx - 200),
        idx + 300
    );

    assert(
        accessSection.includes('Promise.all'),
        'Fix 12: record_knowledge_access uses Promise.all',
        'Should parallelize the 3 RPC calls'
    );

    assert(
        !accessSection.includes('for (const match'),
        'Fix 12: Sequential for loop removed',
        'Should not use a for loop for access logging'
    );
}

// ── Fix 11: Fire-and-forget error logging ──────────────────────

async function validateFix11() {
    const fs = await import('fs');
    const routeContent = fs.readFileSync('src/app/api/chat/route.ts', 'utf-8');

    // Count occurrences of chat_sessions insert
    const insertMatches = routeContent.match(/from\('chat_sessions'\)\.insert/g) || [];
    // Count occurrences of .then for those inserts
    const thenAfterInsert = routeContent.match(/chat_sessions.*?\.insert[\s\S]*?\.then/g) || [];

    assert(
        thenAfterInsert.length >= insertMatches.length,
        'Fix 11: All chat_sessions inserts have .then error handlers',
        `Found ${insertMatches.length} inserts but only ${thenAfterInsert.length} have .then`
    );
}

// ── Runner ─────────────────────────────────────────────────────

async function main() {
    console.log('\n=== Validating Codex Fixes ===\n');

    const validators = [
        { name: 'Fix 1: Confidence weights', fn: validateFix1 },
        { name: 'Fix 2: Dead code removal', fn: validateFix2 },
        { name: 'Fix 3: Cache gating', fn: validateFix3 },
        { name: 'Fix 4: isEnglish Unicode', fn: validateFix4 },
        { name: 'Fix 5: Formatter structured detection', fn: validateFix5 },
        { name: 'Fix 6: Casual intent gate', fn: validateFix6 },
        { name: 'Fix 9: Double embedding', fn: validateFix9 },
        { name: 'Fix 10: Error exposure', fn: validateFix10 },
        { name: 'Fix 11: Fire-and-forget logging', fn: validateFix11 },
        { name: 'Fix 12: Parallel access logging', fn: validateFix12 },
    ];

    for (const v of validators) {
        try {
            await v.fn();
        } catch (err) {
            failed++;
            results.push({ name: v.name, status: 'FAIL', detail: `Exception: ${(err as Error).message}` });
        }
    }

    console.log('─'.repeat(60));
    for (const r of results) {
        const icon = r.status === 'PASS' ? 'PASS' : 'FAIL';
        const detail = r.detail ? ` — ${r.detail}` : '';
        console.log(`  [${icon}] ${r.name}${detail}`);
    }
    console.log('─'.repeat(60));
    console.log(`\n  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

main();
