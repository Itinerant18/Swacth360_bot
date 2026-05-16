## 2024-05-16 - Focus States on Hover-Revealed UI Actions
**Learning:** When using UI actions that are hidden by default and only revealed on hover (e.g. using `opacity-0 group-hover:opacity-100`), these actions become undiscoverable and unusable for keyboard-only users because they remain `opacity-0` when they receive focus via tab navigation.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so that the interactive element becomes visible and clearly indicates focus when a keyboard user tabs to it.
