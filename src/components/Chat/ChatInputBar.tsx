'use client';

import { type KeyboardEvent, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faPaperPlane, faSpinner, faStop } from '@fortawesome/free-solid-svg-icons';

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
};

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
                    className="skeuo-input w-full p-3 sm:p-4 pl-4 sm:pl-5 pr-12 sm:pr-14 text-sm sm:text-[15px]"
                    value={input}
                    placeholder={placeholder}
                    onChange={onInputChange}
                    onKeyDown={onKeyDown}
                    disabled={isLoading || isLoadingHistory}
                    autoComplete="off"
                />
                <button type="submit" disabled={isLoading || isLoadingHistory || !input.trim()} className="absolute right-1.5 sm:right-2 p-2 sm:p-2.5 skeuo-brass rounded-lg sm:rounded-xl disabled:opacity-30">
                    {isLoading || isLoadingHistory
                        ? <FontAwesomeIcon icon={faSpinner} className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                        : <FontAwesomeIcon icon={faPaperPlane} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    }
                </button>
            </form>
            <div className="flex items-center justify-between mt-2">
                <p className="text-[10px] sm:text-[11px] text-[#A8A29E]">
                    {footerText} <span className="hidden sm:inline">Â· Ctrl+Enter to send</span>
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
