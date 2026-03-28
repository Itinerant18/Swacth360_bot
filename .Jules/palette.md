## Palette's Journal

## 2024-05-20 - ARIA Labels for Icon-Only Buttons
**Learning:** Found multiple instances where icon-only buttons relied solely on the `title` attribute for tooltips, which is insufficient for accessibility. Screen readers require a dedicated `aria-label` attribute to properly announce the button's purpose to users who cannot see the icon.
**Action:** Consistently added `aria-label` attributes (matching the visual `title` text) to icon-only buttons like "Close sidebar", "New conversation", "Delete", "Helpful", "Not helpful", "Copy response", and "Scroll to bottom" to ensure they are accessible. Will ensure this pattern is applied to all future icon-only buttons.
