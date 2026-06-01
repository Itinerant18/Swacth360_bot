## 2026-06-01 - Hover-Revealed UI Elements and Keyboard Accessibility
**Learning:** Hover-revealed UI elements (like a delete button only visible on `group-hover`) are inherently inaccessible to keyboard users because they cannot hover, so the element never becomes visible when they tab to it.
**Action:** When using classes like `opacity-0 group-hover:opacity-100` to hide UI elements, ALWAYS pair them with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so the element becomes visible and clearly outlined when focused via keyboard navigation.
