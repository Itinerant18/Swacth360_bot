## 2026-06-10 - Focus States on Hover Actions
**Learning:** Hover-revealed actions (using opacity-0 and group-hover:opacity-100) are completely invisible to keyboard users unless explicitly paired with focus states.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none to ensure the actions remain discoverable and accessible for keyboard users.
