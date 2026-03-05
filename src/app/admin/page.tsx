'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faLock, faGear, faArrowLeft, faPenToSquare, faChartLine,
    faCircleCheck, faRocket, faComment, faBook, faRobot,
    faCircleExclamation, faCubes, faFire, faClock, faUsers,
    faPhone, faEnvelope, faUpload, faFileAlt, faCloudUploadAlt,
    faCheckCircle, faTimesCircle, faMinusCircle, faSpinner,
    faTrash, faDatabase, faDiagramProject,
} from '@fortawesome/free-solid-svg-icons';

type UnknownQuestion = {
    id: string;
    user_question: string;
    english_text: string;
    top_similarity: number;
    frequency: number;
    status: string;
    created_at: string;
};

type Analytics = {
    totalChats: number;
    ragCount: number;
    generalCount: number;
    diagramCount: number;
    ragPercent: number;
    diagramPercent: number;
    unknownQuestions: { total: number; pending: number; reviewed: number };
    topUnknown: { english_text: string; user_question: string; frequency: number; top_similarity: number }[];
    knowledgeBase: Record<string, { count: number; name: string }>;
    recentSessions: { user_question: string; answer_mode: string; top_similarity: number; created_at: string }[];
};

type TrackedUser = {
    id: string; name: string; phone: string; email: string;
    created_at: string; queryCount: number; lastActive: string;
};

type IngestResult = {
    id: string;
    question: string;
    status: 'success' | 'skipped' | 'error';
    type: 'text' | 'image';
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
    textSuccess: number;
    imageSuccess: number;
    imageTypes: string[];
    results: IngestResult[];
    error?: string;
};

// ─── Tab type ─────────────────────────────────────────────────
type Tab = 'review' | 'analytics' | 'users' | 'ingest';

