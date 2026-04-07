'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faGear, faPenToSquare, faChartLine,
    faCircleCheck, faRocket, faComment, faClock, faUsers,
    faPhone, faEnvelope, faUpload, faFileAlt, faCloudUploadAlt,
    faCheckCircle, faTimesCircle, faMinusCircle, faSpinner,
    faDatabase, faDiagramProject, faSliders, faStar,
    faSignOutAlt, faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';
import AdminAnalyticsDashboard from '@/components/admin/AdminAnalyticsDashboard';
import GraphTab from '@/components/GraphTab';
import RAGSettingsTab from '@/components/RAGSettingsTab';
import FeedbackTab from '@/components/FeedbackTab';
import { adminFetch } from '@/lib/adminFetch';
import { signOut } from '@/lib/auth';
import { consumeFetchSse } from '@/lib/fetchSse';

type UnknownQuestion = {
    id: string;
    user_question: string;
    english_text: string;
    top_similarity: number;
    frequency: number;
    status: string;
    created_at: string;
};

type TrackedUser = {
    id: string; name: string; phone: string; email: string;
    created_at: string; queryCount: number; lastActive: string;
};

type IngestResult = {
    id: string;
    question: string;
    status: 'success' | 'skipped' | 'error' | 'duplicate';
    type: 'text' | 'proposition' | 'image';
    error?: string;
};

type IngestResponse = {
    success: boolean;
    sourceName: string;
    inputType: 'pdf' | 'text';
    totalChunks: number;
    totalImages: number;
    successCount: number;
    skippedCount: number;
    errorCount: number;
    duplicateCount: number;
    textSuccess: number;
    propositionSuccess?: number;
    imageSuccess: number;
    imageTypes: string[];
    results: IngestResult[];
    error?: string;
};

type IngestProgress = {
    sourceName: string;
    inputType: 'pdf' | 'text';
    stage: 'preparing' | 'text' | 'image' | 'finalizing';
    message: string;
    totalUnits: number;
    processedUnits: number;
    successCount: number;
    skippedCount: number;
    errorCount: number;
    duplicateCount: number;
    textSuccess: number;
    propositionSuccess: number;
    imageSuccess: number;
    totalChunks: number;
    totalImages: number;
    imageTypes: string[];
    lastResult?: IngestResult;
};

// Tab type
type Tab = 'review' | 'analytics' | 'users' | 'ingest' | 'graph' | 'settings' | 'feedback' | 'raptor';

const RAPTOR_ACTIVE_BUILD_WINDOW_MS = 30 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

function isRaptorBuildActive(startedAt: string): boolean {
    const startedAtMs = new Date(startedAt).getTime();
    return Number.isFinite(startedAtMs) && (Date.now() - startedAtMs) < RAPTOR_ACTIVE_BUILD_WINDOW_MS;
}

function isRaptorBuildSuccessful(status: string): boolean {
    return status === 'complete' || status === 'completed';
}

