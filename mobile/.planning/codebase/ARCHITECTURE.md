# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Layered Architecture with Provider for State Management.

**Key Characteristics:**
- Separation of concerns between UI, state logic, and external services.
- Reactive UI updates using Flutter's `ChangeNotifier` and `MultiProvider`.
- Centralized service layer for API and database (Supabase) interactions.

## Layers

**Presentation Layer:**
- Purpose: Defines the user interface and handles user interactions.
- Location: `lib/screens/`, `lib/widgets/`
- Contains: Flutter widgets, screen navigation, and view-specific UI logic.
- Depends on: `lib/providers/`, `lib/models/`, `lib/theme/`
- Used by: App entry point (`lib/main.dart`)

**State Management Layer:**
- Purpose: Holds application state and bridges the UI with backend services.
- Location: `lib/providers/`
- Contains: `ChangeNotifier` classes that manage state for authentication, chat, language, etc.
- Depends on: `lib/services/`, `lib/models/`
- Used by: `lib/screens/`, `lib/widgets/`

**Service Layer:**
- Purpose: Handles communication with external APIs and data sources.
- Location: `lib/services/`
- Contains: Logic for Supabase interactions (Auth, DB) and custom API calls (Chat).
- Depends on: `lib/models/`, `lib/config/`
- Used by: `lib/providers/`

**Data Layer (Models):**
- Purpose: Defines data structures and handles serialization/deserialization.
- Location: `lib/models/`
- Contains: Plain Old Dart Objects (PODOs) with `fromJson` and `toApiJson` methods.
- Depends on: None
- Used by: All other layers.

## Data Flow

**Chat Interaction Flow:**

1. User types a message in `ChatScreen` (`lib/screens/chat/chat_screen.dart`).
2. `ChatInputBar` calls `ChatProvider.sendMessage` (`lib/providers/chat_provider.dart`).
3. `ChatProvider` adds a temporary user message to the list and sets `isLoading = true`, notifying the UI.
4. `ChatProvider` calls `ChatService.sendMessage` (`lib/services/chat_service.dart`).
5. `ChatService` performs an HTTP POST request to the backend API.
6. Upon response, `ChatService` parses the body (handling custom `DIAGRAM_RESPONSE:` prefixes).
7. `ChatProvider` updates the message list with the assistant's response (text or diagram), sets `isLoading = false`, and notifies the UI.
8. `ChatScreen` rebuilds to display the new message.

**State Management:**
- Global state is provided at the root of the app via `MultiProvider` in `lib/main.dart`.
- Each functional area has its own provider (e.g., `AuthProvider`, `ChatProvider`, `LanguageProvider`).
- UI components use `context.watch<T>()` or `Consumer<T>` to react to state changes.

## Key Abstractions

**ChatMessage:**
- Purpose: Unified representation of a message in a conversation.
- Examples: `lib/models/message_model.dart`
- Pattern: Factory constructors for different message types (user, assistant, diagram).

**ChatService:**
- Purpose: Handles complex HTTP communication with the chat API.
- Examples: `lib/services/chat_service.dart`
- Pattern: Custom `HttpClient` implementation with manual response parsing for streaming-style output.

**ChangeNotifier:**
- Purpose: Base class for all providers to manage state and notify listeners.
- Examples: `lib/providers/chat_provider.dart`, `lib/providers/auth_provider.dart`

## Entry Points

**Main Entry Point:**
- Location: `lib/main.dart`
- Triggers: Application launch.
- Responsibilities: Initializes Supabase, configures system UI, sets up providers, and launches the root widget (`SaiApp`).

**Splash Screen:**
- Location: `lib/screens/splash_screen.dart`
- Triggers: `SaiApp` build.
- Responsibilities: Checks authentication state and routes the user to either the Login or Home screen.

## Error Handling

**Strategy:** Exception propagation from services to providers, where they are caught and exposed as state variables for the UI to display.

**Patterns:**
- Try-catch blocks in Providers to handle service exceptions.
- Error banners or snackbars in the UI triggered by provider state changes (`lib/widgets/error_banner.dart`).
- Custom error messages for network timeouts or Supabase Auth errors.

## Cross-Cutting Concerns

**Logging:** Uses `debugPrint` for development-time logging in services (`lib/services/chat_service.dart`).
**Validation:** Basic form validation in the UI (e.g., `lib/screens/auth/login_screen.dart`).
**Authentication:** Managed via Supabase Auth, integrated through `AuthService` and `AuthProvider`.

---

*Architecture analysis: 2026-03-24*
