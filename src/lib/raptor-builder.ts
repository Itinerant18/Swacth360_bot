/**
 * src/lib/raptor-builder.ts
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  RAPTOR — Recursive Abstractive Processing for Tree-Organized║
 * ║  Retrieval (Guo et al., 2024)                               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * This module builds the RAPTOR cluster tree over the hms_knowledge table.
 *
 * Run via: POST /api/admin/raptor/build
 * (also called automatically after each PDF ingestion)
 *
 * Pipeline:
 *   1. Fetch all level-0 chunks from hms_knowledge
 *   2. K-means cluster their embeddings (k = n_chunks / CLUSTER_SIZE)
 *   3. For each cluster: LLM generates a summary → embed → store in raptor_clusters
 *   4. Repeat recursively on level-1 summaries to build level-2
 *   5. Stop when < MIN_CLUSTERS_FOR_NEXT_LEVEL clusters remain
 *
 * Why this works:
 *   A question like "What are the common failure modes across all HMS panels?"
 *   won't match any single chunk well (it's cross-document).
 *   But it WILL match a level-2 cluster summary that synthesizes all
 *   troubleshooting entries across all sources.
 *
 *   Complex queries hit higher-level clusters → broad context.
 *   Specific queries hit level-0 chunks → precise detail.
 *   Both run in the SAME vector search, ranked by similarity.
 */

import { ChatOpenAI } from '@langchain/openai';
import { embedTexts } from './embeddings';
import { getSupabase } from './supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const RAPTOR_CONFIG = {
    CLUSTER_SIZE: 10,   // target chunks per cluster
    MIN_CLUSTER_SIZE: 3,   // skip clusters smaller than this
    MIN_CLUSTERS_FOR_NEXT_LEVEL: 3,  // stop recursion when fewer clusters exist
    MAX_LEVELS: 3,   // L1, L2, L3 (L0 = raw chunks)
    SUMMARY_MAX_TOKENS: 300,   // LLM summary length
    BATCH_SIZE: 20,   // embed N summaries at once
    FETCH_LIMIT: 3000,   // max chunks to cluster (performance cap)
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface KBChunk {
    id: string;
    content: string;
    answer: string;
    category: string;
    entities: string[];
    source_name: string;
    embedding: number[];
}

interface Cluster {
    centroidIdx: number;
    memberIds: string[];
    members: KBChunk[];
    category: string;     // dominant category
    entities: string[];   // merged entities
    sourceNames: string[];   // unique sources covered
}

interface RaptorNode {
    id?: string;      // set after DB insert
    level: number;
    clusterId: number;
    summary: string;
    embedding: number[];
    childIds: string[];
    childLevel: number;
    entryCount: number;
    category: string;
    entities: string[];
    sourceNames: string[];
    qualityScore: number;
}

export class RaptorBuildInProgressError extends Error {
    constructor() {
        super('RAPTOR build already in progress');
        this.name = 'RaptorBuildInProgressError';
    }
}

function parsePgVector(value: unknown): number[] {
    if (Array.isArray(value)) {
        return value.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n));
            }
        } catch {
            return value
                .replace(/^\[/, '')
                .replace(/\]$/, '')
                .split(',')
                .map((n) => Number(n.trim()))
                .filter((n) => Number.isFinite(n));
        }
    }

    return [];
}

// ─── K-Means Clustering ───────────────────────────────────────────────────────

/**
 * Simple k-means implementation on embedding vectors.
 * Uses Euclidean distance (cosine is equivalent after normalization).
 *
 * We implement our own to avoid adding heavy ML dependencies.
 * For 2500 chunks × 1536 dims: ~3s runtime, acceptable for a background job.
 */
