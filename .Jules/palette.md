## 2026-05-24 - Keyboard Accessibility for Hover-Revealed Actions
**Learning:** Hover-revealed UI actions (e.g., using opacity-0 group-hover:opacity-100) are inherently inaccessible to keyboard-only users and screen readers unless paired with focus states, as they can never trigger the hover state to discover the action.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure the actions remain discoverable and accessible for keyboard users.
