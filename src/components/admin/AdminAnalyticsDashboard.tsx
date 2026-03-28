'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowsRotate,
    faBook,
    faBolt,
    faBrain,
    faCircleExclamation,
    faClock,
    faComment,
    faDatabase,
    faDollarSign,
    faFire,
    faGaugeHigh,
    faLayerGroup,
    faRobot,
    faServer,
    faTriangleExclamation,
    faWaveSquare,
} from '@fortawesome/free-solid-svg-icons';
import {
    normalizeAnalytics,
    normalizeFailures,
    normalizeMetrics,
    normalizePerformance,
    type NormalizedAnalytics,
    type NormalizedFailures,
    type NormalizedMetrics,
    type NormalizedPerformance,
} from '@/lib/adminAdapter';
import { adminFetch } from '@/lib/adminFetch';

interface DashboardData {
    analytics: NormalizedAnalytics;
    realtime: NormalizedMetrics;
    performance: NormalizedPerformance;
    failures: NormalizedFailures;
}

const EMPTY_DASHBOARD: DashboardData = {
    analytics: normalizeAnalytics(null),
    realtime: normalizeMetrics(null),
    performance: normalizePerformance(null),
    failures: normalizeFailures(null),
};

function getErrorMessage(payload: unknown, fallback: string): string {
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        return payload.error;
    }

    return fallback;
}

async function fetchAdminJson(url: string): Promise<unknown> {
    const response = await adminFetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
        },
    });

    let json: unknown = null;
    try {
        json = await response.json();
    } catch {
        json = null;
    }

    if (!response.ok) {
        throw new Error(getErrorMessage(json, `Request failed for ${url}`));
    }

    return json;
}

function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
}

function formatCount(value: number): string {
    return new Intl.NumberFormat().format(Math.round(value));
}

function formatMs(value: number): string {
    return `${Math.round(value)} ms`;
}

