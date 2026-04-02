# Chat Output & SSE Polish Plan

**Created:** 2026-04-02
**Author:** Claude Code (Opus 4.6)
**Status:** READY FOR EXECUTION
**Target:** Make chat output, diagrams, and SSE streaming polished like ChatGPT/Claude

---

## Current State Assessment

| Area | Score | Key Gaps |
|------|:-----:|----------|
| SSE Streaming UX | 6/10 | No delta batching, full re-render per token, no stop/regenerate, no typing animation |
| Chat Output Polish | 6/10 | No syntax highlighting, no per-code-block copy, no link styling, markdown flashes during stream |
| Diagram Output | 7/10 | No fullscreen, no SVG/PNG export, dark theme clashes with light chat UI, no server-side validation |
| Architecture | 8/10 | Solid SSE envelope pattern, clean separation — no changes needed |

---

## Phase 1: Streaming Performance (Critical)

**Problem:** Every LLM token triggers `setMessages()` -> full React re-render -> ReactMarkdown re-parses ALL accumulated text. For a 500-token response, that's ~500 full markdown parses + DOM reconciliations.

**Files to modify:**
- `src/app/page.tsx`

### Steps

#### 1A — Delta batching with `requestAnimationFrame`

Accumulate deltas in a `useRef` buffer. Flush to React state once per animation frame (~60fps = one update per 16ms). This collapses ~500 state updates into ~30.

```typescript
// Concept:
const pendingDeltaRef = useRef('');
const rafIdRef = useRef<number | null>(null);

// In SSE consumer, on each delta:
pendingDeltaRef.current += deltaText;
if (!rafIdRef.current) {
    rafIdRef.current = requestAnimationFrame(() => {
        const buffered = pendingDeltaRef.current;
        pendingDeltaRef.current = '';
        rafIdRef.current = null;
        setMessages((current) => current.map((m) =>
            m.id === assistantMessageId
                ? { ...m, content: `${m.content}${buffered}` }
                : m
        ));
    });
}
```

#### 1B — Separate streaming content from message array

Use a dedicated `streamingContentRef` for the active stream. Only write to `messages` state on the `done` event. Render the streaming message separately.

**Current flow:** delta -> setMessages() -> all messages re-render
**Target flow:** delta -> ref update -> only streaming bubble re-renders -> done event -> write to messages state once

```typescript
// Concept:
const streamingContentRef = useRef('');
const [streamingDisplay, setStreamingDisplay] = useState('');

// On delta: update ref + display
// On done: write final content to messages array, clear streaming state
```

#### 1C — Throttle scroll

Scroll to bottom at most once per 100ms during streaming. Currently fires on every delta.

```typescript
// Concept:
const scrollThrottleRef = useRef<number | null>(null);

function scrollToBottomThrottled() {
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = window.setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        scrollThrottleRef.current = null;
    }, 100);
}
```

#### 1D — Memoize rendered messages

Wrap the message rendering in `React.memo` so non-streaming messages skip re-renders entirely.

```typescript
const MessageBubble = React.memo(function MessageBubble({ message, ... }) {
    // existing render logic
});
```

**Validation criteria:**
- React Profiler shows previous messages NOT re-rendering during stream
- State updates reduced from ~500 to ~30 per response
- Smooth scroll, no jank on mobile
- `done` event still overwrites with final formatted answer

---

## Phase 2: Interaction Controls (High Impact, Low Effort)

**Problem:** No way to stop a streaming response or retry a bad one. No feedback during the 1-3s RAG pipeline phase before the first token arrives.

**Files to modify:**
- `src/app/page.tsx`

### Steps

#### 2A — Stop Generation button

Show a button during streaming that aborts the SSE stream. The abort controller already exists at line 240 (`chatAbortControllerRef`).

```
Location: Below the streaming message bubble or at the bottom of the chat area
Label: "Stop generating" (with stop icon)
Behavior: chatAbortControllerRef.current?.abort()
Visibility: Only during active streaming (isLoading && streamingMessageId)
After stop: Keep partial answer visible, set isLoading = false
```

#### 2B — Regenerate button

On completed assistant messages, show a retry icon that re-sends the preceding user message.

```
Location: In the message footer row, next to thumbs up/down
Icon: faArrowsRotate or faRedo
Behavior: Find the user message before this assistant message, call sendMessage(userMessage.content)
Visibility: Only on completed (non-streaming) assistant messages
```

#### 2C — Thinking phase indicator

Show contextual text before the first delta arrives, with elapsed timer.

