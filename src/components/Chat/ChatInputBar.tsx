'use client';

import { type KeyboardEvent, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faMicrophone, faPaperPlane, faSpinner, faStop } from '@fortawesome/free-solid-svg-icons';
import type { RecordingState } from '@/hooks/useAudioRecorder';

type ChatInputBarProps = {
    isAuthenticated: boolean;
    showGuestGate: boolean;
    onSignIn: () => void;
    input: string;
    inputRef: RefObject<HTMLInputElement | null>;
    onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
    placeholder: string;
    footerText: string;
    isLoading: boolean;
    isLoadingHistory: boolean;
    guestQuestionsLeft: number;
    onStop?: () => void;
    isStreaming?: boolean;
    recordingState: RecordingState;
    recordingDuration: number;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onCancelRecording: () => void;
};

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function ChatInputBar({
    isAuthenticated,
    showGuestGate,
    onSignIn,
    input,
    inputRef,
    onInputChange,
    onKeyDown,
    onSubmit,
    placeholder,
    footerText,
    isLoading,
    isLoadingHistory,
    guestQuestionsLeft,
    onStop,
    isStreaming,
    recordingState,
    recordingDuration,
    onStartRecording,
    onStopRecording,
    onCancelRecording,
}: ChatInputBarProps) {
    if (showGuestGate && !isAuthenticated) {
        return (
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
                <button onClick={onSignIn} className="skeuo-brass px-5 py-2 text-sm font-semibold rounded-xl">
                    Sign In to Continue
                </button>
            </div>
        );
    }

    const isRecording = recordingState === 'recording';
    const isTranscribing = recordingState === 'transcribing';
    const isDisabled = isLoading || isLoadingHistory || isTranscribing;

    // --- Recording Active UI ---
    if (isRecording) {
        return (
            <>
                <div className="relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl border-2 border-red-400/60 bg-red-50/80 shadow-[0_0_20px_rgba(239,68,68,0.15)] animate-fade-up">
                    {/* Pulsing red dot */}
                    <div className="relative flex-shrink-0">
                        <span className="absolute inline-flex w-3 h-3 rounded-full bg-red-500 opacity-75 animate-ping" />
                        <span className="relative inline-flex w-3 h-3 rounded-full bg-red-500" />
                    </div>

                    <span className="text-sm font-medium text-red-700 flex-1">
                        Listening... <span className="font-mono text-red-500">{formatDuration(recordingDuration)}</span>
                    </span>

                    <button
                        type="button"
                        onClick={onCancelRecording}
                        className="px-3 py-1.5 text-xs font-medium text-[#78716C] hover:text-red-600 rounded-lg border border-[#D6CFC4] bg-white hover:bg-red-50 hover:border-red-200 transition-all duration-200"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={onStopRecording}
                        className="skeuo-brass px-4 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                    >
                        <FontAwesomeIcon icon={faStop} className="w-3 h-3" />
                        Done
                    </button>
                </div>

                <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] sm:text-[11px] text-[#A8A29E]">
                        Tap &quot;Done&quot; when you&apos;re finished speaking
                    </p>
                </div>
            </>
        );
    }

    // --- Transcribing State UI ---
    if (isTranscribing) {
        return (
            <>
                <div className="relative flex items-center justify-center gap-2 p-3 sm:p-4 rounded-2xl border border-[#D6CFC4] bg-[#FAF7F2]">
                    <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 text-[#CA8A04] animate-spin" />
                    <span className="text-sm font-medium text-[#78716C]">Transcribing your voice...</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] sm:text-[11px] text-[#A8A29E]">
                        This usually takes a few seconds
                    </p>
                </div>
            </>
        );
    }

    // --- Default: Normal Input UI ---
    return (
        <>
            {isStreaming && onStop && (
                <button
                    onClick={onStop}
                    className="w-full flex items-center justify-center gap-2 py-2 mb-2 text-xs font-semibold text-[#78716C] hover:text-red-600 rounded-xl border border-[#D6CFC4] bg-[#FAF7F2] hover:bg-red-50 hover:border-red-200 transition-all duration-200"
                    type="button"
                >
                    <FontAwesomeIcon icon={faStop} className="w-3 h-3" />
                    Stop generating
                </button>
            )}
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit(event);
                }}
                className="relative flex items-center"
            >
                <label htmlFor="chat-input" className="sr-only">Ask a question</label>
                <input
                    ref={inputRef}
                    id="chat-input"
                    className="skeuo-input w-full p-3 sm:p-4 pl-4 sm:pl-5 pr-24 sm:pr-28 text-sm sm:text-[15px]"
                    value={input}
                    placeholder={placeholder}
                    onChange={onInputChange}
                    onKeyDown={onKeyDown}
                    disabled={isDisabled}
                    autoComplete="off"
                />
                <div className="absolute right-1.5 sm:right-2 flex items-center gap-1">
                    {/* Microphone button */}
                    <button
                        type="button"
                        onClick={onStartRecording}
                        disabled={isDisabled}
                        className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl text-[#78716C] hover:text-[#CA8A04] hover:bg-[#CA8A04]/10 disabled:opacity-30 transition-all duration-200"
                        title="Voice input"
                        aria-label="Start voice recording"
                    >
                        <FontAwesomeIcon icon={faMicrophone} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>

                    {/* Send button */}
                    <button
                        type="submit"
                        disabled={isDisabled || !input.trim()}
                        className="p-2 sm:p-2.5 skeuo-brass rounded-lg sm:rounded-xl disabled:opacity-30"
                    >
                        {isLoading || isLoadingHistory
                            ? <FontAwesomeIcon icon={faSpinner} className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                            : <FontAwesomeIcon icon={faPaperPlane} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        }
                    </button>
                </div>
            </form>
            <div className="flex items-center justify-between mt-2">
                <p className="text-[10px] sm:text-[11px] text-[#A8A29E]">
                    {footerText} <span className="hidden sm:inline">· Ctrl+Enter to send</span>
                </p>
                {!isAuthenticated && (
                    <span className="text-[10px] text-[#A8A29E]">
                        {guestQuestionsLeft} free {guestQuestionsLeft === 1 ? 'question' : 'questions'} left
                    </span>
                )}
            </div>
        </>
    );
}
