## 2024-06-18 - Pairing Hover and Focus-Visible States
**Learning:** Found multiple instances where interactive UI actions (like edit/delete buttons) were revealed only on mouse hover (`opacity-0 group-hover:opacity-100`). This made the actions completely invisible and inaccessible to keyboard users navigating via Tab.
**Action:** Always pair hover-revealed utility classes with their keyboard focus equivalents (`focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none`) to ensure hidden actions remain discoverable for assistive technologies and keyboard navigation.
