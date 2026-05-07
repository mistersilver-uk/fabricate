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
const WORLD_ID = 'fabricate-smoke-ci';

// Smoke profile selector. Default `full` runs every phase including
// the manager-v2 screenshot suite (Phase D0) and the legacy Recipe
// Manager screenshots (Phase D), which together regenerate ~26
// reference artifacts for visual verification. Set
// FOUNDRY_SMOKE_PROFILE=ci to skip those phases — CI exercises module
// load + system creation + crafting end-to-end (Phases B, C, E, F)
// and finishes much faster, leaving the screenshot suite for local
// developer use.
const SMOKE_PROFILE = String(process.env.FOUNDRY_SMOKE_PROFILE ?? 'full').toLowerCase();
const RUN_SCREENSHOT_PHASES = SMOKE_PROFILE !== 'ci';
const JOIN_BUTTON_SELECTOR = 'button:has-text("Join Game Session"), button[name="join"]';
const JOIN_USER_SELECT_SELECTOR = 'select[name="userid"]';
const JOIN_USER_TILE_SELECTOR = '[data-user-id]';

/** @type {string[]} */
const consoleErrors = [];
/** @type {string[]} */
const consoleLog = [];

// ── Screenshot counter ──────────────────────────────────────────────────────
let screenshotCounter = 0;

/**
 * Take a screenshot with an auto-incrementing numeric prefix.
 * @param {import('playwright').Page} page
 * @param {string} label
 */
async function screenshot(page, label) {
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
 * Resize the rendered Recipe Manager application frame for responsive
 * screenshots without changing the browser viewport used by other phases.
 * @param {import('playwright').Page} page
 * @param {{ width: number, height: number }} size
 */
async function setRecipeManagerWindowSize(page, { width, height }) {
  await page.setViewportSize({
    width: Math.max(1366, width + 80),
    height: Math.max(768, height + 80)
  });
  await page.evaluate(({ width, height }) => {
    const admin = document.querySelector('.fabricate-admin');
    const app = admin?.closest('.application, .app') || document.querySelector('#fabricate-recipe-manager');
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
 * Resize the rendered Crafting System Manager V2 application frame for
 * responsive screenshots and hit testing.
 * @param {import('playwright').Page} page
 * @param {{ width: number, height: number }} size
 */
async function setManagerV2WindowSize(page, { width, height }) {
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
      const manager = document.querySelector('.fabricate-manager-v2');
      const app = manager?.closest('.application, .app') || document.querySelector('#fabricate-crafting-system-manager-v2');
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
    `setManagerV2WindowSize evaluate ${width}x${height}`
  );
  await page.waitForTimeout(500);
}

/**
 * Assert manager-v2 table rows and summary regions do not horizontally overflow.
 * @param {import('playwright').Page} page
 * @param {string} label
 */
async function assertManagerV2LayoutStable(page, label) {
  const metrics = await withDeadline(page.evaluate(() => {
    const selectors = [
      '.fabricate-manager-v2',
      '.manager-v2-main',
      '.manager-v2-table-scroll',
      '.manager-v2-system-row',
      '.manager-v2-system-identity',
      '.manager-v2-recipes-table',
      '.manager-v2-recipe-row',
      '.manager-v2-recipe-identity',
      '.manager-v2-environments-table',
      '.manager-v2-environment-row',
      '.manager-v2-environment-identity',
      '.manager-v2-environment-editor-shell',
      '.manager-v2-component-row',
      '.manager-v2-component-identity',
      '.manager-v2-essence-row',
      '.manager-v2-vocabulary-row',
      '.manager-v2-inspector-card',
      '.manager-v2-system-edit-form',
      '.manager-v2-edit-card',
      '.manager-v2-toggle-row',
      '.manager-v2-essence-edit-view',
      '.environment-draft-editor',
      '.manager-v2-environment-edit-view',
      '.manager-v2-environment-workspace',
      '.environment-fields',
      '.environment-task-layout',
      '.manager-v2-fact'
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
  }), 30_000, `assertManagerV2LayoutStable ${label}`);

  const overflowing = metrics.filter(metric => metric.scrollWidth > metric.clientWidth + 2);
  if (overflowing.length > 0) {
    throw new Error(`Manager V2 horizontal overflow at ${label}: ${JSON.stringify(overflowing.slice(0, 5))}`);
  }

  const rowCount = metrics.filter(metric =>
    metric.selector === '.manager-v2-system-row'
      || metric.selector === '.manager-v2-recipe-row'
      || metric.selector === '.manager-v2-environment-row'
      || metric.selector === '.manager-v2-component-row'
      || metric.selector === '.manager-v2-essence-row'
      || metric.selector === '.manager-v2-vocabulary-row'
  ).length;
  const editFormCount = metrics.filter(metric =>
    metric.selector === '.manager-v2-system-edit-form'
      || metric.selector === '.manager-v2-environment-editor-shell'
      || metric.selector === '.manager-v2-environment-edit-view'
      || metric.selector === '.manager-v2-essence-edit-view'
      || metric.selector === '.environment-draft-editor'
  ).length;
  if (rowCount === 0 && editFormCount === 0) {
    throw new Error(`Manager V2 rendered no table rows at ${label}`);
  }
}

/**
 * Exercise manager-v2 pointer targets without triggering destructive actions.
 * @param {import('playwright').Page} page
 */
async function exerciseManagerV2PointerTargets(page) {
  const search = page.locator('.fabricate-manager-v2 input[type="search"]').first();
  await search.fill('forge');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager-v2 .manager-v2-filter select').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager-v2 .manager-v2-filter select').first().selectOption('all');

  await page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist") .manager-v2-system-identity').first().click();
  await page.locator('.fabricate-manager-v2 .manager-v2-nav-button:has-text("Recipes")').first().click();
  await page.locator('.fabricate-manager-v2 .manager-v2-breadcrumbs button:has-text("The Herbalist")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-breadcrumbs button:has-text("Crafting Systems")').first().click();
  await page.locator('.fabricate-manager-v2 .manager-v2-scope-return').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Import")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Open current admin")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Export")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Create")').first().click({ trial: true });
  const rowActionButtons = page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist") .manager-v2-icon-button');
  for (let index = 0; index < await rowActionButtons.count(); index += 1) {
    await rowActionButtons.nth(index).click({ trial: true });
  }
}

/**
 * Exercise manager-v2 system edit controls without saving destructive changes.
 * @param {import('playwright').Page} page
 */
async function exerciseManagerV2SystemEditPointerTargets(page) {
  if (await page.locator('.fabricate-manager-v2 #manager-v2-system-name').count() === 0) {
    let editButton = page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist") .manager-v2-icon-button').nth(0);
    if (await editButton.count() === 0) {
      const systemsBreadcrumb = page.locator('.fabricate-manager-v2 .manager-v2-breadcrumbs button:has-text("Crafting Systems")').first();
      if (await systemsBreadcrumb.count() > 0) {
        await systemsBreadcrumb.click();
        await page.waitForTimeout(500);
      }
      const search = page.locator('.fabricate-manager-v2 input[type="search"]').first();
      if (await search.count() > 0) {
        await search.fill('');
        await page.waitForTimeout(250);
      }
      await page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist")').first().waitFor({ state: 'visible', timeout: 5_000 });
      editButton = page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist") .manager-v2-icon-button').nth(0);
    }
    await editButton.click();
  }
  await page.locator('.fabricate-manager-v2[data-manager-v2-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('.fabricate-manager-v2 #manager-v2-system-name').first().fill('The Herbalist');
  await page.locator('.fabricate-manager-v2 #manager-v2-system-description').first().fill('A field alchemy system for gathering herbs and brewing reliable remedies.');
  await page.locator('.fabricate-manager-v2 #manager-v2-system-resolution-mode').first().selectOption('mapped');
  await page.locator('.dialog button:has-text("No")').first().click();
  await page.locator('.fabricate-manager-v2 [data-edit-control="advanced-options"] input').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 [data-feature-key="gathering"] input').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Open current admin")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Back to systems")').first().click({ trial: true });
}

/**
 * Exercise manager-v2 recipe browser pointer targets without mutating recipes.
 * @param {import('playwright').Page} page
 */
async function exerciseManagerV2RecipePointerTargets(page) {
  await page.locator('.fabricate-manager-v2 .manager-v2-nav-button:has-text("Recipes")').first().click();
  await page.locator('.fabricate-manager-v2 .manager-v2-recipe-row').first().waitFor({ state: 'visible', timeout: 5_000 });

  const search = page.locator('.fabricate-manager-v2 input[aria-label="Search recipes"]').first();
  await search.fill('Brew');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager-v2 select[aria-label="Filter recipes by status"]').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager-v2 select[aria-label="Filter recipes by status"]').first().selectOption('all');

  const categoryFilter = page.locator('.fabricate-manager-v2 select[aria-label="Filter recipes by category"]').first();
  if (await categoryFilter.count() > 0) {
    await categoryFilter.selectOption({ index: 1 });
    await page.waitForTimeout(250);
    await categoryFilter.selectOption('all');
    await page.waitForTimeout(250);
  }

  await search.fill('');
  await page.locator('.fabricate-manager-v2 select[aria-label="Filter recipes by status"]').first().selectOption('all');
  await page.waitForTimeout(250);
  const recipeRow = page.locator('.fabricate-manager-v2 .manager-v2-recipe-row').first();
  await recipeRow.waitFor({ state: 'visible', timeout: 5_000 });
  await recipeRow.locator('.manager-v2-recipe-identity').click();
  await recipeRow.locator('.manager-v2-toggle input').click({ trial: true });
  await recipeRow.locator('.manager-v2-icon-button').nth(0).click({ trial: true });
  await recipeRow.locator('.manager-v2-icon-button').nth(1).click({ trial: true });
  await recipeRow.locator('.manager-v2-icon-button').nth(2).click({ trial: true });

  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Import")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Export")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Create Recipe")').first().click({ trial: true });
}

