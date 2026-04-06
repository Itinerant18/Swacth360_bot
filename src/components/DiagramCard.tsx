'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dynamic from 'next/dynamic';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faExpand, faCopy, faCheck, 
    faBook, faWandSparkles, faTimes, faChevronRight, faDownload
} from '@fortawesome/free-solid-svg-icons';

const MermaidBlock = dynamic(() => import('./MermaidBlock'), {
    ssr: false,
    loading: () => (
        <div className="bg-[#F0EBE3] border border-[#D6CFC4] rounded-lg p-5 text-center text-[#78716C] text-xs my-2.5">
            Loading diagram renderer…
        </div>
    ),
});

interface DiagramCardProps {
    markdown: string;
    title: string;
    diagramType: string;
    panelType: string;
    hasKBContext: boolean;
    language?: 'en' | 'bn' | 'hi';
}

const LABELS = {
    en: { copy: 'Copy', copied: 'Copied!', fromManual: 'Official Reference', aiGenerated: 'AI Generated', expand: 'Expand', download: 'Download' },
    bn: { copy: 'কপি', copied: 'হয়েছে!', fromManual: 'অফিসিয়াল রেফারেন্স', aiGenerated: 'AI তৈরি', expand: 'বড় করুন', download: 'ডাউনলোড' },
    hi: { copy: 'कॉपी', copied: 'हो गया!', fromManual: 'आधिकारिक संदर्भ', aiGenerated: 'AI जनित', expand: 'विस्तার करें', download: 'डाउनलोड' },
};

const TYPE_ICONS: Record<string, string> = {
    wiring: '🔌', power: '⚡', network: '🌐',
    panel: '📋', block: '🔷', connector: '🔗', led: '💡',
    alarm: '🚨', sensor: '📡', battery: '🔋',
};

