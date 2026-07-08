## 2024-06-09 - Accessible Hover-Revealed UI Actions
**Learning:** Elements hidden by `opacity-0` and only revealed on `group-hover` are completely inaccessible to keyboard-only users because they remain visually hidden when focused.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so keyboard navigators can discover and interact with them.
