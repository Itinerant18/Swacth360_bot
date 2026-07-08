## 2024-06-04 - Hover-Revealed Actions A11y
**Learning:** Found hover-revealed icon-only buttons (`group-hover:opacity-100`) in Chat components without keyboard accessibility. They become visible on hover but remain hidden during keyboard navigation, breaking discoverability and usability.
**Action:** Pair `group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` and ensure they have `aria-label` for screen readers.
