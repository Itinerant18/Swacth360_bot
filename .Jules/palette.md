## 2024-11-20 - Accessible Hover Actions
**Learning:** Hover-revealed UI components (e.g., using `opacity-0 group-hover:opacity-100`) make actions invisible and inaccessible to keyboard users navigating via Tab.
**Action:** Always pair `group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so keyboard navigation naturally exposes these contextual actions.
