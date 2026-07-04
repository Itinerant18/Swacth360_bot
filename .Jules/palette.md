## 2024-07-04 - [Hover-Revealed Actions & Keyboard Focus]
**Learning:** In this app's components (like chat messages and sidebar), hover-revealed actions (using `opacity-0 group-hover:opacity-100`) are completely hidden from keyboard users who tab through the interface. This creates a severe accessibility trap where focused interactive elements remain invisible.
**Action:** Always pair `group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure actions are visible and clearly highlighted when focused via keyboard.
