import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { consumeFetchSse } from '@/lib/fetchSse';

export type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt?: Date;
    knowledgeId?: string;
};

export function createMessageId(prefix: 'user' | 'assistant'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type UseChatStreamOptions = {
    activeConversationId: string | null;
    language: 'en' | 'bn' | 'hi';
    userId: string | null;
    onConversationIdChange: (conversationId: string | null) => void;
    onBeforeSend?: () => void;
    onAfterSend?: () => void;
    onError?: (message: string) => void;
    scrollToBottom: () => void;
};

export function useChatStream(options: UseChatStreamOptions): {
    sendMessage: (input: string) => Promise<void>;
    stop: () => void;
    isLoading: boolean;
    streamingMessageId: string | null;
    streamingDisplay: string;
    messages: ChatMessage[];
    setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
} {
    const {
        activeConversationId,
        language,
        userId,
        onConversationIdChange,
        onBeforeSend,
        onAfterSend,
        onError,
        scrollToBottom,
    } = options;

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingDisplay, setStreamingDisplay] = useState('');
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

    const chatAbortControllerRef = useRef<AbortController | null>(null);
    const streamingContentRef = useRef('');
    const pendingDeltaRef = useRef('');
    const rafIdRef = useRef<number | null>(null);
    const scrollThrottleRef = useRef<number | null>(null);

    const scrollToBottomThrottled = useCallback(() => {
        if (scrollThrottleRef.current) {
            return;
        }

        scrollThrottleRef.current = window.setTimeout(() => {
            scrollToBottom();
            scrollThrottleRef.current = null;
        }, 100);
    }, [scrollToBottom]);

    const stop = useCallback(() => {
        chatAbortControllerRef.current?.abort();
        chatAbortControllerRef.current = null;

        if (streamingContentRef.current.trim()) {
            const assistantMessageId = streamingMessageId || createMessageId('assistant');
            setMessages((current) => [
                ...current,
                {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: streamingContentRef.current,
                    createdAt: new Date(),
                },
            ]);
        }

        setStreamingMessageId(null);
        setStreamingDisplay('');
        streamingContentRef.current = '';
        setIsLoading(false);
    }, [streamingMessageId]);

    const sendMessage = useCallback(async (question: string) => {
        const trimmedQuestion = question.trim();
        if (!trimmedQuestion || isLoading) {
            return;
        }

        onBeforeSend?.();

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
                onConversationIdChange(conversationId);
            }

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

            await consumeFetchSse(response, async ({ event, data }) => {
                if (event === 'delta' && data && typeof data === 'object' && 'text' in data && typeof data.text === 'string') {
                    pendingDeltaRef.current += data.text;
                    streamingContentRef.current += data.text;

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

                if (event === 'done' && data && typeof data === 'object' && 'content' in data && typeof data.content === 'string') {
                    const finalContent = data.content;
                    const knowledgeId = 'knowledgeId' in data && typeof data.knowledgeId === 'string'
                        ? data.knowledgeId
                        : undefined;

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
                            knowledgeId,
                        },
                    ]);
                    return;
                }

                if (event === 'error') {
                    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
                        throw new Error(data.message);
                    }

                    throw new Error('Failed to process chat request.');
                }
            });

            onAfterSend?.();
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
                },
            ]);
            onError?.(fallbackMessage);
        } finally {
            if (chatAbortControllerRef.current === controller) {
                chatAbortControllerRef.current = null;
            }
            if (!controller.signal.aborted) {
                setStreamingMessageId((current) => current === assistantMessageId ? null : current);
            }
            setIsLoading(false);
        }
    }, [
        activeConversationId,
        isLoading,
        language,
        messages,
        onAfterSend,
        onBeforeSend,
        onConversationIdChange,
        onError,
        scrollToBottomThrottled,
        userId,
    ]);

    useEffect(() => {
        return () => {
            chatAbortControllerRef.current?.abort();
            if (scrollThrottleRef.current !== null) {
                window.clearTimeout(scrollThrottleRef.current);
            }
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, []);

    return {
        sendMessage,
        stop,
        isLoading,
        streamingMessageId,
        streamingDisplay,
        messages,
        setMessages,
    };
}
