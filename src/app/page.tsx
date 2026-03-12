'use client';

import { useChat, type Message } from 'ai/react';
import { useRef, useEffect, useState, useCallback, useMemo, type ComponentPropsWithoutRef, type JSX as ReactJSX } from 'react';
import dynamic from 'next/dynamic';

import remarkGfm from 'remark-gfm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSignal, faRobot, faPaperPlane,
    faCopy, faCheck, faChevronDown, faSpinner, faDiagramProject,
    faThumbsUp, faThumbsDown, faSignOutAlt, faBolt,
    faPlus, faTrash, faTimes, faComment,
} from '@fortawesome/free-solid-svg-icons';
import LanguageSelector from '../components/LanguageSelector';
import DiagramCard from '../components/DiagramCard';
import { signOut, isAdminEmail, getSupabaseAuth } from '@/lib/auth';
import { loadStoredRAGSettings, type RAGSettings } from '@/lib/rag-settings';

interface Conversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
}

interface ConversationHistoryError {
    conversationId: string;
    message: string;
}

type ConversationApiShape = {
    id?: string;
    title?: string;
    createdAt?: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
    messageCount?: number;
    message_count?: number;
};

type HistoryMessagesPayload = {
    messages?: HistoryMessageApiShape[];
};

type HistoryMessageApiShape = {
    id?: string;
    role?: string;
    content?: string;
    createdAt?: string;
    created_at?: string;
};

type MarkdownElementProps<Tag extends keyof ReactJSX.IntrinsicElements> = ComponentPropsWithoutRef<Tag> & {
    node?: unknown;
};

function stripMarkdownNode<Tag extends keyof ReactJSX.IntrinsicElements>({
    node,
    ...props
}: MarkdownElementProps<Tag>) {
    void node;
    return props;
}

function normalizeConversation(conversation: ConversationApiShape): Conversation {
    return {
        id: String(conversation.id),
        title: typeof conversation.title === 'string' && conversation.title.trim()
            ? conversation.title
            : 'New Conversation',
        createdAt: conversation.createdAt ?? conversation.created_at ?? new Date().toISOString(),
        updatedAt: conversation.updatedAt ?? conversation.updated_at ?? conversation.createdAt ?? conversation.created_at ?? new Date().toISOString(),
        messageCount: conversation.messageCount ?? conversation.message_count ?? 0,
    };
}

function normalizeHistoryMessages(payload: HistoryMessagesPayload | HistoryMessageApiShape[]): Message[] {
    const rawMessages = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.messages)
            ? payload.messages
            : [];

    return rawMessages.map((message: HistoryMessageApiShape, index: number) => ({
        id: message.id ?? `history-${index}`,
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: typeof message.content === 'string' ? message.content : '',
        createdAt: message.createdAt
            ? new Date(message.createdAt)
            : message.created_at
                ? new Date(message.created_at)
                : undefined,
    }));
}

function groupConversationsByDate(conversations: Conversation[]): [string, Conversation[]][] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const thisWeekStart = new Date(today.getTime() - 7 * 86400000);
    const thisMonthStart = new Date(today.getTime() - 30 * 86400000);

    const groups: Record<string, Conversation[]> = {
        Today: [],
        Yesterday: [],
        'Previous 7 Days': [],
        'Previous 30 Days': [],
        Older: [],
    };

    for (const conversation of conversations) {
        const updatedAt = new Date(conversation.updatedAt);
        if (updatedAt >= today) {
            groups.Today.push(conversation);
        } else if (updatedAt >= yesterday) {
            groups.Yesterday.push(conversation);
        } else if (updatedAt >= thisWeekStart) {
            groups['Previous 7 Days'].push(conversation);
        } else if (updatedAt >= thisMonthStart) {
            groups['Previous 30 Days'].push(conversation);
        } else {
            groups.Older.push(conversation);
        }
    }

    return Object.entries(groups).filter(([, items]) => items.length > 0);
}

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

