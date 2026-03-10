'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';

import remarkGfm from 'remark-gfm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSignal, faRobot, faGear, faPaperPlane, faArrowRight,
    faCopy, faCheck, faChevronDown, faSpinner, faDiagramProject,
    faThumbsUp, faThumbsDown, faSignOutAlt, faBolt,
} from '@fortawesome/free-solid-svg-icons';
import LanguageSelector from '../components/LanguageSelector';
import DiagramCard from '../components/DiagramCard';
import { getSession, signOut } from '@/lib/auth';

// Lazy-load heavy markdown renderer
const ReactMarkdown = dynamic(() => import('react-markdown'), {
    ssr: false,
    loading: () => <span className="text-[#A8A29E] text-sm">…</span>
});

// ─── Diagram response type ────────────────────────────────────
interface DiagramResponse {
    __type: 'diagram';
    markdown: string;   // text-based markdown + ASCII art diagram
    title: string;
    diagramType: string;
    panelType: string;
    hasKBContext: boolean;
}

// ─── Parse message content ─────────────────────────────────────
function parseMessageContent(content: string): {
    isDiagram: boolean;
    diagram?: DiagramResponse;
    text: string;
} {
    if (content.startsWith('DIAGRAM_RESPONSE:')) {
        try {
            const json = content.slice('DIAGRAM_RESPONSE:'.length);
            const diagram = JSON.parse(json) as DiagramResponse;
            return { isDiagram: true, diagram, text: diagram.title || '' };
        } catch {
            return { isDiagram: false, text: content };
        }
    }
    return { isDiagram: false, text: content };
}

const SUGGESTION_CATEGORIES = [
    'Troubleshooting & Diagnostics',
    'Communication Protocols & Networking',
    'Installation & Commissioning',
    'Safety & Compliance',
];

function getCuratedSuggestions(): string[] {
    const STATIC_SUGGESTIONS = [
        "What does HMS stand for in the context of industrial control panels?",
        "What is the primary function of an HMS panel in a process control system?",
        "What communication protocols are most commonly supported by HMS panels?",
        "What safety checks must be performed before installing an HMS panel?",
        "What is Modbus RTU and how is it typically used with HMS panels?",
        "What is the maximum number of nodes on a PROFIBUS DP network?",
    ];
    return [...STATIC_SUGGESTIONS].sort(() => 0.5 - Math.random()).slice(0, 4);
}

function timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return date.toLocaleDateString();
}

const TEXT_MAP = {
    en: {
        welcome: 'Ask about HMS Panel Troubleshooting',
        intro: 'I am your Dexter HMS support assistant. Ask me anything — troubleshooting, configuration, or installation.',
        placeholder: 'Ask anything...',
        footer: 'HMS Panel Expert · AI Powered · Diagrams supported',
        thinking: 'Analyzing and generating response...',
    },
    bn: {
        welcome: 'HMS প্যানেল ট্রাবলশুটিং সম্পর্কে জিজ্ঞাসা করুন',
        intro: 'আমি আপনার Dexter HMS সাপোর্ট অ্যাসিস্ট্যান্ট। ট্রাবলশুটিং, কনফিগারেশন, বা ইন্সটলেশন সম্পর্কে জিজ্ঞাসা করুন।',
        placeholder: 'যে কোনো প্রশ্ন করুন...',
        footer: 'HMS প্যানেল বিশেষজ্ঞ · AI দ্বারা চালিত · ডায়াগ্রাম সমর্থিত',
        thinking: 'বিশ্লেষণ ও উত্তর তৈরি হচ্ছে…',
    },
    hi: {
        welcome: 'HMS पैनल ट्रबलशूटिंग के बारे में पूछें',
        intro: 'मैं आपका Dexter HMS सपोर्ट असिस्टेंट हूँ। ट्रबलशूटिंग, कॉन्फ़िगरेशन या इंस्टॉलेशन के बारे में पूछें।',
        placeholder: 'कुछ भी पूछें...',
        footer: 'HMS पैनल विशेषज्ञ · AI संचालित · डायग्राम समर्थित',
        thinking: 'विश्लेषण और उत्तर तैयार किया जा रहा है...',
    },
};

