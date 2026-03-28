'use client';

import { useEffect, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faStar,
    faThumbsUp,
    faThumbsDown,
    faClock,
    faChartBar,
    faFilter,
    faArrowsRotate,
    faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { adminFetch } from '@/lib/adminFetch';

type FeedbackItem = {
    id: string;
    query_text: string;
    result_id: string;
    rating: number;
    is_relevant: boolean;
    feedback_text?: string;
    created_at: string;
};

export default function FeedbackTab() {
    const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<'all' | 'positive' | 'negative'>('all');

    const fetchFeedback = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const res = await adminFetch('/api/admin/feedback?limit=50');
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to load retrieval feedback');
            }

            setFeedback(data.feedback || []);
        } catch (err: unknown) {
            setFeedback([]);
            setError((err as Error).message || 'Failed to load retrieval feedback');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchFeedback();
    }, [fetchFeedback]);

    const filteredFeedback = feedback.filter((item) => {
        const rating = item.rating ?? 0;
        if (filter === 'positive') return item.is_relevant === true && rating >= 4;
        if (filter === 'negative') return item.is_relevant === false || rating <= 2;
        return true;
    });

    const ratedItems = feedback.filter((item) => typeof item.rating === 'number' && item.rating > 0);
    const avgRating = ratedItems.length > 0
        ? (ratedItems.reduce((sum, item) => sum + item.rating, 0) / ratedItems.length).toFixed(1)
        : '-';

    const positiveCount = feedback.filter((item) => item.is_relevant === true || (item.rating ?? 0) >= 4).length;
    const negativeCount = feedback.filter((item) => item.is_relevant === false || ((item.rating ?? 0) > 0 && (item.rating ?? 0) <= 2)).length;

    return (
        <div aria-label="Retrieval Feedback Dashboard" className="space-y-4 animate-fade-up">
            <div className="skeuo-card p-4 sm:p-5 border-[#0D9488]/30">
                <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/20 flex items-center justify-center flex-shrink-0">
                        <FontAwesomeIcon icon={faStar} className="w-4 h-4 text-[#0D9488]" />
                    </div>
                    <div>
                        <h2 className="text-sm sm:text-base font-semibold text-[#1C1917]">Retrieval Feedback</h2>
                        <p className="text-xs sm:text-sm text-[#78716C] mt-1">
                            View user ratings and feedback on retrieval quality to improve the RAG system.
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="skeuo-card p-4 sm:p-5 border-red-200 bg-red-50/40">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="w-4 h-4 text-red-600 mt-0.5" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                        <button
                            onClick={() => void fetchFeedback()}
                            disabled={loading}
                            className="skeuo-raised px-3 py-1.5 text-xs text-[#44403C] disabled:opacity-50"
                        >
                            <span className="flex items-center gap-1.5">
                                <FontAwesomeIcon icon={faArrowsRotate} className="w-3 h-3" />
                                Retry
                            </span>
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="skeuo-card p-3 sm:p-4 text-center">
                    <FontAwesomeIcon icon={faChartBar} className="w-5 h-5 text-[#0D9488] mb-1" />
                    <p className="text-xl font-bold text-[#1C1917]">{feedback.length}</p>
                    <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Total</p>
                </div>
                <div className="skeuo-card p-3 sm:p-4 text-center border-emerald-200">
                    <FontAwesomeIcon icon={faStar} className="w-5 h-5 text-emerald-600 mb-1" />
                    <p className="text-xl font-bold text-emerald-700">{avgRating}</p>
                    <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Avg Rating</p>
                </div>
                <div className="skeuo-card p-3 sm:p-4 text-center border-emerald-200">
                    <FontAwesomeIcon icon={faThumbsUp} className="w-5 h-5 text-emerald-600 mb-1" />
                    <p className="text-xl font-bold text-emerald-700">{positiveCount}</p>
                    <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Positive</p>
                </div>
                <div className="skeuo-card p-3 sm:p-4 text-center border-red-200">
                    <FontAwesomeIcon icon={faThumbsDown} className="w-5 h-5 text-red-500 mb-1" />
                    <p className="text-xl font-bold text-red-600">{negativeCount}</p>
                    <p className="text-[10px] text-[#78716C] uppercase tracking-wider">Negative</p>
                </div>
            </div>

            <div className="skeuo-card p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                    <FontAwesomeIcon icon={faFilter} className="w-3 h-3 text-[#78716C]" />
                    <span className="text-xs text-[#78716C] uppercase tracking-wider font-medium">Filter</span>
                </div>
                <div className="flex gap-2">
                    {(['all', 'positive', 'negative'] as const).map((item) => (
                        <button
                            key={item}
                            onClick={() => setFilter(item)}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${filter === item
                                ? 'bg-[#0D9488] text-white'
                                : 'bg-[#F0EBE3] text-[#78716C] hover:bg-[#E5E0D6]'
                                }`}
                        >
                            {item.charAt(0).toUpperCase() + item.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="skeuo-card p-4 sm:p-5">
                <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-4">
                    Recent Feedback ({filteredFeedback.length})
                </h3>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[#CA8A04] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#D97706] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                ) : filteredFeedback.length === 0 ? (
                    <div className="text-center py-8">
                        <FontAwesomeIcon icon={faStar} className="w-8 h-8 text-[#A8A29E] mb-2" />
                        <p className="text-sm text-[#78716C]">
                            {filter === 'all'
                                ? 'No feedback yet. Users can rate retrieval results.'
                                : `No ${filter} feedback found.`}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {filteredFeedback.map((item) => (
                            <div
                                key={item.id}
                                className="p-3 rounded-lg bg-[#FAF7F2] border border-[#D6CFC4]"
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <p className="text-sm text-[#1C1917] font-medium flex-1 truncate">
                                        {item.query_text}
                                    </p>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <FontAwesomeIcon
                                                key={star}
                                                icon={faStar}
                                                className={`w-3 h-3 ${star <= (item.rating || 0)
                                                    ? 'text-yellow-500'
                                                    : 'text-[#D6CFC4]'
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        {item.is_relevant ? (
                                            <span className="flex items-center gap-1 text-emerald-600">
                                                <FontAwesomeIcon icon={faThumbsUp} className="w-3 h-3" />
                                                Relevant
                                            </span>
                                        ) : item.is_relevant === false ? (
                                            <span className="flex items-center gap-1 text-red-600">
                                                <FontAwesomeIcon icon={faThumbsDown} className="w-3 h-3" />
                                                Not Relevant
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-1 text-[#A8A29E]">
                                        <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
                                        {new Date(item.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                {item.feedback_text && (
                                    <p className="text-xs text-[#78716C] mt-2 italic">
                                        &quot;{item.feedback_text}&quot;
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-xs text-blue-800">
                    <strong>Tip:</strong> Users can rate retrieval results after receiving answers.
                    This feedback helps boost high-rated results and improve the knowledge graph.
                    Requires migration 013 for full functionality.
                </p>
            </div>
        </div>
    );
}
