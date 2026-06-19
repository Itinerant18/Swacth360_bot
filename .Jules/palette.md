## 2025-02-14 - Hover-Revealed UI Keyboard Accessibility
**Learning:** Discovered a pattern where hover-revealed UI components (using `opacity-0 group-hover:opacity-100`) lack keyboard discoverability for non-mouse users.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure focus styles correctly reveal hidden actions.
