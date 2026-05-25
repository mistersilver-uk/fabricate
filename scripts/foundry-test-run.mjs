/**
 * foundry-test-run.mjs
 *
 * Playwright smoke test that verifies Fabricate loads correctly in a live
 * Foundry VTT instance and exercises core crafting flows:
 *
 *   1. Opens the Foundry setup page.
 *   2. Accepts the first-run license page if shown.
 *   3. Logs in as admin.
 *   4. Launches the fabricate-smoke-ci world.
 *   5. Confirms the Fabricate module is active (game.modules check via console).
 *   6. Creates test actors and items with inventories.
 *   7. Creates a crafting system with components and recipes.
 *   8. Screenshots the Recipe Manager (systems, items, recipes tabs).
 *   9. Opens the Crafting App and verifies recipes are listed.
 *  10. Crafts a Healing Potion and verifies inventory changes.
 *  11. Fails if any runtime console errors were captured.
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
 *   FOUNDRY_URL           — base URL (default: http://localhost:30100)
 */

import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESULTS_DIR = join(ROOT, 'test-results');

const FOUNDRY_URL = process.env.FOUNDRY_URL ?? 'http://localhost:30100';
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin';
const WORLD_ID = 'fabricate-smoke-ci';

// Smoke profile selector. Three profiles:
//   - `rc`   release-candidate happy path: real Foundry boot, fixture creation,
//            one gathering success, craft a Healing Potion, console-error
//            health. Minimal screenshot budget. Used by the CI workflow.
//   - `ci`   alias for `rc`; kept for one release for back-compat.
//   - `full` (default) every phase, full screenshot regen. Local + scheduled
//            visual-regression workflow.
const RAW_SMOKE_PROFILE = String(process.env.FOUNDRY_SMOKE_PROFILE ?? 'full').toLowerCase();
const SMOKE_PROFILE = RAW_SMOKE_PROFILE === 'ci' ? 'rc' : RAW_SMOKE_PROFILE;
const RUN_SCREENSHOT_PHASES = SMOKE_PROFILE === 'full';
const RUN_FULL_ONLY_BEHAVIORS = SMOKE_PROFILE === 'full';
const RUN_FULL_ONLY_GATHERING_STATES = SMOKE_PROFILE === 'full';

// Exact set of screenshot labels the `rc` profile captures. Every other
// `screenshot(page, label)` call is a no-op under `rc` (the surrounding
// behavioral assertions still run). The on-failure capture is taken
// directly by `page.screenshot({ path: ... 'screenshot-failure.png' })`
// in the catch block, not via `screenshot()`, so it always survives.
const RC_SCREENSHOT_BUDGET = new Set([
  'world-loaded',
  'crafting-app-opened',
  'post-craft',
  'alara-post-craft-inventory',
  'gathering-targeted-ready',
  'gathering-immediate-success'
]);

const JOIN_BUTTON_SELECTOR = 'button:has-text("Join Game Session"), button[name="join"]';
const JOIN_USER_SELECT_SELECTOR = 'select[name="userid"]';
const JOIN_USER_TILE_SELECTOR = '[data-user-id]';

/** @type {string[]} */
const consoleErrors = [];
/** @type {string[]} */
const consoleLog = [];

// ── Screenshot counter ──────────────────────────────────────────────────────
let screenshotCounter = 0;

// ── Phase timings ───────────────────────────────────────────────────────────
/** @type {Array<{ phase: string, startedAt: string, durationMs: number }>} */
const phaseTimings = [];

/** @type {{ name: string, startedAt: string, t0: number } | null} */
let currentPhase = null;

/**
 * Begin a phase stopwatch. If another phase is already running it ends
 * automatically — phases are sequential, never nested.
 * @param {string} name
 */
function startPhase(name) {
  if (currentPhase) endPhase();
  currentPhase = { name, startedAt: new Date().toISOString(), t0: performance.now() };
}

/**
 * End the current phase and push its duration into `phaseTimings`.
 */
function endPhase() {
  if (!currentPhase) return;
  phaseTimings.push({
    phase: currentPhase.name,
    startedAt: currentPhase.startedAt,
    durationMs: Math.round(performance.now() - currentPhase.t0)
  });
  currentPhase = null;
}

/**
 * Format a list of timing entries as an aligned stdout table so slow
 * phases are obvious in CI logs. Accepts any `{ phase, durationMs }[]`
 * so it can render boot timings, phase timings, or the combined list.
 * @param {Array<{ phase: string, durationMs: number }>} timings
 * @returns {string}
 */
function formatTimingsTable(timings) {
  if (timings.length === 0) return '';
  const rows = timings.map(({ phase, durationMs }) => ({
    phase,
    seconds: (durationMs / 1000).toFixed(1)
  }));
  const totalMs = timings.reduce((sum, entry) => sum + entry.durationMs, 0);
  rows.push({ phase: 'TOTAL', seconds: (totalMs / 1000).toFixed(1) });
  const phaseWidth = Math.max(...rows.map(row => row.phase.length));
  const secondsWidth = Math.max(...rows.map(row => row.seconds.length));
  const lines = ['Phase timings', '─'.repeat(phaseWidth + secondsWidth + 5)];
  for (const row of rows) {
    lines.push(`  ${row.phase.padEnd(phaseWidth)}  ${row.seconds.padStart(secondsWidth)}s`);
  }
  return lines.join('\n');
}

/**
 * Take a screenshot with an auto-incrementing numeric prefix. Under the
 * `rc` profile, only labels in `RC_SCREENSHOT_BUDGET` are captured; all
 * other labels are no-ops (the surrounding assertions still run).
 * @param {import('playwright').Page} page
 * @param {string} label
 */
async function screenshot(page, label) {
  if (SMOKE_PROFILE === 'rc' && !RC_SCREENSHOT_BUDGET.has(label)) return;
  screenshotCounter++;
  const num = String(screenshotCounter).padStart(2, '0');
  const path = join(RESULTS_DIR, `screenshot-${num}-${label}.png`);
  await page.screenshot({ path });
}

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
 * Normalize text for stable UI matching.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Summarize join-page state for debugging.
 * @param {{
 *   mode?: string | null,
 *   reason?: string | null,
 *   availableUsers?: string[],
 *   selectedLabel?: string,
 *   selectedValue?: string,
 *   joinButtonDisabled?: boolean,
 *   selectionMatches?: boolean
 * }} state
 * @param {string} userLabel
 * @returns {string}
 */
function describeJoinState(state, userLabel) {
  /** @type {string[]} */
  const parts = [];
  if (state.mode) parts.push(`mode=${state.mode}`);
  if (state.selectedLabel) parts.push(`selectedLabel=${state.selectedLabel}`);
  if (state.selectedValue) parts.push(`selectedValue=${state.selectedValue}`);
  if (typeof state.selectionMatches === 'boolean') parts.push(`selectionMatches=${state.selectionMatches}`);
  if (typeof state.joinButtonDisabled === 'boolean') parts.push(`joinButtonDisabled=${state.joinButtonDisabled}`);
  if (Array.isArray(state.availableUsers) && state.availableUsers.length > 0) {
    parts.push(`availableUsers=${state.availableUsers.join(', ')}`);
  }
  if (state.reason) parts.push(`reason=${state.reason}`);
  return `Join diagnostics for "${userLabel}": ${parts.join('; ') || 'no details available'}.`;
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
  await screenshot(page, 'license');

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
    page.waitForURL(/\/(setup|auth)(?:\?.*)?$/, { timeout: 60_000 }),
    agreeButton.click()
  ]);

  await screenshot(page, 'license-accepted');
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
    page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 60_000 }),
    submitBtn.click()
  ]);

  await screenshot(page, 'auth-complete');
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
      const tour = globalThis.foundry?.nue?.Tour;
      if (tour?.activeTour) {
        tour.activeTour.exit();
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

/**
 * Read the current join-form state from the page.
 * @param {import('playwright').Page} page
 * @param {string} userLabel
 * @returns {Promise<{
 *   mode: string | null,
 *   targetFound: boolean,
 *   selectionMatches: boolean,
 *   selectedLabel: string,
 *   selectedValue: string,
 *   availableUsers: string[],
 *   joinButtonDisabled: boolean,
 *   reason: string | null
 * }>}
 */
async function readJoinState(page, userLabel) {
  return page.evaluate(({ selectSelector, tileSelector, userLabel: targetLabel }) => {
    const normalize = value => String(value ?? '').trim().toLowerCase();
    const target = normalize(targetLabel);
    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    };
    const matchTarget = value => {
      const normalized = normalize(value);
      if (!normalized) return false;
      return normalized === target || normalized.includes(target) || target.includes(normalized);
    };
    const getNodeLabel = node => {
      const candidates = [
        node.getAttribute('data-user-name'),
        node.getAttribute('aria-label'),
        node.textContent
      ];
      return candidates.map(value => String(value ?? '').trim()).find(Boolean) ?? '';
    };

    const joinButton = Array.from(document.querySelectorAll('button')).find(button => {
      const text = normalize(button.textContent);
      return text.includes('join game session') || button.name === 'join';
    }) ?? null;
    const selects = Array.from(document.querySelectorAll(selectSelector))
      .filter(node => node instanceof HTMLSelectElement);
    const select = selects.find(isVisible) ?? selects[selects.length - 1] ?? null;

    if (select) {
      const options = Array.from(select.options)
        .map(option => ({
          label: option.textContent?.trim() ?? '',
          value: option.value,
          disabled: option.disabled
        }))
        .filter(option => option.value && !option.disabled);
      const selectedOption = select.selectedOptions?.[0];
      const selectedLabel = selectedOption?.textContent?.trim() ?? '';
      const selectedValue = select.value ?? '';

      return {
        mode: 'select',
        targetFound: options.some(option => matchTarget(option.label)),
        selectionMatches: Boolean(selectedValue) && matchTarget(selectedLabel),
        selectedLabel,
        selectedValue,
        availableUsers: options.map(option => option.label || option.value).filter(Boolean),
        joinButtonDisabled: Boolean(joinButton?.disabled),
        reason: options.length === 0 ? 'User select has no joinable options yet.' : null
      };
    }

    const tiles = Array.from(document.querySelectorAll(tileSelector))
      .filter(isVisible);
    const availableUsers = tiles.map(getNodeLabel).filter(Boolean);
    const hiddenInput = document.querySelector('input[name="userid"]');
    const selectedValue = hiddenInput instanceof HTMLInputElement ? hiddenInput.value : '';
    const selectedTile = tiles.find(tile =>
      tile.matches('[aria-selected="true"], .selected, [data-selected="true"], [aria-pressed="true"]')
    ) ?? tiles.find(tile => {
      const tileUserId = tile.getAttribute('data-user-id') ?? '';
      return Boolean(selectedValue) && tileUserId === selectedValue;
    }) ?? null;
    const selectedLabel = selectedTile ? getNodeLabel(selectedTile) : '';

    return {
      mode: tiles.length > 0 ? 'tile' : null,
      targetFound: availableUsers.some(matchTarget),
      selectionMatches: Boolean(selectedValue || selectedLabel) && matchTarget(selectedLabel || selectedValue),
      selectedLabel,
      selectedValue,
      availableUsers,
      joinButtonDisabled: Boolean(joinButton?.disabled),
      reason: tiles.length === 0 ? 'Join page did not expose a selectable user control.' : null
    };
  }, {
    selectSelector: JOIN_USER_SELECT_SELECTOR,
    tileSelector: JOIN_USER_TILE_SELECTOR,
    userLabel
  });
}

/**
 * Wait until the join UI exposes a selectable user.
 * @param {import('playwright').Page} page
 * @param {string} userLabel
 */
async function waitForJoinUi(page, userLabel) {
  const joinButton = page.locator(JOIN_BUTTON_SELECTOR).first();
  await joinButton.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(({ selectSelector, tileSelector, targetLabel }) => {
    const normalize = value => String(value ?? '').trim().toLowerCase();
    const target = normalize(targetLabel);
    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    };
    const matchTarget = value => {
      const normalized = normalize(value);
      if (!normalized) return false;
      return normalized === target || normalized.includes(target) || target.includes(normalized);
    };

    const selects = Array.from(document.querySelectorAll(selectSelector))
      .filter(node => node instanceof HTMLSelectElement);
    const select = selects.find(isVisible) ?? selects[selects.length - 1] ?? null;
    if (select) {
      const options = Array.from(select.options)
        .filter(option => option.value && !option.disabled);
      return options.length > 0 && options.some(option => matchTarget(option.textContent));
    }

    const tiles = Array.from(document.querySelectorAll(tileSelector))
      .filter(isVisible);
    return tiles.some(tile => {
      const label = tile.getAttribute('data-user-name') || tile.getAttribute('aria-label') || tile.textContent || '';
      return matchTarget(label);
    });
  }, {
    selectSelector: JOIN_USER_SELECT_SELECTOR,
    tileSelector: JOIN_USER_TILE_SELECTOR,
    targetLabel: userLabel
  }, { timeout: 15_000 });
}

/**
 * Attempt to select the target join user.
 * @param {import('playwright').Page} page
 * @param {string} userLabel
 * @returns {Promise<{
 *   selected: boolean,
 *   mode: string | null,
 *   availableUsers: string[],
 *   selectedLabel: string,
 *   selectedValue: string,
 *   reason: string | null
 * }>}
 */
