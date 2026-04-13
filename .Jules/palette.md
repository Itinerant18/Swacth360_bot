## 2024-04-13 - Add ARIA Labels to Chat UI Icon-Only Buttons
**Learning:** Icon-only buttons (like Send, Close, New Conversation, Delete) in the app often lack both `aria-label` (for screen readers) and `title` (for visual tooltips). This prevents users who rely on screen readers from understanding what these buttons do, and impacts all users by not providing hover-tooltips.
**Action:** When creating new icon-only buttons or reviewing existing ones, verify they include both a descriptive `aria-label` and `title` attribute.
