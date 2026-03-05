'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import remarkGfm from 'remark-gfm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSignal, faRobot, faGear, faPaperPlane, faArrowRight,
    faWandMagicSparkles, faBolt, faUser, faPhone, faEnvelope,
    faCopy, faCheck, faChevronDown, faSpinner, faDiagramProject,
} from '@fortawesome/free-solid-svg-icons';
import LanguageSelector from '../components/LanguageSelector';
import DiagramCard from '../components/DiagramCard';

// Lazy-load heavy markdown renderer
const ReactMarkdown = dynamic(() => import('react-markdown'), {
    ssr: false,
    loading: () => <span className="text-[#A8A29E] text-sm">…</span>
});

// ─── Diagram response type ────────────────────────────────────
interface DiagramResponse {
    __type: 'diagram';
    svg: string;
    diagramType: string;
    panelType: string;
    description: string;
    components: string[];
    notes: string[];
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
            return { isDiagram: true, diagram, text: diagram.description || '' };
        } catch {
            return { isDiagram: false, text: content };
        }
    }
    return { isDiagram: false, text: content };
}

// ─── Diagram suggestions ──────────────────────────────────────
const DIAGRAM_SUGGESTIONS: Record<string, string[]> = {
    en: [
        'Show wiring diagram for ACS Door panel',
        'Draw RS-485 network topology diagram',
        'Show power supply wiring diagram',
        'Display connector pinout for Anybus X-gateway',
    ],
    bn: [
        'ACS ডোর প্যানেলের ওয়্যারিং ডায়াগ্রাম দেখাও',
        'RS-485 নেটওয়ার্ক ডায়াগ্রাম আঁকো',
        'পাওয়ার সাপ্লাই ওয়্যারিং দেখাও',
        'Anybus X-gateway কানেক্টর পিনআউট দেখাও',
    ],
    hi: [
        'ACS डोर पैनल का वायरिंग डायग्राम दिखाएं',
        'RS-485 नेटवर्क टोपोलॉजी डायग्राम बनाएं',
        'पावर सप्लाई वायरिंग डायग्राम दिखाएं',
        'Anybus X-gateway कनेक्टर पिनआउट दिखाएं',
    ],
};

const SUGGESTION_CATEGORIES = [
    'Troubleshooting & Diagnostics',
    'Communication Protocols & Networking',
    'Installation & Commissioning',
    'Safety & Compliance',
];

function getCuratedSuggestions(): string[] {
    const suggestions: string[] = [];
    const shuffledCats = [...SUGGESTION_CATEGORIES].sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(3, shuffledCats.length); i++) {
        const cat = shuffledCats[i];
        const items = (qaData as any[]).filter((q) => q.category === cat);
        if (items.length > 0) {
            const pick = items[Math.floor(Math.random() * items.length)];
            suggestions.push(pick.question);
        }
    }
    return suggestions.sort(() => 0.5 - Math.random());
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
        intro: 'I am your Dexter HMS support assistant. Ask me anything — troubleshooting, configuration, installation, or say "Show wiring diagram for [panel name]" to get visual diagrams.',
        placeholder: 'Ask anything or say "Show wiring diagram for..."',
        footer: 'HMS Panel Expert · AI Powered · Diagrams supported',
        thinking: 'Analyzing and generating response...',
        diagramHint: 'Try: "Show wiring diagram for..."',
    },
    bn: {
        welcome: 'HMS প্যানেল ট্রাবলশুটিং সম্পর্কে জিজ্ঞাসা করুন',
        intro: 'আমি আপনার Dexter HMS সাপোর্ট অ্যাসিস্ট্যান্ট। প্রশ্ন করুন বা "ACS প্যানেলের ওয়্যারিং ডায়াগ্রাম দেখাও" বলুন।',
        placeholder: 'প্রশ্ন করুন বা "...ডায়াগ্রাম দেখাও" বলুন',
        footer: 'HMS প্যানেল বিশেষজ্ঞ · AI দ্বারা চালিত · ডায়াগ্রাম সমর্থিত',
        thinking: 'বিশ্লেষণ ও উত্তর তৈরি হচ্ছে…',
        diagramHint: 'চেষ্টা করুন: "...ওয়্যারিং ডায়াগ্রাম দেখাও"',
    },
    hi: {
        welcome: 'HMS पैनल ट्रबलशूटिंग के बारे में पूछें',
        intro: 'मैं आपका Dexter HMS सपोर्ट असिस्टेंट हूँ। कुछ भी पूछें या "... का वायरिंग डायग्राम दिखाएं" कहें।',
        placeholder: 'कुछ भी पूछें या "...वायरिंग डायग्राम दिखाएं" कहें',
        footer: 'HMS पैनल विशेषज्ञ · AI संचालित · डायग्राम समर्थित',
        thinking: 'विश्लेषण और उत्तर तैयार किया जा रहा है...',
        diagramHint: 'आज़माएं: "...वायरिंग डायग्राम दिखाएं"',
    },
};

