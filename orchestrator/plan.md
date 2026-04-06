# Chat UI Polish — 6 Fixes Execution Prompt

**Created:** 2026-04-06
**Author:** Claude Code (Opus 4.6)
**Status:** READY FOR CODEX/GEMINI EXECUTION
**Prerequisite:** The surgical refactoring (Phase 0-3) is COMPLETE. All files referenced below are post-refactoring paths.

---

## CONTEXT

After the SSE/streaming implementation and UI refactoring, a validation pass identified 5 FAIL and 1 PARTIAL item. This plan fixes all 6. Each fix is isolated — they can be done in any order but must each pass `npx tsc --noEmit` individually.

**Current chat palette (MUST match):**
- Background: `#E8E0D4` (warm beige)
- Card surface: `#FAF7F2` (cream)
- Card border: `#D6CFC4`
- Hover surface: `#F0EBE3`
- Primary text: `#1C1917`
- Muted text: `#78716C` / `#A8A29E`
- Accent teal: `#0D9488`
- Accent gold: `#CA8A04`

---

## FIX 1 — Stop Generation Button (HIGH PRIORITY)

**Problem:** The `stop()` function exists in `useChatStream.ts` (line 68) and is returned from the hook (line 278), but there is NO visible button in the UI to trigger it during streaming.

**Goal:** Add a "Stop generating" button that appears during streaming, positioned between the streaming message and the input bar.

### Step 1.1 — Add `onStop` prop to `ChatInputBar`

**File:** `src/components/Chat/ChatInputBar.tsx`

1. Add a new import at the top:
```typescript
import { faStop } from '@fortawesome/free-solid-svg-icons';
```

2. Add these props to the `ChatInputBarProps` type:
```typescript
onStop?: () => void;
isStreaming?: boolean;
```

3. Add `onStop` and `isStreaming` to the destructured props in the component function signature.

4. Add a Stop button ABOVE the `<form>` element (inside the fragment `<>`, before the form). This button should only render when `isStreaming` is true:

```tsx
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
```

### Step 1.2 — Pass `stop` from page.tsx to ChatInputBar

**File:** `src/app/page.tsx`

Find the `<ChatInputBar` usage (around line 881). Add two new props:

```tsx
<ChatInputBar
    // ... existing props ...
    onStop={stop}
    isStreaming={isLoading && !!streamingMessageId}
/>
```

The `stop` function is already available in `page.tsx` from the `useChatStream` hook destructuring. Find where `useChatStream` is destructured and confirm `stop` is included. If not, add it:

```typescript
const { sendMessage, stop, isLoading, streamingMessageId, streamingDisplay, messages, setMessages } = useChatStream({...});
```

---

## FIX 2 — Link Styling in ReactMarkdown (HIGH PRIORITY)

**Problem:** No `a:` renderer in the ReactMarkdown `components` config. Links render with default browser styling (blue, underlined) which clashes with the warm beige chat palette.

**Goal:** Style links with the teal accent color, underline on hover, and open in new tab.

### Step 2.1 — Add `a` renderer to assistant message ReactMarkdown

**File:** `src/components/Chat/MessageBubble.tsx`

Find the `<ReactMarkdown>` component inside the assistant message block (around line 239). The `components` object has entries for `p`, `ul`, `ol`, `li`, `strong`, `table`, `thead`, `th`, `td`, `code`. Add an `a` entry:

```typescript
a: ({ href, children, ...rest }: MarkdownElementProps<'a'> & { href?: string }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#0D9488] hover:text-[#0A7A6E] underline decoration-[#0D9488]/30 hover:decoration-[#0D9488] transition-colors"
        {...stripMarkdownNode(rest)}
    >
        {children}
    </a>
),
```

Place this AFTER the `strong:` entry and BEFORE the `table:` entry for readability.

### Step 2.2 — Also add `a` renderer to DiagramCard ReactMarkdown

**File:** `src/components/DiagramCard.tsx`

Find the `renderMarkdown()` function (line 79). Inside the `<ReactMarkdown>` `components` prop, add an `a` renderer after the `em` entry (around line 212):

```typescript
a({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return (
        <a
            href={href ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#58a6ff] hover:text-[#79c0ff] underline decoration-[#58a6ff]/30 hover:decoration-[#58a6ff] transition-colors"
        >
            {children}
        </a>
    );
},
```

Note: DiagramCard uses the dark palette (`#58a6ff` blue) since we're converting it to light in Fix 4. If you do Fix 4 BEFORE Fix 2, use the light palette color (`#0D9488` teal) instead.

