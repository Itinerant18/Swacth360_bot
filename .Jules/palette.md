## 2024-05-15 - Improve keyboard accessibility for hover-revealed actions
**Learning:** Hover-revealed actions (using `opacity-0 group-hover:opacity-100`) are inherently undiscoverable for keyboard-only users who use `Tab` to navigate.
**Action:** Always append `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` alongside `group-hover:opacity-100` to ensure keyboard accessibility.
