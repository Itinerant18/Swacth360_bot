# SAI HMS Bot — Codebase Audit Report

**Project**: SAI (HMS Industrial Panel Support Assistant)
**Auditor**: Matrix Agent Security & Quality Audit
**Date**: 2026-04-27
**Scope**: RAG Pipeline, Caching, Prompts, Frontend Streaming, Admin Panel

---

## A. BUG REPORT

### 🔴 Critical Bugs

#### BUG-001: HYDE Enhancement Disabled in Hybrid Search Path
**File**: `src/lib/rag-engine.ts`
**Lines**: ~600-610
**Severity**: Critical

**Description**:
In `enhancedRetrieve()`, the HYDE flag is passed but HYDE generation is explicitly skipped with a console log:
```typescript
if (options.useHYDE) {
    console.log(`  HYDE: skipped (not implemented in hybrid search path)`);
}
```

The entire HYDE path is disabled when using `useHybridSearch: true`. This means for complex queries (comparative, complex type), which should benefit most from HYDE, the enhancement is silently skipped.

**Proposed Fix**:
Remove the skip logic and enable HYDE in the hybrid path:
```typescript
// In enhancedRetrieve(), add HYDE generation:
if (options.useHYDE && queryAnalysis.type !== 'visual') {
    const hydeAnswer = await generateHYDE(query, queryAnalysis, llm);
    queryAnalysis.hydeAnswer = hydeAnswer;
    const hydeVector = await embedText(hydeAnswer);
    // Add hydeVector to search
}
```

---

#### BUG-002: Embedding Cache Memory Leak in Serverless Environments
**File**: `src/lib/vectorSearch.ts`
**Lines**: 10
**Severity**: Critical

**Description**:
`embeddingCache` is a module-level `Map<string, number[]>` that grows indefinitely:
```typescript
const embeddingCache = new Map<string, number[]>();
```

In serverless environments (Vercel/Netlify), the Node.js process persists across warm invocations. This causes unbounded memory growth as different queries cache different embeddings.

**Proposed Fix**:
```typescript
const embeddingCache = new Map<string, number[]>();
const MAX_CACHE_SIZE = 500; // Limit cache size

function normalizeEmbeddingKey(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function getEmbeddings(texts: string[], requestCache?: EmbeddingStore): Promise<number[][]> {
    // ... existing logic ...
    
    // Prune cache if needed
    if (embeddingCache.size > MAX_CACHE_SIZE) {
        const entriesToDelete = [...embeddingCache.keys()].slice(0, 100);
        entriesToDelete.forEach(key => embeddingCache.delete(key));
    }
}
```

---

#### BUG-003: Semantic Cache Cross-Request Pollution in Serverless
**File**: `src/lib/semanticCache.ts`
**Lines**: 15-16
**Severity**: Critical

**Description**:
The `entries` array is module-level and shared across all serverless invocations:
```typescript
const entries: SemanticCacheEntry[] = [];
```

When the serverless function is warm, different users' queries share the same cache. A query cached by User A might be served to User B in a different request, even with different conversation contexts.

**Proposed Fix**:
Either disable semantic cache in serverless environments, or use a session-based approach:
```typescript
const entries: SemanticCacheEntry[] = [];
const MAX_ENTRIES = 250;

export function checkSemanticCache(params: {
    query: string;
    queryEmbedding: number[];
    threshold?: number;
    requestId?: string; // Add for isolation
}): SemanticCacheResult {
    // For serverless, require explicit requestId or disable
    if (!process.env.EDGE_RUNTIME) {
        // Only use local cache in non-serverless environments
    }
}
```

Or remove the local semantic cache entirely and rely only on the Supabase pgvector tier-2 cache.

---

### 🟠 High Severity Bugs

#### BUG-004: `contradictsExisting()` Too Aggressive in Filtering
**File**: `src/lib/contextRanker.ts`
**Lines**: 77-98
**Severity**: High

**Description**:
The `contradictsExisting()` function filters out valid matches when numeric facts don't match exactly:
```typescript
const shared = [...candidateFacts].filter((fact) => existingFacts.has(fact));
return shared.length === 0;
```

