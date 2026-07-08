## 2024-06-11 - Hover-revealed actions need keyboard focus styles
**Learning:** Found an accessibility issue pattern where hover-revealed UI actions (like delete and edit buttons) are not discoverable for keyboard users because they lack `focus-visible` classes.
**Action:** When implementing hover-revealed UI actions (e.g., using `opacity-0 group-hover:opacity-100`), always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure the actions remain discoverable and accessible for keyboard users.
