## 2026-06-12 - Hover-Revealed UI Accessibility
**Learning:** Hover-revealed UI actions (like edit/delete buttons that only appear on mouse hover via `opacity-0 group-hover:opacity-100`) are completely invisible to keyboard-only users unless specifically styled for focus.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` and ensure the button has a descriptive `aria-label`.