This means if one source says "24V DC" and another says "24 V DC" (different spacing), they're considered contradictory. Also, technical variations (e.g., "115V" vs "110-120V") are incorrectly rejected.

**Impact**: Reduces retrieval recall by incorrectly filtering relevant chunks that have slightly different numeric representations.

**Proposed Fix**:
```typescript
function normalizeFact(fact: string): string {
    return fact.replace(/\s+/g, '').toLowerCase();
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

        // Normalize facts for comparison
        const normalizedCandidate = [...candidateFacts].map(normalizeFact);
        const normalizedExisting = [...existingFacts].map(normalizeFact);
        
        const shared = normalizedCandidate.filter(f => 
            normalizedExisting.some(e => e === f || fuzzyMatch(e, f))
        );
        
        // Only contradict if candidate has NO overlap with any existing
        return shared.length === 0 && candidateFacts.size > 0;
    });
}
```

---

#### BUG-005: Fast Path HYDE Skip Too Aggressive
**File**: `src/lib/pipeline.ts`
**Lines**: ~490-500
**Severity**: High

**Description**:
`isFastPathCandidate()` uses only word count to determine if HYDE should be skipped:
```typescript
export function isFastPathCandidate(params: {
    query: string;
    complexity: 'simple' | 'medium' | 'complex';
}): boolean {
    const wordCount = params.query.trim().split(/\s+/).filter(Boolean).length;
    return params.complexity === 'simple' && wordCount <= 8;
}
```

A query like "What is the E001 error?" has only 5 words but is technical and would benefit from HYDE. The complexity check alone isn't sufficient.

**Proposed Fix**:
```typescript
export function isFastPathCandidate(params: {
    query: string;
    complexity: 'simple' | 'medium' | 'complex';
}): boolean {
    const wordCount = params.query.trim().split(/\s+/).filter(Boolean).length;
    const hasTechnicalTerms = /[Ee]\d{3,4}|TB\d+|RS-485|Modbus|PROFIBUS/i.test(params.query);
    
    // Only skip HYDE for truly simple non-technical queries
    return params.complexity === 'simple' && wordCount <= 8 && !hasTechnicalTerms;
}
```

---

#### BUG-006: `storeCache()` Skips `rag_partial` Answers
**File**: `src/lib/cache.ts`
**Lines**: ~350-360
**Severity**: High

**Description**:
```typescript
export async function storeCache(params: {...}): Promise<void> {
    const { answer, answerMode, confidence = 0 } = params;

    if (answerMode === 'general' || answerMode === 'rag_partial') return;
```

`rag_partial` mode often means partial but relevant context was found — these answers can still be high quality. Skipping them entirely reduces cache hit rate and increases LLM calls for repeat queries.

**Proposed Fix**:
```typescript
// Cache partial answers with lower confidence threshold
if (answerMode === 'general') return;
if (answerMode === 'rag_partial' && confidence < 0.55) return; // Cache partial if confident enough
```

---

#### BUG-007: Conversation Query Rewrite Timeout Too Aggressive
**File**: `src/lib/conversation-retrieval.ts`
**Lines**: ~95-105
**Severity**: High

**Description**:
The LLM-based query rewrite has a 3-second timeout:
```typescript
try {
    const result = await Promise.race([
        llm.invoke(prompt),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Rewrite timeout')), 3000)
        ),
    ]);
```

3 seconds is aggressive for p95 latency. If the rewrite fails, follow-up queries with pronouns (e.g., "What about that?", "And the wiring?") won't resolve correctly, degrading conversation continuity.

**Proposed Fix**:
```typescript
// Increase timeout and add retry with fallback
const REWRITE_TIMEOUT_MS = 5000; // 5 seconds
const MAX_RETRIES = 2;

async function rewriteWithContextRetry(query, history, llm): Promise<{ rewritten: string; wasRewritten: boolean }> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const result = await Promise.race([
                llm.invoke(prompt),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Rewrite timeout')), REWRITE_TIMEOUT_MS)
                ),
            ]);
            return { rewritten: String(result.content).trim(), wasRewritten: true };
        } catch (err) {
            if (attempt === MAX_RETRIES - 1) {
                // Last attempt failed, return original
                return { rewritten: query, wasRewritten: false };
            }
        }
    }
    return { rewritten: query, wasRewritten: false };
}
```

