## 2024-05-22 - Keyboard accessibility for hover-revealed UI
**Learning:** Actions that are revealed on hover using `opacity-0 group-hover:opacity-100` remain undiscoverable to keyboard users unless they also receive visible focus.
**Action:** Always pair hover-revealed classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` and ensure semantic `aria-label`s are present.
