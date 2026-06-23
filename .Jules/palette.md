## 2024-06-23 - Discoverable Keyboard Access for Hover Actions
**Learning:** Hover-revealed UI elements (`opacity-0 group-hover:opacity-100`) become invisible traps for keyboard-only users because tabbing into them doesn't trigger the hover state, making the interactive element completely hidden despite having focus.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so actions naturally reveal themselves during keyboard navigation.
