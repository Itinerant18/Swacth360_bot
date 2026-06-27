
## 2024-06-03 - Keyboard Accessibility for Hover-revealed Actions
**Learning:** UI actions that are only revealed on hover (using `opacity-0 group-hover:opacity-100`) become invisible and inaccessible to keyboard-only users navigating via tab.
**Action:** Always pair `group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure actions remain discoverable and accessible during keyboard navigation.
