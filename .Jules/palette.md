## 2024-05-30 - Keyboard Accessibility for Hover-Revealed UI
**Learning:** Hover-revealed UI components (like delete buttons or edit actions) often lack keyboard accessibility because their `opacity-0` state hides them from sighted keyboard users, and they never get a visible focus state.
**Action:** When implementing hover-revealed UI actions (e.g., using `opacity-0 group-hover:opacity-100`), always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure the actions remain discoverable and accessible for keyboard users.
