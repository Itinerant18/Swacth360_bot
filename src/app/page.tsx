'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo, type ComponentPropsWithoutRef, type JSX as ReactJSX } from 'react';
import dynamic from 'next/dynamic';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import remarkGfm from 'remark-gfm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSignal, faRobot, faPaperPlane,
    faCopy, faCheck, faChevronDown, faSpinner, faDiagramProject,
    faThumbsUp, faThumbsDown, faSignOutAlt, faBolt,
    faPlus, faTrash, faTimes, faComment, faBookmark, faLock,
} from '@fortawesome/free-solid-svg-icons';
import LanguageSelector from '../components/LanguageSelector';
import DiagramCard from '../components/DiagramCard';
import { signOut, isAdminEmail, getSupabaseAuth, sanitizeAuthSession } from '@/lib/auth';
import { consumeFetchSse } from '@/lib/fetchSse';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';


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

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt?: Date;
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

function createMessageId(prefix: 'user' | 'assistant'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
        intro: 'I am SAI, your HMS support assistant. Ask me anything — troubleshooting, configuration, or installation.',
        placeholder: 'Ask anything...',
        footer: 'HMS Panel Expert · AI Powered · Diagrams supported',
        thinking: 'Analyzing and generating response...',
    },
    bn: {
        welcome: 'HMS প্যানেল ট্রাবলশুটিং সম্পর্কে জিজ্ঞাসা করুন',
        intro: 'আমি SAI, আপনার HMS সাপোর্ট অ্যাসিস্ট্যান্ট। ট্রাবলশুটিং, কনফিগারেশন, বা ইন্সটলেশন সম্পর্কে জিজ্ঞাসা করুন।',
        placeholder: 'যে কোনো প্রশ্ন করুন...',
        footer: 'HMS প্যানেল বিশেষজ্ঞ · AI দ্বারা চালিত · ডায়াগ্রাম সমর্থিত',
        thinking: 'বিশ্লেষণ ও উত্তর তৈরি হচ্ছে…',
    },
    hi: {
        welcome: 'HMS पैनल ट्रबलशूटिंग के बारे में पूछें',
        intro: 'मैं SAI हूँ, आपका HMS सपोर्ट असिस्टेंट। ट्रबलशूटिंग, कॉन्फ़िगरेशन या इंस्टॉलेशन के बारे में पूछें।',
        placeholder: 'कुछ भी पूछें...',
        footer: 'HMS पैनल विशेषज्ञ · AI संचालित · डायग्राम समर्थित',
        thinking: 'विश्लेषण और उत्तर तैयार किया जा रहा है...',
    },
};

