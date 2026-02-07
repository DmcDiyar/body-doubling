/**
 * SESSIZ ORTAK - MVP 1.5 E2E Test Scenarios
 *
 * These are Playwright test SKELETONS defining the critical paths.
 * Implementation requires:
 *   - playwright.config.ts with baseURL
 *   - Auth helper (login via Supabase test user)
 *   - Two browser contexts for duo tests
 *
 * Install: npm i -D @playwright/test
 * Run:     npx playwright test
 */

import { test, expect, type Page } from '@playwright/test';

// Helper: login as test user
async function loginAs(page: Page, email: string) {
  // TODO: Implement auth via Supabase test user token
  // For now, set cookie/token directly
  await page.goto('/auth');
  // await page.evaluate((token) => { localStorage.setItem('sb-token', token) }, token);
}

// ================================================================
// TEST 01: Normal Duo Match Flow
// ================================================================
test.describe('Normal Match Flow', () => {
  test('two users match and complete a session', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Login both users
    await loginAs(pageA, 'testuser_a@test.com');
    await loginAs(pageB, 'testuser_b@test.com');

    // User A: go to quick match, select 15min, click Esles
    await pageA.goto('/session/quick-match');
    await pageA.click('button:has-text("15")');
    await pageA.click('button:has-text("Eşleş")');

    // User B: same config
    await pageB.goto('/session/quick-match');
    await pageB.click('button:has-text("15")');
    await pageB.click('button:has-text("Eşleş")');

    // Both should see "Eşleşme bulundu!"
    await expect(pageA.locator('text=Eşleşme bulundu!')).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator('text=Eşleşme bulundu!')).toBeVisible({ timeout: 10000 });

    // Both redirected to /session/prepare
    await pageA.waitForURL(/\/session\/prepare/, { timeout: 10000 });
    await pageB.waitForURL(/\/session\/prepare/, { timeout: 10000 });

    // Complete ritual (wait for auto-advance through 4 steps ~80s)
    // For test speed, check final step appears
    await expect(pageA.locator('text=Başla')).toBeVisible({ timeout: 90000 });
    await pageA.click('button:has-text("Başla")');

    await expect(pageB.locator('text=Başla')).toBeVisible({ timeout: 90000 });
    await pageB.click('button:has-text("Başla")');

    // Both should be on /session/active
    await pageA.waitForURL(/\/session\/active/, { timeout: 15000 });
    await pageB.waitForURL(/\/session\/active/, { timeout: 15000 });

    // Timer should be visible
    await expect(pageA.locator('text=15 dakika')).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});

// ================================================================
// TEST 02: Partner Disconnect During Ritual
// ================================================================
test.describe('Partner Disconnect During Ritual', () => {
  test('User A sees MatchBrokenModal when User B closes tab', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await loginAs(pageA, 'testuser_a@test.com');
    await loginAs(pageB, 'testuser_b@test.com');

    // Match both users (setup code similar to test 01)
    // ...

    // User B closes tab during ritual
    await pageB.close();

    // User A should see broken modal after heartbeat timeout
    await expect(pageA.locator('text=Eşin bağlantıyı kaybetti')).toBeVisible({ timeout: 35000 });

    // Auto-requeue countdown
    await expect(pageA.locator('text=Seni yeniden eşleştiriyoruz')).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});

// ================================================================
// TEST 03: Partner Disconnect at 30s (Active Session)
// ================================================================
test.describe('Partner Disconnect at 30s', () => {
  test('User A sees soft notice and can continue solo', async ({ browser }) => {
    // Setup: both users matched and in active session
    // User B closes tab
    // Wait 30s
    // Assert: User A sees "Esin baglanti kaybetti" soft notice
    // User A clicks "Solo devam et"
    // Assert: session continues with solo mode
    test.skip(true, 'Requires full match setup + 30s wait');
  });
});

// ================================================================
// TEST 04: Partner Disconnect at 120s
// ================================================================
test.describe('Partner Disconnect at 120s', () => {
  test('User A must decide: solo or requeue', async ({ browser }) => {
    // Setup: both users matched and in active session
    // User B closes tab
    // Wait 120s
    // Assert: decision modal visible
    // User A clicks "Yeniden esles"
    // Assert: redirected to quick-match with requeue=true
    test.skip(true, 'Requires full match setup + 120s wait');
  });
});

// ================================================================
// TEST 05: Solo Mode Fallback
// ================================================================
test.describe('Solo Mode Fallback', () => {
  test('no match found → user starts solo', async ({ page }) => {
    await loginAs(page, 'testuser_a@test.com');

    await page.goto('/session/quick-match');
    await page.click('button:has-text("15")');
    await page.click('button:has-text("Eşleş")');

    // Wait for matching timeout
    await expect(page.locator('text=Şu an uygun ortak bulunamadı')).toBeVisible({ timeout: 35000 });

    // Click solo
    await page.click('button:has-text("Tek başına devam et")');

    // Should be on active session page
    await page.waitForURL(/\/session\/active/, { timeout: 10000 });
    await expect(page.locator('text=Solo')).toBeVisible();
  });
});

// ================================================================
// TEST 06: Ritual Completion Gate
// ================================================================
test.describe('Ritual Completion Gate', () => {
  test('session does not start until both users complete ritual', async ({ browser }) => {
    // Setup: match found, both on /session/prepare
    // User A completes ritual → sees "Esini bekliyoruz..."
    // User B completes ritual → both redirected to active
    test.skip(true, 'Requires two-user setup');
  });
});

// ================================================================
// TEST 07: Cooldown Skip Penalty
// ================================================================
test.describe('Cooldown Skip Penalty', () => {
  test('skipping cooldown applies trust penalty', async ({ page }) => {
    await loginAs(page, 'testuser_a@test.com');

    // Navigate directly to cooldown page with a completed session ID
    // (requires setup)
    // await page.goto('/session/cooldown?id=SESSION_ID');

    // Click "Atla"
    // await page.click('text=Atla →');

    // Assert: redirected to /session/end
    // Assert: trust_events has cooldown_skipped entry
    test.skip(true, 'Requires completed session setup');
  });
});

// ================================================================
// TEST 08: Queue Recovery After Crash
// ================================================================
test.describe('Queue Recovery', () => {
  test('user can start fresh match after previous crash', async ({ page }) => {
    await loginAs(page, 'testuser_a@test.com');

    // Previous session left user in queue
    // Navigate to quick-match
    await page.goto('/session/quick-match');

    // Should be able to select config and start matching
    await expect(page.locator('text=Hızlı Eşleşme')).toBeVisible();

    // Old queue entry should have been cleaned up by trigger
  });
});

// ================================================================
// TEST 09: 90-Minute Duration Option
// ================================================================
test.describe('90-Minute Duration', () => {
  test('user can select 90 minute session', async ({ page }) => {
    await loginAs(page, 'testuser_a@test.com');

    await page.goto('/session/quick-match');

    // 90dk option should be visible
    await expect(page.locator('text=90 dk')).toBeVisible();

    // Click it
    await page.click('button:has-text("90")');

    // Should be highlighted
    await expect(page.locator('button:has-text("90")').locator('..')).toHaveClass(/border-\[#ffcb77\]/);
  });
});
