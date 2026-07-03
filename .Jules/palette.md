## 2024-07-03 - Accessible Hover Actions
**Learning:** Hover-revealed UI actions (e.g., using `opacity-0 group-hover:opacity-100`) are invisible and inaccessible to keyboard users traversing with Tab unless explicitly managed.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so interactive elements become visible and clearly outlined upon receiving keyboard focus.