/**
 * Exercise manager-v2 environment browser pointer targets without mutating
 * environments.
 * @param {import('playwright').Page} page
 */
async function exerciseManagerV2EnvironmentPointerTargets(page) {
  await page.locator('.fabricate-manager-v2 .manager-v2-nav-button:has-text("Environments")').first().click();
  await page.locator('.fabricate-manager-v2 .manager-v2-environment-row').first().waitFor({ state: 'visible', timeout: 5_000 });

  const search = page.locator('.fabricate-manager-v2 input[aria-label="Search environments"]').first();
  await search.fill('Azure');
  await page.waitForTimeout(250);
  await search.fill('');
  await page.waitForTimeout(250);

  await page.locator('.fabricate-manager-v2 select[aria-label="Filter environments by status"]').first().selectOption('active');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager-v2 select[aria-label="Filter environments by status"]').first().selectOption('all');
  await page.locator('.fabricate-manager-v2 select[aria-label="Filter environments by selection mode"]').first().selectOption('targeted');
  await page.waitForTimeout(250);
  await page.locator('.fabricate-manager-v2 select[aria-label="Filter environments by selection mode"]').first().selectOption('all');

  const azureRow = page.locator('.fabricate-manager-v2 .manager-v2-environment-row:has-text("Azure Grove")').first();
  await azureRow.waitFor({ state: 'visible', timeout: 5_000 });
  await azureRow.locator('.manager-v2-environment-identity').click();
  await azureRow.locator('.manager-v2-status-toggle').click({ trial: true });
  await azureRow.locator('.manager-v2-icon-button').nth(0).click({ trial: true });
  await azureRow.locator('.manager-v2-icon-button').nth(1).click({ trial: true });
  await azureRow.locator('.manager-v2-icon-button').nth(2).click({ trial: true });
  const moveUp = azureRow.locator('.manager-v2-icon-button').nth(3);
  if (await moveUp.isEnabled()) await moveUp.click({ trial: true });
  const moveDown = azureRow.locator('.manager-v2-icon-button').nth(4);
  if (await moveDown.isEnabled()) await moveDown.click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-inspector-actions .manager-v2-button:has-text("Edit environment")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-inspector-actions .manager-v2-button:has-text("Duplicate environment")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-inspector-actions .manager-v2-button:has-text("Disable environment")').first().click({ trial: true });
  await page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Create environment")').first().click({ trial: true });
}

/**
 * Dismiss global Foundry notifications that can cover screenshot targets.
 * @param {import('playwright').Page} page
 */
async function dismissFoundryNotifications(page) {
  await page.evaluate(() => {
    document
      .querySelectorAll('#notifications .notification, body > .notification, .notification')
      .forEach(notification => {
        try { notification.remove(); } catch { /* ignore */ }
      });
  });
  await page.waitForTimeout(300);
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
    '#fabricate-crafting-system-manager-v2 button[data-action="close"]',
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
        if (element.querySelector?.('.fabricate-admin, .fabricate-gathering-app') || element.id?.startsWith?.('fabricate-')) {
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

    const remaining = await page.locator('.fabricate-admin, .fabricate-gathering-app, button:has-text("Discard Changes")').count();
    if (remaining === 0) break;
  }
}

/**
 * Put the Environments editor in a validation-rich draft state for screenshot
 * inspection while leaving persistence behavior untouched.
 * @param {import('playwright').Page} page
 */
async function prepareGmEnvironmentsScreenshotState(page) {
  await page.locator('.environment-draft-editor, .manager-v2-environment-edit-view').first().waitFor({ state: 'visible', timeout: 10_000 });

  const catalystTab = page.locator('.manager-v2-task-tabs [role="tab"]:has-text("Catalysts")').first();
  if (await catalystTab.count() > 0) {
    await catalystTab.click();
    await page.waitForTimeout(250);
  }
  const catalystComponent = page
    .locator('.environment-catalyst-row select[data-environment-field*=".catalysts.0.componentId"]')
    .first();
  if (await catalystComponent.count() > 0) {
    await catalystComponent.selectOption('');
    await page.waitForTimeout(500);
  }

  const saveButton = page.locator('.environment-save-actions button[type="submit"], .fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button.is-primary:has-text("Save")').first();
  if (await saveButton.count() > 0) {
    await saveButton.click();
    await page.locator('.environment-validation-summary, .manager-v2-validation-group').first().waitFor({ state: 'visible', timeout: 5_000 });
  }
}

