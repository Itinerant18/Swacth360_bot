## 2024-06-20 - Missing Focus Styles on Hover Actions
**Learning:** The app's custom UI pattern of hover-revealed actions (using `opacity-0 group-hover:opacity-100`) often neglects keyboard users because it lacks `focus-visible` styles.
**Action:** Whenever using `opacity-0 group-hover:opacity-100` on buttons, always pair it with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so actions remain discoverable and accessible via keyboard navigation.
