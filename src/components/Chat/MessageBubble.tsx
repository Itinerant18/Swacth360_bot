'use client';

import React, { type ComponentPropsWithoutRef, type JSX as ReactJSX } from 'react';
import dynamic from 'next/dynamic';
import remarkGfm from 'remark-gfm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSignal, faRobot, faCopy, faCheck, faDiagramProject,
    faThumbsUp, faThumbsDown, faBolt, faPaperPlane,
} from '@fortawesome/free-solid-svg-icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import DiagramCard from '@/components/DiagramCard';
import type { ChatMessage } from '@/hooks/useChatStream';

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

const ReactMarkdown = dynamic(() => import('react-markdown'), {
    ssr: false,
    loading: () => <span className="text-[#A8A29E] text-sm">...</span>,
});

interface DiagramResponse {
    __type: 'diagram';
    markdown: string;
    title: string;
    diagramType: string;
    panelType: string;
    hasKBContext: boolean;
}

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

const THINKING_COPY = {
    en: 'Analyzing and generating response...',
    bn: 'বিশ্লেষণ ও উত্তর তৈরি হচ্ছে...',
    hi: 'विश्लेषण और उत्तर तैयार किया जा रहा है...',
} as const;

type MessageBubbleProps = {
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
    setEditInput?: (value: string) => void;
    onSaveEdit?: () => void;
    onCancelEdit?: () => void;
};

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
}: MessageBubbleProps) {
    const parsed = message.role === 'assistant' ? parseMessageContent(message.content) : null;
    const isStreamingAssistant = message.role === 'assistant' && message.id === streamingMessageId;
    const showThinkingState = isStreamingAssistant && !message.content.trim();
    const canSubmitFeedback = Boolean(message.knowledgeId);

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
                    ? 'w-full'
                    : 'rounded-2xl p-4 sm:p-5 bg-[#FAF7F2] border border-[#D6CFC4] text-[#1C1917] shadow-sm rounded-tl-sm'
            }`}>
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
                                    <button onClick={onRegenerate} className="p-1.5 rounded hover:bg-[#E8E0D4] text-[#A8A29E] hover:text-[#CA8A04] transition-colors" title="Regenerate" aria-label="Regenerate">
                                        <FontAwesomeIcon icon={faSignal} className="w-3 h-3" />
                                    </button>
                                )}
                                {canSubmitFeedback && (
                                    <>
                                        <button
                                            onClick={() => handleFeedback(message.id, 5, true)}
                                            disabled={feedbackSubmitted.has(message.id)}
                                            className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(message.id) ? 'opacity-40 cursor-not-allowed text-[#A8A29E]' : 'hover:bg-[#E8E0D4] hover:text-[#0D9488] text-[#A8A29E]'}`}
                                            title="Helpful"
                                            aria-label="Helpful"
                                        >
                                            <FontAwesomeIcon icon={faThumbsUp} className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => handleFeedback(message.id, 1, false)}
                                            disabled={feedbackSubmitted.has(message.id)}
                                            className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(message.id) ? 'opacity-40 cursor-not-allowed text-[#A8A29E]' : 'hover:bg-[#E8E0D4] hover:text-red-600 text-[#A8A29E]'}`}
                                            title="Not helpful"
                                            aria-label="Not helpful"
                                        >
                                            <FontAwesomeIcon icon={faThumbsDown} className="w-3 h-3" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        {getMessageTimeLabel(message) && (
                            <div className="mt-2 px-1 text-[10px] text-[#A8A29E]">
                                {getMessageTimeLabel(message)}
                            </div>
                        )}
                    </div>
                )}

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
                                        {THINKING_COPY[language]}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                        p: (props: MarkdownElementProps<'p'>) => {
                                            const children = React.Children.map(props.children, child => {
                                                if (typeof child === 'string' && child.includes('██')) {
                                                    return (
                                                        <>
                                                            {child.replace('██', '')}
                                                            <span className="inline-block h-4 w-1.5 rounded-sm bg-[#0D9488] animate-pulse align-middle ml-1" aria-hidden="true" />
                                                        </>
                                                    );
                                                }
                                                return child;
                                            });
                                            return <p className="mb-2.5 last:mb-0 whitespace-pre-wrap" {...stripMarkdownNode(props)}>{children}</p>;
                                        },
                                        ul: (props: MarkdownElementProps<'ul'>) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...stripMarkdownNode(props)} />,
                                        ol: (props: MarkdownElementProps<'ol'>) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...stripMarkdownNode(props)} />,
                                        li: (props: MarkdownElementProps<'li'>) => {
                                            const children = React.Children.map(props.children, child => {
                                                if (typeof child === 'string' && child.includes('██')) {
                                                    return (
                                                        <>
                                                            {child.replace('██', '')}
                                                            <span className="inline-block h-4 w-1.5 rounded-sm bg-[#0D9488] animate-pulse align-middle ml-1" aria-hidden="true" />
                                                        </>
                                                    );
                                                }
                                                return child;
                                            });
                                            return <li {...stripMarkdownNode(props)}>{children}</li>;
                                        },
                                        strong: (props: MarkdownElementProps<'strong'>) => <strong className="font-semibold text-[#1C1917]" {...stripMarkdownNode(props)} />,
                                        a: ({ href, children }: MarkdownElementProps<'a'>) => (
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[#0D9488] hover:text-[#0A7A6E] underline decoration-[#0D9488]/30 hover:decoration-[#0D9488] transition-colors"
                                            >
                                                {children}
                                            </a>
                                        ),
                                        table: (props: MarkdownElementProps<'table'>) => (
                                            <div className="overflow-x-auto -mx-1 my-3">
                                                <table className="w-full border-collapse text-xs sm:text-sm" {...stripMarkdownNode(props)} />
                                            </div>
                                        ),
                                        thead: (props: MarkdownElementProps<'thead'>) => <thead className="bg-[#F0EBE3]" {...stripMarkdownNode(props)} />,
                                        th: (props: MarkdownElementProps<'th'>) => <th className="border border-[#D6CFC4] px-2.5 py-1.5 sm:px-3 sm:py-2 text-left text-[#1C1917] font-semibold" {...stripMarkdownNode(props)} />,
                                        td: (props: MarkdownElementProps<'td'>) => <td className="border border-[#D6CFC4] px-2.5 py-1.5 sm:px-3 sm:py-2" {...stripMarkdownNode(props)} />,
                                        code: (props: MarkdownElementProps<'code'>) => {
                                            const { children, className } = props;
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
                                                            backgroundColor: '#FAF7F2',
                                                        }}
                                                    >
                                                        {String(children).replace(/\n$/, '')}
                                                    </SyntaxHighlighter>
                                                </div>
                                            );
                                        },
                                    }}>
                                        {isStreamingAssistant ? message.content + '██' : message.content}
                                    </ReactMarkdown>
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
                                        <button onClick={onRegenerate} className="p-1.5 rounded hover:bg-[#E8E0D4] hover:text-[#CA8A04] transition-colors" title="Regenerate" aria-label="Regenerate">
                                            <FontAwesomeIcon icon={faSignal} className="w-3 h-3" />
                                        </button>
                                    )}
                                    {canSubmitFeedback && (
                                        <>
                                            <button
                                                onClick={() => handleFeedback(message.id, 5, true)}
                                                disabled={feedbackSubmitted.has(message.id)}
                                                className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(message.id) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#E8E0D4] hover:text-[#0D9488]'}`}
                                                title="Helpful"
                                                aria-label="Helpful"
                                            >
                                                <FontAwesomeIcon icon={faThumbsUp} className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => handleFeedback(message.id, 1, false)}
                                                disabled={feedbackSubmitted.has(message.id)}
                                                className={`p-1.5 rounded transition-colors ${feedbackSubmitted.has(message.id) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#E8E0D4] hover:text-red-600'}`}
                                                title="Not helpful"
                                                aria-label="Not helpful"
                                            >
                                                <FontAwesomeIcon icon={faThumbsDown} className="w-3 h-3" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {message.role === 'user' && (
                    <>
                        <div className="text-sm sm:text-[15px] leading-relaxed">
                            {isEditing && editInput !== undefined && setEditInput ? (
                                <div className="space-y-2 min-w-[200px]">
                                    <textarea
                                        value={editInput}
                                        onChange={(event) => setEditInput(event.target.value)}
                                        className="w-full bg-white/10 border border-white/20 rounded-lg p-2 text-sm focus:outline-none focus:border-[#EAB308] min-h-[60px]"
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={onCancelEdit} className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors">Cancel</button>
                                        <button onClick={onSaveEdit} className="text-[10px] px-2 py-1 rounded bg-[#EAB308] text-[#4b2e22] font-semibold transition-colors">Save &amp; Submit</button>
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
                                            title="Edit message"
                                            aria-label="Edit message"
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

export default MessageBubble;
