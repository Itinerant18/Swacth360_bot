'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faExpand, faCompress, faDownload, faRotateLeft,
    faCircleInfo, faChevronDown, faChevronUp,
    faMagnifyingGlassPlus, faMagnifyingGlassMinus,
} from '@fortawesome/free-solid-svg-icons';

// ─── SVG Sanitization ─────────────────────────────────────────
// Strips dangerous content from Gemini-generated SVGs before rendering.
function sanitizeSvg(raw: string): string {
    return raw
        // Remove <script>...</script> blocks (case-insensitive, multiline)
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        // Remove on* event handler attributes (onclick, onload, onerror, etc.)
        .replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]*)/gi, '')
        // Remove javascript: href/xlink:href values
        .replace(/(href|xlink:href)\s*=\s*["']javascript:[^"']*["']/gi, '')
        // Remove <iframe>, <object>, <embed>, <form> elements
        .replace(/<(iframe|object|embed|form)[\s\S]*?(?:<\/\1>|\/>)/gi, '')
        // Remove data: URI schemes that could execute code
        .replace(/(href|src|xlink:href)\s*=\s*["']data:(?!image\/)[^"']*["']/gi, '');
}

interface DiagramCardProps {
    svg: string;
    diagramType: string;
    panelType: string;
    description: string;
    components: string[];
    notes: string[];
    hasKBContext: boolean;
    language?: 'en' | 'bn' | 'hi';
}

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    wiring: { label: 'Wiring Diagram', icon: '🔌', color: '#4488FF' },
    power: { label: 'Power Diagram', icon: '⚡', color: '#FFCC00' },
    network: { label: 'Network Topology', icon: '🌐', color: '#44BB88' },
    panel: { label: 'Panel Layout', icon: '📋', color: '#FF8844' },
    block: { label: 'Block Diagram', icon: '🔷', color: '#AA44FF' },
    connector: { label: 'Connector Pinout', icon: '🔗', color: '#FF4488' },
    led: { label: 'LED Indicators', icon: '💡', color: '#FFEE44' },
};

const NOTES_LABEL: Record<string, string> = {
    en: 'Notes & Warnings',
    bn: 'নোট ও সতর্কতা',
    hi: 'नोट्स और चेतावनी',
};

const COMPONENTS_LABEL: Record<string, string> = {
    en: 'Components',
    bn: 'উপাদানসমূহ',
    hi: 'घटक',
};

const DOWNLOAD_LABEL: Record<string, string> = {
    en: 'Download SVG',
    bn: 'SVG ডাউনলোড',
    hi: 'SVG डाउनलोड करें',
};

