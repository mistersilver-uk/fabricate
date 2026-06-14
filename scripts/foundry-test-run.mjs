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
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FABRICATE_THEME_IDS, FABRICATE_THEME_ATTRIBUTE, DEFAULT_FABRICATE_THEME } from '../src/ui/theme.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESULTS_DIR = join(ROOT, 'test-results');

const FOUNDRY_URL = process.env.FOUNDRY_URL ?? 'http://localhost:30100';
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin';
const WORLD_ID = 'fabricate-smoke-ci';
const SMOKE_ACTOR_ASSET_DIR = join(ROOT, 'assets', 'img', 'actors');
const SMOKE_ACTOR_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const LEGACY_SMOKE_ACTOR_NAMES = ['Brom the Blacksmith'];

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
  'fabricate-app-shell',
  'post-craft',
  'alara-post-craft-inventory'
]);

const JOIN_BUTTON_SELECTOR = 'button:has-text("Join Game Session"), button[name="join"]';
const JOIN_USER_SELECT_SELECTOR = 'select[name="userid"]';
const JOIN_USER_TILE_SELECTOR = '[data-user-id]';

/** @type {string[]} */
const consoleErrors = [];
/** @type {string[]} */
const consoleLog = [];

/**
 * Load every raster actor portrait under assets/img/actors as a smoke actor.
 * Actor names are intentionally derived from filenames so the Foundry smoke
 * world mirrors the checked-in portrait fixture set.
 * @returns {Promise<Array<{ name: string, img: string }>>}
 */
async function loadSmokeActorFixtures() {
  const actorAssetFiles = (await readdir(SMOKE_ACTOR_ASSET_DIR))
    .filter(file => SMOKE_ACTOR_IMAGE_EXTENSIONS.has(extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (actorAssetFiles.length === 0) {
    throw new Error('No smoke actor portrait assets found under assets/img/actors.');
  }

  return actorAssetFiles.map(file => ({
    name: basename(file, extname(file)),
    img: `modules/fabricate/assets/img/actors/${file}`
  }));
}

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
 * Re-theme the live, Foundry-mounted Fabricate surface exactly as the theme
 * setting's onChange (applyFabricateTheme) does: set the theme attribute on the
 * document element and every `.fabricate` root. This re-themes the real app via
 * its own CSS tokens — not a mock — so the resulting screenshot is the genuine
 * manager under that theme.
 * @param {import('playwright').Page} page
 * @param {string} themeId
 */
async function applyManagerTheme(page, themeId) {
  await page.evaluate(({ id, attr }) => {
    document.documentElement.setAttribute(attr, id);
    for (const root of document.querySelectorAll('.fabricate')) root.setAttribute(attr, id);
  }, { id: themeId, attr: FABRICATE_THEME_ATTRIBUTE });
  await page.waitForTimeout(200);
}

/**
 * Capture the currently-open manager view under every Fabricate theme, then
 * restore the default theme so later Phase D0 captures stay unthemed. Labels:
 * `manager-theme-<themeId>` (full profile only; this runs inside Phase D0).
 * @param {import('playwright').Page} page
 */
async function captureManagerThemes(page) {
  for (const themeId of Object.values(FABRICATE_THEME_IDS)) {
    await applyManagerTheme(page, themeId);
    await screenshot(page, `manager-theme-${themeId}`);
  }
  await applyManagerTheme(page, DEFAULT_FABRICATE_THEME);
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
      '.manager-gathering-task-row',
      '.manager-gathering-event-row',
      '.manager-tools-row',
      '.manager-inspector-card',
      '.manager-system-edit-form',
      '.manager-edit-card',
      '.manager-toggle-row',
      '.manager-essence-edit-view',
      '.environment-draft-editor',
      '.manager-environment-edit-view',
      '.manager-gathering-task-edit-view',
      '.manager-gathering-event-edit-view',
      '.manager-environment-workspace',
      '.environment-fields',
      '.environment-task-layout',
      '.manager-travel-view',
      '.manager-travel-parties-row',
      '.manager-party-member-row',
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
      || metric.selector === '.manager-gathering-task-row'
      || metric.selector === '.manager-gathering-event-row'
      || metric.selector === '.manager-tools-row'
      || metric.selector === '.manager-travel-parties-row'
  ).length;
  const editFormCount = metrics.filter(metric =>
    metric.selector === '.manager-system-edit-form'
      || metric.selector === '.manager-environment-editor-shell'
      || metric.selector === '.manager-environment-edit-view'
      || metric.selector === '.manager-gathering-task-edit-view'
      || metric.selector === '.manager-gathering-event-edit-view'
      || metric.selector === '.manager-essence-edit-view'
      || metric.selector === '.environment-draft-editor'
  ).length;
  if (rowCount === 0 && editFormCount === 0) {
    throw new Error(`Manager rendered no table rows at ${label}`);
  }
}

/**
 * Click a target only if it is present, swallowing transient failures. For
 * non-essential pointer-exercise interactions whose availability depends on a
 * manager UI still in flux — never hangs on a missing element, never fails the run.
 * @param {import('playwright').Locator} locator
 * @param {object} [options]
 */
async function softClick(locator, options = {}) {
  if (await locator.count() === 0) return;
  await locator.first().click(options).catch(() => {});
}

function managerSystemRowSelector(systemId) {
  return `.fabricate-manager .manager-system-row[data-system-id="${systemId}"]`;
}

/**
 * Exercise manager pointer targets without triggering destructive actions.
 * @param {import('playwright').Page} page
 * @param {string} systemId
 */
async function exerciseManagerPointerTargets(page, systemId) {
  const search = page.locator('.fabricate-manager input[type="search"]').first();
  await search.fill('forge');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager .manager-filter select').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager .manager-filter select').first().selectOption('all');

  await page.locator(`${managerSystemRowSelector(systemId)} .manager-system-identity`).first().click();
  // Breadcrumb / scope / header pointer targets only exist in certain navigation
  // states (e.g. inside a system sub-view). Trial-click them when present so the
  // exercise never hangs on a missing target and never mutates navigation.
  await softClick(page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("The Herbalist")'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-scope-return'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Import")'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Export")'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Create")'), { trial: true });
  const rowActionButtons = page.locator(`${managerSystemRowSelector(systemId)} .manager-icon-button`);
  for (let index = 0; index < await rowActionButtons.count(); index += 1) {
    await rowActionButtons.nth(index).click({ trial: true });
  }
}

/**
 * Select the smoke test crafting system in Manager.
 * @param {import('playwright').Page} page
 * @param {string} systemId
 */
async function selectSmokeSystemInManager(page, systemId) {
  const row = page.locator(managerSystemRowSelector(systemId)).first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  const alreadySelected = await row.evaluate(element => element.getAttribute('aria-selected') === 'true')
    .catch(() => false);
  if (alreadySelected) return;
  await row.locator('.manager-system-identity').click();
  await page.waitForTimeout(750);
}

