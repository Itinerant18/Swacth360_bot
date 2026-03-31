type SsePayload = unknown;

export interface SseEventMeta {
    requestId?: string | null;
    conversationId?: string | null;
    stream?: string | null;
    source?: string | null;
}

export interface SseEnvelope<T = SsePayload> {
    event: string;
    ts: string;
    meta: {
        requestId: string | null;
        conversationId: string | null;
        stream: string | null;
        source: string | null;
    };
    data: T;
}

export interface SseStreamWriter {
    send(event: string, data: SsePayload, meta?: SseEventMeta): void;
    comment(text?: string): void;
    close(): void;
    isClosed(): boolean;
}

export interface SseStreamHandle {
    headers: Headers;
    stream: ReadableStream<Uint8Array>;
}

function normalizeMeta(meta?: SseEventMeta): SseEnvelope['meta'] {
    return {
        requestId: meta?.requestId ?? null,
        conversationId: meta?.conversationId ?? null,
        stream: meta?.stream ?? null,
        source: meta?.source ?? null,
    };
}

function createEnvelope(event: string, data: SsePayload, meta?: SseEventMeta): SseEnvelope {
    return {
        event,
        ts: new Date().toISOString(),
        meta: normalizeMeta(meta),
        data,
    };
}

function createSseMessage(event: string, data: SsePayload, meta?: SseEventMeta): string {
    return `event: ${event}\ndata: ${JSON.stringify(createEnvelope(event, data, meta))}\n\n`;
}

export function createSseHeaders(headers: HeadersInit = {}): Headers {
    const merged = new Headers(headers);
    merged.set('Content-Type', 'text/event-stream; charset=utf-8');
    merged.set('Cache-Control', 'no-cache, no-transform');
    merged.set('Connection', 'keep-alive');
    merged.set('X-Accel-Buffering', 'no');
    return merged;
}

export function createSseStream(params: {
    request?: Request;
    headers?: HeadersInit;
    meta?: SseEventMeta;
    stream: (writer: SseStreamWriter) => Promise<void> | void;
}): SseStreamHandle {
    const encoder = new TextEncoder();
    const { headers, meta, request, stream } = params;

    const readableStream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false;

            const cleanup = () => {
                request?.signal.removeEventListener('abort', abortListener);
            };

            const close = () => {
                if (closed) {
                    return;
                }

                closed = true;
                cleanup();
                controller.close();
            };

            const abortListener = () => {
                close();
            };

            request?.signal.addEventListener('abort', abortListener, { once: true });

            const writer: SseStreamWriter = {
                send(eventName, payload, metaOverride) {
                    if (closed || request?.signal.aborted) {
                        return;
                    }

                    controller.enqueue(encoder.encode(createSseMessage(eventName, payload, {
                        ...meta,
                        ...metaOverride,
                    })));
                },
                comment(text = 'keep-alive') {
                    if (closed || request?.signal.aborted) {
                        return;
                    }

                    controller.enqueue(encoder.encode(`: ${text}\n\n`));
                },
                close,
                isClosed() {
                    return closed || Boolean(request?.signal.aborted);
                },
            };

            try {
                await stream(writer);
            } catch (error) {
                if (!writer.isClosed()) {
                    writer.send('error', {
                        message: error instanceof Error ? error.message : 'Stream failed',
                    });
                }
            } finally {
                close();
            }
        },
    });

    return {
        headers: createSseHeaders(headers),
        stream: readableStream,
    };
}

export function createSseResponse(params: {
    headers?: HeadersInit;
    request?: Request;
    meta?: SseEventMeta;
    stream: (writer: SseStreamWriter) => Promise<void> | void;
}): Response {
    const handle = createSseStream(params);

    return new Response(handle.stream, {
        headers: handle.headers,
    });
}
