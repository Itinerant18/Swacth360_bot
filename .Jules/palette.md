## 2026-06-13 - Focus Styles for Hover-Revealed Actions
**Learning:** Hover-revealed UI actions using utilities like `opacity-0 group-hover:opacity-100` are entirely inaccessible to keyboard users unless paired with explicit focus states.
**Action:** Always pair hover-reveal classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure actions remain discoverable and accessible via keyboard navigation.