```
Current: Empty skeleton shimmer bars + "Analyzing and generating response..."
Target:  Phase-aware text:
  - "Searching knowledge base..." (0-1s)
  - "Analyzing context..." (1-2s)
  - "Generating response..." (2s+)
  - Each with elapsed timer: "Searching knowledge base... 1.2s"

Implementation:
  - Add a `thinkingPhase` state that cycles via setTimeout intervals
  - Clear when first delta arrives
  - Show elapsed time from requestStartTime
```

**Validation criteria:**
- Stop button visible during streaming, click aborts cleanly
- Partial answer preserved after stop
- Regenerate icon on completed messages, re-sends preceding user message
- Thinking text shows with elapsed timer before first delta

---

## Phase 3: Code Block & Markdown Polish (High Impact)

**Problem:** Industrial operators see code snippets (Modbus configs, JSON, terminal commands) without syntax highlighting. No per-block copy. Links unstyled.

**Files to modify:**
- `src/app/page.tsx` (markdown renderer config)
- NEW: `src/components/CodeBlock.tsx`

### Steps

#### 3A — Syntax highlighting with `react-syntax-highlighter`

```bash
npm install react-syntax-highlighter @types/react-syntax-highlighter
```

Create `src/components/CodeBlock.tsx`:
- Detect language from markdown fence (```json, ```bash, etc.)
- Use a warm-toned theme that matches the skeuomorphic palette
- Fallback to plain monospace for unknown languages
- Wrap in a container with header (language badge + copy button)

#### 3B — Per-code-block copy button

Inside `CodeBlock.tsx`:
- Top-right "Copy" icon button
- On click: `navigator.clipboard.writeText(code)`
- Show checkmark for 2s after copy
- Small, unobtrusive, appears on hover

#### 3C — Language badge