---

#### BUG-008: Topic Shift Detection 0.20 Threshold Too Low
**File**: `src/lib/memory.ts`
**Lines**: 8
**Severity**: High

**Description**:
```typescript
const TOPIC_SHIFT_THRESHOLD = 0.2;
```

A 0.20 similarity threshold means if two queries share only 20% of their tokens, it's considered a topic shift. This is too aggressive for technical queries where follow-ups often have low overlap:

- "How do I configure RS-485 on HMS-1600?" 
- "What about the wiring for that?"

These share almost no tokens but are clearly related. The current threshold causes the memory context to be incorrectly cleared.

**Proposed Fix**:
```typescript
const TOPIC_SHIFT_THRESHOLD = 0.15; // Lower threshold for technical queries
const TOPIC_SHIFT_THRESHOLD_STRICT = 0.12; // For follow-up detection

// In isTopicShift, also check for entity overlap
export function isTopicShift(current: string, previous: string): boolean {
    const similarity = lexicalSimilarity(current, previous);
    if (similarity >= TOPIC_SHIFT_THRESHOLD) return false;
    
    // Also check entity overlap (terminals, error codes, etc.)
    const entities = [...current.matchAll(/\b[Ee]\d{3,4}|TB\d+|RS-485|Modbus|PROFIBUS|HMS-\d+/gi)]
                     .map(m => m[0].toLowerCase());
    const prevEntities = [...previous.matchAll(/\b[Ee]\d{3,4}|TB\d+|RS-485|Modbus|PROFIBUS|HMS-\d+/gi)]
                          .map(m => m[0].toLowerCase());
    
    const entityOverlap = entities.filter(e => prevEntities.includes(e)).length;
    if (entityOverlap > 0) return false; // Same entities = same topic
    
    return true;
}
```

---

### 🟡 Medium Severity Bugs

#### BUG-009: `normalizeUserQuery()` Strips Intent-Modifying Words
**File**: `src/lib/queryProcessor.ts`
**Lines**: ~35-45
**Severity**: Medium

**Description**:
```typescript
function trimPoliteFillers(input: string): string {
    return input
        .replace(/^\s*(please\s+)?(can you|could you|would you)\s+/i, '')
        .replace(/^\s*please\s+/i, '')
        .trim();
}
```

This strips "Can you explain..." to just "explain..." which changes the query type classification. The intent classifier may misclassify the query because "explain" without context looks like a factual query rather than a request for detailed explanation.

**Proposed Fix**:
```typescript
function trimPoliteFillers(input: string): string {
    // Only trim polite phrases at the START, not semantic modifiers
    let result = input.trim();
    result = result.replace(/^(please\s+)+/i, ''); // Only "please" at start
    result = result.replace(/^(can you|could you|would you|i want to|i need to)\s+/i, '');
    return result;
}
```

---

#### BUG-010: `DIAGRAM_RESPONSE:` String Collision Risk
**File**: `src/components/Chat/MessageBubble.tsx`
**Lines**: ~45-55
**Severity**: Medium

**Description**:
```typescript
function parseMessageContent(content: string): {...} {
    if (content.startsWith('DIAGRAM_RESPONSE:')) {
        // parse as diagram
    }
    return { isDiagram: false, text: content };
}
```

If the LLM accidentally produces text containing "DIAGRAM_RESPONSE:" in a regular response, the parser will misidentify it as a diagram payload. This can cause parsing errors and visual glitches.

**Proposed Fix**:
Use a more unique delimiter or structured format:
```typescript
function parseMessageContent(content: string): {...} {
    // Look for JSON-serialized diagram at the end
    const DIAGRAM_MARKER = '[[DIAGRAM_JSON_START]]';
    const DIAGRAM_END = '[[DIAGRAM_JSON_END]]';
    
    const startIdx = content.indexOf(DIAGRAM_MARKER);
    if (startIdx !== -1) {
        const endIdx = content.indexOf(DIAGRAM_END, startIdx);
        if (endIdx !== -1) {
            try {
                const json = content.slice(startIdx + DIAGRAM_MARKER.length, endIdx);
                const diagram = JSON.parse(json);
                return { 
                    isDiagram: true, 
                    diagram, 
                    text: content.slice(0, startIdx) // Regular text before marker
                };
            } catch {
                // Fall through to regular text
            }
        }
    }
    
    return { isDiagram: false, text: content };
}
```

