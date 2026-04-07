'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCheck, faChevronDown, faComment, faBookmark,
    faRobot, faSignOutAlt, faSpinner, faTimes, faSignal,
} from '@fortawesome/free-solid-svg-icons';
import LanguageSelector from '../components/LanguageSelector';
import MessageBubble from '@/components/Chat/MessageBubble';
import ConversationSidebar, { type ConversationSidebarConversation } from '@/components/Chat/ConversationSidebar';
import ChatInputBar from '@/components/Chat/ChatInputBar';
import { signOut, isAdminEmail, getSupabaseAuth, sanitizeAuthSession } from '@/lib/auth';
import { useChatStream, type ChatMessage } from '@/hooks/useChatStream';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';

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

function normalizeConversation(conversation: ConversationApiShape): ConversationSidebarConversation {
    return {
        id: String(conversation.id),
        title: typeof conversation.title === 'string' && conversation.title.trim()
            ? conversation.title
            : 'Untitled',
        createdAt: conversation.createdAt ?? conversation.created_at ?? new Date().toISOString(),
        updatedAt: conversation.updatedAt ?? conversation.updated_at ?? conversation.createdAt ?? conversation.created_at ?? new Date().toISOString(),
        messageCount: conversation.messageCount ?? conversation.message_count ?? 0,
    };
}

