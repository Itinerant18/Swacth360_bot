## 2026-06-02 - Hover-revealed UI Action Accessibility
**Learning:** Interactive elements (like buttons) that are visually hidden by default using `opacity-0` and only revealed on `group-hover` become completely inaccessible to keyboard users unless they also include `focus-visible` classes.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure they remain discoverable and usable via keyboard navigation.