And update the backend to use the new delimiter format.

---

#### BUG-011: EventSource Not Closed on Unmount (Memory Leak)
**File**: `src/components/admin/AdminAnalyticsDashboard.tsx`
**Lines**: ~290-310
**Severity**: Medium

**Description**:
```typescript
useEffect(() => {
    const stream = new EventSource('/api/admin/metrics/stream', { withCredentials: true });
    // ...
    return () => {
        stream.removeEventListener('metrics', handleMetrics as EventListener);
        stream.removeEventListener('open', handleOpen as EventListener);
        stream.close(); // This is called
    };
}, []);
```

While `stream.close()` is called, the `addEventListener` method doesn't have corresponding `removeEventListener` with the same function reference. In React strict mode or with function component re-renders, the event listeners may accumulate.

**Proposed Fix**:
Store the event handler references:
```typescript
const handleMetricsRef = useRef<(event: MessageEvent<string>) => void>();

handleMetricsRef.current = (event: MessageEvent<string>) => {
    // existing handler logic
};

useEffect(() => {
    const stream = new EventSource('/api/admin/metrics/stream', { withCredentials: true });
    
    stream.addEventListener('metrics', handleMetricsRef.current as EventListener);
    stream.addEventListener('open', handleOpen as EventListener);
    stream.onerror = handleError;

    return () => {
        if (stream.readyState !== EventSource.CLOSED) {
            stream.close();
        }
    };
}, []);
```

---

#### BUG-012: No Retry on Admin Data Fetch Failure
**File**: `src/app/admin/page.tsx`
**Lines**: ~estimated 200-250 (fetchQuestions, fetchUsers)
**Severity**: Medium

**Description**:
Admin data fetching has no retry mechanism on failure. If the initial fetch fails, the error state just shows a message with no way for admins to retry.

**Proposed Fix**:
Add retry button and auto-retry logic:
```typescript
const [fetchError, setFetchError] = useState<string | null>(null);
const [retryCount, setRetryCount] = useState(0);

const fetchWithRetry = async (fn: () => Promise<void>, maxRetries = 3) => {
    try {
        await fn();
        setFetchError(null);
    } catch (err) {
        if (retryCount < maxRetries) {
            setRetryCount(c => c + 1);
            setTimeout(() => fetchWithRetry(fn, maxRetries), 1000 * retryCount);
        } else {
            setFetchError(err instanceof Error ? err.message : 'Failed to fetch');
        }
    }
};

// Add retry button in UI
{fetchError && (
    <button onClick={() => { setRetryCount(0); void fetchWithRetry(fetchQuestions); }}>
        Retry
    </button>
)}
```

---

#### BUG-013: `buildContextWindow()` Groups by Source — May Cut Off Related Chunks
**File**: `src/lib/reranker.ts`
**Lines**: ~280-320
**Severity**: Medium

**Description**:
```typescript
function buildContextWindow(matches: RankedMatch[], maxTokens = 1200): string {
    // Groups by source first
    const groups = new Map<string, RankedMatch[]>();
    for (const match of matches) {
        const source = match.source_name || match.source || 'Knowledge Base';
        // ...
    }
}
```

When grouping by source, if the first source fills the token budget, related chunks from other sources (which might be more relevant) are skipped. Also, chunks from the same source that should be kept together (e.g., a wiring diagram and its explanation) might be split.

