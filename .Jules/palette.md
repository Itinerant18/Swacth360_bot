## 2024-07-01 - Hover-revealed UI Actions Keyboard Accessibility
**Learning:** Hover-revealed UI elements (like edit or delete buttons that appear on `group-hover`) are undiscoverable and unusable by keyboard-only users unless they also reveal themselves on focus.
**Action:** When implementing `opacity-0 group-hover:opacity-100` patterns, always pair them with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure keyboard accessibility and discoverability.
