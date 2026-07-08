## 2024-05-21 - Keyboard Accessibility for Hover-Revealed Actions
**Learning:** Hover-revealed UI actions (e.g., using `opacity-0 group-hover:opacity-100`) become completely inaccessible to keyboard users if they lack focus-visible classes, making them undiscoverable and impossible to use via tabbing.
**Action:** Always pair hover-revealed classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` and ensure semantic HTML (e.g., `aria-label`) is present so these actions remain discoverable and accessible for keyboard users.
