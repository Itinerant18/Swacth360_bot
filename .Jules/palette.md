## 2024-04-05 - Icon-only buttons need both title and aria-label
**Learning:** A `title` attribute on an icon-only button is not sufficient for screen readers. While `title` provides a visual tooltip on hover, `aria-label` is explicitly required for screen readers to announce the button's purpose correctly.
**Action:** Always ensure that any icon-only button has both `title="..."` and an identical `aria-label="..."` attribute to maintain full visual and auditory accessibility.