function extractText(children: React.ReactNode): string {
    if (typeof children === 'string') return children;
    if (typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(extractText).join('');
    if (React.isValidElement(children)) {
        const props = children.props as { children?: React.ReactNode };
        return extractText(props.children);
    }
    return '';
}

export default function DiagramCard({
    markdown, title, diagramType, hasKBContext, language = 'en',
}: DiagramCardProps) {
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const lbl = LABELS[language as keyof typeof LABELS] || LABELS.en;
    const icon = TYPE_ICONS[diagramType] || '📐';
    const diagramRef = useRef<HTMLDivElement>(null);

    const handleDownload = useCallback(() => {
        const container = diagramRef.current;
        if (!container) return;

        const svgElement = container.querySelector('svg');
        if (!svgElement) return;

        const svgData = new XMLSerializer().serializeToString(svgElement);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_diagram.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [title]);

    useEffect(() => {
        if (isExpanded) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isExpanded]);

    useEffect(() => {
        if (!isExpanded) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsExpanded(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isExpanded]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(markdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* noop */ }
    };

    const renderMarkdown = () => (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                pre({ children, ...rest }: React.HTMLAttributes<HTMLPreElement>) {
                    const childArray = React.Children.toArray(children);
                    const codeChild = childArray[0];

                    if (React.isValidElement(codeChild)) {
                        const codeProps = codeChild.props as {
                            className?: string;
                            children?: React.ReactNode;
                        };
                        const className = codeProps.className ?? '';

                        if (className.includes('language-mermaid')) {
                            const mermaidCode = extractText(codeProps.children).trim();
                            if (mermaidCode) {
                                return <MermaidBlock code={mermaidCode} />;
                            }
                        }
                    }

                    return (
                        <pre
                            {...rest}
                            className="bg-[#F0EBE3] border border-[#D6CFC4] rounded-lg p-3.5 sm:p-4 overflow-x-auto my-2.5 font-mono text-[13px] leading-relaxed text-[#1C1917]"
                        >
                            {children}
                        </pre>
                    );
                },
                code({ children, className, ...rest }: React.HTMLAttributes<HTMLElement> & { className?: string }) {
                    const isBlock = !!(className && className.startsWith('language-'));
                    if (isBlock) {
                        return (
                            <code className="font-mono text-[13px] leading-relaxed text-[#1C1917] whitespace-pre block">
                                {children}
                            </code>
                        );
                    }
                    return (
                        <code
                            className="font-mono text-xs bg-[#E8E0D4] text-[#0D9488] px-1.5 py-0.5 rounded border border-[#D6CFC4]"
                            {...rest}
                        >
                            {children}
                        </code>
                    );
                },
                table({ children }: React.TableHTMLAttributes<HTMLTableElement>) {
                    return (
                        <div className="overflow-x-auto my-3">
                            <table className="border-collapse w-full text-xs leading-relaxed">
                                {children}
                            </table>
                        </div>
                    );
                },
                thead({ children }: React.HTMLAttributes<HTMLTableSectionElement>) {
                    return <thead className="bg-[#F0EBE3]">{children}</thead>;
                },
                th({ children }: React.ThHTMLAttributes<HTMLTableCellElement>) {
                    return (
                        <th className="p-2 sm:p-3 text-left text-[#78716C] font-semibold text-[11px] tracking-wider uppercase border-b-2 border-[#D6CFC4] whitespace-nowrap">
                            {children}
                        </th>
                    );
                },
                td({ children }: React.TdHTMLAttributes<HTMLTableCellElement>) {
                    return (
                        <td className="p-2 sm:p-3 text-[#1C1917] border-b border-[#D6CFC4] align-top">
                            {children}
                        </td>
                    );
                },
                tr({ children }: React.HTMLAttributes<HTMLTableRowElement>) {
                    return (
                        <tr className="hover:bg-[#F0EBE3] transition-colors">
                            {children}
                        </tr>
                    );
                },
                h1({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                    return (
                        <h1 className="text-[#1C1917] text-lg font-bold mb-3.5 pb-2 border-b border-[#D6CFC4]">
                            {children}
                        </h1>
                    );
                },
                h2({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                    return (
                        <h2 className="text-[#0D9488] text-base font-bold mt-4.5 mb-2.5 pb-1.5 border-b border-[#D6CFC4]">
                            {children}
                        </h2>
                    );
                },
                h3({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                    return (
                        <h3 className="text-[#0D9488] text-sm font-semibold mt-3.5 mb-2">
                            {children}
                        </h3>
                    );
                },
                p({ children }: React.HTMLAttributes<HTMLParagraphElement>) {
                    return (
                        <p className="text-[#44403C] text-[13px] leading-relaxed my-2">
                            {children}
                        </p>
                    );
                },
                ul({ children }: React.HTMLAttributes<HTMLUListElement>) {
                    return (
                        <ul className="text-[#44403C] text-[13px] pl-5 my-2 leading-relaxed list-disc">
                            {children}
                        </ul>
                    );
                },
                ol({ children }: React.OlHTMLAttributes<HTMLOListElement>) {
                    return (
                        <ol className="text-[#44403C] text-[13px] pl-5 my-2 leading-relaxed list-decimal">
                            {children}
                        </ol>
                    );
                },
                li({ children }: React.LiHTMLAttributes<HTMLLIElement>) {
                    return <li className="my-1">{children}</li>;
                },
                strong({ children }: React.HTMLAttributes<HTMLElement>) {
                    return <strong className="text-[#1C1917] font-semibold">{children}</strong>;
                },
                em({ children }: React.HTMLAttributes<HTMLElement>) {
                    return <em className="text-[#0D9488] italic">{children}</em>;
                },
                a({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
                    return (
                        <a
                            href={href ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#0D9488] hover:text-[#0A7A6E] underline decoration-[#0D9488]/30 hover:decoration-[#0D9488] transition-colors"
                        >
                            {children}
                        </a>
                    );
                },
                blockquote({ children }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) {
                    return (
                        <blockquote className="border-l-4 border-[#0D9488] bg-[#0D9488]/5 mt-3.5 p-3 rounded-r-lg">
                            <div className="text-[#78716C] text-xs leading-relaxed">
                                {children}
                            </div>
                        </blockquote>
                    );
                },
                hr() {
                    return (
                        <hr className="border-none border-t border-[#D6CFC4] my-4" />
                    );
                },
            }}
        >
            {markdown}
        </ReactMarkdown>
    );

    return (
        <>
            <div
                className="bg-[#FAF7F2] border border-[#D6CFC4] rounded-xl mt-3 overflow-hidden font-sans w-full shadow-lg group/diagram"
                aria-label={`Diagram Card: ${title}`}
            >
                {/* ── Header ──────────────────────────────────────── */}
                <div className="flex items-center justify-between p-3 sm:p-4 bg-[#F0EBE3] border-b border-[#D6CFC4] flex-wrap gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-base flex-shrink-0">{icon}</span>
                        <h4 className="text-[#1C1917] text-[13px] font-semibold truncate leading-tight">
                            {title}
                        </h4>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            hasKBContext 
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                            <FontAwesomeIcon icon={hasKBContext ? faBook : faWandSparkles} className="text-[8px]" />
                            {hasKBContext ? lbl.fromManual : lbl.aiGenerated}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
                        <button
                            onClick={handleDownload}
                            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md bg-[#E8E0D4] text-[#78716C] hover:text-[#1C1917] hover:bg-[#D6CFC4] border border-[#D6CFC4] text-[11px] font-medium transition-all flex items-center gap-1.5"
                            title={lbl.download}
                        >
                            <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
                            <span className="hidden sm:inline">{lbl.download}</span>
                        </button>

                        <button
                            onClick={() => setIsExpanded(true)}
                            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md bg-[#E8E0D4] text-[#78716C] hover:text-[#1C1917] hover:bg-[#D6CFC4] border border-[#D6CFC4] text-[11px] font-medium transition-all flex items-center gap-1.5"
                            title={lbl.expand}
                        >
                            <FontAwesomeIcon icon={faExpand} className="text-[10px]" />
                            <span className="hidden sm:inline">{lbl.expand}</span>
                        </button>
                        
                        <button
                            onClick={handleCopy}
                            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-md border text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                                copied 
                                    ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' 
                                    : 'bg-[#E8E0D4] text-[#78716C] border-[#D6CFC4] hover:text-[#1C1917] hover:bg-[#D6CFC4]'
                            }`}
                        >
                            <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="text-[10px]" />
                            <span className="hidden sm:inline">{copied ? lbl.copied : lbl.copy}</span>
                        </button>
                    </div>
                </div>

                {/* ── Body ────────────────────────────────────────── */}
                <div ref={diagramRef} className="p-4 sm:p-6 overflow-x-auto scrollbar-thin scrollbar-thumb-[#D6CFC4] scrollbar-track-transparent max-h-[500px] relative overflow-y-auto">
                    {renderMarkdown()}
                </div>
            </div>

            {/* ── Fullscreen Modal ─────────────────────────────── */}
            {isExpanded && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsExpanded(false)} />
                    
                    <div className="relative w-full max-w-6xl h-full max-h-[90vh] bg-[#FAF7F2] border border-[#D6CFC4] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 sm:px-6 bg-[#F0EBE3] border-b border-[#D6CFC4] flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">{icon}</span>
                                <div>
                                    <h3 className="text-[#1C1917] text-sm sm:text-base font-bold leading-tight">
                                        {title}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-[#78716C] uppercase tracking-wider font-semibold">
                                            {diagramType} Diagram
                                        </span>
                                        <FontAwesomeIcon icon={faChevronRight} className="text-[8px] text-[#D6CFC4]" />
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${hasKBContext ? 'text-blue-400' : 'text-emerald-400'}`}>
                                            {hasKBContext ? lbl.fromManual : lbl.aiGenerated}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDownload}
                                    className="p-2 sm:px-4 sm:py-2 rounded-lg bg-[#E8E0D4] text-[#1C1917] border border-[#D6CFC4] hover:bg-[#D6CFC4] text-xs font-semibold flex items-center gap-2"
                                    title={lbl.download}
                                >
                                    <FontAwesomeIcon icon={faDownload} />
                                    <span className="hidden sm:inline">{lbl.download}</span>
                                </button>
                                
                                <button
                                    onClick={handleCopy}
                                    className={`p-2 sm:px-4 sm:py-2 rounded-lg border text-xs font-semibold transition-all flex items-center gap-2 ${
                                        copied 
                                            ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' 
                                            : 'bg-[#E8E0D4] text-[#1C1917] border-[#D6CFC4] hover:bg-[#D6CFC4]'
                                    }`}
                                >
                                    <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                                    <span className="hidden sm:inline">{copied ? lbl.copied : lbl.copy}</span>
                                </button>
                                
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="p-2 sm:p-2.5 rounded-lg bg-[#E8E0D4] text-[#78716C] hover:text-[#1C1917] hover:bg-red-500/20 hover:border-red-500/30 border border-[#D6CFC4] transition-all"
                                    title="Close"
                                >
                                    <FontAwesomeIcon icon={faTimes} className="text-base" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-auto p-6 sm:p-10 scrollbar-thin scrollbar-thumb-[#D6CFC4] scrollbar-track-transparent">
                            <div className="max-w-4xl mx-auto">
                                {renderMarkdown()}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