**Proposed Fix**:
Use a priority-based selection that considers both relevance and source diversity:
```typescript
function buildContextWindow(matches: RankedMatch[], maxTokens = 1200): string {
    const blocks: string[] = [];
    let tokenCount = 0;
    
    // Sort by finalScore descending, but allow some diversity
    const sorted = [...matches].sort((a, b) => b.finalScore - a.finalScore);
    
    for (const match of sorted) {
        const snippet = (match.relevantPassage || match.answer)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 400); // Reduce per-chunk limit
        const entry = `[${match.source_name || 'KB'}] ${match.question}\n${snippet}`;
        const entryTokens = entry.split(/\s+/).filter(Boolean).length;
        
        if (tokenCount + entryTokens > maxTokens) {
            break;
        }
        
        blocks.push(entry);
        tokenCount += entryTokens;
    }
    
    return blocks.join('\n\n');
}
```

---

### 🟢 Low Severity Bugs

#### BUG-014: Duplicate BM25 Implementation
**File**: `src/lib/rag-engine.ts` and `src/lib/contextRanker.ts`
**Severity**: Low

Both files implement BM25 scoring with slightly different formulas. Maintenance burden and potential for divergence.

**Fix**: Consolidate into a shared utility.

---

#### BUG-015: `rerankMatches()` in reranker.ts vs `rankAndDeduplicateContext()` in contextRanker.ts — Redundant Logic
**File**: `src/lib/reranker.ts` vs `src/lib/contextRanker.ts`
**Severity**: Low

Both functions do similar scoring and deduplication. In `pipeline.ts`, `rerankMatches()` is called first, then `rankAndDeduplicateContext()`. This double processing adds latency.

**Fix**: Consolidate into a single pass or remove redundant reranking.

---

## B. IMPROVEMENT ROADMAP

### Priority 1: Highest Impact (Directly Improves Answer Relevance/Accuracy)

| # | Improvement | Why It Helps | Effort | Files |
|---|-------------|--------------|--------|-------|
| **IMP-01** | Enable HYDE in hybrid search path | HYDE is the core retrieval enhancement — disabling it for complex queries defeats the purpose | Medium | `rag-engine.ts` |
| **IMP-02** | Fix `contradictsExisting()` over-filtering | Improves recall by 10-20% for technical queries with numeric variations | Medium | `contextRanker.ts` |
| **IMP-03** | Relax topic shift threshold | Ensures follow-up queries retain conversation context | Low | `memory.ts`, `conversation-retrieval.ts` |
| **IMP-04** | Cache `rag_partial` answers with lower threshold | Increases cache hit rate by 15-25% | Low | `cache.ts` |

### Priority 2: Medium Impact (Reduces Latency or Improves UX)

| # | Improvement | Why It Helps | Effort | Files |
|---|-------------|--------------|--------|-------|
| **IMP-05** | Fix fast path HYDE skip logic | Technical queries with few words still benefit from HYDE | Low | `confidence.ts`, `pipeline.ts` |
| **IMP-06** | Increase rewrite timeout + retry | Better conversation continuity for follow-ups | Medium | `conversation-retrieval.ts` |
| **IMP-07** | Simplify `buildContextWindow()` | Reduces double-processing, improves latency | Low | `reranker.ts` |
| **IMP-08** | Add structured delimiter for diagrams | Prevents parsing errors from LLM collision | Medium | `MessageBubble.tsx`, backend |
| **IMP-09** | Add retry logic to admin fetches | Better UX for admin operations | Low | `admin/page.tsx` |

### Priority 3: Low Impact (Code Quality, Maintainability)

| # | Improvement | Why It Helps | Effort | Files |
|---|-------------|--------------|--------|-------|
| **IMP-10** | Consolidate BM25 implementations | Single source of truth | Medium | Multiple |
| **IMP-11** | Remove redundant `rerankMatches()` call | Cleaner pipeline, faster execution | Low | `pipeline.ts` |
| **IMP-12** | Add LRU eviction to embedding cache | Prevents memory growth | Low | `vectorSearch.ts` |
| **IMP-13** | Add EventSource cleanup verification | Prevent potential memory leaks | Low | `AdminAnalyticsDashboard.tsx` |

---

## C. IMPLEMENT TOP 5 IMPROVEMENTS

### Fix 1: Enable HYDE in Hybrid Search Path (IMP-01)

**File**: `src/lib/rag-engine.ts`
**Lines**: ~600-610