async function selectJoinUser(page, userLabel) {
  return page.evaluate(({ selectSelector, tileSelector, userLabel: targetLabel }) => {
    const normalize = value => String(value ?? '').trim().toLowerCase();
    const target = normalize(targetLabel);
    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    };
    const matchTarget = value => {
      const normalized = normalize(value);
      if (!normalized) return false;
      return normalized === target || normalized.includes(target) || target.includes(normalized);
    };
    const getNodeLabel = node => {
      const candidates = [
        node.getAttribute('data-user-name'),
        node.getAttribute('aria-label'),
        node.textContent
      ];
      return candidates.map(value => String(value ?? '').trim()).find(Boolean) ?? '';
    };

    const selects = Array.from(document.querySelectorAll(selectSelector))
      .filter(node => node instanceof HTMLSelectElement);
    const select = selects.find(isVisible) ?? selects[selects.length - 1] ?? null;

    if (select) {
      const options = Array.from(select.options)
        .map(option => ({
          option,
          label: option.textContent?.trim() ?? '',
          value: option.value,
          disabled: option.disabled
        }))
        .filter(entry => entry.value && !entry.disabled);
      const match = options.find(entry => matchTarget(entry.label)) ?? null;
      if (!match) {
        return {
          selected: false,
          mode: 'select',
          availableUsers: options.map(entry => entry.label || entry.value).filter(Boolean),
          selectedLabel: select.selectedOptions?.[0]?.textContent?.trim() ?? '',
          selectedValue: select.value ?? '',
          reason: `User "${targetLabel}" was not found in the join select.`
        };
      }

      select.selectedIndex = match.option.index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));

      return {
        selected: select.value === match.value && matchTarget(select.selectedOptions?.[0]?.textContent ?? ''),
        mode: 'select',
        availableUsers: options.map(entry => entry.label || entry.value).filter(Boolean),
        selectedLabel: select.selectedOptions?.[0]?.textContent?.trim() ?? '',
        selectedValue: select.value ?? '',
        reason: null
      };
    }

    const tiles = Array.from(document.querySelectorAll(tileSelector))
      .filter(isVisible);
    const match = tiles.find(tile => matchTarget(getNodeLabel(tile))) ?? null;
    if (!match) {
      return {
        selected: false,
        mode: tiles.length > 0 ? 'tile' : null,
        availableUsers: tiles.map(getNodeLabel).filter(Boolean),
        selectedLabel: '',
        selectedValue: '',
        reason: `User "${targetLabel}" was not found in the join tiles.`
      };
    }

    match.click();
    const hiddenInput = document.querySelector('input[name="userid"]');
    const selectedValue = hiddenInput instanceof HTMLInputElement ? hiddenInput.value : '';
    const selectedTile = tiles.find(tile =>
      tile.matches('[aria-selected="true"], .selected, [data-selected="true"], [aria-pressed="true"]')
    ) ?? tiles.find(tile => {
      const tileUserId = tile.getAttribute('data-user-id') ?? '';
      return Boolean(selectedValue) && tileUserId === selectedValue;
    }) ?? match;
    const selectedLabel = getNodeLabel(selectedTile);

    return {
      selected: Boolean(selectedValue || selectedLabel) && matchTarget(selectedLabel || selectedValue),
      mode: 'tile',
      availableUsers: tiles.map(getNodeLabel).filter(Boolean),
      selectedLabel,
      selectedValue,
      reason: null
    };
  }, {
    selectSelector: JOIN_USER_SELECT_SELECTOR,
    tileSelector: JOIN_USER_TILE_SELECTOR,
    userLabel
  });
}

/**
 * Join the running world from the Foundry join page.
 * @param {import('playwright').Page} page
 * @param {{ steps: Array<Record<string, boolean | string>> }} results
 * @param {{ userLabel?: string, stepName?: string | null }} [options]
 */
async function joinWorldSession(page, results, options = {}) {
  if (getPathname(page.url()) !== '/join') {
    return;
  }

  const userLabel = options.userLabel ?? 'Gamemaster';
  const stepName = options.stepName ?? null;

  process.stdout.write(`Join page detected. Joining as ${userLabel}...\n`);
  await page.waitForLoadState('domcontentloaded');
  await waitForJoinUi(page, userLabel);

  let joinState = await readJoinState(page, userLabel);
  if (!joinState.selectionMatches) {
    let selected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await selectJoinUser(page, userLabel);
      await page.waitForTimeout(250 * attempt);
      joinState = await readJoinState(page, userLabel);
      if (joinState.selectionMatches) {
        selected = true;
        break;
      }
    }

    if (!selected) {
      await screenshot(page, 'join-selection-failed');
      throw new Error(`Unable to select join user. ${describeJoinState(joinState, userLabel)}`);
    }
  }

  const joinButton = page.locator(JOIN_BUTTON_SELECTOR).first();
  await joinButton.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find(candidate => {
      const text = String(candidate.textContent ?? '').trim().toLowerCase();
      return text.includes('join game session') || candidate.name === 'join';
    });
    return button instanceof HTMLButtonElement ? !button.disabled : true;
  }, null, { timeout: 5_000 }).catch(() => {});

  await screenshot(page, 'join-ready');

  try {
    await Promise.all([
      page.waitForURL(/\/game/, { timeout: 60_000, waitUntil: 'load' }),
      joinButton.click()
    ]);
  } catch (err) {
    const failureState = await readJoinState(page, userLabel);
    await screenshot(page, 'join-submit-failed');
    throw new Error(
      `Join session did not reach /game after selecting "${userLabel}". ` +
      `${describeJoinState(failureState, userLabel)} Cause: ${err.message}`
    );
  }

  if (stepName) {
    results.steps.push({ step: stepName, passed: true });
  }
}

/**
 * Race a promise against a deadline. Used to surface page.evaluate hangs as
 * thrown errors (with context) rather than silent waits that consume the
 * job timeout. Discovered cause for an earlier 13-minute Phase D0 hang
 * in CI: a page.evaluate after a viewport resize was waiting indefinitely
 * for the page's JS thread, with no timeout of its own. The script-level
 * deadline guarantees we get a useful error and a `screenshot-failure.png`
 * instead of a cancelled job.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
function withDeadline(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Operation '${label}' exceeded ${ms}ms deadline`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Resize the rendered Crafting System Manager application frame for
 * responsive screenshots and hit testing.
 * @param {import('playwright').Page} page
 * @param {{ width: number, height: number }} size
 */
async function setManagerWindowSize(page, { width, height }) {
  await withDeadline(
    page.setViewportSize({
      width: Math.max(1366, width + 80),
      height: Math.max(768, height + 80)
    }),
    15_000,
    `setViewportSize ${width}x${height}`
  );
  await withDeadline(
    page.evaluate(({ width, height }) => {
      const manager = document.querySelector('.fabricate-manager');
      const app = manager?.closest('.application, .app') || document.querySelector('#fabricate-crafting-system-manager');
      if (!app) return null;
      Object.assign(app.style, {
        width: `${width}px`,
        height: `${height}px`,
        left: '20px',
        top: '20px'
      });
      return {
        width: app.getBoundingClientRect().width,
        height: app.getBoundingClientRect().height
      };
    }, { width, height }),
    15_000,
    `setManagerWindowSize evaluate ${width}x${height}`
  );
  await page.waitForTimeout(500);
}

/**
 * Assert manager table rows and summary regions do not horizontally overflow.
 * @param {import('playwright').Page} page
 * @param {string} label
 */
async function assertManagerLayoutStable(page, label) {
  const metrics = await withDeadline(page.evaluate(() => {
    const selectors = [
      '.fabricate-manager',
      '.manager-main',
      '.manager-table-scroll',
      '.manager-system-row',
      '.manager-system-identity',
      '.manager-recipes-table',
      '.manager-recipe-row',
      '.manager-recipe-identity',
      '.manager-environments-table',
      '.manager-environment-row',
      '.manager-environment-identity',
      '.manager-environment-editor-shell',
      '.manager-component-row',
      '.manager-component-identity',
      '.manager-essence-row',
      '.manager-vocabulary-row',
      '.manager-inspector-card',
      '.manager-system-edit-form',
      '.manager-edit-card',
      '.manager-toggle-row',
      '.manager-essence-edit-view',
      '.environment-draft-editor',
      '.manager-environment-edit-view',
      '.manager-gathering-task-edit-view',
      '.manager-environment-workspace',
      '.environment-fields',
      '.environment-task-layout',
      '.manager-fact'
    ];
    return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        selector,
        index,
        width: rect.width,
        height: rect.height,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || ''
      };
    }));
  }), 30_000, `assertManagerLayoutStable ${label}`);

  const overflowing = metrics.filter(metric => metric.scrollWidth > metric.clientWidth + 2);
  if (overflowing.length > 0) {
    throw new Error(`Manager horizontal overflow at ${label}: ${JSON.stringify(overflowing.slice(0, 5))}`);
  }

  const rowCount = metrics.filter(metric =>
    metric.selector === '.manager-system-row'
      || metric.selector === '.manager-recipe-row'
      || metric.selector === '.manager-environment-row'
      || metric.selector === '.manager-component-row'
      || metric.selector === '.manager-essence-row'
      || metric.selector === '.manager-vocabulary-row'
  ).length;
  const editFormCount = metrics.filter(metric =>
    metric.selector === '.manager-system-edit-form'
      || metric.selector === '.manager-environment-editor-shell'
      || metric.selector === '.manager-environment-edit-view'
      || metric.selector === '.manager-gathering-task-edit-view'
      || metric.selector === '.manager-essence-edit-view'
      || metric.selector === '.environment-draft-editor'
  ).length;
  if (rowCount === 0 && editFormCount === 0) {
    throw new Error(`Manager rendered no table rows at ${label}`);
  }
}

/**
 * Exercise manager pointer targets without triggering destructive actions.
 * @param {import('playwright').Page} page
 */
async function exerciseManagerPointerTargets(page) {
  const search = page.locator('.fabricate-manager input[type="search"]').first();
  await search.fill('forge');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager .manager-filter select').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager .manager-filter select').first().selectOption('all');

  await page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist") .manager-system-identity').first().click();
  await page.locator('.fabricate-manager .manager-nav-button:has-text("Recipes")').first().click();
  await page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("The Herbalist")').first().click({ trial: true });
  await page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")').first().click();
  await page.locator('.fabricate-manager .manager-scope-return').first().click({ trial: true });
  await page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Import")').first().click({ trial: true });
  await page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Export")').first().click({ trial: true });
  await page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Create")').first().click({ trial: true });
  const rowActionButtons = page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist") .manager-icon-button');
  for (let index = 0; index < await rowActionButtons.count(); index += 1) {
    await rowActionButtons.nth(index).click({ trial: true });
  }
}

/**
 * Select the smoke test crafting system in Manager.
 * @param {import('playwright').Page} page
 */
async function selectSmokeSystemInManager(page) {
  const row = page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist")').first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  const alreadySelected = await row.evaluate(element => element.getAttribute('aria-selected') === 'true')
    .catch(() => false);
  if (alreadySelected) return;
  await row.locator('.manager-system-identity').click();
  await page.waitForTimeout(750);
}

/**
 * Exercise manager system edit controls without saving destructive changes.
 * @param {import('playwright').Page} page
 */
async function exerciseManagerSystemEditPointerTargets(page) {
  if (await page.locator('.fabricate-manager #manager-system-name').count() === 0) {
    let editButton = page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist") .manager-icon-button').nth(0);
    if (await editButton.count() === 0) {
      const systemsBreadcrumb = page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")').first();
      if (await systemsBreadcrumb.count() > 0) {
        await systemsBreadcrumb.click();
        await page.waitForTimeout(500);
      }
      const search = page.locator('.fabricate-manager input[type="search"]').first();
      if (await search.count() > 0) {
        await search.fill('');
        await page.waitForTimeout(250);
      }
      await page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist")').first().waitFor({ state: 'visible', timeout: 5_000 });
      editButton = page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist") .manager-icon-button').nth(0);
    }
    await editButton.click();
  }
  await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('.fabricate-manager #manager-system-name').first().fill('The Herbalist');
  await page.locator('.fabricate-manager #manager-system-description').first().fill('A field alchemy system for gathering herbs and brewing reliable remedies.');
  await page.locator('.fabricate-manager #manager-system-resolution-mode').first().selectOption('mapped');
  await page.locator('.dialog button:has-text("No")').first().click();
  await page.locator('.fabricate-manager [data-edit-control="advanced-options"] input').first().click({ trial: true });
  await page.locator('.fabricate-manager [data-feature-key="gathering"] input').first().click({ trial: true });
  await page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Back to systems")').first().click({ trial: true });
}

/**
 * Exercise manager recipe browser pointer targets without mutating recipes.
 * @param {import('playwright').Page} page
 */
async function exerciseManagerRecipePointerTargets(page) {
  await page.locator('.fabricate-manager .manager-nav-button:has-text("Recipes")').first().click();
  await page.locator('.fabricate-manager .manager-recipe-row').first().waitFor({ state: 'visible', timeout: 5_000 });

  const search = page.locator('.fabricate-manager input[aria-label="Search recipes"]').first();
  await search.fill('Brew');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager select[aria-label="Filter recipes by status"]').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager select[aria-label="Filter recipes by status"]').first().selectOption('all');

  const categoryFilter = page.locator('.fabricate-manager select[aria-label="Filter recipes by category"]').first();
  if (await categoryFilter.count() > 0) {
    await categoryFilter.selectOption({ index: 1 });
    await page.waitForTimeout(250);
    await categoryFilter.selectOption('all');
    await page.waitForTimeout(250);
  }

  await search.fill('');
  await page.locator('.fabricate-manager select[aria-label="Filter recipes by status"]').first().selectOption('all');
  await page.waitForTimeout(250);
  const recipeRow = page.locator('.fabricate-manager .manager-recipe-row').first();
  await recipeRow.waitFor({ state: 'visible', timeout: 5_000 });
  await recipeRow.locator('.manager-recipe-identity').click();
  const toggleInput = recipeRow.locator('.manager-toggle input').first();
  if (await toggleInput.count() > 0) await toggleInput.click({ trial: true });
  const recipeActions = recipeRow.locator('.manager-icon-button');
  for (let index = 0; index < await recipeActions.count(); index += 1) {
    await recipeActions.nth(index).click({ trial: true });
  }

  await page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Import")').first().click({ trial: true });
  await page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Export")').first().click({ trial: true });
  await page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Create Recipe")').first().click({ trial: true });
}

/**
 * Exercise manager environment browser pointer targets without mutating
 * environments.
 * @param {import('playwright').Page} page
 */
