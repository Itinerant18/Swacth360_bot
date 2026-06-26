## 2024-06-26 - Keyboard Access for Hover-Revealed UI Actions
**Learning:** Hover-revealed actions (like edit/delete buttons using `opacity-0 group-hover:opacity-100`) are invisible to keyboard users when they tab to them, creating a hidden interactive trap.
**Action:** Always pair `group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so keyboard navigators can see the buttons they are focused on.
