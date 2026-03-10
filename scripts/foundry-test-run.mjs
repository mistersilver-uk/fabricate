/**
 * foundry-test-run.mjs
 *
 * Playwright smoke test that verifies Fabricate loads correctly in a live
 * Foundry VTT instance:
 *
 *   1. Opens the Foundry setup page.
 *   2. Accepts the first-run license page if shown.
 *   3. Logs in as admin.
 *   4. Launches the fabricate-smoke world.
 *   5. Confirms the Fabricate module is active (game.modules check via console).
 *   6. Clicks "Craft Item" in the Items sidebar.
 *   7. Asserts the Crafting App opens (checks for a landmark heading).
 *   8. Fails if any runtime console errors were captured.
 *
 * Artifacts written to test-results/:
 *   summary.json          — machine-readable pass/fail + error list
 *   console.log           — full browser console output
 *   screenshot-*.png      — screenshots at key checkpoints
 *
 * Usage: node scripts/foundry-test-run.mjs
 *
 * Environment variables:
 *   FOUNDRY_ADMIN_KEY     — admin password (default: fabricate-test-admin)
 *   FOUNDRY_URL           — base URL (default: http://localhost:30000)
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESULTS_DIR = join(ROOT, 'test-results');

const FOUNDRY_URL = process.env.FOUNDRY_URL ?? 'http://localhost:30000';
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin';
const WORLD_ID = 'fabricate-smoke';

/** @type {string[]} */
const consoleErrors = [];
/** @type {string[]} */
const consoleLog = [];

/**
 * Safely parse a page pathname.
 * @param {string} rawUrl
 * @returns {string}
 */
function getPathname(rawUrl) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return '';
  }
}

/**
 * Accept first-run license if Foundry redirects to /license.
 * Safe to call on every run; no-op when license page is not present.
 * @param {import('playwright').Page} page
 * @param {{ steps: Array<Record<string, boolean | string>> }} results
 */
async function acceptLicenseIfPresent(page, results) {
  if (getPathname(page.url()) !== '/license') {
    results.steps.push({ step: 'license-check', passed: true, skipped: true });
    return;
  }

  process.stdout.write('License agreement detected. Accepting terms...\n');
  await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-01-license.png') });

  const checkboxCandidates = page.locator(
    'input[name="agree"], input[id*="agree" i], input[type="checkbox"]'
  );
  if (await checkboxCandidates.count() === 0) {
    throw new Error('License page detected, but agreement checkbox was not found.');
  }

  const checkbox = checkboxCandidates.first();
  await checkbox.waitFor({ state: 'visible', timeout: 10_000 });
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }

  const agreeButtonCandidates = page.locator(
    'button:has-text("AGREE"), button:has-text("Agree"), button:has-text("I Agree")'
  );
  if (await agreeButtonCandidates.count() === 0) {
    throw new Error('License page detected, but AGREE button was not found.');
  }

  const agreeButton = agreeButtonCandidates.first();
  await agreeButton.waitFor({ state: 'visible', timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/(setup|auth)(?:\?.*)?$/, { timeout: 20_000 }),
    agreeButton.click()
  ]);

  await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-01a-license-accepted.png') });
  results.steps.push({ step: 'license-accepted', passed: true });
}

/**
 * Enter admin key on /auth page if present.
 * After successful auth, Foundry redirects to /setup.
 * @param {import('playwright').Page} page
 * @param {{ steps: Array<Record<string, boolean | string>> }} results
 */
async function authenticateIfRequired(page, results) {
  if (getPathname(page.url()) !== '/auth') {
    return;
  }

  process.stdout.write('Admin auth page detected. Entering admin key...\n');
  const adminInput = page.locator('input[name="adminKey"], input[name="password"], input[type="password"]').first();
  await adminInput.waitFor({ state: 'visible', timeout: 10_000 });
  await adminInput.fill(ADMIN_KEY);

  const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Log In")').first();
  await Promise.all([
    page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 20_000 }),
    submitBtn.click()
  ]);

  await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-01b-auth-complete.png') });
  results.steps.push({ step: 'admin-auth-page', passed: true });
}

