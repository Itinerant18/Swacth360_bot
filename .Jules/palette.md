## 2024-06-19 - Screen Reader Accessibility for Icon-only Buttons
**Learning:** Adding `title` attributes to icon-only buttons provides visual tooltips, but is insufficient for screen readers. In this project's components, I found multiple interactive elements relying exclusively on `title` and icon visuals, creating an accessibility barrier.
**Action:** When adding new icon-only buttons or reviewing existing ones, always ensure both a `title` (for visual users) and an identical `aria-label` (for screen readers) are implemented.