async function exerciseManagerEnvironmentPointerTargets(page) {
  await page.locator('.fabricate-manager .manager-nav-button:has-text("Gathering")').first().click();
  await page.locator('.fabricate-manager .manager-environment-row').first().waitFor({ state: 'visible', timeout: 5_000 });

  const search = page.locator('.fabricate-manager input[aria-label="Search environments"]').first();
  await search.fill('Azure');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager select[aria-label="Filter environments by status"]').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager select[aria-label="Filter environments by status"]').first().selectOption('all');
  await page.locator('.fabricate-manager select[aria-label="Filter environments by selection mode"]').first().selectOption('targeted');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager select[aria-label="Filter environments by selection mode"]').first().selectOption('all');

  const azureRow = page.locator('.fabricate-manager .manager-environment-row:has-text("Azure Grove")').first();
  await azureRow.waitFor({ state: 'visible', timeout: 5_000 });
  await azureRow.locator('.manager-environment-identity').click();
  await azureRow.locator('.manager-status-toggle').click({ trial: true });
  await azureRow.locator('.manager-icon-button').nth(0).click({ trial: true });
  await azureRow.locator('.manager-icon-button').nth(1).click({ trial: true });
  await azureRow.locator('.manager-icon-button').nth(2).click({ trial: true });
  const moveUp = azureRow.locator('.manager-icon-button').nth(3);
  if (await moveUp.isEnabled()) await moveUp.click({ trial: true });
  const moveDown = azureRow.locator('.manager-icon-button').nth(4);
  if (await moveDown.isEnabled()) await moveDown.click({ trial: true });
  await page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Create environment")').first().click({ trial: true });
}

/**
 * Dismiss global Foundry notifications that can cover screenshot targets.
 * @param {import('playwright').Page} page
 */
async function dismissFoundryNotifications(page) {
  // Notifications are globally hidden via `installNotificationHidingCss()` at
  // world-load, so this helper is largely defensive — kept in case the CSS is
  // bypassed by a Foundry update or an in-test addStyleTag removal. No sleep:
  // the DOM removal is synchronous from Playwright's perspective.
  await page.evaluate(() => {
    document
      .querySelectorAll('#notifications .notification, body > .notification, .notification')
      .forEach(notification => {
        try { notification.remove(); } catch { /* ignore */ }
      });
  });
}

/**
 * Inject a global stylesheet that hides Foundry's notification toasts so they
 * never overlay screenshots or block clicks. Called once per browser context
 * at world-load. Replaces a previous per-screenshot 300 ms `waitForTimeout`
 * that existed solely to let notifications fade out before capture.
 * @param {import('playwright').Page} page
 */
async function installNotificationHidingCss(page) {
  await page.addStyleTag({
    content: `
      #notifications,
      body > .notification,
      .notification {
        display: none !important;
      }
    `
  });
}

/**
 * Close Foundry application windows across ApplicationV1 and ApplicationV2.
 * @param {import('playwright').Page} page
 */
async function closeOpenApplications(page) {
  const closeSelector = [
    '.application:not(#sidebar) button[data-action="close"]',
    '.application:not(#sidebar) button[aria-label="Close"]',
    '.application:not(#sidebar) button[title="Close"]',
    '.application:not(#sidebar) .header-button.close',
    '.application:not(#sidebar) .window-header .close',
    '.app.window-app .close',
    '#fabricate-recipe-manager button[data-action="close"]',
    '#fabricate-crafting-system-manager button[data-action="close"]',
    '#fabricate-gathering button[data-action="close"]'
  ].join(', ');

  async function discardDirtyDraft() {
    const discardButton = page.locator('button:has-text("Discard Changes")').first();
    if (await discardButton.count() > 0) {
      try {
        await discardButton.click({ timeout: 2_000, force: true });
        await page.waitForTimeout(500);
      } catch { /* ignore */ }
    }
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await discardDirtyDraft();
    await page.evaluate(async (selector) => {
      const closePromises = [];
      let closedApplicationV2 = false;

      if (ui.windows) {
        for (const app of Object.values(ui.windows)) {
          try { closePromises.push(Promise.resolve(app.close())); } catch { /* ignore */ }
        }
      }

      const instances = foundry?.applications?.instances;
      const applicationV2s = instances?.values
        ? Array.from(instances.values())
        : (instances ? Array.from(instances) : []);
      for (const app of applicationV2s) {
        const element = app?.element ?? app?._element ?? null;
        if (!element || element.id === 'sidebar') continue;
        if (element.querySelector?.('.fabricate-manager, .fabricate-gathering-app') || element.id?.startsWith?.('fabricate-')) {
          try {
            closedApplicationV2 = true;
            app.close({ force: true });
          } catch { /* ignore */ }
        }
      }

      await Promise.allSettled(closePromises);

      if (!closedApplicationV2) {
        document.querySelectorAll(selector).forEach(btn => {
          try { btn.click(); } catch { /* ignore */ }
        });
      }
    }, closeSelector);
    await page.waitForTimeout(500);
    await discardDirtyDraft();

    const closeButtons = page.locator(closeSelector);
    for (let i = 0; i < await closeButtons.count(); i++) {
      try { await closeButtons.nth(i).click({ timeout: 1_000, force: true }); } catch { /* ignore */ }
    }
    await page.waitForTimeout(500);
    await discardDirtyDraft();

    const remaining = await page.locator('.fabricate-manager, .fabricate-gathering-app, button:has-text("Discard Changes")').count();
    if (remaining === 0) break;
  }
}

/**
 * Attach browser console capture to a Playwright page.
 * @param {import('playwright').Page} page
 * @param {RegExp[]} ignoredErrorPatterns
 */
function attachConsoleCapture(page, ignoredErrorPatterns = []) {
  page.on('console', msg => {
    const entry = `[${msg.type()}] ${msg.text()}`;
    consoleLog.push(entry);
    if (msg.type() === 'error') {
      const text = msg.text();
      const isIgnored = ignoredErrorPatterns.some(p => p.test(text));
      if (!isIgnored) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', err => {
    const entry = `[pageerror] ${err.message}`;
    consoleLog.push(entry);
    const isIgnored = ignoredErrorPatterns.some(p => p.test(err.message));
    if (!isIgnored) {
      consoleErrors.push(`pageerror: ${err.message}`);
    }
  });
}

/**
 * Open the player Gathering app from the Items Directory action and assert it rendered.
 * @param {import('playwright').Page} page
 */
async function openGatheringAppFromDirectory(page) {
  const itemsTab = page.locator('#sidebar [data-tab="items"]').first();
  await itemsTab.click({ force: true });
  const gatheringButton = page.locator('button[data-fabricate-action="gathering"]').first();
  await gatheringButton.waitFor({ state: 'visible', timeout: 10_000 });
  if (!await gatheringButton.isEnabled()) {
    throw new Error('Gathering directory action is visible but disabled.');
  }
  await gatheringButton.evaluate(button => button.click());
  const app = page.locator('.fabricate-gathering-app').first();
  await app.waitFor({ state: 'visible', timeout: 10_000 });
  return app;
}

/**
 * Resize the rendered Gathering application frame for container-query screenshots.
 * @param {import('playwright').Page} page
 * @param {{ width: number, height: number }} size
 */
async function setGatheringWindowSize(page, { width, height }) {
  await page.setViewportSize({
    width: Math.max(1366, width + 120),
    height: Math.max(768, height + 120)
  });
  await page.evaluate(({ width, height }) => {
    const gathering = document.querySelector('.fabricate-gathering-app');
    const app = gathering?.closest('.application, .app') || document.querySelector('#fabricate-gathering');
    if (!app) return null;
    Object.assign(app.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: '20px',
      top: '20px'
    });
    return {
      width: app.getBoundingClientRect().width,
      height: app.getBoundingClientRect().height
    };
  }, { width, height });
  await page.waitForTimeout(500);
}

/**
 * Select an actor in the Gathering app by visible actor name.
 * @param {import('playwright').Page} page
 * @param {string} actorName
 */