// ─── Memoized Message Bubble ──────────────────────────────────
const MessageBubble = React.memo(function MessageBubble({
    message,
    language,
    streamingMessageId,
    responseTimes,
    messageTimestamps,
    copiedId,
    feedbackSubmitted,
    handleCopy,
    handleFeedback,
    isLastAssistant,
    onRegenerate,
    onEdit,
    isEditing,
    editInput,
    setEditInput,
    onSaveEdit,
    onCancelEdit,
}: {
    message: ChatMessage;
    language: 'en' | 'bn' | 'hi';
    streamingMessageId: string | null;
    responseTimes: Map<string, number>;
    messageTimestamps: Map<string, Date>;
    copiedId: string | null;
    feedbackSubmitted: Set<string>;
    handleCopy: (text: string, id: string) => void;
    handleFeedback: (messageId: string, rating: number, isRelevant: boolean) => void;
    isLastAssistant?: boolean;
    onRegenerate?: () => void;
    onEdit?: (id: string, currentText: string) => void;
    isEditing?: boolean;
    editInput?: string;
    setEditInput?: (val: string) => void;
    onSaveEdit?: () => void;
    onCancelEdit?: () => void;
}) {
    const parsed = message.role === 'assistant' ? parseMessageContent(message.content) : null;
    const isStreamingAssistant = message.role === 'assistant' && message.id === streamingMessageId;
    const showThinkingState = isStreamingAssistant && !message.content.trim();

    const getMessageTimeLabel = (msg: ChatMessage) => {
        const timestamp = msg.createdAt instanceof Date
            ? msg.createdAt
            : messageTimestamps.get(msg.id);

        return timestamp ? formatRelativeTime(timestamp) : '';
    };

    return (
        <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}
            style={{ contentVisibility: 'auto' }}
        >
            <div className={`max-w-[92%] sm:max-w-[85%] ${message.role === 'user'
                ? 'rounded-2xl p-3.5 sm:p-4 lg:p-5 bg-[#4b2e22] text-[#FAF7F2] shadow-[0_2px_4px_rgba(0,0,0,0.2)] rounded-tr-sm'
                : parsed?.isDiagram
                    ? 'w-full' // diagram takes full width
                    : 'rounded-2xl p-4 sm:p-5 bg-[#FAF7F2] border border-[#D6CFC4] text-[#1C1917] shadow-sm rounded-tl-sm'
                }`}>

                {/* ── Assistant: Diagram Response ── */}
                {message.role === 'assistant' && parsed?.isDiagram && parsed.diagram && (
                    <div className="w-full">
                        <div className="flex items-center gap-2 mb-1 px-1">
                            <div className="w-5 h-5 rounded-md bg-blue-900/30 flex items-center justify-center text-blue-400 border border-blue-700/30">
                                <FontAwesomeIcon icon={faDiagramProject} className="w-2.5 h-2.5" />
                            </div>
                            <span className="text-[10px] text-blue-400 font-semibold tracking-wide uppercase font-mono">
                                Diagram Generated
                            </span>
                            {responseTimes.has(message.id) && (
                                <span className="text-[10px] text-[#A8A29E] flex items-center gap-1 ml-auto">
                                    <FontAwesomeIcon icon={faBolt} className="w-2.5 h-2.5" />
                                    {responseTimes.get(message.id)!.toFixed(1)}s
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
                                {isLastAssistant && onRegenerate && (
                                    <button
                                        onClick={onRegenerate}
                                        className="p-1.5 rounded hover:bg-[#E8E0D4] text-[#A8A29E] hover:text-[#CA8A04] transition-colors"
                                        title="Regenerate" aria-label="Regenerate"
                                    >
                                        <FontAwesomeIcon icon={faSignal} className="w-3 h-3" />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleFeedback(message.id, 5, true)}
                                    disabled={feedbackSubmitted.has(message.id)}
                                    className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(message.id) ? 'opacity-40 cursor-not-allowed text-[#A8A29E]' : 'hover:bg-[#E8E0D4] hover:text-[#0D9488] text-[#A8A29E]'}`}
                                    title="Helpful" aria-label="Helpful"
                                >
                                    <FontAwesomeIcon icon={faThumbsUp} className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() => handleFeedback(message.id, 1, false)}
                                    disabled={feedbackSubmitted.has(message.id)}
                                    className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(message.id) ? 'opacity-40 cursor-not-allowed text-[#A8A29E]' : 'hover:bg-[#E8E0D4] hover:text-red-600 text-[#A8A29E]'}`}
                                    title="Not helpful" aria-label="Not helpful"
                                >
                                    <FontAwesomeIcon icon={faThumbsDown} className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                        {getMessageTimeLabel(message) && (
                            <div className="mt-2 px-1 text-[10px] text-[#A8A29E]">
                                {getMessageTimeLabel(message)}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Assistant: Normal Text Response ── */}
                {message.role === 'assistant' && !parsed?.isDiagram && (
                    <>
                        <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-[#0D9488]/15 flex items-center justify-center text-[#0D9488] border border-[#0D9488]/20">
                                    <FontAwesomeIcon icon={faRobot} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </div>
                                <div className="text-[10px] sm:text-xs text-[#0D9488] font-semibold tracking-wide uppercase">Support AI</div>
                                {isStreamingAssistant && (
                                    <div className="flex gap-1 items-center ml-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#CA8A04] animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                )}
                            </div>
                            {message.content.trim() && (
                                <button onClick={() => handleCopy(message.content, message.id)}
                                    className="p-1 rounded text-[#A8A29E] hover:text-[#CA8A04] transition-colors cursor-pointer"
                                    title="Copy response" aria-label="Copy response">
                                    <FontAwesomeIcon icon={copiedId === message.id ? faCheck : faCopy}
                                        className={`w-3 h-3 ${copiedId === message.id ? 'text-emerald-600' : ''}`} />
                                </button>
                            )}
                        </div>
                        <div className="text-sm sm:text-[15px] leading-relaxed">
                            {showThinkingState ? (
                                <div className="space-y-3">
                                    <div className="space-y-2.5">
                                        <div className="h-3.5 rounded-full w-[92%] animate-pulse bg-[#E8E0D4] opacity-60" />
                                        <div className="h-3.5 rounded-full w-[78%] animate-pulse bg-[#E8E0D4] opacity-40" style={{ animationDelay: '150ms' }} />
                                        <div className="h-3.5 rounded-full w-[64%] animate-pulse bg-[#E8E0D4] opacity-20" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    <span className="text-[10px] sm:text-[11px] text-[#A8A29E] block italic tracking-wide">
                                        {TEXT_MAP[language as keyof typeof TEXT_MAP].thinking}
                                    </span>
                                </div>
                            ) : (
                                <>
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
                                        code: (props: MarkdownElementProps<'code'>) => {
                                            const { children, className, ...rest } = props;
                                            const match = /language-(\w+)/.exec(className || '');
                                            const inline = !match;
                                            const lang = match ? match[1] : '';

                                            if (inline) {
                                                return (
                                                    <code className="px-1.5 py-0.5 rounded text-xs sm:text-sm bg-[#F0EBE3] text-[#0D9488] border border-[#D6CFC4]">
                                                        {children}
                                                    </code>
                                                );
                                            }

                                            return (
                                                <div className="my-4 rounded-xl overflow-hidden border border-[#D6CFC4] shadow-sm group/code">
                                                    <div className="bg-[#F0EBE3] px-4 py-2 border-b border-[#D6CFC4] flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-[#78716C] uppercase tracking-widest">{lang || 'code'}</span>
                                                        <button
                                                            onClick={() => handleCopy(String(children).replace(/\n$/, ''), `code-${Date.now()}`)}
                                                            className="text-[10px] font-semibold text-[#0D9488] hover:text-[#0A7A6E] flex items-center gap-1.5 transition-colors"
                                                        >
                                                            <FontAwesomeIcon icon={faCopy} className="w-2.5 h-2.5" />
                                                            Copy
                                                        </button>
                                                    </div>
                                                    <SyntaxHighlighter
                                                        style={oneLight}
                                                        language={lang}
                                                        PreTag="div"
                                                        customStyle={{
                                                            margin: 0,
                                                            padding: '1rem',
                                                            fontSize: '13px',
                                                            lineHeight: '1.6',
                                                            backgroundColor: '#FAF7F2'
                                                        }}
                                                    >
                                                        {String(children).replace(/\n$/, '')}
                                                    </SyntaxHighlighter>
                                                </div>
                                            );
                                        },
                                    }}>
                                        {message.content}
                                    </ReactMarkdown>
                                    {isStreamingAssistant && (
                                        <div className="mt-2">
                                            <span className="inline-block h-4 w-1.5 rounded-sm bg-[#0D9488] animate-pulse" aria-hidden="true" />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        {!isStreamingAssistant && (
                            <div className="mt-2 flex items-center gap-3 text-[10px] text-[#A8A29E]">
                                {responseTimes.has(message.id) && (
                                    <span className="flex items-center gap-1">
                                        <FontAwesomeIcon icon={faBolt} className="w-2.5 h-2.5" />
                                        {responseTimes.get(message.id)!.toFixed(1)}s
                                    </span>
                                )}
                                {getMessageTimeLabel(message) && <span>{getMessageTimeLabel(message)}</span>}
                                <div className="flex items-center gap-1 ml-auto">
                                    {isLastAssistant && onRegenerate && (
                                        <button
                                            onClick={onRegenerate}
                                            className="p-1.5 rounded hover:bg-[#E8E0D4] hover:text-[#CA8A04] transition-colors"
                                            title="Regenerate" aria-label="Regenerate"
                                        >
                                            <FontAwesomeIcon icon={faSignal} className="w-3 h-3" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleFeedback(message.id, 5, true)}
                                        disabled={feedbackSubmitted.has(message.id)}
                                        className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(message.id) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#E8E0D4] hover:text-[#0D9488]'}`}
                                        title="Helpful" aria-label="Helpful"
                                    >
                                        <FontAwesomeIcon icon={faThumbsUp} className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => handleFeedback(message.id, 1, false)}
                                        disabled={feedbackSubmitted.has(message.id)}
                                        className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(message.id) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#E8E0D4] hover:text-red-600'}`}
                                        title="Not helpful" aria-label="Not helpful"
                                    >
                                        <FontAwesomeIcon icon={faThumbsDown} className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ── User message ── */}
                {message.role === 'user' && (
                    <>
                        <div className="text-sm sm:text-[15px] leading-relaxed">
                            {isEditing && editInput !== undefined && setEditInput ? (
                                <div className="space-y-2 min-w-[200px]">
                                    <textarea
                                        value={editInput}
                                        onChange={(e) => setEditInput(e.target.value)}
                                        className="w-full bg-white/10 border border-white/20 rounded-lg p-2 text-sm focus:outline-none focus:border-[#EAB308] min-h-[60px]"
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={onCancelEdit} className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors">Cancel</button>
                                        <button onClick={onSaveEdit} className="text-[10px] px-2 py-1 rounded bg-[#EAB308] text-[#4b2e22] font-semibold transition-colors">Save & Submit</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="group relative">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                        p: (props: MarkdownElementProps<'p'>) => <p className="mb-2.5 last:mb-0 whitespace-pre-wrap" {...stripMarkdownNode(props)} />,
                                        strong: (props: MarkdownElementProps<'strong'>) => <strong className="font-semibold text-[#CA8A04]" {...stripMarkdownNode(props)} />,
                                        code: (props: MarkdownElementProps<'code'>) => (
                                            <code className="px-1.5 py-0.5 rounded text-xs sm:text-sm bg-white/15 text-[#EAB308]" {...stripMarkdownNode(props)} />
                                        ),
                                    }}>
                                        {message.content}
                                    </ReactMarkdown>
                                    {!streamingMessageId && onEdit && (
                                        <button
                                            onClick={() => onEdit(message.id, message.content)}
                                            className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 p-1 rounded text-white/40 hover:text-white transition-all"
                                            title="Edit message" aria-label="Edit message"
                                        >
                                            <FontAwesomeIcon icon={faPaperPlane} className="w-2.5 h-2.5 rotate-180" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-white/40">
                            {getMessageTimeLabel(message) && <span>{getMessageTimeLabel(message)}</span>}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
});

export default function Chat() {
    const [isSessionLoading, setIsSessionLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    // ─── Auth State ───────────────────────────────────────────
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const chatAbortControllerRef = useRef<AbortController | null>(null);
    const historyAbortControllerRef = useRef<AbortController | null>(null);
    const historyRequestIdRef = useRef(0);
    const scrollBehaviorRef = useRef<ScrollBehavior>('smooth');
    const sidebarRefreshTimeoutRef = useRef<number | null>(null);

    // ─── Phase 1: Streaming Refs & State ──────────────────────
    const [streamingDisplay, setStreamingDisplay] = useState('');
    const streamingContentRef = useRef('');
    const pendingDeltaRef = useRef('');
    const rafIdRef = useRef<number | null>(null);
    const scrollThrottleRef = useRef<number | null>(null);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

    const scrollToBottomThrottled = useCallback(() => {
        if (scrollThrottleRef.current) return;
        scrollThrottleRef.current = window.setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            scrollThrottleRef.current = null;
        }, 100);
    }, []);

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
            chatAbortControllerRef.current?.abort();
            subscription.unsubscribe();
            historyAbortControllerRef.current?.abort();
            if (sidebarRefreshTimeoutRef.current !== null) {
                window.clearTimeout(sidebarRefreshTimeoutRef.current);
            }
            if (scrollThrottleRef.current !== null) {
                window.clearTimeout(scrollThrottleRef.current);
            }
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
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

    useEffect(() => {
        if (typeof window !== 'undefined' && isAuthenticated && window.innerWidth >= 1024) {
            setSidebarOpen(true);
        }
    }, [isAuthenticated]);


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

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const scheduleConversationRefresh = useCallback(() => {
        void refreshConversations();

        if (sidebarRefreshTimeoutRef.current !== null) {
            window.clearTimeout(sidebarRefreshTimeoutRef.current);
        }

        sidebarRefreshTimeoutRef.current = window.setTimeout(() => {
            void refreshConversations();
        }, 1200);
    }, [refreshConversations]);

    const stop = useCallback(() => {
        chatAbortControllerRef.current?.abort();
        chatAbortControllerRef.current = null;
        
        // If we have partial content, save it as a completed message
        if (streamingContentRef.current.trim()) {
            const assistantMessageId = streamingMessageId || createMessageId('assistant');
            setMessages((current) => [
                ...current,
                {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: streamingContentRef.current,
                    createdAt: new Date(),
                }
            ]);
        }
        
        setStreamingMessageId(null);
        setStreamingDisplay('');
        streamingContentRef.current = '';
        setIsLoading(false);
    }, [streamingMessageId]);

    const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setInput(event.target.value);
    }, []);

    const sendMessage = useCallback(async (question: string) => {
        const trimmedQuestion = question.trim();
        if (!trimmedQuestion || isLoading) {
            return;
        }

        const controller = new AbortController();
        chatAbortControllerRef.current?.abort();
        chatAbortControllerRef.current = controller;

        const userMessage: ChatMessage = {
            id: createMessageId('user'),
            role: 'user',
            content: trimmedQuestion,
            createdAt: new Date(),
        };
        const assistantMessageId = createMessageId('assistant');
        const requestMessages = [...messages, userMessage];

        setHistoryError(null);
        setInput('');
        setIsLoading(true);
        setStreamingMessageId(assistantMessageId);
        setStreamingDisplay('');
        streamingContentRef.current = '';
        pendingDeltaRef.current = '';
        if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        
        setMessages(requestMessages);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Accept: 'text/event-stream',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: requestMessages.map(({ role, content }) => ({ role, content })),
                    userId,
                    language,
                    conversationId: activeConversationId,
                }),
                signal: controller.signal,
            });

            const conversationId = response.headers.get('x-conversation-id');
            if (conversationId) {
                setActiveConversationId(conversationId);
            }
            setHistoryError(null);

            if (!response.ok) {
                let errorMessage = 'Failed to process chat request.';

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

            await consumeFetchSse(response, async ({ event, data: rawEnvelope }) => {
                const payload = (rawEnvelope && typeof rawEnvelope === 'object' && 'data' in rawEnvelope)
                    ? (rawEnvelope as { data: unknown }).data
                    : rawEnvelope;

                if (event === 'delta' && payload && typeof payload === 'object' && 'text' in payload && typeof payload.text === 'string') {
                    const deltaText = payload.text;
                    
                    // Phase 1A: Delta batching with requestAnimationFrame
                    pendingDeltaRef.current += deltaText;
                    streamingContentRef.current += deltaText;
                    
                    if (!rafIdRef.current) {
                        rafIdRef.current = requestAnimationFrame(() => {
                            setStreamingDisplay(streamingContentRef.current);
                            rafIdRef.current = null;
                            pendingDeltaRef.current = '';
                            scrollToBottomThrottled();
                        });
                    }
                    return;
                }

                if (event === 'done' && payload && typeof payload === 'object' && 'content' in payload && typeof payload.content === 'string') {
                    const finalContent = payload.content;
                    
                    if (rafIdRef.current) {
                        cancelAnimationFrame(rafIdRef.current);
                        rafIdRef.current = null;
                    }
                    
                    setStreamingMessageId(null);
                    setStreamingDisplay('');
                    streamingContentRef.current = '';
                    
                    setMessages((current) => [
                        ...current,
                        {
                            id: assistantMessageId,
                            role: 'assistant',
                            content: finalContent,
                            createdAt: new Date(),
                        }
                    ]);
                    return;
                }

                if (event === 'error') {
                    if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') {
                        throw new Error(payload.message);
                    }

                    throw new Error('Failed to process chat request.');
                }
            });

            scheduleConversationRefresh();
        } catch (error) {
            if (controller.signal.aborted) {
                return;
            }

            console.error('Chat request failed:', error);
            const fallbackMessage = error instanceof Error
                ? error.message
                : 'Failed to process chat request.';
            
            setStreamingMessageId(null);
            const currentContent = streamingContentRef.current;
            setStreamingDisplay('');
            streamingContentRef.current = '';

            setMessages((current) => [
                ...current,
                {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: currentContent || fallbackMessage,
                    createdAt: new Date(),
                }
            ]);
        } finally {
            if (chatAbortControllerRef.current === controller) {
                chatAbortControllerRef.current = null;
            }
            if (!controller.signal.aborted) {
                setStreamingMessageId((current) => current === assistantMessageId ? null : current);
            }
            setIsLoading(false);
        }
    }, [activeConversationId, isLoading, language, messages, scheduleConversationRefresh, userId, scrollToBottomThrottled]);

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
        setFeedbackSubmitted(new Set());
        setResponseTimes(new Map());
        setMessageTimestamps(new Map());

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

    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveSessionName, setSaveSessionName] = useState('');
    const [isSavingSession, setIsSavingSession] = useState(false);
    const [sessionSaved, setSessionSaved] = useState(false);

    const GUEST_QUESTION_LIMIT = 3;
    const [guestQuestionCount, setGuestQuestionCount] = useState(0);
    const [showGuestGate, setShowGuestGate] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) {
            const stored = localStorage.getItem('guest_question_count');
            const count = stored ? parseInt(stored, 10) : 0;
            setGuestQuestionCount(count);
            if (count >= GUEST_QUESTION_LIMIT) setShowGuestGate(true);
        } else {
            setShowGuestGate(false);
        }
    }, [isAuthenticated]);

    const incrementGuestCount = useCallback(() => {
        const newCount = guestQuestionCount + 1;
        setGuestQuestionCount(newCount);
        localStorage.setItem('guest_question_count', String(newCount));
        if (newCount >= GUEST_QUESTION_LIMIT) {
            setShowGuestGate(true);
        }
    }, [guestQuestionCount]);

    const handleSaveSession = useCallback(async () => {
        if (!activeConversationId || !saveSessionName.trim() || isSavingSession) return;

        setIsSavingSession(true);
        try {
            const res = await fetch(`/api/conversations/${activeConversationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ title: saveSessionName.trim() }),
            });

            if (!res.ok) throw new Error('Save failed');

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

    const handleSubmit = (e?: { preventDefault?: () => void }) => {
        e?.preventDefault?.();

        if (!isAuthenticated && guestQuestionCount >= GUEST_QUESTION_LIMIT) {
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
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
    const [requestStartTime, setRequestStartTime] = useState<number | null>(null);
    const [responseTimes, setResponseTimes] = useState<Map<string, number>>(new Map());
    const [messageTimestamps, setMessageTimestamps] = useState<Map<string, Date>>(new Map());
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set());

    // ─── Phase 2: Interaction Handlers ────────────────────────
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editInput, setEditInput] = useState('');

    const handleRegenerate = useCallback(() => {
        // Find last user message
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) return;

        // Remove the last assistant message (if any) that followed this user message
        setMessages(current => {
            const lastMsg = current[current.length - 1];
            if (lastMsg?.role === 'assistant') {
                return current.slice(0, -1);
            }
            return current;
        });

        void sendMessage(lastUserMsg.content);
    }, [messages, sendMessage]);

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

        const id = editingMessageId;
        const newContent = editInput.trim();

        setEditingMessageId(null);
        setEditInput('');

        // Find index of editing message
        const index = messages.findIndex(m => m.id === id);
        if (index === -1) return;

        // Truncate history up to this message, replace it, then send
        const newHistory = messages.slice(0, index);
        setMessages(newHistory);
        void sendMessage(newContent);
    }, [editingMessageId, editInput, messages, sendMessage]);

    const handleFeedback = useCallback(async (messageId: string, rating: number, isRelevant: boolean) => {
        if (feedbackSubmitted.has(messageId)) return;

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
    }, [feedbackSubmitted, messages]);

    useEffect(() => {
        setSuggestedQuestions(getCuratedSuggestions());
        const interval = setInterval(() => setSuggestedQuestions(getCuratedSuggestions()), 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (scrollBehaviorRef.current === 'smooth') {
            scrollToBottomThrottled();
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
        scrollBehaviorRef.current = 'smooth';
    }, [messages, scrollToBottomThrottled]);

    useEffect(() => {
        if (isLoading && !requestStartTime) setRequestStartTime(performance.now());
        if (!isLoading && requestStartTime) {
            const duration = (performance.now() - requestStartTime) / 1000;
            const lastBotMsg = [...messages].reverse().find(m => m.role === 'assistant');
            if (lastBotMsg) setResponseTimes(prev => new Map(prev).set(lastBotMsg.id, duration));
            setRequestStartTime(null);
        }
    }, [isLoading, messages, requestStartTime]);

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

    useEffect(() => {
        if (!isLoading && !isLoadingHistory && !isSessionLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading, isLoadingHistory, isSessionLoading, activeConversationId]);

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
        } catch { /* noop */ }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey && input.trim() && !isLoading && !isLoadingHistory) {
            e.preventDefault();
            handleSubmit({ preventDefault: () => undefined });
        }
    };

    const handleSuggestionClick = (question: string) => {
        if (!isAuthenticated && guestQuestionCount >= GUEST_QUESTION_LIMIT) {
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

    const groupedConversations = groupConversationsByDate(conversations);

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
                        title="Open History Sidebar" aria-label="Open History Sidebar"
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
                                        title="Close sidebar" aria-label="Close sidebar"
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
                                    title="New conversation" aria-label="New conversation"
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
                                                                title="Delete" aria-label="Delete"
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

            <div className="flex flex-col flex-1 min-w-0 transition-all duration-300">
                <header className="sticky top-0 z-20 skeuo-metal flex-shrink-0">
                    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">

                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl skeuo-leather flex items-center justify-center shadow-md flex-shrink-0">
                                <FontAwesomeIcon icon={faSignal} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#CA8A04]" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#1C1917] leading-tight truncate">
                                    <span className="hidden sm:inline">SAI Tech Support </span>
                                    <span className="sm:hidden">SAI </span>
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
                                <button onClick={handleSignOut} className="skeuo-raised flex items-center gap-1.5 text-xs text-[#44403C] px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all hover:bg-red-50 hover:text-red-700 flex-shrink-0" title="Sign Out" aria-label="Sign Out">
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

                <main ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
                    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">

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
                                        {TEXT_MAP[language as keyof typeof TEXT_MAP].welcome}
                                    </h2>
                                    <p className="text-[#78716C] max-w-md mx-auto leading-relaxed text-sm">
                                        {TEXT_MAP[language as keyof typeof TEXT_MAP].intro}
                                    </p>

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
                                {messages.map((m, index) => {
                                    const isLastAssistant = m.role === 'assistant' && index === messages.length - 1;
                                    return (
                                        <MessageBubble
                                            key={m.id}
                                            message={m}
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
                                            isEditing={editingMessageId === m.id}
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
                                            createdAt: new Date()
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
                    <button onClick={scrollToBottom}
                        className="fixed bottom-28 sm:bottom-32 right-4 sm:right-6 z-30 skeuo-raised w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full shadow-lg animate-fade-up cursor-pointer"
                        title="Scroll to bottom" aria-label="Scroll to bottom">
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
                                            onChange={(e) => setSaveSessionName(e.target.value)}
                                            placeholder="Enter session name..."
                                            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[#D6CFC4] bg-[#FAF7F2] text-[#1C1917] focus:outline-none focus:border-[#CA8A04] transition-colors"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && saveSessionName.trim()) {
                                                    e.preventDefault();
                                                    void handleSaveSession();
                                                }
                                                if (e.key === 'Escape') {
                                                    setShowSaveModal(false);
                                                    setSaveSessionName('');
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={() => void handleSaveSession()}
                                            disabled={!saveSessionName.trim() || isSavingSession}
                                            className="skeuo-brass px-3 py-1.5 text-xs rounded-lg disabled:opacity-40 flex items-center gap-1.5"
                                        >
                                            {isSavingSession ? (
                                                <FontAwesomeIcon icon={faSpinner} className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <FontAwesomeIcon icon={faBookmark} className="w-3 h-3" />
                                            )}
                                            Save
                                        </button>
                                        <button
                                            onClick={() => { setShowSaveModal(false); setSaveSessionName(''); }}
                                            className="p-1.5 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-black/5 transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowSaveModal(true)}
                                        className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-[#78716C] hover:text-[#CA8A04] rounded-lg hover:bg-[#CA8A04]/5 transition-all duration-200"
                                    >
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

                        {showGuestGate && !isAuthenticated ? (
                            <div className="skeuo-card rounded-2xl p-5 text-center animate-fade-up">
                                <div className="w-10 h-10 mx-auto rounded-xl bg-[#CA8A04]/10 flex items-center justify-center mb-3">
                                    <FontAwesomeIcon icon={faLock} className="w-4 h-4 text-[#CA8A04]" />
                                </div>
                                <h3 className="text-sm font-semibold text-[#1C1917] mb-1">
                                    Free questions used up
                                </h3>
                                <p className="text-xs text-[#78716C] mb-4 leading-relaxed">
                                    Sign in to continue chatting with unlimited access,<br />
                                    save your sessions, and access full history.
                                </p>
                                <button
                                    onClick={() => window.location.href = '/login'}
                                    className="skeuo-brass px-5 py-2 text-sm font-semibold rounded-xl"
                                >
                                    Sign In to Continue
                                </button>
                            </div>
                        ) : (
                            <>
                                <form onSubmit={handleSubmit} className="relative flex items-center">
                                    <label htmlFor="chat-input" className="sr-only">Ask a question</label>
                                    <input ref={inputRef}
                                        id="chat-input"
                                        className="skeuo-input w-full p-3 sm:p-4 pl-4 sm:pl-5 pr-12 sm:pr-14 text-sm sm:text-[15px]"
                                        value={input}
                                        placeholder={TEXT_MAP[language as keyof typeof TEXT_MAP].placeholder}
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
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-[10px] sm:text-[11px] text-[#A8A29E]">
                                        {TEXT_MAP[language as keyof typeof TEXT_MAP].footer} <span className="hidden sm:inline">· Ctrl+Enter to send</span>
                                    </p>
                                    {!isAuthenticated && (
                                        <span className="text-[10px] text-[#A8A29E]">
                                            {GUEST_QUESTION_LIMIT - guestQuestionCount} free {GUEST_QUESTION_LIMIT - guestQuestionCount === 1 ? 'question' : 'questions'} left
                                        </span>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