export default function DiagramCard({
    svg,
    diagramType,
    panelType,
    description,
    components,
    notes,
    hasKBContext,
    language = 'en',
}: DiagramCardProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
    const svgContainerRef = useRef<HTMLDivElement>(null);
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile viewport for responsive height
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Pre-sanitize SVG once to reuse in viewer + download
    const safeSvg = sanitizeSvg(svg);

    const typeInfo = TYPE_LABELS[diagramType] || TYPE_LABELS.wiring;

    // ── Zoom ─────────────────────────────────────────────────
    const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 3));
    const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
    const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    // ── Pan ──────────────────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (zoom <= 1) return;
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }, [zoom, pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging || !dragStart.current) return;
        setPan({
            x: dragStart.current.panX + (e.clientX - dragStart.current.x),
            y: dragStart.current.panY + (e.clientY - dragStart.current.y),
        });
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        dragStart.current = null;
    }, []);

    // ── Scroll to zoom ────────────────────────────────────────
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setZoom(z => Math.min(Math.max(z - e.deltaY * 0.001, 0.5), 3));
    }, []);

    // ── Download SVG (sanitized) ──────────────────────────────
    const handleDownload = () => {
        const blob = new Blob([safeSvg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${panelType.replace(/\s+/g, '-')}-${diagramType}-diagram.svg`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const DiagramViewer = ({ height = '320px' }: { height?: string }) => (
        <div
            ref={svgContainerRef}
            className="relative overflow-hidden rounded-xl"
            style={{
                height,
                background: '#0f0f1a',
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                userSelect: 'none',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        >
            {/* Diagram SVG */}
            <div
                style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    transformOrigin: 'top left',
                    transition: isDragging ? 'none' : 'transform 0.15s ease',
                    width: '100%',
                    height: '100%',
                }}
                dangerouslySetInnerHTML={{ __html: safeSvg }}
            />

            {/* Zoom hint */}
            {zoom === 1 && (
                <div className="absolute bottom-2 right-2 text-[10px] text-white/40 font-mono pointer-events-none">
                    scroll to zoom · drag to pan
                </div>
            )}

            {/* Zoom level badge */}
            {zoom !== 1 && (
                <div className="absolute top-2 right-2 text-[10px] text-white/60 font-mono bg-black/40 px-1.5 py-0.5 rounded pointer-events-none">
                    {Math.round(zoom * 100)}%
                </div>
            )}
        </div>
    );

    return (
        <>
            {/* ── Main Card ── */}
            <div className="skeuo-card overflow-hidden mt-2 border border-[#D6CFC4]/60">
                {/* Header bar */}
                <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ background: 'linear-gradient(135deg, #0f0f1a, #1a1a3e)' }}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-base">{typeInfo.icon}</span>
                        <div>
                            <span
                                className="text-xs font-bold font-mono tracking-widest uppercase"
                                style={{ color: typeInfo.color }}
                            >
                                {typeInfo.label}
                            </span>
                            <p className="text-[10px] text-white/50 font-mono mt-0.5 truncate max-w-[200px]">
                                {panelType}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {/* KB badge */}
                        {hasKBContext && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">
                                KB
                            </span>
                        )}

                        {/* Zoom controls */}
                        <button
                            onClick={handleZoomOut}
                            className="w-6 h-6 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title="Zoom out"
                        >
                            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-3 h-3" />
                        </button>
                        <button
                            onClick={handleZoomIn}
                            className="w-6 h-6 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title="Zoom in"
                        >
                            <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-3 h-3" />
                        </button>
                        <button
                            onClick={handleReset}
                            className="w-6 h-6 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title="Reset view"
                        >
                            <FontAwesomeIcon icon={faRotateLeft} className="w-3 h-3" />
                        </button>

                        {/* Fullscreen */}
                        <button
                            onClick={() => setIsFullscreen(true)}
                            className="w-6 h-6 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title="Fullscreen"
                        >
                            <FontAwesomeIcon icon={faExpand} className="w-3 h-3" />
                        </button>

                        {/* Download */}
                        <button
                            onClick={handleDownload}
                            className="w-6 h-6 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title={DOWNLOAD_LABEL[language]}
                        >
                            <FontAwesomeIcon icon={faDownload} className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* SVG Viewer */}
                <DiagramViewer height={isMobile ? '220px' : '300px'} />

                {/* Description */}
                {description && (
                    <div className="px-4 py-3 border-t border-[#D6CFC4]/40">
                        <p className="text-xs text-[#44403C] leading-relaxed">{description}</p>
                    </div>
                )}

                {/* Components strip */}
                {components.length > 0 && (
                    <div className="px-4 pb-2 flex flex-wrap gap-1.5 border-t border-[#D6CFC4]/30 pt-2.5">
                        <span className="text-[10px] text-[#78716C] font-semibold uppercase tracking-wider self-center">
                            {COMPONENTS_LABEL[language]}:
                        </span>
                        {components.slice(0, 8).map((comp, i) => (
                            <span
                                key={i}
                                className="text-[10px] px-2 py-0.5 rounded font-mono"
                                style={{
                                    background: 'rgba(68,136,255,0.1)',
                                    color: '#4488FF',
                                    border: '1px solid rgba(68,136,255,0.25)',
                                }}
                            >
                                {comp}
                            </span>
                        ))}
                    </div>
                )}

                {/* Notes accordion */}
                {notes.length > 0 && (
                    <div className="border-t border-[#D6CFC4]/40">
                        <button
                            onClick={() => setShowNotes(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-[#78716C] hover:text-[#44403C] hover:bg-[#F0EBE3]/50 transition-colors"
                        >
                            <span className="flex items-center gap-1.5 font-semibold">
                                <FontAwesomeIcon icon={faCircleInfo} className="w-3 h-3 text-amber-600" />
                                {NOTES_LABEL[language]} ({notes.length})
                            </span>
                            <FontAwesomeIcon icon={showNotes ? faChevronUp : faChevronDown} className="w-3 h-3" />
                        </button>
                        {showNotes && (
                            <ul className="px-4 pb-3 space-y-1.5">
                                {notes.map((note, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-[#44403C]">
                                        <span className="text-amber-600 mt-0.5 flex-shrink-0">⚠</span>
                                        {note}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {/* ── Fullscreen Modal ── */}
            {isFullscreen && (
                <div
                    className="fixed inset-0 z-50 flex flex-col"
                    style={{ background: '#0a0a14' }}
                >
                    {/* Modal header */}
                    <div
                        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
                        style={{ background: '#1a1a3e', borderBottom: '1px solid #2a2a5e' }}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">{typeInfo.icon}</span>
                            <div>
                                <span className="text-sm font-bold font-mono tracking-wider" style={{ color: typeInfo.color }}>
                                    {typeInfo.label}
                                </span>
                                <p className="text-xs text-white/50 font-mono">{panelType}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Zoom controls in fullscreen */}
                            <button onClick={handleZoomOut} className="px-2 py-1 text-xs font-mono text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors">−</button>
                            <span className="text-xs font-mono text-white/60 w-12 text-center">{Math.round(zoom * 100)}%</span>
                            <button onClick={handleZoomIn} className="px-2 py-1 text-xs font-mono text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors">+</button>
                            <button onClick={handleReset} className="px-2 py-1 text-xs font-mono text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors ml-1">Reset</button>
                            <button onClick={handleDownload} className="px-3 py-1.5 text-xs font-mono bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 rounded border border-blue-700/50 transition-colors ml-2">
                                <FontAwesomeIcon icon={faDownload} className="w-3 h-3 mr-1.5" />
                                SVG
                            </button>
                            <button
                                onClick={() => { setIsFullscreen(false); handleReset(); }}
                                className="px-3 py-1.5 text-xs font-mono bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded border border-white/10 transition-colors ml-1"
                            >
                                <FontAwesomeIcon icon={faCompress} className="w-3 h-3 mr-1.5" />
                                Close
                            </button>
                        </div>
                    </div>

                    {/* Fullscreen diagram viewer */}
                    <div className="flex-1 overflow-hidden">
                        <DiagramViewer height="100%" />
                    </div>

                    {/* Notes bar at bottom */}
                    {notes.length > 0 && (
                        <div
                            className="px-5 py-2.5 flex-shrink-0 flex items-center gap-4 overflow-x-auto"
                            style={{ background: '#1a1a3e', borderTop: '1px solid #2a2a5e' }}
                        >
                            {notes.map((note, i) => (
                                <span key={i} className="text-xs text-amber-400/80 font-mono whitespace-nowrap flex items-center gap-1.5">
                                    <span className="text-amber-500">⚠</span> {note}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}