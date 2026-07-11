## 2024-05-24 - Hover-Revealed Actions Accessibility
**Learning:** The app uses `opacity-0 group-hover:opacity-100` to hide secondary actions like "Delete" or "Edit" until hovered. However, this makes them completely undiscoverable and unreachable for keyboard-only users who cannot trigger the hover state.
**Action:** When implementing hover-revealed UI actions, always pair the hover classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` to ensure keyboard accessibility.
