## 2024-11-04 - Hover-revealed buttons require focus-visible classes for keyboard a11y
**Learning:** Found several buttons using `opacity-0 group-hover:opacity-100` to reveal on hover, but they were invisible to keyboard users navigating via Tab because they lacked `focus-visible:` classes.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure the actions remain discoverable and accessible for keyboard users.
