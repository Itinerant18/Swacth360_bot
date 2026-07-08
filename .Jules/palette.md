## 2024-05-31 - [Make Hover-Revealed UI Keyboard Accessible]
**Learning:** Found that elements like delete buttons and edit buttons were hidden by default and only revealed on mouse hover (`group-hover:opacity-100`). This completely hides these elements from keyboard users since they never receive focus or become visible without a mouse hover.
**Action:** Always pair `opacity-0 group-hover:opacity-100` classes with `focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none` so keyboard navigators can see and interact with these controls when tabbing through the UI.