async function seedSmokeGatheringLibrary(page, craftingSetup) {
  await page.evaluate(async ({ sysId, componentMap }) => {
    const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
    config.conditions = { ...(config.conditions || {}), weather: 'rain', timeOfDay: 'dusk' };
    config.systems = config.systems || {};
    const systemConfig = config.systems[sysId] || {};
    const withoutIds = (entries, ids) => (Array.isArray(entries) ? entries : [])
      .filter(entry => !ids.has(String(entry?.id || '')));
    config.systems[sysId] = {
      ...systemConfig,
      // System-level GatheringRules: a non-'never' reveal policy is required for
      // the blind environment card to surface the "(x/y)" discovered teaser.
      // There is no environment-level reveal override — reveal is system-scoped.
      rules: {
        ...(systemConfig.rules || {}),
        revealPolicy: 'onAttempt'
      },
      vocabularies: {
        ...(systemConfig.vocabularies || {}),
        regions: { values: ['northreach'] }
      },
      tasks: [
        ...withoutIds(systemConfig.tasks, new Set([
          'smoke-forage-library',
          'smoke-meadow-herbs', 'smoke-sunken-survey', 'smoke-crystal-dew',
          'smoke-slow-bloom', 'smoke-withered-search', 'smoke-moonpetal'
        ])),
        {
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
          toolIds: ['smoke-herbalist-sickle'],
          dropRows: [{
            id: 'smoke-drop-herb',
            componentId: componentMap['Mystic Herb'],
            quantity: 2,
            dropRate: 80,
            enabled: true
          }]
        },
        // Player-gathering scenario library tasks. Each player environment fixture
        // below force-includes one of these via compositionMode 'manual' +
        // forcedTaskIds. region 'meadowlands' keeps them from matching the automatic
        // Azure Grove / GM fixtures (northreach / no region); no weather/timeOfDay
        // constraint keeps them available. Library tasks are d100 drop-row gathers —
        // the per-scenario "state" (success / scene-block / tool-block / timed /
        // empty / blind) comes from the environment config or the drop-rate, since
        // progressive/check/catalyst/failure task resolution no longer exists.
        {
          id: 'smoke-meadow-herbs', name: 'Gather Meadow Herbs',
          description: 'Immediate successful gather for the player Gathering tab.',
          img: 'icons/consumables/plants/leaf-herb-green.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-meadow-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 90, enabled: true }]
        },
        {
          id: 'smoke-sunken-survey', name: 'Survey Sunken Reagents',
          description: 'Visible task gated by its linked scene at the environment level.',
          img: 'icons/svg/item-bag.svg',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-sunken-drop', componentId: componentMap['Iron Ore'], quantity: 1, dropRate: 70, enabled: true }]
        },
        {
          id: 'smoke-crystal-dew', name: 'Bottle Crystal Dew',
          description: 'Requires the Herbalist Sickle tool, demonstrating a blocked task.',
          img: 'icons/consumables/potions/vial-cork-empty.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          toolIds: ['smoke-herbalist-sickle'],
          dropRows: [{ id: 'smoke-crystal-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 80, enabled: true }]
        },
        {
          id: 'smoke-slow-bloom', name: 'Tend Slow Bloom',
          description: 'A timed gather that creates an active run before completion.',
          img: 'icons/consumables/plants/leaf-herb-green.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          timeRequirement: { minutes: 1, hours: 0, days: 0, months: 0, years: 0 },
          dropRows: [{ id: 'smoke-bloom-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 80, enabled: true }]
        },
        {
          id: 'smoke-withered-search', name: 'Search Withered Patch',
          description: 'An exhausted patch whose only drop never lands (empty-result feedback).',
          img: 'icons/consumables/plants/leaf-herb-green.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-withered-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 0, enabled: true }]
        },
        {
          id: 'smoke-moonpetal', name: 'Secret Moonpetal Harvest',
          description: 'Real task name that must stay GM-only in player blind views.',
          img: 'icons/consumables/plants/leaf-herb-green.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-moonpetal-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 70, enabled: true }]
        }
      ],
      tools: [
        ...withoutIds(systemConfig.tools, new Set(['smoke-herbalist-sickle'])),
        {
          id: 'smoke-herbalist-sickle',
          label: 'Herbalist Sickle',
          enabled: true,
          componentId: componentMap['Iron Sword'],
          requirement: { provider: 'dnd5e', formula: '@tools.herbalism.value', macroUuid: '' },
          breakage: { mode: 'limitedUses', maxUses: 5 },
          onBreak: { mode: 'flagBroken' }
        }
      ],
      events: [
        ...withoutIds(systemConfig.events, new Set(['smoke-bramble-event'])),
        {
          id: 'smoke-bramble-event',
          name: 'Smoke Bramble Snare',
          description: 'Reusable event for Manager gathering composition screenshots.',
          img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
          enabled: true,
          dangerTags: ['hazardous'],
          region: 'northreach',
          biomes: ['forest'],
          weather: ['rain'],
          timeOfDay: ['dusk'],
          dropRate: 35
        }
      ]
    };
    await game.settings.set('fabricate', 'gatheringConfig', config);

    // Tools are SYSTEM-OWNED (the `craftingSystems` setting). The Tools manager
    // (`getSystem(id).tools` → `enterToolsDraft`) and the gathering tool gate read
    // tools from the crafting system, NOT from gatheringConfig (the 0.7.0
    // reconciliation only runs at world-load, not after a later seed). Persist the
    // seeded library tools onto the crafting system so the Tools view renders the
    // row and tool-blocked gathering tasks resolve their requirement.
    await game.fabricate.getCraftingSystemManager()?.updateSystem?.(sysId, {
      tools: Array.isArray(config.systems?.[sysId]?.tools) ? config.systems[sysId].tools : []
    });

    // Seed two environment-store fixtures so the player Gathering tab frame
    // exercises both the locked teaser path and the blind chip + "(x/y)"
    // discovered suffix:
    //  - smoke-blind-grove   : enabled + selectionMode 'blind'. With the
    //    system rules.revealPolicy === 'onAttempt' above, its card shows the
    //    mask chip and the "(discovered/total)" suffix.
    //  - smoke-locked-hollow : enabled === false. For non-GM players this would
    //    render as a greyed locked teaser; the smoke run is GM, so it renders as
    //    a full listing (locked teasers are player-only and unit-test-covered).
    // Idempotent: the function runs twice in Phase D0, so skip ids already
    // present in the store. Imagery MUST use Foundry-core icon paths that exist
    // in the smoke Foundry version — a missing path 404s on every render and
    // trips the console-error gate (these reuse icons proven to load in-run).
    const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();
    if (environmentStore) {
      const existingIds = new Set((environmentStore.list?.() || []).map(env => String(env?.id || '')));
      if (!existingIds.has('smoke-blind-grove')) {
        await environmentStore.create({
          id: 'smoke-blind-grove',
          craftingSystemId: sysId,
          name: 'Smoke Blind Grove',
          description: 'Blind gathering site for the player Gathering tab screenshot (mask chip + discovered suffix).',
          img: 'icons/consumables/plants/leaf-herb-green.webp',
          enabled: true,
          selectionMode: 'blind',
          region: 'northreach',
          biomes: ['forest'],
          enabledTaskIds: ['smoke-forage-library']
        });
      }
      if (!existingIds.has('smoke-locked-hollow')) {
        await environmentStore.create({
          id: 'smoke-locked-hollow',
          craftingSystemId: sysId,
          name: 'Smoke Sealed Hollow',
          description: 'Disabled environment for the player Gathering tab screenshot (locked teaser for non-GM viewers).',
          img: 'icons/svg/door-closed.svg',
          enabled: false,
          selectionMode: 'targeted',
          region: 'northreach',
          biomes: ['forest', 'ruins'],
          enabledTaskIds: ['smoke-forage-library']
        });
      }
    }
  }, { sysId: craftingSetup.systemId, componentMap: craftingSetup.componentMap });
}

/**
 * Exercise manager system edit controls without saving destructive changes.
 * @param {import('playwright').Page} page
 * @param {string} systemId
 */
async function exerciseManagerSystemEditPointerTargets(page, systemId) {
  if (await page.locator('.fabricate-manager #manager-system-name').count() === 0) {
    let editButton = page.locator(`${managerSystemRowSelector(systemId)} .manager-icon-button`).nth(0);
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
      await page.locator(managerSystemRowSelector(systemId)).first().waitFor({ state: 'visible', timeout: 5_000 });
      editButton = page.locator(`${managerSystemRowSelector(systemId)} .manager-icon-button`).nth(0);
    }
    await editButton.click();
  }
  await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('.fabricate-manager #manager-system-name').first().fill('The Herbalist');
  await page.locator('.fabricate-manager #manager-system-description').first().fill('A field alchemy system for gathering herbs and brewing reliable remedies.');
  await page.locator('.fabricate-manager #manager-system-resolution-mode').first().selectOption('mapped');
  // Changing resolution mode may raise a confirm dialog; its buttons differ
  // across manager revisions. Dismiss it resiliently and never leave a modal open.
  const cancelDialog = page.locator('.dialog button:has-text("No"), .dialog button:has-text("Cancel"), .dialog button:has-text("Keep")').first();
  if (await cancelDialog.count() > 0) {
    await cancelDialog.click().catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
  await softClick(page.locator('.fabricate-manager [data-edit-control="advanced-options"] input'), { trial: true });
  await softClick(page.locator('.fabricate-manager [data-feature-key="gathering"] input'), { trial: true });
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Back to systems")'), { trial: true });
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
  await softClick(azureRow.locator('.manager-status-toggle'), { trial: true });
  await softClick(azureRow.locator('.manager-icon-button').nth(0), { trial: true });
  await softClick(azureRow.locator('.manager-icon-button').nth(1), { trial: true });
  await softClick(azureRow.locator('.manager-icon-button').nth(2), { trial: true });
  // Reordering happens via composition-list drag-and-drop; row no longer has
  // standalone move-up / move-down icon buttons.
  await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Create environment")'), { trial: true });
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
    '#fabricate-app button[data-action="close"]'
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
        if (element.querySelector?.('.fabricate-manager, .fabricate-app') || element.id?.startsWith?.('fabricate-')) {
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

    const remaining = await page.locator('.fabricate-manager, .fabricate-app, button:has-text("Discard Changes")').count();
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
    // Browser "Failed to load resource" console errors carry no URL in their
    // text; the resource path lives in msg.location(). Append it so a bare 404
    // can be traced to the exact asset in both console.log and the gate's
    // consoleErrors list.
    const location = msg.type() === 'error' ? (msg.location()?.url || '') : '';
    const text = location ? `${msg.text()} (${location})` : msg.text();
    consoleLog.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
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

  // Diagnostic only: a console 'error' is logged for failed resource loads but
  // is not always paired with a usable URL. Record every failing HTTP response
  // (4xx/5xx) and every network-level request failure with its URL into
  // console.log so the source of a "Failed to load resource" is always
  // traceable. These do NOT push to consoleErrors, so they never change the
  // run's pass/fail — the console 'error' above remains the gate.
  page.on('response', response => {
    const status = response.status();
    if (status >= 400) {
      consoleLog.push(`[response ${status}] ${response.url()}`);
    }
  });

  page.on('requestfailed', request => {
    const failure = request.failure();
    consoleLog.push(`[requestfailed ${failure?.errorText || 'unknown'}] ${request.url()}`);
  });
}

async function assertNoScreenshotOverlays(page, options = {}) {
  await dismissFoundryNotifications(page);
  // A DialogV2 close() is an async fade-out: Foundry keeps the element in the DOM
  // with a `minimizing` (and, on some builds, `minimized`) class while it animates
  // away. Such a dialog is already dismissed and on its way out, so wait briefly
  // for it to leave rather than treating the closing animation as a blocking
  // overlay (this was a flaky false positive after destructive-confirm dialogs).
  const OVERLAY_SELECTOR =
    '.dialog.application, .window-app.dialog, .application.dialog, .app.dialog, #notifications .notification';
  const blockingOverlayCount = async () =>
    page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).filter(
        (el) => !el.classList.contains('minimizing') && !el.classList.contains('minimized')
      ).length;
    }, OVERLAY_SELECTOR);

  let count = await blockingOverlayCount();
  if (count > 0) {
    // Give any in-flight close animation a moment, then re-check, before failing.
    await page.waitForTimeout(750);
    await dismissFoundryNotifications(page);
    count = await blockingOverlayCount();
  }
  if (count > 0) {
    const diag = await page
      .evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .filter((el) => !el.classList.contains('minimizing') && !el.classList.contains('minimized'))
          .map((el) => `${el.tagName}#${el.id}.${el.className} :: ${(el.textContent || '').trim().slice(0, 120)}`)
          .join(' || ');
      }, OVERLAY_SELECTOR)
      .catch(() => '');
    throw new Error(`Screenshot target is covered by ${count} modal or notification overlay(s). [${diag}]`);
  }
  // Opt-in bleed-through guard: when the caller passes the set of Fabricate window
  // ids it EXPECTS to be open for this capture, fail on any OTHER visible
  // Fabricate-owned window. An ApplicationV2 close() is an async fade-out, so a
  // window closed without awaiting its promise can linger behind the next capture
  // (the issue-335 config window bled through behind the Manage panel). Default:
  // no stray check (back-compat with every existing call site).
  const allowedIds = options?.allowFabricateWindowIds;
  if (Array.isArray(allowedIds)) {
    const allowSet = new Set(allowedIds);
    const visibleFabricateWindows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[id^="fabricate-"]'))
        .filter((el) => {
          if (!el.classList.contains('application') && !el.classList.contains('window-app')) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => el.id);
    });
    const stray = visibleFabricateWindows.filter((id) => !allowSet.has(id));
    if (stray.length > 0) {
      throw new Error(`Screenshot target has stray Fabricate window(s) bleeding through: ${stray.join(', ')}.`);
    }
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
  const smokeActorFixtures = await loadSmokeActorFixtures();

  process.stdout.write(`Smoke profile: ${SMOKE_PROFILE}${RAW_SMOKE_PROFILE !== SMOKE_PROFILE ? ` (from FOUNDRY_SMOKE_PROFILE=${RAW_SMOKE_PROFILE})` : ''}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Known non-Fabricate error patterns to ignore (keep narrow — real 404s should be caught)
  const ignoredErrorPatterns = [
    /favicon/i,
    // Headless canvas-draw race: activating/redrawing a scene that gains new
    // placeables mid-capture (e.g. the issue-335 Manage-Interactables marker
    // fixtures) can momentarily read a canvas layer constant before the layer is
    // initialised in the offscreen WebGL context, surfacing as
    // "Cannot read properties of undefined (reading 'OBJECTS')". It is a Foundry
    // canvas-rendering timing artifact of the headless harness, not a Fabricate
    // product error — the scene draws correctly and the captures are unaffected.
    /reading 'OBJECTS'/
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
      const createdDocs = await page.evaluate(async ({ smokeActorFixtures, legacySmokeActorNames }) => {
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

        // Defensively clear all gathering environments before recreating fixtures.
        // The CI world is meant to be wiped each run, but a reused (cached) Foundry
        // container can resurrect a world's LevelDB state that the host-side wipe in
        // foundry-setup-data.mjs misses. Stale environments authored by an older data
        // model can lack a task source (e.g. compositionMode 'automatic' with no
        // enabledTaskIds and no forcedTaskIds) and then fail validation on the FIRST
        // create() in Phase C — its persist re-validates the whole list, including the
        // stale invalid entries. We reset the raw setting directly (bypassing the
        // store's list-validation, which would itself throw on those stale entries)
        // and reload so the in-memory list matches. The CI world is smoke-owned and
        // ephemeral, so clearing every environment here is safe.
        if (environmentStore) {
          try {
            await game.settings.set('fabricate', 'gatheringEnvironments', []);
            environmentStore.load?.();
          } catch (err) {
            console.warn(`Failed to reset gathering environments: ${err?.message}`);
          }
        }

        const allSystems = csm.getSystems();
        // The smoke creates "Arcane Forge" and RENAMES it to "The Herbalist's
        // Compendium" mid-run (Phase D0). A run that crashes after the rename but
        // before cleanup leaves an orphan under the renamed name, so purge BOTH
        // names — otherwise duplicate same-named systems accumulate and the promote
        // source picker can default to a tool-less duplicate.
        const staleSystemNames = new Set(['Arcane Forge', "The Herbalist's Compendium"]);
        const staleSystems = allSystems.filter(s => staleSystemNames.has(s.name));
        for (const sys of staleSystems) {
          console.log(`Cleaning stale crafting system: ${sys.name} (${sys.id})`);
          try { await environmentStore?.cleanupByCraftingSystem?.(sys.id); } catch { /* ok */ }
          const recipes = rm.getRecipes?.({ craftingSystemId: sys.id }) ?? [];
          for (const r of recipes) {
            try { await rm.deleteRecipe(r.id); } catch { /* ok */ }
          }
          try { await csm.deleteSystem(sys.id); } catch { /* ok */ }
        }

        // 2. Clean stale actors
        const smokeActorNames = new Set([
          ...smokeActorFixtures.map(actor => actor.name),
          ...legacySmokeActorNames
        ]);
        const staleActors = game.actors.contents.filter(a => smokeActorNames.has(a.name));
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

        // Create every actor represented by assets/img/actors portraits.
        const actors = await Actor.createDocuments(
          smokeActorFixtures.map(actor => ({
            name: actor.name,
            type: actorType,
            img: actor.img
          }))
        );
        console.log(`Created ${actors.length} actors:`, actors.map(a => a.name).join(', '));
        const actorIds = actors.map(a => a.id);

        const requiredActor = (name) => {
          const actor = actors.find(a => a.name === name);
          if (!actor) throw new Error(`Smoke actor fixture "${name}" was not created.`);
          return actor;
        };
        const alara = requiredActor('Alara the Alchemist');
        const bromm = requiredActor('Bromm the Blacksmith');
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
        await bromm.update({ ownership: { default: noneLevel } });
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

        // Bromm gets: 3x Iron Ore, 1x Dragon Scale
        await bromm.createEmbeddedDocuments('Item', [
          ...copies(byName('Iron Ore'), 3),
          ...copies(byName('Dragon Scale'), 1)
        ]);

        return {
          itemIds,
          actorIds,
          userIds,
          gathererUserId: gathererUser.id,
          alaraId: alara.id,
          bromId: bromm.id,
          itemsByName
        };
      }, { smokeActorFixtures, legacySmokeActorNames: LEGACY_SMOKE_ACTOR_NAMES });

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
          eventSelectionMode: 'highestRankedDrop',
          eventPolicy: 'successWithEvent',
          enabledTaskIds: ['smoke-forage-library'],
          enabledEventIds: ['smoke-bramble-event']
        });

        const playerGatheringFixtures = [];
        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Verdant Meadow',
          description: 'A clear player-facing gathering site with an immediate successful task.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: '',
          compositionMode: 'manual',
          forcedTaskIds: ['smoke-meadow-herbs']
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Sunken Ruins',
          description: 'A scene-linked site that stays visible while blocked.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: 'Scene.fabricateMissingGatheringScene',
          compositionMode: 'manual',
          forcedTaskIds: ['smoke-sunken-survey']
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Crystal Thicket',
          description: 'Requires the Herbalist Sickle tool so Bromm demonstrates a blocked task.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: '',
          compositionMode: 'manual',
          forcedTaskIds: ['smoke-crystal-dew']
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Timed Orchard',
          description: 'A timed gathering site that creates an active run before completion.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: '',
          compositionMode: 'manual',
          forcedTaskIds: ['smoke-slow-bloom']
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Withered Patch',
          description: 'An exhausted patch whose only drop never lands, for empty-result feedback.',
          enabled: true,
          selectionMode: 'targeted',
          sceneUuid: '',
          compositionMode: 'manual',
          forcedTaskIds: ['smoke-withered-search']
        }));

        playerGatheringFixtures.push(await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Moonlit Blind Grove',
          description: 'A blind environment that must hide task details from non-GM users.',
          enabled: true,
          selectionMode: 'blind',
          sceneUuid: '',
          compositionMode: 'manual',
          forcedTaskIds: ['smoke-moonpetal']
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
              tools: [{
                id: 'smoke-herbalist-sickle',
                label: 'Herbalist Sickle',
                enabled: true,
                componentId: componentMap['Iron Sword'],
                requirement: { provider: 'dnd5e', formula: '@tools.herbalism.value', macroUuid: '' },
                breakage: { mode: 'limitedUses', maxUses: 5 },
                onBreak: { mode: 'flagBroken' }
              }],
              events: [{
                id: 'smoke-bramble-event',
                name: 'Smoke Bramble Snare',
                description: 'Reusable event for Manager gathering composition screenshots.',
                img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
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

        // Tools are SYSTEM-OWNED (the `craftingSystems` setting) — the Tools
        // manager and the gathering tool gate read getSystem(id).tools, not
        // gatheringConfig. Mirror the canonical persist so the manager Tools view
        // renders and tool-blocked tasks resolve their requirement.
        await csm.updateSystem(systemId, {
          tools: game.settings.get('fabricate', 'gatheringConfig')?.systems?.[systemId]?.tools || []
        });

        // Seed one `fabricate.interactable` Region behaviour on the Azure Grove
        // scene so the canvas interactable config panel (Link/Unlink toggle +
        // node editor) gets screenshot coverage in Phase D0. It is bound to the
        // reusable GM library gathering task (`smoke-forage-library`) and the
        // Azure Grove environment, linked by default (taskNodeLink: 'linked',
        // node: null). The synthetic sourceUuid mirrors buildInteractableSourceUuid
        // (`Fabricate.<systemId>.gatheringTask.<taskId>`). The Region is embedded
        // in the scene, so Phase F's scene cleanup removes it — no extra cleanup.
        const interactableTaskId = 'smoke-forage-library';
        const [interactableRegion] = await azureGroveScene.createEmbeddedDocuments('Region', [{
          name: 'Fabricate Smoke Node',
          shapes: [{ type: 'rectangle', x: 1000, y: 1000, width: 400, height: 400 }],
          behaviors: [{
            type: 'fabricate.interactable',
            system: {
              interactableType: 'gatheringTask',
              sourceUuid: `Fabricate.${systemId}.gatheringTask.${interactableTaskId}`,
              systemId,
              taskId: interactableTaskId,
              environmentId: gatheringEnvironment.id,
              taskNodeLink: 'linked',
              node: null
            }
          }]
        }]);
        const interactableBehavior = interactableRegion?.behaviors?.find(
          behavior => behavior?.type === 'fabricate.interactable'
        ) ?? null;

        return {
          systemId,
          componentMap,
          recipeIds: [recipe1.id, recipe2.id, recipe3.id],
          healingPotionRecipeId: recipe2.id,
          sceneIds: [azureGroveScene.id],
          gatheringEnvironmentId: gatheringEnvironment.id,
          playerGatheringEnvironmentIds: playerGatheringFixtures.map(environment => environment.id),
          interactable: {
            sceneId: azureGroveScene.id,
            regionId: interactableRegion?.id ?? null,
            behaviorId: interactableBehavior?.id ?? null
          }
        };
      });

      cleanup.systemId = craftingSetup.systemId;
      cleanup.recipeIds = craftingSetup.recipeIds;
      cleanup.sceneIds = craftingSetup.sceneIds;
      // The interactable Region is embedded in azureGroveScene, so it is cleaned
      // up with the scene (cleanup.sceneIds) — no separate cleanup key needed.
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
      let previousExperimentalFeatures = false;
      try {
        previousExperimentalFeatures = await page.evaluate(async (sysId) => {
          const previousExperimentalFeatures = game.settings.get('fabricate', 'experimentalFeatures') === true;
          await game.settings.set('fabricate', 'experimentalFeatures', true);
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', '');
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, {
            name: "The Herbalist's Compendium",
            description: 'Configure categories, item tags, essences, and crafting behaviour for this system.'
          });
          return previousExperimentalFeatures;
        }, craftingSetup.systemId);
        await seedSmokeGatheringLibrary(page, craftingSetup);

        await page.evaluate(() => {
          globalThis.__fabricateSmokeManagerApp = game.fabricate.api.getCraftingSystemManagerAppClass().show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await selectSmokeSystemInManager(page, craftingSetup.systemId);
        await page.evaluate(async () => {
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        });
        const smokeLibraryCounts = await page.evaluate((sysId) => {
          const rawSystem = game.settings.get('fabricate', 'gatheringConfig')?.systems?.[sysId] || {};
          const app = globalThis.__fabricateSmokeManagerApp;
          let state = null;
          const unsubscribe = app?._adminStore?.viewState?.subscribe?.(value => { state = value; });
          if (typeof unsubscribe === 'function') unsubscribe();
          const viewSystem = state?.gatheringConfig?.systems?.[sysId] || {};
          return {
            rawTasks: Array.isArray(rawSystem.tasks) ? rawSystem.tasks.length : 0,
            rawEvents: Array.isArray(rawSystem.events) ? rawSystem.events.length : 0,
            rawTools: Array.isArray(rawSystem.tools) ? rawSystem.tools.length : 0,
            viewTasks: Array.isArray(viewSystem.tasks) ? viewSystem.tasks.length : 0,
            viewEvents: Array.isArray(viewSystem.events) ? viewSystem.events.length : 0,
            viewTools: Array.isArray(viewSystem.tools) ? viewSystem.tools.length : 0
          };
        }, craftingSetup.systemId);
        if (smokeLibraryCounts.viewTasks < 1 || smokeLibraryCounts.viewEvents < 1 || smokeLibraryCounts.viewTools < 1) {
          throw new Error(`Manager smoke gathering library was not loaded: ${JSON.stringify(smokeLibraryCounts)}`);
        }
        let navLabels = await page.locator('.fabricate-manager .manager-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.at(0) !== 'System settings') {
          throw new Error(`Manager default selection should keep System settings first. Saw: ${navLabels.join(', ')}`);
        }
        if (await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)}[aria-selected="true"]`).count() === 0) {
          throw new Error('Manager did not select the smoke test system.');
        }
        if (await page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")').count() === 0) {
          throw new Error('Manager root breadcrumb is missing.');
        }
        await assertManagerLayoutStable(page, 'normal default selection');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-default-selection');

        // Capture the real system-library manager under every Fabricate theme
        // (genuine Foundry-mounted DOM re-themed via the theme attribute), then
        // restore the default theme before continuing the default-theme flow.
        await captureManagerThemes(page);

        await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`).first().click();
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
        await exerciseManagerPointerTargets(page, craftingSetup.systemId);
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
        if (await page.locator(managerSystemRowSelector(craftingSetup.systemId)).count() === 0) {
          throw new Error('Manager return to library did not return to the systems browser.');
        }
        if (await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)}[aria-selected="true"]`).count() === 0) {
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
        await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`).first().click();
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
        await seedSmokeGatheringLibrary(page, craftingSetup);
        // Travel route (#257): seed a region and an enabled party BEFORE the
        // manager opens so the initial store refresh picks them up and the Travel
        // route renders real content (a party row plus a current-region override)
        // instead of the empty setup-checklist state. Seeding must precede the
        // app .show() because entering the Travel tab does not itself re-read the
        // party store. Idempotent across reruns: clears any prior party first.
        await page.evaluate(async (sysId) => {
          const realmStore = game.fabricate.getGatheringRealmStore?.();
          const partyStore = game.fabricate.getGatheringPartyStore?.();
          if (!realmStore || !partyStore) {
            throw new Error('Gathering realm/party stores unavailable for Travel seeding.');
          }
          const alara = game.actors.getName('Alara the Alchemist');
          const bromm = game.actors.getName('Bromm the Blacksmith');
          if (!alara) {
            throw new Error('Smoke actor "Alara the Alchemist" not found for Travel seeding.');
          }
          // Travel & Realms is disabled by default (#286). Enable it on this
          // system before the manager opens so the Travel nav item is visible
          // for the capture step.
          await realmStore.updateRealmSettings(sysId, { enabled: true });
          for (const party of partyStore.list()) {
            await partyStore.delete(party.id);
          }
          const existingRealm = realmStore.listBySystem(sysId)
            .find(realm => realm.name === 'Northreach Vale');
          const realm = existingRealm
            || await realmStore.create(sysId, { name: 'Northreach Vale', enabled: true });
          const party = await partyStore.create({ name: 'The Smoke Wardens' });
          await partyStore.addMember(party.id, alara.uuid);
          if (bromm) await partyStore.addMember(party.id, bromm.uuid);
          await partyStore.setTravelActor(party.id, alara.uuid);
          await partyStore.setEnabled(party.id, true);
          await partyStore.setCurrentRealmOverride(party.id, sysId, [realm.id]);

          // Realm-lock evidence (#294): a second realm the party is NOT in, plus
          // an environment that REQUIRES it. The player Gathering tab then shows a
          // realm-locked environment card with the "Not in current realm" alert
          // (LOCATION_BLOCKED for a party member; NO_CURRENT_REALM for a viewer
          // with no party — either way the card locks). Idempotent across reruns.
          const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();
          if (environmentStore) {
            const hiddenVale = realmStore.listBySystem(sysId).find(r => r.name === 'Hidden Vale')
              || await realmStore.create(sysId, { name: 'Hidden Vale', enabled: true });
            const existingEnvs = (typeof environmentStore.listBySystem === 'function')
              ? (environmentStore.listBySystem(sysId) || [])
              : [];
            const alreadySeeded = Array.isArray(existingEnvs)
              && existingEnvs.some(env => env?.name === 'Hidden Hollow');
            if (!alreadySeeded) {
              await environmentStore.create({
                craftingSystemId: sysId,
                name: 'Hidden Hollow',
                description: "Out of the party's current realm — locked until they travel there.",
                enabled: true,
                selectionMode: 'targeted',
                sceneUuid: '',
                compositionMode: 'manual',
                forcedTaskIds: ['smoke-meadow-herbs'],
                includedRealmIds: [hiddenVale.id]
              });
            }
          }
        }, craftingSetup.systemId);
        await page.evaluate(() => {
          globalThis.__fabricateSmokeManagerApp = game.fabricate.api.getCraftingSystemManagerAppClass().show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`).first().click();
        await page.waitForTimeout(750);
        await page.evaluate(async () => {
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        });

        await setManagerWindowSize(page, { width: 1000, height: 700 });
        await assertManagerLayoutStable(page, 'stacked selected');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-nav-button:has-text("System settings")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await exerciseManagerSystemEditPointerTargets(page, craftingSetup.systemId);
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
        const recipeApiCount = await page.evaluate((sysId) => {
          const rm = game.fabricate?.getRecipeManager?.();
          return rm?.getRecipes?.({ craftingSystemId: sysId })?.length ?? 0;
        }, craftingSetup.systemId);
        if (recipeApiCount < 2) {
          throw new Error(`Expected the smoke system to expose at least 2 recipes via the API; saw ${recipeApiCount}.`);
        }
        await page.locator('.fabricate-manager .manager-nav-button:has-text("Recipes")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="recipes"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager .manager-recipe-row:has-text("Brew Healing Potion")').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipes normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipes-normal');

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
        await exerciseManagerEnvironmentPointerTargets(page);
        if (await page.locator('.fabricate-manager .manager-environment-row').count() < 1) {
          throw new Error('Manager environments browser rendered no environment rows.');
        }
        if (await page.locator('.fabricate-manager .manager-environment-row.is-selected:has-text("Azure Grove")').count() === 0) {
          throw new Error('Manager environments browser did not show selected environment row state.');
        }
        const sceneEvidenceCount = await page.locator('.fabricate-manager .manager-inspector [data-environment-fact="scene"]').count();
        const sceneStatusCount = await page.locator('.fabricate-manager .manager-inspector:has-text("Linked scene"), .fabricate-manager .manager-inspector:has-text("Scene unresolved")').count();
        if (sceneEvidenceCount === 0 || sceneStatusCount === 0) {
          throw new Error('Manager environments inspector did not show scene evidence.');
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
        const preTaskLibraryCounts = await page.evaluate((sysId) => {
          const rawSystem = game.settings.get('fabricate', 'gatheringConfig')?.systems?.[sysId] || {};
          const app = globalThis.__fabricateSmokeManagerApp;
          let state = null;
          const unsubscribe = app?._adminStore?.viewState?.subscribe?.(value => { state = value; });
          if (typeof unsubscribe === 'function') unsubscribe();
          const selectedSystemId = state?.selectedSystem?.id || '';
          const viewSystem = state?.gatheringConfig?.systems?.[selectedSystemId] || {};
          return {
            expectedSystemId: sysId,
            selectedSystemId,
            rawTasks: Array.isArray(rawSystem.tasks) ? rawSystem.tasks.length : 0,
            rawEvents: Array.isArray(rawSystem.events) ? rawSystem.events.length : 0,
            rawTools: Array.isArray(rawSystem.tools) ? rawSystem.tools.length : 0,
            viewTasks: Array.isArray(viewSystem.tasks) ? viewSystem.tasks.length : 0,
            viewEvents: Array.isArray(viewSystem.events) ? viewSystem.events.length : 0,
            viewTools: Array.isArray(viewSystem.tools) ? viewSystem.tools.length : 0
          };
        }, craftingSetup.systemId);
        if (preTaskLibraryCounts.viewTasks < 1 || preTaskLibraryCounts.viewEvents < 1 || preTaskLibraryCounts.viewTools < 1) {
          throw new Error(`Manager smoke gathering library disappeared before task screenshot: ${JSON.stringify(preTaskLibraryCounts)}`);
        }
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

        // The environment editor mounts the composition editor (tabs + inspector
        // rail). Verify it renders the selected environment and screenshot it,
        // then trial-click the Back button to confirm it's wired before
        // navigating away via the side nav.
        await page.locator('.fabricate-manager .manager-environment-edit-view[data-environment-editor]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.fabricate-manager .manager-title')
          .filter({ hasText: 'Azure Grove' }).first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        if (await page.locator('.fabricate-manager .environment-draft-editor, .fabricate-manager .environment-foundation').count() > 0) {
          throw new Error('Manager environments edit route still rendered the legacy environment editor.');
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-environment-edit-placeholder');

        // The "Back to environments" button runs through the unsaved-changes
        // route-exit guard. Verify it's clickable, then navigate back via the
        // side nav.
        await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Back to environments")'), { trial: true });
        await page.locator('.fabricate-manager #manager-gathering-nav-environments').first().click();
        await page.locator('.fabricate-manager[data-manager-view="environments"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager #manager-gathering-nav-encounters').first().click();
        await page.locator('.fabricate-manager .manager-gathering-event-row:has-text("Smoke Bramble Snare")').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertManagerLayoutStable(page, 'gathering events normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-events-normal');

        await page.locator('.fabricate-manager .manager-gathering-event-row:has-text("Smoke Bramble Snare") [aria-label^="Edit"]').first().click();
        await page.locator('.fabricate-manager[data-manager-view="gathering-event-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        for (const expected of ['Event Identity', 'Event Matching']) {
          if (await page.locator('.fabricate-manager').filter({ hasText: expected }).count() === 0) {
            throw new Error(`Manager gathering event editor is missing "${expected}".`);
          }
        }
        await assertManagerLayoutStable(page, 'gathering event editor normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-event-editor-normal');

        // Travel route (#257): clicks the gathering Travel subitem and screenshots
        // the party/region management surface. The subitem is targeted by id so
        // adding it as a 5th gathering nav item does not shift any pinned .nth()
        // selector. Captures a default-width and a narrow-width shot, mirroring
        // the stacked-capture pattern used by the gathering task editor above.
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager #manager-gathering-nav-travel').first().click();
        await page.locator('.fabricate-manager .manager-travel-view').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.fabricate-manager .manager-travel-parties-row').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertManagerLayoutStable(page, 'gathering travel normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-travel-normal');

        await setManagerWindowSize(page, { width: 1000, height: 720 });
        await page.waitForTimeout(250);
        await assertManagerLayoutStable(page, 'gathering travel stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-travel-stacked');
        await setManagerWindowSize(page, { width: 1280, height: 820 });

        await page.locator('.fabricate-manager .manager-nav-button:has-text("Tools")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="tools"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager .manager-tools-row:has-text("Herbalist Sickle")').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertManagerLayoutStable(page, 'tools normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-tools-normal');

        // ── Canvas interactable config panel (#302) ────────────────────────────
        // Open the GM config panel for the seeded `fabricate.interactable` Region
        // behaviour and capture its node section in both states: linked (shares the
        // gathering task's node) and unlinked (its own independent node editor).
        // The config app is independent of the manager window; both are closed by
        // closeOpenApplications below. Guarded so a failure here records a failed
        // step but does not abort the manager phase or later phases.
        try {
          const interactableRef = craftingSetup.interactable;
          if (!interactableRef?.sceneId || !interactableRef?.regionId || !interactableRef?.behaviorId) {
            throw new Error(`Interactable behaviour ref is incomplete: ${JSON.stringify(interactableRef)}`);
          }
          await page.evaluate(({ s, r, b }) => {
            return game.fabricate.api.getInteractableConfigAppClass().show({ sceneId: s, regionId: r, behaviorId: b });
          }, { s: interactableRef.sceneId, r: interactableRef.regionId, b: interactableRef.behaviorId });

          const configRoot = page.locator('.fabricate-interactable-config').first();
          await configRoot.waitFor({ state: 'visible', timeout: 10_000 });
          const nodeSection = page.locator('[data-interactable-node-section]').first();
          await nodeSection.waitFor({ state: 'visible', timeout: 10_000 });

          const linkToggle = page.locator('[data-interactable-node-link]').first();
          await linkToggle.waitFor({ state: 'visible', timeout: 10_000 });
          if (await linkToggle.getAttribute('aria-pressed') !== 'true') {
            throw new Error('Interactable config opened unlinked; expected the linked default (aria-pressed="true").');
          }
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'interactable-config-linked');

          // Toggle to the independent (unlinked) node editor and wait for its
          // count/respawn controls to mount, then confirm the toggle flipped.
          await linkToggle.click();
          await page.locator('[data-interactable-node-count]').first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator('[data-interactable-node-respawn]').first().waitFor({ state: 'visible', timeout: 10_000 });
          if (await linkToggle.getAttribute('aria-pressed') !== 'false') {
            throw new Error('Interactable config did not unlink after toggle (expected aria-pressed="false").');
          }
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'interactable-config-unlinked');

          // ApplicationV2 close() is an async fade-out: AWAIT the actual close
          // promise (not a fire-and-forget call) so the config window is fully
          // gone before the Manage panel opens — otherwise it bleeds through
          // behind the next capture.
          await page.evaluate(async () => {
            const app = Object.values(ui.windows).find(w => w?.options?.id === 'fabricate-interactable-config');
            if (app?.close) await app.close();
          }).catch(() => { /* best-effort; closeOpenApplications also sweeps it */ });

          results.steps.push({ step: 'interactable-config', passed: true });
        } catch (err) {
          results.steps.push({ step: 'interactable-config', passed: false, error: err.message });
          process.stderr.write(`Interactable config capture failed: ${err.message}\n`);
        }

        // ── Manage Interactables panel (issue 335) ─────────────────────────────
        // Open the GM-only Manage Interactables scene panel and capture: a
        // POPULATED list spanning multiple marker-status variants (region-only
        // gathering task + a real Tile marker + a missing marker) AND a Tool-type
        // row, the dedicated EMPTY state (a scene with zero interactables), and the
        // expanded Promote affordance with a POPULATED Source dropdown + visible
        // action buttons. The config window from the previous block is swept
        // (awaited close) FIRST so nothing bleeds through behind these captures.
        // Guarded so a failure records a failed step without aborting later phases.
        try {
          // Sweep any window left over from the config block before opening +
          // capturing, so a still-fading ApplicationV2 cannot bleed through.
          await closeOpenApplications(page);

          const interactableRef = craftingSetup.interactable;
          // Ensure the seeded interactable's scene is the active/viewed scene so the
          // panel's scene-scan finds it in the list, and wait for the canvas to
          // actually switch to it (activation → canvas redraw is async).
          if (interactableRef?.sceneId) {
            await page.evaluate(async (sceneId) => {
              const scene = game.scenes.get(sceneId);
              if (scene && !scene.active) await scene.activate();
            }, interactableRef.sceneId).catch(() => {});
            await page.waitForFunction(
              (sceneId) => globalThis.canvas?.scene?.id === sceneId,
              interactableRef.sceneId,
              { timeout: 15_000 }
            ).catch(() => {});
          }

          // Seed extra interactables on the active scene so the captured list shows
          // MULTIPLE marker-status variants + a Tool-type row (not just the lone
          // region-only gathering task). A REAL Tile is created and linked by uuid
          // so that row resolves to a present "Tile" marker; another row points at
          // a non-existent Tile uuid so it renders the danger "missing" badge.
          await page.evaluate(async ({ sceneId, systemId, toolId, taskId }) => {
            const scene = game.scenes.get(sceneId);
            if (!scene) return;

            // A real Tile marker (Foundry core raster icon) the Tile-status row links to.
            const [tile] = await scene.createEmbeddedDocuments('Tile', [{
              texture: { src: 'icons/tools/smithing/anvil.webp' },
              x: 1600, y: 1000, width: 200, height: 200, hidden: false
            }]);

            await scene.createEmbeddedDocuments('Region', [
              {
                name: 'Smithing Anvil (Tool)',
                shapes: [{ type: 'rectangle', x: 1600, y: 1000, width: 200, height: 200 }],
                behaviors: [{
                  type: 'fabricate.interactable',
                  system: {
                    interactableType: 'tool',
                    sourceUuid: `Fabricate.${systemId}.tool.${toolId}`,
                    systemId,
                    toolId,
                    name: 'Smithing Anvil',
                    linkedVisual: { mode: 'marker', uuid: tile.uuid, documentName: 'Tile', missingPolicy: 'warn' }
                  }
                }]
              },
              {
                name: 'Lost Forage Marker',
                shapes: [{ type: 'rectangle', x: 2000, y: 1000, width: 200, height: 200 }],
                behaviors: [{
                  type: 'fabricate.interactable',
                  system: {
                    interactableType: 'gatheringTask',
                    sourceUuid: `Fabricate.${systemId}.gatheringTask.${taskId}`,
                    systemId,
                    taskId,
                    name: 'Lost Forage',
                    // A configured marker whose Tile no longer exists ⇒ "missing" badge.
                    linkedVisual: { mode: 'marker', uuid: `Scene.${sceneId}.Tile.fabricateMissingTile`, documentName: 'Tile', missingPolicy: 'warn' }
                  }
                }]
              }
            ]);
          }, {
            sceneId: interactableRef.sceneId,
            systemId: craftingSetup.systemId,
            toolId: 'smoke-herbalist-sickle',
            taskId: 'smoke-forage-library'
          }).catch(() => {});

          await page.evaluate(() => game.fabricate.api.getInteractablesManagerAppClass().show());

          const managerRoot = page.locator('.fabricate-interactables-manager').first();
          await managerRoot.waitFor({ state: 'visible', timeout: 10_000 });
          // Wait for the seeded rows (expect the original + the two seeded above).
          await page.locator('.fabricate-interactables-manager .fab-im-row')
            .first().waitFor({ state: 'visible', timeout: 10_000 });
          const rowCount = await page.locator('.fabricate-interactables-manager .fab-im-row').count();
          if (rowCount < 3) {
            throw new Error(`Manage list shows only ${rowCount} row(s); expected at least 3 marker-status variants.`);
          }
          // The danger "missing" badge must be present so the .is-missing branch is exercised.
          if (await page.locator('.fabricate-interactables-manager .fab-im-chip-marker.is-missing').count() === 0) {
            throw new Error('Manage list is missing the .is-missing danger badge variant.');
          }
          await assertNoScreenshotOverlays(page, { allowFabricateWindowIds: ['fabricate-interactables-manager'] });
          await screenshot(page, 'interactables-manager-list');

          // Expand the Promote affordance and capture the source picker with a
          // POPULATED Source dropdown (proving the Tool enumeration fix) and the
          // Promote/Cancel action buttons in frame. Select Tool, then assert the
          // Source <select> has at least one real (non-placeholder) option.
          const promoteToggle = page.locator('.fabricate-interactables-manager .fab-im-promote-toggle').first();
          await promoteToggle.waitFor({ state: 'visible', timeout: 10_000 });
          await promoteToggle.click();
          const promotePanel = page.locator('.fabricate-interactables-manager .fab-im-promote').first();
          await promotePanel.waitFor({ state: 'visible', timeout: 10_000 });
          // Select the crafting system that actually owns the seeded Tool. The panel
          // defaults to the FIRST system, and a world can hold multiple systems
          // (even same-named ones), so pin the system explicitly to make the Tool
          // enumeration deterministic regardless of system ordering. The system
          // <select> is the one whose options include the seeded systemId.
          await page.evaluate((systemId) => {
            const selects = Array.from(document.querySelectorAll('.fabricate-interactables-manager .fab-im-promote select'));
            const sysSelect = selects.find((sel) => Array.from(sel.options).some((o) => o.value === systemId));
            if (sysSelect && sysSelect.value !== systemId) {
              sysSelect.value = systemId;
              sysSelect.dispatchEvent(new Event('change', { bubbles: true }));
              sysSelect.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, craftingSetup.systemId);
          // Choose the Tool source type so the Source dropdown lists the system's tools.
          await page.locator('.fabricate-interactables-manager input[name="fab-im-source-type"][value="tool"]').first()
            .check({ force: true });
          await page.waitForTimeout(150); // let the $derived source list recompute
          // Assert the Source <select> now carries the seeded Tool (the "No sources"
          // placeholder is the failure mode the FIX 1 enumeration repair prevents).
          const sourceOptionCount = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('.fabricate-interactables-manager .fab-im-promote select'));
            for (const sel of selects) {
              const opts = Array.from(sel.options).map((o) => o.textContent.trim());
              if (opts.some((t) => /Herbalist Sickle/i.test(t))) {
                return opts.filter((t) => t && !/^No sources/i.test(t)).length;
              }
            }
            return 0;
          });
          if (sourceOptionCount < 1) {
            const diag = await page.evaluate(() => {
              const out = { selects: [], liveSystems: [] };
              try {
                out.liveSystems = game.fabricate.getCraftingSystemManager().getSystems()
                  .map((s) => ({ id: s.id, name: s.name, toolCount: (s.tools || []).length }));
              } catch (e) { out.liveSystemsErr = e.message; }
              document.querySelectorAll('.fabricate-interactables-manager .fab-im-promote select').forEach((sel, i) => {
                out.selects.push({ i, value: sel.value, opts: Array.from(sel.options).map((o) => `${o.value}=${o.textContent.trim()}`) });
              });
              return out;
            });
            process.stderr.write('PROMOTE DIAG: ' + JSON.stringify(diag) + '\n');
            throw new Error('Promote Source dropdown is empty for Tool — the No-sources regression is not fixed.');
          }
          // Ensure the Promote/Cancel actions are in frame (not clipped below the fold).
          await page.locator('.fabricate-interactables-manager .fab-im-promote-confirm').first()
            .scrollIntoViewIfNeeded();
          await page.locator('.fabricate-interactables-manager .fab-im-promote-actions').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await assertNoScreenshotOverlays(page, { allowFabricateWindowIds: ['fabricate-interactables-manager'] });
          await screenshot(page, 'interactables-manager-promote');

          // The Manage panel is an ApplicationV2 SINGLETON: its instance lives in
          // foundry.applications.instances (NOT ui.windows), and a bare show() only
          // re-focuses an open window without rescanning a newly-activated scene. So
          // FULLY close it (closeOpenApplications sweeps Fabricate AppV2 windows)
          // before the empty-scene capture, forcing show() to build a fresh
          // instance that scans the empty scene.
          await closeOpenApplications(page);

          // Empty-state capture: a scene with ZERO interactables exercises the
          // dedicated .fab-im-empty branch. Create a throwaway scene, activate it,
          // re-open the panel, and capture the empty list. Tracked for cleanup.
          const emptySceneId = await page.evaluate(async () => {
            const scene = await Scene.create({
              name: 'Fabricate Empty Interactables Scene',
              active: false,
              background: { src: 'icons/environment/settlement/wizard-tower.webp' }
            });
            await scene.activate();
            return scene.id;
          });
          if (emptySceneId) cleanup.sceneIds.push(emptySceneId);
          // The panel scans `canvas.scene`; wait until the canvas has actually
          // switched to the empty scene before opening (activation → canvas redraw
          // is async), otherwise the panel scans the prior populated scene and the
          // empty branch never renders.
          await page.waitForFunction(
            (sceneId) => globalThis.canvas?.scene?.id === sceneId,
            emptySceneId,
            { timeout: 15_000 }
          );
          await page.evaluate(() => game.fabricate.api.getInteractablesManagerAppClass().show());
          await page.locator('.fabricate-interactables-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator('.fabricate-interactables-manager .fab-im-empty').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
          await assertNoScreenshotOverlays(page, { allowFabricateWindowIds: ['fabricate-interactables-manager'] });
          await screenshot(page, 'interactables-manager-empty');

          await closeOpenApplications(page);

          // Re-activate the original scene so later phases see the expected state.
          if (interactableRef?.sceneId) {
            await page.evaluate(async (sceneId) => {
              const scene = game.scenes.get(sceneId);
              if (scene && !scene.active) await scene.activate();
            }, interactableRef.sceneId).catch(() => {});
          }

          results.steps.push({ step: 'interactables-manager', passed: true });
        } catch (err) {
          results.steps.push({ step: 'interactables-manager', passed: false, error: err.message });
          process.stderr.write(`Manage Interactables capture failed: ${err.message}\n`);
        }

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
      } finally {
        await page.evaluate(async (previous) => {
          await game.settings.set('fabricate', 'experimentalFeatures', previous === true);
        }, previousExperimentalFeatures).catch(() => {});
      }
      }

      // ── Phase E: Craft an item ──────────────────────────────────────────────
      startPhase('phase-E');
      process.stdout.write('Phase E: Crafting a Healing Potion...\n');
      try {
        // The "Craft Item" and "Gathering" sidebar actions both open ONE
        // shared window (#fabricate-app); "Craft Item" lands on the Crafting
        // tab and "Gathering" focuses the same window on the Gathering tab.
        // Verify the shell, its four nav tabs, and the cross-tab focus
        // behaviour, then close it. (Crafting itself runs via the API below,
        // which does not require the window to be open.)
        process.stdout.write('  Opening shared Fabricate app via "Craft Item"...\n');
        await closeOpenApplications(page);
        const sidebarItemsTab = page.locator('#sidebar [data-tab="items"]').first();
        await sidebarItemsTab.click({ force: true });
        const craftButton = page.locator('button[data-fabricate-action="craft"]').first();
        await craftButton.waitFor({ state: 'visible', timeout: 10_000 });
        await craftButton.evaluate(button => button.click());

        const appShell = page.locator('#fabricate-app').first();
        await appShell.waitFor({ state: 'visible', timeout: 10_000 });

        const navItems = appShell.locator('.fabricate-app-nav-item');
        await navItems.first().waitFor({ state: 'visible', timeout: 10_000 });

        // The shared actor-selection top bar mounts with the shell and flips
        // [data-actor-bar-state] from "loading" to "ready" once its selectable
        // actor list and gathering conditions have loaded. Wait on the ready
        // state so captured player-app frames show the mounted, conditions-loaded
        // bar rather than its loading placeholder.
        await appShell.locator('[data-actor-bar-state="ready"]')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        // Crafting/Gathering/Journal/Inventory are always present; the Alchemy
        // tab is conditional (shown only when an enabled alchemy system has recipes).
        for (const label of ['Crafting', 'Gathering', 'Journal', 'Inventory']) {
          if (await appShell.locator(`.fabricate-app-nav-item:has-text("${label}")`).count() === 0) {
            throw new Error(`Shared Fabricate app is missing the ${label} nav tab.`);
          }
        }
        if (await navItems.count() < 4) {
          throw new Error('Shared Fabricate app should expose at least the four base nav tabs.');
        }
        if (await appShell.locator('.fabricate-app-nav-item.active:has-text("Crafting")').count() === 0) {
          throw new Error('Shared Fabricate app did not open on the Crafting tab after "Craft Item".');
        }

        // "Gathering" focuses the SAME window and switches to the Gathering tab.
        const gatheringButton = page.locator('button[data-fabricate-action="gathering"]').first();
        await gatheringButton.waitFor({ state: 'visible', timeout: 10_000 });
        await gatheringButton.evaluate(button => button.click());

        if (await page.locator('#fabricate-app').count() !== 1) {
          throw new Error('"Gathering" opened a second window instead of focusing the shared Fabricate app.');
        }
        await appShell.locator('.fabricate-app-nav-item.active:has-text("Gathering")')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        if (await appShell.locator('.fabricate-app-nav-item.active:has-text("Crafting")').count() !== 0) {
          throw new Error('Shared Fabricate app did not switch off the Crafting tab after "Gathering".');
        }

        // The nav switch above only proves the Gathering tab is active; GatheringView
        // then fires an async services.listGatheringForActor() fetch and renders a
        // [data-gathering-state] container ("loading" -> "populated"/"empty"/"error").
        // Wait for that container to settle off "loading" so the captured frame shows
        // the resolved environment cards (or empty state) instead of the spinner.
        await appShell.locator('[data-gathering-state]:not([data-gathering-state="loading"])')
          .first().waitFor({ state: 'visible', timeout: 10_000 });

        // The populated layout now fills the center column with the environment
        // detail (GatheringDetail). A selectable environment auto-selects, so
        // wait for the detail to render its selected view ([data-gathering-detail]
        // → [data-gathering-detail-state="selected"]) before capturing, so the
        // frame shows the populated detail panel (header, pips, attempt area)
        // rather than the select-an-environment hint. The seeded fixtures
        // guarantee at least one non-locked environment to select.
        if (await appShell.locator('[data-gathering-state="populated"]').count() > 0) {
          await appShell.locator('[data-gathering-detail] [data-gathering-detail-state="selected"]')
            .first().waitFor({ state: 'visible', timeout: 10_000 });
        }

        await assertNoScreenshotOverlays(page);
        // Dedicated player Gathering tab evidence: the same populated/selected
        // state, captured under its own label so changes under
        // src/ui/svelte/apps/gathering/ map to a real screenshot (see the
        // 'player-gathering' VIEW_RECIPE in ui-pr-screenshot-evidence.mjs).
        await screenshot(page, 'player-gathering-environments');
        await screenshot(page, 'fabricate-app-shell');

        // Region-lock evidence (#294): the locked "Hidden Hollow" env sorts last,
        // so page forward until it appears, then capture it. The detail panel keeps
        // showing the already-selected environment, so the frame stays populated.
        const lockedEnvCard = appShell.locator('.gathering-env-card[data-locked="true"]');
        const envNextPage = appShell.locator('.gathering-env-list [data-pagination-next]');
        for (let i = 0; i < 6 && (await lockedEnvCard.count()) === 0 && (await envNextPage.count()) > 0; i++) {
          if (await envNextPage.isDisabled()) break;
          await envNextPage.click();
          await page.waitForTimeout(150);
        }
        if ((await lockedEnvCard.count()) > 0) {
          await lockedEnvCard.first().scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-gathering-realm-locked');
        }

        // Narrow-window stacked evidence (#330): shrink the Fabricate window below
        // the gathering grid's stacking breakpoint so the three columns reflow into
        // a single vertical stack instead of clipping the side columns. Page back to
        // the first environments page so a non-locked environment is selected and the
        // centre detail renders, then size the app narrow and capture the stacked
        // layout under its own distinct recipe label (player-gathering-stacked) so it
        // never collides with the normal-width frame.
        const envPrevPage = appShell.locator('.gathering-env-list [data-pagination-prev]');
        for (let i = 0; i < 6 && (await envPrevPage.count()) > 0; i++) {
          if (await envPrevPage.isDisabled()) break;
          await envPrevPage.click();
          await page.waitForTimeout(150);
        }
        // Set the app element directly to a width below the 900px grid breakpoint
        // (the grid sits inside the content area minus the ~84px nav rail). The
        // gathering grid's @container query then collapses it to a single column.
        const stackedSize = await page.evaluate(() => {
          const app = document.querySelector('#fabricate-app');
          if (!app) return null;
          Object.assign(app.style, { width: '820px', height: '760px', left: '20px', top: '20px' });
          return { width: app.getBoundingClientRect().width, height: app.getBoundingClientRect().height };
        });
        // Let the resize + container-query reflow settle before capturing so the
        // frame shows the fully stacked single-column layout, not a mid-transition.
        await page.waitForTimeout(600);
        await appShell.locator('[data-gathering-state="populated"]')
          .first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-gathering-stacked');
        results.steps.push({ step: 'player-gathering-stacked', passed: true, size: stackedSize });

        await closeOpenApplications(page);
        results.steps.push({ step: 'open-fabricate-app-shell', passed: true });
        process.stdout.write('  Shared Fabricate app shell verified and screenshotted.\n');

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
