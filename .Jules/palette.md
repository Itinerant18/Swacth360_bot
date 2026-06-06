
## 2026-06-06 - Keyboard Accessible Hover Actions
**Learning:** Hover-revealed UI actions (e.g., `opacity-0 group-hover:opacity-100`) become invisible to keyboard-only users navigating via Tab, breaking discoverability and usability.
**Action:** Always pair hover-reveal classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure actions appear when focused. Also, ensure icon-only buttons have an `aria-label` alongside the `title` attribute.
