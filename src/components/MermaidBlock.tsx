/**
 * src/components/MermaidBlock.tsx
 *
 * Renders Mermaid diagram code as an interactive SVG.
 * Compatible with mermaid v10+ (new async render API).
 *
 * Key fixes vs previous version:
 *  - Initialize mermaid ONCE globally (not per-render)
 *  - Remove workerSrc = '' which breaks v10+
 *  - Use truly unique IDs to avoid DOM conflicts
 *  - Clean up stale mermaid-generated elements between renders
 *  - Parse before render to get clean error messages
 */

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface MermaidBlockProps {
    code: string;
}

// ── Global init guard (initialize once across all instances) ──
let _mermaidInitialized = false;

async function getMermaid() {
    const mermaid = (await import('mermaid')).default;

    if (!_mermaidInitialized) {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            themeVariables: {
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
                fontSize: '14px',
            },
            flowchart: {
                htmlLabels: true,
                curve: 'basis',
                padding: 15,
            },
            sequence: {
                mirrorActors: false,
                useMaxWidth: true,
            },
            securityLevel: 'loose',
        });
        _mermaidInitialized = true;
    }

    return mermaid;
}

// ── Clean up any stale mermaid-generated elements ─────────────
function cleanupMermaidElement(id: string) {
    if (typeof document === 'undefined') return;
    // Mermaid v10 creates a hidden element in the body during render
    const stale = document.getElementById(id);
    if (stale) stale.remove();
}

// ── Fix common mermaid syntax issues from LLM-generated code ──
function fixMermaidSyntax(code: string): string {
    let fixed = code;

    // Fix 1: Strip backticks inside edge labels — `-->|`text`|` → `-->|"text"|`
    // LLMs often wrap edge label text in backticks which breaks the mermaid parser.
    fixed = fixed.replace(/(\|)`([^`|]+)`(\|)/g, '$1"$2"$3');

    // Fix 2: Strip backticks inside node labels — `["` text with `code` inside `"]`
    // Replace backticks within square-bracket labels with single quotes
    fixed = fixed.replace(/\[("[^"]*")\]/g, (match) => {
        return match.replace(/`([^`]*)`/g, "'$1'");
    });

    // Fix 3: `class T1 T2 terminator;` → `class T1,T2 terminator;`
    // Mermaid v10+ requires comma-separated node IDs in class statements.
    fixed = fixed.replace(/^(\s*class\s+)([\w]+(?:\s+[\w]+){2,})(;?\s*)$/gm, (_match, prefix, body, suffix) => {
        const parts = body.trim().split(/\s+/);
        const className = parts.pop(); // last word is the class name
        return `${prefix}${parts.join(',')} ${className}${suffix}`;
    });

    // Fix 4: duplicate node definitions in different subgraphs
    // Mermaid doesn't allow redefining a node — remove duplicate labels
    const definedNodes = new Set<string>();
    fixed = fixed.replace(/^(\s*)(\w+)\["([^"]+)"\]/gm, (match, indent, nodeId, _label) => {
        if (definedNodes.has(nodeId)) {
            return `${indent}${nodeId}`;
        }
        definedNodes.add(nodeId);
        return match;
    });

    // Fix 5: remove trailing semicolons after classDef (not needed, sometimes causes issues)
    fixed = fixed.replace(/^(\s*classDef\s+.+[^;])$/gm, '$1;');

    // Fix 6: Strip standalone backticks in edge labels that aren't paired
    // e.g., -->|`18 AWG Red`| where the backtick is part of text
    fixed = fixed.replace(/\|([^|]*)`([^|]*)\|/g, (match, before, after) => {
        // If there's still a backtick, remove all backticks from the label
        const label = (before + after).replace(/`/g, '');
        return `|${label}|`;
    });

    return fixed;
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);

    // Generate a stable, unique ID for this instance
    // Use a ref so it doesn't change on re-render
    const idRef = useRef(
        `mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    );

    useEffect(() => {
        let cancelled = false;
        const currentId = idRef.current;

        async function renderDiagram() {
            try {
                const mermaid = await getMermaid();

                // Clean up any previous render's DOM artifact for this ID
                cleanupMermaidElement(currentId);

                // Auto-fix common LLM-generated mermaid syntax issues
                const fixedCode = fixMermaidSyntax(code.trim());

                // 1. Parse first — gives cleaner error messages than render()
                try {
                    await mermaid.parse(fixedCode);
                } catch (parseErr) {
                    if (!cancelled) {
                        setError(
                            parseErr instanceof Error
                                ? `Syntax error: ${parseErr.message}`
                                : 'Mermaid syntax error'
                        );
                        setSvgContent(null);
                    }
                    return;
                }

                // 2. Render to SVG
                const { svg } = await mermaid.render(currentId, fixedCode);

                if (!cancelled) {
                    setSvgContent(svg);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error ? err.message : 'Failed to render diagram'
                    );
                    setSvgContent(null);
                }
            }
        }

        void renderDiagram();

        return () => {
            cancelled = true;
            cleanupMermaidElement(currentId);
        };
    }, [code]);

    const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 3)), []);
    const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.5)), []);
    const handleZoomReset = useCallback(() => setZoom(1), []);

    // ── Error fallback — show raw code ──────────────────────────
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
                    ⚠️ {error}
                </div>
                <pre style={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    overflowX: 'auto',
                    margin: 0,
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

    // ── Loading state ──────────────────────────────────────────
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
                    <span style={{
                        display: 'inline-block',
                        width: '14px',
                        height: '14px',
                        border: '2px solid #30363d',
                        borderTopColor: '#58a6ff',
                        borderRadius: '50%',
                        animation: 'mermaid-spin 0.7s linear infinite',
                    }} />
                    Rendering diagram…
                </div>
                <style>{`@keyframes mermaid-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // ── Success — rendered SVG ─────────────────────────────────
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
                <button
                    onClick={handleZoomReset}
                    title="Reset zoom"
                    style={{ ...zoomBtnStyle, width: 'auto', padding: '2px 8px', fontSize: '10px' }}
                >
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
                        display: 'inline-block',
                        minWidth: '100%',
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