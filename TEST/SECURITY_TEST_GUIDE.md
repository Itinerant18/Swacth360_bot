# SAI Tech Support — Aggressive Security Test Suite

## Quick Start

```bash
# 1. Install dependencies
npm init -y
npm install -D @playwright/test
npx playwright install chromium

# 2. Place the test file
#    Copy sai-security-tests.spec.js into ./tests/

# 3. Create playwright.config.js
```

## playwright.config.js

```js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,  // Sequential — avoid interference
  retries: 0,
  workers: 1,            // Single worker for security tests
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    baseURL: 'https://sai.seple.in',
    headless: false,     // Watch the tests run
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    trace: 'on-first-retry',
    actionTimeout: 10000,
    navigationTimeout: 15000,
    // Ignore HTTPS errors if testing on staging
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'security-tests',
      use: { browserName: 'chromium' },
    },
  ],
});
```

## Running Tests

```bash
# Run all tests (headed — watch the browser)
npx playwright test --headed

# Run specific category
npx playwright test -g "Guest Quota"
npx playwright test -g "XSS"
npx playwright test -g "Route Guard"
npx playwright test -g "Sign Out"
npx playwright test -g "API"
npx playwright test -g "SQLi"
npx playwright test -g "WebSocket"
npx playwright test -g "Prototype"

# Run only guest tests (no login needed)
npx playwright test -g "Guest"

# Run only authenticated tests
npx playwright test -g "Authenticated|Sign Out|Edit|Concurrent"

# Generate HTML report
npx playwright show-report

# Debug mode (step-by-step)
npx playwright test --debug
```

## Test Matrix

| # | Category | Tests | Auth Required | Severity |
|---|----------|-------|---------------|----------|
| 1 | Guest Quota Bypass | 7 | No | High |
| 2 | XSS Injection | 10 | No | Critical |
| 3 | Message Spam | 2 | No | Medium |
| 4 | Input Length Abuse | 3 | No | Medium |
| 5 | Edit Duplication | 1 | Yes | Medium |
| 6 | Sign Out Alert | 2 | Yes | Low-Med |
| 7 | Route Guard Bypass | 8 | No | High |
| 8 | Session Enumeration | 4 | Both | High |
| 9 | Back Button Leak | 1 | Yes | High |
| 10 | API Discovery | 3 | Both | High |
| 11 | SQL Injection | 9 | No | Critical |
| 12 | Concurrent Session | 1 | Yes | Medium |
| 13 | WebSocket Inspection | 1 | No | Medium |
| 14 | Prototype Pollution | 2 | No | High |

## What Each Test Does

### 1. Guest Quota Bypass (HIGH)

Tests if `guest_qustion_count` in localStorage can be tampered to:

- Negative value (-9999) → unlimited messages
- NaN → quota logic breaks
- Infinity string → quota logic breaks
- Very large number → quota effectively disabled
- String value → type confusion
- Key deletion → quota reset
- Rapid reset loop → delete + resend cycle

### 2. XSS Injection (CRITICAL)

Sends 10 different XSS payloads through the chat input:

- `<script>alert()</script>`
- `<img onerror=alert()>`
- `<svg onload=alert()>`
- iframe injection
- javascript: protocol
- Filter bypass attempts

Checks if payloads execute (dialog appears) or render as raw HTML.

### 3. Message Spam (MEDIUM)

- Fires 50 messages with zero delay
- Race condition: Ctrl+Enter + button click simultaneously

### 4. Input Length Abuse (MEDIUM)

- 100,000 character message
- 10,000 zero-width characters (invisible flooding)
- Null bytes in input

### 5. Edit Duplication (MEDIUM)

Captures message count before/after edit. If count increases, edit is creating duplicates.

### 6. Sign Out Alert (LOW-MEDIUM)

Checks if sign-out shows a confirmation dialog/alert before clearing session.

### 7. Route Guard Bypass (HIGH)

Attempts direct access to 8 protected routes without authentication.

### 8. Session Enumeration (HIGH)

Dumps all localStorage and cookies, flags:

- JWT tokens in localStorage
- Non-httpOnly cookies
- Non-secure cookies
- Tampered auth tokens

### 9. Back Button Leak (HIGH)

After logout, uses browser back button to check if cached admin page is visible.

### 10. API Discovery (HIGH)

Intercepts all network requests, maps API endpoints, tries unauthenticated direct API access.

### 11. SQL Injection (CRITICAL)

Sends 9 SQLi payloads, checks for:

- Error message leakage
- Time-based blind injection (response >5s)
- Data exfiltration patterns

### 12. Concurrent Session (MEDIUM)

Logs in same user in two browser contexts, checks if session invalidation occurs.

### 13. WebSocket Inspection (MEDIUM)

Captures WebSocket connections and frames, flags insecure ws:// usage.

### 14. Prototype Pollution (HIGH)

Injects `__proto__` and role/permission keys into localStorage to check if app trusts client-side role flags.