---

## FIX 3 — Diagram Light Theme (HIGH PRIORITY)

**Problem:** `DiagramCard.tsx` and `MermaidBlock.tsx` use dark GitHub palette (`#0d1117`, `#161b22`, `#30363d`, `#e6edf3`). This clashes with the warm beige chat UI.

**Goal:** Restyle both components to match the chat palette.

### Step 3.1 — Update MermaidBlock.tsx Mermaid Config

**File:** `src/components/MermaidBlock.tsx`

Replace the entire `mermaid.initialize({...})` block (lines 30-61) with:

```typescript
mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
        darkMode: false,
        background: '#FAF7F2',
        primaryColor: '#0D9488',
        primaryTextColor: '#1C1917',
        primaryBorderColor: '#D6CFC4',
        secondaryColor: '#F0EBE3',
        secondaryTextColor: '#78716C',
        tertiaryColor: '#E8E0D4',
        lineColor: '#0D9488',
        textColor: '#1C1917',
        mainBkg: '#FAF7F2',
        nodeBorder: '#D6CFC4',
        clusterBkg: '#F0EBE3',
        edgeLabelBackground: '#FAF7F2',
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
```

### Step 3.2 — Update MermaidBlock.tsx Inline Styles

**File:** `src/components/MermaidBlock.tsx`

**Error fallback** (lines 194-224): Replace dark colors:
- `background: '#1c1208'` → `background: '#FEF3C7'` (warm yellow)
- `border: '1px solid #5a3e00'` → `border: '1px solid #D97706'`
- `color: '#d29922'` → `color: '#92400E'`
- `background: '#161b22'` → `background: '#FAF7F2'`
- `border: '1px solid #30363d'` → `border: '1px solid #D6CFC4'`
- `color: '#e6edf3'` → `color: '#1C1917'`

**Loading state** (lines 228-260): Replace dark colors:
- `background: '#161b22'` → `background: '#FAF7F2'`
- `border: '1px solid #30363d'` → `border: '1px solid #D6CFC4'`
- `color: '#8b949e'` → `color: '#78716C'`
- `border: '2px solid #30363d'` → `border: '2px solid #D6CFC4'`
- `borderTopColor: '#58a6ff'` → `borderTopColor: '#0D9488'`

**SVG container** (lines 285-296): Replace dark colors:
- `background: '#0d1117'` → `background: '#FAF7F2'`
- `border: '1px solid #30363d'` → `border: '1px solid #D6CFC4'`

**Zoom buttons** (`zoomBtnStyle` at lines 312-325): Replace:
- `background: '#21262d'` → `background: '#F0EBE3'`
- `color: '#8b949e'` → `color: '#78716C'`
- `border: '1px solid #30363d'` → `border: '1px solid #D6CFC4'`

### Step 3.3 — Update DiagramCard.tsx Dark Classes

**File:** `src/components/DiagramCard.tsx`

This is a systematic find-and-replace of dark Tailwind classes. Apply these replacements throughout the ENTIRE file:

**Background colors:**
| Old | New |
|-----|-----|
| `bg-[#0d1117]` | `bg-[#FAF7F2]` |
| `bg-[#161b22]` | `bg-[#F0EBE3]` |
| `bg-[#21262d]` | `bg-[#E8E0D4]` |
| `bg-[#010409]/95` | `bg-black/50` |

**Border colors:**
| Old | New |
|-----|-----|
| `border-[#21262d]` | `border-[#D6CFC4]` |
| `border-[#30363d]` | `border-[#D6CFC4]` |

**Text colors:**
| Old | New |
|-----|-----|
| `text-[#e6edf3]` | `text-[#1C1917]` |
| `text-[#c9d1d9]` | `text-[#44403C]` |
| `text-[#8b949e]` | `text-[#78716C]` |
| `color-[#e6edf3]` | `text-[#1C1917]` |
| `color-[#79c0ff]` | `text-[#0D9488]` |

**Hover states:**
| Old | New |
|-----|-----|
| `hover:bg-[#30363d]` | `hover:bg-[#D6CFC4]` |
| `hover:bg-[#161b22]` | `hover:bg-[#F0EBE3]` |
| `hover:text-white` | `hover:text-[#1C1917]` |

**Accent colors remain as-is:** `text-blue-400`, `text-emerald-400`, `bg-blue-500/10`, `bg-emerald-500/10`, `border-blue-500/20`, `border-emerald-500/20` — these are already semantic and work on both light and dark.

