import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB (Whisper API limit)

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('Missing OPENAI_API_KEY');
        }
        openaiClient = new OpenAI({ apiKey, timeout: 60_000 });
    }
    return openaiClient;
}

export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get('content-type') || '';
        if (!contentType.includes('multipart/form-data')) {
            return NextResponse.json(
                { error: 'Expected multipart/form-data' },
                { status: 400 },
            );
        }

        const formData = await request.formData();
        const audioFile = formData.get('audio');

        if (!audioFile || !(audioFile instanceof File)) {
            return NextResponse.json(
                { error: 'Missing "audio" file in form data' },
                { status: 400 },
            );
        }

        if (audioFile.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'Audio file exceeds 25 MB limit' },
                { status: 413 },
            );
        }

        if (audioFile.size === 0) {
            return NextResponse.json(
                { error: 'Audio file is empty' },
                { status: 400 },
            );
        }

        const languageParam = formData.get('language') as string | null;

        const openai = getOpenAI();

        const transcription = await openai.audio.transcriptions.create({
            model: 'whisper-1',
            file: audioFile,
            language: languageParam && ['en', 'hi', 'bn'].includes(languageParam) ? languageParam : undefined,
        });

        return NextResponse.json({ text: transcription.text });
    } catch (error) {
        console.error('[api/transcribe] error:', error);

        const message = error instanceof Error ? error.message : 'Transcription failed';
        const status = (error as { status?: number })?.status || 500;

        return NextResponse.json(
            { error: message },
            { status: status >= 400 && status < 600 ? status : 500 },
        );
    }
}
