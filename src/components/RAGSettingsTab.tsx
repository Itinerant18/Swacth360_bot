'use client';

import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSliders, faBrain, faMagnifyingGlass, faSave, faRotate, faTriangleExclamation, faArrowsRotate } from '@fortawesome/free-solid-svg-icons';
import {
    DEFAULT_RAG_SETTINGS,
    type RAGSettings,
} from '@/lib/rag-settings';
import { adminFetch } from '@/lib/adminFetch';

export default function RAGSettingsTab() {
    const [settings, setSettings] = useState<RAGSettings>(DEFAULT_RAG_SETTINGS);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await adminFetch('/api/admin/rag-settings');
            if (!res.ok) throw new Error('Failed to load settings');
            const data: RAGSettings = await res.json();
            setSettings(data);

        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            const res = await adminFetch('/api/admin/rag-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save settings');
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        setSettings(DEFAULT_RAG_SETTINGS);
        setSaving(true);
        setError('');
        try {
            const res = await adminFetch('/api/admin/rag-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(DEFAULT_RAG_SETTINGS),
            });
            if (!res.ok) throw new Error('Failed to reset settings');

        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#CA8A04] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-[#D97706] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-up">
            {/* Header */}
            <div className="skeuo-card p-4 sm:p-5 border-[#0D9488]/30">
                <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/20 flex items-center justify-center flex-shrink-0">
                        <FontAwesomeIcon icon={faBrain} className="w-4 h-4 text-[#0D9488]" />
                    </div>
                    <div>
                        <h2 className="text-sm sm:text-base font-semibold text-[#1C1917]">Enhanced RAG Settings</h2>
                        <p className="text-xs sm:text-sm text-[#78716C] mt-1">
                            Configure the retrieval-augmented generation pipeline for better answers.
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
                            onClick={() => void fetchSettings()}
                            disabled={loading}
                            className="skeuo-raised px-3 py-1.5 text-xs text-[#44403C] disabled:opacity-50"
                            title="Retry loading settings"
                            aria-label="Retry loading settings"
                        >
                            <span className="flex items-center gap-1.5">
                                <FontAwesomeIcon icon={faArrowsRotate} className="w-3 h-3" />
                                Retry
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {/* Search Features */}
            <div className="skeuo-card p-4 sm:p-5">
                <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <FontAwesomeIcon icon={faMagnifyingGlass} className="w-3 h-3 text-[#0D9488]" />
                    Search Features
                </h3>

                <div className="space-y-4">
                    {/* Hybrid Search */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-[#1C1917]">Hybrid Search</p>
                            <p className="text-xs text-[#78716C]">Combine vector + BM25 for better recall</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.useHybridSearch}
                                onChange={(e) => setSettings({ ...settings, useHybridSearch: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-[#D6CFC4] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0D9488]"></div>
                        </label>
                    </div>

                    {/* Reranker */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-[#1C1917]">BGE Reranker</p>
                            <p className="text-xs text-[#78716C]">Cross-encoder for relevance scoring</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.useReranker}
                                onChange={(e) => setSettings({ ...settings, useReranker: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-[#D6CFC4] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0D9488]"></div>
                        </label>
                    </div>

                    {/* Query Expansion */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-[#1C1917]">Query Expansion</p>
                            <p className="text-xs text-[#78716C]">LLM-generated alternative phrasings</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.useQueryExpansion}
                                onChange={(e) => setSettings({ ...settings, useQueryExpansion: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-[#D6CFC4] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0D9488]"></div>
                        </label>
                    </div>

                    {/* Graph Boost */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-[#1C1917]">Knowledge Graph Boost</p>
                            <p className="text-xs text-[#78716C]">Boost results based on entity relationships</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.useGraphBoost}
                                onChange={(e) => setSettings({ ...settings, useGraphBoost: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-[#D6CFC4] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0D9488]"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Parameters */}
            <div className="skeuo-card p-4 sm:p-5">
                <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <FontAwesomeIcon icon={faSliders} className="w-3 h-3 text-[#0D9488]" />
                    Retrieval Parameters
                </h3>

                <div className="space-y-5">
                    {/* Top K */}
                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-medium text-[#1C1917]">Top K Results</label>
                            <span className="text-sm text-[#0D9488] font-semibold">{settings.topK}</span>
                        </div>
                        <input
                            type="range"
                            min="5"
                            max="20"
                            value={settings.topK}
                            onChange={(e) => setSettings({ ...settings, topK: parseInt(e.target.value) })}
                            className="w-full h-2 bg-[#D6CFC4] rounded-lg appearance-none cursor-pointer accent-[#0D9488]"
                        />
                        <div className="flex justify-between text-[10px] text-[#A8A29E] mt-1">
                            <span>5</span>
                            <span>20</span>
                        </div>
                    </div>

                    {/* Alpha (vector/BM25 balance) */}
                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-medium text-[#1C1917]">Vector/BM25 Balance</label>
                            <span className="text-sm text-[#0D9488] font-semibold">{settings.alpha}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={settings.alpha}
                            onChange={(e) => setSettings({ ...settings, alpha: parseFloat(e.target.value) })}
                            className="w-full h-2 bg-[#D6CFC4] rounded-lg appearance-none cursor-pointer accent-[#0D9488]"
                        />
                        <div className="flex justify-between text-[10px] text-[#A8A29E] mt-1">
                            <span>BM25 only</span>
                            <span>Vector only</span>
                        </div>
                    </div>

                    {/* MMR Lambda */}
                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-medium text-[#1C1917]">MMR Diversity (λ)</label>
                            <span className="text-sm text-[#0D9488] font-semibold">{settings.mmrLambda}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={settings.mmrLambda}
                            onChange={(e) => setSettings({ ...settings, mmrLambda: parseFloat(e.target.value) })}
                            className="w-full h-2 bg-[#D6CFC4] rounded-lg appearance-none cursor-pointer accent-[#0D9488]"
                        />
                        <div className="flex justify-between text-[10px] text-[#A8A29E] mt-1">
                            <span>Max relevance</span>
                            <span>Max diversity</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="skeuo-brass flex-1 py-3 text-sm flex items-center justify-center gap-2"
                >
                    {saving ? (
                        <FontAwesomeIcon icon={faRotate} className="w-4 h-4 animate-spin" />
                    ) : (
                        <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                    )}
                    {saved ? 'Saved!' : 'Save Settings'}
                </button>
                <button
                    onClick={handleReset}
                    disabled={saving}
                    className="skeuo-raised py-3 px-4 text-sm text-[#44403C]"
                >
                    Reset
                </button>
            </div>

            {/* Info */}
            <div className="p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-xs text-blue-800">
                    <strong>Tip:</strong> Settings are saved to the server and shared across all users.
                    Higher Top K = more candidates. Lower λ = more diverse results.
                    Graph Boost requires migration 013 to be applied.
                </p>
            </div>
        </div>
    );
}