function formatRelativeTime(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
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
    const [isSessionLoading, setIsSessionLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    // ─── Auth State ───────────────────────────────────────────
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const historyAbortControllerRef = useRef<AbortController | null>(null);
    const historyRequestIdRef = useRef(0);
    const scrollBehaviorRef = useRef<ScrollBehavior>('smooth');
    const sidebarRefreshTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        let isMounted = true;

        // Single source of truth: onAuthStateChange fires INITIAL_SESSION on mount,
        // which replaces the separate getSession() call. This eliminates race conditions
        // and the double-fetch pattern that was causing the intermittent auth flash.
        const supabase = getSupabaseAuth();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isMounted) return;

            if (session) {
                const email = session.user.email ?? '';
                if (isAdminEmail(email)) {
                    window.location.href = '/admin';
                    return;
                }
                setIsAuthenticated(true);
                setUserId(session.user.id);
                setUserName(session.user.user_metadata?.full_name || email.split('@')[0] || 'User');
            } else {
                setIsAuthenticated(false);
                setUserId(null);
                setUserName('');
                setSidebarOpen(false);
            }

            // INITIAL_SESSION is the first event fired on page load — it tells us
            // if there is (or isn't) an existing session. Only stop loading after this.
            if (event === 'INITIAL_SESSION') {
                setIsSessionLoading(false);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
            historyAbortControllerRef.current?.abort();
            if (sidebarRefreshTimeoutRef.current !== null) {
                window.clearTimeout(sidebarRefreshTimeoutRef.current);
            }
        };
    }, []);


    const handleSignOut = async () => {
        await signOut();
        window.location.href = '/login';
    };

    // ─── Conversation State ────────────────────────────────────
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
    const [historyError, setHistoryError] = useState<ConversationHistoryError | null>(null);
    const [ragSettings, setRagSettings] = useState<RAGSettings | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && isAuthenticated && window.innerWidth >= 1024) {
            setSidebarOpen(true);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        const refreshSettings = () => {
            setRagSettings(loadStoredRAGSettings());
        };

        refreshSettings();
        window.addEventListener('storage', refreshSettings);

        return () => {
            window.removeEventListener('storage', refreshSettings);
        };
    }, []);

    // ─── Chat State ───────────────────────────────────────────
    const [language, setLanguage] = useState<'en' | 'bn' | 'hi'>('en');
    const refreshConversations = useCallback(async () => {
        if (!isAuthenticated) {
            setConversations([]);
            return;
        }

        try {
            const res = await fetch('/api/conversations', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    setConversations([]);
                }
                return;
            }

            const data = await res.json();
            const items = (Array.isArray(data) ? data : data?.conversations ?? [])
                .map(normalizeConversation)
                .sort((a: Conversation, b: Conversation) => (
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                ));

            setConversations(items);
        } catch { /* non-critical */ }
    }, [isAuthenticated]);

    const { messages, input, handleInputChange, handleSubmit: rawHandleSubmit, isLoading, append, setMessages, stop } = useChat({
        credentials: 'include',
        body: { userId, language, conversationId: activeConversationId, ragSettings },
        onResponse: (response) => {
            const conversationId = response.headers.get('x-conversation-id');
            if (conversationId) {
                setActiveConversationId(conversationId);
            }
            setHistoryError(null);
        },
        onFinish: () => {
            void refreshConversations();

            if (sidebarRefreshTimeoutRef.current !== null) {
                window.clearTimeout(sidebarRefreshTimeoutRef.current);
            }

            sidebarRefreshTimeoutRef.current = window.setTimeout(() => {
                void refreshConversations();
            }, 1200);
        },
    });

    useEffect(() => {
        if (!isAuthenticated) {
            setConversations([]);
            setSidebarOpen(false);
            return;
        }

        void refreshConversations();
    }, [isAuthenticated, refreshConversations]);

    const handleSelectConversation = useCallback(async (conversationId: string) => {
        if (activeConversationId === conversationId) return;

        stop();
        historyAbortControllerRef.current?.abort();

        const requestId = historyRequestIdRef.current + 1;
        historyRequestIdRef.current = requestId;

        const controller = new AbortController();
        historyAbortControllerRef.current = controller;

        setIsLoadingHistory(true);
        setLoadingConversationId(conversationId);
        setHistoryError(null);
        setShowScrollBtn(false);
        scrollBehaviorRef.current = 'auto';
        setMessages([]);

        try {
            const res = await fetch(`/api/conversations/${conversationId}/messages`, {
                credentials: 'include',
                signal: controller.signal,
            });

            if (!res.ok) {
                if (res.status === 403) throw new Error('You do not have access to this conversation.');
                if (res.status === 404) throw new Error('Conversation not found.');
                throw new Error('Failed to load conversation history. Please try again.');
            }

            const payload = await res.json();

            if (historyRequestIdRef.current !== requestId) return;

            setMessages(normalizeHistoryMessages(payload));
            setActiveConversationId(conversationId);

            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setSidebarOpen(false);
            }

            requestAnimationFrame(() => inputRef.current?.focus());
        } catch (error) {
            if (controller.signal.aborted) return;

            console.error('Failed to load conversation:', error);

            if (historyRequestIdRef.current !== requestId) return;

            setActiveConversationId(null);
            setHistoryError({
                conversationId,
                message: error instanceof Error
                    ? error.message
                    : 'Failed to load conversation history. Please try again.',
            });
        } finally {
            if (historyRequestIdRef.current === requestId) {
                setIsLoadingHistory(false);
                setLoadingConversationId(null);
                historyAbortControllerRef.current = null;
            }
        }
    }, [activeConversationId, setMessages, stop]);

    const handleRetryHistoryLoad = useCallback(() => {
        if (historyError) {
            void handleSelectConversation(historyError.conversationId);
        }
    }, [handleSelectConversation, historyError]);

    const handleNewConversation = useCallback(() => {
        stop();
        historyAbortControllerRef.current?.abort();
        historyAbortControllerRef.current = null;
        historyRequestIdRef.current += 1;
        setActiveConversationId(null);
        setMessages([]);
        setIsLoadingHistory(false);
        setLoadingConversationId(null);
        setHistoryError(null);
        setShowScrollBtn(false);
        scrollBehaviorRef.current = 'auto';

        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setSidebarOpen(false);
        }

        requestAnimationFrame(() => inputRef.current?.focus());
    }, [setMessages, stop]);

    const handleDeleteConversation = useCallback(async (conversationId: string) => {
        const confirmed = window.confirm('Delete this conversation? This cannot be undone.');
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/conversations/${conversationId}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!res.ok) {
                throw new Error('Delete failed');
            }

            setConversations(prev => prev.filter(c => c.id !== conversationId));

            if (activeConversationId === conversationId) {
                handleNewConversation();
            }

            if (historyError?.conversationId === conversationId) {
                setHistoryError(null);
            }
        } catch (error) {
            console.error('Delete failed:', error);
            window.alert('Failed to delete conversation. Please try again.');
        }
    }, [activeConversationId, handleNewConversation, historyError?.conversationId]);

    const handleSubmit = (e?: { preventDefault?: () => void }) => {
        scrollBehaviorRef.current = 'smooth';
        setHistoryError(null);
        rawHandleSubmit(e);
    };
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
        messagesEndRef.current?.scrollIntoView({ behavior: scrollBehaviorRef.current });
        scrollBehaviorRef.current = 'smooth';
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
    }, [isLoading, messages, requestStartTime]);

    // Track message timestamps
    useEffect(() => {
        setMessageTimestamps(prev => {
            let next = prev;

            for (const message of messages) {
                if (next.has(message.id)) continue;

                if (next === prev) {
                    next = new Map(prev);
                }

                next.set(
                    message.id,
                    message.createdAt instanceof Date ? message.createdAt : new Date()
                );
            }

            return next;
        });
    }, [messages]);

    // Focus input
    useEffect(() => {
        if (!isLoading && !isLoadingHistory && !isSessionLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading, isLoadingHistory, isSessionLoading, activeConversationId]);

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
        if (e.key === 'Enter' && e.ctrlKey && input.trim() && !isLoading && !isLoadingHistory) {
            e.preventDefault();
            handleSubmit({ preventDefault: () => undefined });
        }
    };

    const handleSuggestionClick = (question: string) => {
        scrollBehaviorRef.current = 'smooth';
        setHistoryError(null);
        void append({ role: 'user', content: question });
    };

    const getMessageTimeLabel = (message: Message) => {
        const timestamp = message.createdAt instanceof Date
            ? message.createdAt
            : messageTimestamps.get(message.id);

        return timestamp ? formatRelativeTime(timestamp) : '';
    };

    // ─── Welcome screen suggestion grid ─────────────────────
    const welcomeSuggestions = useMemo(() => {
        return suggestedQuestions.length >= 4 ? suggestedQuestions.slice(0, 4) : getCuratedSuggestions();
    }, [suggestedQuestions]);

    // ─── Loading state (waiting for session check) ────────────
    if (isSessionLoading) {
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
    const groupedConversations = groupConversationsByDate(conversations);

    return (
        <div className="flex h-[100dvh]">
            {/* ─── Conversation Sidebar ─── */}
            {/* Mobile overlay */}
            {isAuthenticated && sidebarOpen && (
                <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Floating sidebar toggle — visible when sidebar is closed, authenticated */}
            {isAuthenticated && !sidebarOpen && (
                <div className="fixed top-0 left-0 z-50 h-16 flex items-center px-3">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="flex items-center justify-center w-10 h-10 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-black/5 transition-all duration-200"
                        title="Open History Sidebar"
                        aria-label="Open History Sidebar"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="9" y1="3" x2="9" y2="21"></line>
                        </svg>
                    </button>
                </div>
            )}

            {isAuthenticated && (
                <aside className={`fixed lg:relative z-40 lg:z-auto top-0 left-0 h-full bg-[#E8E0D4] border-r border-[#C4BCB0] flex flex-col transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 shadow-[10px_0_24px_rgba(28,25,23,0.12)] ${sidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-0'
                    }`}>
                    <div className="w-72 h-full flex flex-col min-w-[18rem]">
                        <div className="px-3 border-b border-[#D6CFC4]">
                            <div className="flex items-center justify-between h-16">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setSidebarOpen(false)}
                                        className="flex items-center justify-center w-10 h-10 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-black/5 transition-colors"
                                        title="Close sidebar"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                            <line x1="9" y1="3" x2="9" y2="21"></line>
                                        </svg>
                                    </button>
                                    <p className="text-xs font-semibold text-[#44403C] uppercase tracking-[0.14em]">History</p>
                                </div>
                                <button
                                    onClick={handleNewConversation}
                                    className="p-1.5 rounded-lg text-[#78716C] hover:text-[#CA8A04] hover:bg-[#CA8A04]/10 transition-colors"
                                    title="New conversation"
                                >
                                    <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>


                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0))]">
                            {conversations.length === 0 ? (
                                <div className="skeuo-card px-4 py-8 text-center">
                                    <p className="text-sm font-medium text-[#44403C]">No conversations yet</p>
                                    <p className="mt-1 text-xs text-[#78716C]">Your recent chats will appear here.</p>
                                </div>
                            ) : (
                                groupedConversations.map(([groupLabel, items]) => (
                                    <div key={groupLabel}>
                                        <div className="px-2 pb-2 text-[10px] font-semibold text-[#78716C] uppercase tracking-[0.18em]">
                                            {groupLabel}
                                        </div>
                                        <div className="space-y-2">
                                            {items.map(conv => {
                                                const isActive = activeConversationId === conv.id;
                                                const isConversationLoading = loadingConversationId === conv.id;

                                                return (
                                                    <div
                                                        key={conv.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`group relative rounded-2xl border px-3 py-3 cursor-pointer transition-all ${isActive
                                                                ? 'bg-[#F7F2EA] border-[#CA8A04]/40 shadow-[0_0_0_1px_rgba(202,138,4,0.08),0_6px_16px_rgba(28,25,23,0.08)]'
                                                                : 'bg-[#FAF7F2] border-[#D6CFC4] shadow-[0_1px_0_rgba(255,255,255,0.65)_inset,0_3px_10px_rgba(28,25,23,0.05)] hover:border-[#C4BCB0] hover:-translate-y-[1px]'
                                                            }`}
                                                        onClick={() => void handleSelectConversation(conv.id)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter' || event.key === ' ') {
                                                                event.preventDefault();
                                                                void handleSelectConversation(conv.id);
                                                            }
                                                        }}
                                                    >
                                                        {isActive && (
                                                            <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-[#CA8A04]" />
                                                        )}
                                                        <div className="pr-7">
                                                            <div className="truncate text-[13px] font-medium leading-5 text-[#1C1917]">
                                                                {conv.title}
                                                            </div>
                                                            <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[#78716C]">
                                                                <span>{formatRelativeTime(conv.updatedAt)}</span>
                                                                <span className="h-1 w-1 rounded-full bg-[#C4BCB0]" />
                                                                <span>{conv.messageCount} msgs</span>
                                                            </div>
                                                        </div>

                                                        <div className="absolute right-2 top-2 flex items-center gap-1">
                                                            {isConversationLoading && (
                                                                <FontAwesomeIcon icon={faSpinner} className="w-3 h-3 animate-spin text-[#78716C]" />
                                                            )}
                                                            <button
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void handleDeleteConversation(conv.id);
                                                                }}
                                                                className={`rounded-md p-1 text-[#A8A29E] hover:text-red-600 hover:bg-red-50 transition-all ${isActive || isConversationLoading
                                                                        ? 'opacity-0 pointer-events-none'
                                                                        : 'opacity-0 group-hover:opacity-100'
                                                                    }`}
                                                                title="Delete"
                                                            >
                                                                <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="border-t border-[#D6CFC4] p-3 bg-[#E1D8CB]">
                            <div className="skeuo-card flex items-center gap-3 px-3 py-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4B2E22] text-sm font-semibold text-[#FAF7F2] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_6px_rgba(28,25,23,0.2)]">
                                    {userName.slice(0, 1).toUpperCase() || 'U'}
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-[#1C1917]">{userName}</div>
                                    <div className="text-[11px] text-[#78716C]">
                                        {conversations.length} saved conversation{conversations.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
            )}

            {/* ─── Main Chat Area ─── */}
            <div className="flex flex-col flex-1 min-w-0 transition-all duration-300">
                {/* ─── Brushed Metal Header ─── */}
                <header className="sticky top-0 z-20 skeuo-metal flex-shrink-0">
                    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">

                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl skeuo-leather flex items-center justify-center shadow-md flex-shrink-0">
                                <FontAwesomeIcon icon={faSignal} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#CA8A04]" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#1C1917] leading-tight truncate">
                                    <span className="hidden sm:inline">Dexter Tech Support </span>
                                    <span className="sm:hidden">Dexter </span>
                                    <span className="text-[#CA8A04]">AI</span>
                                </h1>
                                <p className="text-[10px] sm:text-[11px] text-[#78716C] font-medium truncate">
                                    {isAuthenticated ? `Hi, ${userName}` : 'Guest session'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                            <LanguageSelector language={language} setLanguage={setLanguage} />
                            {isAuthenticated ? (
                                <button onClick={handleSignOut} className="skeuo-raised flex items-center gap-1.5 text-xs text-[#44403C] px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all hover:bg-red-50 hover:text-red-700 flex-shrink-0" title="Sign Out">
                                    <FontAwesomeIcon icon={faSignOutAlt} className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Sign Out</span>
                                </button>
                            ) : (
                                <button onClick={() => window.location.href = '/login'} className="skeuo-brass flex items-center gap-1.5 text-xs px-3 py-1.5 sm:px-4 sm:py-2 flex-shrink-0">
                                    <span>Sign In</span>
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {/* ─── Chat Area ─── */}
                <main ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
                    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">

                        {/* ── Welcome Screen ── */}
                        {isLoadingHistory ? (
                            <div className="flex flex-col gap-4 p-4">
                                {[0, 1, 2, 3].map(index => (
                                    <div key={index} className={`flex ${index % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                                        <div className={`h-16 rounded-2xl animate-pulse bg-[#d6cfc4] ${index % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
                                    </div>
                                ))}
                            </div>
                        ) : historyError ? (
                            <div className="text-center mt-8 sm:mt-12 lg:mt-16 animate-fade-up">
                                <div className="skeuo-card p-6 sm:p-8 max-w-xl mx-auto">
                                    <div className="w-12 h-12 mx-auto rounded-2xl bg-red-100 text-red-500 flex items-center justify-center mb-4">
                                        <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-[#1C1917] mb-2">Unable to load conversation</h2>
                                    <p className="text-[#78716C] text-sm leading-relaxed">{historyError.message}</p>
                                    <div className="mt-5 flex items-center justify-center gap-3">
                                        <button
                                            onClick={handleRetryHistoryLoad}
                                            className="skeuo-raised px-4 py-2 text-xs font-semibold text-[#44403C]"
                                        >
                                            Retry
                                        </button>
                                        <button
                                            onClick={handleNewConversation}
                                            className="px-4 py-2 text-xs font-semibold text-[#78716C] hover:text-[#1C1917]"
                                        >
                                            Start fresh
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : messages.length === 0 && activeConversationId ? (
                            <div className="text-center mt-8 sm:mt-12 lg:mt-16 animate-fade-up">
                                <div className="skeuo-card p-6 sm:p-8 max-w-xl mx-auto">
                                    <div className="w-12 h-12 mx-auto rounded-2xl bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center mb-4">
                                        <FontAwesomeIcon icon={faComment} className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-[#1C1917] mb-2">No messages yet</h2>
                                    <p className="text-[#78716C] text-sm leading-relaxed">No messages yet - start chatting!</p>
                                </div>
                            </div>
                        ) : messages.length === 0 ? (
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
                                                    {getMessageTimeLabel(m) && (
                                                        <div className="mt-2 px-1 text-[10px] text-[#A8A29E]">
                                                            {getMessageTimeLabel(m)}
                                                        </div>
                                                    )}
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
                                                            p: (props: MarkdownElementProps<'p'>) => <p className="mb-2.5 last:mb-0 whitespace-pre-wrap" {...stripMarkdownNode(props)} />,
                                                            ul: (props: MarkdownElementProps<'ul'>) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...stripMarkdownNode(props)} />,
                                                            ol: (props: MarkdownElementProps<'ol'>) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...stripMarkdownNode(props)} />,
                                                            li: (props: MarkdownElementProps<'li'>) => <li {...stripMarkdownNode(props)} />,
                                                            strong: (props: MarkdownElementProps<'strong'>) => <strong className="font-semibold text-[#1C1917]" {...stripMarkdownNode(props)} />,
                                                            table: (props: MarkdownElementProps<'table'>) => (
                                                                <div className="overflow-x-auto -mx-1 my-3">
                                                                    <table className="w-full border-collapse text-xs sm:text-sm" {...stripMarkdownNode(props)} />
                                                                </div>
                                                            ),
                                                            thead: (props: MarkdownElementProps<'thead'>) => <thead className="bg-[#F0EBE3]" {...stripMarkdownNode(props)} />,
                                                            th: (props: MarkdownElementProps<'th'>) => <th className="border border-[#D6CFC4] px-2.5 py-1.5 sm:px-3 sm:py-2 text-left text-[#1C1917] font-semibold" {...stripMarkdownNode(props)} />,
                                                            td: (props: MarkdownElementProps<'td'>) => <td className="border border-[#D6CFC4] px-2.5 py-1.5 sm:px-3 sm:py-2" {...stripMarkdownNode(props)} />,
                                                            code: (props: MarkdownElementProps<'code'>) => (
                                                                <code className="px-1.5 py-0.5 rounded text-xs sm:text-sm bg-[#F0EBE3] text-[#0D9488] border border-[#D6CFC4]" {...stripMarkdownNode(props)} />
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
                                                        {getMessageTimeLabel(m) && <span>{getMessageTimeLabel(m)}</span>}
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
                                                            p: (props: MarkdownElementProps<'p'>) => <p className="mb-2.5 last:mb-0 whitespace-pre-wrap" {...stripMarkdownNode(props)} />,
                                                            strong: (props: MarkdownElementProps<'strong'>) => <strong className="font-semibold text-[#CA8A04]" {...stripMarkdownNode(props)} />,
                                                            code: (props: MarkdownElementProps<'code'>) => (
                                                                <code className="px-1.5 py-0.5 rounded text-xs sm:text-sm bg-white/15 text-[#EAB308]" {...stripMarkdownNode(props)} />
                                                            ),
                                                        }}>
                                                            {m.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                    <div className="mt-2 flex items-center gap-3 text-[10px] text-white/40">
                                                        {getMessageTimeLabel(m) && <span>{getMessageTimeLabel(m)}</span>}
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
                                disabled={isLoading || isLoadingHistory}
                                autoComplete="off"
                            />
                            <button type="submit" disabled={isLoading || isLoadingHistory || !input.trim()}
                                className="absolute right-1.5 sm:right-2 p-2 sm:p-2.5 skeuo-brass rounded-lg sm:rounded-xl disabled:opacity-30">
                                {isLoading || isLoadingHistory
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
        </div>
    );
}
