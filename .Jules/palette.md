## 2024-04-03 - Initial Setup
**Learning:** Started logging UX patterns.
**Action:** Keep documenting critical learnings.

## 2024-04-03 - Zoom Controls Accessibility
**Learning:** The `title` attribute alone on icon-only buttons (like the zoom controls in `MermaidBlock.tsx`) is insufficient for screen readers. An explicit `aria-label` is required for proper accessibility.
**Action:** Always add `aria-label` alongside `title` for icon-only buttons to ensure they are accessible to all users.