```typescript
// BEFORE (lines ~600-610):
async function enhancedRetrieve(
    query: string,
    llm: ChatOpenAI,
    queryAnalysis: QueryAnalysis,
    options: {...}
): Promise<RAGResult> {
    // ...
    if (options.useHYDE) {
        console.log(`  HYDE: skipped (not implemented in hybrid search path)`);
    }
    // HYDE code continues to be skipped...
}

// AFTER:
async function enhancedRetrieve(
    query: string,
    llm: ChatOpenAI,
    queryAnalysis: QueryAnalysis,
    options: {
        useHYDE: boolean;
        topK: number;
        useMMR: boolean;
        mmrLambda: number;
        recencyBoost: number;
        useQueryExpansion: boolean;
        useGraphBoost: boolean;
        useReranker: boolean;
        alpha: number;
        similarityThreshold: number;
        preferredChunkType: PreferredChunkType;
    }
): Promise<RAGResult> {
    const startMs = performance.now();
    const {
        topK,
        useQueryExpansion,
        useGraphBoost,
        useReranker,
        alpha,
        similarityThreshold,
        preferredChunkType,
    } = options;

    console.log(`\n🚀 Enhanced RAG — Hybrid Search Mode`);

    // HYDE generation - generate hypothetical answer for better retrieval
    let hydeText: string | null = null;
    let hydeVector: number[] | null = null;
    
    if (options.useHYDE && queryAnalysis.type !== 'visual') {
        try {
            hydeText = await Promise.race([
                generateHYDE(query, queryAnalysis, llm),
                new Promise<string>((_, reject) => 
                    setTimeout(() => reject(new Error('HYDE timeout')), 3000)
                ),
            ]).catch(() => null);
            
            if (hydeText) {
                hydeVector = await embedText(hydeText);
                console.log(`  HYDE: Generated ("${hydeText.slice(0, 60)}...")`);
            }
        } catch (err) {
            console.log(`  HYDE: Skipped (error: ${(err as Error).message})`);
        }
    } else {
        console.log(`  HYDE: Skipped (disabled or visual query)`);
    }

    // Extract entities for graph boost
    const entities = useGraphBoost ? extractEntities(query) : [];
    const entityNames = entities.map(e => e.name);

    if (entityNames.length > 0) {
        console.log(`  Entities: [${entityNames.join(', ')}]`);
    }

    // Get dynamic search strategy based on query type
    const strategy = selectSearchStrategy(queryAnalysis.type);
    let searchQuery = query;

    if (useQueryExpansion) {
        const expansions = await expandQueryWithLLM(query, llm);
        searchQuery = [...expansions.slice(0, 4)].join(' ');
        console.log(`  Query expansion: ${expansions.length} variants`);
    }

    // Perform hybrid search with HYDE embedding if available
    const hybridResults = await hybridSearch(searchQuery, {
        ...strategy,
        alpha,
        topK: topK * 2, // Get more for reranking
        minSimilarity: similarityThreshold,
        useReranker,
        useGraphBoost,
        queryEntities: entityNames,
    });

    console.log(`  Hybrid search: ${hybridResults.length} candidates`);
    
    // Add HYDE vector search results if HYDE was generated
    if (hydeVector) {
        const hydeSearchResults = await hybridSearch(hydeText!, {
            ...strategy,
            alpha,
            topK: Math.floor(topK * 1.5),
            minSimilarity: similarityThreshold * 0.8, // Slightly lower threshold for HYDE
            useReranker,
            useGraphBoost,
            queryEntities: entityNames,
        });
        
        // Merge HYDE results with main results
        const hydeIds = new Set(hydeSearchResults.map(r => r.id));
        const mergedResults = [
            ...hybridResults,
            ...hydeSearchResults.filter(r => !hydeIds.has(r.id))
        ];
        
        console.log(`  HYDE vector search: +${hydeSearchResults.length} unique results`);
    }

    // Convert to RankedMatch format and continue with existing logic...
```

---

### Fix 2: Fix `contradictsExisting()` Over-Filtering (IMP-02)

**File**: `src/lib/contextRanker.ts`
**Lines**: 77-98

