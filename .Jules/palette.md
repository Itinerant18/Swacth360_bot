## 2024-05-14 - Hover-revealed actions need keyboard support
**Learning:** Actions that are revealed on hover (e.g., using `opacity-0 group-hover:opacity-100`) are invisible to keyboard-only users who navigate via the Tab key. These actions also often lack proper `aria-label`s for screen readers since they are typically icon-only.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure the actions remain discoverable and accessible for keyboard users.