Inside `CodeBlock.tsx` header:
- Left side: language label (e.g., "json", "bash", "python")
- Right side: copy button
- Subtle background (#F0EBE3), small text

#### 3D — Link styling

In the ReactMarkdown `components` config in `page.tsx`:
```typescript
a: (props) => (
    <a className="text-[#0D9488] underline hover:text-[#0B7C72] transition-colors"
       target="_blank" rel="noopener noreferrer" {...stripMarkdownNode(props)} />
)
```

**Validation criteria:**
- Code blocks show syntax-colored keywords
- Language badge visible on code blocks
- Copy button on each code block, works correctly
- Links have teal underline + hover effect

---

## Phase 4: Diagram Output Polish

**Problem:** DiagramCard uses hardcoded GitHub dark theme (#0d1117) inside a light skeuomorphic chat. No fullscreen. No export.

**Files to modify:**
- `src/components/DiagramCard.tsx`
- `src/components/MermaidBlock.tsx`

### Steps

#### 4A — Light theme for diagrams

Update MermaidBlock Mermaid config:
```typescript
// Current: theme: 'dark', darkMode: true, primaryColor: '#1f6feb'
// Target:  theme: 'base' (or custom), colors matching chat palette
//   background: '#FAF7F2' (chat bg)
//   primaryColor: '#0D9488' (teal accent)
//   primaryTextColor: '#1C1917' (dark text)
//   lineColor: '#D6CFC4' (border color)
//   secondaryColor: '#F0EBE3' (section bg)
```

Update DiagramCard container styles:
```
// Current: background #0d1117, text #e6edf3
// Target:  background #FAF7F2, text #1C1917, borders #D6CFC4
```

#### 4B — Fullscreen toggle

Add expand icon in DiagramCard header:
- Click opens a modal/overlay at full viewport
- Modal has: close button (X), zoom controls, download button
- Render same MermaidBlock inside modal at larger scale
- ESC key closes modal

#### 4C — SVG/PNG export

Add download button in DiagramCard header (and in fullscreen modal):
- SVG export: grab innerHTML of rendered SVG, create Blob, trigger download
- PNG export: draw SVG to canvas via `new Image()` + `canvas.toDataURL('image/png')`
- Filename: `{diagramType}-{timestamp}.svg` or `.png`

#### 4D — Server-side Mermaid validation (optional)

In `src/app/api/diagram/route.ts`:
- Before returning diagram response, validate Mermaid syntax
- If invalid, retry LLM generation once with error message in prompt
- If still invalid, return with `syntaxValid: false` flag so client shows warning

**Validation criteria:**
- Diagram card matches chat theme (light, warm colors)
- Fullscreen button opens modal at full viewport
- Download button saves SVG/PNG file
- Zoom controls work in both normal and fullscreen
- Mermaid syntax errors caught before reaching client (if 4D implemented)

---

## Phase 5: Streaming Animation Polish (Nice-to-Have)

**Problem:** Text concatenates instantly with no reveal animation. Cursor is a detached block below text.

**Files to modify:**
- `src/app/page.tsx`
- `src/app/globals.css`

### Steps

#### 5A — Word-by-word fade-in

Wrap newly appended tokens in `<span>` elements with a CSS fade-in animation:
```css
@keyframes token-reveal {
    from { opacity: 0; }
    to { opacity: 1; }
}
.token-new {
    animation: token-reveal 0.15s ease-out forwards;
}
```

**Note:** This is complex to implement with ReactMarkdown. Alternative approach: apply a CSS `animation` on the last N characters of the rendered output using a pseudo-element or container transition. Simpler but less precise.

#### 5B — Inline blinking caret

Replace the current detached teal block cursor (`animate-pulse`, below message) with an inline thin caret:
```css
.streaming-caret::after {
    content: '|';
    animation: blink 0.8s step-end infinite;
    color: #0D9488;
    font-weight: 300;
}
@keyframes blink {
    50% { opacity: 0; }
}
```

This caret should appear inline at the end of the last rendered text, not as a separate div below.

#### 5C — Staggered message entrance

Use CSS custom property to stagger `animate-fade-up` timing:
```typescript
style={{ animationDelay: `${index * 50}ms` }}
```

**Validation criteria:**
- New text appears with subtle fade-in (not instant)
- Caret blinks inline at end of streaming text, disappears on done
- New messages slide up with staggered timing
- `prefers-reduced-motion` disables all animations

---

## Execution Order

```
Phase 1 (Streaming Perf)  ──── CRITICAL, do first
  └─► Phase 2 (Controls)  ──── High impact, depends on Phase 1 streaming changes
       └─► Phase 3 (Code Blocks) ── Independent, can parallel with Phase 2
            └─► Phase 4 (Diagrams) ── Independent
                 └─► Phase 5 (Animations) ── Nice-to-have, do last
```

Phases 3 and 4 are independent of each other and can be done in parallel.
Phase 5 depends on Phase 1 (delta batching must be in place for animation to work smoothly).

---

## Tool Assignment

| Phase | Recommended Tool | Why |
|-------|-----------------|-----|
| Phase 1 | **Codex / Claude Code** | Requires careful React performance optimization, needs testing |
| Phase 2 | **Codex / Claude Code** | UI logic changes, abort controller wiring |
| Phase 3 | **Codex** | New component creation, npm install, straightforward |
| Phase 4 | **Gemini CLI** | Multi-file changes across DiagramCard + MermaidBlock, theme redesign |
| Phase 5 | **Claude Code** | CSS animation + React integration, needs iterative testing |

---

## Files Reference

| File | Phases | Purpose |
|------|--------|---------|
| `src/app/page.tsx` | 1, 2, 3, 5 | Main chat UI — streaming, controls, markdown config |
| `src/app/globals.css` | 5 | Animation keyframes |
| `src/components/CodeBlock.tsx` | 3 | NEW — syntax highlighted code block with copy + language badge |
| `src/components/DiagramCard.tsx` | 4 | Diagram container — theme, fullscreen, export |
| `src/components/MermaidBlock.tsx` | 4 | Mermaid SVG renderer — theme colors |
| `src/app/api/diagram/route.ts` | 4 (optional) | Server-side Mermaid validation |
| `src/lib/sse.ts` | — | No changes needed |
| `src/lib/fetchSse.ts` | — | No changes needed |

---

## Dependencies to Install

```bash
# Phase 3 — Syntax highlighting
npm install react-syntax-highlighter @types/react-syntax-highlighter
```

No other new dependencies required. All other changes use existing libraries (React, Tailwind, Mermaid, FontAwesome).

---

# Completion Status — ALL PHASES COMPLETED
**Date:** 2026-04-02
**Validator:** Gemini CLI

- [x] **Phase 1: Streaming Performance** — Delta batching, separate state, memoization, throttled scroll implemented.
- [x] **Phase 2: Interaction Controls** — Stop, Regenerate, and Edit implemented.
- [x] **Phase 3: Code Block & Markdown Polish** — Syntax highlighting, headers, copy button, link styling implemented.
- [x] **Phase 4: Diagram Output Polish** — ChatGPT-like styling, expansion modal, FontAwesome icons implemented.
- [x] **Phase 5: Streaming Animation Polish** — Fade-in transitions and thinking shimmer implemented.
