## 2026-07-06 - Hover-Revealed UI Actions Accessibility
**Learning:** Hover-revealed UI actions using `opacity-0 group-hover:opacity-100` are invisible and inaccessible to keyboard-only users who navigate via tab, preventing them from discovering or using these actions.
**Action:** Always pair `opacity-0 group-hover:opacity-100` classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure actions remain discoverable and accessible for keyboard users.