**Special cases:**
- `hover:bg-red-500/20` → keep as-is (close button hover)
- `hover:border-red-500/30` → keep as-is
- `backdrop-blur-sm` → keep as-is (fullscreen overlay)

**Also update the `MermaidBlock` loading fallback** inside DiagramCard (line 16):
```tsx
loading: () => (
    <div className="bg-[#F0EBE3] border border-[#D6CFC4] rounded-lg p-5 text-center text-[#78716C] text-xs my-2.5">
        Loading diagram renderer…
    </div>
),
```

---

## FIX 4 — Fullscreen ESC Key Handler (MEDIUM PRIORITY)

**Problem:** DiagramCard fullscreen modal has no ESC key handler. Users expect pressing Escape to close the modal.

**Goal:** Add keyboard event listener for Escape key.

### Step 4.1 — Add ESC key `useEffect`

**File:** `src/components/DiagramCard.tsx`

Add a new `useEffect` AFTER the existing body overflow `useEffect` (after line 69):

```typescript
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
```

---

## FIX 5 — SVG/PNG Diagram Export (MEDIUM PRIORITY)

**Problem:** No download button for diagrams. Users can only copy the raw markdown text.

**Goal:** Add a "Download" button that exports the rendered diagram as SVG (with PNG fallback).

### Step 5.1 — Add download handler to DiagramCard

**File:** `src/components/DiagramCard.tsx`

1. Add import at top:
```typescript
import { faDownload } from '@fortawesome/free-solid-svg-icons';
```

Update the existing icon import to include `faDownload`:
```typescript
import { 
    faExpand, faCompress, faCopy, faCheck, 
    faBook, faWandSparkles, faTimes, faChevronRight, faDownload
} from '@fortawesome/free-solid-svg-icons';
```

2. Add `LABELS` entries for the download button. Update each language object:
```typescript
const LABELS = {
    en: { copy: 'Copy', copied: 'Copied!', fromManual: 'Official Reference', aiGenerated: 'AI Generated', expand: 'Expand', download: 'Download' },
    bn: { copy: 'কপি', copied: 'হয়েছে!', fromManual: 'অফিসিয়াল রেফারেন্স', aiGenerated: 'AI তৈরি', expand: 'বড় করুন', download: 'ডাউনলোড' },
    hi: { copy: 'कॉपी', copied: 'हो गया!', fromManual: 'आधिकारिक संदर्भ', aiGenerated: 'AI जनित', expand: 'विस्तार करें', download: 'डाउनलोड' },
};
```

3. Add a `containerRef` and download handler inside the component function (after `const icon = ...`):

```typescript
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
```

Also add `useRef` and `useCallback` to the React import:
```typescript
import React, { useState, useEffect, useRef, useCallback } from 'react';
```

4. Add `ref={diagramRef}` to the diagram body container. Find the `{/* ── Body ── */}` div (around line 281):

```tsx
<div ref={diagramRef} className="p-4 sm:p-6 overflow-x-auto ...">
```

5. Add a Download button in the header button group (between the Expand and Copy buttons):

```tsx
<button
    onClick={handleDownload}
    className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md bg-[#E8E0D4] text-[#78716C] hover:text-[#1C1917] hover:bg-[#D6CFC4] border border-[#D6CFC4] text-[11px] font-medium transition-all flex items-center gap-1.5"
    title={lbl.download}
>
    <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
    <span className="hidden sm:inline">{lbl.download}</span>
</button>
```

6. Also add the Download button in the fullscreen modal header (between the Copy and Close buttons in the modal):