function kMeans(embeddings: number[][], k: number, maxIter = 20): number[] {
    const n = embeddings.length;
    const dim = embeddings[0].length;

    if (k >= n) return embeddings.map((_, i) => i % k);

    // Init: k-means++ seeding (spread initial centroids)
    const centroids: number[][] = [embeddings[Math.floor(Math.random() * n)]];
    while (centroids.length < k) {
        // Pick next centroid proportional to distance² from nearest existing
        const distances = embeddings.map(emb => {
            const dists = centroids.map(c => euclideanDistSq(emb, c));
            return Math.min(...dists);
        });
        const totalDist = distances.reduce((s, d) => s + d, 0);
        let rand = Math.random() * totalDist;
        let chosen = 0;
        for (let i = 0; i < n; i++) {
            rand -= distances[i];
            if (rand <= 0) { chosen = i; break; }
        }
        centroids.push([...embeddings[chosen]]);
    }

    let assignments = new Array(n).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
        // Assignment step
        const newAssignments = embeddings.map(emb => {
            let minDist = Infinity;
            let minIdx = 0;
            for (let c = 0; c < k; c++) {
                const dist = euclideanDistSq(emb, centroids[c]);
                if (dist < minDist) { minDist = dist; minIdx = c; }
            }
            return minIdx;
        });

        // Check convergence
        const changed = newAssignments.some((a, i) => a !== assignments[i]);
        assignments = newAssignments;
        if (!changed) break;

        // Update step: recompute centroids
        for (let c = 0; c < k; c++) {
            const members = embeddings.filter((_, i) => assignments[i] === c);
            if (members.length === 0) continue;
            for (let d = 0; d < dim; d++) {
                centroids[c][d] = members.reduce((s, m) => s + m[d], 0) / members.length;
            }
        }
    }

    return assignments;
}

function euclideanDistSq(a: number[], b: number[]): number {
    return a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0);
}

// ─── Cluster Builder ──────────────────────────────────────────────────────────

function buildClusters(chunks: KBChunk[], assignments: number[], k: number): Cluster[] {
    const clusters: Cluster[] = [];

    for (let c = 0; c < k; c++) {
        const members = chunks.filter((_, i) => assignments[i] === c);
        if (members.length < RAPTOR_CONFIG.MIN_CLUSTER_SIZE) continue;

        // Dominant category
        const catCounts: Record<string, number> = {};
        members.forEach(m => { catCounts[m.category] = (catCounts[m.category] ?? 0) + 1; });
        const category = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];

        // Merged entities (unique, capped)
        const entities = [...new Set(members.flatMap(m => m.entities ?? []))].slice(0, 10);

        // Unique source names
        const sourceNames = [...new Set(members.map(m => m.source_name))];

        // Find centroid member (closest to cluster mean)
        const centroidIdx = 0; // simplified — use first member

        clusters.push({
            centroidIdx,
            memberIds: members.map(m => m.id),
            members,
            category,
            entities,
            sourceNames,
        });
    }

    return clusters;
}

// ─── LLM Summary Generation ───────────────────────────────────────────────────

async function generateClusterSummary(
    cluster: Cluster,
    level: number,
    llm: ChatOpenAI,
): Promise<string> {
    const contentSample = cluster.members
        .slice(0, 6)
        .map(m => `• ${(m.answer || m.content).slice(0, 200)}`)
        .join('\n');

    const levelHint = level === 1
        ? 'a technical topic summary for field engineers'
        : 'a high-level overview connecting multiple HMS topics';

    const prompt = `You are building a searchable knowledge index for HMS industrial panel support.

Write ${levelHint} that synthesizes these related entries.
The summary must be:
- Self-contained (no references to "the above" or "these entries")
- Specific: include key values, codes, protocols, terminal labels where present
- 3-5 sentences maximum
- Useful for someone searching for this topic

Category: ${cluster.category}
Entities: ${cluster.entities.join(', ') || 'general'}
Sources: ${cluster.sourceNames.join(', ')}

Entries:
${contentSample}

Write the summary (no preamble):`;

    try {
        const result = await llm.invoke(prompt);
        const summary = (result.content as string).trim().slice(0, 800);
        return summary || `HMS ${cluster.category} — ${cluster.entities.join(', ')} (${cluster.members.length} entries from ${cluster.sourceNames.join(', ')})`;
    } catch {
        // Fallback summary
        return `${cluster.category}: covers ${cluster.entities.join(', ')} across ${cluster.members.length} entries from ${cluster.sourceNames.join(', ')}.`;
    }
}

