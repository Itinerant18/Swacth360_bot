## 2024-05-18 - Added ARIA labels to icon-only buttons
**Learning:** React component icon-only buttons (`MessageBubble`, `ChatInputBar`, `ConversationSidebar`) often lack proper screen reader labels despite having visual `title` tooltips.
**Action:** When creating or modifying icon-only buttons, ensure an `aria-label` is always provided alongside the `title` attribute.
