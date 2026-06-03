## 2024-06-03 - Accessible Hover-Revealed Buttons
**Learning:** Buttons that rely on hover states to become visible (`opacity-0 group-hover:opacity-100`) are inherently inaccessible to keyboard-only users unless focus states are explicitly handled. Without focus styles, a keyboard user navigating via Tab cannot see or interact with the button.
**Action:** Always pair `opacity-0 group-hover:opacity-100` patterns with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so that the button reveals itself and indicates focus when tabbed to.
