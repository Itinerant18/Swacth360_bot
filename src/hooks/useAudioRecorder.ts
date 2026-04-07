'use client';

import { useState, useRef, useCallback } from 'react';

export type RecordingState = 'idle' | 'recording' | 'transcribing';

interface UseAudioRecorderOptions {
    onTranscription: (text: string) => void;
    onError?: (message: string) => void;
}

interface UseAudioRecorderReturn {
    state: RecordingState;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    cancelRecording: () => void;
    durationSeconds: number;
}

export function useAudioRecorder({
    onTranscription,
    onError,
}: UseAudioRecorderOptions): UseAudioRecorderReturn {
    const [state, setState] = useState<RecordingState>('idle');
    const [durationSeconds, setDurationSeconds] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const cleanup = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        mediaRecorderRef.current = null;
        chunksRef.current = [];
        setDurationSeconds(0);
    }, []);

    const transcribe = useCallback(
        async (audioBlob: Blob) => {
            setState('transcribing');

            try {
                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.webm');

                const response = await fetch('/api/transcribe', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const errorPayload = await response.json().catch(() => null) as { error?: string } | null;
                    throw new Error(errorPayload?.error || `Transcription failed (${response.status})`);
                }

                const data = await response.json() as { text: string };
                const text = data.text?.trim();

                if (text) {
                    onTranscription(text);
                } else {
                    onError?.('No speech detected. Please try again.');
                }
            } catch (error) {
                console.error('[useAudioRecorder] transcription error:', error);
                onError?.(error instanceof Error ? error.message : 'Transcription failed');
            } finally {
                setState('idle');
            }
        },
        [onTranscription, onError],
    );

    const startRecording = useCallback(async () => {
        if (state !== 'idle') return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                },
            });

            streamRef.current = stream;
            chunksRef.current = [];

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                cleanup();

                if (blob.size > 0) {
                    void transcribe(blob);
                } else {
                    setState('idle');
                    onError?.('Recording was empty. Please try again.');
                }
            };

            recorder.onerror = () => {
                cleanup();
                setState('idle');
                onError?.('Recording failed. Please try again.');
            };

            recorder.start(250);
            setState('recording');

            let elapsed = 0;
            timerRef.current = setInterval(() => {
                elapsed += 1;
                setDurationSeconds(elapsed);

                if (elapsed >= 120) {
                    recorder.stop();
                }
            }, 1000);
        } catch (error) {
            cleanup();
            setState('idle');

            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                onError?.('Microphone access was denied. Please allow microphone permissions in your browser settings.');
            } else {
                onError?.('Could not access microphone. Please check your device settings.');
            }
        }
    }, [state, cleanup, transcribe, onError]);

    const stopRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state === 'recording') {
            recorder.stop();
        }
    }, []);

    const cancelRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder) {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            recorder.onerror = null;

            if (recorder.state === 'recording') {
                recorder.stop();
            }
        }

        cleanup();
        setState('idle');
    }, [cleanup]);

    return {
        state,
        startRecording,
        stopRecording,
        cancelRecording,
        durationSeconds,
    };
}
