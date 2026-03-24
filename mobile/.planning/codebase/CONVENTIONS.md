# Coding Conventions

**Analysis Date:** 2024-03-20

## Naming Patterns

**Files:**
- `snake_case` for all `.dart` files (e.g., `home_screen.dart`, `auth_provider.dart`).

**Functions:**
- `camelCase` for methods and standalone functions (e.g., `signIn()`, `_parseBody()`).

**Variables:**
- `camelCase` for public and local variables.
- `_camelCase` (prefixed with underscore) for private members in classes (e.g., `_user`, `_service`).

**Types:**
- `PascalCase` for classes, enums, and extensions (e.g., `AuthProvider`, `MessageRole`).

## Code Style

**Formatting:**
- standard Flutter/Dart formatter (`dart format`).
- Line length: Default (usually 80 or 120, based on `analysis_options.yaml` inclusion).

**Linting:**
- Uses `package:flutter_lints/flutter.yaml` via `analysis_options.yaml`.
- Relaxed rules for const: `prefer_const_constructors: false` and `prefer_const_literals_to_create_immutables: false` are explicitly disabled.

## Import Organization

**Order:**
1. Dart core libraries (`dart:async`, `dart:convert`, etc.).
2. Flutter framework (`package:flutter/material.dart`).
3. Third-party packages (`package:supabase_flutter/supabase_flutter.dart`).
4. Project-specific relative imports (`../services/auth_service.dart`).

**Path Aliases:**
- Not detected. Relative paths are used throughout the project.

## Error Handling

**Patterns:**
- `try-catch` blocks for asynchronous operations in services and providers.
- Specific exception handling using `on` (e.g., `on AuthException catch (e)`, `on SocketException catch (e)` in `lib/services/chat_service.dart`).
- Errors are often caught in Providers and stored in an `_error` state variable to be displayed in the UI via `notifyListeners()`.
- Rethrowing with more descriptive `Exception` messages is common in services.

## Logging

**Framework:** `debugPrint`

**Patterns:**
- Log statements are used for debugging network requests and responses in services (e.g., `[ChatService] Status: 200`).
- Found in `lib/services/chat_service.dart`.

## Comments

**When to Comment:**
- Minimal commenting observed. Most code is self-documenting through naming.

**JSDoc/TSDoc:**
- DartDoc (`///`) is not heavily used in the current implementation.

## Function Design

**Size:**
- Most functions are focused and small, except for complex parsing logic like `_parseBody` in `lib/services/chat_service.dart`.

**Parameters:**
- Named parameters are preferred for multi-argument functions, especially in models and services (e.g., `sendMessage({required List<Map<String, dynamic>> messages, ...})`).

**Return Values:**
- Services use `Future` for async operations.
- Modern Dart features like Records are used for complex return values (e.g., `Future<({String text, String? conversationId, bool isDiagram, Map<String, dynamic>? diagramJson})>` in `lib/services/chat_service.dart`).

## Module Design

**Exports:**
- Not used. Files import specific files they need.

**Barrel Files:**
- None detected. No `index.dart` or similar files aggregating exports.

---

*Convention analysis: 2024-03-20*
