## 2024-05-14 - Accessible Hover Actions
**Learning:** Hover-revealed UI actions (like edit or delete buttons on a message or list item) break keyboard accessibility if they remain `opacity-0` when focused.
**Action:** Always pair `opacity-0 group-hover:opacity-100` classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure these actions are discoverable and usable via keyboard navigation.
