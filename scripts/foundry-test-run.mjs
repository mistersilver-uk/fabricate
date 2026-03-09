/**
 * foundry-test-run.mjs
 *
 * Playwright smoke test that verifies Fabricate loads correctly in a live
 * Foundry VTT instance:
 *
 *   1. Opens the Foundry setup / login page.
 *   2. Logs in as admin.
 *   3. Launches the fabricate-smoke world.
 *   4. Confirms the Fabricate module is active (game.modules check via console).
 *   5. Clicks "Craft Item" in the Items sidebar.
 *   6. Asserts the Crafting App opens (checks for a landmark heading).
 *   7. Fails if any runtime console errors were captured.
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

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
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
    // ── Step 1: Navigate to setup page ──────────────────────────────────────
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-01-setup.png') });
    results.steps.push({ step: 'navigate-setup', passed: true });

    // ── Step 2: Enter admin key ──────────────────────────────────────────────
    const adminInput = page.locator('input[name="adminKey"], input[type="password"]').first();
    await adminInput.fill(ADMIN_KEY);
    await page.keyboard.press('Enter');
    await page.waitForURL(`${FOUNDRY_URL}/setup`, { timeout: 15_000 });
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-02-authenticated.png') });
    results.steps.push({ step: 'admin-auth', passed: true });

    // ── Step 3: Launch world ─────────────────────────────────────────────────
    // Click the "Launch World" button for our smoke world
    const launchBtn = page.locator(`[data-world="${WORLD_ID}"] button, button[data-action="launchWorld"]`).first();
    await launchBtn.click();
    await page.waitForURL(`${FOUNDRY_URL}/game`, { timeout: 60_000 });
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-03-world-loaded.png') });
    results.steps.push({ step: 'launch-world', passed: true });

    // Wait for Foundry canvas to be ready
    await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });

    // ── Step 4: Verify Fabricate module is active ────────────────────────────
    const fabricateActive = await page.evaluate(() => {
      return game.modules.get('fabricate')?.active === true;
    });
    if (!fabricateActive) {
      throw new Error('Fabricate module is not active in this world.');
    }
    results.steps.push({ step: 'module-active', passed: true });
    process.stdout.write('Fabricate module is active.\n');

    // ── Step 5: Click "Craft Item" in Items sidebar ──────────────────────────
    // Open the Items sidebar tab
    const itemsTab = page.locator('#sidebar-tabs [data-tab="items"], .item[data-tab="items"]');
    await itemsTab.click();
    // Wait for the Items sidebar panel to be visible before looking for Craft button
    await page.waitForSelector('#items, [data-tab="items"].active', { state: 'visible', timeout: 5_000 });

    // Click the Craft Item header button injected by Fabricate
    const craftBtn = page.locator('button[data-action="craft-item"], .craft-item-button').first();
    await craftBtn.waitFor({ state: 'visible', timeout: 5_000 });
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
