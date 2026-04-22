## 2024-05-14 - Accessibility improvements for icon-only buttons
**Learning:** Found multiple instances where icon-only buttons only used a `title` attribute, which provides a visual tooltip but doesn't guarantee the accessible name for all screen readers.
**Action:** Always add `aria-label` to icon-only buttons, even when `title` is present, to ensure proper accessibility for screen readers.
