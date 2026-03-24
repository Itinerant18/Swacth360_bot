# Technology Stack

**Analysis Date:** 2025-02-13

## Languages

**Primary:**
- Dart >=3.3.0 <4.0.0 - Main application logic and UI components in `lib/`

**Secondary:**
- Kotlin (JVM 17) - Android-specific configuration and plugins in `android/`
- Swift - iOS-specific configuration and plugins in `ios/`
- HTML/JavaScript - Used for Mermaid diagram rendering within `lib/widgets/diagram_card.dart` via `webview_flutter`

## Runtime

**Environment:**
- Flutter - Cross-platform mobile framework

**Package Manager:**
- `pub` (Dart)
- Lockfile: `pubspec.lock` present

## Frameworks

**Core:**
- Flutter (stable) - Core UI and framework functionality
- Provider ^6.1.2 - Main state management solution used in `lib/providers/`

**Testing:**
- `flutter_test` (built-in) - Unit and widget testing in `test/`

**Build/Dev:**
- Gradle (with Kotlin DSL) - Android build system (`android/build.gradle.kts`)
- CocoaPods - iOS dependency management (`ios/Podfile`)

## Key Dependencies

**Critical:**
- `supabase_flutter` ^2.5.6 - Authentication and direct database interaction
- `provider` ^6.1.2 - Dependency injection and state management
- `webview_flutter` ^4.8.0 - Required for rendering interactive Mermaid diagrams

**Infrastructure:**
- `shared_preferences` ^2.3.2 - Local persistence for user settings (e.g., language)
- `url_launcher` ^6.3.1 - Handling external links
- `flutter_markdown` ^0.7.3 - Rendering chat message responses

**UI/UX:**
- `google_fonts` ^6.2.1 - Typography
- `flutter_animate` ^4.5.0 - Motion and transition effects
- `flutter_svg` ^2.0.10+1 - Vector graphics support

## Configuration

**Environment:**
- Static configuration in `lib/config/app_config.dart`
- Contains API endpoints, Supabase credentials, and app constants

**Build:**
- `android/app/build.gradle.kts` - Android application settings
- `ios/Podfile` - iOS deployment and dependency settings
- `pubspec.yaml` - Flutter project metadata and dependencies

## Platform Requirements

**Development:**
- Flutter SDK (>=3.3.0)
- Android Studio / VS Code with Flutter extension
- Xcode (for iOS builds)

**Production:**
- Android: minSdk 24 (Android 7.0), targetSdk 36
- iOS: deployment target 14.0

---

*Stack analysis: 2025-02-13*
