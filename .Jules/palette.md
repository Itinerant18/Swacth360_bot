## 2024-10-24 - Hover-revealed UI Keyboard Accessibility
**Learning:** Actions that are only visible on hover (like delete buttons on list items) become completely invisible to keyboard users who navigate via Tab.
**Action:** Always pair hover-reveal classes (e.g., opacity-0 group-hover:opacity-100) with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure keyboard navigation makes the action appear.
