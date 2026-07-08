## 2024-05-24 - Hover Actions Need Focus Visible States
**Learning:** When using `opacity-0 group-hover:opacity-100` for UI actions (like edit or delete buttons), these buttons become completely inaccessible to keyboard users because they remain visually hidden (`opacity: 0`) when focused via the Tab key.
**Action:** Always pair hover-revealed action classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure they become visible and clearly outlined when navigated to via keyboard.
