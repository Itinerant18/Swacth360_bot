## 2024-05-24 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** Relied on `title` attributes for tooltips on icon-only buttons, but these are often not announced reliably by screen readers compared to `aria-label`. Both are needed for full accessibility (visual tooltip + screen reader announcement).
**Action:** Always add `aria-label` alongside `title` for buttons containing only icons.