/**
 * Scroll the Environments editor to a useful authoring inspection target.
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function scrollEnvironmentEditorTo(page, selector) {
  await page.evaluate((selector) => {
    const editor = document.querySelector('.manager-v2-environment-editor-shell') || document.querySelector('.environment-draft-editor');
    const target = document.querySelector(selector);
    if (!editor || !target) return;
    const editorRect = editor.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    editor.scrollTop += targetRect.top - editorRect.top - 24;
  }, selector);
  await page.waitForTimeout(500);
}

/**
 * Reset the Environments editor scroll position for top-of-editor screenshots.
 * @param {import('playwright').Page} page
 */
async function scrollEnvironmentEditorToTop(page) {
  await page.evaluate(() => {
    const editor = document.querySelector('.manager-v2-environment-editor-shell') || document.querySelector('.environment-draft-editor');
    if (editor) editor.scrollTop = 0;
  });
  await page.waitForTimeout(500);
}

/**
 * Assert the browser's real pointer hit-test reaches the expected card control.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} locator
 * @param {string} targetSelector
 * @param {string} label
 */
async function assertPointerTarget(page, locator, targetSelector, label) {
  await locator.scrollIntoViewIfNeeded();
  await locator.waitFor({ state: 'visible', timeout: 5_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No pointer box found for ${label}`);

  const hit = await page.evaluate(({ x, y, targetSelector }) => {
    const element = document.elementFromPoint(x, y);
    return {
      hitClass: element?.className || '',
      hitTag: element?.tagName || '',
      matched: Boolean(element?.closest?.(targetSelector))
    };
  }, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    targetSelector
  });

  if (!hit.matched) {
    throw new Error(
      `Pointer hit-test for ${label} missed ${targetSelector}; ` +
      `hit ${hit.hitTag || 'none'} ${String(hit.hitClass || '')}`
    );
  }
}

/**
 * Exercise real pointer targets for the GM Environments card grid before
 * opening the editor for screenshots.
 * @param {import('playwright').Page} page
 */
async function exerciseGmEnvironmentCardPointerActions(page) {
  const azureCard = page.locator('.environment-card').filter({ hasText: 'Azure Grove' }).first();
  await azureCard.waitFor({ state: 'visible', timeout: 10_000 });

  await assertPointerTarget(page, azureCard.locator('.environment-card-body-action'), '.environment-card-body-action', 'environment card body');
  await assertPointerTarget(page, azureCard.locator('.environment-card-image-action'), '.environment-card-image-action', 'environment card image');
  await assertPointerTarget(page, azureCard.locator('.environment-card-edit'), '.environment-card-edit', 'environment card edit button');
  await assertPointerTarget(page, azureCard.locator('.environment-card-toggle'), '.environment-card-toggle', 'environment card toggle button');
  await assertPointerTarget(page, azureCard.locator('.environment-card-delete'), '.environment-card-delete', 'environment card delete button');

  const toggle = azureCard.locator('.environment-card-toggle');
  await toggle.click();
  await page.locator('.environment-card').filter({ hasText: 'Azure Grove' }).filter({ hasText: 'Disabled' })
    .waitFor({ state: 'visible', timeout: 5_000 });
  if (await page.locator('.environment-draft-editor').count() > 0) {
    throw new Error('Environment toggle opened the editor instead of staying on the card grid');
  }

  await page.locator('.environment-card').filter({ hasText: 'Azure Grove' }).first()
    .locator('.environment-card-toggle')
    .click();
  await page.locator('.environment-card').filter({ hasText: 'Azure Grove' }).filter({ hasText: 'Enabled' })
    .waitFor({ state: 'visible', timeout: 5_000 });
  if (await page.locator('.environment-draft-editor').count() > 0) {
    throw new Error('Environment toggle re-enable opened the editor instead of staying on the card grid');
  }

  await azureCard.locator('.environment-action-menu-trigger').click();
  const moveDown = page.locator('.environment-action-menu-item[data-environment-action="move-down"]').first();
  await assertPointerTarget(page, moveDown, '.environment-action-menu-item[data-environment-action="move-down"]', 'environment card move down menu item');
  await moveDown.click();
  await page.waitForTimeout(500);
  const firstAfterMoveDown = await page.locator('.environment-card .environment-name').first().textContent();
  if (String(firstAfterMoveDown || '').trim() === 'Azure Grove') {
    throw new Error('Environment move-down action did not reorder the first card');
  }

  const movedAzureCard = page.locator('.environment-card').filter({ hasText: 'Azure Grove' }).first();
  await movedAzureCard.locator('.environment-action-menu-trigger').click();
  const moveUp = page.locator('.environment-action-menu-item[data-environment-action="move-up"]').first();
  await assertPointerTarget(page, moveUp, '.environment-action-menu-item[data-environment-action="move-up"]', 'environment card move up menu item');
  await moveUp.click();
  await page.waitForTimeout(500);
  const firstAfterMoveUp = await page.locator('.environment-card .environment-name').first().textContent();
  if (String(firstAfterMoveUp || '').trim() !== 'Azure Grove') {
    throw new Error('Environment move-up action did not restore the first card');
  }
}

/**
 * Assert a named GM Environments card uses linked scene imagery and does not
 * let the media frame overflow the card at the current admin window size.
 * @param {import('playwright').Page} page
 * @param {string} environmentName
 * @param {{ label: string, tolerance?: number }} options
 */
async function assertGmEnvironmentCardMediaContained(page, environmentName, { label, tolerance = 1 }) {
  const card = page.locator('.fabricate-admin .environment-card').filter({ hasText: environmentName }).first();
  await card.waitFor({ state: 'visible', timeout: 10_000 });
  await card.locator('.environment-card-media').waitFor({ state: 'visible', timeout: 5_000 });
  await card.locator('.environment-card-image-frame').waitFor({ state: 'visible', timeout: 5_000 });
  await card.locator('img.environment-card-image').waitFor({ state: 'visible', timeout: 5_000 });

  await page.waitForFunction(({ cardSelector, environmentName }) => {
    const cards = Array.from(document.querySelectorAll(cardSelector));
    const card = cards.find(candidate => candidate.textContent?.includes(environmentName));
    const image = card?.querySelector?.('img.environment-card-image');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, { cardSelector: '.fabricate-admin .environment-card', environmentName }, { timeout: 10_000 });

  const diagnostics = await card.evaluate((cardElement, { label, tolerance }) => {
    const rectData = rect => ({
      left: Number(rect.left.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2))
    });
    const edgeOverflow = (inner, outer) => ({
      left: Number((outer.left - inner.left).toFixed(2)),
      right: Number((inner.right - outer.right).toFixed(2)),
      top: Number((outer.top - inner.top).toFixed(2)),
      bottom: Number((inner.bottom - outer.bottom).toFixed(2))
    });
    const within = (inner, outer) =>
      inner.left >= outer.left - tolerance &&
      inner.right <= outer.right + tolerance &&
      inner.top >= outer.top - tolerance &&
      inner.bottom <= outer.bottom + tolerance;

    const media = cardElement.querySelector('.environment-card-media');
    const frame = cardElement.querySelector('.environment-card-image-frame');
    const image = cardElement.querySelector('img.environment-card-image');
    const admin = cardElement.closest('.fabricate-admin');
    const app = admin?.closest('.application, .app') || document.querySelector('#fabricate-recipe-manager');

    if (!(media instanceof HTMLElement) || !(frame instanceof HTMLElement) || !(image instanceof HTMLImageElement)) {
      return {
        ok: false,
        label,
        reason: 'missing required environment card media elements',
        hasMedia: media instanceof HTMLElement,
        hasFrame: frame instanceof HTMLElement,
        hasImage: image instanceof HTMLImageElement
      };
    }

    const cardRect = cardElement.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const appRect = app?.getBoundingClientRect?.() ?? null;
    const imageClasses = Array.from(image.classList);
    const imageIsLoaded = image.complete && image.naturalWidth > 0;
    const imageIsFallback = image.classList.contains('fallback') || image.currentSrc.includes('icons/svg/item-bag.svg');
    const mediaWithinCard = within(mediaRect, cardRect);
    const frameWithinCard = within(frameRect, cardRect);
    const frameWithinMedia = within(frameRect, mediaRect);

    return {
      ok: imageIsLoaded && !imageIsFallback && mediaWithinCard && frameWithinCard && frameWithinMedia,
      label,
      tolerance,
      imageIsLoaded,
      imageIsFallback,
      imageSrc: image.currentSrc || image.src || '',
      imageNaturalSize: { width: image.naturalWidth, height: image.naturalHeight },
      imageClasses,
      mediaWithinCard,
      frameWithinCard,
      frameWithinMedia,
      overflow: {
        mediaVsCard: edgeOverflow(mediaRect, cardRect),
        frameVsCard: edgeOverflow(frameRect, cardRect),
        frameVsMedia: edgeOverflow(frameRect, mediaRect)
      },
      rects: {
        app: appRect ? rectData(appRect) : null,
        card: rectData(cardRect),
        media: rectData(mediaRect),
        frame: rectData(frameRect)
      }
    };
  }, { label, tolerance });

  if (!diagnostics.ok) {
    throw new Error(
      `Environment card media containment failed for "${environmentName}" at ${label}: ` +
      JSON.stringify(diagnostics, null, 2)
    );
  }

  process.stdout.write(`  Verified "${environmentName}" linked scene media containment at ${label}.\n`);
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
  await page.waitForTimeout(1_000);
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
  const actorSelect = page.locator('.gathering-actor-select select').first();
  await actorSelect.waitFor({ state: 'visible', timeout: 10_000 });
  await actorSelect.selectOption({ label: actorName });
  await page.waitForTimeout(1_000);
  await page.locator('.gathering-selected-actor').filter({ hasText: actorName }).first()
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
  const startButton = taskRow.locator('.gathering-start-button').first();
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
      '.gathering-environment-card, .gathering-task-row, .gathering-run-section, .gathering-feedback-panel, .gathering-history-list'
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
  await mkdir(RESULTS_DIR, { recursive: true });

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
      await page.waitForTimeout(2_000);
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
      await page.waitForTimeout(1_000);
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
        await page.waitForTimeout(1_500);
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
        await page.waitForTimeout(750);
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
        await page.waitForTimeout(750);
      }

      // ── Phase D0: Screenshot Crafting System Manager V2 ─────────────────────
      // Gated behind RUN_SCREENSHOT_PHASES so the CI smoke profile skips the
      // ~25 manager-v2 captures and pointer hit-tests; local `full` runs
      // continue to regenerate them for visual verification.
      if (!RUN_SCREENSHOT_PHASES) {
        process.stdout.write('Phase D0: skipped (FOUNDRY_SMOKE_PROFILE=ci).\n');
        results.steps.push({ step: 'screenshot-manager-v2', passed: true, skipped: true });
      } else {
      process.stdout.write('Phase D0: Opening Crafting System Manager V2...\n');
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
          game.fabricate.api.getCraftingSystemManagerV2AppClass().show();
        });
        await page.locator('.fabricate-manager-v2').first().waitFor({ state: 'visible', timeout: 10_000 });

        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        let navLabels = await page.locator('.fabricate-manager-v2 .manager-v2-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.at(0) !== 'System settings') {
          throw new Error(`Manager V2 default selection should keep System settings first. Saw: ${navLabels.join(', ')}`);
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist")[aria-selected="true"]').count() === 0) {
          throw new Error('Manager V2 default selection did not select the first available system.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-breadcrumbs button:has-text("Crafting Systems")').count() === 0) {
          throw new Error('Manager V2 root breadcrumb is missing.');
        }
        await assertManagerV2LayoutStable(page, 'normal default selection');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-default-selection');

        await page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist") .manager-v2-system-identity').first().click();
        await page.waitForTimeout(750);
        navLabels = await page.locator('.fabricate-manager-v2 .manager-v2-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.includes('Systems')) {
          throw new Error(`Manager V2 selected nav should not expose a Systems tab. Saw: ${navLabels.join(', ')}`);
        }
        if (navLabels.at(0) !== 'System settings') {
          throw new Error(`Manager V2 selected nav should keep System settings first. Saw: ${navLabels.join(', ')}`);
        }
        for (const expected of ['System settings', 'Components', 'Recipes', 'Environments', 'Essences', 'Rules', 'Graph']) {
          if (!navLabels.includes(expected)) {
            throw new Error(`Manager V2 selected nav missing ${expected}. Saw: ${navLabels.join(', ')}`);
          }
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-scope-card .manager-v2-scope-name:has-text("The Herbalist")').count() === 0) {
          throw new Error('Manager V2 selected-system scope is missing static selected-system text.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-scope-return[aria-label="Return to System Library"]').count() === 0) {
          throw new Error('Manager V2 selected-system scope is missing the return-to-library action.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-section-header .manager-v2-button:has-text("Import")').count() > 0) {
          throw new Error('Manager V2 duplicated Import in the System library header.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-section-header .manager-v2-button:has-text("Create")').count() > 0) {
          throw new Error('Manager V2 duplicated Create in the System library header.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-card-title:has-text("Quick actions")').count() > 0) {
          throw new Error('Manager V2 inspector still shows duplicate Quick actions.');
        }
        await assertManagerV2LayoutStable(page, 'normal selected');
        await exerciseManagerV2PointerTargets(page);
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-selected-normal');

        await page.locator('.fabricate-manager-v2 .manager-v2-scope-return').first().click();
        await page.waitForTimeout(750);
        navLabels = await page.locator('.fabricate-manager-v2 .manager-v2-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.at(0) !== 'System settings') {
          throw new Error(`Manager V2 return to library should preserve selected-system nav. Saw nav: ${navLabels.join(', ')}`);
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-scope-card').count() === 0) {
          throw new Error('Manager V2 return to library should leave the rail scope visible.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist")').count() === 0) {
          throw new Error('Manager V2 return to library did not return to the systems browser.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist")[aria-selected="true"]').count() === 0) {
          throw new Error('Manager V2 return to library should preserve the selected system row.');
        }

        await closeOpenApplications(page);
        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, { features: { essences: true, gathering: false } });
        }, craftingSetup.systemId);
        await page.evaluate(() => {
          game.fabricate.api.getCraftingSystemManagerV2AppClass().show();
        });
        await page.locator('.fabricate-manager-v2').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist") .manager-v2-system-identity').first().click();
        await page.waitForTimeout(750);
        const gatheringOffFact = await page.locator('.fabricate-manager-v2 [data-count-id="environments"]').first().evaluate(element => {
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
            throw new Error(`Manager V2 gathering-off fact does not preserve Off emphasis: ${JSON.stringify(gatheringOffFact)}`);
          }
          if (!String(gatheringOffFact.className).includes('is-off')) {
            throw new Error(`Manager V2 gathering-off fact should use the full-grid special case: ${JSON.stringify(gatheringOffFact)}`);
          }
        } else if (!/^\d+ Gathering environments$/.test(gatheringOffFact.text || '')) {
          throw new Error(`Manager V2 gathering fact text is wrong: ${JSON.stringify(gatheringOffFact)}`);
        }
        if (gatheringOffFact.scrollWidth > gatheringOffFact.clientWidth + 2) {
          throw new Error(`Manager V2 gathering-off fact overflows: ${JSON.stringify(gatheringOffFact)}`);
        }
        await assertManagerV2LayoutStable(page, 'normal selected gathering off');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-selected-gathering-off');
        await closeOpenApplications(page);
        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, { features: { essences: true, gathering: true } });
        }, craftingSetup.systemId);
        await page.evaluate(() => {
          game.fabricate.api.getCraftingSystemManagerV2AppClass().show();
        });
        await page.locator('.fabricate-manager-v2').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager-v2 .manager-v2-system-row:has-text("The Herbalist") .manager-v2-system-identity').first().click();
        await page.waitForTimeout(750);

        await setManagerV2WindowSize(page, { width: 1000, height: 700 });
        await assertManagerV2LayoutStable(page, 'stacked selected');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-selected-stacked');

        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager-v2 .manager-v2-nav-button:has-text("Recipes")').first().click();
        await page.locator('.fabricate-manager-v2 .manager-v2-breadcrumbs button:has-text("The Herbalist")').first().click();
        await page.locator('.fabricate-manager-v2[data-manager-v2-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await exerciseManagerV2SystemEditPointerTargets(page);
        if (await page.locator('.fabricate-manager-v2[data-manager-v2-view="system-edit"]').count() === 0) {
          throw new Error('Manager V2 system Edit did not stay inside the v2 edit route.');
        }
        for (const selector of [
          '#manager-v2-system-name',
          '#manager-v2-system-description',
          '#manager-v2-system-resolution-mode',
          '[data-edit-control="advanced-options"]',
          '[data-feature-key="gathering"]'
        ]) {
          if (await page.locator(`.fabricate-manager-v2 ${selector}`).count() === 0) {
            throw new Error(`Manager V2 system edit is missing required control: ${selector}`);
          }
        }
        await assertManagerV2LayoutStable(page, 'system edit normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-system-edit-normal');

        await setManagerV2WindowSize(page, { width: 900, height: 700 });
        await assertManagerV2LayoutStable(page, 'system edit narrow');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-system-edit-narrow');

        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        await exerciseManagerV2RecipePointerTargets(page);
        if (await page.locator('.fabricate-manager-v2 .manager-v2-recipe-row').count() < 2) {
          throw new Error('Manager V2 recipes browser rendered fewer than two recipe rows.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-recipe-row.is-selected').count() === 0) {
          throw new Error('Manager V2 recipes browser did not show selected recipe row state.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-inspector:has-text("Requirements")').count() === 0) {
          throw new Error('Manager V2 recipes inspector did not show requirements preview.');
        }
        await assertManagerV2LayoutStable(page, 'recipes normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-recipes-normal');

        await setManagerV2WindowSize(page, { width: 1000, height: 700 });
        await page.locator('.fabricate-manager-v2 .manager-v2-recipe-row:has-text("Brew Healing Potion")').first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await assertManagerV2LayoutStable(page, 'recipes stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-recipes-stacked');

        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager-v2 .manager-v2-nav-button:has-text("Components")').first().click();
        await page.locator('.fabricate-manager-v2[data-manager-v2-view="components"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.waitForTimeout(500);
        if (await page.locator('.fabricate-manager-v2 .manager-v2-component-drop-zone').count() === 0) {
          throw new Error('Manager V2 components browser did not show the drop-to-add affordance.');
        }
        await assertManagerV2LayoutStable(page, 'components normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-components-normal');
        process.stdout.write('  D0: components normal screenshotted\n');

        // Components → stacked. Earlier CI runs hung silently between this
        // resize and the next screenshot for ~13 minutes. The withDeadline
        // wrappers above now surface a hang here as a thrown error rather
        // than an opaque job timeout.
        await setManagerV2WindowSize(page, { width: 1000, height: 700 });
        process.stdout.write('  D0: components stacked resize complete\n');
        await assertManagerV2LayoutStable(page, 'components stacked');
        process.stdout.write('  D0: components stacked layout asserted\n');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-components-stacked');
        process.stdout.write('  D0: components stacked screenshotted\n');

        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager-v2 .manager-v2-nav-button:has-text("Tags")').first().click();
        await page.locator('.fabricate-manager-v2[data-manager-v2-view="tags"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.waitForTimeout(500);
        if (await page.locator('.fabricate-manager-v2 [data-tags-evidence="how-it-works"]').count() === 0) {
          throw new Error('Manager V2 tags inspector did not render the How-it-works evidence card.');
        }
        await assertManagerV2LayoutStable(page, 'tags-categories normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-tags-categories-normal');

        await setManagerV2WindowSize(page, { width: 1000, height: 700 });
        await assertManagerV2LayoutStable(page, 'tags-categories stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-tags-categories-stacked');

        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        const essenceNav = page.locator('.fabricate-manager-v2 .manager-v2-nav-button:has-text("Essences")');
        if (await essenceNav.count() > 0 && !(await essenceNav.first().isDisabled())) {
          await essenceNav.first().click();
          await page.locator('.fabricate-manager-v2[data-manager-v2-view="essences"]').first().waitFor({ state: 'visible', timeout: 5_000 });
          await page.waitForTimeout(500);
          await assertManagerV2LayoutStable(page, 'essences normal');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-v2-essences-normal');

          await setManagerV2WindowSize(page, { width: 1000, height: 700 });
          await assertManagerV2LayoutStable(page, 'essences stacked');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-v2-essences-stacked');

          await setManagerV2WindowSize(page, { width: 1280, height: 820 });
          const essenceRow = page.locator('.fabricate-manager-v2 .manager-v2-essence-row');
          if (await essenceRow.count() > 0) {
            const editButton = essenceRow.first().locator('.manager-v2-icon-button[title*="Edit" i]');
            if (await editButton.count() > 0) {
              await editButton.first().click();
              await page.locator('.fabricate-manager-v2[data-manager-v2-view="essence-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
              await page.waitForTimeout(500);
              await assertManagerV2LayoutStable(page, 'essence-edit first state');
              await assertNoScreenshotOverlays(page);
              await screenshot(page, 'manager-v2-essence-edit-first-state');
              await page.locator('.fabricate-manager-v2 .manager-v2-button:has-text("Cancel"), .fabricate-manager-v2 .manager-v2-button:has-text("Back")').first().click({ trial: false }).catch(() => {});
              await page.waitForTimeout(250);
            }
          }
        }

        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager-v2 .manager-v2-nav-button:has-text("Recipes")').first().click();
        await page.waitForTimeout(250);
        await exerciseManagerV2EnvironmentPointerTargets(page);
        if (await page.locator('.fabricate-manager-v2 .manager-v2-environment-row').count() < 1) {
          throw new Error('Manager V2 environments browser rendered no environment rows.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-environment-row.is-selected:has-text("Azure Grove")').count() === 0) {
          throw new Error('Manager V2 environments browser did not show selected environment row state.');
        }
        if (await page.locator('.fabricate-manager-v2 .manager-v2-inspector:has-text("Linked scene")').count() === 0) {
          throw new Error('Manager V2 environments inspector did not show linked scene evidence.');
        }
        await assertManagerV2LayoutStable(page, 'environments normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-environments-browse-normal');

        await setManagerV2WindowSize(page, { width: 1000, height: 700 });
        await page.locator('.fabricate-manager-v2 .manager-v2-environment-row:has-text("Azure Grove")').first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await assertManagerV2LayoutStable(page, 'environments stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-environments-browse-stacked');

        await setManagerV2WindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager-v2 .manager-v2-environment-row:has-text("Azure Grove") .manager-v2-icon-button').nth(0).click();
        await page.locator('.fabricate-manager-v2[data-manager-v2-view="environment-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager-v2 .manager-v2-environment-edit-view').first().waitFor({ state: 'visible', timeout: 10_000 });
        if (await page.locator('.fabricate-manager-v2 .environment-draft-editor, .fabricate-manager-v2 .environment-foundation').count() > 0) {
          throw new Error('Manager V2 environments edit route still rendered the legacy environment editor.');
        }
        for (const selector of [
          '.manager-v2-environment-details-band',
          '.manager-v2-environment-scene-card',
          '.manager-v2-environment-task-rail',
          '.manager-v2-environment-task-editor',
          '.manager-v2-environment-evidence-column',
          '[data-environment-field="environment.name"]',
          '[data-environment-field="environment.sceneUuid"]',
          '.manager-v2-task-tabs'
        ]) {
          if (await page.locator(`.fabricate-manager-v2 ${selector}`).count() === 0) {
            throw new Error(`Manager V2 environment edit is missing required control: ${selector}`);
          }
        }
        await page.locator('.fabricate-manager-v2 .manager-v2-task-rail-row').first().click();
        await page.locator('.fabricate-manager-v2 .manager-v2-task-rail-row .environment-action-menu-trigger').first().click();
        await page.locator('.fabricate-manager-v2 .environment-action-menu-item:not([disabled])').first().click({ trial: true });
        await page.keyboard.press('Escape');
        await page.locator('.fabricate-manager-v2 .manager-v2-task-tabs [role="tab"]:has-text("Results")').first().click({ trial: true });
        await page.locator('.fabricate-manager-v2 .manager-v2-scene-actions select').first().click({ trial: true });
        const firstStateSaveButton = page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button.is-primary:has-text("Save")').first();
        if (await firstStateSaveButton.isEnabled()) await firstStateSaveButton.click({ trial: true });
        const firstStateCancelButton = page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Cancel")').first();
        if (await firstStateCancelButton.isEnabled()) await firstStateCancelButton.click({ trial: true });
        await page.locator('.fabricate-manager-v2 .manager-v2-breadcrumbs button:has-text("Environments")').first().click({ trial: true });
        await assertManagerV2LayoutStable(page, 'environment edit first state');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-environments-edit-first-state');

        await prepareGmEnvironmentsScreenshotState(page);
        const validationLink = page.locator('.fabricate-manager-v2 .environment-validation-link').first();
        if (await validationLink.count() > 0) {
          await validationLink.click({ trial: true });
        }
        await scrollEnvironmentEditorToTop(page);
        await assertManagerV2LayoutStable(page, 'environment edit validation');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-environments-edit-validation');

        const catalystsTab = page.locator('.fabricate-manager-v2 .manager-v2-task-tabs [role="tab"]:has-text("Catalysts")').first();
        if (await catalystsTab.count() > 0) await catalystsTab.click();
        await scrollEnvironmentEditorTo(page, '.environment-catalyst-authoring');
        await assertManagerV2LayoutStable(page, 'environment edit authoring');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-environments-edit-authoring');

        await setManagerV2WindowSize(page, { width: 900, height: 700 });
        const resultsTab = page.locator('.fabricate-manager-v2 .manager-v2-task-tabs [role="tab"]:has-text("Results")').first();
        if (await resultsTab.count() > 0) await resultsTab.click();
        await scrollEnvironmentEditorTo(page, '.environment-result-authoring');
        await assertManagerV2LayoutStable(page, 'environment edit stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-v2-environments-edit-stacked');

        const cancelEnvironmentDraft = page.locator('.fabricate-manager-v2 .manager-v2-header-actions .manager-v2-button:has-text("Cancel")').first();
        if (await cancelEnvironmentDraft.count() > 0 && await cancelEnvironmentDraft.isEnabled()) {
          await cancelEnvironmentDraft.click();
          await page.waitForTimeout(500);
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
        results.steps.push({ step: 'screenshot-manager-v2', passed: true });
        process.stdout.write('Phase D0 complete: Crafting System Manager V2 screenshotted and hit-tested.\n');
      } catch (err) {
        results.steps.push({ step: 'screenshot-manager-v2', passed: false, error: err.message });
        throw err;
      }
      }

      // ── Phase D: Screenshot Recipe Manager ──────────────────────────────────
      // Gated behind RUN_SCREENSHOT_PHASES so the CI smoke profile skips the
      // legacy Recipe Manager screenshot tour; local `full` runs keep it.
      if (!RUN_SCREENSHOT_PHASES) {
        process.stdout.write('Phase D: skipped (FOUNDRY_SMOKE_PROFILE=ci).\n');
        results.steps.push({ step: 'screenshot-recipe-manager', passed: true, skipped: true });
      } else {
      process.stdout.write('Phase D: Opening Recipe Manager...\n');
      try {
        // Pre-select the system via settings so the adminStore picks it up on init
        await page.evaluate(async (sysId) => {
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', sysId);
        }, craftingSetup.systemId);

        await page.evaluate(() => {
          fabricate.openRecipeManager();
        });
        await page.waitForTimeout(2_000);

        // Wait for the Recipe Manager to be visible
        process.stdout.write('  Waiting for Recipe Manager to render...\n');
        const adminApp = page.locator('.fabricate-admin, .recipe-manager').first();
        await adminApp.waitFor({ state: 'visible', timeout: 10_000 });

        // Click "Arcane Forge" in the sidebar to ensure selection + refresh
        const systemLink = page.locator('.admin-system-list button.system-link:has-text("Arcane Forge")').first();
        if (await systemLink.count() > 0) {
          await systemLink.click();
          await page.waitForTimeout(2_000);
          process.stdout.write('Selected "Arcane Forge" system in sidebar.\n');
        }

        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'recipe-manager-default');
        process.stdout.write('  Screenshotted Recipe Manager default view.\n');

        // Click through tabs using button text (Svelte tabs have no data-tab attributes)
        // Tab labels from lang/en.json: Systems, Components, Recipes, Rules, Graph
        const adminTabs = [
          { label: 'Environments', slug: 'environments' },
          { label: 'Systems', slug: 'systems' },
          { label: 'Components', slug: 'items' },
          { label: 'Recipes', slug: 'recipes' },
          { label: 'Rules', slug: 'rules' },
          { label: 'Graph', slug: 'graph' }
        ];
        for (const { label, slug } of adminTabs) {
          try {
            const tab = page.locator(`.admin-tabs button:has-text("${label}")`).first();
            if (await tab.count() === 0) {
              if (slug === 'environments') {
                const availableTabs = await page.locator('.admin-tabs button').evaluateAll(buttons =>
                  buttons.map(button => button.textContent?.trim()).filter(Boolean)
                );
                throw new Error(
                  `Environments tab was not available for screenshot validation. ` +
                  `Available tabs: ${availableTabs.join(', ') || 'none'}.`
                );
              }
              continue;
            }

            await tab.click();
            await page.waitForTimeout(1_000);
            await assertNoScreenshotOverlays(page);
            await screenshot(page, `recipe-manager-${slug}`);
            process.stdout.write(`  Screenshotted Recipe Manager "${label}" tab.\n`);

            if (slug === 'environments') {
              await page.locator('.environment-card').filter({ hasText: 'Azure Grove' }).first()
                .waitFor({ state: 'visible', timeout: 10_000 });
              const environmentListText = await page.locator('.environment-list').first().textContent();
              for (const expectedEnvironmentName of [
                'Azure Grove',
                'Verdant Meadow',
                'Sunken Ruins',
                'Crystal Thicket',
                'Timed Orchard',
                'Withered Patch',
                'Moonlit Blind Grove'
              ]) {
                if (!String(environmentListText || '').includes(expectedEnvironmentName)) {
                  throw new Error(`GM Environments list did not show environment name: ${expectedEnvironmentName}`);
                }
              }

              await setRecipeManagerWindowSize(page, { width: 1000, height: 700 });
              await assertGmEnvironmentCardMediaContained(page, 'Azure Grove', { label: 'normal admin width' });

              await setRecipeManagerWindowSize(page, { width: 640, height: 700 });
              await assertGmEnvironmentCardMediaContained(page, 'Azure Grove', { label: 'narrow admin width' });

              await setRecipeManagerWindowSize(page, { width: 1000, height: 700 });
              await exerciseGmEnvironmentCardPointerActions(page);

              await page.locator('.environment-card').filter({ hasText: 'Azure Grove' }).first()
                .locator('.environment-card-edit')
                .click();
              await page.locator('.environment-draft-editor').first().waitFor({ state: 'visible', timeout: 10_000 });
              await prepareGmEnvironmentsScreenshotState(page);

              await setRecipeManagerWindowSize(page, { width: 1000, height: 700 });
              await scrollEnvironmentEditorToTop(page);
              await dismissFoundryNotifications(page);
              await screenshot(page, 'gm-environments-normal-validation');
              process.stdout.write('  Screenshotted GM Environments validation state at normal admin size.\n');

              await scrollEnvironmentEditorTo(page, '.environment-catalyst-authoring');
              await dismissFoundryNotifications(page);
              await screenshot(page, 'gm-environments-normal-authoring');
              process.stdout.write('  Screenshotted GM Environments result/catalyst authoring at normal admin size.\n');

              await scrollEnvironmentEditorTo(page, '.environment-result-authoring');
              await dismissFoundryNotifications(page);
              await screenshot(page, 'gm-environments-normal-results');
              process.stdout.write('  Screenshotted GM Environments result rows at normal admin size.\n');

              await setRecipeManagerWindowSize(page, { width: 640, height: 700 });
              await scrollEnvironmentEditorTo(page, '.environment-catalyst-authoring');
              await dismissFoundryNotifications(page);
              await screenshot(page, 'gm-environments-narrow-authoring');
              process.stdout.write('  Screenshotted GM Environments narrow container-query authoring state.\n');

              await scrollEnvironmentEditorTo(page, '.environment-result-authoring');
              await dismissFoundryNotifications(page);
              await screenshot(page, 'gm-environments-narrow-results');
              process.stdout.write('  Screenshotted GM Environments narrow container-query result rows.\n');

              const cancelDraft = page.locator('.environment-save-actions button:has-text("Cancel")').first();
              if (await cancelDraft.count() > 0) {
                await cancelDraft.evaluate(button => button.click());
                await page.waitForTimeout(500);
              }

              await page.setViewportSize({ width: 1920, height: 1080 });
            }

            if (slug === 'systems') {
                await page.evaluate(() => {
                  document.querySelector('.essence-creation-toolbar')?.scrollIntoView({
                    behavior: 'auto',
                    block: 'center'
                  });
                });
                await page.waitForTimeout(500);

                const pickerTrigger = page.locator('.essence-creation-toolbar .essence-icon-picker-trigger').first();
                await pickerTrigger.click();
                await page.locator('.essence-icon-picker-popover').first().waitFor({ state: 'visible', timeout: 5_000 });
                await page.waitForTimeout(300);
                await assertNoScreenshotOverlays(page);
                await screenshot(page, 'recipe-manager-systems-essence-picker');
                process.stdout.write('  Screenshotted Systems tab essence picker.\n');

                const pickerSearch = page.locator('.essence-icon-picker-search input').first();
                await pickerSearch.fill('backward fast');
                await page.waitForTimeout(300);
                await assertNoScreenshotOverlays(page);
                await screenshot(page, 'recipe-manager-systems-essence-picker-filtered');
                process.stdout.write('  Screenshotted filtered essence picker state.\n');

                await page.keyboard.press('Escape');
                await page.waitForTimeout(300);

                const editEssenceButton = page.locator(
                  '.essence-definition-row .essence-definition-actions button:has(i.fa-pen)'
                ).first();
                if (await editEssenceButton.count() > 0) {
                  await editEssenceButton.click();
                  await page.waitForTimeout(300);

                  const editPickerTrigger = page.locator(
                    '.essence-definition-row .essence-icon-picker-trigger.icon-only'
                  ).first();
                  await editPickerTrigger.click();
                  await page.locator('.essence-icon-picker-popover').first().waitFor({ state: 'visible', timeout: 5_000 });
                  await page.waitForTimeout(300);
                  await assertNoScreenshotOverlays(page);
                  await screenshot(page, 'recipe-manager-systems-essence-edit-picker');
                  process.stdout.write('  Screenshotted inline essence edit picker.\n');

                  await page.keyboard.press('Escape');
                  await page.waitForTimeout(300);

                  const cancelEditButton = page.locator(
                    '.essence-definition-row .essence-definition-actions button:has(i.fa-times)'
                  ).first();
                  if (await cancelEditButton.count() > 0) {
                    await cancelEditButton.click();
                    await page.waitForTimeout(300);
                  }
                }
              }
          } catch (err) {
            if (slug === 'environments') throw err;
            // Tab may not exist in this version
          }
        }

        // Close all open application windows (try both V1 and V2 APIs)
        await closeOpenApplications(page);

        process.stdout.write('  Closing Recipe Manager windows...\n');
        results.steps.push({ step: 'screenshot-recipe-manager', passed: true });
        process.stdout.write('Phase D complete: Recipe Manager screenshotted.\n');
      } catch (err) {
        results.steps.push({ step: 'screenshot-recipe-manager', passed: false, error: err.message });
        process.stderr.write(`Phase D failed: ${err.message}\n`);
      }
      }

      // ── Phase D2: Screenshot Gathering app live states ─────────────────────
      process.stdout.write('Phase D2: Exercising Gathering app live states...\n');
      try {
        await closeOpenApplications(page);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(500);
        const itemsTab = page.locator('#sidebar [data-tab="items"]').first();
        await itemsTab.click({ force: true });
        await page.waitForTimeout(1_000);
        const gatheringButton = page.locator('button[data-fabricate-action="gathering"]').first();
        await gatheringButton.waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'items-sidebar-gathering-enabled');

        await openGatheringAppFromDirectory(page);
        await page.locator('.fabricate-gathering-app').first().waitFor({ state: 'visible', timeout: 10_000 });
        await selectGatheringActor(page, 'Alara the Alchemist');
        await page.locator('.gathering-environment-card').filter({ hasText: 'Verdant Meadow' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.gathering-task-row').filter({ hasText: 'Gather Meadow Herbs' }).first()
          .locator('.gathering-start-button').waitFor({ state: 'visible', timeout: 10_000 });
        await screenshot(page, 'gathering-targeted-ready');

        const sceneBlockedCard = page.locator('.gathering-environment-card.is-blocked').filter({ hasText: 'Sunken Ruins' }).first();
        await sceneBlockedCard.waitFor({ state: 'visible', timeout: 15_000 });
        // 15s here (not 5s): on hosted CI runners the chip-row inside an
        // is-blocked card sometimes lands later than 5s after a fresh
        // selectGatheringActor() re-renders the environment list.
        await sceneBlockedCard.locator('.gathering-chip').first().waitFor({ state: 'visible', timeout: 15_000 });
        if (await sceneBlockedCard.locator('.gathering-start-button').first().isEnabled()) {
          throw new Error('Scene-blocked gathering task start button should be disabled.');
        }
        await scrollGatheringAppToText(page, 'Sunken Ruins');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-scene-blocked');

        await selectGatheringActor(page, 'Brom the Blacksmith');
        const catalystBlockedRow = page.locator('.gathering-task-row.is-blocked').filter({ hasText: 'Bottle Crystal Dew' }).first();
        await catalystBlockedRow.waitFor({ state: 'visible', timeout: 10_000 });
        if (await catalystBlockedRow.locator('.gathering-start-button').first().isEnabled()) {
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

        await selectGatheringActor(page, 'Alara the Alchemist');
        await startGatheringTaskByLabel(page, 'Gather Meadow Herbs');
        await page.locator('.gathering-feedback-panel.success').first().waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.gathering-history-row').filter({ hasText: 'Gather Meadow Herbs' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'gathering-immediate-success');

        await dismissFoundryNotifications(page);
        const herbCountBeforeFailure = await page.evaluate((alaraId) => {
          const alara = game.actors.get(alaraId);
          return alara?.items?.contents?.filter(item => item.name === 'Mystic Herb').length ?? 0;
        }, cleanup.alaraId);
        await startGatheringTaskByLabel(page, 'Search Withered Patch');
        await page.locator('.gathering-feedback-panel.warning').first().waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.gathering-history-row').filter({ hasText: 'Search Withered Patch' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
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

        await startGatheringTaskByLabel(page, 'Tend Slow Bloom');
        await page.locator('.gathering-run-row').filter({ hasText: 'Tend Slow Bloom' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
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
        await page.waitForTimeout(2_000);
        await closeOpenApplications(page);
        await openGatheringAppFromDirectory(page);
        await selectGatheringActor(page, 'Alara the Alchemist');
        await page.locator('.gathering-history-row').filter({ hasText: 'Tend Slow Bloom' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
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
        process.stdout.write('Phase D3: skipped (FOUNDRY_SMOKE_PROFILE=ci).\n');
        results.steps.push({ step: 'gathering-non-gm-states', passed: true, skipped: true });
      } else {
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
        await playerPage.locator('.gathering-environment-card').filter({ hasText: 'Moonlit Blind Grove' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await playerPage.locator('.gathering-task-row').filter({ hasText: 'Gather' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        const blindLeaks = await playerPage.evaluate(() => {
          const blindCard = Array.from(document.querySelectorAll('.gathering-environment-card'))
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
      process.stdout.write('Phase E: Crafting a Healing Potion...\n');
      try {
        // Open Crafting App programmatically (avoids viewport/overlay issues)
        await page.evaluate(() => {
          document.querySelector('[data-fabricate-action="craft"]')?.click();
        });
        await page.waitForTimeout(2_000);

        // Verify the crafting app opened
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

        await page.waitForTimeout(1_000);
        await screenshot(page, 'post-craft');
        process.stdout.write('  Screenshotted post-craft state.\n');

        // Open Alara's sheet to show the crafted item (inventory tab)
        process.stdout.write('  Opening Alara\'s inventory to verify crafted item...\n');
        await page.evaluate(async (alaraId) => {
          const alara = game.actors.get(alaraId);
          if (alara) await alara.sheet.render(true);
        }, cleanup.alaraId);
        await page.waitForTimeout(1_500);
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
        process.stdout.write('Phase E2: skipped (FOUNDRY_SMOKE_PROFILE=ci).\n');
        results.steps.push({ step: 'gathering-no-selectable-actors-state', passed: true, skipped: true });
      } else {
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