function formatDateTime(value: string): string {
    if (!value) {
        return 'Unknown time';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatConfidence(value: number | null): string {
    if (value === null || Number.isNaN(value)) {
        return 'n/a';
    }

    return formatPercent(value);
}

function MetricTile({
    label,
    value,
    hint,
    icon,
    accent = 'text-[#1C1917]',
}: {
    label: string;
    value: string | number;
    hint?: string;
    icon: IconDefinition;
    accent?: string;
}) {
    return (
        <div className="skeuo-card p-5 md:p-6 rounded-xl min-w-0 overflow-hidden h-full">
            <div className="flex items-start justify-between gap-4 min-w-0">
                <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-[#78716C]">{label}</p>
                    <p className={`mt-2 text-2xl sm:text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
                    {hint ? <p className="mt-1 text-xs text-[#A8A29E]">{hint}</p> : null}
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#CA8A04]/10 text-[#CA8A04] flex items-center justify-center flex-shrink-0">
                    <FontAwesomeIcon icon={icon} className="w-4 h-4" />
                </div>
            </div>
        </div>
    );
}

function SectionCard({
    title,
    subtitle,
    icon,
    children,
}: {
    title: string;
    subtitle?: string;
    icon: IconDefinition;
    children: ReactNode;
}) {
    return (
        <div className="skeuo-card p-5 md:p-6 rounded-xl min-w-0 overflow-hidden">
            <div className="flex items-start gap-4 mb-6 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/20 text-[#0D9488] flex items-center justify-center flex-shrink-0">
                    <FontAwesomeIcon icon={icon} className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-[#1C1917]">{title}</h3>
                    {subtitle ? <p className="text-xs sm:text-sm text-[#78716C] mt-1">{subtitle}</p> : null}
                </div>
            </div>
            {children}
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="rounded-xl border border-dashed border-[#D6CFC4] bg-[#FAF7F2] px-4 py-6 text-sm text-[#78716C] text-center">
            {message}
        </div>
    );
}

function BarList({
    title,
    items,
    formatter,
    emptyLabel,
}: {
    title: string;
    items: Array<{ key: string; label: string; value: number }>;
    formatter: (value: number) => string;
    emptyLabel: string;
}) {
    const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0);

    return (
        <div className="w-full h-full min-w-0 overflow-hidden rounded-xl border border-[#E8E0D4] bg-[#FAF7F2] p-5 md:p-6">
            <h4 className="text-xs uppercase tracking-wider text-[#78716C] mb-4">{title}</h4>
            {items.length === 0 ? (
                <EmptyState message={emptyLabel} />
            ) : (
                <div className="space-y-4">
                    {items.map((item) => (
                        <div key={item.key}>
                            <div className="flex items-center justify-between gap-3 text-xs sm:text-sm mb-1.5">
                                <span className="text-[#44403C]">{item.label}</span>
                                <span className="font-mono text-[#78716C]">{formatter(item.value)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-[#E8E0D4] overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#0D9488] to-[#CA8A04]"
                                    style={{ width: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function AdminAnalyticsDashboard() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const loadDashboard = useCallback(async (background = false) => {
        if (background) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError(null);
        setWarning(null);

        const results = await Promise.allSettled([
            fetchAdminJson('/api/admin/analytics'),
            fetchAdminJson('/api/admin/metrics?realtime=true'),
            fetchAdminJson('/api/admin/performance?hours=24'),
            fetchAdminJson('/api/admin/failures?limit=10'),
        ]);

        const warnings: string[] = [];
        const nextData: DashboardData = {
            analytics: EMPTY_DASHBOARD.analytics,
            realtime: EMPTY_DASHBOARD.realtime,
            performance: EMPTY_DASHBOARD.performance,
            failures: EMPTY_DASHBOARD.failures,
        };

        if (results[0].status === 'fulfilled') {
            nextData.analytics = normalizeAnalytics(results[0].value);
        } else {
            warnings.push(`Analytics: ${results[0].reason instanceof Error ? results[0].reason.message : 'Failed to load'}`);
        }

        if (results[1].status === 'fulfilled') {
            nextData.realtime = normalizeMetrics(results[1].value);
        } else {
            warnings.push(`Metrics: ${results[1].reason instanceof Error ? results[1].reason.message : 'Failed to load'}`);
        }

        if (results[2].status === 'fulfilled') {
            nextData.performance = normalizePerformance(results[2].value);
        } else {
            warnings.push(`Performance: ${results[2].reason instanceof Error ? results[2].reason.message : 'Failed to load'}`);
        }

        if (results[3].status === 'fulfilled') {
            nextData.failures = normalizeFailures(results[3].value);
        } else {
            warnings.push(`Failures: ${results[3].reason instanceof Error ? results[3].reason.message : 'Failed to load'}`);
        }

        const successfulResponses = results.filter((result) => result.status === 'fulfilled').length;
        if (successfulResponses === 0) {
            setData(null);
            setError('Dashboard data is unavailable right now.');
            setLoading(false);
            setRefreshing(false);
            return;
        }

        setData(nextData);
        setLastUpdated(new Date().toISOString());
        setWarning(warnings.length > 0 ? warnings.join(' | ') : null);
        setLoading(false);
        setRefreshing(false);
    }, []);

    const refreshRealtimeMetrics = useCallback(async () => {
        try {
            const realtimeJson = await fetchAdminJson('/api/admin/metrics?realtime=true');
            setData((current) => current ? {
                ...current,
                realtime: normalizeMetrics(realtimeJson),
            } : current);
            setLastUpdated(new Date().toISOString());
        } catch (err) {
            console.error('[admin.dashboard] realtime refresh failed', err);
        }
    }, []);

    useEffect(() => {
        const initialLoadId = window.setTimeout(() => {
            void loadDashboard(false);
        }, 0);

        const intervalId = window.setInterval(() => {
            void refreshRealtimeMetrics();
        }, 15000);

        return () => {
            window.clearTimeout(initialLoadId);
            window.clearInterval(intervalId);
        };
    }, [loadDashboard, refreshRealtimeMetrics]);

    if (loading) {
        return (
            <div className="skeuo-card p-6 md:p-8 rounded-xl min-w-0 overflow-hidden text-center">
                <p className="text-sm text-[#78716C]">Loading dashboard...</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="skeuo-card p-6 md:p-8 rounded-xl min-w-0 overflow-hidden text-center">
                <p className="text-sm text-[#78716C]">No data available</p>
                {error ? <p className="text-xs text-red-700 mt-2">{error}</p> : null}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="skeuo-card p-5 md:p-6 rounded-xl min-w-0 overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-sm sm:text-base font-semibold text-[#1C1917]">Assistant Monitoring</h2>
                        <p className="text-xs sm:text-sm text-[#78716C] mt-1">
                            Historical analytics stay separate from the real-time pipeline feed.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        {lastUpdated ? (
                            <span className="text-xs text-[#A8A29E]">Updated {formatDateTime(lastUpdated)}</span>
                        ) : null}
                        <button
                            onClick={() => void loadDashboard(true)}
                            className="skeuo-raised px-3 py-2 text-xs sm:text-sm text-[#44403C] flex items-center gap-2"
                        >
                            <FontAwesomeIcon icon={faArrowsRotate} className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            {error ? (
                <div className="skeuo-card p-5 md:p-6 rounded-xl min-w-0 overflow-hidden border-red-200 bg-red-50/40">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            ) : null}

            {warning ? (
                <div className="skeuo-card p-5 md:p-6 rounded-xl min-w-0 overflow-hidden border-amber-200 bg-amber-50/40">
                    <p className="text-sm text-amber-800">{warning}</p>
                </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                <MetricTile
                    label="Avg Latency"
                    value={formatMs(data.analytics.monitoring.avgLatency)}
                    hint="Historical / last 24h"
                    icon={faGaugeHigh}
                />
                <MetricTile
                    label="Cache Hit Rate"
                    value={formatPercent(data.analytics.monitoring.cacheHitRate)}
                    hint="Exact + semantic cache"
                    icon={faDatabase}
                    accent="text-emerald-700"
                />
                <MetricTile
                    label="Failure Rate"
                    value={formatPercent(data.analytics.monitoring.failureRate)}
                    hint="Assistant monitoring"
                    icon={faTriangleExclamation}
                    accent="text-red-700"
                />
                <MetricTile
                    label="HYDE Usage"
                    value={formatPercent(data.analytics.monitoring.hydeUsageRate)}
                    hint="Historical / last 24h"
                    icon={faBrain}
                    accent="text-[#0D9488]"
                />
                <MetricTile
                    label="LLM Calls"
                    value={data.analytics.monitoring.llmCalls.toFixed(2)}
                    hint="Average per request"
                    icon={faRobot}
                    accent="text-amber-700"
                />
                <MetricTile
                    label="Realtime Requests"
                    value={formatCount(data.realtime.count)}
                    hint={data.realtime.window || 'Live buffer'}
                    icon={faBolt}
                    accent="text-[#0D9488]"
                />
            </div>

            <SectionCard
                title="Real-Time Pipeline"
                subtitle="Live system metrics (real-time)"
                icon={faWaveSquare}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-6">
                    <MetricTile label="P50" value={formatMs(data.realtime.p50Latency)} icon={faClock} />
                    <MetricTile label="P95" value={formatMs(data.realtime.p95Latency)} icon={faClock} accent="text-amber-700" />
                    <MetricTile label="P99" value={formatMs(data.realtime.p99Latency)} icon={faClock} accent="text-red-700" />
                    <MetricTile label="Avg Confidence" value={formatPercent(data.realtime.avgConfidence)} icon={faLayerGroup} accent="text-[#0D9488]" />
                    <MetricTile label="Error Rate" value={formatPercent(data.realtime.errorRate)} icon={faCircleExclamation} accent="text-red-700" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6">
                    <BarList
                        title="Average Stage Timing"
                        items={data.realtime.stages}
                        formatter={formatMs}
                        emptyLabel="No real-time stage data yet."
                    />
                    <BarList
                        title="Answer Mode Distribution"
                        items={data.realtime.answerModes}
                        formatter={formatCount}
                        emptyLabel="No real-time answer modes yet."
                    />
                </div>

                {data.realtime.costSavings ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mt-8 first:mt-0">
                        <MetricTile
                            label="HYDE Skip Savings"
                            value={`$${data.realtime.costSavings.hydeSkipSavings}`}
                            hint="From skipping unnecessary HYDE calls"
                            icon={faDollarSign}
                            accent="text-emerald-700"
                        />
                        <MetricTile
                            label="Cache Hit Savings"
                            value={`$${data.realtime.costSavings.cacheHitSavings}`}
                            hint="From serving cached responses"
                            icon={faDollarSign}
                            accent="text-emerald-700"
                        />
                        <MetricTile
                            label="Total Estimated Savings"
                            value={`$${data.realtime.costSavings.totalEstimatedSavingsUsd}`}
                            hint="Combined LLM cost reduction"
                            icon={faDollarSign}
                            accent="text-[#0D9488]"
                        />
                    </div>
                ) : null}
            </SectionCard>

            <SectionCard
                title="Historical Assistant Analytics"
                subtitle="Historical assistant monitoring and quality trends"
                icon={faServer}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <MetricTile
                        label="Samples"
                        value={formatCount(data.analytics.monitoring.count)}
                        hint="Logged assistant requests"
                        icon={faComment}
                    />
                    <MetricTile
                        label="Semantic Cache"
                        value={formatPercent(data.analytics.monitoring.semanticCacheHitRate)}
                        hint="Semantic cache only"
                        icon={faDatabase}
                        accent="text-[#0D9488]"
                    />
                    <MetricTile
                        label="Feedback"
                        value={formatCount(data.analytics.feedback.total)}
                        hint={`${formatCount(data.analytics.feedback.positive)} positive / ${formatCount(data.analytics.feedback.negative)} negative`}
                        icon={faBook}
                    />
                    <MetricTile
                        label="Pending Unknown"
                        value={formatCount(data.analytics.unknownQuestions.pending)}
                        hint="Needs admin review"
                        icon={faFire}
                        accent="text-red-700"
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6">
                    <BarList
                        title="Top Queries"
                        items={data.analytics.monitoring.topQueries.map((entry) => ({
                            key: entry.query,
                            label: entry.query || 'Untitled query',
                            value: entry.count,
                        }))}
                        formatter={formatCount}
                        emptyLabel="No historical queries yet."
                    />
                    <div className="w-full h-full min-w-0 overflow-hidden rounded-xl border border-[#E8E0D4] bg-[#FAF7F2] p-5 md:p-6">
                        <h4 className="text-xs uppercase tracking-wider text-[#78716C] mb-4">Low Confidence Queries</h4>
                        {data.analytics.monitoring.lowConfidence.length === 0 ? (
                            <EmptyState message="No low-confidence queries recorded." />
                        ) : (
                            <div className="space-y-4">
                                {data.analytics.monitoring.lowConfidence.map((entry, index) => (
                                    <div key={`${entry.query}-${entry.createdAt}-${index}`} className="rounded-xl border border-[#E8E0D4] bg-white/70 px-4 py-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <p className="text-sm text-[#44403C] line-clamp-2">{entry.query || 'Untitled query'}</p>
                                            <span className="text-xs font-mono text-red-700">{formatPercent(entry.confidence)}</span>
                                        </div>
                                        <p className="text-[11px] text-[#A8A29E] mt-1">{formatDateTime(entry.createdAt)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="Performance Diagnostics"
                subtitle="Historical latency, cache, and performance trends"
                icon={faGaugeHigh}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <MetricTile label="Avg Latency" value={formatMs(data.performance.avgLatency)} icon={faClock} />
                    <MetricTile label="Cache Hit Rate" value={formatPercent(data.performance.cacheHitRate)} icon={faDatabase} accent="text-emerald-700" />
                    <MetricTile label="Failure Rate" value={formatPercent(data.performance.failureRate)} icon={faTriangleExclamation} accent="text-red-700" />
                    <MetricTile label="HYDE Usage" value={formatPercent(data.performance.hydeUsageRate)} icon={faBrain} accent="text-[#0D9488]" />
                </div>

                <div className="w-full h-full min-w-0 overflow-hidden rounded-xl border border-[#E8E0D4] bg-[#FAF7F2] p-5 md:p-6">
                    <h4 className="text-xs uppercase tracking-wider text-[#78716C] mb-4">Slowest Requests</h4>
                    {data.performance.slowestRequests.length === 0 ? (
                        <EmptyState message="No historical slow-request data available." />
                    ) : (
                        <div className="space-y-4">
                            {data.performance.slowestRequests.map((entry, index) => (
                                <div key={`${entry.query}-${entry.createdAt}-${index}`} className="rounded-xl border border-[#E8E0D4] bg-white/70 px-4 py-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <p className="text-sm text-[#44403C] line-clamp-2">{entry.query || 'Untitled query'}</p>
                                        <span className="text-xs font-mono text-[#0D9488]">{formatMs(entry.responseTimeMs)}</span>
                                    </div>
                                    <p className="text-[11px] text-[#A8A29E] mt-1">{formatDateTime(entry.createdAt)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SectionCard>

            <SectionCard
                title="Failures"
                subtitle="Recent failure signals and fallback events"
                icon={faTriangleExclamation}
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6">
                    <BarList
                        title="Failure Reasons"
                        items={data.failures.reasons.map((entry) => ({
                            key: entry.reason,
                            label: entry.reason || 'Unknown reason',
                            value: entry.count,
                        }))}
                        formatter={formatCount}
                        emptyLabel="No failure reasons recorded."
                    />
                    <div className="w-full h-full min-w-0 overflow-hidden rounded-xl border border-[#E8E0D4] bg-[#FAF7F2] p-5 md:p-6">
                        <h4 className="text-xs uppercase tracking-wider text-[#78716C] mb-4">Recent Failures</h4>
                        {data.failures.recent.length === 0 ? (
                            <EmptyState message="No recent failures recorded." />
                        ) : (
                            <div className="space-y-4">
                                {data.failures.recent.map((entry) => (
                                    <div key={`${entry.requestId}-${entry.createdAt}`} className="rounded-xl border border-[#E8E0D4] bg-white/70 px-4 py-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-medium text-[#44403C]">{entry.reason || 'Unknown reason'}</p>
                                                <p className="text-xs text-[#78716C] mt-1 line-clamp-2">{entry.query || 'Untitled query'}</p>
                                            </div>
                                            <span className="text-xs font-mono text-red-700">{formatConfidence(entry.confidence)}</span>
                                        </div>
                                        <p className="text-[11px] text-[#A8A29E] mt-2">{formatDateTime(entry.createdAt)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="Usage Overview"
                subtitle="Operational usage overview for the assistant"
                icon={faComment}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-6">
                    {data.analytics.conversations.isNewSystem ? (
                        <>
                            <MetricTile label="Conversations" value={formatCount(data.analytics.conversations.total)} icon={faComment} />
                            <MetricTile label="Messages" value={formatCount(data.analytics.conversations.totalMessages)} icon={faBook} accent="text-emerald-700" />
                        </>
                    ) : (
                        <>
                            <MetricTile label="Total Chats" value={formatCount(data.analytics.totalChats)} icon={faComment} />
                            <MetricTile label="RAG Answers" value={`${formatCount(data.analytics.ragCount)} (${data.analytics.ragPercent}%)`} icon={faBook} accent="text-emerald-700" />
                        </>
                    )}
                    <MetricTile label="LLM Fallback" value={formatCount(data.analytics.generalCount)} icon={faRobot} accent="text-amber-700" />
                    <MetricTile label="Diagram Answers" value={`${formatCount(data.analytics.diagramCount)} (${data.analytics.diagramPercent}%)`} icon={faLayerGroup} accent="text-[#0D9488]" />
                    <MetricTile label="Token Requests" value={formatCount(data.analytics.tokenUsage.totalRequests)} icon={faDatabase} hint={`${formatCount(data.analytics.tokenUsage.totalTokens)} total tokens`} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6">
                    <div className="w-full h-full min-w-0 overflow-hidden rounded-xl border border-[#E8E0D4] bg-[#FAF7F2] p-5 md:p-6">
                        <h4 className="text-xs uppercase tracking-wider text-[#78716C] mb-4">Knowledge Base</h4>
                        {data.analytics.knowledgeBase.length === 0 ? (
                            <EmptyState message="No knowledge base records found." />
                        ) : (
                            <div className="space-y-4">
                                {data.analytics.knowledgeBase.map((entry) => (
                                    <div key={entry.source} className="flex items-center justify-between rounded-xl border border-[#E8E0D4] bg-white/70 px-3 py-2.5">
                                        <span className="text-sm text-[#44403C]">{entry.name}</span>
                                        <span className="text-xs font-mono text-[#78716C]">{formatCount(entry.count)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-full h-full min-w-0 overflow-hidden rounded-xl border border-[#E8E0D4] bg-[#FAF7F2] p-5 md:p-6">
                        <h4 className="text-xs uppercase tracking-wider text-[#78716C] mb-4">Top Unknown Questions</h4>
                        {data.analytics.topUnknown.length === 0 ? (
                            <EmptyState message="No unknown-question records yet." />
                        ) : (
                            <div className="space-y-4">
                                {data.analytics.topUnknown.map((entry, index) => (
                                    <div key={`${entry.englishText}-${index}`} className="rounded-xl border border-[#E8E0D4] bg-white/70 px-4 py-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <p className="text-sm text-[#44403C] line-clamp-2">{entry.englishText || entry.userQuestion || 'Untitled question'}</p>
                                            <span className="text-xs font-mono text-red-700">{formatCount(entry.frequency)}x</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full min-w-0 overflow-hidden rounded-xl border border-[#E8E0D4] bg-[#FAF7F2] p-5 md:p-6 mt-8 first:mt-0">
                    <h4 className="text-xs uppercase tracking-wider text-[#78716C] mb-4">Recent Sessions</h4>
                    {data.analytics.recentSessions.length === 0 ? (
                        <EmptyState message="No recent sessions available." />
                    ) : (
                        <div className="w-full min-w-0 overflow-x-auto">
                            <table className="w-full min-w-[520px] text-xs sm:text-sm">
                                <thead>
                                    <tr className="text-left text-[#78716C] uppercase text-[10px] sm:text-xs">
                                        <th className="pb-3 pr-3">Question</th>
                                        <th className="pb-3 pr-3">Mode</th>
                                        <th className="pb-3 pr-3">Similarity</th>
                                        <th className="pb-3 text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.analytics.recentSessions.map((entry, index) => (
                                        <tr key={`${entry.userQuestion}-${entry.createdAt}-${index}`} className="border-t border-[#E8E0D4]">
                                            <td className="py-2.5 pr-3 text-[#44403C] max-w-[260px] truncate">{entry.userQuestion || 'Untitled question'}</td>
                                            <td className="py-2.5 pr-3 text-[#78716C]">{entry.answerMode || '-'}</td>
                                            <td className="py-2.5 pr-3 text-[#78716C]">{entry.topSimilarity > 0 ? formatPercent(entry.topSimilarity) : '-'}</td>
                                            <td className="py-2.5 text-right text-[#A8A29E]">{formatDateTime(entry.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </SectionCard>
        </div>
    );
}
