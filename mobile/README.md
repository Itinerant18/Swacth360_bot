# SAI -- Flutter Mobile App

Cross-platform mobile app for the SAI (SWATCH Panel AI) support bot.
Works alongside the existing Next.js website -- **no backend changes required**.

---

## First Run Checklist

- [ ] Fill in `lib/config/app_config.dart` (3 values from your `.env.local`)
- [ ] `flutter pub get`
- [ ] For iOS: `cd ios && pod install && cd ..`
- [ ] `flutter run`

---

## Architecture

```
Mobile App (Flutter)
      |
      +-- POST /api/chat          -> Sarvam AI / RAG answers
      +-- POST /api/diagram       -> Mermaid diagram generation
      +-- POST /api/feedback      -> Message feedback (thumbs up/down)
      +-- Supabase SDK direct     -> Auth, conversations, messages
```

The Next.js API routes are HTTP endpoints -- the mobile app calls them exactly
as the browser does, passing the Supabase JWT as `Authorization: Bearer <token>`.

---

## Prerequisites

```
Flutter SDK  >= 3.3.0
Dart SDK     >= 3.3.0
Xcode        >= 15        (iOS)
Android SDK  API 24+      (Android 7.0+)
```

---

## 1 -- Install Flutter

```bash
# macOS
brew install flutter

# Or download from: https://docs.flutter.dev/get-started/install
flutter doctor   # check everything is configured
```

---

## 2 -- Set your config values

Edit `lib/config/app_config.dart`:

```dart
static const String apiBaseUrl    = 'https://YOUR_APP.netlify.app';
static const String supabaseUrl   = 'https://YOUR_PROJECT.supabase.co';
static const String supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
```

Copy these from your Next.js `.env.local` file:
- `apiBaseUrl`  -> your Netlify deployment URL
- `supabaseUrl` -> `NEXT_PUBLIC_SUPABASE_URL`
- `supabaseAnonKey` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 3 -- Install dependencies

```bash
cd mobile
flutter pub get
```

---

## 4 -- Run

```bash
# Android emulator or device
flutter run

# iOS simulator (macOS only)
cd ios && pod install && cd ..
flutter run -d ios

# Specific device
flutter devices              # list connected devices
flutter run -d <device-id>
```

---

## 5 -- Build release

```bash
# Android APK
flutter build apk --release

# Android App Bundle (Play Store)
flutter build appbundle --release

# iOS (requires Mac + Xcode)
flutter build ios --release
```

---

## Project Structure

```
lib/
+-- main.dart                     <- App entry point, providers
+-- config/
|   +-- app_config.dart           <- API URL + Supabase keys (fill in!)
+-- theme/
|   +-- app_theme.dart            <- Colors + Material theme
+-- models/
|   +-- message_model.dart        <- ChatMessage, DiagramData, MessageRole
|   +-- conversation_model.dart   <- ConversationModel
+-- services/
|   +-- auth_service.dart         <- Supabase auth wrapper
|   +-- chat_service.dart         <- POST /api/chat
|   +-- conversation_service.dart <- Supabase conversations/messages
|   +-- diagram_service.dart      <- POST /api/diagram
|   +-- feedback_service.dart     <- POST /api/feedback
+-- providers/
|   +-- auth_provider.dart        <- ChangeNotifier auth state
|   +-- chat_provider.dart        <- ChangeNotifier chat + diagram state
|   +-- language_provider.dart    <- EN / BN / HI with SharedPrefs
|   +-- guest_provider.dart       <- Guest 3-chat limit
|   +-- home_screen_controller.dart <- Tab navigation controller
+-- screens/
|   +-- splash_screen.dart
|   +-- home_screen.dart          <- Bottom nav (Chat / History / Profile)
|   +-- auth/
|   |   +-- login_screen.dart
|   |   +-- register_screen.dart
|   +-- chat/
|   |   +-- chat_screen.dart      <- Main chat UI
|   +-- history/
|   |   +-- history_screen.dart   <- Grouped conversation list
|   +-- profile/
|       +-- profile_screen.dart   <- User info, language, sign out
+-- widgets/
    +-- message_bubble.dart       <- User/assistant bubbles + feedback + typing
    +-- chat_input_bar.dart       <- Text input + language + diagram button
    +-- diagram_card.dart         <- Mermaid WebView diagram renderer
    +-- error_banner.dart         <- Dismissible error widget
```

---

## Features

| Feature | Status |
|---------|--------|
| Chat with Sarvam AI / RAG | Done (via /api/chat) |
| Mermaid diagram rendering | Done (WebView + mermaid.js) |
| Diagram request from chat | Done (bottom sheet type picker) |
| Bengali / Hindi / English | Done (localized prompts) |
| Sign in / Register | Done (Supabase Auth) |
| Guest mode (3 free chats) | Done (client-side gate) |
| Conversation history | Done (Supabase SDK) |
| Save conversation dialog | Done (bookmark icon) |
| Auto-save first exchange | Done |
| Swipe to delete conversation | Done |
| Message feedback (thumbs) | Done |
| Typing indicator | Done (animated) |
| Quick prompt chips | Done (localized) |
| Connection error handling | Done (error banner) |
| Offline fallback (diagrams) | Done (raw markdown) |
| Dark mode | Planned |
| Push notifications | Planned |
