## 2024-06-15 - Hover-revealed UI Elements and Keyboard Accessibility
**Learning:** Hidden interactive elements (like edit or delete buttons) revealed only on `group-hover` using `opacity-0 group-hover:opacity-100` are completely inaccessible to keyboard users navigating via Tab, as there's no visual indicator when they receive focus.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure the actions remain discoverable and accessible for keyboard users.
