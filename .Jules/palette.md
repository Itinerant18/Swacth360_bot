## 2024-06-05 - Initialized Palette Journal\n**Learning:** Started tracking UX and accessibility insights.\n**Action:** Will document critical learnings here.

## 2024-06-05 - Keyboard Accessibility for Hover Actions
**Learning:** Hover-revealed UI actions (`opacity-0 group-hover:opacity-100`) are invisible to keyboard-only users who navigate via Tab. Without specific focus handling, these interactions remain undiscoverable.
**Action:** Always pair hover-revealed classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so that keyboard users can naturally navigate to and use these actions.
