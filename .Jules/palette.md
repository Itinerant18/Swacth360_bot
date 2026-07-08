## 2024-05-20 - Focus states for hover-revealed elements
**Learning:** Hover-revealed UI actions (e.g., using `opacity-0 group-hover:opacity-100`) become undiscoverable and inaccessible to keyboard-only and screen-reader users if they lack focus states.
**Action:** Always pair `group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so keyboard navigation brings them into view and makes them accessible.
