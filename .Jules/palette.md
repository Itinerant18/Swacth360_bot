## 2024-05-07 - Hover-Revealed UI Accessibility
**Learning:** Hover-revealed actions (using `opacity-0 group-hover:opacity-100`) completely hide interactive elements from keyboard users who tab through the interface, effectively making features like edit and delete inaccessible without a mouse.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so the action becomes visible when focused via keyboard.
