## 2024-10-27 - Keyboard Access for Hover-Revealed UI Actions
**Learning:** Hover-revealed actions (like the Delete button on conversation items) using `group-hover:opacity-100` are invisible to keyboard-only users who navigate via Tab.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so the action becomes visible and accessible when it receives keyboard focus.
