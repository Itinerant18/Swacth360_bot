## 2024-04-26 - Icon-only buttons accessibility
**Learning:** Icon-only buttons often rely solely on the `title` attribute for tooltips, which is insufficient for screen readers. They require a distinct `aria-label` to be properly accessible.
**Action:** When adding or reviewing icon-only buttons (like SVG or FontAwesome icons inside `<button>`), always ensure an `aria-label` is present alongside the `title` attribute to provide proper context for assistive technologies.
