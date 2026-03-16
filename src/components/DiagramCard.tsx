/**
 * src/components/DiagramCard.tsx
 *
 * Renders text-based diagrams (markdown + ASCII art) in the chat.
 * No SVG, no Gemini — pure markdown via react-markdown + remark-gfm.
 *
 * The diagram looks like a GitHub markdown file rendered in dark mode.
 * ASCII art in code blocks, color tables, step-by-step instructions.
 */

'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dynamic from 'next/dynamic';

const MermaidBlock = dynamic(() => import('./MermaidBlock'), { ssr: false });

interface DiagramCardProps {
    markdown: string;
    title: string;
    diagramType: string;
    panelType: string;
    hasKBContext: boolean;
    language?: 'en' | 'bn' | 'hi';
}

const LABELS = {
    en: { copy: 'Copy Markdown', copied: 'Copied!', fromManual: 'From Manual', aiGenerated: 'AI Generated' },
    bn: { copy: 'কপি করুন', copied: 'হয়েছে!', fromManual: 'ম্যানুয়াল থেকে', aiGenerated: 'AI তৈরি' },
    hi: { copy: 'कॉपी करें', copied: 'हो गया!', fromManual: 'मैनुअल से', aiGenerated: 'AI जनित' },
};

const TYPE_ICONS: Record<string, string> = {
    wiring: '🔌', power: '⚡', network: '🌐',
    panel: '📋', block: '🔷', connector: '🔗', led: '💡',
};

