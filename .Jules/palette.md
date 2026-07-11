## 2026-05-05 - Keyboard Accessible Hover Buttons
**Learning:** In Tailwind CSS, when hiding buttons until their parent is hovered using `opacity-0 group-hover:opacity-100`, those buttons become invisible and inaccessible to keyboard users navigating via Tab.
**Action:** Always pair `opacity-0 group-hover:opacity-100` with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure they are revealed and styled when focused via keyboard.