export default function Chat() {
    // ─── User Registration State ──────────────────────────────
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [userPhone, setUserPhone] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [showRegistration, setShowRegistration] = useState(true);
    const [regLoading, setRegLoading] = useState(false);
    const [regError, setRegError] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedId = sessionStorage.getItem('dexterUserId');
            const storedName = sessionStorage.getItem('dexterUserName');
            if (storedId && storedName) {
                setUserId(storedId);
                setUserName(storedName);
                setShowRegistration(false);
            }
        }
    }, []);

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
    const [showDiagramSuggestions, setShowDiagramSuggestions] = useState(false);

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

    // Registration
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault(); setRegError('');
        if (!userName.trim() || !userPhone.trim() || !userEmail.trim()) {
            setRegError('All fields are required.'); return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail.trim())) {
            setRegError('Please enter a valid email.'); return;
        }
        if (!/\d{10,}/.test(userPhone.replace(/[\s\-\+\(\)]/g, ''))) {
            setRegError('Please enter a valid phone number.'); return;
        }
        setRegLoading(true);
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: userName.trim(), phone: userPhone.trim(), email: userEmail.trim() }),
            });
            const data = await res.json();
            if (data.error) setRegError(data.error);
            else {
                setUserId(data.user.id);
                sessionStorage.setItem('dexterUserId', data.user.id);
                sessionStorage.setItem('dexterUserName', data.user.name);
                setShowRegistration(false);
            }
        } catch {
            setRegError('Network error. Please try again.');
        }
        setRegLoading(false);
    };

    const handleSuggestionClick = (question: string) => {
        setShowDiagramSuggestions(false);
        append({ role: 'user', content: question });
    };

    // ─── Welcome screen suggestion grid ─────────────────────
    const welcomeSuggestions = useMemo(() => {
        const diagrams = (DIAGRAM_SUGGESTIONS[language] || DIAGRAM_SUGGESTIONS.en).slice(0, 2);
        const qa = suggestedQuestions.slice(0, 2);
        return [...diagrams, ...qa];
    }, [language, suggestedQuestions]);

    // ─── Registration Modal ───────────────────────────────────
    if (showRegistration) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <div className="skeuo-card p-7 sm:p-10 max-w-md w-full animate-fade-up">
                    <div className="text-center mb-6">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 skeuo-leather shadow-lg">
                            <FontAwesomeIcon icon={faSignal} className="w-6 h-6 text-[#CA8A04]" />
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold text-[#1C1917] tracking-tight">Dexter AI Support</h2>
                        <p className="text-sm text-[#78716C] mt-1.5">Register to get started with HMS support.</p>
                    </div>
                    <div className="border-t border-[#D6CFC4] mb-6" />
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-[#44403C] uppercase tracking-wider mb-1.5">Full Name</label>
                            <div className="relative">
                                <FontAwesomeIcon icon={faUser} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" />
                                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)}
                                    placeholder="e.g. Rahul Sharma" className="skeuo-input w-full p-3 sm:p-3.5 !pl-11 text-sm" autoFocus />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-[#44403C] uppercase tracking-wider mb-1.5">Phone Number</label>
                            <div className="relative">
                                <FontAwesomeIcon icon={faPhone} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" />
                                <input type="tel" value={userPhone} onChange={(e) => setUserPhone(e.target.value)}
                                    placeholder="e.g. +91 98765 43210" className="skeuo-input w-full p-3 sm:p-3.5 !pl-11 text-sm" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-[#44403C] uppercase tracking-wider mb-1.5">Email Address</label>
                            <div className="relative">
                                <FontAwesomeIcon icon={faEnvelope} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" />
                                <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)}
                                    placeholder="e.g. rahul@company.com" className="skeuo-input w-full p-3 sm:p-3.5 !pl-11 text-sm" />
                            </div>
                        </div>
                        {regError && (
                            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                                <FontAwesomeIcon icon={faEnvelope} className="w-3 h-3 flex-shrink-0" />
                                <span>{regError}</span>
                            </div>
                        )}
                        <button type="submit" disabled={regLoading}
                            className="skeuo-brass w-full py-3 text-sm mt-2 flex items-center justify-center gap-2">
                            {regLoading
                                ? <><FontAwesomeIcon icon={faSpinner} className="w-3.5 h-3.5 animate-spin" /> Registering...</>
                                : 'Start Chat →'}
                        </button>
                    </form>
                    <p className="text-center text-[10px] text-[#A8A29E] mt-5">Your information is used only for support tracking.</p>
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
                    </div>
                </div>
            </header>

            {/* ─── Chat Area ─── */}
            <main ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
                <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">

                    {/* ── Welcome Screen ── */}
                    {messages.length === 0 ? (
                        <div className="text-center mt-8 sm:mt-12 lg:mt-16 animate-fade-up">
                            <div className="skeuo-card p-6 sm:p-8 lg:p-10">
                                <div className="flex justify-center mb-4 sm:mb-5">
                                    <FontAwesomeIcon icon={faWandMagicSparkles} className="w-10 h-10 sm:w-12 sm:h-12 text-[#CA8A04]/50" />
                                </div>
                                <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold mb-2 sm:mb-3 text-[#1C1917]">
                                    {TEXT_MAP[language].welcome}
                                </h2>
                                <p className="text-[#78716C] max-w-md mx-auto leading-relaxed text-xs sm:text-sm">
                                    {TEXT_MAP[language].intro}
                                </p>

                                {/* Diagram feature badge */}
                                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                                    style={{ background: 'rgba(68,136,255,0.1)', color: '#4488FF', border: '1px solid rgba(68,136,255,0.25)' }}>
                                    <FontAwesomeIcon icon={faDiagramProject} className="w-3 h-3" />
                                    NEW: Visual Wiring Diagrams Supported
                                </div>

                                {/* Suggestion grid */}
                                <div className="mt-6 sm:mt-8 grid gap-2.5 sm:gap-3 sm:grid-cols-2 text-sm text-left">
                                    {welcomeSuggestions.map((question, i) => {
                                        const isDiagramSuggestion = i < 2;
                                        return (
                                            <button key={`${i}-${question.slice(0, 20)}`}
                                                onClick={() => handleSuggestionClick(question)}
                                                className={`skeuo-raised group p-3 sm:p-4 text-left flex items-start gap-2.5 text-xs sm:text-sm transition-all ${isDiagramSuggestion ? 'border border-blue-200/60' : ''}`}>
                                                <span className="mt-0.5 flex-shrink-0 text-sm">
                                                    {isDiagramSuggestion ? '🔌' : '→'}
                                                </span>
                                                <span className={`flex-1 leading-snug ${isDiagramSuggestion ? 'text-[#1a3a6a]' : 'text-[#44403C]'}`}>
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
                                        ? 'rounded-2xl p-3.5 sm:p-4 lg:p-5 skeuo-leather rounded-tr-sm'
                                        : parsed?.isDiagram
                                            ? 'w-full' // diagram takes full width
                                            : 'rounded-2xl p-3.5 sm:p-4 lg:p-5 skeuo-card text-[#1C1917] rounded-tl-sm'
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
                                                    svg={parsed.diagram.svg}
                                                    diagramType={parsed.diagram.diagramType}
                                                    panelType={parsed.diagram.panelType}
                                                    description={parsed.diagram.description}
                                                    components={parsed.diagram.components}
                                                    notes={parsed.diagram.notes}
                                                    hasKBContext={parsed.diagram.hasKBContext}
                                                    language={language}
                                                />
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
                                                <div className="text-sm sm:text-[15px] leading-relaxed">
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
                                                </div>
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

                    {/* Diagram quick-trigger button */}
                    {messages.length > 0 && (
                        <div className="mb-2 flex items-center gap-2">
                            <button
                                onClick={() => setShowDiagramSuggestions(v => !v)}
                                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full transition-all"
                                style={{
                                    background: showDiagramSuggestions ? 'rgba(68,136,255,0.15)' : 'rgba(68,136,255,0.08)',
                                    color: '#4488FF',
                                    border: '1px solid rgba(68,136,255,0.25)',
                                }}
                            >
                                <FontAwesomeIcon icon={faDiagramProject} className="w-2.5 h-2.5" />
                                {TEXT_MAP[language].diagramHint}
                            </button>

                            {/* Diagram suggestion chips */}
                            {showDiagramSuggestions && (
                                <div className="flex gap-1.5 overflow-x-auto">
                                    {(DIAGRAM_SUGGESTIONS[language] || DIAGRAM_SUGGESTIONS.en).map((s, i) => (
                                        <button key={i}
                                            onClick={() => handleSuggestionClick(s)}
                                            className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors"
                                            style={{
                                                background: 'rgba(68,136,255,0.08)',
                                                color: '#4488FF',
                                                border: '1px solid rgba(68,136,255,0.2)',
                                            }}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

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