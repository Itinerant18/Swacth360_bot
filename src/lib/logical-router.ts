/**
 * src/lib/logical-router.ts
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  LOGICAL ROUTING — Architecture Node: "Routing → Logical"   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * What this does:
 *   Before touching the vector store, decide: which DATA SOURCE
 *   can best answer this query?
 *
 *   Route A → Vector Store (hms_knowledge)
 *             "What causes E001?" "How do I wire RS-485?"
 *
 *   Route B → Relational DB (chat_sessions, unknown_questions,
 *             ingestion_log, kb_health, kb_sources)
 *             "What PDFs have been uploaded?"
 *             "Which questions have no answer?"
 *             "How many knowledge base entries are there?"
 *
 *   Route C → Hybrid (both, merge results)
 *             "What do we know about RS-485 and what's missing?"
 *
 * Why this matters:
 *   Without logical routing, EVERY query hits the vector store.
 *   Admin/analytics queries get zero relevant results from vectors,
 *   waste latency, and fall through to general LLM with no context.
 *   With routing, they get EXACT answers from structured DB.
 */

import { getSupabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogicalRoute = 'vector' | 'relational' | 'hybrid';

export interface LogicalRouteDecision {
  route: LogicalRoute;
  reason: string;
  query?: string;       // structured query to execute (if relational)
  confidence: number;   // 0-1, how sure we are about this route
}

export interface RelationalResult {
  answer: string;
  data: Record<string, unknown>[];
  source: string;       // which table/view answered this
}

// ─── Pattern Matchers for Relational Queries ─────────────────────────────────

interface RelationalPattern {
  patterns: RegExp[];
  handler: (query: string) => Promise<RelationalResult | null>;
  label: string;
}

// ─── Relational Query Handlers ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleKBStats(__query: string): Promise<RelationalResult | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kb_health')
    .select('*')
    .order('total_entries', { ascending: false });

  if (error || !data?.length) return null;

  const total = data.reduce((s, r) => s + (r.total_entries ?? 0), 0);
  const withEmbeddings = data.reduce((s, r) => s + (r.with_embeddings ?? 0), 0);
  const types = data.map(r => `${r.chunk_type}: ${r.total_entries}`).join(', ');

  return {
    answer: `The knowledge base contains **${total.toLocaleString()} total entries** (${withEmbeddings.toLocaleString()} with embeddings).\n\nBreakdown by type: ${types}.\n\nLast updated: ${data[0]?.last_updated ? new Date(data[0].last_updated).toLocaleDateString() : 'unknown'}.`,
    data,
    source: 'kb_health',
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleSourceList(__query: string): Promise<RelationalResult | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kb_sources')
    .select('source_name, entry_count, last_updated, source_label')
    .order('entry_count', { ascending: false })
    .limit(20);

  if (error || !data?.length) return null;

  const rows = data.map(r =>
    `- **${r.source_name}**: ${r.entry_count} entries (${r.source_label ?? r.source_name})`
  ).join('\n');

  return {
    answer: `**Ingested Knowledge Sources** (${data.length} sources):\n\n${rows}`,
    data,
    source: 'kb_sources',
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleUnknownQuestions(__query: string): Promise<RelationalResult | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('unknown_questions')
    .select('english_text, frequency, top_similarity, status')
    .eq('status', 'pending')
    .order('frequency', { ascending: false })
    .limit(10);

  if (error || !data?.length) return null;

  const rows = data.map((r, i) =>
    `${i + 1}. "${r.english_text}" — asked **${r.frequency}x** (similarity: ${(r.top_similarity * 100).toFixed(0)}%)`
  ).join('\n');

  return {
    answer: `**Top ${data.length} Unanswered Questions** (pending review):\n\n${rows}\n\n💡 These can be answered in the Admin → Unknown Questions panel.`,
    data,
    source: 'unknown_questions',
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleIngestionHistory(__query: string): Promise<RelationalResult | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ingestion_log')
    .select('source_name, input_type, total_chunks, success_count, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data?.length) return null;

  const rows = data.map(r =>
    `- **${r.source_name}** (${r.input_type}): ${r.success_count}/${r.total_chunks} chunks — ${r.status} — ${new Date(r.created_at).toLocaleDateString()}`
  ).join('\n');

  return {
    answer: `**Recent Training History** (last ${data.length} ingestions):\n\n${rows}`,
    data,
    source: 'ingestion_log',
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleQueryAnalytics(__query: string): Promise<RelationalResult | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('answer_mode_summary')
    .select('answer_mode, total, avg_similarity, day')
    .order('day', { ascending: false })
    .limit(20);

  if (error || !data?.length) return null;

  // Group by mode
  const byMode: Record<string, { total: number; avgSim: number }> = {};
  for (const row of data) {
    if (!byMode[row.answer_mode]) byMode[row.answer_mode] = { total: 0, avgSim: 0 };
    byMode[row.answer_mode].total += row.total;
    byMode[row.answer_mode].avgSim = row.avg_similarity;
  }

  const grandTotal = Object.values(byMode).reduce((s, r) => s + r.total, 0);
  const rows = Object.entries(byMode)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([mode, stats]) =>
      `- **${mode}**: ${stats.total} queries (${((stats.total / grandTotal) * 100).toFixed(0)}%) | avg confidence: ${(stats.avgSim * 100).toFixed(0)}%`
    ).join('\n');

  return {
    answer: `**Chat Analytics** (${grandTotal} total queries):\n\n${rows}\n\n💡 High 'general' % means the KB needs more entries on those topics.`,
    data,
    source: 'answer_mode_summary',
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleEntityCoverage(__query: string): Promise<RelationalResult | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kb_entity_coverage')
    .select('entity, mention_count, categories')
    .order('mention_count', { ascending: false })
    .limit(15);

  if (error || !data?.length) return null;

  const rows = data.map(r =>
    `- **${r.entity}**: ${r.mention_count} mentions (${r.categories})`
  ).join('\n');

  return {
    answer: `**Top HMS Entities in Knowledge Base**:\n\n${rows}`,
    data,
    source: 'kb_entity_coverage',
  };
}

// ─── Pattern → Handler Map ────────────────────────────────────────────────────

const RELATIONAL_PATTERNS: RelationalPattern[] = [
  {
    label: 'KB Stats',
    patterns: [
      /\b(how many|total|count|size|number of)\b.*\b(entr|chunk|knowledge|kb|database)\b/i,
      /\b(kb|knowledge base)\b.*\b(stat|size|count|health|status)\b/i,
      /\bhow (big|large) is\b.*\b(kb|knowledge|database)\b/i,
    ],
    handler: handleKBStats,
  },
  {
    label: 'Source List',
    patterns: [
      /\b(which|what|list|show)\b.*\b(pdf|document|file|source|manual)\b.*\b(upload|ingest|train|added|in the kb)\b/i,
      /\b(uploaded|ingested|trained on)\b.*\b(pdf|document|file|source|manual)\b/i,
      /\bwhat (pdf|document|manual|file)s?\b/i,
    ],
    handler: handleSourceList,
  },
  {
    label: 'Unknown Questions',
    patterns: [
      /\b(unanswer|unknown|gap|missing|no answer|pending)\b.*\b(question|query)\b/i,
      /\bwhat (question|query|topic)s?\b.*\b(unanswer|unknown|missing|not covered)\b/i,
      /\b(question|query|topic)s?\b.*\b(not in kb|not covered|missing|no answer)\b/i,
    ],
    handler: handleUnknownQuestions,
  },
  {
    label: 'Ingestion History',
    patterns: [
      /\b(when|last|recent|history)\b.*\b(train|ingest|upload|add)\b/i,
      /\b(training|ingestion|upload)\b.*\b(history|log|recent|last)\b/i,
      /\blast (train|ingest|upload)\b/i,
    ],
    handler: handleIngestionHistory,
  },
  {
    label: 'Chat Analytics',
    patterns: [
      /\b(how|what)\b.*\b(often|frequently|much|many)\b.*\b(rag|general|answer|mode)\b/i,
      /\b(chat|query|conversation)\b.*\b(stat|analytic|metric|performance)\b/i,
      /\b(answer mode|rag rate|hit rate|success rate)\b/i,
    ],
    handler: handleQueryAnalytics,
  },
  {
    label: 'Entity Coverage',
    patterns: [
      /\b(which|what)\b.*\b(error code|entity|protocol|product)\b.*\b(cover|in kb|known|index)\b/i,
      /\b(entity|entities|error code)\b.*\b(cover|index|in kb|known)\b/i,
    ],
    handler: handleEntityCoverage,
  },
];

// ─── Main Logical Router ──────────────────────────────────────────────────────

/**
 * logicalRoute()
 *
 * Inspects the query and decides:
 *   1. Should this go to the vector store?
 *   2. Should this go to the relational DB?
 *   3. Both?
 *
 * Returns a LogicalRouteDecision with an optional pre-fetched RelationalResult
 * so the chat route can skip vector retrieval entirely for DB queries.
 */
export async function logicalRoute(query: string): Promise<{
  decision: LogicalRouteDecision;
  relationalResult?: RelationalResult;
}> {
  const lower = query.toLowerCase();

  // ── Try each relational pattern ──────────────────────────────────────────
  for (const pattern of RELATIONAL_PATTERNS) {
    const matched = pattern.patterns.some(p => p.test(lower));
    if (matched) {
      console.log(`\n🗄️  LOGICAL ROUTE: Relational DB → ${pattern.label}`);

      try {
        const result = await pattern.handler(query);
        if (result) {
          return {
            decision: {
              route: 'relational',
              reason: `Query matches ${pattern.label} pattern — answered from structured DB`,
              confidence: 0.92,
            },
            relationalResult: result,
          };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Warning: Relational handler failed (${pattern.label}): ${message}`);
      }
    }
  }

  // ── Hybrid: meta-questions that need both ────────────────────────────────
  const isMetaHybrid = /\b(what do we know about|how well covered is|how much do we know)\b/i.test(lower);
  if (isMetaHybrid) {
    console.log(`\n🔀 LOGICAL ROUTE: Hybrid (vector + relational)`);
    return {
      decision: {
        route: 'hybrid',
        reason: 'Meta-question about KB coverage — checking both vector store and DB stats',
        confidence: 0.75,
      },
    };
  }

  // ── Default: vector store ────────────────────────────────────────────────
  console.log(`\nLOGICAL ROUTE: Vector DB`);
  return {
    decision: {
      route: 'vector',
      reason: 'Technical query — routing to vector store',
      confidence: 0.95,
    },
  };
}

/**
 * formatRelationalAnswer()
 *
 * Wraps a RelationalResult into a stream-ready response string.
 * This bypasses the LLM entirely for DB queries — faster and more accurate.
 */
export function formatRelationalAnswer(result: RelationalResult, langName: string): string {
  // For non-English, prepend a note (full translation would need LLM)
  const note = langName !== 'English'
    ? `*(Data from knowledge base — showing in English)*\n\n`
    : '';
  return `${note}${result.answer}\n\n*Source: \`${result.source}\` table*`;
}


