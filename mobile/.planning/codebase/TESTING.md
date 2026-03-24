# TESTING.md

## Overview
This document outlines the testing framework and current state of testing in the tech-support-ai mobile application.

## Frameworks
- **Primary:** `flutter_test` (built-in Flutter testing package)
- **Status:** The project currently relies on standard Flutter testing libraries. No additional testing frameworks (like `mockito` or `mocktail`) are explicitly listed as used in the current test files, although they may be required for future integration testing.

## Test Organization
Tests are located in the root `test/` directory, following standard Flutter project structure.

## Current State
- **Smoke Tests:** A single basic smoke test exists in `test/widget_test.dart`.
- **Coverage:** Coverage is currently very low, with most services and providers lacking dedicated unit tests.
- **Complexities:** 
    - Supabase integration requires robust mocking for unit tests or a dedicated test environment for integration tests.
    - Asynchronous flows in the chat and authentication services need careful handling in test scenarios.

## Patterns and Guidelines
- Future tests should aim to mock external services (Supabase, OpenAI) to ensure deterministic results.
- Unit tests should focus on the `services` and `providers` layers.
- Widget tests should be implemented for core UI components in `lib/widgets`.