export default function AdminDashboard() {
    const [tab, setTab] = useState<Tab>('review');
    const [questions, setQuestions] = useState<UnknownQuestion[]>([]);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [users, setUsers] = useState<TrackedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [answerText, setAnswerText] = useState('');
    const [category, setCategory] = useState('');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    // ─── Ingest State ──────────────────────────────────────
    const [ingestMode, setIngestMode] = useState<'pdf' | 'text'>('pdf');
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [rawText, setRawText] = useState('');
    const [sourceName, setSourceName] = useState('');
    const [processing, setProcessing] = useState(false);
    const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
    const [ingestError, setIngestError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && sessionStorage.getItem('adminAuth') === 'true') {
            setIsAuthenticated(true);
        }
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        const validPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'Swatch360@2026';
        if (passwordInput === validPassword) {
            setIsAuthenticated(true);
            sessionStorage.setItem('adminAuth', 'true');
        } else {
            setAuthError('Incorrect password');
        }
    };

    const fetchQuestions = useCallback(async () => {
        setLoading(true);
        const res = await fetch('/api/admin/questions?status=pending');
        const data = await res.json();
        setQuestions(data.questions || []);
        setLoading(false);
    }, []);

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        const res = await fetch('/api/admin/analytics');
        const data = await res.json();
        setAnalytics(data);
        setLoading(false);
    }, []);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        const res = await fetch('/api/users');
        const data = await res.json();
        setUsers(data.users || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (tab === 'review') fetchQuestions();
        else if (tab === 'analytics') fetchAnalytics();
        else if (tab === 'users') fetchUsers();
        else setLoading(false);
    }, [tab, fetchQuestions, fetchAnalytics, fetchUsers]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const handleSaveAndTrain = async (q: UnknownQuestion) => {
        if (!answerText.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/seed-answer', {
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
            if (data.success) {
                showToast('Bot trained!');
                setExpandedId(null);
                setAnswerText('');
                setCategory('');
                fetchQuestions();
            } else {
                showToast(`Error: ${data.error}`);
            }
        } catch {
            showToast('Network error');
        }
        setSaving(false);
    };

    const handleDismiss = async (id: string) => {
        await fetch('/api/admin/questions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: 'dismissed' }),
        });
        fetchQuestions();
        showToast('Dismissed');
    };

    // ─── Ingest Handlers ───────────────────────────────────
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    };
    const handleDragLeave = () => setDragOver(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.pdf')) {
            setSelectedFile(file);
            if (!sourceName) setSourceName(file.name.replace('.pdf', ''));
        } else {
            setIngestError('Please drop a PDF file.');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            if (!sourceName) setSourceName(file.name.replace('.pdf', ''));
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

        try {
            let response: Response;

            if (ingestMode === 'pdf') {
                const form = new FormData();
                form.append('file', selectedFile!);
                form.append('sourceName', sourceName || selectedFile!.name);
                response = await fetch('/api/admin/ingest', { method: 'POST', body: form });
            } else {
                response = await fetch('/api/admin/ingest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: rawText, sourceName: sourceName || 'Admin Text Input' }),
                });
            }

            const data: IngestResponse = await response.json();

            if (data.error) {
                setIngestError(data.error);
            } else {
                setIngestResult(data);
                showToast(`✅ ${data.successCount} entries added to knowledge base!`);
            }
        } catch (err: any) {
            setIngestError(`Network error: ${err.message}`);
        }

        setProcessing(false);
    };

    const resetIngest = () => {
        setSelectedFile(null);
        setRawText('');
        setSourceName('');
        setIngestResult(null);
        setIngestError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ─── Login Screen ──────────────────────────────────────
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <div className="skeuo-card p-0 max-w-sm w-full animate-fade-up overflow-hidden">
                    {/* Accent bar */}
                    <div className="h-1 bg-gradient-to-r from-[#EAB308] via-[#CA8A04] to-[#0D9488]" />
                    <div className="p-6 sm:p-8 space-y-5">
                        <div className="text-center">
                            <div className="w-14 h-14 rounded-2xl skeuo-leather mx-auto flex items-center justify-center mb-4">
                                <FontAwesomeIcon icon={faLock} className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-[#1C1917] tracking-tight">Admin Access</h2>
                            <p className="text-sm text-[#78716C] mt-1">Enter password to continue</p>
                        </div>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <input
                                    type="password" value={passwordInput}
                                    onChange={(e) => { setPasswordInput(e.target.value); setAuthError(''); }}
                                    placeholder="Enter password"
                                    className="skeuo-input w-full p-3 text-sm"
                                />
                                {authError && <p className="text-red-600 text-xs mt-2 flex items-center gap-1.5"><FontAwesomeIcon icon={faCircleExclamation} className="w-3 h-3" />{authError}</p>}
                            </div>
                            <button type="submit" className="skeuo-brass w-full py-3 text-sm cursor-pointer">Login</button>
                        </form>
                        <a href="/" className="flex items-center justify-center gap-1.5 text-xs text-[#78716C] hover:text-[#CA8A04] transition-colors cursor-pointer">
                            <FontAwesomeIcon icon={faArrowLeft} className="w-3 h-3" /> Back to Chat
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Dashboard ─────────────────────────────────────────
    return (
        <div className="min-h-screen">
            {toast && (
                <div className="fixed top-5 right-5 z-50 bg-white/95 backdrop-blur-xl border border-[#D6CFC4]/50 text-sm px-5 py-3 rounded-2xl animate-slide-down text-[#1C1917] shadow-xl flex items-center gap-2.5">
                    <FontAwesomeIcon icon={faCheckCircle} className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    {toast}
                </div>
            )}

            {/* Header */}
            <header className="sticky top-0 z-20 skeuo-metal">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl skeuo-leather flex items-center justify-center">
                            <FontAwesomeIcon icon={faGear} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                        </div>
                        <div>
                            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#1C1917]">
                                Admin <span className="text-[#CA8A04]">Dashboard</span>
                            </h1>
                            <p className="text-[10px] sm:text-[11px] text-[#78716C]">Dexter HMS Bot — Train & Monitor</p>
                        </div>
                    </div>
                    <a href="/" className="skeuo-raised flex items-center gap-1.5 text-xs text-[#44403C] px-2.5 py-1.5 sm:px-3 sm:py-2">
                        <FontAwesomeIcon icon={faArrowLeft} className="w-3 h-3" />
                        <span className="hidden sm:inline">Back</span>
                    </a>
                </div>
            </header>

            {/* Tabs */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 sm:pt-6">
                <div className="inline-flex gap-1 rounded-2xl p-1.5 bg-white/50 backdrop-blur-sm border border-[#D6CFC4]/50 flex-wrap">
                    {([
                        { key: 'review' as const, label: 'Review', icon: faPenToSquare, badge: questions.length },
                        { key: 'analytics' as const, label: 'Analytics', icon: faChartLine },
                        { key: 'users' as const, label: 'Users', icon: faUsers, badge: users.length },
                        { key: 'ingest' as const, label: 'Train Bot', icon: faCloudUploadAlt },
                    ]).map(({ key, label, icon, badge }) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer ${tab === key
                                ? 'bg-white text-[#1C1917] shadow-md border border-[#D6CFC4]/40'
                                : 'text-[#78716C] hover:text-[#44403C] hover:bg-white/40'
                                } ${key === 'ingest' ? 'text-[#0D9488]' : ''}`}
                        >
                            <FontAwesomeIcon icon={icon} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span className="hidden sm:inline">{label}</span>
                            {badge !== undefined && badge > 0 && tab !== key && (
                                <span className="ml-1 bg-gradient-to-r from-[#EAB308] to-[#CA8A04] text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium shadow-sm">
                                    {badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">

                {/* ── Loading ── */}
                {loading && tab !== 'ingest' ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[#CA8A04] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#D97706] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                ) : tab === 'review' ? (

                    /* ─────────────────── REVIEW TAB ─────────────────── */
                    <div className="space-y-3 sm:space-y-4">
                        {questions.length === 0 ? (
                            <div className="text-center py-16 sm:py-20 animate-fade-up">
                                <FontAwesomeIcon icon={faCircleCheck} className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600 mb-3 sm:mb-4" />
                                <h2 className="text-lg sm:text-xl font-semibold text-[#1C1917] mb-2">All caught up!</h2>
                                <p className="text-[#78716C] text-sm">No pending questions to review.</p>
                            </div>
                        ) : questions.map((q) => (
                            <div key={q.id} className={`skeuo-card overflow-hidden ${expandedId === q.id ? 'border-[#CA8A04]/40 shadow-lg' : ''}`}>
                                <button
                                    onClick={() => { setExpandedId(expandedId === q.id ? null : q.id); setAnswerText(''); setCategory(''); }}
                                    className="w-full text-left p-4 sm:p-5 flex items-start justify-between gap-3 sm:gap-4 cursor-pointer"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[#1C1917] font-medium truncate text-sm sm:text-base">{q.english_text}</p>
                                        <p className="text-[#A8A29E] text-xs sm:text-sm mt-1 truncate">{q.user_question}</p>
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                                        <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                                            {q.frequency}× asked
                                        </span>
                                        <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-[#F0EBE3] text-[#78716C] border border-[#D6CFC4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hidden sm:inline-flex">
                                            {(q.top_similarity * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </button>
                                {expandedId === q.id && (
                                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 border-t border-[#D6CFC4] space-y-3 sm:space-y-4">
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
                                        <div className="flex gap-2 sm:gap-3">
                                            <button
                                                onClick={() => handleSaveAndTrain(q)}
                                                disabled={saving || !answerText.trim()}
                                                className="skeuo-brass flex-1 py-2.5 px-4 text-xs sm:text-sm flex items-center justify-center gap-2"
                                            >
                                                <FontAwesomeIcon icon={faRocket} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                                {saving ? 'Training...' : 'Save & Train Bot'}
                                            </button>
                                            <button
                                                onClick={() => handleDismiss(q.id)}
                                                className="skeuo-raised py-2.5 px-3 sm:px-4 text-[#78716C] text-xs sm:text-sm hover:text-red-600 transition-colors"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                ) : tab === 'analytics' && analytics ? (

                    /* ─────────────────── ANALYTICS TAB ─────────────────── */
                    <div className="space-y-4 sm:space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                            <SkeuoStat label="Total Chats" value={analytics.totalChats} icon={faComment} />
                            <SkeuoStat label="RAG Answers" value={`${analytics.ragCount} (${analytics.ragPercent}%)`} icon={faBook} accent="text-emerald-700" />
                            <SkeuoStat label="LLM Fallback" value={analytics.generalCount} icon={faRobot} accent="text-amber-700" />
                            <SkeuoStat label="Diagrams" value={`${analytics.diagramCount || 0} (${analytics.diagramPercent || 0}%)`} icon={faDiagramProject} accent="text-[#CA8A04]" />
                            <SkeuoStat label="Pending" value={analytics.unknownQuestions.pending} icon={faCircleExclamation} accent="text-red-700" />
                        </div>

                        <div className="skeuo-card p-4 sm:p-5">
                            <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                                <FontAwesomeIcon icon={faCubes} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#CA8A04]" /> Knowledge Base
                            </h3>
                            <div className="space-y-2">
                                {Object.entries(analytics.knowledgeBase).map(([source, info]) => (
                                    <div key={source} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#F0EBE3] border border-[#D6CFC4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${source === 'json' ? 'bg-blue-500' : source === 'pdf' ? 'bg-green-500' : source === 'admin' ? 'bg-[#CA8A04]' : 'bg-purple-500'}`} />
                                            <span className="text-xs sm:text-sm text-[#44403C]">{info.name}</span>
                                        </div>
                                        <span className="text-xs sm:text-sm text-[#78716C] font-mono">{info.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {analytics.topUnknown.length > 0 && (
                            <div className="skeuo-card p-4 sm:p-5">
                                <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                                    <FontAwesomeIcon icon={faFire} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-600" /> Top Unknown
                                </h3>
                                <div className="space-y-2">
                                    {analytics.topUnknown.map((q, i) => (
                                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#F0EBE3] border border-[#D6CFC4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                                            <p className="text-xs sm:text-sm text-[#44403C] truncate flex-1 mr-3">{q.english_text}</p>
                                            <span className="text-[10px] sm:text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 flex-shrink-0">
                                                {q.frequency}×
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="skeuo-card p-4 sm:p-5">
                            <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                                <FontAwesomeIcon icon={faClock} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0D9488]" /> Recent Sessions
                            </h3>
                            <div className="overflow-x-auto -mx-1">
                                <table className="w-full text-xs sm:text-sm min-w-[480px]">
                                    <thead><tr className="text-[#78716C] text-[10px] sm:text-xs uppercase">
                                        <th className="text-left pb-3">Question</th>
                                        <th className="text-center pb-3">Mode</th>
                                        <th className="text-center pb-3">Score</th>
                                        <th className="text-right pb-3">Time</th>
                                    </tr></thead>
                                    <tbody className="text-[#44403C]">
                                        {analytics.recentSessions.map((s, i) => (
                                            <tr key={i} className="border-t border-[#E8E0D4]">
                                                <td className="py-2.5 pr-3 truncate max-w-[180px] sm:max-w-[250px]">{s.user_question}</td>
                                                <td className="py-2.5 text-center">
                                                    <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ${s.answer_mode === 'rag'
                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                                        }`}>
                                                        {s.answer_mode?.toUpperCase() || '—'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 text-center font-mono text-xs">
                                                    {s.top_similarity ? `${(s.top_similarity * 100).toFixed(0)}%` : '—'}
                                                </td>
                                                <td className="py-2.5 text-right text-xs text-[#A8A29E]">
                                                    {new Date(s.created_at).toLocaleTimeString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                ) : tab === 'users' ? (

                    /* ─────────────────── USERS TAB ─────────────────── */
                    <div className="space-y-4 sm:space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            <SkeuoStat label="Total Users" value={users.length} icon={faUsers} accent="text-[#CA8A04]" />
                            <SkeuoStat label="Total Queries" value={users.reduce((sum, u) => sum + u.queryCount, 0)} icon={faComment} />
                            <SkeuoStat label="Active Today" value={users.filter(u => new Date(u.lastActive).toDateString() === new Date().toDateString()).length} icon={faClock} accent="text-emerald-700" />
                        </div>
                        <div className="skeuo-card p-4 sm:p-5">
                            <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                                <FontAwesomeIcon icon={faUsers} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#CA8A04]" /> Registered Users
                            </h3>
                            {users.length === 0 ? (
                                <div className="text-center py-10">
                                    <FontAwesomeIcon icon={faUsers} className="w-8 h-8 text-[#A8A29E] mb-3" />
                                    <p className="text-[#78716C] text-sm">No users registered yet.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto -mx-1">
                                    <table className="w-full text-xs sm:text-sm min-w-[600px]">
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
                            )}
                        </div>
                    </div>

                ) : tab === 'ingest' ? (

                    /* ─────────────────── INGEST / TRAIN BOT TAB ─────────────────── */
                    <div className="space-y-4 sm:space-y-6">

                        {/* Header card */}
                        <div className="skeuo-card p-4 sm:p-5 border-[#0D9488]/30">
                            <div className="flex items-start gap-3 sm:gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/20 flex items-center justify-center flex-shrink-0">
                                    <FontAwesomeIcon icon={faDatabase} className="w-4 h-4 text-[#0D9488]" />
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-semibold text-[#1C1917]">Train Bot from Documents</h2>
                                    <p className="text-xs sm:text-sm text-[#78716C] mt-1">
                                        Upload a PDF manual or paste text — the bot will automatically extract knowledge,
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
                            <div className="skeuo-card p-4 sm:p-5 space-y-4 sm:space-y-5">

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
                                                    <p className="text-xs text-[#A8A29E] mt-1">Maximum 10MB · PDF only, for larger files use CLI (Contact with Dev Team)</p>
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
                                            placeholder={`Paste technical content here. Examples:\n• Service report: "Unit showed CRC errors on COM2. Root cause was reversed A/B polarity on RS-485 terminal. Resolution: swap wires at slave device terminal block."\n• Manual excerpt from HMS documentation\n• Troubleshooting notes from field engineers\n• Error code descriptions and solutions`}
                                            className="skeuo-input w-full p-3 sm:p-4 text-sm resize-none font-mono leading-relaxed"
                                        />
                                        <p className="text-[10px] text-[#A8A29E] mt-1.5">
                                            {rawText.length} characters
                                            {rawText.length > 0 && ` · ~${Math.ceil(rawText.length / 800)} chunks to process`}
                                        </p>
                                    </div>
                                )}

                                {/* What happens section */}
                                <div className="bg-[#F0EBE3] border border-[#D6CFC4] rounded-xl p-3 sm:p-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                                    <p className="text-[10px] sm:text-xs text-[#78716C] font-semibold uppercase tracking-wider mb-2">What happens when you click Process:</p>

                                    <p className="text-[10px] sm:text-xs text-[#78716C] font-semibold mt-2 mb-1">📄 Text Pipeline</p>
                                    <div className="space-y-1.5 text-xs text-[#44403C]">
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span> Text is split into ~800-char chunks with 150-char overlap</div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span> Sarvam AI generates a Q&amp;A pair for each chunk</div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span> OpenAI text-embedding-3-small creates a 1536-dim vector</div>
                                    </div>

                                    <p className="text-[10px] sm:text-xs text-[#78716C] font-semibold mt-3 mb-1">🖼️ Image Pipeline (PDF only)</p>
                                    <div className="space-y-1.5 text-xs text-[#44403C]">
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">4</span> Gemini 2.0 Flash reads the entire PDF — text AND images</div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">5</span> Identifies wiring diagrams, schematics, panel layouts, pinouts…</div>
                                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-[10px] font-bold flex-shrink-0">6</span> Sarvam generates Q&amp;A for each visual — stored as <code className="text-[#0D9488] bg-[#0D9488]/10 px-1 rounded">pdf_image</code></div>
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
                                            Processing… (this may take 30-60 seconds)
                                        </>
                                    ) : (
                                        <>
                                            <FontAwesomeIcon icon={faRocket} className="w-4 h-4" />
                                            Process &amp; Train Bot
                                        </>
                                    )}
                                </button>

                                {processing && (
                                    <div className="text-center">
                                        <p className="text-xs text-[#78716C]">
                                            AI is reading the content, generating Q&A pairs, and building embeddings…
                                        </p>
                                        <div className="flex justify-center gap-1.5 mt-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '200ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '400ms' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Results */}
                        {ingestResult && (
                            <div className="space-y-3 sm:space-y-4 animate-fade-up">

                                {/* Summary stats — now shows text vs image breakdown */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="skeuo-card p-3 sm:p-4 text-center">
                                        <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-emerald-600 mb-1" />
                                        <p className="text-xl font-bold text-emerald-700">{ingestResult.successCount}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Total Added</p>
                                    </div>
                                    <div className="skeuo-card p-3 sm:p-4 text-center">
                                        <FontAwesomeIcon icon={faFileAlt} className="w-5 h-5 text-blue-500 mb-1" />
                                        <p className="text-xl font-bold text-blue-600">{ingestResult.textSuccess}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">From Text</p>
                                    </div>
                                    <div className="skeuo-card p-3 sm:p-4 text-center border-[#0D9488]/30">
                                        <span className="text-2xl mb-1 block">🖼️</span>
                                        <p className="text-xl font-bold text-[#0D9488]">{ingestResult.imageSuccess}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">From Images</p>
                                    </div>
                                    <div className="skeuo-card p-3 sm:p-4 text-center">
                                        <FontAwesomeIcon icon={faTimesCircle} className="w-5 h-5 text-red-500 mb-1" />
                                        <p className="text-xl font-bold text-red-600">{ingestResult.errorCount}</p>
                                        <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Errors</p>
                                    </div>
                                </div>

                                {/* Success banner */}
                                <div className="skeuo-card p-3 sm:p-4 border-emerald-200 bg-emerald-50/30">
                                    <p className="text-sm font-semibold text-[#1C1917]">
                                        ✅ Trained from: <span className="text-[#0D9488]">{ingestResult.sourceName}</span>
                                    </p>
                                    <div className="text-xs text-[#78716C] mt-1 space-y-0.5">
                                        <p>
                                            📄 {ingestResult.totalChunks} text chunks processed
                                            → {ingestResult.textSuccess} Q&amp;A pairs added
                                        </p>
                                        {ingestResult.totalImages > 0 && (
                                            <p>
                                                🖼️  {ingestResult.totalImages} technical image(s) extracted
                                                → {ingestResult.imageSuccess} visual Q&amp;A pairs added
                                            </p>
                                        )}
                                        {ingestResult.totalImages === 0 && ingestResult.inputType === 'pdf' && (
                                            <p className="text-[#A8A29E]">
                                                🖼️  No technical images detected in this PDF
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
                                        The bot can now answer questions about this content — including technical diagrams.
                                    </p>
                                </div>

                                {/* Q&A pairs — separated by type */}
                                <div className="skeuo-card p-4 sm:p-5">
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
                                                            r.status === 'skipped' ? 'bg-[#F0EBE3] border-[#D6CFC4]' :
                                                                'bg-red-50/50 border-red-200'
                                                            }`}>
                                                            <FontAwesomeIcon
                                                                icon={r.status === 'success' ? faCheckCircle : r.status === 'skipped' ? faMinusCircle : faTimesCircle}
                                                                className={`w-3 h-3 mt-0.5 flex-shrink-0 ${r.status === 'success' ? 'text-emerald-600' : r.status === 'skipped' ? 'text-[#A8A29E]' : 'text-red-500'}`}
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
                                                <span className="text-sm">🖼️</span>
                                                Technical Images / Diagrams
                                            </p>
                                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                                {ingestResult.results
                                                    .filter(r => r.type === 'image')
                                                    .map((r, i) => (
                                                        <div key={i} className={`flex items-start gap-2.5 py-1.5 px-3 rounded-lg text-xs border ${r.status === 'success' ? 'bg-[#0D9488]/5 border-[#0D9488]/20' :
                                                            r.status === 'skipped' ? 'bg-[#F0EBE3] border-[#D6CFC4]' :
                                                                'bg-red-50/50 border-red-200'
                                                            }`}>
                                                            <FontAwesomeIcon
                                                                icon={r.status === 'success' ? faCheckCircle : r.status === 'skipped' ? faMinusCircle : faTimesCircle}
                                                                className={`w-3 h-3 mt-0.5 flex-shrink-0 ${r.status === 'success' ? 'text-[#0D9488]' : r.status === 'skipped' ? 'text-[#A8A29E]' : 'text-red-500'}`}
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
                                <div className="flex gap-3">
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

                ) : null}
            </main>
        </div>
    );
}

function SkeuoStat({ label, value, icon, accent }: {
    label: string; value: string | number; icon: any; accent?: string;
}) {
    return (
        <div className="skeuo-card p-4 sm:p-5 cursor-pointer group">
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