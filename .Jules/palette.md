## 2024-06-22 - Hover-revealed Keyboard Accessibility
**Learning:** Hover-revealed UI actions (like opacity-0 group-hover:opacity-100) are completely invisible to keyboard-only users navigating via Tab.
**Action:** Pair hover-revealed classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure these secondary actions remain discoverable and accessible without a mouse.