/**
 * Dismiss first-run overlay dialogs on the setup page:
 * telemetry consent, backup tour, etc.
 * @param {import('playwright').Page} page
 * @param {{ steps: Array<Record<string, boolean | string>> }} results
 */
async function dismissFirstRunDialogs(page, results) {
  // 1. Telemetry / usage sharing dialog
  try {
    const declineSharing = page.locator('button:has-text("Decline Sharing")');
    await declineSharing.waitFor({ state: 'visible', timeout: 10_000 });
    process.stdout.write('Telemetry dialog detected. Declining...\n');
    await declineSharing.click();
    await declineSharing.waitFor({ state: 'hidden', timeout: 5_000 });
    results.steps.push({ step: 'dismiss-telemetry', passed: true });
  } catch {
    // Not shown
  }

  // 2. Foundry tours (e.g. "Backups Overview") — dismiss via API
  try {
    await page.waitForTimeout(2_000); // Allow tours to start
    const dismissed = await page.evaluate(() => {
      if (typeof Tour !== 'undefined' && Tour.activeTour) {
        Tour.activeTour.exit();
        return true;
      }
      return false;
    });
    if (dismissed) {
      process.stdout.write('Active tour dismissed via API.\n');
      results.steps.push({ step: 'dismiss-tour', passed: true });
    }
  } catch {
    // No active tour
  }
}

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Capture all console output
  page.on('console', msg => {
    const entry = `[${msg.type()}] ${msg.text()}`;
    consoleLog.push(entry);
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    const entry = `[pageerror] ${err.message}`;
    consoleLog.push(entry);
    consoleErrors.push(`pageerror: ${err.message}`);
  });

  const results = {
    passed: false,
    steps: [],
    errors: [],
    consoleErrors: []
  };

  try {
    // ── Step 1: Navigate to setup page and handle first-run flows ──────────
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle' });
    results.steps.push({ step: 'navigate-setup', passed: true });

    // Handle first-run license page (redirects /setup → /license → /auth)
    await acceptLicenseIfPresent(page, results);

    // Handle admin auth page (/auth → /setup)
    await authenticateIfRequired(page, results);

    await page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 15_000 });

    // Dismiss first-run dialogs (telemetry, tours) that overlay the setup page
    await dismissFirstRunDialogs(page, results);

    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-02-setup-ready.png') });
    results.steps.push({ step: 'setup-ready', passed: true });

    // ── Step 2: Launch world ─────────────────────────────────────────────────
    // Navigate to the Worlds tab via JavaScript (Foundry V13 setup page)
    await page.evaluate(() => {
      // Foundry V13 uses ApplicationV2 tabs — switch to worlds tab
      const tab = document.querySelector('#setup-packages-header [data-tab="worlds"]');
      if (tab) tab.click();
    });
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-02a-worlds-tab.png') });

    // Click the Launch World button (visible on hover in Foundry V13)
    const worldCard = page.locator(`[data-package-id="${WORLD_ID}"]`);
    await worldCard.hover();
    const launchBtn = worldCard.locator('[data-action="worldLaunch"]');
    await launchBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await launchBtn.click();
    // After launch, Foundry navigates to /join (player selection) or /game
    await page.waitForURL(/\/(join|game)/, { timeout: 60_000 });
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-03-world-launching.png') });
    results.steps.push({ step: 'launch-world', passed: true });

    // If on /join, select Gamemaster and join the session
    if (getPathname(page.url()) === '/join') {
      process.stdout.write('Join page detected. Joining as Gamemaster...\n');

      // Select the Gamemaster user — try select element first, then Foundry V13 widgets
      const selectEl = page.locator('select[name="userid"]');
      if (await selectEl.count() > 0) {
        await selectEl.selectOption({ label: 'Gamemaster' });
      } else {
        // Foundry V13 may use a custom user picker — select via API
        await page.evaluate(() => {
          const gm = document.querySelector('[data-user-id]');
          if (gm) gm.click();
        });
      }

      // Click the Join Game Session button
      const joinBtn = page.locator('button:has-text("Join Game Session"), button[name="join"], button[type="submit"]').first();
      await joinBtn.waitFor({ state: 'visible', timeout: 10_000 });

      await Promise.all([
        page.waitForURL(/\/game/, { timeout: 60_000, waitUntil: 'load' }),
        joinBtn.click()
      ]);
      results.steps.push({ step: 'join-session', passed: true });
    }

    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-03-world-loaded.png') });

    // Wait for Foundry canvas to be ready
    await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });

    // ── Step 3: Verify/activate Fabricate module ─────────────────────────────
    const fabricateActive = await page.evaluate(() => {
      return game.modules.get('fabricate')?.active === true;
    });

    if (!fabricateActive) {
      process.stdout.write('Fabricate module not active. Activating via Module Management...\n');
      // Enable the module through Foundry's settings API, then reload
      await page.evaluate(async () => {
        const moduleSettings = game.settings.get('core', 'moduleConfiguration') || {};
        moduleSettings['fabricate'] = true;
        await game.settings.set('core', 'moduleConfiguration', moduleSettings);
      });
      // Reload the page to apply module activation
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      // Re-join if redirected to /join
      if (getPathname(page.url()) === '/join') {
        const joinBtn = page.locator('button:has-text("Join Game Session"), button[name="join"], button[type="submit"]').first();
        await joinBtn.waitFor({ state: 'visible', timeout: 10_000 });
        await Promise.all([
          page.waitForURL(/\/game/, { timeout: 60_000, waitUntil: 'load' }),
          joinBtn.click()
        ]);
      }
      await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });

      const nowActive = await page.evaluate(() => game.modules.get('fabricate')?.active === true);
      if (!nowActive) {
        throw new Error('Fabricate module could not be activated.');
      }
      results.steps.push({ step: 'module-activated', passed: true });
      process.stdout.write('Fabricate module activated and loaded.\n');
    } else {
      results.steps.push({ step: 'module-active', passed: true });
      process.stdout.write('Fabricate module is active.\n');
    }

    // ── Step 5: Click "Craft Item" button injected by Fabricate ───────────────
    // Open the Items sidebar tab first (the Craft button is in its header)
    const itemsTab = page.locator('[data-tab="items"]').first();
    await itemsTab.click();
    await page.waitForTimeout(1_000);

    const craftBtn = page.locator('[data-fabricate-action="craft"], button:has-text("Craft Item")').first();
    await craftBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await craftBtn.click();
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-04-crafting-app.png') });
    results.steps.push({ step: 'open-crafting-app', passed: true });

    // ── Step 6: Assert Crafting App is open ─────────────────────────────────
    // Fabricate's CraftingApp renders with a recognisable heading
    const appHeading = page.locator('.crafting-app, [data-appid] .window-title:has-text("Craft")').first();
    await appHeading.waitFor({ state: 'visible', timeout: 10_000 });
    results.steps.push({ step: 'crafting-app-visible', passed: true });
    process.stdout.write('Crafting App opened successfully.\n');

    // ── Step 7: Check for runtime errors ────────────────────────────────────
    if (consoleErrors.length > 0) {
      results.errors = consoleErrors;
      throw new Error(`${consoleErrors.length} runtime console error(s) captured.`);
    }

    results.passed = true;
    process.stdout.write('Smoke test PASSED.\n');
  } catch (err) {
    results.passed = false;
    results.errors.push(err.message);
    process.stderr.write(`Smoke test FAILED: ${err.message}\n`);

    // Capture failure screenshot
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-failure.png') }).catch(() => {});
  } finally {
    results.consoleErrors = consoleErrors;
    await browser.close();

    // Write summary.json
    await writeFile(
      join(RESULTS_DIR, 'summary.json'),
      JSON.stringify(results, null, 2)
    );

    // Write console log
    await writeFile(
      join(RESULTS_DIR, 'console.log'),
      consoleLog.join('\n')
    );

    process.stdout.write(`Results written to test-results/\n`);
  }

  if (!results.passed) {
    process.exit(1);
  }
}

main().catch(err => {
  process.stderr.write(`foundry-test-run fatal error: ${err.message}\n`);
  process.exit(1);
});
