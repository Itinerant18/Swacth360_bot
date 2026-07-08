## 2024-06-14 - Keyboard Accessibility for Hover-Revealed UI Actions
**Learning:** Hover-revealed actions (using classes like `opacity-0 group-hover:opacity-100`) become invisible and unusable for keyboard navigators if they do not include focus styles, rendering essential functionality (like editing or deleting) inaccessible.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so that interactive actions become visible and focusable when tabbed to, preserving an intuitive experience for all users.