export default function AdminDashboard() {
    const [tab, setTab] = useState<Tab>('review');
    const [questions, setQuestions] = useState<UnknownQuestion[]>([]);
    const [users, setUsers] = useState<TrackedUser[]>([]);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [usersLoading, setUsersLoading] = useState(false);
    const [reviewBadgeReady, setReviewBadgeReady] = useState(false);
    const [usersBadgeReady, setUsersBadgeReady] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [answerText, setAnswerText] = useState('');
    const [category, setCategory] = useState('');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');
    const [reviewError, setReviewError] = useState('');
    const [usersError, setUsersError] = useState('');
    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

    // RAPTOR state
    const [raptorHealth, setRaptorHealth] = useState<{ level: number; cluster_count: number; total_leaf_coverage: number; avg_quality: string; avg_children: string }[]>([]);
    const [raptorBuildLog, setRaptorBuildLog] = useState<{ id: string; status: string; started_at: string; completed_at?: string; clusters_built?: number; error_msg?: string }[]>([]);
    const [raptorLoading, setRaptorLoading] = useState(false);
    const [raptorError, setRaptorError] = useState('');
    const [raptorInfo, setRaptorInfo] = useState('');
    const [raptorBuilding, setRaptorBuilding] = useState(false);

    // Ingest state
    const [ingestMode, setIngestMode] = useState<'pdf' | 'text'>('pdf');
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [rawText, setRawText] = useState('');
    const [sourceName, setSourceName] = useState('');
    const [processing, setProcessing] = useState(false);
    const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
    const [ingestError, setIngestError] = useState('');
    const [ingestProgress, setIngestProgress] = useState<IngestProgress | null>(null);
    const [ingestLiveResults, setIngestLiveResults] = useState<IngestResult[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const didPrefetchCountsRef = useRef(false);

    const handleSignOut = async () => {
        await signOut();
        window.location.href = '/login';
    };

    const fetchQuestions = useCallback(async () => {
        setReviewLoading(true);
        setReviewError('');
        try {
            const res = await adminFetch('/api/admin/questions?status=pending');
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to load review queue');
            }

            setQuestions(data.questions || []);
            if (data.offline) {
                setReviewError('Review queue is temporarily unavailable.');
            }
        } catch (err: unknown) {
            setQuestions([]);
            setReviewError((err as Error).message || 'Failed to load review queue');
        } finally {
            setReviewLoading(false);
            setReviewBadgeReady(true);
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        setUsersLoading(true);
        setUsersError('');
        try {
            const res = await adminFetch('/api/users');
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to load users');
            }

            setUsers(data.users || []);
        } catch (err: unknown) {
            setUsers([]);
            setUsersError((err as Error).message || 'Failed to load users');
        } finally {
            setUsersLoading(false);
            setUsersBadgeReady(true);
        }
    }, []);

    const fetchRaptor = useCallback(async (background = false) => {
        if (!background) {
            setRaptorLoading(true);
        }
        setRaptorError('');
        try {
            const res = await adminFetch('/api/admin/raptor');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load RAPTOR data');
            const nextHealth = data.health || [];
            const nextBuildLog = data.buildLog || [];
            const hasRunningBuild = nextBuildLog.some((log: { status?: string; started_at: string }) => {
                if (log.status !== 'running') return false;
                return isRaptorBuildActive(log.started_at);
            });

            setRaptorHealth(nextHealth);
            setRaptorBuildLog(nextBuildLog);
            setRaptorBuilding(hasRunningBuild);
            if (hasRunningBuild) {
                setRaptorInfo((current) => current || 'A RAPTOR build is currently running. Build history refreshes automatically.');
            } else {
                setRaptorInfo('');
            }
        } catch (err: unknown) {
            setRaptorError((err as Error).message || 'Failed to load RAPTOR data');
        } finally {
            if (!background) {
                setRaptorLoading(false);
            }
        }
    }, []);

    const triggerRaptorBuild = async () => {
        setRaptorBuilding(true);
        setRaptorError('');
        setRaptorInfo('A RAPTOR build is currently running. Build history refreshes automatically.');

        let keepBuilding = false;

        try {
            const res = await adminFetch('/api/admin/raptor', { method: 'POST' });
            const data = await res.json();

            if (res.status === 409) {
                keepBuilding = true;
                setRaptorError('');
                setRaptorInfo(data.error || 'RAPTOR build already in progress. Build history refreshes automatically.');
                await fetchRaptor(true);
                return;
            }

            if (res.status === 202) {
                keepBuilding = true;
                setRaptorError('');
                setRaptorInfo(data.message || 'RAPTOR build started in background.');
                showToast(data.message || 'RAPTOR build started in background');
                await fetchRaptor(true);
                return;
            }

            if (!res.ok) throw new Error(data.error || 'Build failed');

            setRaptorInfo('');
            showToast(`RAPTOR build complete: ${data.stats?.totalClusters ?? 0} clusters`);
            await fetchRaptor(true);
        } catch (err: unknown) {
            const message = (err as Error).message || 'Build failed';
            setRaptorInfo('');
            setRaptorError(message);
            showToast(`Error: ${message}`);
        } finally {
            if (!keepBuilding) {
                setRaptorBuilding(false);
            }
        }
    };

    useEffect(() => {
        if (didPrefetchCountsRef.current) {
            return;
        }

        didPrefetchCountsRef.current = true;
        void fetchQuestions();
        void fetchUsers();
    }, [fetchQuestions, fetchUsers]);

    useEffect(() => {
        if (tab === 'raptor') {
            void fetchRaptor();
        }
    }, [tab, fetchRaptor]);

    useEffect(() => {
        if (tab !== 'raptor' || !raptorBuilding) {
            return;
        }

        const pollId = window.setInterval(() => {
            void fetchRaptor(true);
        }, 10000);

        return () => {
            window.clearInterval(pollId);
        };
    }, [tab, raptorBuilding, fetchRaptor]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const handleSaveAndTrain = async (q: UnknownQuestion) => {
        if (!answerText.trim()) return;
        setActiveQuestionId(q.id);
        setSaving(true);
        try {
            const res = await adminFetch('/api/admin/seed-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionId: q.id,
                    answer: answerText,
                    category: category || 'general',
                    englishQuestion: q.english_text,
                }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to save answer');
            }

            showToast(data.message || 'Bot trained!');
            setExpandedId(null);
            setAnswerText('');
            setCategory('');
            await fetchQuestions();
        } catch (err: unknown) {
            showToast(`Error: ${(err as Error).message}`);
        }
        setActiveQuestionId(null);
        setSaving(false);
    };

    const handleDismiss = async (id: string) => {
        setActiveQuestionId(id);
        try {
            const res = await adminFetch('/api/admin/questions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: 'dismissed' }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to dismiss question');
            }

            if (expandedId === id) {
                setExpandedId(null);
                setAnswerText('');
                setCategory('');
            }

            await fetchQuestions();
            showToast('Dismissed');
        } catch (err: unknown) {
            showToast(`Error: ${(err as Error).message}`);
        }
        setActiveQuestionId(null);
    };

    // Ingest handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    };
    const handleDragLeave = () => setDragOver(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.pdf')) {
            setSelectedFile(file);
            if (!sourceName) setSourceName(file.name.replace('.pdf', ''));
            setIngestError('');
        } else {
            setIngestError('Please drop a PDF file.');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.name.toLowerCase().endsWith('.pdf')) {
            setSelectedFile(file);
            if (!sourceName) setSourceName(file.name.replace('.pdf', ''));
            setIngestError('');
        } else if (file) {
            setSelectedFile(null);
            setIngestError('Please choose a PDF file.');
        }
    };

    const handleIngest = async () => {
        if (ingestMode === 'pdf' && !selectedFile) {
            setIngestError('Please select a PDF file.');
            return;
        }
        if (ingestMode === 'text' && rawText.trim().length < 50) {
            setIngestError('Please enter at least 50 characters of text.');
            return;
        }

        setProcessing(true);
        setIngestResult(null);
        setIngestError('');
        setIngestLiveResults([]);
        setIngestProgress({
            sourceName: sourceName || selectedFile?.name || 'Admin Text Input',
            inputType: ingestMode,
            stage: 'preparing',
            message: 'Preparing ingestion pipeline...',
            totalUnits: 0,
            processedUnits: 0,
            successCount: 0,
            skippedCount: 0,
            errorCount: 0,
            duplicateCount: 0,
            textSuccess: 0,
            propositionSuccess: 0,
            imageSuccess: 0,
            totalChunks: 0,
            totalImages: 0,
            imageTypes: [],
        });

        try {
            let response: Response;

            if (ingestMode === 'pdf') {
                const form = new FormData();
                form.append('file', selectedFile!);
                form.append('sourceName', sourceName || selectedFile!.name);
                response = await adminFetch('/api/admin/ingest', { method: 'POST', body: form });
            } else {
                response = await adminFetch('/api/admin/ingest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: rawText, sourceName: sourceName || 'Admin Text Input' }),
                });
            }

            if (!response.ok) {
                let errorMessage = 'Training failed';

                try {
                    const payload = await response.json() as { error?: string };
                    if (payload?.error) {
                        errorMessage = payload.error;
                    }
                } catch {
                    const fallbackText = await response.text().catch(() => '');
                    if (fallbackText.trim()) {
                        errorMessage = fallbackText.trim();
                    }
                }

                throw new Error(errorMessage);
            }

            const contentType = response.headers.get('content-type') ?? '';

            if (contentType.includes('text/event-stream')) {
                let finalResult: IngestResponse | null = null;

                await consumeFetchSse(response, async ({ event, data }) => {
                    if (event === 'progress' && isRecord(data)) {
                        const progress = data as IngestProgress;
                        setIngestProgress(progress);
                        return;
                    }

                    if (event === 'chunk' && isRecord(data)) {
                        setIngestLiveResults((current) => [...current, data as IngestResult]);
                        return;
                    }

                    if (event === 'complete' && isRecord(data)) {
                        const complete = data as IngestResponse;
                        finalResult = complete;
                        setIngestResult(complete);
                        setIngestProgress(null);
                        return;
                    }

                    if (event === 'error') {
                        if (isRecord(data) && typeof data.message === 'string') {
                            throw new Error(data.message);
                        }

                        throw new Error('Training failed');
                    }
                });

                if (!finalResult) {
                    throw new Error('Training stream ended before completion.');
                }

                const completedResult = finalResult as IngestResponse;

                if (completedResult.successCount > 0) {
                    showToast(`Added ${completedResult.successCount} knowledge entries`);
                } else if (completedResult.duplicateCount > 0) {
                    showToast(`No new entries added. ${completedResult.duplicateCount} duplicates skipped`);
                } else {
                    showToast('Training finished with no new entries');
                }
            } else {
                const data: IngestResponse = await response.json();

                if (data.error) {
                    throw new Error(data.error);
                }

                setIngestResult(data);
                setIngestProgress(null);
                if (data.successCount > 0) {
                    showToast(`Added ${data.successCount} knowledge entries`);
                } else if (data.duplicateCount > 0) {
                    showToast(`No new entries added. ${data.duplicateCount} duplicates skipped`);
                } else {
                    showToast('Training finished with no new entries');
                }
            }
        } catch (err: unknown) {
            setIngestResult(null);
            setIngestProgress(null);
            setIngestError(`Network error: ${(err as Error).message}`);
        }

        setProcessing(false);
    };

    const resetIngest = () => {
        setSelectedFile(null);
        setRawText('');
        setSourceName('');
        setIngestResult(null);
        setIngestError('');
        setIngestProgress(null);
        setIngestLiveResults([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Dashboard
    return (
        <div className="min-h-screen">
            {toast && (
                <div className="fixed top-5 right-5 z-50 bg-white/95 backdrop-blur-xl border border-[#D6CFC4]/50 text-sm px-5 py-3 rounded-2xl animate-slide-down text-[#1C1917] shadow-xl flex items-center gap-2.5">
                    <FontAwesomeIcon icon={faCheckCircle} className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    {toast}
                </div>
            )}

            {/* Unified sticky header + tabs */}
            <div className="sticky top-0 z-50">
                <header className="skeuo-metal">
                    <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 xl:px-10 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl skeuo-leather flex items-center justify-center">
                                <FontAwesomeIcon icon={faGear} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                            </div>
                            <div>
                                <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#1C1917]">
                                    Admin <span className="text-[#CA8A04]">Dashboard</span>
                                </h1>
                                <p className="text-[10px] sm:text-[11px] text-[#78716C]">SAI Admin - Train & Monitor</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleSignOut} className="skeuo-raised flex items-center gap-1.5 text-xs text-[#78716C] px-2.5 py-1.5 sm:px-3 sm:py-2 hover:text-red-600 transition-colors">
                                <FontAwesomeIcon icon={faSignOutAlt} className="w-3 h-3" />
                                <span className="hidden sm:inline">Sign Out</span>
                            </button>
                        </div>
                    </div>
                </header>

                <nav className="bg-white/95 backdrop-blur-sm border-b border-[#D6CFC4]/60 shadow-sm">
                    <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 xl:px-10 py-3">
                        <div className="overflow-x-auto scrollbar-hide">
                            <div className="flex min-w-max gap-2 md:grid md:min-w-0 md:grid-cols-4 xl:grid-cols-8 w-full">
                                {([
                                    { key: 'review' as const, label: 'Review', icon: faPenToSquare, badge: reviewBadgeReady ? questions.length : null },
                                    { key: 'analytics' as const, label: 'Analytics', icon: faChartLine },
                                    { key: 'users' as const, label: 'Users', icon: faUsers, badge: usersBadgeReady ? users.length : null },
                                    { key: 'ingest' as const, label: 'Train Bot', icon: faCloudUploadAlt },
                                    { key: 'graph' as const, label: 'Graph', icon: faDiagramProject },
                                    { key: 'settings' as const, label: 'RAG Settings', icon: faSliders },
                                    { key: 'feedback' as const, label: 'Feedback', icon: faStar },
                                    { key: 'raptor' as const, label: 'RAPTOR', icon: faLayerGroup },
                                ]).map(({ key, label, icon, badge }) => (
                                    <button
                                        key={key}
                                        onClick={() => setTab(key)}
                                        aria-current={tab === key ? 'page' : undefined}
                                        className={`w-full min-w-[9.5rem] md:min-w-0 min-h-[44px] px-3 py-2.5 rounded-lg border text-center text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${tab === key
                                            ? 'bg-[var(--accent-brass)] text-white border-[var(--accent-brass)] shadow-sm hover:bg-[#B45309]'
                                            : 'bg-[#F5F5F4] text-[#57534E] border-[#E7E5E4] hover:bg-[#E7E5E4]'
                                            }`}
                                    >
                                        <FontAwesomeIcon icon={icon} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                        <span className="leading-tight text-center">{label}</span>
                                        {badge !== undefined && badge !== null && tab !== key && (
                                            <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium shadow-sm transition-colors ${badge > 0
                                                ? 'bg-gradient-to-r from-[#EAB308] to-[#CA8A04] text-white'
                                                : 'bg-[#F0EBE3] text-[#78716C] border border-[#D6CFC4]'
                                                }`}>
                                                {badge}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </nav>
            </div>

            {/* Scrollable content */}
            <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 xl:px-10">
                <main className="min-w-0 pt-6 pb-6 md:pb-8">

                {/* Loading */}
                {((tab === 'review' && reviewLoading) || (tab === 'users' && usersLoading)) ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[#CA8A04] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#D97706] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                ) : tab === 'review' ? (

                    /* Review tab */
                    <div className="space-y-6">
                        {reviewError && (
                            <div className="skeuo-card p-5 md:p-6 border-red-200 bg-red-50/40">
                                <p className="text-sm text-red-700">{reviewError}</p>
                            </div>
                        )}
                        {!reviewLoading && questions.length === 0 ? (
                            <div className="text-center py-16 sm:py-20 animate-fade-up">
                                <FontAwesomeIcon icon={faCircleCheck} className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600 mb-3 sm:mb-4" />
                                <h2 className="text-lg sm:text-xl font-semibold text-[#1C1917] mb-2">
                                    {reviewError ? 'Review queue unavailable' : 'All caught up!'}
                                </h2>
                                <p className="text-[#78716C] text-sm">
                                    {reviewError ? 'Retry after checking the Supabase connection.' : 'No pending questions to review.'}
                                </p>
                            </div>
                        ) : questions.map((q) => (
                            <div key={q.id} className={`skeuo-card overflow-hidden ${expandedId === q.id ? 'border-[#CA8A04]/40 shadow-lg' : ''}`}>
                                <button
                                    onClick={() => { setExpandedId(expandedId === q.id ? null : q.id); setAnswerText(''); setCategory(''); }}
                                    className="w-full text-left p-5 md:p-6 flex items-start justify-between gap-4 md:gap-5 cursor-pointer"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[#1C1917] font-medium truncate text-sm sm:text-base">{q.english_text}</p>
                                        <p className="text-[#A8A29E] text-xs sm:text-sm mt-1 truncate">{q.user_question}</p>
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                                        <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                                            {q.frequency}x asked
                                        </span>
                                        <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-[#F0EBE3] text-[#78716C] border border-[#D6CFC4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hidden sm:inline-flex">
                                            {(q.top_similarity * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </button>
                                {expandedId === q.id && (
                                    <div className="px-5 md:px-6 pb-5 md:pb-6 pt-0 border-t border-[#D6CFC4] space-y-4">
                                        <div className="pt-3 sm:pt-4">
                                            <label className="text-[10px] sm:text-xs text-[#78716C] uppercase tracking-wider font-medium">Category</label>
                                            <input
                                                type="text" value={category}
                                                onChange={(e) => setCategory(e.target.value)}
                                                placeholder="e.g. troubleshooting, installation"
                                                className="skeuo-input mt-1 w-full p-2.5 sm:p-3 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] sm:text-xs text-[#78716C] uppercase tracking-wider font-medium">Answer (English)</label>
                                            <textarea
                                                value={answerText}
                                                onChange={(e) => setAnswerText(e.target.value)}
                                                rows={4}
                                                placeholder="Write the correct English answer."
                                                className="skeuo-input mt-1 w-full p-2.5 sm:p-3 text-sm resize-none"
                                            />
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-4">
                                            <button
                                                onClick={() => handleSaveAndTrain(q)}
                                                disabled={saving || activeQuestionId === q.id || !answerText.trim()}
                                                className="skeuo-brass flex-1 py-2.5 px-4 text-xs sm:text-sm flex items-center justify-center gap-2"
                                            >
                                                <FontAwesomeIcon icon={faRocket} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                                {saving && activeQuestionId === q.id ? 'Training...' : 'Save & Train Bot'}
                                            </button>
                                            <button
                                                onClick={() => handleDismiss(q.id)}
                                                disabled={activeQuestionId === q.id}
                                                className="skeuo-raised py-2.5 px-3 sm:px-4 text-[#78716C] text-xs sm:text-sm hover:text-red-600 transition-colors"
                                            >
                                                {activeQuestionId === q.id ? 'Working...' : 'Dismiss'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                ) : tab === 'analytics' ? (
                    <AdminAnalyticsDashboard />

                ) : tab === 'users' ? (

                    /* Users tab */
                    <div className="space-y-6">
                        {usersError && (
                            <div className="skeuo-card p-5 md:p-6 border-red-200 bg-red-50/40">
                                <p className="text-sm text-red-700">{usersError}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                            <SkeuoStat label="Total Users" value={users.length} icon={faUsers} accent="text-[#CA8A04]" />
                            <SkeuoStat label="Total Queries" value={users.reduce((sum, u) => sum + u.queryCount, 0)} icon={faComment} />
                            <SkeuoStat label="Active Today" value={users.filter(u => new Date(u.lastActive).toDateString() === new Date().toDateString()).length} icon={faClock} accent="text-emerald-700" />
                        </div>
                        <div className="skeuo-card p-5 md:p-6 min-w-0 overflow-hidden">
                            <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-6 flex items-center gap-2">
                                <FontAwesomeIcon icon={faUsers} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#CA8A04]" /> Registered Users
                            </h3>
                            {users.length === 0 ? (
                                <div className="text-center py-10">
                                    <FontAwesomeIcon icon={faUsers} className="w-8 h-8 text-[#A8A29E] mb-3" />
                                    <p className="text-[#78716C] text-sm">No users registered yet.</p>
                                </div>
                            ) : (
                                <div className="min-w-0 overflow-hidden">
                                    <div className="overflow-x-auto">
                                    <table className="w-full text-xs sm:text-sm min-w-[720px]">
                                        <thead><tr className="text-[#78716C] text-[10px] sm:text-xs uppercase">
                                            <th className="text-left pb-3">Name</th>
                                            <th className="text-left pb-3">Phone</th>
                                            <th className="text-left pb-3">Email</th>
                                            <th className="text-center pb-3">Queries</th>
                                            <th className="text-right pb-3">Last Active</th>
                                            <th className="text-right pb-3">Joined</th>
                                        </tr></thead>
                                        <tbody className="text-[#44403C]">
                                            {users.map((u) => (
                                                <tr key={u.id} className="border-t border-[#E8E0D4] hover:bg-[#F0EBE3]/60 transition-colors">
                                                    <td className="py-2.5 pr-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-full skeuo-leather flex items-center justify-center flex-shrink-0">
                                                                <span className="text-[10px] font-bold text-[#CA8A04]">{u.name.charAt(0).toUpperCase()}</span>
                                                            </div>
                                                            <span className="font-medium text-[#1C1917]">{u.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 pr-3"><div className="flex items-center gap-1.5 text-[#78716C]"><FontAwesomeIcon icon={faPhone} className="w-2.5 h-2.5" />{u.phone}</div></td>
                                                    <td className="py-2.5 pr-3"><div className="flex items-center gap-1.5 text-[#78716C]"><FontAwesomeIcon icon={faEnvelope} className="w-2.5 h-2.5" />{u.email}</div></td>
                                                    <td className="py-2.5 text-center">
                                                        <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ${u.queryCount > 0
                                                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                            : 'bg-[#F0EBE3] text-[#A8A29E] border border-[#D6CFC4]'
                                                            }`}>{u.queryCount}</span>
                                                    </td>
                                                    <td className="py-2.5 text-right text-xs text-[#A8A29E]">{new Date(u.lastActive).toLocaleDateString()}</td>
                                                    <td className="py-2.5 text-right text-xs text-[#A8A29E]">{new Date(u.created_at).toLocaleDateString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                ) : tab === 'ingest' ? (

                    /* Ingest / train bot tab */
                    <div className="space-y-6">

                        {/* Header card */}
                        <div className="skeuo-card p-5 md:p-6 border-[#0D9488]/30">
                            <div className="flex items-start gap-3 sm:gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/20 flex items-center justify-center flex-shrink-0">
                                    <FontAwesomeIcon icon={faDatabase} className="w-4 h-4 text-[#0D9488]" />
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-semibold text-[#1C1917]">Train Bot from Documents</h2>
                                    <p className="text-xs sm:text-sm text-[#78716C] mt-1">
                                        Upload a PDF manual or paste text - the bot will automatically extract knowledge,
                                        generate Q&A pairs using AI, and add them to the knowledge base.
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {['PDF Manuals', 'Service Records', 'Technical Specs', 'Troubleshooting Guides'].map(t => (
                                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/20">{t}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mode selector + input area */}
                        {!ingestResult && (
                            <div className="skeuo-card p-5 md:p-6 space-y-6 min-w-0 overflow-hidden">

                                {/* Mode toggle */}
                                <div>
                                    <label className="text-[10px] sm:text-xs text-[#78716C] uppercase tracking-wider font-medium block mb-2">Input Type</label>
                                    <div className="inline-flex gap-1 rounded-lg p-1 bg-[#F0EBE3] border border-[#D6CFC4] shadow-[inset_0_2px_4px_rgba(0,0,0,0.08)]">
                                        <button
                                            onClick={() => { setIngestMode('pdf'); setIngestError(''); }}
                                            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${ingestMode === 'pdf'
                                                ? 'bg-[#FAF7F2] text-[#1C1917] shadow-sm border border-[#D6CFC4]'
                                                : 'text-[#78716C]'
                                                }`}
                                        >
                                            <FontAwesomeIcon icon={faUpload} className="w-3 h-3" /> PDF Upload
                                        </button>
                                        <button
                                            onClick={() => { setIngestMode('text'); setIngestError(''); }}
                                            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${ingestMode === 'text'
                                                ? 'bg-[#FAF7F2] text-[#1C1917] shadow-sm border border-[#D6CFC4]'
                                                : 'text-[#78716C]'
                                                }`}
                                        >
                                            <FontAwesomeIcon icon={faFileAlt} className="w-3 h-3" /> Paste Text
                                        </button>
                                    </div>
                                </div>

                                {/* Source name */}
                                <div>
                                    <label className="text-[10px] sm:text-xs text-[#78716C] uppercase tracking-wider font-medium block mb-1.5">
                                        Source Name <span className="text-[#A8A29E] normal-case">(for tracking)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={sourceName}
                                        onChange={e => setSourceName(e.target.value)}
                                        placeholder='e.g. "Anybus X-gateway Manual v2.3" or "Field Service Report #42"'
                                        className="skeuo-input w-full p-2.5 sm:p-3 text-sm"
                                    />
                                </div>

                                {/* PDF Drop Zone */}
                                {ingestMode === 'pdf' && (
                                    <div>
                                        <label className="text-[10px] sm:text-xs text-[#78716C] uppercase tracking-wider font-medium block mb-1.5">PDF File</label>
                                        <div
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-all ${dragOver
                                                ? 'border-[#0D9488] bg-[#0D9488]/5'
                                                : selectedFile
                                                    ? 'border-emerald-400 bg-emerald-50/50'
                                                    : 'border-[#D6CFC4] hover:border-[#0D9488]/50 hover:bg-[#0D9488]/3'
                                                }`}
                                        >
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".pdf"
                                                className="hidden"
                                                onChange={handleFileSelect}
                                            />
                                            {selectedFile ? (
                                                <div>
                                                    <FontAwesomeIcon icon={faCheckCircle} className="w-8 h-8 text-emerald-600 mb-2" />
                                                    <p className="text-sm font-medium text-[#1C1917]">{selectedFile.name}</p>
                                                    <p className="text-xs text-[#78716C] mt-1">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                                        className="mt-2 text-xs text-red-600 hover:underline"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <FontAwesomeIcon icon={faCloudUploadAlt} className="w-8 h-8 text-[#A8A29E] mb-2" />
                                                    <p className="text-sm font-medium text-[#44403C]">Drop PDF here or click to browse</p>
                                                    <p className="text-xs text-[#A8A29E] mt-1">Maximum 10MB - PDF only. For larger files, use the CLI or contact the dev team.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Text paste area */}
                                {ingestMode === 'text' && (
                                    <div>
                                        <label className="text-[10px] sm:text-xs text-[#78716C] uppercase tracking-wider font-medium block mb-1.5">
                                            Text / Paragraph
                                            <span className="text-[#A8A29E] normal-case ml-2">paste any technical content</span>
                                        </label>
                                        <textarea
                                            value={rawText}
                                            onChange={e => setRawText(e.target.value)}
                                            rows={10}
                                            placeholder={`Paste technical content here. Examples:\n- Service report: "Unit showed CRC errors on COM2. Root cause was reversed A/B polarity on RS-485 terminal. Resolution: swap wires at slave device terminal block."\n- Manual excerpt from HMS documentation\n- Troubleshooting notes from field engineers\n- Error code descriptions and solutions`}
                                            className="skeuo-input w-full p-3 sm:p-4 text-sm resize-none font-mono leading-relaxed"
                                        />
                                        <p className="text-[10px] text-[#A8A29E] mt-1.5">
                                            {rawText.length} characters
                                            {rawText.length > 0 && ` - ~${Math.ceil(rawText.length / 800)} chunks to process`}
                                        </p>
                                    </div>
                                )}

                                {/* What happens section */}
                                <div className="bg-[#F0EBE3] border border-[#D6CFC4] rounded-xl p-3 sm:p-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                                    <p className="text-[10px] sm:text-xs text-[#78716C] font-semibold uppercase tracking-wider mb-2">What happens when you click Process:</p>

                                    <p className="text-[10px] sm:text-xs text-[#78716C] font-semibold mt-2 mb-1">Text Pipeline</p>
                                    <div className="space-y-1.5 text-xs text-[#44403C]">
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span> Text is split into ~800-char chunks with 150-char overlap</div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span> GPT-4o generates a Q&amp;A pair for each chunk</div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span> OpenAI text-embedding-3-large creates a 1536-dim vector</div>
                                    </div>

                                    <p className="text-[10px] sm:text-xs text-[#78716C] font-semibold mt-3 mb-1">Image Pipeline (PDF only)</p>
                                    <div className="space-y-1.5 text-xs text-[#44403C]">
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">4</span> Gemini 2.0 Flash reads the entire PDF - text and images</div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">5</span> Identifies wiring diagrams, schematics, panel layouts, and pinouts</div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">6</span> GPT-4o generates Q&amp;A for each visual and stores it as <code className="text-[#0D9488] bg-[#0D9488]/10 px-1 rounded">pdf_image</code></div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">7</span> Bot now answers questions about diagrams, not just text</div>
                                    </div>
                                </div>

                                {/* Error */}
                                {ingestError && (
                                    <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs">
                                        <FontAwesomeIcon icon={faTimesCircle} className="w-3.5 h-3.5 flex-shrink-0" />
                                        {ingestError}
                                    </div>
                                )}

                                {/* Process button */}
                                <button
                                    onClick={handleIngest}
                                    disabled={processing || (ingestMode === 'pdf' ? !selectedFile : rawText.trim().length < 50)}
                                    className="skeuo-brass w-full py-3 text-sm flex items-center justify-center gap-2"
                                >
                                    {processing ? (
                                        <>
                                            <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
                                            Processing... (may take 60-120 seconds for PDFs with diagrams)
                                        </>
                                    ) : (
                                        <>
                                            <FontAwesomeIcon icon={faRocket} className="w-4 h-4" />
                                            Process &amp; Train Bot
                                        </>
                                    )}
                                </button>

                                {processing && (
                                    <div className="skeuo-card p-4 border-[#0D9488]/20 bg-[#0D9488]/5 space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-medium text-[#1C1917]">
                                                    {ingestProgress?.message || 'AI is reading the content and building embeddings...'}
                                                </p>
                                                <p className="text-xs text-[#78716C] mt-1">
                                                    {ingestProgress
                                                        ? `${ingestProgress.processedUnits} / ${Math.max(ingestProgress.totalUnits, 1)} source items processed`
                                                        : 'Waiting for live progress...'}
                                                </p>
                                            </div>
                                            <div className="flex justify-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '200ms' }} />
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '400ms' }} />
                                            </div>
                                        </div>

                                        <div className="h-2 rounded-full bg-[#E8E0D4] overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-[#0D9488] to-[#CA8A04] transition-all duration-300"
                                                style={{
                                                    width: ingestProgress && ingestProgress.totalUnits > 0
                                                        ? `${(ingestProgress.processedUnits / ingestProgress.totalUnits) * 100}%`
                                                        : '8%',
                                                }}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                            <div className="rounded-lg bg-white/70 border border-[#D6CFC4] px-3 py-2">
                                                <p className="text-[#78716C]">Added</p>
                                                <p className="text-sm font-semibold text-emerald-700">{ingestProgress?.successCount ?? 0}</p>
                                            </div>
                                            <div className="rounded-lg bg-white/70 border border-[#D6CFC4] px-3 py-2">
                                                <p className="text-[#78716C]">Duplicates</p>
                                                <p className="text-sm font-semibold text-[#78716C]">{ingestProgress?.duplicateCount ?? 0}</p>
                                            </div>
                                            <div className="rounded-lg bg-white/70 border border-[#D6CFC4] px-3 py-2">
                                                <p className="text-[#78716C]">Skipped</p>
                                                <p className="text-sm font-semibold text-[#78716C]">{ingestProgress?.skippedCount ?? 0}</p>
                                            </div>
                                            <div className="rounded-lg bg-white/70 border border-[#D6CFC4] px-3 py-2">
                                                <p className="text-[#78716C]">Errors</p>
                                                <p className="text-sm font-semibold text-red-700">{ingestProgress?.errorCount ?? 0}</p>
                                            </div>
                                        </div>

                                        {ingestLiveResults.length > 0 && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider text-[#78716C] font-semibold mb-2">
                                                    Recent progress
                                                </p>
                                                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                                    {ingestLiveResults.slice(-8).reverse().map((result, index) => (
                                                        <div
                                                            key={`${result.id}-${index}`}
                                                            className={`flex items-start gap-2.5 py-1.5 px-3 rounded-lg text-xs border ${result.status === 'success'
                                                                ? 'bg-emerald-50/50 border-emerald-200'
                                                                : result.status === 'duplicate' || result.status === 'skipped'
                                                                    ? 'bg-[#F0EBE3] border-[#D6CFC4]'
                                                                    : 'bg-red-50/50 border-red-200'
                                                                }`}
                                                        >
                                                            <FontAwesomeIcon
                                                                icon={result.status === 'success' ? faCheckCircle : result.status === 'duplicate' || result.status === 'skipped' ? faMinusCircle : faTimesCircle}
                                                                className={`w-3 h-3 mt-0.5 flex-shrink-0 ${result.status === 'success'
                                                                    ? 'text-emerald-600'
                                                                    : result.status === 'duplicate' || result.status === 'skipped'
                                                                        ? 'text-[#A8A29E]'
                                                                        : 'text-red-500'
                                                                    }`}
                                                            />
                                                            <span className="text-[#44403C]">
                                                                {result.question}
                                                                {result.error ? <span className="text-red-600 ml-2">({result.error})</span> : null}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Results */}
                        {ingestResult && (
                            <div className="space-y-6 animate-fade-up">

                                {/* Summary stats - shows text vs image breakdown */}
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-5">
                                    <div className="skeuo-card p-5 md:p-6 text-center">
                                        <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-emerald-600 mb-1" />
                                        <p className="text-xl font-bold text-emerald-700">{ingestResult.successCount}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Total Added</p>
                                    </div>
                                    <div className="skeuo-card p-5 md:p-6 text-center">
                                        <FontAwesomeIcon icon={faFileAlt} className="w-5 h-5 text-blue-500 mb-1" />
                                        <p className="text-xl font-bold text-blue-600">{ingestResult.textSuccess}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">From Text</p>
                                    </div>
                                    <div className="skeuo-card p-5 md:p-6 text-center border-[#0D9488]/30">
                                        <FontAwesomeIcon icon={faDiagramProject} className="w-5 h-5 text-[#0D9488] mb-1 mx-auto" />
                                        <p className="text-xl font-bold text-[#0D9488]">{ingestResult.imageSuccess}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">From Images</p>
                                    </div>
                                    <div className="skeuo-card p-5 md:p-6 text-center">
                                        <FontAwesomeIcon icon={faMinusCircle} className="w-5 h-5 text-[#A8A29E] mb-1" />
                                        <p className="text-xl font-bold text-[#78716C]">{ingestResult.duplicateCount}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Duplicates</p>
                                    </div>
                                    <div className="skeuo-card p-5 md:p-6 text-center">
                                        <FontAwesomeIcon icon={faTimesCircle} className="w-5 h-5 text-red-500 mb-1" />
                                        <p className="text-xl font-bold text-red-600">{ingestResult.errorCount}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Errors</p>
                                    </div>
                                </div>

                                {/* Success banner */}
                                <div className="skeuo-card p-5 md:p-6 border-emerald-200 bg-emerald-50/30">
                                    <p className="text-sm font-semibold text-[#1C1917]">
                                        Trained from: <span className="text-[#0D9488]">{ingestResult.sourceName}</span>
                                    </p>
                                    <div className="text-xs text-[#78716C] mt-1 space-y-0.5">
                                        <p>
                                            {ingestResult.totalChunks} text chunks processed -&gt; {ingestResult.textSuccess} Q&amp;A pairs added
                                        </p>
                                        {!!ingestResult.propositionSuccess && (
                                            <p>
                                                {ingestResult.propositionSuccess} proposition fact(s) added for precise retrieval
                                            </p>
                                        )}
                                        {ingestResult.totalImages > 0 && (
                                            <p>
                                                {ingestResult.totalImages} technical image(s) extracted -&gt; {ingestResult.imageSuccess} visual Q&amp;A pairs added
                                            </p>
                                        )}
                                        {ingestResult.duplicateCount > 0 && (
                                            <p className="text-[#78716C]">
                                                {ingestResult.duplicateCount} duplicate item(s) were skipped.
                                            </p>
                                        )}
                                        {ingestResult.skippedCount > 0 && (
                                            <p className="text-[#78716C]">
                                                {ingestResult.skippedCount} chunk(s) were skipped because they had no useful technical content.
                                            </p>
                                        )}
                                        {ingestResult.totalImages === 0 && ingestResult.inputType === 'pdf' && (
                                            <p className="text-[#A8A29E]">
                                                No technical images detected in this PDF.
                                            </p>
                                        )}
                                    </div>
                                    {ingestResult.imageTypes?.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            <span className="text-[10px] text-[#78716C] font-semibold">Image types found:</span>
                                            {ingestResult.imageTypes.map((t, i) => (
                                                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/20">
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs text-emerald-700 mt-2 font-medium">
                                        The bot can now answer questions about this content, including technical diagrams.
                                    </p>
                                </div>

                                {/* Q&A pairs - separated by type */}
                                <div className="skeuo-card p-5 md:p-6 min-w-0 overflow-hidden">
                                    <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <FontAwesomeIcon icon={faDatabase} className="w-3 h-3 text-[#0D9488]" />
                                        All Generated Q&amp;A Pairs ({ingestResult.results.filter(r => r.status === 'success').length})
                                    </h3>

                                    {/* Text Q&A */}
                                    {ingestResult.results.filter(r => r.type === 'text').length > 0 && (
                                        <div className="mb-4">
                                            <p className="text-[10px] text-[#A8A29E] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                                                <FontAwesomeIcon icon={faFileAlt} className="w-2.5 h-2.5 text-blue-500" />
                                                Text Chunks
                                            </p>
                                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                                {ingestResult.results
                                                    .filter(r => r.type === 'text')
                                                    .map((r, i) => (
                                                        <div key={i} className={`flex items-start gap-2.5 py-1.5 px-3 rounded-lg text-xs border shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] ${r.status === 'success' ? 'bg-emerald-50/50 border-emerald-200' :
                                                            r.status === 'skipped' || r.status === 'duplicate' ? 'bg-[#F0EBE3] border-[#D6CFC4]' :
                                                                'bg-red-50/50 border-red-200'
                                                            }`}>
                                                            <FontAwesomeIcon
                                                                icon={r.status === 'success' ? faCheckCircle : r.status === 'skipped' || r.status === 'duplicate' ? faMinusCircle : faTimesCircle}
                                                                className={`w-3 h-3 mt-0.5 flex-shrink-0 ${r.status === 'success' ? 'text-emerald-600' : r.status === 'skipped' || r.status === 'duplicate' ? 'text-[#A8A29E]' : 'text-red-500'}`}
                                                            />
                                                            <span className={r.status === 'success' ? 'text-[#1C1917]' : 'text-[#78716C] italic'}>
                                                                {r.question}
                                                                {r.error && <span className="text-red-600 ml-2">({r.error})</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    {ingestResult.results.filter(r => r.type === 'proposition').length > 0 && (
                                        <div className="mb-4">
                                            <p className="text-[10px] text-[#A8A29E] uppercase tracking-wider font-semibold mb-2">
                                                Proposition Facts
                                            </p>
                                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                                {ingestResult.results
                                                    .filter(r => r.type === 'proposition')
                                                    .map((r, i) => (
                                                        <div key={i} className="flex items-start gap-2.5 py-1.5 px-3 rounded-lg text-xs border bg-emerald-50/40 border-emerald-200">
                                                            <FontAwesomeIcon
                                                                icon={r.status === 'success' ? faCheckCircle : r.status === 'duplicate' ? faMinusCircle : faTimesCircle}
                                                                className={`w-3 h-3 mt-0.5 flex-shrink-0 ${r.status === 'success' ? 'text-emerald-600' : r.status === 'duplicate' ? 'text-[#A8A29E]' : 'text-red-500'}`}
                                                            />
                                                            <span className={r.status === 'success' ? 'text-[#1C1917]' : 'text-[#78716C] italic'}>
                                                                {r.question}
                                                                {r.error && <span className="text-red-600 ml-2">({r.error})</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Image Q&A */}
                                    {ingestResult.results.filter(r => r.type === 'image').length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-[#A8A29E] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                                                <span className="text-sm">Image</span>
                                                Technical Images / Diagrams
                                            </p>
                                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                                {ingestResult.results
                                                    .filter(r => r.type === 'image')
                                                    .map((r, i) => (
                                                        <div key={i} className={`flex items-start gap-2.5 py-1.5 px-3 rounded-lg text-xs border ${r.status === 'success' ? 'bg-[#0D9488]/5 border-[#0D9488]/20' :
                                                            r.status === 'skipped' || r.status === 'duplicate' ? 'bg-[#F0EBE3] border-[#D6CFC4]' :
                                                                'bg-red-50/50 border-red-200'
                                                            }`}>
                                                            <FontAwesomeIcon
                                                                icon={r.status === 'success' ? faCheckCircle : r.status === 'skipped' || r.status === 'duplicate' ? faMinusCircle : faTimesCircle}
                                                                className={`w-3 h-3 mt-0.5 flex-shrink-0 ${r.status === 'success' ? 'text-[#0D9488]' : r.status === 'skipped' || r.status === 'duplicate' ? 'text-[#A8A29E]' : 'text-red-500'}`}
                                                            />
                                                            <span className={r.status === 'success' ? 'text-[#0D9488]' : 'text-[#78716C] italic'}>
                                                                {r.question}
                                                                {r.error && <span className="text-red-600 ml-2">({r.error})</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-col md:flex-row gap-4">
                                    <button onClick={resetIngest} className="skeuo-brass flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                                        <FontAwesomeIcon icon={faUpload} className="w-3.5 h-3.5" />
                                        Train from Another Document
                                    </button>
                                    <button onClick={() => setTab('analytics')} className="skeuo-raised py-2.5 px-4 text-sm text-[#44403C]">
                                        View Analytics
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : tab === 'graph' ? (
                    <GraphTab />
                ) : tab === 'settings' ? (
                    <RAGSettingsTab />
                ) : tab === 'feedback' ? (
                    <FeedbackTab />
                ) : tab === 'raptor' ? (
                    <div className="space-y-6 animate-fade-up">
                        <div className="skeuo-card p-5 md:p-6 border-[#0D9488]/30">
                            <div className="flex items-start gap-3 sm:gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/20 flex items-center justify-center flex-shrink-0">
                                    <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 text-[#0D9488]" />
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-semibold text-[#1C1917]">RAPTOR Indexing</h2>
                                    <p className="text-xs sm:text-sm text-[#78716C] mt-1">
                                        Recursive Abstractive Processing for Tree-Organized Retrieval.
                                        Clusters chunks into hierarchical summaries for multi-hop reasoning.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {raptorInfo && (
                            <div className="skeuo-card p-5 md:p-6 border-blue-200 bg-blue-50/40">
                                <p className="text-sm text-blue-800">{raptorInfo}</p>
                            </div>
                        )}

                        {raptorError && (
                            <div className="skeuo-card p-5 md:p-6 border-red-200 bg-red-50/40">
                                <p className="text-sm text-red-700">{raptorError}</p>
                            </div>
                        )}

                        {raptorLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="flex gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-[#CA8A04] animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-[#D97706] animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="skeuo-card p-5 md:p-6 min-w-0 overflow-hidden">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6">
                                        <div className="bg-[#FAF7F2] rounded-lg p-3 text-center">
                                            <p className="text-xl font-bold text-[#0D9488]">
                                                {raptorHealth.reduce((sum, h) => sum + h.cluster_count, 0) || '0'}
                                            </p>
                                            <p className="text-[10px] text-[#78716C] uppercase">Total Clusters</p>
                                        </div>
                                        <div className="bg-[#FAF7F2] rounded-lg p-3 text-center">
                                            <p className="text-xl font-bold text-[#0D9488]">{raptorHealth.length || '0'}</p>
                                            <p className="text-[10px] text-[#78716C] uppercase">Depth Levels</p>
                                        </div>
                                        <div className="bg-[#FAF7F2] rounded-lg p-3 text-center">
                                            <p className="text-xl font-bold text-[#0D9488]">
                                                {raptorHealth[0]?.total_leaf_coverage ?? '0'}
                                            </p>
                                            <p className="text-[10px] text-[#78716C] uppercase">Leaf Coverage</p>
                                        </div>
                                        <div className="bg-[#FAF7F2] rounded-lg p-3 text-center">
                                            <p className="text-xl font-bold text-emerald-600">
                                                {raptorHealth.length > 0
                                                    ? `${(parseFloat(raptorHealth[0]?.avg_quality || '0') * 100).toFixed(0)}%`
                                                    : '—'}
                                            </p>
                                            <p className="text-[10px] text-[#78716C] uppercase">Avg Quality</p>
                                        </div>
                                    </div>

                                    {/* Per-level breakdown */}
                                    {raptorHealth.length > 0 && (
                                        <div className="space-y-4 mb-6">
                                            <h3 className="text-xs text-[#78716C] uppercase tracking-wider font-medium">Hierarchy Levels</h3>
                                            {raptorHealth.map((h) => (
                                                <div key={h.level} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#F0EBE3] border border-[#D6CFC4]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold">L{h.level}</span>
                                                        <span className="text-sm text-[#44403C]">{h.cluster_count} clusters</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-[#78716C]">
                                                        <span>{h.total_leaf_coverage} leaves</span>
                                                        <span>avg {parseFloat(h.avg_children).toFixed(1)} children</span>
                                                        <span className={parseFloat(h.avg_quality) > 0.7 ? 'text-emerald-600' : 'text-amber-600'}>
                                                            {(parseFloat(h.avg_quality) * 100).toFixed(0)}% quality
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Build log */}
                                    {raptorBuildLog.length > 0 && (
                                        <div className="space-y-4">
                                            <h3 className="text-xs text-[#78716C] uppercase tracking-wider font-medium">Build History</h3>
                                            {raptorBuildLog.map((log) => (
                                                <div key={log.id} className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isRaptorBuildSuccessful(log.status) ? 'bg-emerald-50/50 border-emerald-200'
                                                    : log.status === 'running' && isRaptorBuildActive(log.started_at) ? 'bg-blue-50/50 border-blue-200'
                                                        : 'bg-red-50/50 border-red-200'
                                                    }`}>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${isRaptorBuildSuccessful(log.status) ? 'bg-emerald-500'
                                                            : log.status === 'running' && isRaptorBuildActive(log.started_at) ? 'bg-blue-500 animate-pulse'
                                                                : 'bg-red-500'
                                                            }`} />
                                                        <span className="text-xs text-[#44403C] capitalize">{log.status}</span>
                                                        {log.clusters_built != null && <span className="text-xs text-[#78716C]">({log.clusters_built} clusters)</span>}
                                                    </div>
                                                    <span className="text-xs text-[#A8A29E]">
                                                        {new Date(log.started_at).toLocaleDateString()} {new Date(log.started_at).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {raptorHealth.length === 0 && !raptorError && (
                                        <div className="text-center py-10">
                                            <FontAwesomeIcon icon={faLayerGroup} className="w-10 h-10 text-[#A8A29E] mb-3" />
                                            <h3 className="text-base font-semibold text-[#1C1917] mb-2">No RAPTOR index yet</h3>
                                            <p className="text-sm text-[#78716C] max-w-md mx-auto">
                                                Click the button below to build the RAPTOR hierarchical index from your knowledge base.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => void triggerRaptorBuild()}
                                    disabled={raptorBuilding}
                                    className="skeuo-brass w-full py-3 text-sm flex items-center justify-center gap-2"
                                >
                                    {raptorBuilding ? (
                                        <>
                                            <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
                                            Building RAPTOR tree... (this may take a few minutes)
                                        </>
                                    ) : (
                                        <>
                                            <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4" />
                                            {raptorHealth.length > 0 ? 'Rebuild RAPTOR Index' : 'Build RAPTOR Index'}
                                        </>
                                    )}
                                </button>
                            </>
                        )}

                        <div className="p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-200">
                            <p className="text-xs text-blue-800">
                                <strong>How it works:</strong> RAPTOR recursively clusters embeddings using UMAP + GMM,
                                summarizes each cluster, and indexes summaries at multiple abstraction levels.
                                This enables answering questions that span multiple documents.
                            </p>
                        </div>
                    </div>
                ) : null}
            </main>
            </div>
        </div>
    );
}

function SkeuoStat({ label, value, icon, accent }: {
    label: string; value: string | number; icon: IconDefinition; accent?: string;
}) {
    return (
        <div className="skeuo-card p-5 md:p-6 rounded-xl min-w-0 overflow-hidden cursor-pointer group">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-105 ${accent === 'text-emerald-700' ? 'bg-emerald-50 text-emerald-600'
                : accent === 'text-amber-700' ? 'bg-amber-50 text-amber-600'
                    : accent === 'text-red-700' ? 'bg-red-50 text-red-600'
                        : accent === 'text-[#CA8A04]' ? 'bg-[#CA8A04]/10 text-[#CA8A04]'
                            : 'bg-[#CA8A04]/10 text-[#CA8A04]'
                }`}>
                <FontAwesomeIcon icon={icon} className="w-4 h-4" />
            </div>
            <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${accent || 'text-[#1C1917]'}`}>{value}</p>
            <p className="text-[11px] sm:text-xs text-[#A8A29E] mt-1.5 uppercase tracking-wider font-medium">{label}</p>
        </div>
    );
}