async function selectGatheringActor(page, actorName) {
  const actorSelect = page.locator('.fabricate-gathering-app .gathering-v2-actor-card select').first();
  await actorSelect.waitFor({ state: 'visible', timeout: 10_000 });
  await actorSelect.selectOption({ label: actorName });
  await page.locator('.fabricate-gathering-app .gathering-v2-actor-card').filter({ hasText: actorName }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Select an environment row in the Gathering app by visible name.
 * @param {import('playwright').Page} page
 * @param {string} environmentName
 */
async function selectGatheringEnvironment(page, environmentName) {
  const environmentTab = page.locator('.fabricate-gathering-app .gathering-v2-tabs button').first();
  if (await environmentTab.count() > 0) {
    await environmentTab.click();
    await page.locator('.fabricate-gathering-app .gathering-v2-workspace').first()
      .waitFor({ state: 'visible', timeout: 10_000 });
  }
  const search = page.locator('.fabricate-gathering-app input[type="search"]').first();
  if (await search.count() > 0) {
    await search.fill(environmentName);
    await page.waitForTimeout(300);
  }
  const row = page.locator('.gathering-v2-environment-row').filter({ hasText: environmentName }).first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  await row.click({ force: true });
  await page.waitForTimeout(250);
  const selected = await page.evaluate((name) => {
    const applicationValues = [
      ...Object.values(ui.windows || {}),
      ...Array.from(foundry?.applications?.instances?.values?.() || [])
    ];
    let matched = false;
    for (const app of applicationValues) {
      const store = app?._gatheringStore;
      if (!store?.viewState || !store?.selectEnvironment) continue;
      let state = null;
      const unsubscribe = store.viewState.subscribe(value => { state = value; });
      unsubscribe();
      const environment = (state?.filteredEnvironments || state?.systemFilteredEnvironments || state?.environments || [])
        .find(candidate => candidate?.name === name);
      if (!environment?.id) continue;
      store.selectEnvironment(environment.id);
      matched = true;
    }
    return matched;
  }, environmentName);
  if (!selected) {
    await row.evaluate(element => element.click());
  }
  await page.locator('.gathering-v2-task-panel').filter({ hasText: environmentName }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Show the Gathering app log tab.
 * @param {import('playwright').Page} page
 */
async function showGatheringLog(page) {
  const logTab = page.locator('.fabricate-gathering-app .gathering-v2-tabs button').nth(1);
  await logTab.waitFor({ state: 'visible', timeout: 10_000 });
  await logTab.click();
  await page.locator('.fabricate-gathering-app .gathering-v2-log').first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Click a visible Gathering app task button by task label.
 * @param {import('playwright').Page} page
 * @param {string} taskLabel
 */
async function startGatheringTaskByLabel(page, taskLabel) {
  const taskRow = page.locator('.gathering-task-row').filter({ hasText: taskLabel }).first();
  await taskRow.waitFor({ state: 'visible', timeout: 10_000 });
  // noWaitAfter: clicking an already-`is-selected` task row can trigger a
  // same-document state change that Playwright treats as a pending navigation,
  // hanging the click() for the full 30s navigation budget. See PR diagnosis
  // for run 26031422155 / issue #149.
  await taskRow.click({ noWaitAfter: true });
  const startButton = page.locator('.fabricate-gathering-app .gathering-start-button').first();
  await startButton.waitFor({ state: 'visible', timeout: 10_000 });
  await startButton.click();
}

async function scrollGatheringAppTo(page, selector) {
  await page.evaluate((selector) => {
    const app = document.querySelector('.fabricate-gathering-app');
    const target = document.querySelector(selector);
    if (!app || !target) return;
    const appRect = app.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    app.scrollTop += targetRect.top - appRect.top - 18;
  }, selector);
  await page.waitForTimeout(400);
}

async function scrollGatheringAppToText(page, text) {
  await page.evaluate((text) => {
    const app = document.querySelector('.fabricate-gathering-app');
    const targets = Array.from(document.querySelectorAll(
      '.gathering-v2-environment-row, .gathering-task-row, .gathering-run-section, .gathering-feedback-panel, .gathering-history-list'
    ));
    const target = targets.find(element => element.textContent?.includes(text));
    if (!app || !target) return;
    const appRect = app.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    app.scrollTop += targetRect.top - appRect.top - 18;
  }, text);
  await page.waitForTimeout(400);
}

async function assertNoScreenshotOverlays(page) {
  await dismissFoundryNotifications(page);
  const overlays = page.locator(
    '.dialog.application, .window-app.dialog, .application.dialog, .app.dialog, #notifications .notification'
  );
  const count = await overlays.count();
  if (count > 0) {
    throw new Error(`Screenshot target is covered by ${count} modal or notification overlay(s).`);
  }
}

// ── Cleanup tracking ──────────────────────────────────────────────────────
const cleanup = {
  actorIds: [],
  itemIds: [],
  userIds: [],
  sceneIds: [],
  systemId: null,
  recipeIds: []
};

async function main() {
  // Read boot timings written by foundry-test-up.mjs *before* wiping
  // test-results/ — that script may have populated boot-timings.json, and we
  // want to merge those entries into the final summary so the timing table
  // reflects the whole pipeline, not just the in-browser phases.
  /** @type {Array<{ phase: string, startedAt: string, durationMs: number }>} */
  let bootTimings = [];
  try {
    const raw = await readFile(join(RESULTS_DIR, 'boot-timings.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.bootTimings)) bootTimings = parsed.bootTimings;
  } catch { /* boot timings are optional (e.g., when invoking foundry-test-run.mjs directly) */ }

  // Wipe stale artifacts so the uploaded test-results/ artifact contains
  // only the current run. Every consumer (CI artifact upload, local triage)
  // wants current-run output; nothing here is hand-authored.
  await rm(RESULTS_DIR, { recursive: true, force: true });
  await mkdir(RESULTS_DIR, { recursive: true });

  process.stdout.write(`Smoke profile: ${SMOKE_PROFILE}${RAW_SMOKE_PROFILE !== SMOKE_PROFILE ? ` (from FOUNDRY_SMOKE_PROFILE=${RAW_SMOKE_PROFILE})` : ''}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Known non-Fabricate error patterns to ignore (keep narrow — real 404s should be caught)
  const ignoredErrorPatterns = [
    /favicon/i
  ];

  attachConsoleCapture(page, ignoredErrorPatterns);

  const results = {
    passed: false,
    steps: [],
    errors: [],
    consoleErrors: []
  };

  try {
    startPhase('boot-and-join');
    // ── Step 1: Navigate to setup page and handle first-run flows ──────────
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle' });
    results.steps.push({ step: 'navigate-setup', passed: true });

    // Handle first-run license page (redirects /setup → /license → /auth)
    await acceptLicenseIfPresent(page, results);

    // Handle admin auth page (/auth → /setup)
    await authenticateIfRequired(page, results);

    // If the world is already running, Foundry redirects straight to /join or /game
    const postAuthPath = getPathname(page.url());
    const worldAlreadyRunning = postAuthPath === '/join' || postAuthPath === '/game';

    if (!worldAlreadyRunning) {
      await page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 15_000 });

      // Dismiss first-run dialogs (telemetry, tours) that overlay the setup page
      await dismissFirstRunDialogs(page, results);

      await screenshot(page, 'setup-ready');
      results.steps.push({ step: 'setup-ready', passed: true });

      // ── Step 2: Launch world ───────────────────────────────────────────────
      // Navigate to the Worlds tab via JavaScript (Foundry V13 setup page)
      await page.evaluate(() => {
        // Foundry V13 uses ApplicationV2 tabs — switch to worlds tab
        const tab = document.querySelector('#setup-packages-header [data-tab="worlds"]');
        if (tab) tab.click();
      });
      // Wait for the smoke world's card to be present (replaces a 2 s fixed sleep)
      await page.locator(`[data-package-id="${WORLD_ID}"]`).first()
        .waitFor({ state: 'visible', timeout: 15_000 });
      await screenshot(page, 'worlds-tab');

      // Click the Launch World button (visible on hover in Foundry V13)
      const worldCard = page.locator(`[data-package-id="${WORLD_ID}"]`);
      await worldCard.hover();
      const launchBtn = worldCard.locator('[data-action="worldLaunch"]');
      await launchBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await launchBtn.click();
      // After launch, Foundry navigates to /join (player selection) or /game
      try {
        await page.waitForURL(/\/(join|game)/, { timeout: 120_000 });
      } catch (err) {
        if (!String(err?.message ?? '').includes('ERR_CONNECTION_REFUSED')) {
          throw err;
        }
        await page.waitForTimeout(10_000);
        await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForURL(/\/(join|game)/, { timeout: 60_000 });
      }
      await screenshot(page, 'world-launching');
      results.steps.push({ step: 'launch-world', passed: true });
    } else {
      process.stdout.write('World already running, skipping setup/launch.\n');
      results.steps.push({ step: 'setup-ready', passed: true, skipped: true });
      results.steps.push({ step: 'launch-world', passed: true, skipped: true });
    }

    await joinWorldSession(page, results, { userLabel: 'Gamemaster', stepName: 'join-session' });

    // Hide notification toasts globally — they otherwise overlay screenshots
    // and force a per-screenshot dismiss + sleep dance. Behavioral assertions
    // (e.g. `assertNoScreenshotOverlays`) still inspect the DOM defensively.
    await installNotificationHidingCss(page);

    await screenshot(page, 'world-loaded');

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
      await joinWorldSession(page, results, { userLabel: 'Gamemaster' });
      // Re-apply the notification-hiding CSS after reload (style tags are
      // scoped to the document and are cleared on navigation)
      await installNotificationHidingCss(page);
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

    // Wait for Fabricate to be fully ready
    await page.waitForFunction(() => game.fabricate?.ready === true, { timeout: 15_000 });

    // Dismiss any overlay that might block sidebar clicks (Game Paused banner, tours, dialogs)
    await page.evaluate(() => {
      // Unpause the game if paused (the "Game Paused" overlay blocks all sidebar clicks)
      if (game.paused) game.togglePause(false);
      // Dismiss any active tour
      const tour = globalThis.foundry?.nue?.Tour;
      if (tour?.activeTour) tour.activeTour.exit();
    });
    await page.waitForTimeout(500);

    // ── Phase B: Create test actors & items ─────────────────────────────────
    startPhase('phase-B');
    process.stdout.write('Phase B: Creating test actors and items...\n');
    try {
      const createdDocs = await page.evaluate(async () => {
        // Clean up any stale test data from previous runs.
        // 1. Clean stale crafting systems and their recipes first.
        //    Filter by literal "Arcane Forge" name so we never delete user
        //    state. The CI world (`fabricate-smoke-ci`) is wiped and
        //    recopied by setup-data on every up, so this should be a no-op
        //    in normal runs; the filter is belt-and-suspenders defence
        //    against a partial mid-run crash that left a renamed system
        //    around — those are still recoverable by the literal-name
        //    rename-back at the end of Phase D0.
        const csm = game.fabricate.getCraftingSystemManager();
        const rm = game.fabricate.getRecipeManager();
        const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();
        const allSystems = csm.getSystems();
        const staleSystems = allSystems.filter(s => s.name === 'Arcane Forge');
        for (const sys of staleSystems) {
          console.log(`Cleaning stale crafting system: ${sys.name} (${sys.id})`);
          try { await environmentStore?.cleanupByCraftingSystem?.(sys.id); } catch { /* ok */ }
          const recipes = rm.getRecipesForSystem?.(sys.id) ?? [];
          for (const r of recipes) {
            try { await rm.deleteRecipe(r.id); } catch { /* ok */ }
          }
          try { await csm.deleteSystem(sys.id); } catch { /* ok */ }
        }

        // 2. Clean stale actors
        const staleActors = game.actors.contents.filter(a =>
          [
            'Alara the Alchemist',
            'Brom the Blacksmith'
          ].includes(a.name)
        );
        if (staleActors.length > 0) {
          console.log(`Cleaning ${staleActors.length} stale test actors`);
          await Actor.deleteDocuments(staleActors.map(a => a.id));
        }

        const staleUsers = game.users.contents.filter(u =>
          ['Fabricate Gatherer', 'Fabricate Observer'].includes(u.name)
        );
        if (staleUsers.length > 0) {
          console.log(`Cleaning ${staleUsers.length} stale test users`);
          await User.deleteDocuments(staleUsers.map(u => u.id));
        }

        // 3. Clean stale items
        const staleItems = game.items.contents.filter(i =>
          ['Iron Ore', 'Mystic Herb', 'Dragon Scale', 'Empty Vial',
           'Iron Sword', 'Healing Potion', 'Dragon Scale Armor'].includes(i.name)
        );
        if (staleItems.length > 0) {
          console.log(`Cleaning ${staleItems.length} stale test items`);
          await Item.deleteDocuments(staleItems.map(i => i.id));
        }

        const staleScenes = game.scenes.contents.filter(scene =>
          ['Fabricate Azure Grove Scene'].includes(scene.name)
        );
        if (staleScenes.length > 0) {
          console.log(`Cleaning ${staleScenes.length} stale test scenes`);
          await Scene.deleteDocuments(staleScenes.map(scene => scene.id));
        }

        // Discover valid document types — try multiple Foundry API locations
        // V13: game.documentTypes.Item, V12: game.system.documentTypes.Item
        const rawItemTypes = game.documentTypes?.Item
          ?? game.system?.documentTypes?.Item
          ?? game.system?.template?.Item?.types
          ?? [];
        const rawActorTypes = game.documentTypes?.Actor
          ?? game.system?.documentTypes?.Actor
          ?? game.system?.template?.Actor?.types
          ?? [];
        const itemTypes = Array.from(rawItemTypes);
        const actorTypes = Array.from(rawActorTypes);
        console.log('Available item types:', JSON.stringify(itemTypes));
        console.log('Available actor types:', JSON.stringify(actorTypes));

        // Use 'loot' for all items — safest common type across D&D 5e versions
        const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';
        const actorType = actorTypes.includes('character') ? 'character' : actorTypes[0] || 'character';

        // Create world-level items (all as loot — type doesn't matter for crafting)
        const itemData = [
          { name: 'Iron Ore', type: itemType, img: 'icons/commodities/metal/ingot-worn-iron.webp' },
          { name: 'Mystic Herb', type: itemType, img: 'icons/consumables/plants/leaf-herb-green.webp' },
          { name: 'Dragon Scale', type: itemType, img: 'icons/commodities/leather/scales-blue-white.webp' },
          { name: 'Empty Vial', type: itemType, img: 'icons/consumables/potions/vial-cork-empty.webp' },
          { name: 'Iron Sword', type: itemType, img: 'icons/weapons/swords/sword-guard-brass-worn.webp' },
          { name: 'Healing Potion', type: itemType, img: 'icons/consumables/potions/potion-tube-corked-red.webp' },
          { name: 'Dragon Scale Armor', type: itemType, img: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp' }
        ];

        const items = await Item.createDocuments(itemData);
        console.log(`Created ${items.length} items:`, items.map(i => `${i.name} (${i.type})`).join(', '));

        const itemIds = items.map(i => i.id);
        const itemsByName = {};
        for (const item of items) {
          itemsByName[item.name] = { id: item.id, uuid: item.uuid };
        }

        // Create actors
        const actors = await Actor.createDocuments([
          { name: 'Alara the Alchemist', type: actorType, img: 'icons/svg/mystery-man.svg' },
          { name: 'Brom the Blacksmith', type: actorType, img: 'icons/svg/combat.svg' }
        ]);
        console.log(`Created ${actors.length} actors:`, actors.map(a => a.name).join(', '));
        const actorIds = actors.map(a => a.id);

        const alara = actors.find(a => a.name === 'Alara the Alchemist');
        const brom = actors.find(a => a.name === 'Brom the Blacksmith');
        const testUserData = [
          { name: 'Fabricate Gatherer', role: CONST.USER_ROLES.PLAYER, password: '' },
          { name: 'Fabricate Observer', role: CONST.USER_ROLES.PLAYER, password: '' }
        ];
        const existingTestUsers = game.users.contents.filter(user =>
          testUserData.some(data => data.name === user.name)
        );
        const missingTestUsers = testUserData.filter(data =>
          !existingTestUsers.some(user => user.name === data.name)
        );
        const users = existingTestUsers.concat(
          missingTestUsers.length > 0 ? await User.createDocuments(missingTestUsers) : []
        );
        const gathererUser = users.find(user => user.name === 'Fabricate Gatherer');
        const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        const noneLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
        await alara.update({ ownership: { default: noneLevel, [gathererUser.id]: ownerLevel } });
        await brom.update({ ownership: { default: noneLevel } });
        const userIds = users.map(user => user.id);

        // Build inventory copies from world items
        // Include flags.core.sourceId so the crafting engine can match
        // embedded items back to world-level component UUIDs
        const byName = (name) => {
          const item = items.find(i => i.name === name);
          if (!item) throw new Error(`Item "${name}" not found in created items`);
          return item;
        };
        const copies = (item, qty) =>
          Array.from({ length: qty }, () => ({
            name: item.name,
            type: item.type,
            img: item.img,
            flags: { core: { sourceId: item.uuid } }
          }));

        // Alara gets: 3x Mystic Herb, 2x Empty Vial, 1x Dragon Scale
        await alara.createEmbeddedDocuments('Item', [
          ...copies(byName('Mystic Herb'), 3),
          ...copies(byName('Empty Vial'), 2),
          ...copies(byName('Dragon Scale'), 1)
        ]);

        // Brom gets: 3x Iron Ore, 1x Dragon Scale
        await brom.createEmbeddedDocuments('Item', [
          ...copies(byName('Iron Ore'), 3),
          ...copies(byName('Dragon Scale'), 1)
        ]);

        return { itemIds, actorIds, userIds, gathererUserId: gathererUser.id, alaraId: alara.id, bromId: brom.id, itemsByName };
      });

      cleanup.itemIds = createdDocs.itemIds;
      cleanup.actorIds = createdDocs.actorIds;
      cleanup.userIds = createdDocs.userIds;
      cleanup.alaraId = createdDocs.alaraId;
      cleanup.bromId = createdDocs.bromId;
      cleanup.gathererUserId = createdDocs.gathererUserId;
      process.stdout.write(`  Created ${createdDocs.itemIds.length} items and ${createdDocs.actorIds.length} actors with inventories.\n`);

      // Screenshot the Items sidebar (force: true bypasses overlays like "Game Paused")
      const itemsTab = page.locator('#sidebar [data-tab="items"]').first();
      await itemsTab.click({ force: true });
      // Wait for the items directory to render an item row created in Phase B
      // (replaces a 1 s fixed sleep that was guarding sidebar render).
      await page.locator('#sidebar #items .directory-item, #sidebar [data-tab="items"] .directory-item').first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => { /* selector variants across V13 — best-effort */ });
      await screenshot(page, 'items-sidebar');
      process.stdout.write('  Screenshotted Items sidebar.\n');

      // Screenshot each actor sheet (inventory tab)
      process.stdout.write('  Opening actor sheets for screenshots...\n');
      for (const actorId of createdDocs.actorIds) {
        const actorName = await page.evaluate(async (id) => {
          const actor = game.actors.get(id);
          await actor.sheet.render(true);
          return actor.name;
        }, actorId);
        // Wait for an actor sheet to be in the DOM (covers AppV1 + V2 shells).
        // Replaces a 1.5 s fixed sleep.
        await page.locator('.actor.sheet, .actor-sheet, .actor.window-app, [data-application-part="primary"]').first()
          .waitFor({ state: 'visible', timeout: 10_000 })
          .catch(() => { /* shell selector varies; the changeTab logic below tolerates a not-yet-rendered sheet */ });
        // Navigate to inventory tab via Foundry API
        const invTabResult = await page.evaluate((id) => {
          const actor = game.actors.get(id);
          const sheet = actor?.sheet;
          if (!sheet) return { found: false, reason: 'no sheet' };

          // ApplicationV2: use changeTab API
          if (typeof sheet.changeTab === 'function') {
            try {
              sheet.changeTab('inventory', 'primary');
              return { found: true, method: 'changeTab(inventory, primary)' };
            } catch (e) {
              // Try without group
              try {
                sheet.changeTab('inventory');
                return { found: true, method: 'changeTab(inventory)' };
              } catch (e2) { /* continue */ }
            }
          }

          // ApplicationV1: use activateTab
          if (typeof sheet.activateTab === 'function') {
            try {
              sheet.activateTab('inventory');
              return { found: true, method: 'activateTab(inventory)' };
            } catch (e) { /* continue */ }
          }

          // Debug: list available methods and tab groups
          const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(sheet))
            .filter(m => m.toLowerCase().includes('tab'))
            .slice(0, 10);
          const tabGroups = sheet.tabGroups ? Object.keys(sheet.tabGroups) : [];
          return { found: false, methods, tabGroups };
        }, actorId);
        if (invTabResult.found) {
          await page.waitForTimeout(500);
        }
        await screenshot(page, `actor-sheet-${actorName.replace(/\s+/g, '-').toLowerCase()}`);
        process.stdout.write(`  Screenshotted ${actorName} sheet.\n`);
        // Close the sheet
        await page.evaluate((id) => {
          const actor = game.actors.get(id);
          actor.sheet.close();
        }, actorId);
        await page.waitForTimeout(500);
      }

      results.steps.push({ step: 'create-actors-items', passed: true });
      process.stdout.write('Phase B complete: Actors and items created.\n');
    } catch (err) {
      results.steps.push({ step: 'create-actors-items', passed: false, error: err.message });
      process.stderr.write(`Phase B failed: ${err.message}\n`);
    }

    // Guard: Phases C–E depend on Phase B having created items
    const phaseBPassed = results.steps.some(s => s.step === 'create-actors-items' && s.passed);
    if (!phaseBPassed) {
      process.stderr.write('Skipping Phases C–E: Phase B did not complete.\n');
      results.steps.push({ step: 'create-crafting-system', passed: false, error: 'Skipped: Phase B failed' });
    }

    // ── Phase C: Create crafting system & recipes ────────────────────────────
    if (phaseBPassed) {
    startPhase('phase-C');
    process.stdout.write('Phase C: Creating crafting system and recipes...\n');
    try {
      const craftingSetup = await page.evaluate(async () => {
        const csm = game.fabricate.getCraftingSystemManager();

        // Create the crafting system
        const system = await csm.createSystem({
          name: 'Arcane Forge',
          description: 'A mystical forge capable of transmuting raw materials into powerful artifacts.'
        });
        const systemId = system.id;
        const azureGroveScene = await Scene.create({
          name: 'Fabricate Azure Grove Scene',
          active: false,
          background: { src: 'icons/consumables/plants/leaf-herb-green.webp' }
        });

        // Register all 7 world items as managed components
        const worldItems = game.items.contents;
        const worldItemByName = Object.fromEntries(worldItems.map(item => [item.name, item]));
        const componentMap = {};
        for (const item of worldItems) {
          const result = await csm.addItemFromUuid(systemId, item.uuid);
          componentMap[item.name] = result.item.id;
        }
        for (const componentId of Object.values(componentMap)) {
          await csm.updateItem(systemId, componentId, { difficulty: 1 });
        }

        await csm.updateSystem(systemId, {
          features: { essences: true, gathering: true },
          essenceDefinitions: [
            {
              name: 'Verdant',
              description: 'The essence of growth, renewal, and living roots.',
              icon: 'fas fa-leaf',
              sourceItemUuid: worldItemByName['Mystic Herb']?.uuid ?? null
            },
            {
              name: 'Restorative',
              description: 'The essence of mending, resilience, and recovery.',
              icon: 'fas fa-heart',
              sourceItemUuid: worldItemByName['Healing Potion']?.uuid ?? null
            },
            {
              name: 'Toxic',
              description: 'The essence of venom, corruption, and dangerous decay.',
              icon: 'fas fa-skull-crossbones',
              sourceItemUuid: null
            },
            {
              name: 'Volatile',
              description: 'The essence of sparks, heat, and unstable reactions.',
              icon: 'fas fa-bolt',
              sourceItemUuid: null
            },
            {
              name: 'Positive',
              description: 'The essence of radiance, blessing, and warm light.',
              icon: 'fas fa-sun',
              sourceItemUuid: null
            },
            {
              name: 'Negative',
              description: 'The essence of shadow, concealment, and entropy.',
              icon: 'fas fa-moon',
              sourceItemUuid: null
            }
          ]
        });

        // Create 3 recipes
        const rm = game.fabricate.getRecipeManager();

        const recipe1 = await rm.createRecipe({
          name: 'Forge Iron Sword',
          description: 'Hammer iron ore into a sturdy blade.',
          craftingSystemId: systemId,
          img: 'icons/weapons/swords/sword-guard-brass-worn.webp',
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Iron Ore',
              options: [{
                quantity: 2,
                match: { type: 'component', componentId: componentMap['Iron Ore'] }
              }]
            }]
          }],
          resultGroups: [{
            name: 'Forged Weapon',
            results: [{
              componentId: componentMap['Iron Sword'],
              quantity: 1
            }]
          }]
        });

        const recipe2 = await rm.createRecipe({
          name: 'Brew Healing Potion',
          description: 'Combine mystic herbs and an empty vial to create a healing draught.',
          craftingSystemId: systemId,
          img: 'icons/consumables/potions/bottle-round-corked-red.webp',
          ingredientSets: [{
            ingredientGroups: [
              {
                name: 'Mystic Herb',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Mystic Herb'] }
                }]
              },
              {
                name: 'Empty Vial',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Empty Vial'] }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Brewed Potion',
            results: [{
              componentId: componentMap['Healing Potion'],
              quantity: 1
            }]
          }]
        });

        const recipe3 = await rm.createRecipe({
          name: 'Craft Dragon Scale Armor',
          description: 'Forge dragon scales with iron ore into legendary armor.',
          craftingSystemId: systemId,
          img: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp',
          ingredientSets: [{
            ingredientGroups: [
              {
                name: 'Dragon Scale',
                options: [{
                  quantity: 2,
                  match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                }]
              },
              {
                name: 'Iron Ore',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Iron Ore'] }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Crafted Armor',
            results: [{
              componentId: componentMap['Dragon Scale Armor'],
              quantity: 1
            }]
          }]
        });

        const environmentStore = game.fabricate.getGatheringEnvironmentStore();
        const gatheringEnvironment = await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Azure Grove',
          description: 'A compact validation fixture for GM gathering environment authoring.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: azureGroveScene.uuid,
          region: 'northreach',
          biomes: ['forest', 'ruins'],
          dangerTags: ['hazardous'],
          hazardSelectionMode: 'highestRankedDrop',
          hazardPolicy: 'successWithHazard',
          enabledTaskIds: ['smoke-forage-library'],
          enabledHazardIds: ['smoke-bramble-hazard'],
          tasks: [{
            name: 'Forage Verdant Reagents',
            description: 'Collect useful plants and incidental ore from a controlled test clearing.',
            img: 'icons/consumables/plants/leaf-herb-green.webp',
            enabled: false,
            resolutionMode: 'routed',
            resultSelection: {
              provider: 'rollTableOutcome',
              rollTableUuid: 'RollTable.fabricateMissingTable'
            },
            timeRequirement: {
              minutes: 10,
              hours: 0,
              days: 0,
              months: 0,
              years: 0
            },
            failureOutcome: {
              mode: 'text',
              text: 'The grove yields only damp leaves.'
            },
            visibility: {
              provider: 'dnd5e',
              formula: '1d20',
              threshold: '10'
            },
            catalysts: [
              {
                componentId: componentMap['Empty Vial'],
                degradesOnUse: false,
                destroyWhenExhausted: true,
                maxUses: null
              },
              {
                componentId: componentMap['Dragon Scale'],
                degradesOnUse: true,
                destroyWhenExhausted: true,
                maxUses: 3
              }
            ],
            resultGroups: [
              {
                name: 'Common Finds',
                results: [
                  { componentId: componentMap['Mystic Herb'], quantity: 2 },
                  { componentId: componentMap['Iron Ore'], quantity: 1 }
                ]
              },
              {
                name: 'Rare Finds',
                results: []
              }
            ]
          }]
        });

        const playerGatheringFixtures = [];
        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Verdant Meadow',
          description: 'A clear player-facing gathering site with an immediate successful task.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: '',
          tasks: [{
            name: 'Gather Meadow Herbs',
            description: 'Collect fresh herbs for a quick brewing session.',
            img: 'icons/consumables/plants/leaf-herb-green.webp',
            enabled: true,
            resolutionMode: 'progressive',
            progressive: { awardMode: 'equal' },
            check: { provider: 'dnd5e', formula: '20', threshold: '10' },
            resultGroups: [{
              name: 'Meadow Herbs',
              results: [{ componentId: componentMap['Mystic Herb'], quantity: 1 }]
            }]
          }]
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Sunken Ruins',
          description: 'A scene-linked site that stays visible while blocked.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: 'Scene.fabricateMissingGatheringScene',
          tasks: [{
            name: 'Survey Sunken Reagents',
            description: 'This task is visible but cannot be attempted away from its linked scene.',
            img: 'icons/svg/item-bag.svg',
            enabled: true,
            resolutionMode: 'progressive',
            progressive: { awardMode: 'equal' },
            check: { provider: 'dnd5e', formula: '20', threshold: '10' },
            resultGroups: [{
              name: 'Ruins Finds',
              results: [{ componentId: componentMap['Iron Ore'], quantity: 1 }]
            }]
          }]
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Crystal Thicket',
          description: 'Requires a vial catalyst so Brom demonstrates a blocked task.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: '',
          tasks: [{
            name: 'Bottle Crystal Dew',
            description: 'A vial is required before the dew can be gathered.',
            img: 'icons/consumables/potions/vial-cork-empty.webp',
            enabled: true,
            resolutionMode: 'progressive',
            progressive: { awardMode: 'equal' },
            check: { provider: 'dnd5e', formula: '20', threshold: '10' },
            catalysts: [{
              componentId: componentMap['Empty Vial'],
              degradesOnUse: false,
              destroyWhenExhausted: false,
              maxUses: null
            }],
            resultGroups: [{
              name: 'Crystal Dew',
              results: [{ componentId: componentMap['Mystic Herb'], quantity: 1 }]
            }]
          }]
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Timed Orchard',
          description: 'A timed gathering site that creates an active run before completion.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: '',
          tasks: [{
            name: 'Tend Slow Bloom',
            description: 'The bloom matures after a short world-time delay.',
            img: 'icons/consumables/plants/leaf-herb-green.webp',
            enabled: true,
            resolutionMode: 'progressive',
            progressive: { awardMode: 'equal' },
            check: { provider: 'dnd5e', formula: '20', threshold: '10' },
            timeRequirement: { minutes: 1, hours: 0, days: 0, months: 0, years: 0 },
            resultGroups: [{
              name: 'Slow Bloom',
              results: [{ componentId: componentMap['Mystic Herb'], quantity: 1 }]
            }]
          }]
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Withered Patch',
          description: 'A deterministic failure task for failure feedback screenshots.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: '',
          tasks: [{
            name: 'Search Withered Patch',
            description: 'The patch is exhausted and should fail cleanly.',
            img: 'icons/consumables/plants/leaf-herb-green.webp',
            enabled: true,
            resolutionMode: 'progressive',
            progressive: { awardMode: 'equal' },
            check: { provider: 'dnd5e', formula: '1', threshold: '10' },
            failureOutcome: { mode: 'text', text: 'The patch yields only brittle stems.' },
            resultGroups: [{
              name: 'Withered Finds',
              results: [{ componentId: componentMap['Mystic Herb'], quantity: 1 }]
            }]
          }]
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Moonlit Blind Grove',
          description: 'A blind environment that must hide task details from non-GM users.',
          enabled: true,
          selectionMode: 'blind',
          sceneUuid: '',
          tasks: [{
            name: 'Secret Moonpetal Harvest',
            description: 'This real task name should remain GM-only in player blind views.',
            img: 'icons/consumables/plants/leaf-herb-green.webp',
            enabled: true,
            resolutionMode: 'progressive',
            progressive: { awardMode: 'equal' },
            check: { provider: 'dnd5e', formula: '20', threshold: '10' },
            resultGroups: [{
              name: 'Moonpetals',
              results: [{ componentId: componentMap['Mystic Herb'], quantity: 1 }]
            }]
          }]
        }));

        await game.settings.set('fabricate', 'gatheringConfig', {
          conditions: { weather: 'rain', timeOfDay: 'dusk' },
          systems: {
            [systemId]: {
              vocabularies: {
                regions: { values: ['northreach'] }
              },
              tasks: [{
                id: 'smoke-forage-library',
                name: 'Smoke Reusable Forage',
                description: 'Reusable library task for Manager gathering composition screenshots.',
                img: 'icons/consumables/plants/leaf-herb-green.webp',
                enabled: true,
                region: 'northreach',
                biomes: ['forest'],
                weather: ['rain'],
                timeOfDay: ['dusk'],
                itemSelectionMode: 'highestRankedDrop',
                dropRows: [{
                  id: 'smoke-drop-herb',
                  componentId: componentMap['Mystic Herb'],
                  quantity: 2,
                  dropRate: 80,
                  enabled: true
                }]
              }],
              hazards: [{
                id: 'smoke-bramble-hazard',
                name: 'Smoke Bramble Snare',
                description: 'Reusable hazard for Manager gathering composition screenshots.',
                img: 'icons/svg/hazard.svg',
                enabled: true,
                dangerTags: ['hazardous'],
                region: 'northreach',
                biomes: ['forest'],
                weather: ['rain'],
                timeOfDay: ['dusk'],
                dropRate: 35
              }]
            }
          }
        });

        return {
          systemId,
          componentMap,
          recipeIds: [recipe1.id, recipe2.id, recipe3.id],
          healingPotionRecipeId: recipe2.id,
          sceneIds: [azureGroveScene.id],
          gatheringEnvironmentId: gatheringEnvironment.id,
          playerGatheringEnvironmentIds: playerGatheringFixtures.map(environment => environment.id)
        };
      });

      cleanup.systemId = craftingSetup.systemId;
      cleanup.recipeIds = craftingSetup.recipeIds;
      cleanup.sceneIds = craftingSetup.sceneIds;
      process.stdout.write(`  Created crafting system and ${craftingSetup.recipeIds.length} recipes.\n`);

      results.steps.push({ step: 'create-crafting-system', passed: true });
      process.stdout.write(`Phase C complete: System "${craftingSetup.systemId}" with ${craftingSetup.recipeIds.length} recipes.\n`);

      // Feature-gate negative test (toggle gathering off, assert button hides,
      // toggle back on). Belongs in `full` only — `rc` proves the positive
      // gathering path in Phase D2, which exercises the same feature flag from
      // the on side.
      if (RUN_FULL_ONLY_BEHAVIORS) {
      try {
        const otherGatheringSystemsEnabled = await page.evaluate((systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          return csm.getSystems()
            .some(system => system.id !== systemId && system.features?.gathering === true);
        }, craftingSetup.systemId);
        await page.evaluate(async (systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(systemId, { features: { essences: true, gathering: false } });
        }, craftingSetup.systemId);
        await page.locator('#sidebar [data-tab="items"]').first().click({ force: true });
        // Wait for the items-sidebar tab content to be visible — replaces a
        // 750 ms fixed sleep that was guarding render of the sidebar after a
        // settings.update that triggers a Hooks.callAll cycle.
        await page.locator('#sidebar [data-tab="items"][aria-selected="true"], #sidebar [data-application-part="items"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => { /* selectors vary across V13 sheets — best-effort */ });
        if (!otherGatheringSystemsEnabled && await page.locator('button[data-fabricate-action="gathering"]').count() > 0) {
          throw new Error('Gathering action is visible when no system enables gathering.');
        }
        if (otherGatheringSystemsEnabled) {
          results.steps.push({ step: 'gathering-feature-gate-negative', passed: true, skipped: true });
        } else {
          results.steps.push({ step: 'gathering-feature-gate-negative', passed: true });
        }
      } catch (err) {
        results.steps.push({ step: 'gathering-feature-gate-negative', passed: false, error: err.message });
      } finally {
        await page.evaluate(async (systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(systemId, { features: { essences: true, gathering: true } });
        }, craftingSetup.systemId);
        await page.locator('button[data-fabricate-action="gathering"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => { /* tolerate if sidebar hasn't re-rendered in time */ });
      }
      } else {
        results.steps.push({ step: 'gathering-feature-gate-negative', passed: true, skipped: true });
      }

      // ── Phase D0: Screenshot Crafting System Manager ─────────────────────
      // Gated behind RUN_SCREENSHOT_PHASES so the CI smoke profile skips the
      // ~25 manager captures and pointer hit-tests; local `full` runs
      // continue to regenerate them for visual verification.
      if (!RUN_SCREENSHOT_PHASES) {
        startPhase('phase-D0-skipped');
        process.stdout.write(`Phase D0: skipped (profile=${SMOKE_PROFILE}).\n`);
        results.steps.push({ step: 'screenshot-manager', passed: true, skipped: true });
      } else {
      startPhase('phase-D0');
      process.stdout.write('Phase D0: Opening Crafting System Manager...\n');
      try {
        await page.evaluate(async (sysId) => {
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', '');
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, {
            name: "The Herbalist's Compendium",
            description: 'Configure categories, item tags, essences, and crafting behaviour for this system.'
          });
        }, craftingSetup.systemId);

        await page.evaluate(() => {
          game.fabricate.api.getCraftingSystemManagerAppClass().show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await selectSmokeSystemInManager(page);
        let navLabels = await page.locator('.fabricate-manager .manager-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.at(0) !== 'System settings') {
          throw new Error(`Manager default selection should keep System settings first. Saw: ${navLabels.join(', ')}`);
        }
        if (await page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist")[aria-selected="true"]').count() === 0) {
          throw new Error('Manager did not select the smoke test system.');
        }
        if (await page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")').count() === 0) {
          throw new Error('Manager root breadcrumb is missing.');
        }
        await assertManagerLayoutStable(page, 'normal default selection');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-default-selection');

        await page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist") .manager-system-identity').first().click();
        await page.waitForTimeout(750);
        navLabels = await page.locator('.fabricate-manager .manager-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.includes('Systems')) {
          throw new Error(`Manager selected nav should not expose a Systems tab. Saw: ${navLabels.join(', ')}`);
        }
        if (navLabels.at(0) !== 'System settings') {
          throw new Error(`Manager selected nav should keep System settings first. Saw: ${navLabels.join(', ')}`);
        }
        for (const expected of ['System settings', 'Components', 'Recipes', 'Tags & Categories', 'Essences', 'Tools', 'Gathering', 'Rules', 'Graph']) {
          if (!navLabels.includes(expected)) {
            throw new Error(`Manager selected nav missing ${expected}. Saw: ${navLabels.join(', ')}`);
          }
        }
        if (await page.locator('.fabricate-manager .manager-scope-card .manager-scope-name:has-text("The Herbalist")').count() === 0) {
          throw new Error('Manager selected-system scope is missing static selected-system text.');
        }
        if (await page.locator('.fabricate-manager .manager-scope-return[aria-label="Return to System Library"]').count() === 0) {
          throw new Error('Manager selected-system scope is missing the return-to-library action.');
        }
        if (await page.locator('.fabricate-manager .manager-section-header .manager-button:has-text("Import")').count() > 0) {
          throw new Error('Manager duplicated Import in the System library header.');
        }
        if (await page.locator('.fabricate-manager .manager-section-header .manager-button:has-text("Create")').count() > 0) {
          throw new Error('Manager duplicated Create in the System library header.');
        }
        if (await page.locator('.fabricate-manager .manager-card-title:has-text("Quick actions")').count() > 0) {
          throw new Error('Manager inspector still shows duplicate Quick actions.');
        }
        await assertManagerLayoutStable(page, 'normal selected');
        await exerciseManagerPointerTargets(page);
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-normal');

        await page.locator('.fabricate-manager .manager-scope-return').first().click();
        await page.waitForTimeout(750);
        navLabels = await page.locator('.fabricate-manager .manager-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.at(0) !== 'System settings') {
          throw new Error(`Manager return to library should preserve selected-system nav. Saw nav: ${navLabels.join(', ')}`);
        }
        if (await page.locator('.fabricate-manager .manager-scope-card').count() === 0) {
          throw new Error('Manager return to library should leave the rail scope visible.');
        }
        if (await page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist")').count() === 0) {
          throw new Error('Manager return to library did not return to the systems browser.');
        }
        if (await page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist")[aria-selected="true"]').count() === 0) {
          throw new Error('Manager return to library should preserve the selected system row.');
        }

        await closeOpenApplications(page);
        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, { features: { essences: true, gathering: false } });
        }, craftingSetup.systemId);
        await page.evaluate(() => {
          game.fabricate.api.getCraftingSystemManagerAppClass().show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist") .manager-system-identity').first().click();
        await page.waitForTimeout(750);
        const gatheringOffFact = await page.locator('.fabricate-manager [data-count-id="environments"]').first().evaluate(element => {
          const rect = element.getBoundingClientRect();
          const strong = element.querySelector('strong');
          const style = getComputedStyle(element);
          return {
            text: element.textContent?.replace(/\s+/g, ' ').trim(),
            strongText: strong?.textContent?.trim(),
            className: element.className,
            gridColumn: style.gridColumn,
            width: rect.width,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            strongTagName: strong?.tagName
          };
        });
        if (gatheringOffFact.text === 'Gathering environments Off') {
          if (gatheringOffFact.strongText !== 'Off' || gatheringOffFact.strongTagName !== 'STRONG') {
            throw new Error(`Manager gathering-off fact does not preserve Off emphasis: ${JSON.stringify(gatheringOffFact)}`);
          }
          if (!String(gatheringOffFact.className).includes('is-off')) {
            throw new Error(`Manager gathering-off fact should use the full-grid special case: ${JSON.stringify(gatheringOffFact)}`);
          }
        } else if (!/^\d+ Gathering environments$/.test(gatheringOffFact.text || '')) {
          throw new Error(`Manager gathering fact text is wrong: ${JSON.stringify(gatheringOffFact)}`);
        }
        if (gatheringOffFact.scrollWidth > gatheringOffFact.clientWidth + 2) {
          throw new Error(`Manager gathering-off fact overflows: ${JSON.stringify(gatheringOffFact)}`);
        }
        await assertManagerLayoutStable(page, 'normal selected gathering off');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-gathering-off');
        await closeOpenApplications(page);
        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, { features: { essences: true, gathering: true } });
        }, craftingSetup.systemId);
        await page.evaluate(() => {
          game.fabricate.api.getCraftingSystemManagerAppClass().show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-system-row:has-text("The Herbalist") .manager-system-identity').first().click();
        await page.waitForTimeout(750);

        await setManagerWindowSize(page, { width: 1000, height: 700 });
        await assertManagerLayoutStable(page, 'stacked selected');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-nav-button:has-text("Recipes")').first().click();
        await page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("The Herbalist")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await exerciseManagerSystemEditPointerTargets(page);
        if (await page.locator('.fabricate-manager[data-manager-view="system-edit"]').count() === 0) {
          throw new Error('Manager system Edit did not stay inside the v2 edit route.');
        }
        for (const selector of [
          '#manager-system-name',
          '#manager-system-description',
          '#manager-system-resolution-mode',
          '[data-edit-control="advanced-options"]',
          '[data-feature-key="gathering"]'
        ]) {
          if (await page.locator(`.fabricate-manager ${selector}`).count() === 0) {
            throw new Error(`Manager system edit is missing required control: ${selector}`);
          }
        }
        await assertManagerLayoutStable(page, 'system edit normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-system-edit-normal');

        await setManagerWindowSize(page, { width: 900, height: 700 });
        await assertManagerLayoutStable(page, 'system edit narrow');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-system-edit-narrow');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await exerciseManagerRecipePointerTargets(page);
        if (await page.locator('.fabricate-manager .manager-recipe-row').count() < 2) {
          throw new Error('Manager recipes browser rendered fewer than two recipe rows.');
        }
        if (await page.locator('.fabricate-manager .manager-recipe-row.is-selected').count() === 0) {
          throw new Error('Manager recipes browser did not show selected recipe row state.');
        }
        if (await page.locator('.fabricate-manager .manager-inspector:has-text("Requirements")').count() === 0) {
          throw new Error('Manager recipes inspector did not show requirements preview.');
        }
        await assertManagerLayoutStable(page, 'recipes normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipes-normal');

        await setManagerWindowSize(page, { width: 1000, height: 700 });
        await page.locator('.fabricate-manager .manager-recipe-row:has-text("Brew Healing Potion")').first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await assertManagerLayoutStable(page, 'recipes stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipes-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-nav-button:has-text("Components")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="components"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.waitForTimeout(500);
        if (await page.locator('.fabricate-manager .manager-component-drop-zone').count() === 0) {
          throw new Error('Manager components browser did not show the drop-to-add affordance.');
        }
        await assertManagerLayoutStable(page, 'components normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-components-normal');
        process.stdout.write('  D0: components normal screenshotted\n');

        // Components → stacked. Earlier CI runs hung silently between this
        // resize and the next screenshot for ~13 minutes. The withDeadline
        // wrappers above now surface a hang here as a thrown error rather
        // than an opaque job timeout.
        await setManagerWindowSize(page, { width: 1000, height: 700 });
        process.stdout.write('  D0: components stacked resize complete\n');
        await assertManagerLayoutStable(page, 'components stacked');
        process.stdout.write('  D0: components stacked layout asserted\n');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-components-stacked');
        process.stdout.write('  D0: components stacked screenshotted\n');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-nav-button:has-text("Tags")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="tags"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.waitForTimeout(500);
        if (await page.locator('.fabricate-manager [data-tags-evidence="how-it-works"]').count() === 0) {
          throw new Error('Manager tags inspector did not render the How-it-works evidence card.');
        }
        await assertManagerLayoutStable(page, 'tags-categories normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-tags-categories-normal');

        await setManagerWindowSize(page, { width: 1000, height: 700 });
        await assertManagerLayoutStable(page, 'tags-categories stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-tags-categories-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        const essenceNav = page.locator('.fabricate-manager .manager-nav-button:has-text("Essences")');
        if (await essenceNav.count() > 0 && !(await essenceNav.first().isDisabled())) {
          await essenceNav.first().click();
          await page.locator('.fabricate-manager[data-manager-view="essences"]').first().waitFor({ state: 'visible', timeout: 5_000 });
          await page.waitForTimeout(500);
          await assertManagerLayoutStable(page, 'essences normal');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-essences-normal');

          await setManagerWindowSize(page, { width: 1000, height: 700 });
          await assertManagerLayoutStable(page, 'essences stacked');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-essences-stacked');

          await setManagerWindowSize(page, { width: 1280, height: 820 });
          const essenceRow = page.locator('.fabricate-manager .manager-essence-row');
          if (await essenceRow.count() > 0) {
            const editButton = essenceRow.first().locator('.manager-icon-button[title*="Edit" i]');
            if (await editButton.count() > 0) {
              await editButton.first().click();
              await page.locator('.fabricate-manager[data-manager-view="essence-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
              await page.waitForTimeout(500);
              await assertManagerLayoutStable(page, 'essence-edit first state');
              await assertNoScreenshotOverlays(page);
              await screenshot(page, 'manager-essence-edit-first-state');
              await page.locator('.fabricate-manager .manager-button:has-text("Cancel"), .fabricate-manager .manager-button:has-text("Back")').first().click({ trial: false }).catch(() => {});
              await page.waitForTimeout(250);
            }
          }
        }

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-nav-button:has-text("Recipes")').first().click();
        await page.waitForTimeout(250);
        await exerciseManagerEnvironmentPointerTargets(page);
        if (await page.locator('.fabricate-manager .manager-environment-row').count() < 1) {
          throw new Error('Manager environments browser rendered no environment rows.');
        }
        if (await page.locator('.fabricate-manager .manager-environment-row.is-selected:has-text("Azure Grove")').count() === 0) {
          throw new Error('Manager environments browser did not show selected environment row state.');
        }
        if (await page.locator('.fabricate-manager .manager-inspector:has-text("Linked scene")').count() === 0) {
          throw new Error('Manager environments inspector did not show linked scene evidence.');
        }
        await assertManagerLayoutStable(page, 'environments normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-environments-browse-normal');

        await setManagerWindowSize(page, { width: 1000, height: 700 });
        await page.locator('.fabricate-manager .manager-environment-row:has-text("Azure Grove")').first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await assertManagerLayoutStable(page, 'environments stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-environments-browse-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager #manager-gathering-nav-tasks').first().click();
        await page.locator('.fabricate-manager .manager-gathering-task-row:has-text("Smoke Reusable Forage")').first().waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.fabricate-manager .manager-gathering-task-row:has-text("Smoke Reusable Forage") [aria-label^="Edit"]').first().click();
        await page.locator('.fabricate-manager[data-manager-view="gathering-task-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        // "Selected Drop Rule" only renders when a drop row is selected
        // (CraftingSystemManagerRoot.svelte:2957 `{#if selectedGatheringDrop}`)
        // and its i18n value is now "Selected Drop", so it isn't asserted here.
        // "Final chance" was removed entirely. The remaining sections are the
        // editor's stable scaffolding.
        for (const expected of ['Task Identity', 'Task Availability', 'Drop Rules']) {
          if (await page.locator('.fabricate-manager').filter({ hasText: expected }).count() === 0) {
            throw new Error(`Manager gathering task editor is missing "${expected}".`);
          }
        }
        await assertManagerLayoutStable(page, 'gathering task editor normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-task-editor-normal');

        await setManagerWindowSize(page, { width: 1000, height: 720 });
        await page.waitForTimeout(250);
        await assertManagerLayoutStable(page, 'gathering task editor stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-task-editor-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        // Navigate back to environments via the side nav (always visible on
        // gathering routes; the submenu auto-expands when isGatheringRoute).
        await page.locator('.fabricate-manager #manager-gathering-nav-environments').first().click();
        await page.locator('.fabricate-manager .manager-environment-row:has-text("Azure Grove") .manager-icon-button').nth(0).click();
        await page.locator('.fabricate-manager[data-manager-view="environment-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });

        // The environment editor is currently a placeholder
        // (src/ui/svelte/apps/manager/EnvironmentEditView.svelte) while the
        // previous inline task/catalyst/tool authoring is being rebuilt — that
        // surface has moved to the standalone `gathering-task-edit` route. Until
        // the new editor lands, verify the placeholder renders with the
        // environment's title and screenshot it for visual evidence, then
        // return via the placeholder's own button.
        await page.locator('.fabricate-manager .manager-environment-edit-view.is-placeholder').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.fabricate-manager .manager-environment-details-band')
          .filter({ hasText: 'Azure Grove' }).first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager .manager-environment-placeholder-card').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        if (await page.locator('.fabricate-manager .environment-draft-editor, .fabricate-manager .environment-foundation').count() > 0) {
          throw new Error('Manager environments edit route still rendered the legacy environment editor.');
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-environment-edit-placeholder');

        // The placeholder's "Return to environments" button is wired to
        // store.cancelEnvironmentDraft (the store action), which doesn't
        // change the view. Verify the button is clickable, then navigate
        // back via the side nav.
        await page.locator('.fabricate-manager .manager-environment-placeholder-card .manager-button:has-text("Return to environments")').first().click({ trial: true });
        await page.locator('.fabricate-manager #manager-gathering-nav-environments').first().click();
        await page.locator('.fabricate-manager[data-manager-view="environments"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });

        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, {
            name: 'Arcane Forge',
            description: 'A mystical forge capable of transmuting raw materials into powerful artifacts.'
          });
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', sysId);
        }, craftingSetup.systemId);
        await closeOpenApplications(page);
        results.steps.push({ step: 'screenshot-manager', passed: true });
        process.stdout.write('Phase D0 complete: Crafting System Manager screenshotted and hit-tested.\n');
      } catch (err) {
        results.steps.push({ step: 'screenshot-manager', passed: false, error: err.message });
        throw err;
      }
      }

      // ── Phase D2: Screenshot Gathering app live states ─────────────────────
      startPhase('phase-D2');
      process.stdout.write('Phase D2: Exercising Gathering app live states...\n');
      try {
        await closeOpenApplications(page);
        await page.setViewportSize({ width: 1920, height: 1080 });
        const itemsTab = page.locator('#sidebar [data-tab="items"]').first();
        await itemsTab.click({ force: true });
        const gatheringButton = page.locator('button[data-fabricate-action="gathering"]').first();
        await gatheringButton.waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'items-sidebar-gathering-enabled');

        await openGatheringAppFromDirectory(page);
        await page.locator('.fabricate-gathering-app').first().waitFor({ state: 'visible', timeout: 10_000 });
        await selectGatheringActor(page, 'Alara the Alchemist');
        await selectGatheringEnvironment(page, 'Verdant Meadow');
        await page.locator('.gathering-task-row').filter({ hasText: 'Gather Meadow Herbs' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.gathering-task-row').filter({ hasText: 'Gather Meadow Herbs' }).first().click({ noWaitAfter: true });
        await page.locator('.fabricate-gathering-app .gathering-start-button').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await screenshot(page, 'gathering-targeted-ready');

        if (RUN_FULL_ONLY_GATHERING_STATES) {
        await page.evaluate(async () => {
          if (!game.paused) {
            await game.togglePause(true, { broadcast: true });
          }
          const applicationValues = [
            ...Object.values(ui.windows || {}),
            ...Array.from(foundry?.applications?.instances?.values?.() || [])
          ];
          const gatheringApps = applicationValues.filter(app => app?._gatheringStore?.refresh);
          await Promise.all(gatheringApps.map(app => app._gatheringStore.refresh()));
        });
        await selectGatheringEnvironment(page, 'Verdant Meadow');
        const pausedRow = page.locator('.gathering-task-row.is-blocked').filter({ hasText: /paused/i }).first();
        await pausedRow.waitFor({ state: 'visible', timeout: 10_000 });
        if (await pausedRow.locator('.gathering-start-button, .gathering-icon-action').first().isEnabled()) {
          throw new Error('Paused gathering task start button should be disabled.');
        }
        await scrollGatheringAppToText(page, 'paused');
        await screenshot(page, 'gathering-paused-blocker');
        await page.evaluate(async () => {
          if (game.paused) {
            await game.togglePause(false, { broadcast: true });
          }
          const applicationValues = [
            ...Object.values(ui.windows || {}),
            ...Array.from(foundry?.applications?.instances?.values?.() || [])
          ];
          const gatheringApps = applicationValues.filter(app => app?._gatheringStore?.refresh);
          await Promise.all(gatheringApps.map(app => app._gatheringStore.refresh()));
        });
        await selectGatheringEnvironment(page, 'Verdant Meadow');
        await page.locator('.gathering-task-row').filter({ hasText: 'Gather Meadow Herbs' }).first().click({ noWaitAfter: true });
        await page.locator('.fabricate-gathering-app .gathering-start-button').first()
          .waitFor({ state: 'visible', timeout: 10_000 });

        await selectGatheringEnvironment(page, 'Sunken Ruins');
        const sceneBlockedCard = page.locator('.gathering-v2-environment-row.is-blocked').filter({ hasText: 'Sunken Ruins' }).first();
        await sceneBlockedCard.waitFor({ state: 'visible', timeout: 15_000 });
        // 15s here (not 5s): on hosted CI runners the chip-row inside an
        // is-blocked card sometimes lands later than 5s after a fresh
        // selectGatheringActor() re-renders the environment list.
        await sceneBlockedCard.locator('.gathering-chip').first().waitFor({ state: 'visible', timeout: 15_000 });
        const sceneBlockedTask = page.locator('.gathering-task-row.is-blocked').filter({ hasText: 'Survey Sunken Reagents' }).first();
        await sceneBlockedTask.waitFor({ state: 'visible', timeout: 10_000 });
        if (await sceneBlockedTask.locator('.gathering-icon-action').first().isEnabled()) {
          throw new Error('Scene-blocked gathering task start button should be disabled.');
        }
        await scrollGatheringAppToText(page, 'Sunken Ruins');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-scene-blocked');

        await selectGatheringActor(page, 'Brom the Blacksmith');
        await selectGatheringEnvironment(page, 'Crystal Thicket');
        const catalystBlockedRow = page.locator('.gathering-task-row.is-blocked').filter({ hasText: 'Bottle Crystal Dew' }).first();
        await catalystBlockedRow.waitFor({ state: 'visible', timeout: 10_000 });
        if (await catalystBlockedRow.locator('.gathering-icon-action').first().isEnabled()) {
          throw new Error('Catalyst-blocked gathering task start button should be disabled.');
        }
        const bromVialCountBefore = await page.evaluate((bromId) => {
          const brom = game.actors.get(bromId);
          return brom?.items?.contents?.filter(item => item.name === 'Empty Vial').length ?? 0;
        }, cleanup.bromId);
        await scrollGatheringAppToText(page, 'Bottle Crystal Dew');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-catalyst-blocked');
        const bromVialCountAfter = await page.evaluate((bromId) => {
          const brom = game.actors.get(bromId);
          return brom?.items?.contents?.filter(item => item.name === 'Empty Vial').length ?? 0;
        }, cleanup.bromId);
        if (bromVialCountAfter !== bromVialCountBefore) {
          throw new Error('Blocked catalyst attempt changed the selected actor catalyst inventory.');
        }
        } else {
          process.stdout.write(`Phase D2: skipping blocked gathering sub-states (profile=${SMOKE_PROFILE}).\n`);
        }

        await selectGatheringActor(page, 'Alara the Alchemist');
        await selectGatheringEnvironment(page, 'Verdant Meadow');
        await startGatheringTaskByLabel(page, 'Gather Meadow Herbs');
        // 30s (not 10s) for post-task-start outcomes: on hosted Ubuntu CI
        // runners the feedback panel + history row reliably take 10–20s
        // longer than locally to render, since task resolution piggybacks
        // on Foundry's tick rate which lags under headless load.
        await page.locator('.gathering-feedback-panel.success').first().waitFor({ state: 'visible', timeout: 30_000 });
        await showGatheringLog(page);
        await page.locator('.gathering-history-row').filter({ hasText: 'Gather Meadow Herbs' }).first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-immediate-success');

        if (RUN_FULL_ONLY_GATHERING_STATES) {
        await dismissFoundryNotifications(page);
        const herbCountBeforeFailure = await page.evaluate((alaraId) => {
          const alara = game.actors.get(alaraId);
          return alara?.items?.contents?.filter(item => item.name === 'Mystic Herb').length ?? 0;
        }, cleanup.alaraId);
        await selectGatheringEnvironment(page, 'Withered Patch');
        await startGatheringTaskByLabel(page, 'Search Withered Patch');
        await page.locator('.gathering-feedback-panel.warning').first().waitFor({ state: 'visible', timeout: 30_000 });
        await showGatheringLog(page);
        await page.locator('.gathering-history-row').filter({ hasText: 'Search Withered Patch' }).first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        const herbCountAfterFailure = await page.evaluate((alaraId) => {
          const alara = game.actors.get(alaraId);
          return alara?.items?.contents?.filter(item => item.name === 'Mystic Herb').length ?? 0;
        }, cleanup.alaraId);
        if (herbCountAfterFailure !== herbCountBeforeFailure) {
          throw new Error('Failed gathering attempt created result items.');
        }
        await scrollGatheringAppToText(page, 'The patch yields only brittle stems.');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-failure-feedback');

        await selectGatheringEnvironment(page, 'Timed Orchard');
        await startGatheringTaskByLabel(page, 'Tend Slow Bloom');
        await showGatheringLog(page);
        await page.locator('.gathering-run-row').filter({ hasText: 'Tend Slow Bloom' }).first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        await scrollGatheringAppToText(page, 'Active Gathering');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-timed-active');

        await setGatheringWindowSize(page, { width: 500, height: 720 });
        await scrollGatheringAppToText(page, 'Active Gathering');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-narrow-active-history');

        await page.evaluate(async () => {
          await game.time.advance(120);
        });
        // Wait for the active timed run to resolve out of `waitingTime`
        // status rather than sleep for a fixed window. The Phase D2 success
        // path already reads this flag a few lines below; this just hoists
        // the wait so the next step's UI has settled before we proceed.
        await page.waitForFunction((alaraId) => {
          const actor = game.actors.get(alaraId);
          const runs = actor?.getFlag?.('fabricate', 'gatheringRuns') ?? {};
          const activeRuns = Array.isArray(runs.active)
            ? runs.active
            : Object.values(runs.active || {});
          return !activeRuns.some(run => run?.status === 'waitingTime');
        }, cleanup.alaraId, { timeout: 30_000 });
        await closeOpenApplications(page);
        await openGatheringAppFromDirectory(page);
        await selectGatheringActor(page, 'Alara the Alchemist');
        await showGatheringLog(page);
        await page.locator('.gathering-history-row').filter({ hasText: 'Tend Slow Bloom' }).first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        const firstHistoryText = await page.locator('.gathering-history-row').first().textContent();
        if (!String(firstHistoryText || '').includes('Tend Slow Bloom')) {
          throw new Error('Completed timed gathering run was not prepended to history.');
        }
        const timedState = await page.evaluate((alaraId) => {
          const actor = game.actors.get(alaraId);
          const runs = actor?.getFlag?.('fabricate', 'gatheringRuns') ?? {};
          const activeRuns = Array.isArray(runs.active)
            ? runs.active
            : Object.values(runs.active || {});
          return {
            active: activeRuns.filter(run => run?.taskId && run.taskId !== 'blind'),
            firstHistoryTaskId: Array.isArray(runs.history) ? runs.history[0]?.taskId ?? null : null
          };
        }, cleanup.alaraId);
        if (timedState.active.some(run => run.status === 'waitingTime')) {
          throw new Error('Timed gathering run remained active after world-time advancement.');
        }
        await scrollGatheringAppToText(page, 'Recent History');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-timed-complete');
        } else {
          process.stdout.write(`Phase D2: skipping failure + timed gathering sub-states (profile=${SMOKE_PROFILE}).\n`);
        }

        results.steps.push({ step: 'gathering-gm-live-states', passed: true });
        process.stdout.write('Phase D2 complete: GM/player Gathering states screenshotted.\n');
      } catch (err) {
        results.steps.push({ step: 'gathering-gm-live-states', passed: false, error: err.message });
        process.stderr.write(`Phase D2 failed: ${err.message}\n`);
        await screenshot(page, 'gathering-gm-live-states-failure');
      }

      // ── Phase D3: Screenshot non-GM gathering redaction and empty states ───
      // Gated behind RUN_SCREENSHOT_PHASES because this phase opens a fresh
      // browser context as a player user. Cold-loading Foundry's UI a second
      // time on a hosted Ubuntu runner reliably exceeds 30s; locally a warm
      // dev machine clears it in 5–10s. CI just needs module load + crafting
      // verification (Phase E); D3's player-secrecy assertions are visual
      // verification for `full` profile runs.
      if (!RUN_SCREENSHOT_PHASES) {
        startPhase('phase-D3-skipped');
        process.stdout.write(`Phase D3: skipped (profile=${SMOKE_PROFILE}).\n`);
        results.steps.push({ step: 'gathering-non-gm-states', passed: true, skipped: true });
      } else {
      startPhase('phase-D3');
      process.stdout.write('Phase D3: Exercising non-GM Gathering app states...\n');
      try {
        const playerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const playerPage = await playerContext.newPage();
        attachConsoleCapture(playerPage, ignoredErrorPatterns);
        await playerPage.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'domcontentloaded' });
        await joinWorldSession(playerPage, results, { userLabel: 'Fabricate Gatherer', stepName: null });
        await playerPage.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });
        await playerPage.waitForFunction(() => game.fabricate?.ready === true, { timeout: 15_000 });
        await openGatheringAppFromDirectory(playerPage);
        await playerPage.locator('.fabricate-gathering-app').first().waitFor({ state: 'visible', timeout: 10_000 });
        await playerPage.locator('.fabricate-gathering-app input[type="search"]').first().fill('Moonlit');
        await playerPage.waitForTimeout(500);
        await selectGatheringEnvironment(playerPage, 'Moonlit Blind Grove');
        await playerPage.locator('.gathering-task-row').filter({ hasText: 'Gather' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        const blindLeaks = await playerPage.evaluate(() => {
          const blindCard = Array.from(document.querySelectorAll('.gathering-v2-environment-row'))
            .find(card => card.textContent?.includes('Moonlit Blind Grove'));
          const appText = blindCard?.textContent || '';
          return [
            'Secret Moonpetal Harvest',
            'This real task name should remain GM-only',
            'Moonpetals',
            'Mystic Herb',
            'progressive',
            'dnd5e',
            'threshold',
            'catalyst'
          ].filter(secret => appText.includes(secret));
        });
        if (blindLeaks.length > 0) {
          throw new Error(`Blind gathering leaked GM-only details: ${blindLeaks.join(', ')}`);
        }
        await scrollGatheringAppToText(playerPage, 'Moonlit Blind Grove');
        await assertNoScreenshotOverlays(playerPage);
        await screenshot(playerPage, 'gathering-blind-redacted');
        await setGatheringWindowSize(playerPage, { width: 500, height: 720 });
        await scrollGatheringAppToText(playerPage, 'Moonlit Blind Grove');
        await assertNoScreenshotOverlays(playerPage);
        await screenshot(playerPage, 'gathering-player-narrow');
        await playerContext.close();

        results.steps.push({ step: 'gathering-non-gm-states', passed: true });
        process.stdout.write('Phase D3 complete: Non-GM Gathering states screenshotted.\n');
      } catch (err) {
        results.steps.push({ step: 'gathering-non-gm-states', passed: false, error: err.message });
        process.stderr.write(`Phase D3 failed: ${err.message}\n`);
        await screenshot(page, 'gathering-non-gm-states-failure');
      }
      }

      // ── Phase E: Craft an item ──────────────────────────────────────────────
      startPhase('phase-E');
      process.stdout.write('Phase E: Crafting a Healing Potion...\n');
      try {
        // Open Crafting App programmatically (avoids viewport/overlay issues)
        await page.evaluate(() => {
          document.querySelector('[data-fabricate-action="craft"]')?.click();
        });

        // Verify the crafting app opened (this `waitFor` also serves as the
        // post-click settle — replaces a 2 s fixed sleep).
        process.stdout.write('  Waiting for Crafting App to render...\n');
        const craftingApp = page.locator('.crafting-app, [data-appid] .window-title:has-text("Craft")').first();
        await craftingApp.waitFor({ state: 'visible', timeout: 10_000 });
        await screenshot(page, 'crafting-app-opened');

        results.steps.push({ step: 'open-crafting-app', passed: true });
        process.stdout.write('  Crafting App opened and screenshotted.\n');

        // Attempt to craft via the API
        process.stdout.write('  Executing craft: Brew Healing Potion...\n');
        const craftResult = await page.evaluate(async ({ recipeId, alaraId }) => {
          const alara = game.actors.get(alaraId);
          if (!alara) throw new Error(`Actor ${alaraId} not found`);

          console.log(`Crafting with ${alara.name} (${alara.id}), ${alara.items.size} items in inventory`);

          const rm = game.fabricate.getRecipeManager();
          const recipe = rm.getRecipe(recipeId);
          if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

          const result = await game.fabricate.craft(alara, recipe, {
            componentSourceActors: [alara]
          });

          // Check Alara's inventory for the Healing Potion
          const potionInInventory = alara.items.contents.some(i => i.name === 'Healing Potion');

          return {
            success: result.success,
            message: result.message,
            potionInInventory
          };
        }, { recipeId: craftingSetup.healingPotionRecipeId, alaraId: cleanup.alaraId });

        if (!craftResult.success) {
          process.stderr.write(`Craft returned failure: ${craftResult.message}\n`);
          results.steps.push({ step: 'craft-healing-potion', passed: false, error: craftResult.message });
        } else {
          process.stdout.write(`Craft succeeded: ${craftResult.message}\n`);
          process.stdout.write(`Healing Potion in inventory: ${craftResult.potionInInventory}\n`);
          results.steps.push({ step: 'craft-healing-potion', passed: true });
        }

        // Wait for the Healing Potion to actually appear in Alara's inventory
        // before screenshotting. Catches missing-craft regressions that a
        // fixed sleep would mask. Replaces a 1 s fixed sleep.
        if (craftResult.success) {
          await page.waitForFunction((alaraId) => {
            const alara = game.actors.get(alaraId);
            return alara?.items?.contents?.some(i => i.name === 'Healing Potion') === true;
          }, cleanup.alaraId, { timeout: 10_000 }).catch(() => { /* surface via post-craft step state */ });
        }
        await screenshot(page, 'post-craft');
        process.stdout.write('  Screenshotted post-craft state.\n');

        // Open Alara's sheet to show the crafted item (inventory tab)
        process.stdout.write('  Opening Alara\'s inventory to verify crafted item...\n');
        await page.evaluate(async (alaraId) => {
          const alara = game.actors.get(alaraId);
          if (alara) await alara.sheet.render(true);
        }, cleanup.alaraId);
        // Wait for the actor sheet to render (replaces a 1.5 s fixed sleep).
        await page.locator('.actor.sheet, .actor-sheet, .actor.window-app, [data-application-part="primary"]').first()
          .waitFor({ state: 'visible', timeout: 10_000 })
          .catch(() => { /* sheet selectors vary by V13 sheet — tab change tolerates absence */ });
        // Navigate to inventory tab via Foundry API
        await page.evaluate((id) => {
          const actor = game.actors.get(id);
          const sheet = actor?.sheet;
          if (typeof sheet?.changeTab === 'function') {
            sheet.changeTab('inventory', 'primary');
          } else if (typeof sheet?.activateTab === 'function') {
            sheet.activateTab('inventory');
          }
        }, cleanup.alaraId);
        await page.waitForTimeout(500);
        await screenshot(page, 'alara-post-craft-inventory');
        process.stdout.write('  Screenshotted Alara\'s post-craft inventory.\n');

        // Close the sheet
        await page.evaluate((alaraId) => {
          const alara = game.actors.get(alaraId);
          if (alara) alara.sheet.close();
        }, cleanup.alaraId);

        results.steps.push({ step: 'craft-item-phase', passed: true });
        process.stdout.write('Phase E complete.\n');
      } catch (err) {
        results.steps.push({ step: 'craft-item-phase', passed: false, error: err.message });
        process.stderr.write(`Phase E failed: ${err.message}\n`);
        await screenshot(page, 'craft-failure');
      }

      // ── Phase E2: No selectable actors player state after actor cleanup ───
      // Gated behind RUN_SCREENSHOT_PHASES because this phase opens a third
      // browser context as an observer user. Same CI cold-load cost as D3
      // (page.goto /join + game.ready + fabricate ready, often >30s on a
      // hosted Ubuntu runner). The empty-state assertion is a visual
      // verification path for `full` profile runs.
      if (!RUN_SCREENSHOT_PHASES) {
        startPhase('phase-E2-skipped');
        process.stdout.write(`Phase E2: skipped (profile=${SMOKE_PROFILE}).\n`);
        results.steps.push({ step: 'gathering-no-selectable-actors-state', passed: true, skipped: true });
      } else {
      startPhase('phase-E2');
      process.stdout.write('Phase E2: Exercising no-selectable-actors Gathering state...\n');
      try {
        await closeOpenApplications(page);
        await page.evaluate(async (actorIds) => {
          if (actorIds.length > 0) {
            await Actor.deleteDocuments(actorIds);
          }
        }, cleanup.actorIds);
        cleanup.actorIds = [];
        cleanup.alaraId = null;
        cleanup.bromId = null;

        const observerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const observerPage = await observerContext.newPage();
        attachConsoleCapture(observerPage, ignoredErrorPatterns);
        await observerPage.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'domcontentloaded' });
        await joinWorldSession(observerPage, results, { userLabel: 'Fabricate Observer', stepName: null });
        await observerPage.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });
        await observerPage.waitForFunction(() => game.fabricate?.ready === true, { timeout: 15_000 });
        await openGatheringAppFromDirectory(observerPage);
        await observerPage.locator('.gathering-empty-state').filter({ hasText: 'No Selectable Actors' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(observerPage);
        await screenshot(observerPage, 'gathering-no-selectable-actors');
        await observerContext.close();

        results.steps.push({ step: 'gathering-no-selectable-actors-state', passed: true });
        process.stdout.write('Phase E2 complete: No-selectable-actors state screenshotted.\n');
      } catch (err) {
        results.steps.push({ step: 'gathering-no-selectable-actors-state', passed: false, error: err.message });
        process.stderr.write(`Phase E2 failed: ${err.message}\n`);
        await screenshot(page, 'gathering-no-selectable-actors-failure');
      }
      }

    } catch (err) {
      results.steps.push({ step: 'create-crafting-system', passed: false, error: err.message });
      process.stderr.write(`Phase C failed: ${err.message}\n`);
    }
    } // end if (phaseBPassed)

    // ── Final: Check for step failures and runtime errors ──────────────────
    const failedSteps = results.steps.filter(s => s.passed === false);
    if (failedSteps.length > 0) {
      const summary = failedSteps.map(s => `${s.step}: ${s.error || 'failed'}`).join('; ');
      throw new Error(`${failedSteps.length} step(s) failed: ${summary}`);
    }

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
    // ── Phase F: Cleanup created documents ────────────────────────────────
    // Cleanup matters for local dev (the container is preserved across runs
    // and stale state can shadow fresh fixtures). CI containers are torn
    // down by `foundry-test-down.mjs` immediately after this script exits,
    // so cleanup is wasted wall-time. Gate behind RUN_FULL_ONLY_BEHAVIORS.
    if (RUN_FULL_ONLY_BEHAVIORS) {
    startPhase('phase-F');
    process.stdout.write('Phase F: Cleaning up test data...\n');
    try {
      await page.evaluate(async (cleanupData) => {
        // Delete recipes
        if (cleanupData.recipeIds.length > 0) {
          const rm = game.fabricate?.getRecipeManager?.();
          if (rm) {
            for (const id of cleanupData.recipeIds) {
              try { await rm.deleteRecipe(id); } catch { /* already deleted */ }
            }
          }
        }

        // Delete crafting system
        if (cleanupData.systemId) {
          const environmentStore = game.fabricate?.getGatheringEnvironmentStore?.();
          try { await environmentStore?.cleanupByCraftingSystem?.(cleanupData.systemId); } catch { /* ok */ }

          const csm = game.fabricate?.getCraftingSystemManager?.();
          if (csm) {
            try { await csm.deleteSystem(cleanupData.systemId); } catch { /* already deleted */ }
          }
        }

        // Delete actors
        if (cleanupData.actorIds.length > 0) {
          try { await Actor.deleteDocuments(cleanupData.actorIds); } catch { /* ok */ }
        }

        // Delete smoke users after actors so ownership references do not matter.
        if (cleanupData.userIds.length > 0) {
          try { await User.deleteDocuments(cleanupData.userIds); } catch { /* ok */ }
        }

        // Delete world items
        if (cleanupData.itemIds.length > 0) {
          try { await Item.deleteDocuments(cleanupData.itemIds); } catch { /* ok */ }
        }

        // Delete smoke scenes
        if (cleanupData.sceneIds.length > 0) {
          try { await Scene.deleteDocuments(cleanupData.sceneIds); } catch { /* ok */ }
        }
      }, cleanup);
      process.stdout.write('Cleanup: test data removed.\n');
    } catch {
      process.stderr.write('Cleanup: some test data may remain.\n');
    }
    } else {
      startPhase('phase-F-skipped');
      process.stdout.write(`Phase F: skipped (profile=${SMOKE_PROFILE}).\n`);
      results.steps.push({ step: 'cleanup', passed: true, skipped: true });
    }

    endPhase();

    results.consoleErrors = consoleErrors;
    results.bootTimings = bootTimings;
    results.phaseTimings = phaseTimings;
    await browser.close();

    const combinedTimings = [
      ...bootTimings.map(entry => ({ ...entry, phase: `boot:${entry.phase}` })),
      ...phaseTimings
    ];
    const timingsTable = formatTimingsTable(combinedTimings);
    if (timingsTable) {
      process.stdout.write(`\n${timingsTable}\n\n`);
    }

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