export default function DiagramCard({
    markdown, title, diagramType, hasKBContext, language = 'en',
}: DiagramCardProps) {
    const [copied, setCopied] = useState(false);
    const lbl = LABELS[language] || LABELS.en;
    const icon = TYPE_ICONS[diagramType] || '📐';

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(markdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { }
    };

    return (
        <div aria-label={`Diagram Card: ${title}`} style={{
            background: '#0d1117',
            border: '1px solid #21262d',
            borderRadius: '10px',
            marginTop: '10px',
            overflow: 'hidden',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            maxWidth: '100%',
        }}>
            {/* ── Header ──────────────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: '#161b22',
                borderBottom: '1px solid #21262d',
                flexWrap: 'wrap', gap: '8px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px' }}>{icon}</span>
                    <span style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 600 }}>
                        {title}
                    </span>
                    <span style={{
                        background: hasKBContext ? '#1f6feb22' : '#30363d',
                        color: hasKBContext ? '#58a6ff' : '#8b949e',
                        border: `1px solid ${hasKBContext ? '#1f6feb' : '#30363d'}`,
                        borderRadius: '12px', padding: '1px 8px',
                        fontSize: '10px', fontWeight: 600,
                    }}>
                        {hasKBContext ? `📚 ${lbl.fromManual}` : `✨ ${lbl.aiGenerated}`}
                    </span>
                </div>

                <button
                    onClick={handleCopy}
                    style={{
                        background: copied ? '#238636' : '#21262d',
                        color: copied ? '#ffffff' : '#8b949e',
                        border: '1px solid #30363d',
                        borderRadius: '6px', padding: '4px 12px',
                        fontSize: '11px', cursor: 'pointer',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {copied ? `✓ ${lbl.copied}` : `📋 ${lbl.copy}`}
                </button>
            </div>

            {/* ── Markdown body ────────────────────────────────── */}
            <div style={{ padding: '18px 20px', overflowX: 'auto' }}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{

                        // ── Code blocks: Mermaid → SVG, others → ASCII art ──
                        pre({ children }: React.HTMLAttributes<HTMLPreElement>) {
                            // Check if the child is a <code> with mermaid class
                            const child = React.Children.toArray(children)[0];
                            if (
                                React.isValidElement(child) &&
                                typeof child.props === 'object' &&
                                child.props !== null &&
                                'className' in child.props
                            ) {
                                const className = String((child.props as { className?: string }).className || '');
                                if (className.includes('language-mermaid')) {
                                    const mermaidCode = String(
                                        (child.props as { children?: React.ReactNode }).children || ''
                                    ).trim();
                                    return <MermaidBlock code={mermaidCode} />;
                                }
                            }
                            return (
                                <pre style={{
                                    background: '#161b22',
                                    border: '1px solid #30363d',
                                    borderRadius: '8px',
                                    padding: '14px 16px',
                                    overflowX: 'auto',
                                    margin: '10px 0',
                                }}>
                                    {children}
                                </pre>
                            );
                        },
                        code({ children }: React.HTMLAttributes<HTMLElement>) {
                            return (
                                <code style={{
                                    fontFamily: "'Courier New', Consolas, 'Lucida Console', monospace",
                                    fontSize: '13px',
                                    lineHeight: '1.65',
                                    color: '#e6edf3',
                                    whiteSpace: 'pre',
                                    display: 'block',
                                }}>
                                    {String(children).replace(/\n$/, '')}
                                </code>
                            );
                        },

                        // ── Tables ──
                        table({ children }: React.TableHTMLAttributes<HTMLTableElement>) {
                            return (
                                <div style={{ overflowX: 'auto', margin: '12px 0' }}>
                                    <table style={{
                                        borderCollapse: 'collapse',
                                        width: '100%',
                                        fontSize: '12px',
                                        lineHeight: '1.5',
                                    }}>
                                        {children}
                                    </table>
                                </div>
                            );
                        },
                        thead({ children }: React.HTMLAttributes<HTMLTableSectionElement>) {
                            return <thead style={{ background: '#161b22' }}>{children}</thead>;
                        },
                        th({ children }: React.ThHTMLAttributes<HTMLTableCellElement>) {
                            return (
                                <th style={{
                                    padding: '7px 12px',
                                    textAlign: 'left',
                                    color: '#8b949e',
                                    fontWeight: 600,
                                    fontSize: '11px',
                                    letterSpacing: '0.4px',
                                    textTransform: 'uppercase',
                                    borderBottom: '2px solid #30363d',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {children}
                                </th>
                            );
                        },
                        td({ children }: React.TdHTMLAttributes<HTMLTableCellElement>) {
                            return (
                                <td style={{
                                    padding: '7px 12px',
                                    color: '#e6edf3',
                                    borderBottom: '1px solid #21262d',
                                    verticalAlign: 'top',
                                }}>
                                    {children}
                                </td>
                            );
                        },
                        tr({ children }: React.HTMLAttributes<HTMLTableRowElement>) {
                            return (
                                <tr
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#161b22'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                    {children}
                                </tr>
                            );
                        },

                        // â”€â”€ Headings â”€â”€
                        h1({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                            return (
                                <h1 style={{
                                    color: '#e6edf3', fontSize: '17px', fontWeight: 700,
                                    margin: '0 0 14px', paddingBottom: '8px',
                                    borderBottom: '1px solid #21262d',
                                }}>
                                    {children}
                                </h1>
                            );
                        },
                        h2({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                            return (
                                <h2 style={{
                                    color: '#58a6ff', fontSize: '15px', fontWeight: 700,
                                    margin: '18px 0 10px', paddingBottom: '6px',
                                    borderBottom: '1px solid #21262d',
                                }}>
                                    {children}
                                </h2>
                            );
                        },
                        h3({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                            return (
                                <h3 style={{
                                    color: '#79c0ff', fontSize: '13px', fontWeight: 600,
                                    margin: '14px 0 7px',
                                }}>
                                    {children}
                                </h3>
                            );
                        },

                        // â”€â”€ Paragraph â”€â”€
                        p({ children }: React.HTMLAttributes<HTMLParagraphElement>) {
                            return (
                                <p style={{
                                    color: '#c9d1d9', fontSize: '13px',
                                    lineHeight: '1.65', margin: '7px 0',
                                }}>
                                    {children}
                                </p>
                            );
                        },

                        // â”€â”€ Lists â”€â”€
                        ul({ children }: React.HTMLAttributes<HTMLUListElement>) {
                            return (
                                <ul style={{
                                    color: '#c9d1d9', fontSize: '13px',
                                    paddingLeft: '22px', margin: '8px 0', lineHeight: '1.7',
                                }}>
                                    {children}
                                </ul>
                            );
                        },
                        ol({ children }: React.OlHTMLAttributes<HTMLOListElement>) {
                            return (
                                <ol style={{
                                    color: '#c9d1d9', fontSize: '13px',
                                    paddingLeft: '22px', margin: '8px 0', lineHeight: '1.7',
                                }}>
                                    {children}
                                </ol>
                            );
                        },
                        li({ children }: React.LiHTMLAttributes<HTMLLIElement>) {
                            return <li style={{ margin: '4px 0' }}>{children}</li>;
                        },

                        // â”€â”€ Bold / Italic â”€â”€
                        strong({ children }: React.HTMLAttributes<HTMLElement>) {
                            return <strong style={{ color: '#e6edf3', fontWeight: 600 }}>{children}</strong>;
                        },
                        em({ children }: React.HTMLAttributes<HTMLElement>) {
                            return <em style={{ color: '#a5d6ff' }}>{children}</em>;
                        },

                        // â”€â”€ Blockquote = source/note attribution â”€â”€
                        blockquote({ children }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) {
                            return (
                                <blockquote style={{
                                    borderLeft: '3px solid #1f6feb',
                                    background: '#1f6feb0d',
                                    margin: '14px 0 0', padding: '8px 14px',
                                    borderRadius: '0 6px 6px 0',
                                }}>
                                    <div style={{ color: '#8b949e', fontSize: '12px', lineHeight: '1.6' }}>
                                        {children}
                                    </div>
                                </blockquote>
                            );
                        },

                        // ── HR ──
                        hr() {
                            return (
                                <hr style={{
                                    border: 'none',
                                    borderTop: '1px solid #21262d',
                                    margin: '16px 0',
                                }} />
                            );
                        },
                    }}
                >
                    {markdown}
                </ReactMarkdown>
            </div>
        </div>
    );
}