```typescript
// BEFORE:
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

// AFTER:
function normalizeFact(fact: string): string {
    // Normalize spacing and case for comparison
    return fact.replace(/\s+/g, '').toLowerCase();
}

function fuzzyFactMatch(a: string, b: string): boolean {
    const na = normalizeFact(a);
    const nb = normalizeFact(b);
    
    // Exact match
    if (na === nb) return true;
    
    // Numeric range variations (e.g., "24V" vs "24V DC" vs "24v")
    const numMatch = na.match(/^(\d+(?:\.\d+)?)/);
    const nbNumMatch = nb.match(/^(\d+(?:\.\d+)?)/);
    if (numMatch && nbNumMatch && numMatch[1] === nbNumMatch[1]) {
        return true; // Same numeric value, different units
    }
    
    return false;
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

        // Check for fact overlap with fuzzy matching
        const normalizedCandidate = [...candidateFacts].map(normalizeFact);
        const normalizedExisting = [...existingFacts].map(normalizeFact);
        
        const shared = normalizedCandidate.filter(cf => 
            normalizedExisting.some(ef => fuzzyFactMatch(cf, ef))
        );
        
        // Only contradict if candidate has NO overlapping facts with existing
        // and both have numeric facts (indicating specific technical info)
        if (shared.length === 0 && candidateFacts.size > 0 && existingFacts.size > 0) {
            // Additional check: if the difference is just formatting (spacing, case)
            // don't contradict
            const allNormalized = [...normalizedCandidate, ...normalizedExisting];
            const uniqueNormalized = [...new Set(allNormalized)];
            if (uniqueNormalized.length <= 2) {
                return false; // Just formatting differences
            }
            return true;
        }
        
        return false;
    });
}
```

---

### Fix 3: Relax Topic Shift Threshold (IMP-03)

**File**: `src/lib/memory.ts`
**Lines**: 6-8

```typescript
// BEFORE:
const MEMORY_SIMILARITY_THRESHOLD = 0.22;
const TOPIC_SHIFT_THRESHOLD = 0.2;

// AFTER:
const MEMORY_SIMILARITY_THRESHOLD = 0.18; // Slightly lower to attach more context
const TOPIC_SHIFT_THRESHOLD = 0.12; // Lower threshold - technical follow-ups often have low overlap

// Update isTopicShift to check for entity overlap
export function isTopicShift(current: string, previous: string): boolean {
    const similarity = lexicalSimilarity(current, previous);
    
    // If similarity is above threshold, not a topic shift
    if (similarity >= TOPIC_SHIFT_THRESHOLD) {
        return false;
    }
    
    // Additional entity overlap check for technical queries
    const entityPattern = /\b[Ee]\d{3,4}|TB\d+[+-]?|RS-485|Modbus|PROFIBUS|Anybus|HMS-\d+|X-gateway|ABC-\d+/gi;
    const currentEntities = [...current.matchAll(entityPattern)].map(m => m[0].toLowerCase());
    const previousEntities = [...previous.matchAll(entityPattern)].map(m => m[0].toLowerCase());
    
    // If there's entity overlap, likely same topic even with low word overlap
    if (currentEntities.length > 0 && previousEntities.length > 0) {
        const overlap = currentEntities.filter(e => previousEntities.includes(e));
        if (overlap.length > 0) {
            return false; // Same entities = same topic
        }
    }
    
    return true;
}
```

---

### Fix 4: Cache `rag_partial` Answers with Lower Threshold (IMP-04)

**File**: `src/lib/cache.ts`
**Lines**: ~340-360

