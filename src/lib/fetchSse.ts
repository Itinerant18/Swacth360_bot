import type { SseEnvelope } from '@/lib/sse';

export interface FetchSseEvent {
    event: string;
    data: unknown;
    rawData: string;
    envelope: SseEnvelope;
}

function parseEventData(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function isEnvelope(value: unknown): value is SseEnvelope {
    return Boolean(
        value
        && typeof value === 'object'
        && 'event' in value
        && 'ts' in value
        && 'meta' in value
        && 'data' in value,
    );
}

export async function consumeFetchSse(
    response: Response,
    onEvent: (event: FetchSseEvent) => void | Promise<void>,
): Promise<void> {
    if (!response.body) {
        throw new Error('Streaming response body is not available.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';
    let dataLines: string[] = [];

    const dispatch = async () => {
        if (dataLines.length === 0) {
            currentEvent = 'message';
            return;
        }

        const rawData = dataLines.join('\n');
        const fallbackEvent = currentEvent || 'message';
        const parsed = parseEventData(rawData);
        const envelope = isEnvelope(parsed)
            ? parsed
            : {
                event: fallbackEvent,
                ts: new Date().toISOString(),
                meta: {
                    requestId: null,
                    conversationId: null,
                    stream: null,
                    source: null,
                },
                data: parsed,
            };

        currentEvent = 'message';
        dataLines = [];

        await onEvent({
            event: envelope.event,
            data: envelope.data,
            rawData,
            envelope,
        });
    };

    while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        let lineBreakIndex = buffer.indexOf('\n');
        while (lineBreakIndex !== -1) {
            const rawLine = buffer.slice(0, lineBreakIndex);
            buffer = buffer.slice(lineBreakIndex + 1);
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

            if (!line) {
                await dispatch();
            } else if (line.startsWith(':')) {
                // SSE comment/heartbeat.
            } else if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim() || 'message';
            } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }

            lineBreakIndex = buffer.indexOf('\n');
        }

        if (done) {
            break;
        }
    }

    if (buffer.trim() || dataLines.length > 0) {
        if (buffer.trim()) {
            const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
            if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim() || 'message';
            } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        }

        await dispatch();
    }
}
