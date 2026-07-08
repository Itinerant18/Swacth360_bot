## YYYY-MM-DD - Missing aria-label attributes on icon-only buttons
**Learning:** Found multiple icon-only buttons across components like `GraphTab`, `MessageBubble`, `ChatInputBar`, `DiagramCard`, and `ConversationSidebar` that only use `title` attributes instead of proper `aria-label` attributes for screen readers.
**Action:** Always verify icon-only buttons have an `aria-label` attribute and do not rely solely on the `title` attribute for accessibility.
