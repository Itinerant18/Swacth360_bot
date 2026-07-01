## 2025-02-15 - Keyboard Accessibility for Hover-Revealed UI Actions
**Learning:** Hover-revealed UI actions (using `opacity-0 group-hover:opacity-100`) are invisible to keyboard navigators, severely impacting discoverability and accessibility.
**Action:** Always pair `group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so that focusable interactive elements are revealed and visibly outlined when accessed via keyboard navigation.
