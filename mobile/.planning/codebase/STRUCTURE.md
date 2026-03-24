# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
lib/
├── config/             # App-wide configuration
├── models/             # Data classes & JSON serialization
├── providers/          # State management (ChangeNotifier)
├── screens/            # Page-level UI components
│   ├── auth/           # Login & registration screens
│   ├── chat/           # Main chat interface
│   ├── history/        # Conversation history views
│   └── profile/        # User profile and settings
├── services/           # API and Database integrations
├── theme/              # Global app styling and themes
├── widgets/            # Reusable UI components
└── main.dart           # Entry point and provider setup
```

## Directory Purposes

**config/:**
- Purpose: Application-wide constants and dynamic configuration values.
- Key files: `lib/config/app_config.dart`

**models/:**
- Purpose: Data transfer objects and models for state.
- Key files: `lib/models/message_model.dart`, `lib/models/conversation_model.dart`

**providers/:**
- Purpose: Reactive state management logic bridging UI and services.
- Key files: `lib/providers/chat_provider.dart`, `lib/providers/auth_provider.dart`

**screens/:**
- Purpose: High-level screen widgets and navigation containers.
- Key files: `lib/screens/chat/chat_screen.dart`, `lib/screens/auth/login_screen.dart`

**services/:**
- Purpose: Handles communication with external APIs and Supabase.
- Key files: `lib/services/chat_service.dart`, `lib/services/conversation_service.dart`

**theme/:**
- Purpose: Global design system definition (colors, fonts, theme data).
- Key files: `lib/theme/app_theme.dart`

**widgets/:**
- Purpose: Reusable, atomic UI components.
- Key files: `lib/widgets/message_bubble.dart`, `lib/widgets/chat_input_bar.dart`

## Key File Locations

**Entry Points:**
- `lib/main.dart`: Root entry point, initializes Supabase and providers.
- `lib/screens/splash_screen.dart`: Bootstrapping logic for user session check.

**Configuration:**
- `lib/config/app_config.dart`: Supabase and backend API endpoints.

**Core Logic:**
- `lib/providers/chat_provider.dart`: Chat state management and message history.
- `lib/providers/auth_provider.dart`: Authentication state management.

**Testing:**
- `test/widget_test.dart`: Default widget tests.

## Naming Conventions

**Files:**
- snake_case: `message_model.dart`, `chat_screen.dart`

**Directories:**
- snake_case: `config/`, `models/`, `screens/`

## Where to Add New Code

**New Feature:**
- Model: `lib/models/`
- State: `lib/providers/`
- View: `lib/screens/`
- Service: `lib/services/`
- Register Provider in `lib/main.dart`

**New Component/Module:**
- Reusable UI: `lib/widgets/`
- Specialized UI: Sub-directory in `lib/screens/`

**Utilities:**
- App-wide: `lib/config/`
- Helper Functions: Often part of `services/` or a new `lib/utils/` (if needed)

## Special Directories

**.planning/:**
- Purpose: Contains codebase analysis and implementation documentation.
- Committed: Yes

**android/, ios/, web/, linux/, macos/, windows/:**
- Purpose: Platform-specific native code and configurations.
- Committed: Yes

---

*Structure analysis: 2026-03-24*
