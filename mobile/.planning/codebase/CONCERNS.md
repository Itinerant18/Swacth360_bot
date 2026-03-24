# Codebase Concerns

**Analysis Date:** 2026-03-20

## Tech Debt

**Hardcoded Secrets and Config:**
- Issue: Supabase URL, Anon Key, and API Base URL are hardcoded in a configuration file instead of being injected via environment variables or build-time config.
- Files: `lib/config/app_config.dart`
- Impact: Security risk if the repository is public; difficulty in managing different environments (dev/prod).
- Fix approach: Use `--dart-define` or a package like `flutter_dotenv` to load configurations from environment variables.

**Mixing of Logic and UI in Screens:**
- Issue: Screens contain extensive business logic, state management, and direct service calls, leading to large and fragile files.
- Files: `lib/screens/auth/login_screen.dart` (694 lines), `lib/screens/chat/chat_screen.dart` (520 lines), `lib/screens/history/history_drawer.dart` (550 lines).
- Impact: Low maintainability and difficulty in testing business logic independently.
- Fix approach: Extract business logic into existing providers or separate controller classes. Ensure UI components only handle presentation.

**Hardcoded User Restrictions:**
- Issue: Specific admin accounts are blocked directly in the UI logic.
- Files: `lib/screens/auth/login_screen.dart` (lines 96-102)
- Impact: Inflexible and requires code changes for any access control modification.
- Fix approach: Move access control logic to the backend or a dedicated configuration service.

## Security Considerations

**Exposed Supabase Anon Key:**
- Risk: The `supabaseAnonKey` is committed to the codebase.
- Files: `lib/config/app_config.dart`
- Current mitigation: None.
- Recommendations: Rotate the key and move it to a secure environment configuration that is not committed to version control.

## Performance Bottlenecks

**Large UI Render Methods:**
- Problem: Complex UI structures with many nested widgets in single build methods.
- Files: `lib/screens/auth/login_screen.dart`, `lib/screens/chat/chat_screen.dart`, `lib/widgets/message_bubble.dart` (431 lines).
- Cause: Lack of widget decomposition.
- Improvement path: Break down large build methods into smaller, reusable stateless widgets or private helper methods.

## Fragile Areas

**Chat Message Streaming:**
- Files: `lib/services/chat_service.dart`
- Why fragile: Manual parsing of event-stream/SSE responses might break if the backend format changes slightly.
- Safe modification: Add robust unit tests for different stream response formats.
- Test coverage: Zero.

## Test Coverage Gaps

**Missing Unit and Widget Tests:**
- What's not tested: Almost the entire application logic, including authentication, chat messaging, and history management.
- Files: All files under `lib/` except for a trivial smoke test in `test/widget_test.dart`.
- Risk: Regressions can be easily introduced; difficult to refactor without fear of breaking core functionality.
- Priority: High

**Empty Catch Blocks:**
- What's not tested: Error scenarios are ignored in several places.
- Files: `lib/screens/history/history_drawer.dart` (line 57), `lib/services/chat_service.dart` (line 150).
- Risk: Silent failures make debugging difficult and degrade user experience.
- Priority: Medium

---

*Concerns audit: 2026-03-20*