```tsx
<button
    onClick={handleDownload}
    className={`p-2 sm:px-4 sm:py-2 rounded-lg border text-xs font-semibold transition-all flex items-center gap-2 bg-[#E8E0D4] text-[#1C1917] border-[#D6CFC4] hover:bg-[#D6CFC4]`}
>
    <FontAwesomeIcon icon={faDownload} />
    <span className="hidden sm:inline">{lbl.download}</span>
</button>
```

---

## FIX 6 — Inline Streaming Caret (LOW PRIORITY)

**Problem:** The blinking caret during streaming is rendered in a separate `<div>` below the text instead of inline with the last character.

**Goal:** Make the caret appear inline at the end of the streaming text.

### Step 6.1 — Change caret from block to inline

**File:** `src/components/Chat/MessageBubble.tsx`

Find the streaming caret (around line 299-302):

```tsx
{isStreamingAssistant && (
    <div className="mt-2">
        <span className="inline-block h-4 w-1.5 rounded-sm bg-[#0D9488] animate-pulse" aria-hidden="true" />
    </div>
)}
```

Replace with an inline caret that sits right after the text:

```tsx
{isStreamingAssistant && (
    <span className="inline-block h-4 w-1.5 rounded-sm bg-[#0D9488] animate-pulse align-middle ml-0.5" aria-hidden="true" />
)}
```

Note: Remove the wrapping `<div className="mt-2">`. The `<span>` must be placed AFTER the `</ReactMarkdown>` closing tag but INSIDE the same parent — so it flows inline with the last line of rendered markdown. The structure should be:

```tsx
) : (
    <>
        <ReactMarkdown ...>
            {message.content}
        </ReactMarkdown>
        {isStreamingAssistant && (
            <span className="inline-block h-4 w-1.5 rounded-sm bg-[#0D9488] animate-pulse align-middle ml-0.5" aria-hidden="true" />
        )}
    </>
)}
```

---

## CRITICAL CONSTRAINTS

1. **Do NOT modify `src/lib/sse.ts` or `src/lib/fetchSse.ts`** — SSE system is validated and working.
2. **Do NOT change the SSE envelope pattern** or delta batching in `useChatStream.ts`.
3. **Do NOT modify admin routes or admin dashboard** — not in scope.
4. **Do NOT add new npm dependencies.** All needed icons (`faStop`, `faDownload`) are already in `@fortawesome/free-solid-svg-icons`.
5. **Match the warm beige palette** for all light theme conversions — use the color table at the top of this document.
6. **Reset the mermaid init guard** when changing theme: Since `_mermaidInitialized` is a module-level flag, you MUST set it back to `false` after changing the theme config, OR remove the guard and always call `initialize()`. The simplest approach: remove the `if (!_mermaidInitialized)` check and always call `mermaid.initialize()` — it's cheap and idempotent.
7. **Every fix must pass `npx tsc --noEmit` individually.**
8. **Preserve `prefers-reduced-motion` support** — do not add new animations that don't respect the media query in `globals.css`.

---

## FILES TO MODIFY

| File | Fixes Applied |
|------|---------------|
| `src/components/Chat/ChatInputBar.tsx` | Fix 1 (stop button) |
| `src/app/page.tsx` | Fix 1 (pass stop + isStreaming props) |
| `src/components/Chat/MessageBubble.tsx` | Fix 2 (link styling), Fix 6 (inline caret) |
| `src/components/DiagramCard.tsx` | Fix 2 (link styling), Fix 3 (light theme), Fix 4 (ESC key), Fix 5 (SVG export) |
| `src/components/MermaidBlock.tsx` | Fix 3 (light theme) |

## FILES NOT TO TOUCH

- `src/lib/sse.ts`
- `src/lib/fetchSse.ts`
- `src/hooks/useChatStream.ts`
- `src/lib/pipeline.ts`
- `src/app/api/chat/route.ts`
- All admin routes and components
- `src/middleware.ts`

---

## EXECUTION ORDER

```
Fix 1: Stop button (ChatInputBar + page.tsx)
Fix 2: Link styling (MessageBubble + DiagramCard)
Fix 3: Diagram light theme (MermaidBlock + DiagramCard) — LARGEST change
Fix 4: ESC key (DiagramCard)
Fix 5: SVG export (DiagramCard)
Fix 6: Inline caret (MessageBubble)
    ↓
Verify: npx tsc --noEmit (0 errors)
Verify: npm run build (succeeds)
Verify: npm run test:smoke (7/7 pass)
```

Fixes 1, 2, 4, 5, 6 are independent. Fix 3 changes DiagramCard class names which affects Fix 2's DiagramCard `a` renderer color — if doing both, use light palette (`#0D9488`) for the link color in DiagramCard.

---

## POST-EXECUTION MANUAL VERIFICATION

After all fixes, verify in browser:

1. **Stop button:** Start a chat → while streaming, a "Stop generating" button appears above input → clicking it stops the stream and preserves partial answer
2. **Link styling:** Ask a question that generates a link → link appears in teal, underlined, opens in new tab
3. **Diagram light theme:** Ask for a wiring diagram → diagram renders with cream/beige palette, no dark GitHub colors
4. **ESC key:** Open diagram fullscreen → press Escape → modal closes
5. **SVG export:** Open diagram → click Download → `.svg` file downloads
6. **Inline caret:** During streaming → blinking teal caret appears at end of text, not on a separate line
