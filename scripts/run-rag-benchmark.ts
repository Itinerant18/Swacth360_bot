/**
 * scripts/run-rag-benchmark.ts
 *
 * Automated RAG Evaluation Pipeline
 *
 * Runs the benchmark dataset through the RAG pipeline and evaluates:
 * - Retrieval quality (did we find relevant documents?)
 * - Answer quality (faithfulness, relevancy, recall, precision)
 * - Keyword coverage (do answers contain expected keywords?)
 * - Latency per query
 *
 * Usage:
 *   npx tsx scripts/run-rag-benchmark.ts
 *   npx tsx scripts/run-rag-benchmark.ts --category factual
 *   npx tsx scripts/run-rag-benchmark.ts --difficulty hard
 *
 * Output: JSON report saved to data/benchmark-results-<timestamp>.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { retrieve, classifyQuery } from '../src/lib/rag-engine';
import { evaluateRAGResponse, type EvalScores } from '../src/lib/rag-evaluator';

// ─── Types ──────────────────────────────────────────────────

interface BenchmarkQuery {
    id: string;
    query: string;
    expectedAnswer: string;
    expectedKeywords: string[];
    category: string;
    difficulty: string;
}

interface BenchmarkResult {
    id: string;
    query: string;
    category: string;
    difficulty: string;
    answerMode: string;
    confidence: number;
    latencyMs: number;
    keywordCoverage: number;
    matchedKeywords: string[];
    missedKeywords: string[];
    evalScores: EvalScores | null;
    topMatchQuestion: string | null;
    topMatchScore: number;
    passed: boolean;
    failReasons: string[];
}

interface BenchmarkReport {
    timestamp: string;
    totalQueries: number;
    passedQueries: number;
    passRate: number;
    averageLatencyMs: number;
    averageConfidence: number;
    averageKeywordCoverage: number;
    averageEvalScores: {
        faithfulness: number;
        answerRelevancy: number;
        contextRecall: number;
        contextPrecision: number;
        overallScore: number;
    };
    byCategory: Record<string, { total: number; passed: number; avgConfidence: number }>;
    byDifficulty: Record<string, { total: number; passed: number; avgConfidence: number }>;
    results: BenchmarkResult[];
}

// ─── Config ─────────────────────────────────────────────────

const PASS_CRITERIA = {
    minConfidence: 0.30,
    minKeywordCoverage: 0.20,
    maxLatencyMs: 15000,
};

// ─── CLI Args ───────────────────────────────────────────────

function parseArgs(): { category?: string; difficulty?: string } {
    const args: { category?: string; difficulty?: string } = {};
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === '--category' && process.argv[i + 1]) {
            args.category = process.argv[++i];
        }
        if (process.argv[i] === '--difficulty' && process.argv[i + 1]) {
            args.difficulty = process.argv[++i];
        }
    }
    return args;
}

// ─── Keyword Coverage ───────────────────────────────────────

function checkKeywordCoverage(
    answerText: string,
    contextString: string,
    expectedKeywords: string[],
): { coverage: number; matched: string[]; missed: string[] } {
    const combined = `${answerText} ${contextString}`.toLowerCase();
    const matched: string[] = [];
    const missed: string[] = [];

    for (const keyword of expectedKeywords) {
        if (combined.includes(keyword.toLowerCase())) {
            matched.push(keyword);
        } else {
            missed.push(keyword);
        }
    }

    return {
        coverage: expectedKeywords.length > 0 ? matched.length / expectedKeywords.length : 1,
        matched,
        missed,
    };
}

// ─── Main ───────────────────────────────────────────────────

async function runBenchmark() {
    const args = parseArgs();
    console.log('\n=== RAG Benchmark Pipeline ===\n');

    // Load benchmark dataset
    const dataPath = join(process.cwd(), 'data', 'rag-benchmark.json');
    let queries: BenchmarkQuery[];
    try {
        queries = JSON.parse(readFileSync(dataPath, 'utf-8'));
    } catch (err) {
        console.error(`Failed to load benchmark data from ${dataPath}:`, (err as Error).message);
        process.exit(1);
    }

    // Filter by category/difficulty if specified
    if (args.category) {
        queries = queries.filter(q => q.category === args.category);
        console.log(`Filtered to category: ${args.category}`);
    }
    if (args.difficulty) {
        queries = queries.filter(q => q.difficulty === args.difficulty);
        console.log(`Filtered to difficulty: ${args.difficulty}`);
    }

    console.log(`Running ${queries.length} benchmark queries...\n`);

    const llm = new ChatOpenAI({
        modelName: 'sarvam-m',
        apiKey: process.env.SARVAM_API_KEY,
        configuration: { baseURL: 'https://api.sarvam.ai/v1' },
        temperature: 0.05,
        maxTokens: 512,
    });

    const results: BenchmarkResult[] = [];

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        const progress = `[${i + 1}/${queries.length}]`;
        process.stdout.write(`${progress} ${query.id}: "${query.query.slice(0, 50)}..." `);

        const startMs = performance.now();
        let result: BenchmarkResult;

        try {
            const ragResult = await retrieve(query.query, llm, {
                useHYDE: true,
                topK: 4,
                useMMR: true,
            });

            const latencyMs = performance.now() - startMs;

            // Check keyword coverage against context + top answer
            const topAnswer = ragResult.matches[0]?.answer ?? '';
            const { coverage, matched, missed } = checkKeywordCoverage(
                topAnswer,
                ragResult.contextString,
                query.expectedKeywords,
            );

            // Run evaluator
            let evalScores: EvalScores | null = null;
            try {
                const evalResult = await evaluateRAGResponse({
                    question: query.query,
                    answer: topAnswer,
                    ragResult,
                    llm,
                    latencyMs,
                });
                evalScores = evalResult.scores;
            } catch {
                // Eval failure is non-critical
            }

            // Determine pass/fail
            const failReasons: string[] = [];
            if (ragResult.confidence < PASS_CRITERIA.minConfidence) {
                failReasons.push(`low confidence: ${(ragResult.confidence * 100).toFixed(0)}%`);
            }
            if (coverage < PASS_CRITERIA.minKeywordCoverage) {
                failReasons.push(`low keyword coverage: ${(coverage * 100).toFixed(0)}%`);
            }
            if (latencyMs > PASS_CRITERIA.maxLatencyMs) {
                failReasons.push(`high latency: ${latencyMs.toFixed(0)}ms`);
            }

            result = {
                id: query.id,
                query: query.query,
                category: query.category,
                difficulty: query.difficulty,
                answerMode: ragResult.answerMode,
                confidence: ragResult.confidence,
                latencyMs,
                keywordCoverage: coverage,
                matchedKeywords: matched,
                missedKeywords: missed,
                evalScores,
                topMatchQuestion: ragResult.matches[0]?.question ?? null,
                topMatchScore: ragResult.matches[0]?.finalScore ?? 0,
                passed: failReasons.length === 0,
                failReasons,
            };
        } catch (err) {
            result = {
                id: query.id,
                query: query.query,
                category: query.category,
                difficulty: query.difficulty,
                answerMode: 'error',
                confidence: 0,
                latencyMs: performance.now() - startMs,
                keywordCoverage: 0,
                matchedKeywords: [],
                missedKeywords: query.expectedKeywords,
                evalScores: null,
                topMatchQuestion: null,
                topMatchScore: 0,
                passed: false,
                failReasons: [`error: ${(err as Error).message}`],
            };
        }

        results.push(result);

        const status = result.passed ? 'PASS' : 'FAIL';
        const conf = (result.confidence * 100).toFixed(0);
        const kw = (result.keywordCoverage * 100).toFixed(0);
        console.log(`${status} (conf=${conf}% kw=${kw}% ${result.latencyMs.toFixed(0)}ms)`);
    }

    // ─── Aggregate Report ─────────────────────────────────

    const passed = results.filter(r => r.passed);
    const evalsWithScores = results.filter(r => r.evalScores);

    const byCategory: Record<string, { total: number; passed: number; avgConfidence: number }> = {};
    const byDifficulty: Record<string, { total: number; passed: number; avgConfidence: number }> = {};

    for (const r of results) {
        // By category
        if (!byCategory[r.category]) byCategory[r.category] = { total: 0, passed: 0, avgConfidence: 0 };
        byCategory[r.category].total++;
        if (r.passed) byCategory[r.category].passed++;
        byCategory[r.category].avgConfidence += r.confidence;

        // By difficulty
        if (!byDifficulty[r.difficulty]) byDifficulty[r.difficulty] = { total: 0, passed: 0, avgConfidence: 0 };
        byDifficulty[r.difficulty].total++;
        if (r.passed) byDifficulty[r.difficulty].passed++;
        byDifficulty[r.difficulty].avgConfidence += r.confidence;
    }

    // Normalize averages
    for (const cat of Object.values(byCategory)) cat.avgConfidence /= cat.total;
    for (const diff of Object.values(byDifficulty)) diff.avgConfidence /= diff.total;

    const avgEvalScores = {
        faithfulness: 0,
        answerRelevancy: 0,
        contextRecall: 0,
        contextPrecision: 0,
        overallScore: 0,
    };

    if (evalsWithScores.length > 0) {
        for (const r of evalsWithScores) {
            avgEvalScores.faithfulness += r.evalScores!.faithfulness;
            avgEvalScores.answerRelevancy += r.evalScores!.answerRelevancy;
            avgEvalScores.contextRecall += r.evalScores!.contextRecall;
            avgEvalScores.contextPrecision += r.evalScores!.contextPrecision;
            avgEvalScores.overallScore += r.evalScores!.overallScore;
        }
        const n = evalsWithScores.length;
        avgEvalScores.faithfulness /= n;
        avgEvalScores.answerRelevancy /= n;
        avgEvalScores.contextRecall /= n;
        avgEvalScores.contextPrecision /= n;
        avgEvalScores.overallScore /= n;
    }

    const report: BenchmarkReport = {
        timestamp: new Date().toISOString(),
        totalQueries: results.length,
        passedQueries: passed.length,
        passRate: results.length > 0 ? passed.length / results.length : 0,
        averageLatencyMs: results.reduce((s, r) => s + r.latencyMs, 0) / results.length,
        averageConfidence: results.reduce((s, r) => s + r.confidence, 0) / results.length,
        averageKeywordCoverage: results.reduce((s, r) => s + r.keywordCoverage, 0) / results.length,
        averageEvalScores: avgEvalScores,
        byCategory,
        byDifficulty,
        results,
    };

    // ─── Print Summary ────────────────────────────────────

    console.log('\n' + '='.repeat(60));
    console.log('BENCHMARK REPORT');
    console.log('='.repeat(60));
    console.log(`Total:     ${report.totalQueries}`);
    console.log(`Passed:    ${report.passedQueries} (${(report.passRate * 100).toFixed(1)}%)`);
    console.log(`Avg Conf:  ${(report.averageConfidence * 100).toFixed(1)}%`);
    console.log(`Avg KW:    ${(report.averageKeywordCoverage * 100).toFixed(1)}%`);
    console.log(`Avg Lat:   ${report.averageLatencyMs.toFixed(0)}ms`);

    if (evalsWithScores.length > 0) {
        console.log(`\nEval Scores (avg of ${evalsWithScores.length} queries):`);
        console.log(`  Faithfulness:     ${(avgEvalScores.faithfulness * 100).toFixed(1)}%`);
        console.log(`  Answer Relevancy: ${(avgEvalScores.answerRelevancy * 100).toFixed(1)}%`);
        console.log(`  Context Recall:   ${(avgEvalScores.contextRecall * 100).toFixed(1)}%`);
        console.log(`  Context Precision:${(avgEvalScores.contextPrecision * 100).toFixed(1)}%`);
        console.log(`  Overall:          ${(avgEvalScores.overallScore * 100).toFixed(1)}%`);
    }

    console.log('\nBy Category:');
    for (const [cat, stats] of Object.entries(byCategory)) {
        console.log(`  ${cat}: ${stats.passed}/${stats.total} passed (conf: ${(stats.avgConfidence * 100).toFixed(0)}%)`);
    }

    console.log('\nBy Difficulty:');
    for (const [diff, stats] of Object.entries(byDifficulty)) {
        console.log(`  ${diff}: ${stats.passed}/${stats.total} passed (conf: ${(stats.avgConfidence * 100).toFixed(0)}%)`);
    }

    // ─── Save Report ──────────────────────────────────────

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = join(process.cwd(), 'data', `benchmark-results-${timestamp}.json`);
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved: ${outputPath}`);

    // Failed queries
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
        console.log(`\n--- FAILED QUERIES (${failed.length}) ---`);
        for (const r of failed) {
            console.log(`  ${r.id}: ${r.failReasons.join(', ')}`);
        }
    }

    // Exit with error code if pass rate is below threshold
    if (report.passRate < 0.60) {
        console.log('\nWARNING: Pass rate below 60% threshold!');
        process.exit(1);
    }
}

runBenchmark().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