export default function Chat() {
    // ─── User Registration State ──────────────────────────────
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [showRegistration, setShowRegistration] = useState(true);

    useEffect(() => {
        getSession().then(session => {
            if (session) {
                setUserId(session.user.id);
                // Extract local part of email before @ for display name
                setUserName(session.user.email?.split('@')[0] || 'User');
                setShowRegistration(false);
            } else {
                window.location.href = '/login';
            }
        });
    }, []);

    const handleSignOut = async () => {
        await signOut();
        const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!
            .replace('https://', '')
            .split('.')[0];
        document.cookie = `sb-${projectRef}-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
        window.location.href = '/login';
    };

    // ─── Chat State ───────────────────────────────────────────
    const [language, setLanguage] = useState<'en' | 'bn' | 'hi'>('en');
    const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat({
        body: { userId, language },
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
    const [requestStartTime, setRequestStartTime] = useState<number | null>(null);
    const [responseTimes, setResponseTimes] = useState<Map<string, number>>(new Map());
    const [messageTimestamps, setMessageTimestamps] = useState<Map<string, Date>>(new Map());
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set());
    const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        setExpandedMessages(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleFeedback = async (messageId: string, rating: number, isRelevant: boolean) => {
        if (feedbackSubmitted.has(messageId)) return;

        // Find the user's query that prompted this response
        const msgIndex = messages.findIndex(m => m.id === messageId);
        const queryText = msgIndex > 0 ? messages[msgIndex - 1].content : '';

        try {
            await fetch('/api/admin/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    queryText,
                    resultId: messageId,
                    rating,
                    isRelevant,
                    feedbackText: ''
                })
            });
            setFeedbackSubmitted(prev => new Set(prev).add(messageId));
        } catch (error) {
            console.error('Failed to submit feedback', error);
        }
    };

    // Suggestions + rotation every 30s
    useEffect(() => {
        setSuggestedQuestions(getCuratedSuggestions());
        const interval = setInterval(() => setSuggestedQuestions(getCuratedSuggestions()), 30000);
        return () => clearInterval(interval);
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Track response times
    useEffect(() => {
        if (isLoading && !requestStartTime) setRequestStartTime(performance.now());
        if (!isLoading && requestStartTime) {
            const duration = (performance.now() - requestStartTime) / 1000;
            const lastBotMsg = [...messages].reverse().find(m => m.role === 'assistant');
            if (lastBotMsg) setResponseTimes(prev => new Map(prev).set(lastBotMsg.id, duration));
            setRequestStartTime(null);
        }
    }, [isLoading]);

    // Track message timestamps
    useEffect(() => {
        messages.forEach(m => {
            if (!messageTimestamps.has(m.id)) {
                setMessageTimestamps(prev => new Map(prev).set(m.id, new Date()));
            }
        });
    }, [messages]);

    // Focus input
    useEffect(() => {
        if (!isLoading && !showRegistration) inputRef.current?.focus();
    }, [isLoading, showRegistration]);

    // Scroll-to-bottom button visibility
    const handleScroll = useCallback(() => {
        const container = chatContainerRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setShowScrollBtn(distanceFromBottom > 200);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Copy to clipboard
    const handleCopy = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch { /* noop */ }
    };

    // Ctrl+Enter to send
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey && input.trim() && !isLoading) {
            e.preventDefault();
            handleSubmit(e as any);
        }
    };

    const handleSuggestionClick = (question: string) => {
        append({ role: 'user', content: question });
    };

    // ─── Welcome screen suggestion grid ─────────────────────
    const welcomeSuggestions = useMemo(() => {
        return suggestedQuestions.length >= 4 ? suggestedQuestions.slice(0, 4) : getCuratedSuggestions();
    }, [suggestedQuestions]);

    // ─── Registration Modal ───────────────────────────────────
    if (showRegistration) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <div className="skeuo-card p-7 sm:p-10 max-w-md w-full animate-fade-up text-center">
                    <FontAwesomeIcon icon={faSpinner} className="w-8 h-8 text-[#CA8A04] animate-spin mb-4" />
                    <p className="text-[#78716C]">Loading session...</p>
                </div>
            </div>
        );
    }

    // ─── Chat Interface ───────────────────────────────────────
    return (
        <div className="flex flex-col h-[100dvh]">
            {/* ─── Brushed Metal Header ─── */}
            <header className="sticky top-0 z-20 skeuo-metal flex-shrink-0">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl skeuo-leather flex items-center justify-center shadow-md">
                            <FontAwesomeIcon icon={faSignal} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#CA8A04]" />
                        </div>
                        <div>
                            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#1C1917] leading-tight">
                                Dexter Tech Support <span className="text-[#CA8A04]">AI</span>
                            </h1>
                            <p className="text-[10px] sm:text-[11px] text-[#78716C] font-medium">Hi, {userName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <LanguageSelector language={language as "en" | "bn" | "hi"} setLanguage={setLanguage as any} />
                        <a href="/admin" className="skeuo-raised flex items-center gap-1.5 text-xs text-[#44403C] px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all">
                            <FontAwesomeIcon icon={faGear} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span className="hidden sm:inline">Admin</span>
                        </a>
                        <button onClick={handleSignOut} className="skeuo-raised flex items-center gap-1.5 text-xs text-[#44403C] px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all hover:bg-red-50 hover:text-red-700">
                            <FontAwesomeIcon icon={faSignOutAlt} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span className="hidden sm:inline">Sign Out</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* ─── Chat Area ─── */}
            <main ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
                <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">

                    {/* ── Welcome Screen ── */}
                    {messages.length === 0 ? (
                        <div className="text-center mt-8 sm:mt-12 lg:mt-16 animate-fade-up">
                            <div className="p-6 sm:p-8 lg:p-10">
                                <div className="flex justify-center mb-4 sm:mb-5">
                                    <div className="w-12 h-12 rounded-2xl bg-[#0D9488]/10 flex items-center justify-center text-[#0D9488]">
                                        <FontAwesomeIcon icon={faRobot} className="w-6 h-6" />
                                    </div>
                                </div>
                                <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold mb-2 sm:mb-3 text-[#1C1917]">
                                    {TEXT_MAP[language].welcome}
                                </h2>
                                <p className="text-[#78716C] max-w-md mx-auto leading-relaxed text-sm">
                                    {TEXT_MAP[language].intro}
                                </p>

                                {/* Suggestion grid */}
                                <div className="mt-6 sm:mt-8 grid gap-2.5 sm:gap-3 sm:grid-cols-2 text-sm text-left">
                                    {welcomeSuggestions.map((question, i) => {
                                        return (
                                            <button key={`${i}-${question.slice(0, 20)}`}
                                                onClick={() => handleSuggestionClick(question)}
                                                className={`bg-[#FAF7F2] hover:bg-[#F0EBE3] border border-[#D6CFC4] rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] group p-3 sm:p-4 text-left flex items-start gap-2.5 text-xs sm:text-sm transition-all text-[#44403C]`}>
                                                <span className="mt-0.5 flex-shrink-0 text-sm opacity-60">
                                                    →
                                                </span>
                                                <span className={`flex-1 leading-snug`}>
                                                    {question}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Capability tags */}
                                <div className="mt-5 sm:mt-6 flex flex-wrap justify-center gap-1.5 sm:gap-2">
                                    {['Wiring Diagrams', 'Modbus RTU', 'I/O Fault', 'Commissioning', 'RS-485', 'Network Topology'].map((tag) => (
                                        <span key={tag} className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full bg-[#F0EBE3] text-[#78716C] border border-[#D6CFC4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ── Messages ── */
                        messages.map((m) => {
                            const parsed = m.role === 'assistant' ? parseMessageContent(m.content) : null;

                            return (
                                <div key={m.id}
                                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}
                                    style={{ contentVisibility: 'auto' }}
                                >
                                    <div className={`max-w-[92%] sm:max-w-[85%] ${m.role === 'user'
                                        ? 'rounded-2xl p-3.5 sm:p-4 lg:p-5 bg-[#4b2e22] text-[#FAF7F2] shadow-[0_2px_4px_rgba(0,0,0,0.2)] rounded-tr-sm'
                                        : parsed?.isDiagram
                                            ? 'w-full' // diagram takes full width
                                            : 'rounded-2xl p-4 sm:p-5 bg-[#FAF7F2] border border-[#D6CFC4] text-[#1C1917] shadow-sm rounded-tl-sm'
                                        }`}>

                                        {/* ── Assistant: Diagram Response ── */}
                                        {m.role === 'assistant' && parsed?.isDiagram && parsed.diagram && (
                                            <div className="w-full">
                                                {/* Bot label */}
                                                <div className="flex items-center gap-2 mb-1 px-1">
                                                    <div className="w-5 h-5 rounded-md bg-blue-900/30 flex items-center justify-center text-blue-400 border border-blue-700/30">
                                                        <FontAwesomeIcon icon={faDiagramProject} className="w-2.5 h-2.5" />
                                                    </div>
                                                    <span className="text-[10px] text-blue-400 font-semibold tracking-wide uppercase font-mono">
                                                        Diagram Generated
                                                    </span>
                                                    {responseTimes.has(m.id) && (
                                                        <span className="text-[10px] text-[#A8A29E] flex items-center gap-1 ml-auto">
                                                            <FontAwesomeIcon icon={faBolt} className="w-2.5 h-2.5" />
                                                            {responseTimes.get(m.id)!.toFixed(1)}s
                                                        </span>
                                                    )}
                                                </div>
                                                <DiagramCard
                                                    markdown={parsed.diagram.markdown}
                                                    title={parsed.diagram.title}
                                                    diagramType={parsed.diagram.diagramType}
                                                    panelType={parsed.diagram.panelType}
                                                    hasKBContext={parsed.diagram.hasKBContext}
                                                    language={language}
                                                />
                                                <div className="mt-2 flex items-center justify-end">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleFeedback(m.id, 5, true)}
                                                            disabled={feedbackSubmitted.has(m.id)}
                                                            className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(m.id) ? 'opacity-40 cursor-not-allowed text-[#A8A29E]' : 'hover:bg-[#E8E0D4] hover:text-[#0D9488] text-[#A8A29E]'}`}
                                                            title="Helpful"
                                                        >
                                                            <FontAwesomeIcon icon={faThumbsUp} className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleFeedback(m.id, 1, false)}
                                                            disabled={feedbackSubmitted.has(m.id)}
                                                            className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(m.id) ? 'opacity-40 cursor-not-allowed text-[#A8A29E]' : 'hover:bg-[#E8E0D4] hover:text-red-600 text-[#A8A29E]'}`}
                                                            title="Not helpful"
                                                        >
                                                            <FontAwesomeIcon icon={faThumbsDown} className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Assistant: Normal Text Response ── */}
                                        {m.role === 'assistant' && !parsed?.isDiagram && (
                                            <>
                                                <div className="flex items-center justify-between mb-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-[#0D9488]/15 flex items-center justify-center text-[#0D9488] border border-[#0D9488]/20">
                                                            <FontAwesomeIcon icon={faRobot} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                                        </div>
                                                        <div className="text-[10px] sm:text-xs text-[#0D9488] font-semibold tracking-wide uppercase">Support AI</div>
                                                    </div>
                                                    <button onClick={() => handleCopy(m.content, m.id)}
                                                        className="p-1 rounded text-[#A8A29E] hover:text-[#CA8A04] transition-colors cursor-pointer"
                                                        title="Copy response">
                                                        <FontAwesomeIcon icon={copiedId === m.id ? faCheck : faCopy}
                                                            className={`w-3 h-3 ${copiedId === m.id ? 'text-emerald-600' : ''}`} />
                                                    </button>
                                                </div>
                                                <div className={`text-sm sm:text-[15px] leading-relaxed relative ${!expandedMessages.has(m.id) && m.content.length > 400 ? 'max-h-40 overflow-hidden' : ''}`}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                                        p: ({ node, ...props }: any) => <p className="mb-2.5 last:mb-0 whitespace-pre-wrap" {...props} />,
                                                        ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...props} />,
                                                        ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...props} />,
                                                        li: ({ node, ...props }: any) => <li {...props} />,
                                                        strong: ({ node, ...props }: any) => <strong className="font-semibold text-[#1C1917]" {...props} />,
                                                        table: ({ node, ...props }: any) => (
                                                            <div className="overflow-x-auto -mx-1 my-3">
                                                                <table className="w-full border-collapse text-xs sm:text-sm" {...props} />
                                                            </div>
                                                        ),
                                                        thead: ({ node, ...props }: any) => <thead className="bg-[#F0EBE3]" {...props} />,
                                                        th: ({ node, ...props }: any) => <th className="border border-[#D6CFC4] px-2.5 py-1.5 sm:px-3 sm:py-2 text-left text-[#1C1917] font-semibold" {...props} />,
                                                        td: ({ node, ...props }: any) => <td className="border border-[#D6CFC4] px-2.5 py-1.5 sm:px-3 sm:py-2" {...props} />,
                                                        code: ({ node, ...props }: any) => (
                                                            <code className="px-1.5 py-0.5 rounded text-xs sm:text-sm bg-[#F0EBE3] text-[#0D9488] border border-[#D6CFC4]" {...props} />
                                                        ),
                                                    }}>
                                                        {m.content}
                                                    </ReactMarkdown>
                                                    {!expandedMessages.has(m.id) && m.content.length > 400 && (
                                                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#FAF7F2] to-transparent pointer-events-none" />
                                                    )}
                                                </div>
                                                {m.content.length > 400 && (
                                                    <button
                                                        onClick={() => toggleExpand(m.id)}
                                                        className="text-xs text-[#0D9488] font-medium mt-1 mb-1 hover:underline flex items-center gap-1"
                                                    >
                                                        {expandedMessages.has(m.id) ? 'Show less' : 'Read more'}
                                                    </button>
                                                )}
                                                <div className="mt-2 flex items-center gap-3 text-[10px] text-[#A8A29E]">
                                                    {responseTimes.has(m.id) && (
                                                        <span className="flex items-center gap-1">
                                                            <FontAwesomeIcon icon={faBolt} className="w-2.5 h-2.5" />
                                                            {responseTimes.get(m.id)!.toFixed(1)}s
                                                        </span>
                                                    )}
                                                    {messageTimestamps.has(m.id) && (
                                                        <span>{timeAgo(messageTimestamps.get(m.id)!)}</span>
                                                    )}
                                                    <div className="flex items-center gap-1 ml-auto">
                                                        <button
                                                            onClick={() => handleFeedback(m.id, 5, true)}
                                                            disabled={feedbackSubmitted.has(m.id)}
                                                            className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(m.id) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#E8E0D4] hover:text-[#0D9488]'}`}
                                                            title="Helpful"
                                                        >
                                                            <FontAwesomeIcon icon={faThumbsUp} className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleFeedback(m.id, 1, false)}
                                                            disabled={feedbackSubmitted.has(m.id)}
                                                            className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(m.id) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#E8E0D4] hover:text-red-600'}`}
                                                            title="Not helpful"
                                                        >
                                                            <FontAwesomeIcon icon={faThumbsDown} className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* ── User message ── */}
                                        {m.role === 'user' && (
                                            <>
                                                <div className="text-sm sm:text-[15px] leading-relaxed">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                                        p: ({ node, ...props }: any) => <p className="mb-2.5 last:mb-0 whitespace-pre-wrap" {...props} />,
                                                        strong: ({ node, ...props }: any) => <strong className="font-semibold text-[#CA8A04]" {...props} />,
                                                        code: ({ node, ...props }: any) => (
                                                            <code className="px-1.5 py-0.5 rounded text-xs sm:text-sm bg-white/15 text-[#EAB308]" {...props} />
                                                        ),
                                                    }}>
                                                        {m.content}
                                                    </ReactMarkdown>
                                                </div>
                                                <div className="mt-2 flex items-center gap-3 text-[10px] text-white/40">
                                                    {messageTimestamps.has(m.id) && (
                                                        <span>{timeAgo(messageTimestamps.get(m.id)!)}</span>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* ── Loading State ── */}
                    {isLoading && messages[messages.length - 1]?.role === 'user' && (
                        <div className="flex justify-start animate-fade-up">
                            <div className="skeuo-card rounded-2xl rounded-tl-sm px-4 py-3.5 sm:px-5 sm:py-4 max-w-[75%] sm:max-w-[70%] space-y-2.5">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-[#0D9488]/15 flex items-center justify-center text-[#0D9488] border border-[#0D9488]/20">
                                        <FontAwesomeIcon icon={faRobot} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                    </div>
                                    <div className="flex gap-1.5 items-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#CA8A04] animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 rounded-full w-[90%] animate-shimmer bg-[#E8E0D4]" />
                                    <div className="h-3 rounded-full w-[75%] animate-shimmer bg-[#E8E0D4]" style={{ animationDelay: '75ms' }} />
                                    <div className="h-3 rounded-full w-[60%] animate-shimmer bg-[#E8E0D4]" style={{ animationDelay: '150ms' }} />
                                </div>
                                <span className="text-[10px] sm:text-[11px] text-[#A8A29E] block">
                                    {TEXT_MAP[language].thinking}
                                </span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} className="h-4 flex-shrink-0" />
                </div>
            </main>

            {/* ─── Scroll-to-bottom FAB ─── */}
            {showScrollBtn && (
                <button onClick={scrollToBottom}
                    className="fixed bottom-28 sm:bottom-32 right-4 sm:right-6 z-30 skeuo-raised w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full shadow-lg animate-fade-up cursor-pointer"
                    title="Scroll to bottom">
                    <FontAwesomeIcon icon={faChevronDown} className="w-3.5 h-3.5 text-[#44403C]" />
                </button>
            )}

            {/* ─── Input Bar ─── */}
            <div className="flex-shrink-0 bg-gradient-to-t from-[#E8E0D4] via-[#E8E0D4]/95 to-transparent pt-3 sm:pt-4 pb-[env(safe-area-inset-bottom,12px)] sm:pb-5 px-3 sm:px-4 z-20">
                <div className="max-w-3xl mx-auto">



                    <form onSubmit={handleSubmit} className="relative flex items-center">
                        <input ref={inputRef}
                            className="skeuo-input w-full p-3 sm:p-4 pl-4 sm:pl-5 pr-12 sm:pr-14 text-sm sm:text-[15px]"
                            value={input}
                            placeholder={TEXT_MAP[language].placeholder}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            autoComplete="off"
                        />
                        <button type="submit" disabled={isLoading || !input.trim()}
                            className="absolute right-1.5 sm:right-2 p-2 sm:p-2.5 skeuo-brass rounded-lg sm:rounded-xl disabled:opacity-30">
                            {isLoading
                                ? <FontAwesomeIcon icon={faSpinner} className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                                : <FontAwesomeIcon icon={faPaperPlane} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            }
                        </button>
                    </form>
                    <p className="text-center text-[10px] sm:text-[11px] text-[#A8A29E] mt-2">
                        {TEXT_MAP[language].footer} <span className="hidden sm:inline">· Ctrl+Enter to send</span>
                    </p>
                </div>
            </div>
        </div>
    );
}