'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dynamic from 'next/dynamic';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faExpand, faCompress, faCopy, faCheck, 
    faBook, faWandSparkles, faTimes, faChevronRight 
} from '@fortawesome/free-solid-svg-icons';

const MermaidBlock = dynamic(() => import('./MermaidBlock'), {
    ssr: false,
    loading: () => (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 text-center text-[#8b949e] text-xs my-2.5">
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
    en: { copy: 'Copy', copied: 'Copied!', fromManual: 'Official Reference', aiGenerated: 'AI Generated', expand: 'Expand' },
    bn: { copy: 'কপি', copied: 'হয়েছে!', fromManual: 'অফিসিয়াল রেফারেন্স', aiGenerated: 'AI তৈরি', expand: 'বড় করুন' },
    hi: { copy: 'कॉपी', copied: 'हो गया!', fromManual: 'आधिकारिक संदर्भ', aiGenerated: 'AI जनित', expand: 'विस्तार करें' },
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

    useEffect(() => {
        if (isExpanded) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
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
                            className="bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 sm:p-4 overflow-x-auto my-2.5 font-mono text-[13px] leading-relaxed text-[#e6edf3]"
                        >
                            {children}
                        </pre>
                    );
                },
                code({ children, className, ...rest }: React.HTMLAttributes<HTMLElement> & { className?: string }) {
                    const isBlock = !!(className && className.startsWith('language-'));
                    if (isBlock) {
                        return (
                            <code className="font-mono text-[13px] leading-relaxed color-[#e6edf3] whitespace-pre block">
                                {children}
                            </code>
                        );
                    }
                    return (
                        <code
                            className="font-mono text-xs bg-[#30363d] color-[#79c0ff] px-1.5 py-0.5 rounded border border-[#21262d]"
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
                    return <thead className="bg-[#161b22]">{children}</thead>;
                },
                th({ children }: React.ThHTMLAttributes<HTMLTableCellElement>) {
                    return (
                        <th className="p-2 sm:p-3 text-left text-[#8b949e] font-semibold text-[11px] tracking-wider uppercase border-b-2 border-[#30363d] whitespace-nowrap">
                            {children}
                        </th>
                    );
                },
                td({ children }: React.TdHTMLAttributes<HTMLTableCellElement>) {
                    return (
                        <td className="p-2 sm:p-3 text-[#e6edf3] border-b border-[#21262d] align-top">
                            {children}
                        </td>
                    );
                },
                tr({ children }: React.HTMLAttributes<HTMLTableRowElement>) {
                    return (
                        <tr className="hover:bg-[#161b22] transition-colors">
                            {children}
                        </tr>
                    );
                },
                h1({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                    return (
                        <h1 className="text-[#e6edf3] text-lg font-bold mb-3.5 pb-2 border-b border-[#21262d]">
                            {children}
                        </h1>
                    );
                },
                h2({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                    return (
                        <h2 className="text-[#58a6ff] text-base font-bold mt-4.5 mb-2.5 pb-1.5 border-b border-[#21262d]">
                            {children}
                        </h2>
                    );
                },
                h3({ children }: React.HTMLAttributes<HTMLHeadingElement>) {
                    return (
                        <h3 className="text-[#79c0ff] text-sm font-semibold mt-3.5 mb-2">
                            {children}
                        </h3>
                    );
                },
                p({ children }: React.HTMLAttributes<HTMLParagraphElement>) {
                    return (
                        <p className="text-[#c9d1d9] text-[13px] leading-relaxed my-2">
                            {children}
                        </p>
                    );
                },
                ul({ children }: React.HTMLAttributes<HTMLUListElement>) {
                    return (
                        <ul className="text-[#c9d1d9] text-[13px] pl-5 my-2 leading-relaxed list-disc">
                            {children}
                        </ul>
                    );
                },
                ol({ children }: React.OlHTMLAttributes<HTMLOListElement>) {
                    return (
                        <ol className="text-[#c9d1d9] text-[13px] pl-5 my-2 leading-relaxed list-decimal">
                            {children}
                        </ol>
                    );
                },
                li({ children }: React.LiHTMLAttributes<HTMLLIElement>) {
                    return <li className="my-1">{children}</li>;
                },
                strong({ children }: React.HTMLAttributes<HTMLElement>) {
                    return <strong className="text-[#e6edf3] font-semibold">{children}</strong>;
                },
                em({ children }: React.HTMLAttributes<HTMLElement>) {
                    return <em className="text-[#a5d6ff] italic">{children}</em>;
                },
                blockquote({ children }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) {
                    return (
                        <blockquote className="border-l-4 border-[#1f6feb] bg-[#1f6feb]/5 mt-3.5 p-3 rounded-r-lg">
                            <div className="text-[#8b949e] text-xs leading-relaxed">
                                {children}
                            </div>
                        </blockquote>
                    );
                },
                hr() {
                    return (
                        <hr className="border-none border-t border-[#21262d] my-4" />
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
                className="bg-[#0d1117] border border-[#21262d] rounded-xl mt-3 overflow-hidden font-sans w-full shadow-lg group/diagram"
                aria-label={`Diagram Card: ${title}`}
            >
                {/* ── Header ──────────────────────────────────────── */}
                <div className="flex items-center justify-between p-3 sm:p-4 bg-[#161b22] border-b border-[#21262d] flex-wrap gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-base flex-shrink-0">{icon}</span>
                        <h4 className="text-[#e6edf3] text-[13px] font-semibold truncate leading-tight">
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
                            onClick={() => setIsExpanded(true)}
                            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md bg-[#21262d] text-[#8b949e] hover:text-white hover:bg-[#30363d] border border-[#30363d] text-[11px] font-medium transition-all flex items-center gap-1.5"
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
                                    : 'bg-[#21262d] text-[#8b949e] border-[#30363d] hover:text-white hover:bg-[#30363d]'
                            }`}
                        >
                            <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="text-[10px]" />
                            <span className="hidden sm:inline">{copied ? lbl.copied : lbl.copy}</span>
                        </button>
                    </div>
                </div>

                {/* ── Body ────────────────────────────────────────── */}
                <div className="p-4 sm:p-6 overflow-x-auto scrollbar-thin scrollbar-thumb-[#30363d] scrollbar-track-transparent max-h-[500px] relative overflow-y-auto">
                    {renderMarkdown()}
                </div>
            </div>

            {/* ── Fullscreen Modal ─────────────────────────────── */}
            {isExpanded && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-[#010409]/95 backdrop-blur-sm" onClick={() => setIsExpanded(false)} />
                    
                    <div className="relative w-full max-w-6xl h-full max-h-[90vh] bg-[#0d1117] border border-[#30363d] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 sm:px-6 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">{icon}</span>
                                <div>
                                    <h3 className="text-[#e6edf3] text-sm sm:text-base font-bold leading-tight">
                                        {title}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold">
                                            {diagramType} Diagram
                                        </span>
                                        <FontAwesomeIcon icon={faChevronRight} className="text-[8px] text-[#30363d]" />
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${hasKBContext ? 'text-blue-400' : 'text-emerald-400'}`}>
                                            {hasKBContext ? lbl.fromManual : lbl.aiGenerated}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopy}
                                    className={`p-2 sm:px-4 sm:py-2 rounded-lg border text-xs font-semibold transition-all flex items-center gap-2 ${
                                        copied 
                                            ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' 
                                            : 'bg-[#21262d] text-[#e6edf3] border-[#30363d] hover:bg-[#30363d]'
                                    }`}
                                >
                                    <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                                    <span className="hidden sm:inline">{copied ? lbl.copied : lbl.copy}</span>
                                </button>
                                
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="p-2 sm:p-2.5 rounded-lg bg-[#21262d] text-[#8b949e] hover:text-white hover:bg-red-500/20 hover:border-red-500/30 border border-[#30363d] transition-all"
                                    title="Close"
                                >
                                    <FontAwesomeIcon icon={faTimes} className="text-base" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-auto p-6 sm:p-10 scrollbar-thin scrollbar-thumb-[#30363d] scrollbar-track-transparent">
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
