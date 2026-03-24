# SAI: Swatch Panel Support AI

> **Expert Technical Support at Your Fingertips** — A sophisticated Flutter-based mobile companion for the SAI ecosystem, designed to provide instant AI-powered guidance for Swatch Panel systems with integrated diagramming and multi-language support.

---

<div align="center">

![Flutter](https://img.shields.io/badge/Flutter-3.3.0%2B-02569B?style=for-the-badge&logo=flutter)
![Dart](https://img.shields.io/badge/Dart-3.3.0%2B-0175C2?style=for-the-badge&logo=dart)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20DB-3ECF8E?style=for-the-badge&logo=supabase)
![OpenAI](https://img.shields.io/badge/AI-LLM%20%2F%20RAG-412991?style=for-the-badge&logo=openai)
![License](https://img.shields.io/badge/license-MIT-ff6b6b?style=for-the-badge)

</div>

---

## Overview

**SAI (Swatch Panel Support AI)** is a high-performance cross-platform mobile application that brings the power of the SAI web ecosystem to mobile devices. It leverages a modern **Research-Augmented Generation (RAG)** backend to provide technical support for HMS Panel systems, complete with interactive Mermaid.js diagrams and a unique "Pencil and Paper" aesthetic.

### ✨ Key Features

*   **🤖 Intelligent Chat**: Real-time technical support powered by OpenAI and custom RAG pipelines.
*   **📊 Dynamic Diagramming**: On-the-fly generation and rendering of Mermaid.js diagrams (flowcharts, sequences, entity-relationship).
*   **🌐 Multi-Language Support**: Seamlessly switch between **English**, **Hindi**, and **Bengali** with localized prompts and UI.
*   **🛡️ Flexible Access**: 
    *   **Guest Mode**: 3 free questions for immediate help without an account.
    *   **Authenticated Mode**: Full session history, saved conversations, and profile management.
*   **📱 Modern UX**: Animated typing indicators, message feedback (thumbs up/down), swipe-to-delete history, and a distinct aesthetic theme.

---

## Tech Stack & Architecture

### Core Technologies
- **Frontend Framework**: [Flutter](https://flutter.dev/) (Dart)
- **State Management**: [Provider](https://pub.dev/packages/provider) (ChangeNotifier pattern)
- **Backend-as-a-Service**: [Supabase](https://supabase.com/) (Authentication & PostgreSQL)
- **AI Integration**: Custom REST API calling OpenAI/Sarvam AI RAG models.
- **Rendering**: `webview_flutter` for high-fidelity Mermaid.js diagram rendering.

### System Architecture
The app follows a clean, service-oriented architecture:
1.  **UI Layer**: Custom widgets and screens using a cohesive "Paper & Brass" theme.
2.  **Provider Layer**: Orchestrates state (Auth, Chat, Language, Guest limits).
3.  **Service Layer**: Handles API communication (Supabase SDK, Chat REST API, Diagram API).
4.  **Model Layer**: Type-safe Dart classes for Messages, Conversations, and Diagrams.

---

## 📁 Directory Structure

```text
lib/
├── config/           # API Endpoints & Supabase Configuration
├── models/           # Data entities (Message, Conversation, etc.)
├── providers/        # State management (Auth, Chat, UI controllers)
├── screens/          # Primary application views (Chat, History, Auth)
│   ├── auth/         # Login & Registration
│   ├── chat/         # The main SAI interface
│   ├── history/      # Past conversation management
│   └── profile/      # User settings & Language preferences
├── services/         # API & External Integration logic
├── theme/            # Global AppTheme (Colors, Typography, Shadows)
└── widgets/          # Reusable UI components (Bubbles, Inputs, Cards)
```

---

## Getting Started

### Prerequisites
- **Flutter SDK**: `>= 3.3.0`
- **Dart SDK**: `>= 3.3.0`
- **Supabase Account**: For Auth and Database hosting.
- **SAI Web Backend**: The mobile app calls the Next.js API routes of the SAI web project.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-repo/tech-support-ai.git
    cd tech-support-ai/mobile
    ```

2.  **Configure Environment**:
    Edit `lib/config/app_config.dart` with your specific keys:
    ```dart
    static const String apiBaseUrl      = 'https://your-netlify-app.netlify.app';
    static const String supabaseUrl     = 'https://your-project.supabase.co';
    static const String supabaseAnonKey = 'your-public-anon-key';
    ```

3.  **Install Dependencies**:
    ```bash
    flutter pub get
    ```

4.  **Run the Application**:
    ```bash
    # For Android
    flutter run
    
    # For iOS (macOS required)
    cd ios && pod install && cd ..
    flutter run
    ```

---

## Design Language: "Paper & Brass"

SAI features a bespoke visual identity:
- **Backgrounds**: Textured `PaperBackground` with a subtle grid.
- **Colors**: 
    - `AppColors.brass`: For primary actions and highlights.
    - `AppColors.textInk`: For deep, readable text.
    - `AppColors.textPencil`: For secondary annotations.
- **Interactive**: Custom-built `MessageBubble` with gradient fills and smooth entry animations.

---

## Testing & Quality

- **Linting**: Strict Dart analysis rules via `analysis_options.yaml`.
- **Testing**: Basic smoke tests in `test/widget_test.dart`. 
- **Validation**: Manual verification across Android and iOS platforms for responsive design.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <p>Built with ❤️ by Aniket</p>
</div>
