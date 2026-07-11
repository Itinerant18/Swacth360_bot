
## 2024-05-13 - Focus Styles for Hover-Revealed Actions
**Learning:** Actions that are revealed on hover (e.g., using `opacity-0 group-hover:opacity-100`) are invisible to keyboard-only users who navigate via `Tab`. The `opacity-0` hides the element, making it undiscoverable even if it can technically receive focus.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure the actions remain discoverable and accessible for keyboard users.