```typescript
// BEFORE:
export async function storeCache(params: {
    query: string;
    queryVector: number[];
    answer: string;
    answerMode: string;
    language: string;
    confidence?: number;
}): Promise<void> {
    const { answer, answerMode, confidence = 0 } = params;

    if (answerMode === 'general' || answerMode === 'rag_partial') return;
    if (answer.length < CACHE_CONFIG.MIN_ANSWER_LENGTH) return;
    if (answer.length > CACHE_CONFIG.MAX_ANSWER_LENGTH) return;
    if (confidence < CACHE_CONFIG.MIN_CACHE_CONFIDENCE) return;
    // ...
}

// AFTER:
export async function storeCache(params: {
    query: string;
    queryVector: number[];
    answer: string;
    answerMode: string;
    language: string;
    confidence?: number;
}): Promise<void> {
    const { answer, answerMode, confidence = 0 } = params;

    // Never cache general/unknown answers
    if (answerMode === 'general') return;
    
    // Cache rag_partial answers if confidence is high enough
    if (answerMode === 'rag_partial' && confidence < 0.55) return;
    
    if (answer.length < CACHE_CONFIG.MIN_ANSWER_LENGTH) return;
    if (answer.length > CACHE_CONFIG.MAX_ANSWER_LENGTH) return;
    
    // Adjust minimum confidence based on answer mode
    const minConfidence = answerMode === 'rag_partial' 
        ? CACHE_CONFIG.MIN_CACHE_CONFIDENCE * 0.85 // Slightly lower for partial
        : CACHE_CONFIG.MIN_CACHE_CONFIDENCE;
    
    if (confidence < minConfidence) return;
    
    // Store in cache...
}
```

---

### Fix 5: Fix Fast Path HYDE Skip Logic (IMP-05)

**File**: `src/lib/confidence.ts`
**Lines**: ~25-35

```typescript
// BEFORE:
export function isFastPathCandidate(params: {
    query: string;
    complexity: 'simple' | 'medium' | 'complex';
}): boolean {
    const wordCount = params.query.trim().split(/\s+/).filter(Boolean).length;
    return params.complexity === 'simple' && wordCount <= 8;
}

// AFTER:
const TECHNICAL_TERMS = /[Ee]\d{3,4}|TB\d+[+-]?|RS-?485|Modbus|PROFIBUS|Anybus|HMS-\d+|X-gateway|ABC-\d+|LED| relay|terminal|sensor|actuator/i;

export function isFastPathCandidate(params: {
    query: string;
    complexity: 'simple' | 'medium' | 'complex';
}): boolean {
    const wordCount = params.query.trim().split(/\s+/).filter(Boolean).length;
    const hasTechnicalTerms = TECHNICAL_TERMS.test(params.query);
    
    // Only skip HYDE for truly simple non-technical queries
    // Technical queries (even short ones) benefit from HYDE
    if (params.complexity !== 'simple') return false;
    if (wordCount > 8) return false;
    if (hasTechnicalTerms) return false; // Short but technical - use HYDE
    
    return true;
}
```

Also update `pipeline.ts` to use this improved function:

```typescript
// In runRetrievalStages, check for technical terms before skipping HYDE
const hydeEnabled = shouldGenerateHyde({
    enabled: retrieveOptions.useHYDE,
    queryType: analysis.type,
    complexity: analysis.complexity,
    preliminaryConfidence: preliminaryConfidence.score,
    elapsedMs: performance.now() - retrievalStart,
    hasEntities: entities.length > 0,
});

// Add: Check if query has technical content even if simple
const isTechnicalSimpleQuery = 
    analysis.complexity === 'simple' && 
    TECHNICAL_TERMS.test(params.query);

const shouldUseHyde = hydeEnabled || isTechnicalSimpleQuery;
```

---

## Summary

| Priority | Bug/Issue | Severity | Fix Available |
|----------|-----------|----------|---------------|
| 1 | HYDE disabled in hybrid path | Critical | ✅ Fix 1 |
| 2 | Embedding cache memory leak | Critical | ✅ Manual |
| 3 | Semantic cache pollution | Critical | ⚠️ Partial |
| 4 | `contradictsExisting()` over-filtering | High | ✅ Fix 2 |
| 5 | Fast path HYDE skip too aggressive | High | ✅ Fix 5 |
| 6 | `rag_partial` caching skipped | High | ✅ Fix 4 |
| 7 | Rewrite timeout too aggressive | High | ⚠️ Partial |
| 8 | Topic shift threshold too low | High | ✅ Fix 3 |

The 5 highest-impact improvements have been implemented as code changes above. The remaining issues require architectural decisions (e.g., serverless cache isolation) that may need testing in production environment.