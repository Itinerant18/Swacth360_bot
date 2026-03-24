# External Integrations

**Analysis Date:** 2025-02-13

## APIs & External Services

**Chat Service:**
- Custom API (`https://sai.seple.in/api/chat`)
  - Function: Main AI chat endpoint
  - Implementation: `lib/services/chat_service.dart`

**Diagram Service:**
- Custom API (`https://sai.seple.in/api/diagram`)
  - Function: Mermaid diagram generation endpoint
  - Implementation: `lib/services/diagram_service.dart`

**Feedback Service:**
- Custom API (`https://sai.seple.in/api/feedback`)
  - Function: Captures user ratings for AI responses
  - Implementation: `lib/services/feedback_service.dart`

**Mermaid Diagram Rendering:**
- `mermaid.js` (via `cdn.jsdelivr.net`)
  - Usage: Rendered inside a `WebView` in `lib/widgets/diagram_card.dart`
  - Version: 10

## Data Storage

**Databases:**
- Supabase Postgres
  - Tables used: `conversations`, `messages`
  - Connection: `supabase_flutter` with `supabaseUrl` and `supabaseAnonKey`
  - Implementation: `lib/services/conversation_service.dart`

**Local Storage:**
- `shared_preferences`
  - Usage: Store user's language preference
  - Implementation: `lib/providers/language_provider.dart`

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Approach: Email/Password login and sign-up
  - Implementation: `lib/services/auth_service.dart`

## Monitoring & Observability

**Error Tracking:**
- None detected (basic `debugPrint` and `throw Exception`)

**Logs:**
- Console only (`debugPrint` in `lib/services/`)

## CI/CD & Deployment

**Hosting:**
- Android / iOS App Stores (implied)
- API endpoint: `https://sai.seple.in`

**CI Pipeline:**
- None detected in repository

## Environment Configuration

**Required env vars:**
- `supabaseUrl` - Statically defined in `lib/config/app_config.dart`
- `supabaseAnonKey` - Statically defined in `lib/config/app_config.dart`
- `apiBaseUrl` - Statically defined in `lib/config/app_config.dart`

**Secrets location:**
- Note: Sensitive credentials currently hardcoded in `lib/config/app_config.dart`.

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

---

*Integration audit: 2025-02-13*
