/**
 * src/components/MermaidBlock.tsx
 *
 * Renders Mermaid diagram code as an interactive SVG.
 * Used by DiagramCard when a ```mermaid code block is detected.
 *
 * Features:
 *  - Dark theme matching DiagramCard's #0d1117 background
 *  - Fallback to raw code if Mermaid parsing fails
 *  - Zoom in/out controls
 */

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface MermaidBlockProps {
    code: string;
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

    useEffect(() => {
        let cancelled = false;

        async function renderDiagram() {
            try {
                const mermaid = (await import('mermaid')).default;

                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'dark',
                    themeVariables: {
                        // Match DiagramCard dark palette
                        darkMode: true,
                        background: '#0d1117',
                        primaryColor: '#1f6feb',
                        primaryTextColor: '#e6edf3',
                        primaryBorderColor: '#30363d',
                        secondaryColor: '#161b22',
                        secondaryTextColor: '#8b949e',
                        tertiaryColor: '#21262d',
                        lineColor: '#58a6ff',
                        textColor: '#c9d1d9',
                        mainBkg: '#161b22',
                        nodeBorder: '#30363d',
                        clusterBkg: '#0d1117',
                        edgeLabelBackground: '#161b22',
                        fontFamily: "'Segoe UI', system-ui, sans-serif",
                    },
                    flowchart: {
                        htmlLabels: true,
                        curve: 'basis',
                        padding: 12,
                    },
                    sequence: {
                        mirrorActors: false,
                    },
                    securityLevel: 'loose',
                });

                const { svg } = await mermaid.render(idRef.current, code.trim());

                if (!cancelled) {
                    setSvgContent(svg);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to render diagram');
                    setSvgContent(null);
                }
            }
        }

        void renderDiagram();
        return () => { cancelled = true; };
    }, [code]);

    const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 3)), []);
    const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.5)), []);
    const handleZoomReset = useCallback(() => setZoom(1), []);

    // Error fallback — show raw code
    if (error) {
        return (
            <div style={{ margin: '10px 0' }}>
                <div style={{
                    background: '#1c1208',
                    border: '1px solid #5a3e00',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    color: '#d29922',
                    marginBottom: '8px',
                }}>
                    ⚠️ Diagram rendering failed: {error}
                </div>
                <pre style={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    overflowX: 'auto',
                }}>
                    <code style={{
                        fontFamily: "'Courier New', Consolas, monospace",
                        fontSize: '12px',
                        color: '#e6edf3',
                        whiteSpace: 'pre',
                        display: 'block',
                    }}>
                        {code}
                    </code>
                </pre>
            </div>
        );
    }

    // Loading state
    if (!svgContent) {
        return (
            <div style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
                padding: '30px',
                textAlign: 'center',
                margin: '10px 0',
            }}>
                <div style={{
                    color: '#8b949e',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                }}>
                    <span className="animate-spin" style={{
                        display: 'inline-block',
                        width: '14px',
                        height: '14px',
                        border: '2px solid #30363d',
                        borderTopColor: '#58a6ff',
                        borderRadius: '50%',
                    }} />
                    Rendering diagram…
                </div>
            </div>
        );
    }

    // Success — rendered SVG
    return (
        <div style={{ margin: '10px 0' }}>
            {/* Zoom controls */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '6px',
                justifyContent: 'flex-end',
            }}>
                <button onClick={handleZoomOut} title="Zoom out" style={zoomBtnStyle}>−</button>
                <button onClick={handleZoomReset} title="Reset zoom" style={{
                    ...zoomBtnStyle,
                    width: 'auto',
                    padding: '2px 8px',
                    fontSize: '10px',
                }}>
                    {Math.round(zoom * 100)}%
                </button>
                <button onClick={handleZoomIn} title="Zoom in" style={zoomBtnStyle}>+</button>
            </div>

            {/* SVG container */}
            <div
                ref={containerRef}
                style={{
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '16px',
                    overflowX: 'auto',
                    overflowY: 'auto',
                    maxHeight: '600px',
                }}
            >
                <div
                    style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top left',
                        transition: 'transform 0.2s ease',
                    }}
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                />
            </div>
        </div>
    );
}

const zoomBtnStyle: React.CSSProperties = {
    background: '#21262d',
    color: '#8b949e',
    border: '1px solid #30363d',
    borderRadius: '4px',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
};