/**
 * Cluster coherence score: how similar are members to each other?
 * High score = tight, focused cluster. Low = noisy.
 */
function computeQualityScore(members: KBChunk[]): number {
    if (members.length < 2) return 1.0;
    // Sample pairwise cosine similarities (up to 5 members)
    const sample = members.slice(0, 5);
    let total = 0;
    let count = 0;
    for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
            const a = sample[i].embedding;
            const b = sample[j].embedding;
            const dot = a.reduce((s, v, k) => s + v * (b[k] ?? 0), 0);
            const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
            const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
            total += (magA && magB) ? dot / (magA * magB) : 0;
            count++;
        }
    }
    return count > 0 ? total / count : 0.5;
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

/**
 * buildRaptorTree()
 *
 * Main entry point. Rebuilds the RAPTOR cluster tree from scratch.
 *
 * Called by: POST /api/admin/raptor/build
 *            (also hooks into ingest pipeline after new PDFs)
 *
 * Returns: build stats for the admin response
 */
export async function buildRaptorTree(llm: ChatOpenAI): Promise<{
    levelsBuilt: number;
    clustersBuilt: number;
    chunksIndexed: number;
}> {
    const supabase = getSupabase();

    // Log start
    const { data: buildLog, error: buildLogError } = await supabase
        .from('raptor_build_log')
        .insert({ triggered_by: 'manual', status: 'running' })
        .select('id')
        .single();
    if (buildLogError) {
        if (buildLogError.code === '23505') {
            throw new RaptorBuildInProgressError();
        }
        throw new Error(`Failed to start RAPTOR build log: ${buildLogError.message}`);
    }
    const buildLogId = buildLog?.id;
    if (!buildLogId) {
        throw new Error('Failed to start RAPTOR build log');
    }

    let totalClusters = 0;
    let levelsBuilt = 0;

    try {
        console.log(`\n🌳 RAPTOR BUILD STARTED`);

        // ── Step 1: Fetch level-0 chunks ────────────────────────────────────
        console.log(`   Fetching KB chunks...`);
        const { data: rawChunks, error } = await supabase
            .from('hms_knowledge')
            .select('id, content, answer, category, entities, source_name, embedding')
            .eq('is_archived', false)
            .not('embedding', 'is', null)
            .in('chunk_type', ['chunk', 'proposition'])
            .limit(RAPTOR_CONFIG.FETCH_LIMIT);

        if (error || !rawChunks?.length) throw new Error(`Failed to fetch chunks: ${error?.message}`);

        const chunks: KBChunk[] = rawChunks
            .map(r => ({
                ...r,
                embedding: parsePgVector(r.embedding),
                entities: r.entities ?? [],
            }))
            .filter((chunk) => chunk.embedding.length > 0);

        console.log(`   ${chunks.length} chunks loaded`);

        // ── Step 2: Clear existing RAPTOR clusters ────────────────────────
        await supabase.from('raptor_clusters').delete().gte('level', 0);

        // ── Step 3: Build tree level by level ────────────────────────────
        let currentLevelChunks: KBChunk[] = chunks;
        let currentLevel = 0;
        while (currentLevel < RAPTOR_CONFIG.MAX_LEVELS) {
            currentLevel++;

            const k = Math.max(2, Math.ceil(currentLevelChunks.length / RAPTOR_CONFIG.CLUSTER_SIZE));
            if (k < RAPTOR_CONFIG.MIN_CLUSTERS_FOR_NEXT_LEVEL) {
                console.log(`   Level ${currentLevel}: only ${k} clusters needed — tree complete`);
                break;
            }

            console.log(`\n   🔵 Level ${currentLevel}: k-means(k=${k}) on ${currentLevelChunks.length} items...`);

            // K-means cluster the embeddings
            const embeddings = currentLevelChunks.map(c => c.embedding);
            const assignments = kMeans(embeddings, k);
            const clusters = buildClusters(currentLevelChunks, assignments, k);

            console.log(`   → ${clusters.length} valid clusters`);

            // Generate summaries + embeddings for each cluster (batch)
            const nodes: RaptorNode[] = [];
            const summaries: string[] = [];

            for (let i = 0; i < clusters.length; i++) {
                const cluster = clusters[i];
                const summary = await generateClusterSummary(cluster, currentLevel, llm);
                summaries.push(summary);

                nodes.push({
                    level: currentLevel,
                    clusterId: i,
                    summary,
                    embedding: [],  // filled after batch embed
                    childIds: cluster.memberIds,
                    childLevel: currentLevel - 1,
                    entryCount: cluster.members.length,
                    category: cluster.category,
                    entities: cluster.entities,
                    sourceNames: cluster.sourceNames,
                    qualityScore: computeQualityScore(cluster.members),
                });
            }

            // Batch embed all summaries
            console.log(`   Embedding ${summaries.length} summaries...`);
            for (let i = 0; i < summaries.length; i += RAPTOR_CONFIG.BATCH_SIZE) {
                const batch = summaries.slice(i, i + RAPTOR_CONFIG.BATCH_SIZE);
                const embeddings = await embedTexts(batch);
                embeddings.forEach((emb, j) => { nodes[i + j].embedding = emb; });
            }

            // Insert into DB
            console.log(`   Storing ${nodes.length} cluster nodes...`);
            const insertRows = nodes.map(n => ({
                build_id: buildLogId,
                level: n.level,
                cluster_id: n.clusterId,
                summary: n.summary,
                embedding: n.embedding,
                child_ids: n.childIds,
                child_level: n.childLevel,
                entry_count: n.entryCount,
                category: n.category,
                entities: n.entities,
                source_names: n.sourceNames,
                quality_score: n.qualityScore,
            }));

            // Insert in batches of 50
            for (let i = 0; i < insertRows.length; i += 50) {
                const batch = insertRows.slice(i, i + 50);
                const { data: inserted, error: insertError } = await supabase
                    .from('raptor_clusters')
                    .insert(batch)
                    .select('id');
                if (insertError) {
                    throw new Error(`Failed to store RAPTOR clusters: ${insertError.message}`);
                }

                if (inserted) {
                    inserted.forEach((row, j) => { nodes[i + j].id = row.id; });
                }
            }

            totalClusters += nodes.length;
            levelsBuilt = currentLevel;

            // Next level: treat cluster nodes as the new "chunks"
            currentLevelChunks = nodes.map(n => ({
                id: n.id ?? '',
                content: n.summary,
                answer: n.summary,
                category: n.category,
                entities: n.entities,
                source_name: n.sourceNames[0] ?? 'raptor',
                embedding: n.embedding,
            }));

            console.log(`   ✅ Level ${currentLevel} complete: ${nodes.length} clusters`);
        }

        let clustersBuilt = totalClusters;
        const { count: exactClusterCount, error: countError } = await supabase
            .from('raptor_clusters')
            .select('*', { count: 'exact', head: true })
            .eq('build_id', buildLogId);
        if (!countError && typeof exactClusterCount === 'number') {
            clustersBuilt = exactClusterCount;
        }

        // Update build log
        await supabase.from('raptor_build_log').update({
            status: 'complete',
            levels_built: levelsBuilt,
            clusters_built: clustersBuilt,
            chunks_indexed: chunks.length,
            completed_at: new Date().toISOString(),
        }).eq('id', buildLogId);

        console.log(`\n🌳 RAPTOR BUILD COMPLETE`);
        console.log(`   Levels: ${levelsBuilt} | Clusters: ${clustersBuilt} | Chunks: ${chunks.length}`);

        return { levelsBuilt, clustersBuilt, chunksIndexed: chunks.length };

    } catch (err: any) {
        console.error(`❌ RAPTOR BUILD FAILED: ${err.message}`);
        if (buildLogId) {
            await supabase.from('raptor_clusters').delete().eq('build_id', buildLogId);
            await supabase.from('raptor_build_log').update({
                status: 'failed',
                error_msg: err.message,
                completed_at: new Date().toISOString(),
            }).eq('id', buildLogId);
        }
        throw err;
    }
}