function normalizeHistoryMessages(payload: HistoryMessagesPayload | HistoryMessageApiShape[]): ChatMessage[] {
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

function getCuratedSuggestions(): string[] {
    const staticSuggestions = [
        'What does HMS stand for in the context of industrial control panels?',
        'What is the primary function of an HMS panel in a process control system?',
        'What communication protocols are most commonly supported by HMS panels?',
        'What safety checks must be performed before installing an HMS panel?',
        'What is Modbus RTU and how is it typically used with HMS panels?',
        'What is the maximum number of nodes on a PROFIBUS DP network?',
    ];
    return [...staticSuggestions].sort(() => 0.5 - Math.random()).slice(0, 4);
}

const TEXT_MAP = {
    en: {
        welcome: 'Ask about HMS Panel Troubleshooting',
        intro: 'I am SAI, your HMS support assistant. Ask me anything — troubleshooting, configuration, or installation.',
        placeholder: 'Ask anything...',
        footer: 'HMS Panel Expert · AI Powered · Diagrams supported',
    },
    bn: {
        welcome: 'HMS প্যানেল ট্রাবলশুটিং সম্পর্কে জিজ্ঞাসা করুন',
        intro: 'আমি SAI, আপনার HMS সাপোর্ট অ্যাসিস্ট্যান্ট। ট্রাবলশুটিং, কনফিগারেশন, বা ইনস্টলেশন সম্পর্কে জিজ্ঞাসা করুন।',
        placeholder: 'যে কোনো প্রশ্ন করুন...',
        footer: 'HMS প্যানেল বিশেষজ্ঞ · AI দ্বারা চালিত · ডায়াগ্রাম সমর্থিত',
    },
    hi: {
        welcome: 'HMS पैनल ट्रबलशूटिंग के बारे में पूछें',
        intro: 'मैं SAI हूँ, आपका HMS सपोर्ट असिस्टेंट। ट्रबलशूटिंग, कॉन्फ़िगरेशन या इंस्टॉलेशन के बारे में पूछें।',
        placeholder: 'कुछ भी पूछें...',
        footer: 'HMS पैनल विशेषज्ञ · AI संचालित · डायग्राम समर्थित',
    },
};

export default function Chat() {
    const [isSessionLoading, setIsSessionLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const historyAbortControllerRef = useRef<AbortController | null>(null);
    const historyRequestIdRef = useRef(0);
    const scrollBehaviorRef = useRef<ScrollBehavior>('smooth');
    const sidebarRefreshTimeoutRef = useRef<number | null>(null);

    const [conversations, setConversations] = useState<ConversationSidebarConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
    const [historyError, setHistoryError] = useState<ConversationHistoryError | null>(null);
    const [language, setLanguage] = useState<'en' | 'bn' | 'hi'>('en');
    const [input, setInput] = useState('');
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
    const [requestStartTime, setRequestStartTime] = useState<number | null>(null);
    const [responseTimes, setResponseTimes] = useState<Map<string, number>>(new Map());
    const [messageTimestamps, setMessageTimestamps] = useState<Map<string, Date>>(new Map());
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set());
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editInput, setEditInput] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveSessionName, setSaveSessionName] = useState('');
    const [isSavingSession, setIsSavingSession] = useState(false);
    const [sessionSaved, setSessionSaved] = useState(false);
    const [guestQuestionCount, setGuestQuestionCount] = useState(0);
    const [showGuestGate, setShowGuestGate] = useState(false);

    const audioRecorder = useAudioRecorder({
        language,
        onTranscription: (text) => {
            setInput(text);
            requestAnimationFrame(() => inputRef.current?.focus());
        },
        onError: (message) => {
            window.alert(message);
        },
    });

    const refreshConversations = useCallback(async () => {
        if (!isAuthenticated) {
            setConversations([]);
            return;
        }

        try {
            const response = await fetch('/api/conversations', { credentials: 'include' });
            if (!response.ok) {
                if (response.status === 401) {
                    setConversations([]);
                }
                return;
            }

            const data = await response.json();
            const items = (Array.isArray(data) ? data : data?.conversations ?? [])
                .map(normalizeConversation)
                .sort((left: ConversationSidebarConversation, right: ConversationSidebarConversation) => (
                    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
                ));

            setConversations(items);
        } catch {
            // non-critical
        }
    }, [isAuthenticated]);

    const scheduleConversationRefresh = useCallback(() => {
        void refreshConversations();

        if (sidebarRefreshTimeoutRef.current !== null) {
            window.clearTimeout(sidebarRefreshTimeoutRef.current);
        }

        sidebarRefreshTimeoutRef.current = window.setTimeout(() => {
            void refreshConversations();
        }, 1200);
    }, [refreshConversations]);

    const {
        sendMessage,
        stop,
        isLoading,
        streamingMessageId,
        streamingDisplay,
        messages,
        setMessages,
    } = useChatStream({
        activeConversationId,
        language,
        userId,
        onConversationIdChange: setActiveConversationId,
        onBeforeSend: () => {
            setHistoryError(null);
            setInput('');
        },
        onAfterSend: scheduleConversationRefresh,
        scrollToBottom: () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
    });

    useEffect(() => {
        let isMounted = true;

        const supabase = getSupabaseAuth();
        void sanitizeAuthSession();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            if (!isMounted) return;

            if (session) {
                const email = session.user.email ?? '';
                const admin = isAdminEmail(email);
                if (admin) {
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

    useEffect(() => {
        if (typeof window !== 'undefined' && isAuthenticated && window.innerWidth >= 1024) {
            setSidebarOpen(true);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) {
            setConversations([]);
            setSidebarOpen(false);
            return;
        }

        void refreshConversations();
    }, [isAuthenticated, refreshConversations]);

    useEffect(() => {
        if (!isAuthenticated) {
            const stored = localStorage.getItem('guest_question_count');
            const count = stored ? parseInt(stored, 10) : 0;
            setGuestQuestionCount(count);
            if (count >= 3) {
                setShowGuestGate(true);
            }
        } else {
            setShowGuestGate(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        setSuggestedQuestions(getCuratedSuggestions());
        const interval = setInterval(() => setSuggestedQuestions(getCuratedSuggestions()), 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (scrollBehaviorRef.current === 'smooth') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
        scrollBehaviorRef.current = 'smooth';
    }, [messages]);

    useEffect(() => {
        if (isLoading && !requestStartTime) {
            setRequestStartTime(performance.now());
        }
        if (!isLoading && requestStartTime) {
            const duration = (performance.now() - requestStartTime) / 1000;
            const lastBotMessage = [...messages].reverse().find((message) => message.role === 'assistant');
            if (lastBotMessage) {
                setResponseTimes((prev) => new Map(prev).set(lastBotMessage.id, duration));
            }
            setRequestStartTime(null);
        }
    }, [isLoading, messages, requestStartTime]);

    useEffect(() => {
        setMessageTimestamps((prev) => {
            let next = prev;

            for (const message of messages) {
                if (next.has(message.id)) {
                    continue;
                }

                if (next === prev) {
                    next = new Map(prev);
                }

                next.set(
                    message.id,
                    message.createdAt instanceof Date ? message.createdAt : new Date(),
                );
            }

            return next;
        });
    }, [messages]);

    useEffect(() => {
        if (!isLoading && !isLoadingHistory && !isSessionLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading, isLoadingHistory, isSessionLoading, activeConversationId]);

    const handleSignOut = async () => {
        await signOut();
        window.location.href = '/login';
    };

    const incrementGuestCount = useCallback(() => {
        const newCount = guestQuestionCount + 1;
        setGuestQuestionCount(newCount);
        localStorage.setItem('guest_question_count', String(newCount));
        if (newCount >= 3) {
            setShowGuestGate(true);
        }
    }, [guestQuestionCount]);

    const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setInput(event.target.value);
    }, []);

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();

        if (!isAuthenticated && guestQuestionCount >= 3) {
            setShowGuestGate(true);
            return;
        }
        if (!isAuthenticated && input.trim()) {
            incrementGuestCount();
        }
        scrollBehaviorRef.current = 'smooth';
        setHistoryError(null);
        void sendMessage(input);
    };

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
        setFeedbackSubmitted(new Set());
        setResponseTimes(new Map());
        setMessageTimestamps(new Map());

        try {
            const response = await fetch(`/api/conversations/${conversationId}/messages`, {
                credentials: 'include',
                signal: controller.signal,
            });

            if (!response.ok) {
                if (response.status === 403) throw new Error('You do not have access to this conversation.');
                if (response.status === 404) throw new Error('Conversation not found.');
                throw new Error('Failed to load conversation history. Please try again.');
            }

            const payload = await response.json();
            if (historyRequestIdRef.current !== requestId) return;

            setMessages(normalizeHistoryMessages(payload));
            setActiveConversationId(conversationId);

            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setSidebarOpen(false);
            }

            requestAnimationFrame(() => inputRef.current?.focus());
        } catch (error) {
            if (controller.signal.aborted || historyRequestIdRef.current !== requestId) return;

            console.error('Failed to load conversation:', error);
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
        setFeedbackSubmitted(new Set());
        setResponseTimes(new Map());
        setMessageTimestamps(new Map());
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
            const response = await fetch(`/api/conversations/${conversationId}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Delete failed');
            }

            setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));

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

    const handleSaveSession = useCallback(async () => {
        if (!activeConversationId || !saveSessionName.trim() || isSavingSession) return;

        setIsSavingSession(true);
        try {
            const response = await fetch(`/api/conversations/${activeConversationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ title: saveSessionName.trim() }),
            });

            if (!response.ok) throw new Error('Save failed');

            setSessionSaved(true);
            setShowSaveModal(false);
            setSaveSessionName('');
            void refreshConversations();

            setTimeout(() => setSessionSaved(false), 3000);
        } catch (err) {
            console.error('Save session failed:', err);
            window.alert('Failed to save session. Please try again.');
        } finally {
            setIsSavingSession(false);
        }
    }, [activeConversationId, saveSessionName, isSavingSession, refreshConversations]);

    const handleRegenerate = useCallback(() => {
        const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
        if (!lastUserMessage) return;

        setMessages((current) => {
            const lastMessage = current[current.length - 1];
            if (lastMessage?.role === 'assistant') {
                return current.slice(0, -1);
            }
            return current;
        });

        void sendMessage(lastUserMessage.content);
    }, [messages, sendMessage, setMessages]);

    const handleEdit = useCallback((id: string, content: string) => {
        setEditingMessageId(id);
        setEditInput(content);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setEditingMessageId(null);
        setEditInput('');
    }, []);

    const handleSaveEdit = useCallback(async () => {
        if (!editingMessageId || !editInput.trim()) return;

        const index = messages.findIndex((message) => message.id === editingMessageId);
        if (index === -1) return;

        setEditingMessageId(null);
        setEditInput('');
        setMessages(messages.slice(0, index));
        void sendMessage(editInput.trim());
    }, [editingMessageId, editInput, messages, sendMessage, setMessages]);

    const handleFeedback = useCallback(async (messageId: string, rating: number, isRelevant: boolean) => {
        if (feedbackSubmitted.has(messageId)) return;

        const msgIndex = messages.findIndex((message) => message.id === messageId);
        const targetMessage = msgIndex >= 0 ? messages[msgIndex] : null;
        const knowledgeId = targetMessage?.knowledgeId?.trim();
        const queryText = msgIndex > 0 ? messages[msgIndex - 1].content : '';

        if (!knowledgeId || !queryText.trim()) {
            return;
        }

        try {
            const response = await fetch('/api/admin/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    queryText,
                    resultId: knowledgeId,
                    rating,
                    isRelevant,
                    feedbackText: '',
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null) as { error?: string } | null;
                throw new Error(payload?.error || 'Failed to submit feedback');
            }

            setFeedbackSubmitted((prev) => new Set(prev).add(messageId));
        } catch (error) {
            console.error('Failed to submit feedback', error);
        }
    }, [feedbackSubmitted, messages]);

    const handleScroll = useCallback(() => {
        const container = chatContainerRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setShowScrollBtn(distanceFromBottom > 200);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleCopy = useCallback(async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            // noop
        }
    }, []);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && event.ctrlKey && input.trim() && !isLoading && !isLoadingHistory) {
            event.preventDefault();
            handleSubmit();
        }
    };

    const handleSuggestionClick = (question: string) => {
        if (!isAuthenticated && guestQuestionCount >= 3) {
            setShowGuestGate(true);
            return;
        }
        if (!isAuthenticated) {
            incrementGuestCount();
        }
        scrollBehaviorRef.current = 'smooth';
        setHistoryError(null);
        void sendMessage(question);
    };

    const welcomeSuggestions = useMemo(() => {
        return suggestedQuestions.length >= 4 ? suggestedQuestions.slice(0, 4) : getCuratedSuggestions();
    }, [suggestedQuestions]);

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

    const guestQuestionsLeft = Math.max(0, 3 - guestQuestionCount);

    return (
        <div className="flex h-[100dvh]">
            {isAuthenticated && sidebarOpen && (
                <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {isAuthenticated && !sidebarOpen && (
                <div className="fixed top-0 left-0 z-50 h-16 flex items-center px-3">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="flex items-center justify-center w-10 h-10 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-black/5 transition-all duration-200"
                        title="Open History Sidebar"
                        aria-label="Open History Sidebar"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                        </svg>
                    </button>
                </div>
            )}

            {isAuthenticated && (
                <ConversationSidebar
                    isOpen={sidebarOpen}
                    conversations={conversations}
                    activeConversationId={activeConversationId}
                    loadingConversationId={loadingConversationId}
                    userName={userName}
                    onClose={() => setSidebarOpen(false)}
                    onNew={handleNewConversation}
                    onSelect={(conversationId) => void handleSelectConversation(conversationId)}
                    onDelete={(conversationId) => void handleDeleteConversation(conversationId)}
                />
            )}

            <div className="flex flex-col flex-1 min-w-0 transition-all duration-300">
                <header className="sticky top-0 z-20 backdrop-blur-sm bg-[#E8E0D4]/85 border-b border-[#D6CFC4]">
                    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 h-16 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl skeuo-leather flex items-center justify-center shadow-md flex-shrink-0">
                                <FontAwesomeIcon icon={faSignal} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#CA8A04]" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-sm sm:text-base font-semibold text-[#1C1917] truncate">SAI Tech Support</h1>
                                <p className="text-[10px] sm:text-xs text-[#78716C] truncate">Technical support, troubleshooting, and diagrams</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <LanguageSelector language={language} setLanguage={setLanguage} />
                            {isAuthenticated ? (
                                <button onClick={handleSignOut} className="skeuo-raised flex items-center gap-1.5 text-xs text-[#44403C] px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all hover:bg-red-50 hover:text-red-700 flex-shrink-0" title="Sign Out">
                                    <FontAwesomeIcon icon={faSignOutAlt} className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Sign Out</span>
                                </button>
                            ) : (
                                <button onClick={() => { window.location.href = '/login'; }} className="skeuo-brass flex items-center gap-1.5 text-xs px-3 py-1.5 sm:px-4 sm:py-2 flex-shrink-0">
                                    <span>Sign In</span>
                                </button>
                            )}
                        </div>
                    </div>
                </header>
                <main ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
                    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
                        {isLoadingHistory ? (
                            <div className="flex flex-col gap-4 p-4">
                                {[0, 1, 2, 3].map((index) => (
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
                                        <button onClick={handleRetryHistoryLoad} className="skeuo-raised px-4 py-2 text-xs font-semibold text-[#44403C]">
                                            Retry
                                        </button>
                                        <button onClick={handleNewConversation} className="px-4 py-2 text-xs font-semibold text-[#78716C] hover:text-[#1C1917]">
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

                                    <div className="mt-6 sm:mt-8 grid gap-2.5 sm:gap-3 sm:grid-cols-2 text-sm text-left">
                                        {welcomeSuggestions.map((question, index) => (
                                            <button
                                                key={`${index}-${question.slice(0, 20)}`}
                                                onClick={() => handleSuggestionClick(question)}
                                                className="bg-[#FAF7F2] hover:bg-[#F0EBE3] border border-[#D6CFC4] rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] group p-3 sm:p-4 text-left flex items-start gap-2.5 text-xs sm:text-sm transition-all text-[#44403C]"
                                            >
                                                <span className="mt-0.5 flex-shrink-0 text-sm opacity-60">-&gt;</span>
                                                <span className="flex-1 leading-snug">{question}</span>
                                            </button>
                                        ))}
                                    </div>

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
                            <>
                                {messages.map((message, index) => {
                                    const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;
                                    return (
                                        <MessageBubble
                                            key={message.id}
                                            message={message}
                                            language={language}
                                            streamingMessageId={null}
                                            responseTimes={responseTimes}
                                            messageTimestamps={messageTimestamps}
                                            copiedId={copiedId}
                                            feedbackSubmitted={feedbackSubmitted}
                                            handleCopy={handleCopy}
                                            handleFeedback={handleFeedback}
                                            isLastAssistant={isLastAssistant}
                                            onRegenerate={handleRegenerate}
                                            onEdit={handleEdit}
                                            isEditing={editingMessageId === message.id}
                                            editInput={editInput}
                                            setEditInput={setEditInput}
                                            onSaveEdit={handleSaveEdit}
                                            onCancelEdit={handleCancelEdit}
                                        />
                                    );
                                })}
                                {isLoading && streamingMessageId && (
                                    <MessageBubble
                                        key={streamingMessageId}
                                        message={{
                                            id: streamingMessageId,
                                            role: 'assistant',
                                            content: streamingDisplay,
                                            createdAt: new Date(),
                                        }}
                                        language={language}
                                        streamingMessageId={streamingMessageId}
                                        responseTimes={responseTimes}
                                        messageTimestamps={messageTimestamps}
                                        copiedId={copiedId}
                                        feedbackSubmitted={feedbackSubmitted}
                                        handleCopy={handleCopy}
                                        handleFeedback={handleFeedback}
                                    />
                                )}
                            </>
                        )}

                        <div ref={messagesEndRef} className="h-4 flex-shrink-0" />
                    </div>
                </main>

                {showScrollBtn && (
                    <button onClick={scrollToBottom} className="fixed bottom-28 sm:bottom-32 right-4 sm:right-6 z-30 skeuo-raised w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full shadow-lg animate-fade-up cursor-pointer" title="Scroll to bottom">
                        <FontAwesomeIcon icon={faChevronDown} className="w-3.5 h-3.5 text-[#44403C]" />
                    </button>
                )}

                <div className="flex-shrink-0 bg-gradient-to-t from-[#E8E0D4] via-[#E8E0D4]/95 to-transparent pt-3 sm:pt-4 pb-[env(safe-area-inset-bottom,12px)] sm:pb-5 px-3 sm:px-4 z-20">
                    <div className="max-w-3xl mx-auto">
                        {isAuthenticated && activeConversationId && messages.length > 0 && !sessionSaved && (
                            <div className="mb-2">
                                {showSaveModal ? (
                                    <div className="flex items-center gap-2 p-2 skeuo-card rounded-xl animate-fade-up">
                                        <input
                                            type="text"
                                            value={saveSessionName}
                                            onChange={(event) => setSaveSessionName(event.target.value)}
                                            placeholder="Enter session name..."
                                            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[#D6CFC4] bg-[#FAF7F2] text-[#1C1917] focus:outline-none focus:border-[#CA8A04] transition-colors"
                                            autoFocus
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' && saveSessionName.trim()) {
                                                    event.preventDefault();
                                                    void handleSaveSession();
                                                }
                                                if (event.key === 'Escape') {
                                                    setShowSaveModal(false);
                                                    setSaveSessionName('');
                                                }
                                            }}
                                        />
                                        <button onClick={() => void handleSaveSession()} disabled={!saveSessionName.trim() || isSavingSession} className="skeuo-brass px-3 py-1.5 text-xs rounded-lg disabled:opacity-40 flex items-center gap-1.5">
                                            {isSavingSession ? (
                                                <FontAwesomeIcon icon={faSpinner} className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <FontAwesomeIcon icon={faBookmark} className="w-3 h-3" />
                                            )}
                                            Save
                                        </button>
                                        <button onClick={() => { setShowSaveModal(false); setSaveSessionName(''); }} className="p-1.5 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-black/5 transition-colors">
                                            <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowSaveModal(true)} className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-[#78716C] hover:text-[#CA8A04] rounded-lg hover:bg-[#CA8A04]/5 transition-all duration-200">
                                        <FontAwesomeIcon icon={faBookmark} className="w-3 h-3" />
                                        Save this session
                                    </button>
                                )}
                            </div>
                        )}

                        {sessionSaved && (
                            <div className="mb-2 flex items-center justify-center gap-2 py-1.5 text-xs text-[#16A34A] animate-fade-up">
                                <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
                                Session saved to history!
                            </div>
                        )}

                        <ChatInputBar
                            isAuthenticated={isAuthenticated}
                            showGuestGate={showGuestGate}
                            onSignIn={() => { window.location.href = '/login'; }}
                            input={input}
                            inputRef={inputRef}
                            onInputChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            onSubmit={handleSubmit}
                            placeholder={TEXT_MAP[language].placeholder}
                            footerText={TEXT_MAP[language].footer}
                            isLoading={isLoading}
                            isLoadingHistory={isLoadingHistory}
                            guestQuestionsLeft={guestQuestionsLeft}
                            onStop={stop}
                            isStreaming={isLoading && !!streamingMessageId}
                            recordingState={audioRecorder.state}
                            recordingDuration={audioRecorder.durationSeconds}
                            onStartRecording={() => void audioRecorder.startRecording()}
                            onStopRecording={audioRecorder.stopRecording}
                            onCancelRecording={audioRecorder.cancelRecording}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
