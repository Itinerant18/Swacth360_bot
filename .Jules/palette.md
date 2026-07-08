## 2024-05-10 - Keyboard Accessible Hover Actions
**Learning:** Hover-revealed UI actions (e.g., using opacity-0 and group-hover:opacity-100) are invisible to keyboard users and cannot be focused, leading to accessibility violations. They must be explicitly styled to appear on focus.
**Action:** When implementing hover-revealed elements, always pair hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure they are discoverable via tab navigation and screen readers.
