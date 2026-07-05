## 2024-07-05 - Keyboard Accessible Hover Actions
**Learning:** Hover-revealed actions (using `opacity-0 group-hover:opacity-100`) are inherently undiscoverable and inaccessible for keyboard-only users who navigate via `Tab`.
**Action:** Always pair `opacity-0 group-hover:opacity-100` utility classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure interactive elements appear and are clearly indicated when focused via keyboard.
