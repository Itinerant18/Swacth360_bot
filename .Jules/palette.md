## 2024-06-21 - Keyboard Accessible Hover Actions
**Learning:** Hover-revealed UI actions (e.g., using `opacity-0 group-hover:opacity-100`) hide functionality from keyboard-only and screen reader users since they can't trigger hover states.
**Action:** Always pair hover-reveal classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` and ensure proper `aria-label`s on the interactive elements.
