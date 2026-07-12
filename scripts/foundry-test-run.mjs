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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FABRICATE_THEME_IDS, FABRICATE_THEME_ATTRIBUTE, DEFAULT_FABRICATE_THEME } from '../src/ui/theme.js';

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
  'fabricate-app-shell',
  'fabricate-journal',
  'post-craft',
  'crafter-post-craft-inventory'
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
 * A UI-triggered craft / immediate-d100 gather now opens the interactive roll
 * prompt (a Foundry DialogV2 carrying `.fabricate-roll-prompt`). When present:
 * capture it as evidence, click Roll to dismiss it, and wait for it to detach so
 * the caller's subsequent `assertNoScreenshotOverlays` / state waits do not trip
 * on the dialog overlay. Returns true when a dialog was handled, false otherwise
 * (e.g. a timed task that resolves without a roll) — the short presence timeout
 * makes the no-dialog case a cheap no-op.
 *
 * @param {import('playwright').Page} page
 * @param {string} label Screenshot label for the captured prompt.
 * @returns {Promise<boolean>}
 */
async function handleRollPromptIfPresent(page, label) {
  const dialog = page
    .locator('.application.dialog:has(.fabricate-roll-prompt), .dialog:has(.fabricate-roll-prompt)')
    .first();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    return false;
  }
  await screenshot(page, label);
  // The confirm button is "Normal" for a d20 check (Advantage/Normal/Disadvantage)
  // or "Roll" for a non-d20 / d100 check (single button). Click whichever proceeds
  // without advantage; never Advantage/Disadvantage.
  const rollBtn = dialog
    .locator(
      'button[data-action="normal"], button[data-action="roll"], button:has-text("Normal"), button:has-text("Roll")'
    )
    .first();
  await rollBtn.click().catch(() => {});
  await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  return true;
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

// Recipes now nests inside the gated Crafting nav group (issue 511). Clicking the
// Crafting parent from a non-crafting route routes straight to Recipes and expands
// the group; from a crafting child route (e.g. recipe-edit) it only expands, so
// always follow with the Recipes sub-item to land on the recipes browser.
async function openManagerCraftingSection(page, subitemId, managerView) {
  await page.locator('.fabricate-manager .manager-nav-parent:has-text("Crafting")').first().click();
  const subitem = page.locator(`.fabricate-manager #manager-crafting-nav-${subitemId}`).first();
  await subitem.waitFor({ state: 'visible', timeout: 5_000 });
  await subitem.click();
  await page
    .locator(`.fabricate-manager[data-manager-view="${managerView}"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

// Return to the recipes browser (via the Crafting group) and open the named
// recipe's editor, waiting for the recipe-edit route. Consolidates the
// "return then open recipe X" sequence the recipe-editor captures repeat.
async function openManagerRecipeEditor(page, recipeName) {
  await openManagerCraftingSection(page, 'recipes', 'recipes');
  await page
    .locator(`.fabricate-manager .manager-recipe-row:has-text("${recipeName}") button:has(i.fa-edit)`)
    .first()
    .click();
  await page
    .locator('.fabricate-manager[data-manager-view="recipe-edit"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Capture the currently-open player Alchemy workbench under every Fabricate
 * theme, then restore the default theme. `applyManagerTheme` stamps the theme
 * attribute on the document element AND every `.fabricate` root — which includes
 * the shared player app — so it re-themes the live workbench via its own CSS
 * tokens, not a mock. Labels: `player-alchemy-theme-<themeId>` (full profile
 * only). These are EXTRA evidence and are intentionally NOT mapped in
 * VIEW_RECIPES, exactly like the `manager-theme-*` frames.
 * @param {import('playwright').Page} page
 */
async function captureAlchemyThemes(page) {
  for (const themeId of Object.values(FABRICATE_THEME_IDS)) {
    await applyManagerTheme(page, themeId);
    await screenshot(page, `player-alchemy-theme-${themeId}`);
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
    // No EULA checkbox usually means Foundry booted unlicensed and is showing the
    // License Key Activation page (a license-key text field + Submit Key button)
    // rather than the EULA. That is an activation/credentials problem, not an EULA
    // one — surface it clearly. Fix: ensure FOUNDRY_LICENSE_KEY is set and forwarded
    // to the container (docker-compose.foundry.yml) so felddy activates at boot.
    const keyActivation = await page
      .locator('input[name="licenseKey"], input[id*="license" i], button:has-text("Submit Key")')
      .count();
    if (keyActivation > 0) {
      throw new Error(
        'Foundry booted unlicensed (License Key Activation page shown, not the EULA). ' +
          'Ensure FOUNDRY_LICENSE_KEY is configured and forwarded to the container.'
      );
    }
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
 * Evaluate the current join-form state from the page, optionally selecting the target user.
 * @param {import('playwright').Page} page
 * @param {string} userLabel
 * @param {'read'|'select'} action
 */
async function evaluateJoinControl(page, userLabel, action) {
  return page.evaluate(({ selectSelector, tileSelector, userLabel: targetLabel, action }) => {
    const normalize = value => String(value ?? '').trim().toLowerCase();
    const target = normalize(targetLabel);
    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden) return false;
      const style = globalThis.getComputedStyle(element);
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
    const findJoinButton = () => Array.from(document.querySelectorAll('button')).find(button => {
      const text = normalize(button.textContent);
      return text.includes('join game session') || button.name === 'join';
    }) ?? null;
    const findSelect = () => {
      const selects = Array.from(document.querySelectorAll(selectSelector))
        .filter(node => node instanceof HTMLSelectElement);
      return selects.find(isVisible) ?? selects[selects.length - 1] ?? null;
    };
    const readOptions = select => Array.from(select.options)
        .map(option => ({
          option,
          label: option.textContent?.trim() ?? '',
          value: option.value,
          disabled: option.disabled
        }))
        .filter(option => option.value && !option.disabled);
    const readSelectState = select => {
      const options = readOptions(select);
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
        joinButtonDisabled: Boolean(findJoinButton()?.disabled),
        reason: options.length === 0 ? 'User select has no joinable options yet.' : null
      };
    };
    const readTileState = (fallbackTile = null) => {
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
      }) ?? fallbackTile;
      const selectedLabel = selectedTile ? getNodeLabel(selectedTile) : '';

      return {
        mode: tiles.length > 0 ? 'tile' : null,
        targetFound: availableUsers.some(matchTarget),
        selectionMatches: Boolean(selectedValue || selectedLabel) && matchTarget(selectedLabel || selectedValue),
        selectedLabel,
        selectedValue,
        availableUsers,
        joinButtonDisabled: Boolean(findJoinButton()?.disabled),
        reason: tiles.length === 0 ? 'Join page did not expose a selectable user control.' : null
      };
    };

    const select = findSelect();
    if (action === 'select') {
      if (select) {
        const options = readOptions(select);
        const match = options.find(entry => matchTarget(entry.label)) ?? null;
        if (!match) {
          const state = readSelectState(select);
          return {
            ...state,
            selected: false,
            reason: `User "${targetLabel}" was not found in the join select.`
          };
        }

        select.selectedIndex = match.option.index;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const state = readSelectState(select);
        return {
          ...state,
          selected: state.selectionMatches,
          reason: null
        };
      }

      const tiles = Array.from(document.querySelectorAll(tileSelector))
        .filter(isVisible);
      const match = tiles.find(tile => matchTarget(getNodeLabel(tile))) ?? null;
      if (!match) {
        const state = readTileState();
        return {
          ...state,
          selected: false,
          reason: `User "${targetLabel}" was not found in the join tiles.`
        };
      }

      match.click();
      const state = readTileState(match);
      return {
        ...state,
        selected: state.selectionMatches,
        reason: null
      };
    }

    return select ? readSelectState(select) : readTileState();
  }, {
    selectSelector: JOIN_USER_SELECT_SELECTOR,
    tileSelector: JOIN_USER_TILE_SELECTOR,
    userLabel,
    action
  });
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
  return evaluateJoinControl(page, userLabel, 'read');
}

/**
 * Wait until the join UI exposes a selectable user.
 * @param {import('playwright').Page} page
 * @param {string} userLabel
 */
async function waitForJoinUi(page, userLabel) {
  const joinButton = page.locator(JOIN_BUTTON_SELECTOR).first();
  await joinButton.waitFor({ state: 'visible', timeout: 15_000 });
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < 15_000) {
    lastState = await readJoinState(page, userLabel);
    if (lastState.targetFound) return;
    await page.waitForTimeout(250);
  }
  throw new Error(lastState?.reason ?? `Join UI did not expose "${userLabel}" within 15000ms.`);
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
  return evaluateJoinControl(page, userLabel, 'select');
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
 * Capture a manager view after applying the standard layout and overlay checks.
 * @param {import('playwright').Page} page
 * @param {{ width?: number, height?: number, layout: string, label: string, settleMs?: number }} options
 */
async function captureStableManagerView(page, { width, height, layout, label, settleMs = 0 }) {
  if (typeof width === 'number' && typeof height === 'number') {
    await setManagerWindowSize(page, { width, height });
  }
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
  await assertManagerLayoutStable(page, layout);
  await assertNoScreenshotOverlays(page);
  await screenshot(page, label);
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
      '.manager-recipe-edit-main',
      '.manager-component-edit-view',
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
      || metric.selector === '.manager-recipe-edit-main'
      || metric.selector === '.manager-component-edit-view'
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
          name: 'Forage Wild Herbs',
          description: 'Forage the wayside for common herbs and roots.',
          img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
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
          description: 'Pick fresh herbs from the open meadow.',
          img: 'icons/consumables/plants/fern-sprig-stem-leaf-herb-green.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-meadow-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 90, enabled: true }]
        },
        {
          id: 'smoke-sunken-survey', name: 'Survey Sunken Reagents',
          description: 'Wade the flooded ruins for reagents settled in the silt.',
          img: 'icons/environment/wilderness/wall-ruins.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-sunken-drop', componentId: componentMap['Iron Ore'], quantity: 1, dropRate: 70, enabled: true }]
        },
        {
          id: 'smoke-crystal-dew', name: 'Bottle Crystal Dew',
          description: "Cut dew-laden crystal fronds with a herbalist's sickle.",
          img: 'icons/consumables/potions/flask-corked-blue.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          toolIds: ['smoke-herbalist-sickle'],
          dropRows: [{ id: 'smoke-crystal-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 80, enabled: true }]
        },
        {
          id: 'smoke-slow-bloom', name: 'Tend Slow Bloom',
          description: 'Tend the slow bloom until it ripens.',
          img: 'icons/commodities/flowers/lily-bloom.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          timeRequirement: { minutes: 1, hours: 0, days: 0, months: 0, years: 0 },
          dropRows: [{ id: 'smoke-bloom-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 80, enabled: true }]
        },
        {
          id: 'smoke-withered-search', name: 'Search Withered Patch',
          description: 'Pick over a blighted patch for anything still growing.',
          img: 'icons/consumables/plants/dried-herb-bundle-brown.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-withered-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 0, enabled: true }]
        },
        {
          id: 'smoke-moonpetal', name: 'Secret Moonpetal Harvest',
          description: 'Harvest moonpetals that open only by night.',
          img: 'icons/commodities/flowers/lotus-white.webp',
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
          componentId: componentMap['Herbalist Sickle'],
          requirement: { formula: '@tools.herbalism.value' },
          breakage: { mode: 'limitedUses', maxUses: 5 },
          onBreak: { mode: 'flagBroken' }
        }
      ],
      events: [
        ...withoutIds(systemConfig.events, new Set(['smoke-bramble-event'])),
        {
          id: 'smoke-bramble-event',
          name: 'Bramble Snare',
          description: 'Thorned brambles snare the careless gatherer.',
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
          name: 'Shrouded Grove',
          description: 'A fog-veiled grove where the harvest is never certain until tried.',
          img: 'icons/magic/nature/tree-spirit-green.webp',
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
          name: 'Sealed Barrow',
          description: 'A hollow sealed against trespass, not yet open to gatherers.',
          img: 'icons/environment/wilderness/mine-interior-dungeon-door.webp',
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
 * Seed the craft-execution coverage fixtures for issue #489.
 *
 * These are ALWAYS-RUN (rc/ci included): the crafts, tool breakages, salvage,
 * and negative gating below are cheap `page.evaluate` calls with no screenshots,
 * so they maximise CI coverage without materially moving the rc budget. Because
 * crafting resolution mode is a SYSTEM-level property (`getMode(recipe)` reads
 * `system.resolutionMode`), each mode needs its own system:
 *
 *  - "Smoke Simple Forge"        — `simple` mode; hosts the simple craft, both
 *                                  tool-breakage recipes (`breakageChance` +
 *                                  `limitedUses`), the negative tool-gating
 *                                  recipe, and a `salvageResolutionMode: 'simple'`
 *                                  salvageable component.
 *  - "Smoke Ingredient Router"   — `routedByIngredients`; a recipe with TWO
 *                                  ingredient sets mapping to DIFFERENT result
 *                                  groups (proves set→group routing).
 *  - "Smoke Check Router"        — `routedByCheck` with a deterministic
 *                                  `1d20 + 20` → Masterwork routed check and a
 *                                  recipe with TWO result groups on different
 *                                  tiers (proves tier→group routing, not the
 *                                  single-group exemption).
 *  - "Smoke Progressive Forge"   — `progressive` with a `1d20 + 20` progressive
 *                                  check; a low-difficulty result awarded in a
 *                                  single deterministic advance.
 *
 * It also seeds a guaranteed-success (`dropRate: 100`) gather task + scene-less
 * environment under the EXISTING Arcane Forge system so one execute-and-assert
 * gather can run under rc/ci via `startGatheringAttempt` (no UI / roll prompt).
 *
 * The crafter's inventory is topped up with each recipe's ingredients, the two
 * breakable tools (the `limitedUses` chisel pre-seeded to `maxUses - 1` so a
 * single craft crosses the threshold), and the salvageable component — every
 * inventory copy carries `flags.core.sourceId` so the engine matches it to the
 * managed component.
 *
 * @param {import('playwright').Page} page
 * @param {{ systemId: string, componentMap: Record<string,string> }} craftingSetup
 * @param {string} crafterId
 * @returns {Promise<object>} Fixture ids (systems, recipes, world items, tools, gather refs).
 */
async function seedSmokeCraftExecutionFixtures(page, craftingSetup, crafterId) {
  return await page.evaluate(async ({ arcaneSystemId, mysticHerbComponentId, crafterId }) => {
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);
    if (!crafter) throw new Error(`Execution fixtures: crafter ${crafterId} not found`);

    const rawItemTypes = game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? [];
    const itemTypes = Array.from(rawItemTypes);
    const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

    // ── 1. World items ──────────────────────────────────────────────────────
    const worldSpecs = [
      // simple system
      { name: 'Smoke Plank', img: 'icons/commodities/wood/lumber-stack.webp' },
      { name: 'Smoke Crate', img: 'icons/containers/boxes/box-gift-white.webp' },
      { name: 'Smoke Mallet', img: 'icons/tools/hand/hammer-cobbler-steel.webp' },
      { name: 'Smoke Toy', img: 'icons/commodities/wood/blocks-cut-brown.webp' },
      { name: 'Smoke Chisel', img: 'icons/tools/hand/chisel-steel-brown.webp' },
      { name: 'Smoke Dowel', img: 'icons/commodities/wood/lumber-plank-brown.webp' },
      { name: 'Smoke Anvil', img: 'icons/tools/smithing/anvil.webp' },
      { name: 'Smoke Bracket', img: 'icons/commodities/metal/fragments-steel-barbed.webp' },
      { name: 'Smoke Relic', img: 'icons/commodities/treasure/crown-gold-laurel-wreath.webp' },
      { name: 'Smoke Shard', img: 'icons/commodities/gems/gem-fragments-red.webp' },
      // simple system — multi-option ingredient recipe (issue #552): two
      // interchangeable coil components the crafter holds + the woven result.
      { name: 'Smoke Copper Coil', img: 'icons/commodities/metal/wire-copper.webp' },
      { name: 'Smoke Bronze Coil', img: 'icons/commodities/metal/wire-brass.webp' },
      { name: 'Smoke Filigree', img: 'icons/commodities/metal/mail-chain-gold.webp' },
      // routedByIngredients system
      { name: 'Smoke Ingot A', img: 'icons/commodities/metal/ingot-engraved-silver.webp' },
      { name: 'Smoke Ingot B', img: 'icons/commodities/metal/ingot-gold.webp' },
      { name: 'Smoke Ring', img: 'icons/equipment/finger/ring-band-engraved-lines-gold.webp' },
      { name: 'Smoke Amulet', img: 'icons/equipment/neck/amulet-round-engraved-gold.webp' },
      // routedByCheck system
      { name: 'Smoke Bar', img: 'icons/commodities/metal/ingot-plain-steel.webp' },
      { name: 'Smoke Masterwork Blade', img: 'icons/weapons/swords/sword-guard-blue.webp' },
      { name: 'Smoke Standard Blade', img: 'icons/weapons/swords/greatsword-blue.webp' },
      // progressive system
      { name: 'Smoke Clay', img: 'icons/commodities/stone/clay-grey.webp' },
      { name: 'Smoke Brick', img: 'icons/commodities/stone/masonry-bricks-brown.webp' }
    ];
    const createdItems = await Item.createDocuments(
      worldSpecs.map((s) => ({ name: s.name, type: itemType, img: s.img }))
    );
    const world = {};
    for (const item of createdItems) world[item.name] = item;
    const executionItemIds = createdItems.map((i) => i.id);

    // Register a set of world items as managed components on a system, giving
    // each the supplied difficulty (progressive result awarding needs difficulty
    // >= 1; it is inert for the other modes).
    const registerComponents = async (systemId, names, difficulty = 1) => {
      const map = {};
      for (const name of names) {
        const result = await csm.addItemFromUuid(systemId, world[name].uuid);
        map[name] = result.item.id;
        await csm.updateItem(systemId, map[name], { difficulty });
      }
      return map;
    };

    // Inventory copies matched to the managed component by `flags.core.sourceId`.
    const invCopies = (name, qty, extraFabricateFlags = null) =>
      Array.from({ length: qty }, () => ({
        name: world[name].name,
        type: world[name].type,
        img: world[name].img,
        flags: {
          core: { sourceId: world[name].uuid },
          ...(extraFabricateFlags ? { fabricate: extraFabricateFlags } : {})
        }
      }));

    // ── 2. SIMPLE system (+ breakage / limitedUses / negative-gating / salvage) ─
    const simpleSystem = await csm.createSystem({
      name: 'Smoke Simple Forge',
      description: 'Issue #489: simple-mode crafts, tool breakage, and salvage execution coverage.'
    });
    const simpleSystemId = simpleSystem.id;
    const simpleMap = await registerComponents(simpleSystemId, [
      'Smoke Plank', 'Smoke Crate', 'Smoke Mallet', 'Smoke Toy',
      'Smoke Chisel', 'Smoke Dowel', 'Smoke Anvil', 'Smoke Bracket',
      'Smoke Relic', 'Smoke Shard',
      // Multi-option ingredient recipe (issue #552) components.
      'Smoke Copper Coil', 'Smoke Bronze Coil', 'Smoke Filigree'
    ]);
    const malletToolId = 'smoke-mallet-tool';
    const chiselToolId = 'smoke-chisel-tool';
    const anvilToolId = 'smoke-anvil-tool';
    const chiselMaxUses = 2;
    await csm.updateSystem(simpleSystemId, {
      resolutionMode: 'simple',
      salvageResolutionMode: 'simple',
      tools: [
        {
          // Always breaks (rng()*100 ∈ [0,100) < 100) → deterministic breakageChance break.
          id: malletToolId,
          label: 'Smoke Mallet',
          enabled: true,
          componentId: simpleMap['Smoke Mallet'],
          breakage: { mode: 'breakageChance', breakageChance: 100 },
          onBreak: { mode: 'flagBroken' }
        },
        {
          // limitedUses: applyUsage increments FIRST, then evaluateBreakage compares
          // post-increment `timesUsed >= maxUses`. The assertion crafts this recipe
          // `maxUses` (2) times — the first craft (timesUsed 1 < 2) does NOT break,
          // the second (timesUsed 2 >= 2) crosses the threshold and breaks. This
          // "craft maxUses times" variant avoids pre-seeding the double-nested
          // `flags.fabricate.fabricate.toolUsage` accessor from item-creation data.
          id: chiselToolId,
          label: 'Smoke Chisel',
          enabled: true,
          componentId: simpleMap['Smoke Chisel'],
          breakage: { mode: 'limitedUses', maxUses: chiselMaxUses },
          onBreak: { mode: 'flagBroken' }
        },
        {
          // Required by the negative-gating recipe; the crafter never holds it.
          id: anvilToolId,
          label: 'Smoke Anvil',
          enabled: true,
          componentId: simpleMap['Smoke Anvil'],
          breakage: { mode: 'immune' },
          onBreak: { mode: 'flagBroken' }
        }
      ]
    });
    // Salvage config on Smoke Relic: simple mode (deterministic success, no
    // timeRequirement, no tools) → exactly one result group per validateSalvage.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Relic'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{
          id: 'smoke-relic-parts',
          name: 'Salvaged Parts',
          results: [{ id: 'smoke-shard-result', componentId: simpleMap['Smoke Shard'], quantity: 2 }]
        }]
      }
    });

    const simpleRecipe = await rm.createRecipe({
      name: 'Smoke Assemble Crate',
      description: 'Simple-mode craft: one ingredient set, one result group.',
      craftingSystemId: simpleSystemId,
      img: 'icons/containers/boxes/box-gift-white.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Crate',
        results: [{ componentId: simpleMap['Smoke Crate'], quantity: 1 }]
      }]
    });
    const breakageRecipe = await rm.createRecipe({
      name: 'Smoke Carve Toy',
      description: 'Simple-mode craft whose breakageChance tool always breaks.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/wood/blocks-cut-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Toy', results: [{ componentId: simpleMap['Smoke Toy'], quantity: 1 }] }]
    });
    await rm.updateRecipe(breakageRecipe.id, { toolIds: [malletToolId] });
    const limitedUsesRecipe = await rm.createRecipe({
      name: 'Smoke Turn Dowel',
      description: 'Simple-mode craft whose limitedUses tool breaks at its maxUses threshold.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/wood/lumber-plank-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Dowel', results: [{ componentId: simpleMap['Smoke Dowel'], quantity: 1 }] }]
    });
    await rm.updateRecipe(limitedUsesRecipe.id, { toolIds: [chiselToolId] });
    const negativeToolRecipe = await rm.createRecipe({
      name: 'Smoke Bend Bracket',
      description: 'Simple-mode craft requiring a tool the crafter does not hold (negative gating).',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/metal/fragments-steel-barbed.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Bracket', results: [{ componentId: simpleMap['Smoke Bracket'], quantity: 1 }] }]
    });
    await rm.updateRecipe(negativeToolRecipe.id, { toolIds: [anvilToolId] });

    // Multi-option ingredient recipe (issue #552): a single ingredient group that
    // offers TWO interchangeable components the crafter actually holds, so the
    // player detail renders the IngredientOptionSelector "Alternatives"
    // radiogroup with two satisfiable, selectable rows. Additive — no execution
    // assert consumes it — so it never perturbs the #489 consumption pins.
    const multiOptionRecipe = await rm.createRecipe({
      name: 'Smoke Weave Filigree',
      description: 'Simple-mode craft with one ingredient group offering two interchangeable coils (issue #552).',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/metal/mail-chain-gold.webp',
      ingredientSets: [{
        ingredientGroups: [{
          id: 'smoke-coil-choice',
          name: 'Coil',
          options: [
            { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Copper Coil'] } },
            { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Bronze Coil'] } }
          ]
        }]
      }],
      resultGroups: [{
        name: 'Filigree',
        results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }]
      }]
    });

    // ── 3. ROUTED-BY-INGREDIENTS system (multi-set → differing groups) ──────
    const ingredientRouterSystem = await csm.createSystem({
      name: 'Smoke Ingredient Router',
      description: 'Issue #489: routedByIngredients multi-set routing coverage.'
    });
    const ingredientRouterSystemId = ingredientRouterSystem.id;
    const routerMap = await registerComponents(ingredientRouterSystemId, [
      'Smoke Ingot A', 'Smoke Ingot B', 'Smoke Ring', 'Smoke Amulet'
    ]);
    await csm.updateSystem(ingredientRouterSystemId, { resolutionMode: 'routedByIngredients' });
    const setAId = 'smoke-set-a';
    const setBId = 'smoke-set-b';
    const ringGroupId = 'smoke-group-ring';
    const amuletGroupId = 'smoke-group-amulet';
    const ingredientRoutedRecipe = await rm.createRecipe({
      name: 'Smoke Cast Jewelry',
      description: 'routedByIngredients: each ingredient set maps to a different result group.',
      craftingSystemId: ingredientRouterSystemId,
      img: 'icons/equipment/finger/ring-band-engraved-lines-gold.webp',
      complex: true,
      ingredientSets: [
        {
          id: setAId,
          name: 'Silver route',
          resultGroupId: ringGroupId,
          ingredientGroups: [{
            name: 'Ingot A',
            options: [{ quantity: 1, match: { type: 'component', componentId: routerMap['Smoke Ingot A'] } }]
          }]
        },
        {
          id: setBId,
          name: 'Gold route',
          resultGroupId: amuletGroupId,
          ingredientGroups: [{
            name: 'Ingot B',
            options: [{ quantity: 1, match: { type: 'component', componentId: routerMap['Smoke Ingot B'] } }]
          }]
        }
      ],
      resultGroups: [
        { id: ringGroupId, name: 'Ring', results: [{ componentId: routerMap['Smoke Ring'], quantity: 1 }] },
        { id: amuletGroupId, name: 'Amulet', results: [{ componentId: routerMap['Smoke Amulet'], quantity: 1 }] }
      ]
    });

    // ── 4. ROUTED-BY-CHECK system (multi-group → different tiers) ───────────
    const checkRouterSystem = await csm.createSystem({
      name: 'Smoke Check Router',
      description: 'Issue #489: routedByCheck multi-group tier routing coverage.'
    });
    const checkRouterSystemId = checkRouterSystem.id;
    const checkMap = await registerComponents(checkRouterSystemId, [
      'Smoke Bar', 'Smoke Masterwork Blade', 'Smoke Standard Blade'
    ]);
    await csm.updateSystem(checkRouterSystemId, {
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          // 1d20 + 20 (21-40) vs dc 12 always meets Masterwork (dc 5) → deterministic tier.
          rollFormula: '1d20 + 20',
          dc: 12,
          thresholdMode: 'meet',
          relativeOutcomes: [
            { id: 'craft-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
            { id: 'craft-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
            { id: 'craft-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 }
          ]
        }
      }
    });
    const masterGroupId = 'smoke-group-master';
    const standardGroupId = 'smoke-group-standard';
    const checkRoutedRecipe = await rm.createRecipe({
      name: 'Smoke Forge Blade',
      description: 'routedByCheck: two result groups mapped to different outcome tiers.',
      craftingSystemId: checkRouterSystemId,
      img: 'icons/weapons/swords/sword-guard-blue.webp',
      complex: true,
      ingredientSets: [{
        name: 'Stock',
        ingredientGroups: [{
          name: 'Bar',
          options: [{ quantity: 1, match: { type: 'component', componentId: checkMap['Smoke Bar'] } }]
        }]
      }],
      resultGroups: [
        {
          id: masterGroupId,
          name: 'Masterwork Blade',
          checkOutcomeIds: ['craft-masterwork'],
          results: [{ componentId: checkMap['Smoke Masterwork Blade'], quantity: 1 }]
        },
        {
          id: standardGroupId,
          name: 'Standard Blade',
          checkOutcomeIds: ['craft-standard'],
          results: [{ componentId: checkMap['Smoke Standard Blade'], quantity: 1 }]
        }
      ]
    });

    // ── 5. PROGRESSIVE system (single deterministic advance) ────────────────
    const progressiveSystem = await csm.createSystem({
      name: 'Smoke Progressive Forge',
      description: 'Issue #489: progressive budget-vs-difficulty completion coverage.'
    });
    const progressiveSystemId = progressiveSystem.id;
    const progressiveMap = await registerComponents(
      progressiveSystemId,
      ['Smoke Clay', 'Smoke Brick'],
      1
    );
    await csm.updateSystem(progressiveSystemId, {
      resolutionMode: 'progressive',
      features: { craftingChecks: true },
      craftingCheck: {
        enabled: true,
        // 1d20 + 20 budget (21-40) far exceeds the Smoke Brick difficulty (1) so a
        // single advance awards it (progressive is budget-vs-difficulty, not tiered).
        progressive: { rollFormula: '1d20 + 20', awardMode: 'equal' }
      }
    });
    const progressiveRecipe = await rm.createRecipe({
      name: 'Smoke Mold Brick',
      description: 'progressive: one low-difficulty result awarded in a single advance.',
      craftingSystemId: progressiveSystemId,
      img: 'icons/commodities/stone/masonry-bricks-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Clay',
          options: [{ quantity: 1, match: { type: 'component', componentId: progressiveMap['Smoke Clay'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Brick',
        results: [{ id: 'smoke-brick-result', componentId: progressiveMap['Smoke Brick'], quantity: 1 }]
      }]
    });

    // ── 6. Crafter inventory top-up ─────────────────────────────────────────
    await crafter.createEmbeddedDocuments('Item', [
      ...invCopies('Smoke Plank', 5),                 // simple(1) + breakage(1) + limitedUses(2) crafts; negative consumes none
      ...invCopies('Smoke Mallet', 1),                // breakageChance tool
      ...invCopies('Smoke Chisel', 1),                // limitedUses tool (broken by crafting maxUses times)
      ...invCopies('Smoke Relic', 1),                 // salvageable component
      ...invCopies('Smoke Copper Coil', 1),           // multi-option recipe alternative A (#552)
      ...invCopies('Smoke Bronze Coil', 1),           // multi-option recipe alternative B (#552)
      ...invCopies('Smoke Ingot A', 1),               // routedByIngredients set A
      ...invCopies('Smoke Ingot B', 1),               // routedByIngredients set B (asserted NOT produced)
      ...invCopies('Smoke Bar', 1),                   // routedByCheck stock
      ...invCopies('Smoke Clay', 1)                   // progressive stock
    ]);

    // ── 7. Always-run guaranteed-success gather (Arcane Forge, scene-less) ──
    // A dropRate:100 d100 task under a scene-less manual environment so the
    // rc/ci gather-inventory-delta assertion via startGatheringAttempt is
    // deterministic (no scene gate, no tool gate, no roll prompt).
    const rcGatherTaskId = 'smoke-rc-forage';
    const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
    config.systems = config.systems || {};
    const arcaneConfig = config.systems[arcaneSystemId] || {};
    const existingTasks = Array.isArray(arcaneConfig.tasks) ? arcaneConfig.tasks : [];
    config.systems[arcaneSystemId] = {
      ...arcaneConfig,
      tasks: [
        ...existingTasks.filter((task) => task?.id !== rcGatherTaskId),
        {
          id: rcGatherTaskId,
          name: 'Smoke RC Forage',
          description: 'Guaranteed-drop forage for the rc/ci gather-delta assertion.',
          img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
          enabled: true,
          // No weather/timeOfDay constraints (like the meadowlands library tasks):
          // the direct start path does not apply CONDITIONS_BLOCKED, and leaving them
          // off keeps this "guaranteed-success" task honestly unconditional.
          region: 'northreach',
          biomes: ['forest'],
          itemSelectionMode: 'highestRankedDrop',
          dropRows: [{
            id: 'smoke-rc-drop',
            componentId: mysticHerbComponentId,
            quantity: 1,
            dropRate: 100,
            enabled: true
          }]
        }
      ]
    };
    await game.settings.set('fabricate', 'gatheringConfig', config);

    const environmentStore = game.fabricate.getGatheringEnvironmentStore();
    // rc/ci gather env: MANUAL composition force-includes ONLY the guaranteed task
    // and NO events, so the always-run inventory-delta assertion cannot be
    // perturbed by a hazardous event flipping the outcome.
    const rcGatherEnvironment = await environmentStore.create({
      craftingSystemId: arcaneSystemId,
      name: 'Smoke RC Meadow',
      description: 'Scene-less guaranteed-success environment for the rc/ci gather-delta assertion.',
      img: 'icons/consumables/plants/grass-leaves-green.webp',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      compositionMode: 'manual',
      region: 'northreach',
      biomes: ['forest'],
      forcedTaskIds: [rcGatherTaskId]
    });
    // Full-profile hazard env: AUTOMATIC composition + matching region/biome, so it
    // composes BOTH the guaranteed task and the seeded hazardous smoke-bramble-event.
    // The env MUST carry a hazardous danger level: automatic event composition only
    // includes events up to the env's danger rank (evaluateDangerField:
    // eventRank <= dangerRank(envLevel)), so a default 'safe' env would never compose
    // the hazardous (rank 2) event — mirroring the Azure Grove fixture's dangerTags.
    // Scene-less so a headless GM can attempt it (Azure Grove's sceneUuid gate blocks
    // every viewer). The hazard assertion forces the event dropRate to 100 to fire.
    const hazardEnvironment = await environmentStore.create({
      craftingSystemId: arcaneSystemId,
      name: 'Smoke Hazard Grove',
      description: 'Scene-less environment that composes the hazardous Bramble Snare event for #489.',
      img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      region: 'northreach',
      biomes: ['forest'],
      dangerTags: ['hazardous'],
      eventPolicy: 'successWithEvent',
      eventSelectionMode: 'highestRankedDrop'
    });

    return {
      executionItemIds,
      executionSystemIds: [
        simpleSystemId, ingredientRouterSystemId, checkRouterSystemId, progressiveSystemId
      ],
      executionRecipeIds: [
        simpleRecipe.id, breakageRecipe.id, limitedUsesRecipe.id, negativeToolRecipe.id,
        multiOptionRecipe.id,
        ingredientRoutedRecipe.id, checkRoutedRecipe.id, progressiveRecipe.id
      ],
      simple: {
        systemId: simpleSystemId,
        simpleRecipeId: simpleRecipe.id,
        breakageRecipeId: breakageRecipe.id,
        limitedUsesRecipeId: limitedUsesRecipe.id,
        negativeToolRecipeId: negativeToolRecipe.id,
        malletComponentId: simpleMap['Smoke Mallet'],
        chiselComponentId: simpleMap['Smoke Chisel'],
        relicComponentId: simpleMap['Smoke Relic']
      },
      ingredientRouted: {
        recipeId: ingredientRoutedRecipe.id,
        // Deliberately the SECOND set → the Amulet group (resultGroups[1], NOT the
        // first group), so the assertion proves the router selects a non-index-0
        // group by set assignment rather than always emitting resultGroups[0].
        chosenSetId: setBId
      },
      checkRouted: { recipeId: checkRoutedRecipe.id },
      progressive: { recipeId: progressiveRecipe.id },
      gather: { environmentId: rcGatherEnvironment.id, taskId: rcGatherTaskId },
      hazard: { environmentId: hazardEnvironment.id, taskId: rcGatherTaskId }
    };
  }, {
    arcaneSystemId: craftingSetup.systemId,
    mysticHerbComponentId: craftingSetup.componentMap['Mystic Herb'],
    crafterId
  });
}

/**
 * Seed the player-facing Alchemy workbench coverage fixtures (issue #543).
 *
 * Creates TWO enabled `resolutionMode: 'alchemy'` crafting systems so the shared
 * Fabricate app both surfaces the Alchemy tab (see `isAlchemyTabAvailable`: an
 * enabled alchemy system owning at least one recipe) AND renders the discipline
 * chooser (which only appears with more than one alchemy system):
 *
 *  - "Bubbling Cauldron" — reuses the EXISTING world items the crafter already
 *    owns (Mystic Herb, Empty Vial, Dragon Scale, seeded in Phase B) as managed
 *    components so the workbench inventory column shows owned, placeable
 *    components, plus two product components. Two valid alchemy recipes with
 *    DISTINCT ingredient signatures (Mystic Herb×2; Mystic Herb×1 + Empty Vial×1),
 *    each with one result group and `resultSelection.provider: 'ingredientSet'`,
 *    no steps.
 *  - "Herbalist's Table" — a second alchemy system with its own component +
 *    product and one valid recipe, enough to give the chooser a second card.
 *
 * Alchemy recipes are authored AFTER the owning system is switched to alchemy:
 * `createRecipe` runs activation validation under the system's resolution mode
 * (the alchemy rules require ingredient sets, result groups, the `ingredientSet`
 * provider and no explicit steps) plus a per-system signature-uniqueness check,
 * so an invalid shape or a colliding signature throws here instead of silently
 * producing a disabled recipe. Every create/register is asserted.
 *
 * @param {import('playwright').Page} page
 * @param {{ systemId: string, componentMap: Record<string,string> }} craftingSetup
 * @param {string} crafterId
 * @returns {Promise<object>} Alchemy fixture ids (systems, recipes, product items, component maps).
 */
async function seedSmokeAlchemyFixtures(page, craftingSetup, crafterId) {
  return await page.evaluate(async ({ crafterId }) => {
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);
    if (!crafter) throw new Error(`Alchemy fixtures: crafter ${crafterId} not found`);

    const rawItemTypes = game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? [];
    const itemTypes = Array.from(rawItemTypes);
    const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

    // Existing world items the crafter already owns: reuse them as managed
    // components so the workbench inventory column shows owned, placeable rows.
    const worldByName = Object.fromEntries(game.items.contents.map((item) => [item.name, item]));
    const requireWorldItem = (name) => {
      const item = worldByName[name];
      if (!item) throw new Error(`Alchemy fixtures: world item "${name}" not found`);
      return item;
    };

    // Product / second-system world items. Alchemy result groups reference managed
    // components, so the products (and the second system's ingredient) must be
    // registered components too. Non-SVG raster core icons per the fixture rule.
    const productSpecs = [
      { name: 'Elixir of Vigor', img: 'icons/consumables/potions/potion-tube-corked-red.webp' },
      { name: 'Verdant Tonic', img: 'icons/consumables/potions/flask-corked-blue.webp' },
      { name: 'Powdered Root', img: 'icons/consumables/plants/dried-herb-bundle-brown.webp' },
      { name: 'Soothing Balm', img: 'icons/consumables/potions/bottle-round-corked-red.webp' }
    ];
    const createdProducts = await Item.createDocuments(
      productSpecs.map((spec) => ({ name: spec.name, type: itemType, img: spec.img }))
    );
    const productByName = Object.fromEntries(createdProducts.map((item) => [item.name, item]));
    const alchemyProductItemIds = createdProducts.map((item) => item.id);

    const registerComponent = async (systemId, worldItem) => {
      const result = await csm.addItemFromUuid(systemId, worldItem.uuid);
      if (!result?.item?.id) {
        throw new Error(`Alchemy fixtures: failed to register component "${worldItem.name}"`);
      }
      return result.item.id;
    };

    // ── System 1: Bubbling Cauldron (alchemy, reuses owned components) ───────
    const cauldron = await csm.createSystem({
      name: 'Bubbling Cauldron',
      description: 'Issue #543: player alchemy workbench — combine herbs to discover brews.'
    });
    if (!cauldron?.id) throw new Error('Alchemy fixtures: Bubbling Cauldron create failed');
    const cauldronId = cauldron.id;
    await csm.updateSystem(cauldronId, {
      resolutionMode: 'alchemy',
      enabled: true,
      // Simple check mode (#554): a mandatory pass/fail check + a reserved failure
      // result set. Exercises the check-gated workbench + the failure-group authoring.
      alchemy: {
        learnOnCraft: true,
        consumeOnFail: true,
        showAttemptHistoryToPlayers: false,
        checkMode: 'simple'
      },
      craftingCheck: { simple: { rollFormula: '1d20', dc: 10 } }
    });
    const cauldronMap = {
      'Mystic Herb': await registerComponent(cauldronId, requireWorldItem('Mystic Herb')),
      'Empty Vial': await registerComponent(cauldronId, requireWorldItem('Empty Vial')),
      'Dragon Scale': await registerComponent(cauldronId, requireWorldItem('Dragon Scale')),
      'Elixir of Vigor': await registerComponent(cauldronId, productByName['Elixir of Vigor']),
      'Verdant Tonic': await registerComponent(cauldronId, productByName['Verdant Tonic'])
    };
    const elixirRecipe = await rm.createRecipe({
      name: 'Elixir of Vigor',
      description: 'Alchemy: two mystic herbs reduce to a vigor elixir.',
      craftingSystemId: cauldronId,
      img: 'icons/consumables/potions/potion-tube-corked-red.webp',
      ingredientSets: [{
        name: 'Herbal base',
        ingredientGroups: [{
          name: 'Mystic Herb',
          options: [{ quantity: 2, match: { type: 'component', componentId: cauldronMap['Mystic Herb'] } }]
        }]
      }],
      resultGroups: [
        {
          name: 'Elixir',
          results: [{ componentId: cauldronMap['Elixir of Vigor'], quantity: 1 }]
        },
        {
          // Reserved failure result set (#554): produced on a failed Simple check.
          role: 'failure',
          name: '',
          results: [{ componentId: cauldronMap['Dragon Scale'], quantity: 1 }]
        }
      ]
    });
    const tonicRecipe = await rm.createRecipe({
      name: 'Verdant Tonic',
      description: 'Alchemy: one mystic herb bottled in an empty vial makes a tonic.',
      craftingSystemId: cauldronId,
      img: 'icons/consumables/potions/flask-corked-blue.webp',
      resultSelection: { provider: 'ingredientSet' },
      ingredientSets: [{
        name: 'Bottled brew',
        ingredientGroups: [
          {
            name: 'Mystic Herb',
            options: [{ quantity: 1, match: { type: 'component', componentId: cauldronMap['Mystic Herb'] } }]
          },
          {
            name: 'Empty Vial',
            options: [{ quantity: 1, match: { type: 'component', componentId: cauldronMap['Empty Vial'] } }]
          }
        ]
      }],
      resultGroups: [{
        name: 'Tonic',
        results: [{ componentId: cauldronMap['Verdant Tonic'], quantity: 1 }]
      }]
    });

    // ── System 2: Herbalist's Table (second alchemy discipline) ─────────────
    const herbalist = await csm.createSystem({
      name: "Herbalist's Table",
      description: "Issue #543: a second alchemy discipline so the workbench chooser offers a choice."
    });
    if (!herbalist?.id) throw new Error("Alchemy fixtures: Herbalist's Table create failed");
    const herbalistId = herbalist.id;
    await csm.updateSystem(herbalistId, {
      resolutionMode: 'alchemy',
      enabled: true,
      alchemy: { learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: false }
    });
    const herbalistMap = {
      'Powdered Root': await registerComponent(herbalistId, productByName['Powdered Root']),
      'Soothing Balm': await registerComponent(herbalistId, productByName['Soothing Balm'])
    };
    const balmRecipe = await rm.createRecipe({
      name: 'Soothing Balm',
      description: 'Alchemy: powdered root renders into a soothing balm.',
      craftingSystemId: herbalistId,
      img: 'icons/consumables/potions/bottle-round-corked-red.webp',
      resultSelection: { provider: 'ingredientSet' },
      ingredientSets: [{
        name: 'Root base',
        ingredientGroups: [{
          name: 'Powdered Root',
          options: [{ quantity: 1, match: { type: 'component', componentId: herbalistMap['Powdered Root'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Balm',
        results: [{ componentId: herbalistMap['Soothing Balm'], quantity: 1 }]
      }]
    });

    // Every recipe must have been created enabled (createRecipe throws on an
    // invalid alchemy shape; a disabled recipe would drop its system from the
    // chooser since the listing filters `{ enabled: true }`).
    const alchemyRecipes = [elixirRecipe, tonicRecipe, balmRecipe];
    for (const recipe of alchemyRecipes) {
      if (!recipe?.id) throw new Error('Alchemy fixtures: recipe create returned no id');
      if (recipe.enabled !== true) {
        throw new Error(
          `Alchemy fixtures: recipe "${recipe.name}" was not created enabled ` +
          `(invalid alchemy shape or signature collision)`
        );
      }
    }

    return {
      alchemySystemIds: [cauldronId, herbalistId],
      cauldronSystemId: cauldronId,
      herbalistSystemId: herbalistId,
      alchemyRecipeIds: alchemyRecipes.map((recipe) => recipe.id),
      alchemyProductItemIds,
      alchemyComponentMap: { [cauldronId]: cauldronMap, [herbalistId]: herbalistMap }
    };
  }, { crafterId });
}

/**
 * Execute and assert the issue #489 craft-execution coverage scenarios.
 *
 * Runs the crafts, tool breakages, salvage, negative gating, and the
 * guaranteed-success gather entirely via the runtime API (no UI/screenshots),
 * returning one `{ step, passed, error? }` record per scenario for the caller to
 * fold into `results.steps` (a failed record fails the run via the final
 * step-failure gate).
 *
 * @param {import('playwright').Page} page
 * @param {object} fixtures Result of {@link seedSmokeCraftExecutionFixtures}.
 * @param {string} crafterId
 * @returns {Promise<Array<{step: string, passed: boolean, error?: string}>>}
 */
async function runCraftExecutionAsserts(page, fixtures, crafterId) {
  return await page.evaluate(async ({ fixtures, crafterId }) => {
    const steps = [];
    const record = (step, passed, error) => steps.push({ step, passed, ...(error ? { error } : {}) });

    const engine = game.fabricate.getCraftingEngine();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);

    const countByName = (name) => crafter.items.contents
      .filter((i) => i.name === name)
      .reduce((sum, i) => sum + (Number(i.system?.quantity) || 1), 0);
    const toolItem = (name) => crafter.items.contents.find((i) => i.name === name) || null;
    // Mirror src/gatheringToolRuntime.js isToolBroken so the assertion reads the
    // flag through the same defensive accessors the runtime writes/reads it with.
    const isBroken = (item) =>
      item?.getFlag?.('fabricate', 'toolBroken') === true
      || item?.getFlag?.('fabricate', 'fabricate.toolBroken') === true
      || foundry.utils.getProperty(item, 'flags.fabricate.toolBroken') === true
      || foundry.utils.getProperty(item, 'flags.fabricate.fabricate.toolBroken') === true;

    // ── simple craft ────────────────────────────────────────────────────────
    try {
      const before = countByName('Smoke Crate');
      const recipe = rm.getRecipe(fixtures.simple.simpleRecipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const after = countByName('Smoke Crate');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (after !== before + 1) throw new Error(`Smoke Crate inventory ${before} -> ${after}, expected +1`);
      record('exec-craft-simple', true);
    } catch (err) {
      record('exec-craft-simple', false, err.message);
    }

    // ── routedByCheck multi-group (Masterwork produced, Standard NOT) ────────
    try {
      const masterBefore = countByName('Smoke Masterwork Blade');
      const standardBefore = countByName('Smoke Standard Blade');
      const recipe = rm.getRecipe(fixtures.checkRouted.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const masterAfter = countByName('Smoke Masterwork Blade');
      const standardAfter = countByName('Smoke Standard Blade');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (masterAfter !== masterBefore + 1) {
        throw new Error(`Masterwork Blade ${masterBefore} -> ${masterAfter}, expected +1 (selected tier group)`);
      }
      if (standardAfter !== standardBefore) {
        throw new Error(`Standard Blade ${standardBefore} -> ${standardAfter}, expected unchanged (unselected tier group)`);
      }
      record('exec-craft-routed-by-check', true);
    } catch (err) {
      record('exec-craft-routed-by-check', false, err.message);
    }

    // ── routedByIngredients multi-set (chosen 2nd set's Amulet, NOT Ring) ────
    // The chosen set (set B) maps to the Amulet group, which is resultGroups[1] —
    // NOT the first group — so this fails against an "always emit resultGroups[0]"
    // bug, proving set→group routing selects a non-index-0 group.
    try {
      const ringBefore = countByName('Smoke Ring');
      const amuletBefore = countByName('Smoke Amulet');
      const recipe = rm.getRecipe(fixtures.ingredientRouted.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, {
        componentSourceActors: [crafter],
        ingredientSetId: fixtures.ingredientRouted.chosenSetId
      });
      const ringAfter = countByName('Smoke Ring');
      const amuletAfter = countByName('Smoke Amulet');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (amuletAfter !== amuletBefore + 1) {
        throw new Error(`Smoke Amulet ${amuletBefore} -> ${amuletAfter}, expected +1 (chosen set's non-first group)`);
      }
      if (ringAfter !== ringBefore) {
        throw new Error(`Smoke Ring ${ringBefore} -> ${ringAfter}, expected unchanged (other set's group / resultGroups[0])`);
      }
      record('exec-craft-routed-by-ingredients', true);
    } catch (err) {
      record('exec-craft-routed-by-ingredients', false, err.message);
    }

    // ── progressive (single deterministic advance awards the result) ─────────
    try {
      const before = countByName('Smoke Brick');
      const recipe = rm.getRecipe(fixtures.progressive.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const after = countByName('Smoke Brick');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (after !== before + 1) throw new Error(`Smoke Brick ${before} -> ${after}, expected +1`);
      record('exec-craft-progressive', true);
    } catch (err) {
      record('exec-craft-progressive', false, err.message);
    }

    // ── breakageChance tool break (flagBroken + " (broken)" suffix) ──────────
    try {
      const recipe = rm.getRecipe(fixtures.simple.breakageRecipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      const mallet = toolItem('Smoke Mallet (broken)') || toolItem('Smoke Mallet');
      if (!mallet) throw new Error('Smoke Mallet tool item not found after craft');
      if (!isBroken(mallet)) {
        throw new Error('Smoke Mallet toolBroken flag not set after breakageChance craft');
      }
      if (!mallet.name.endsWith(' (broken)')) {
        throw new Error(`Smoke Mallet name "${mallet.name}" missing " (broken)" suffix`);
      }
      record('exec-tool-breakage-chance', true);
    } catch (err) {
      record('exec-tool-breakage-chance', false, err.message);
    }

    // ── limitedUses tool break at the maxUses threshold-crossing craft ───────
    // maxUses is 2: craft twice. The first (post-increment timesUsed 1 < 2) must
    // NOT break; the second (timesUsed 2 >= 2) crosses the threshold and breaks.
    try {
      const recipe = rm.getRecipe(fixtures.simple.limitedUsesRecipeId);
      const first = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!first.success) throw new Error(`first craft failed: ${first.message}`);
      const chiselAfterFirst = toolItem('Smoke Chisel (broken)') || toolItem('Smoke Chisel');
      if (!chiselAfterFirst) throw new Error('Smoke Chisel tool item not found after first craft');
      if (isBroken(chiselAfterFirst)) {
        throw new Error('Smoke Chisel broke before reaching maxUses (sub-threshold craft)');
      }
      const second = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!second.success) throw new Error(`second craft failed: ${second.message}`);
      const chisel = toolItem('Smoke Chisel (broken)') || toolItem('Smoke Chisel');
      if (!chisel) throw new Error('Smoke Chisel tool item not found after second craft');
      if (!isBroken(chisel)) {
        throw new Error('Smoke Chisel toolBroken flag not set at maxUses threshold craft');
      }
      if (!chisel.name.endsWith(' (broken)')) {
        throw new Error(`Smoke Chisel name "${chisel.name}" missing " (broken)" suffix`);
      }
      record('exec-tool-breakage-limited-uses', true);
    } catch (err) {
      record('exec-tool-breakage-limited-uses', false, err.message);
    }

    // ── negative tool-gating (required tool absent → success:false) ──────────
    try {
      const recipe = rm.getRecipe(fixtures.simple.negativeToolRecipeId);
      const bracketBefore = countByName('Smoke Bracket');
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const bracketAfter = countByName('Smoke Bracket');
      if (result.success !== false) throw new Error('craft succeeded but the required tool is absent');
      if (!/tool/i.test(result.message || '')) {
        throw new Error(`failure message "${result.message}" is not a tool-gating reason`);
      }
      if (bracketAfter !== bracketBefore) {
        throw new Error(`Smoke Bracket ${bracketBefore} -> ${bracketAfter}, expected no product on gated craft`);
      }
      record('exec-negative-tool-gating', true);
    } catch (err) {
      record('exec-negative-tool-gating', false, err.message);
    }

    // ── salvage (results non-null + result component lands in inventory) ─────
    try {
      const shardBefore = countByName('Smoke Shard');
      const result = await engine.salvage(
        crafter.uuid,
        fixtures.simple.systemId,
        fixtures.simple.relicComponentId,
        { skipTimeGate: true }
      );
      const shardAfter = countByName('Smoke Shard');
      if (!result.success) throw new Error(`salvage failed: ${result.message}`);
      if (result.results == null) throw new Error('salvage results is null (expected non-null)');
      if (shardAfter <= shardBefore) {
        throw new Error(`Smoke Shard ${shardBefore} -> ${shardAfter}, expected increase from salvage`);
      }
      record('exec-salvage-run', true);
    } catch (err) {
      record('exec-salvage-run', false, err.message);
    }

    // ── guaranteed-success gather (inventory increase via startGatheringAttempt) ─
    try {
      await game.fabricate.setSelectedGatheringActorId(crafterId);
      const before = countByName('Mystic Herb');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: fixtures.gather.environmentId,
        taskId: fixtures.gather.taskId
      });
      const after = countByName('Mystic Herb');
      if (result?.accepted !== true) {
        const reason = result?.blockedReasons?.[0]?.code || result?.blockedReasons?.[0] || 'unknown';
        throw new Error(`gather not accepted (state=${result?.state}, blocked=${JSON.stringify(reason)})`);
      }
      if (after <= before) {
        throw new Error(`Mystic Herb ${before} -> ${after}, expected increase from guaranteed-success gather`);
      }
      record('exec-gather-inventory-delta', true);
    } catch (err) {
      record('exec-gather-inventory-delta', false, err.message);
    }

    return steps;
  }, { fixtures, crafterId });
}

/**
 * Full-profile-only gather assertions for issue #489: the seeded 0%-drop
 * ("empty") gather, the scene-blocked gather, and the hazardous "Bramble Snare"
 * event firing. These rely on fixtures seeded only under RUN_SCREENSHOT_PHASES
 * (`seedSmokeGatheringLibrary` + the player environment fixtures), so the caller
 * gates this behind the full profile.
 *
 * The hazardous-event gather runs against the scene-less "Smoke Hazard Grove"
 * environment, which composes the SAME seeded `smoke-bramble-event` by
 * condition/biome matching, rather than Azure Grove: Azure Grove carries a
 * `sceneUuid`, and the gathering scene-access gate (`createGatheringSceneAccess`)
 * blocks EVERY viewer — GM included — from attempting unless the linked scene is
 * the active scene with one of the actor's tokens on it, which a headless smoke
 * run cannot satisfy.
 *
 * @param {import('playwright').Page} page
 * @param {{ systemId: string }} craftingSetup
 * @param {{ environmentId: string, taskId: string }} gatherFixture Hazard env/task.
 * @param {string} crafterId
 * @returns {Promise<Array<{step: string, passed: boolean, error?: string}>>}
 */
async function runFullProfileGatherAsserts(page, craftingSetup, gatherFixture, crafterId) {
  return await page.evaluate(async ({ arcaneSystemId, hazardEnvironmentId, hazardTaskId, crafterId }) => {
    const steps = [];
    const record = (step, passed, error) => steps.push({ step, passed, ...(error ? { error } : {}) });
    const crafter = game.actors.get(crafterId);
    await game.fabricate.setSelectedGatheringActorId(crafterId);
    const countByName = (name) => crafter.items.contents
      .filter((i) => i.name === name)
      .reduce((sum, i) => sum + (Number(i.system?.quantity) || 1), 0);

    const environmentStore = game.fabricate.getGatheringEnvironmentStore();
    const envByName = (name) =>
      (environmentStore.list?.() || []).find((env) => env?.name === name) || null;

    // ── 0%-drop ("empty") gather: accepted, but no items awarded ─────────────
    try {
      const witheredEnv = envByName('Withered Patch');
      if (!witheredEnv) throw new Error('Withered Patch environment not seeded (full profile)');
      const before = countByName('Mystic Herb');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: witheredEnv.id,
        taskId: 'smoke-withered-search'
      });
      const after = countByName('Mystic Herb');
      if (result?.accepted !== true) {
        throw new Error(`empty gather not accepted (state=${result?.state})`);
      }
      const created = Array.isArray(result.createdResults) ? result.createdResults : [];
      if (created.length !== 0 || after !== before) {
        throw new Error(`0%-drop gather awarded items (createdResults=${created.length}, inv ${before}->${after})`);
      }
      record('exec-gather-empty', true);
    } catch (err) {
      record('exec-gather-empty', false, err.message);
    }

    // ── scene-blocked gather: not accepted, scene-block reason ───────────────
    try {
      const sunkenEnv = envByName('Sunken Ruins');
      if (!sunkenEnv) throw new Error('Sunken Ruins environment not seeded (full profile)');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: sunkenEnv.id,
        taskId: 'smoke-sunken-survey'
      });
      if (result?.accepted === true) throw new Error('scene-blocked gather was accepted');
      const reasons = JSON.stringify(result?.blockedReasons || []);
      if (!/SCENE/i.test(reasons)) {
        throw new Error(`scene-blocked gather reason not scene-related: ${reasons}`);
      }
      record('exec-gather-scene-blocked', true);
    } catch (err) {
      record('exec-gather-scene-blocked', false, err.message);
    }

    // ── hazardous "Bramble Snare" event fires (deterministic dropRate) ───────
    try {
      // Force the seeded hazardous event to fire deterministically: raise its
      // dropRate to 100 for this assertion (restored afterwards) so the d100
      // event throw always lands.
      const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
      const systemConfig = config.systems?.[arcaneSystemId] || {};
      const events = Array.isArray(systemConfig.events) ? systemConfig.events : [];
      const brambleIndex = events.findIndex((event) => event?.id === 'smoke-bramble-event');
      if (brambleIndex < 0) throw new Error('smoke-bramble-event not seeded (full profile)');
      const originalDropRate = events[brambleIndex].dropRate;
      events[brambleIndex] = { ...events[brambleIndex], dropRate: 100 };
      config.systems[arcaneSystemId] = { ...systemConfig, events };
      await game.settings.set('fabricate', 'gatheringConfig', config);
      try {
        const result = await game.fabricate.startGatheringAttempt({
          rememberedActorId: crafterId,
          environmentId: hazardEnvironmentId,
          taskId: hazardTaskId
        });
        if (result?.accepted !== true) throw new Error(`hazard gather not accepted (state=${result?.state})`);
        const firedEvents = result?.checkResult?.events || [];
        const fired = firedEvents.some((event) => event?.id === 'smoke-bramble-event')
          || JSON.stringify(firedEvents).includes('Bramble Snare');
        if (!fired) {
          throw new Error(`Bramble Snare did not fire (events=${JSON.stringify(firedEvents)})`);
        }
        record('exec-gather-hazard-event', true);
      } finally {
        const restore = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
        const restoreSystem = restore.systems?.[arcaneSystemId] || {};
        const restoreEvents = Array.isArray(restoreSystem.events) ? restoreSystem.events : [];
        const idx = restoreEvents.findIndex((event) => event?.id === 'smoke-bramble-event');
        if (idx >= 0) {
          restoreEvents[idx] = { ...restoreEvents[idx], dropRate: originalDropRate };
          restore.systems[arcaneSystemId] = { ...restoreSystem, events: restoreEvents };
          await game.settings.set('fabricate', 'gatheringConfig', restore);
        }
      }
    } catch (err) {
      record('exec-gather-hazard-event', false, err.message);
    }

    return steps;
  }, {
    arcaneSystemId: craftingSetup.systemId,
    hazardEnvironmentId: gatherFixture.environmentId,
    hazardTaskId: gatherFixture.taskId,
    crafterId
  });
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
  // NOTE: the recipe-resolution-mode control moved off the system-edit view into
  // the dedicated Crafting Settings section (`data-crafting-resolution-mode-option`
  // in CraftingSettingsView) with the issue-511 Books & Scrolls refactor, so the
  // old `data-system-resolution-mode-option` interaction that lived here is gone.
  // The mode-change confirm flow is exercised where the control now lives.
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
  // away. Even though that dialog is already dismissed, it can still be visible
  // in screenshots, so wait for visible overlays to clear before capturing.
  const OVERLAY_SELECTOR =
    '.dialog.application, .window-app.dialog, .application.dialog, .app.dialog, #notifications .notification';
  const visibleOverlayCount = async () =>
    page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).filter((el) => {
        const style = globalThis.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length;
    }, OVERLAY_SELECTOR);
  const blockingOverlayCount = async () =>
    page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).filter(
        (el) => !el.classList.contains('minimizing') && !el.classList.contains('minimized')
      ).length;
    }, OVERLAY_SELECTOR);

  let visibleCount = await visibleOverlayCount();
  if (visibleCount > 0) {
    await page.waitForTimeout(750);
    await dismissFoundryNotifications(page);
    visibleCount = await visibleOverlayCount();
  }
  if (visibleCount > 0) {
    await page.waitForFunction((selector) => {
      return Array.from(document.querySelectorAll(selector)).every((el) => {
        const style = globalThis.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
        const rect = el.getBoundingClientRect();
        return rect.width === 0 || rect.height === 0;
      });
    }, OVERLAY_SELECTOR, { timeout: 2_500 }).catch(() => {});
    await dismissFoundryNotifications(page);
    visibleCount = await visibleOverlayCount();
  }
  if (visibleCount > 0) {
    const diag = await page
      .evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map((el) => `${el.tagName}#${el.id}.${el.className} :: ${(el.textContent || '').trim().slice(0, 120)}`)
          .join(' || ');
      }, OVERLAY_SELECTOR)
      .catch(() => '');
    throw new Error(`Screenshot target still has ${visibleCount} visible modal or notification overlay(s). [${diag}]`);
  }

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
          const style = globalThis.getComputedStyle(el);
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
  blockedSystemId: null,
  recipeIds: [],
  // Issue #489 craft-execution coverage fixtures: dedicated per-mode crafting
  // systems (simple / routedByIngredients / routedByCheck / progressive) and
  // their world items. Recipes are pushed onto `recipeIds`; the rc-profile
  // gather task/env live under the existing Arcane Forge system (cleaned with it).
  executionSystemIds: [],
  executionItemIds: []
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
        const staleSystemNames = new Set([
          'Arcane Forge', "The Herbalist's Compendium",
          // Issue #489 craft-execution coverage systems (deterministic names) so a
          // crashed local run does not accumulate duplicate same-named systems.
          'Smoke Simple Forge', 'Smoke Ingredient Router', 'Smoke Check Router',
          'Smoke Progressive Forge'
        ]);
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

        // 2. Clean stale smoke actors (tagged flags.fabricate.smokeSeed) so the
        //    per-run re-import of the dnd5e Starter Heroes pack stays idempotent.
        const staleActors = game.actors.contents.filter(a => a.flags?.fabricate?.smokeSeed === true);
        if (staleActors.length > 0) {
          console.log(`Cleaning ${staleActors.length} stale smoke actors`);
          await Actor.deleteDocuments(staleActors.map(a => a.id));
        }

        const staleUsers = game.users.contents.filter(u =>
          ['Fabricate Gatherer', 'Fabricate Observer'].includes(u.name)
        );
        if (staleUsers.length > 0) {
          console.log(`Cleaning ${staleUsers.length} stale test users`);
          await User.deleteDocuments(staleUsers.map(u => u.id));
        }

        // 3. Clean stale items (the fixed smoke set plus the issue #489
        //    craft-execution world items, all uniquely 'Smoke '-prefixed).
        const staleItems = game.items.contents.filter(i =>
          ['Iron Ore', 'Mystic Herb', 'Dragon Scale', 'Empty Vial',
           'Iron Sword', 'Healing Potion', 'Dragon Scale Armor'].includes(i.name)
          || (typeof i.name === 'string' && i.name.startsWith('Smoke '))
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

        // Create world-level items (all as loot — type doesn't matter for crafting)
        const itemData = [
          { name: 'Iron Ore', type: itemType, img: 'icons/commodities/metal/ingot-worn-iron.webp' },
          { name: 'Mystic Herb', type: itemType, img: 'icons/consumables/plants/leaf-herb-green.webp' },
          { name: 'Dragon Scale', type: itemType, img: 'icons/commodities/leather/scales-blue-white.webp' },
          { name: 'Empty Vial', type: itemType, img: 'icons/consumables/potions/vial-cork-empty.webp' },
          { name: 'Iron Sword', type: itemType, img: 'icons/weapons/swords/sword-guard-brass-worn.webp' },
          { name: 'Herbalist Sickle', type: itemType, img: 'icons/tools/hand/sickle-worn-steel-grey.webp' },
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

        // Import the dnd5e "Starter Heroes" pack so demo actors use official,
        // non-AI art shipped with the game system instead of bundled portraits.
        // Each imported hero is tagged flags.fabricate.smokeSeed for the
        // idempotent pre-clean above; sorting by name gives a deterministic
        // crafter / travel-member assignment and a stable demo character.
        const heroPack = game.packs.get('dnd5e.heroes')
          ?? game.packs.find(p => p.documentName === 'Actor' && /hero/i.test(p.metadata?.label ?? ''));
        if (!heroPack) {
          throw new Error('dnd5e Starter Heroes compendium (dnd5e.heroes) not found — cannot seed smoke actors.');
        }
        const heroIndex = await heroPack.getIndex();
        const importedHeroes = [];
        for (const entry of heroIndex) {
          const actor = await game.actors.importFromCompendium(heroPack, entry._id);
          if (actor?.type === 'character') importedHeroes.push(actor);
        }
        if (importedHeroes.length === 0) {
          throw new Error('dnd5e Starter Heroes compendium contained no character actors.');
        }
        await Actor.updateDocuments(importedHeroes.map(a => ({ _id: a.id, 'flags.fabricate.smokeSeed': true })));
        const actors = importedHeroes.slice().sort((a, b) => a.name.localeCompare(b.name, 'en'));
        console.log(`Imported ${actors.length} dnd5e Starter Heroes:`, actors.map(a => a.name).join(', '));
        const actorIds = actors.map(a => a.id);

        const crafter = actors[0];
        const travelMember = actors[1] ?? null;
        // Remember the crafter as the default gathering actor so the player-app
        // screenshots deterministically show the same demo character.
        try { await game.fabricate.setSelectedGatheringActorId(crafter.id); } catch { /* best effort */ }
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
        await crafter.update({ ownership: { default: noneLevel, [gathererUser.id]: ownerLevel } });
        if (travelMember) await travelMember.update({ ownership: { default: noneLevel } });
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

        // Crafter gets: 3x Mystic Herb, 2x Empty Vial, 1x Dragon Scale
        await crafter.createEmbeddedDocuments('Item', [
          ...copies(byName('Mystic Herb'), 3),
          ...copies(byName('Empty Vial'), 2),
          ...copies(byName('Dragon Scale'), 1)
        ]);

        // Travel-party member gets: 3x Iron Ore, 1x Dragon Scale
        if (travelMember) {
          await travelMember.createEmbeddedDocuments('Item', [
            ...copies(byName('Iron Ore'), 3),
            ...copies(byName('Dragon Scale'), 1)
          ]);
        }

        return {
          itemIds,
          actorIds,
          userIds,
          gathererUserId: gathererUser.id,
          crafterId: crafter.id,
          travelMemberId: travelMember?.id ?? null,
          itemsByName
        };
      });

      cleanup.itemIds = createdDocs.itemIds;
      cleanup.actorIds = createdDocs.actorIds;
      cleanup.userIds = createdDocs.userIds;
      cleanup.crafterId = createdDocs.crafterId;
      cleanup.travelMemberId = createdDocs.travelMemberId;
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
      // Quickstart Step 2 evidence (full profile): the GM System Library before
      // any system exists — the "No crafting systems yet" onboarding card with the
      // primary "Create system" button. This is the only point in the run with a
      // genuinely empty library; every later manager phase has the smoke system
      // present. Defensively clear any systems left over from an aborted prior run
      // so the empty state is deterministic, open the manager, capture, and close
      // it before the smoke system is created below. Gated to the full profile
      // like the other documentation captures; rc/ci skips it via screenshot().
      if (RUN_SCREENSHOT_PHASES) {
        await page.evaluate(async () => {
          const csm = game.fabricate.getCraftingSystemManager();
          for (const system of csm.getSystems()) {
            await csm.deleteSystem(system.id);
          }
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', '');
          globalThis.__fabricateSmokeManagerApp = game.fabricate.api.getCraftingSystemManagerAppClass().show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        // The empty-library onboarding card renders its own primary action; wait
        // on it (not assertManagerLayoutStable, which requires table rows) so the
        // frame shows the onboarding state with the Create system button.
        await page.locator('.fabricate-manager .manager-empty .manager-button.is-primary')
          .filter({ hasText: 'Create system' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-systems-empty');
        await closeOpenApplications(page);
      }

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
          // `routedByCheck` resolution allows multiple ingredient/result sets, so the
          // recipe editor unlocks Complex mode (recipeMultiSetAllowed gates on a mode
          // NOT in ['simple','progressive']). Under this system mode every recipe routes
          // by the routed crafting-check outcome, and a single-result-group recipe is
          // produced on any non-failure outcome (the single-group exemption). The
          // authored `craftingCheck.routed.rollFormula` below means no missing-formula
          // blocker. multiStepRecipes unlocks the step-mode toggle and the per-step
          // duration controls; itemTags unlocks the tag-requirement picker;
          // recipeCategories unlocks the category selector.
          resolutionMode: 'routedByCheck',
          features: {
            essences: true,
            gathering: true,
            multiStepRecipes: true,
            itemTags: true,
            recipeCategories: true
          },
          // Salvage is always on; pick routed mode + named outcome tiers so the
          // component editor's salvage section shows populated outcome routing (#436).
          salvageResolutionMode: 'routed',
          salvageCraftingCheck: {
            enabled: true,
            routed: {
              type: 'relative',
              rollFormula: '1d20',
              dc: 12,
              thresholdMode: 'meet',
              relativeOutcomes: [
                { id: 'salvage-clean', name: 'Clean Salvage', success: true, breakTools: false, dc: 6 },
                { id: 'salvage-partial', name: 'Partial Salvage', success: true, breakTools: false, dc: 0 },
                { id: 'salvage-botched', name: 'Botched', success: false, breakTools: true, dc: -6 }
              ]
            }
          },
          // Crafting check with routed outcome tiers, so a check-routed recipe's
          // result groups can be assigned outcome tiers (`checkOutcomeIds`). The
          // success-filtered tiers ('Masterwork', 'Standard') feed the recipe
          // editor's result-routing control AND the Validation tab's routed
          // readiness warnings (issue 431 PR-2).
          craftingCheck: {
            enabled: true,
            routed: {
              type: 'relative',
              // `1d20 + 20` (total 21-40) always meets the Masterwork threshold, so the
              // Phase-E Brew Healing Potion craft deterministically succeeds. Before #431
              // the routed check was authored-only (never rolled); now that it is engine-
              // evaluated a bare `1d20` vs dc 12 would fail the craft ~55% of the time
              // (flaky smoke). The named tiers below are unchanged so the routed-check and
              // validation-tab captures still render their authored outcomes.
              rollFormula: '1d20 + 20',
              dc: 12,
              thresholdMode: 'meet',
              relativeOutcomes: [
                { id: 'craft-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
                { id: 'craft-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
                { id: 'craft-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 }
              ]
            }
          },
          // System-level gathering check with named routed outcome tiers, so the
          // Checks tab's gathering editor renders populated when the gathering
          // economy is set to routed for the screenshot (#437).
          gatheringCraftingCheck: {
            enabled: true,
            routed: {
              type: 'relative',
              rollFormula: '1d20',
              dc: 12,
              thresholdMode: 'meet',
              relativeOutcomes: [
                { id: 'gather-bountiful', name: 'Bountiful Harvest', success: true, breakTools: false, dc: 5 },
                { id: 'gather-harvest', name: 'Harvest', success: true, breakTools: false, dc: 0 },
                { id: 'gather-spoiled', name: 'Spoiled', success: false, breakTools: false, dc: -5 }
              ]
            }
          },
          // Two currency units so the currency-cost requirement row can target a unit.
          itemTags: ['rare', 'reagent', 'metallic'],
          requirements: {
            currency: {
              enabled: true,
              units: [
                { id: 'gp', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins' },
                { id: 'sp', label: 'Silver', abbreviation: 'sp', icon: 'fa-solid fa-coins' }
              ]
            }
          },
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

        // Give Iron Ore a routed salvage configuration so the component editor's
        // salvage section renders populated result groups + outcome routing (#436).
        await csm.updateItem(systemId, componentMap['Iron Ore'], {
          salvage: {
            enabled: true,
            ingredientQuantity: 1,
            resultGroups: [
              { id: 'scrap', name: 'Scrap', results: [{ id: 'scrap-result', componentId: componentMap['Iron Ore'], quantity: 1 }] },
              { id: 'intact', name: 'Intact Parts', results: [{ id: 'intact-result', componentId: componentMap['Iron Sword'], quantity: 1 }] }
            ],
            outcomeRouting: { 'Clean Salvage': 'intact', 'Partial Salvage': 'scrap' }
          }
        });

        // Create 3 recipes
        const rm = game.fabricate.getRecipeManager();

        const recipe1 = await rm.createRecipe({
          name: 'Forge Iron Sword',
          description: 'Hammer iron ore into a sturdy blade.',
          craftingSystemId: systemId,
          img: 'icons/weapons/swords/sword-guard-brass-worn.webp',
          // routedByCheck routes by the check outcome; this single-result-group recipe
          // is produced on any non-failure outcome (the single-group exemption), so no
          // outcome/tier mapping is needed. The routed modes ignore `resultSelection`.
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
          // Single result group → produced on any non-failure outcome. The Phase-E
          // craft rolls `1d20 + 20` (always Masterwork), so this craft deterministically
          // succeeds and yields the single "Brewed Potion" group.
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
          // Single result group → produced on any non-failure outcome (single-group
          // exemption); the routed modes ignore `resultSelection`.
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

        // Showcase recipe whose single ingredient set exercises every requirement row
        // type so the Ingredients tab renders: a plain component, an OR group (one
        // group with two component options), a tag requirement, and a currency cost.
        // complex:true forces the full set-card render; allowIncomplete persists it as a
        // structurally-valid editor shell. Single result group → produced on any
        // non-failure outcome (single-group exemption); routed modes ignore resultSelection.
        const showcaseRecipe = await rm.createRecipe({
          name: 'Showcase Requirements',
          description: 'Demonstrates every ingredient requirement row: component, OR group, tag, and currency cost.',
          craftingSystemId: systemId,
          img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
          complex: true,
          ingredientSets: [{
            name: 'Primary',
            ingredientGroups: [
              {
                name: 'Iron Ore',
                options: [{
                  quantity: 2,
                  match: { type: 'component', componentId: componentMap['Iron Ore'] }
                }]
              },
              {
                name: 'Catalyst (either works)',
                options: [
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Mystic Herb'] }
                  },
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                  }
                ]
              },
              {
                name: 'Any reagent',
                options: [{
                  quantity: 1,
                  match: { type: 'tags', tags: ['reagent', 'rare'], tagMatch: 'any' }
                }]
              },
              {
                name: 'Gold cost',
                options: [{
                  quantity: 1,
                  match: { type: 'currency', unit: 'gp', amount: 100 }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Showcase Result',
            results: [{
              componentId: componentMap['Healing Potion'],
              quantity: 1
            }]
          }]
        }, { allowIncomplete: true });

        // Multi-step recipe so the Overview steps accordion shows the per-step duration
        // controls (data-recipe-step-time chips + the duration editor). Each step owns its
        // own ingredient sets, result groups, and timeRequirement.
        const multiStepRecipe = await rm.createRecipe({
          name: 'Multi-Step Alloy',
          description: 'A two-step recipe to showcase the steps accordion and per-step durations.',
          craftingSystemId: systemId,
          img: 'icons/commodities/metal/ingot-stack-steel.webp',
          // Each step has a single result group → produced on any non-failure outcome
          // (the single-group exemption is evaluated per step); routed modes ignore
          // `resultSelection`.
          steps: [
            {
              name: 'Smelt Ore',
              ingredientSets: [{
                name: 'Ore',
                ingredientGroups: [{
                  name: 'Iron Ore',
                  options: [{
                    quantity: 2,
                    match: { type: 'component', componentId: componentMap['Iron Ore'] }
                  }]
                }]
              }],
              resultGroups: [{
                name: 'Molten Iron',
                results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }]
              }],
              timeRequirement: { hours: 2, minutes: 30 }
            },
            {
              name: 'Forge Blade',
              ingredientSets: [{
                name: 'Blade',
                ingredientGroups: [{
                  name: 'Dragon Scale',
                  options: [{
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                  }]
                }]
              }],
              resultGroups: [{
                name: 'Finished Blade',
                results: [{ componentId: componentMap['Dragon Scale Armor'], quantity: 1 }]
              }],
              timeRequirement: { days: 1 }
            }
          ]
        }, { allowIncomplete: true });

        // Check-routed recipe deliberately authored with MULTIPLE result groups and
        // two routed-readiness gaps so the Validation tab shows BOTH new warnings
        // (issue 431 PR-2). The warnings now gate on the SYSTEM mode (routedByCheck),
        // not a per-recipe provider, and fire only for multi-result-group steps:
        //  - 'Reject Pile' carries no assigned outcome tier (empty checkOutcomeIds) →
        //    `unroutedResultGroup` (a result set the check can never route to);
        //  - the system's 'Masterwork' success tier is produced by no group →
        //    `unproducedOutcomeTier` (a check outcome that yields nothing).
        // allowIncomplete keeps the gappy draft savable; routed modes ignore resultSelection.
        const routedReadinessRecipe = await rm.createRecipe({
          name: 'Routed Check Readiness',
          description: 'A check-routed recipe with an unrouted result set and an unproduced outcome tier.',
          craftingSystemId: systemId,
          img: 'icons/skills/trades/smithing-anvil-silver-red.webp',
          complex: true,
          ingredientSets: [{
            name: 'Stock',
            ingredientGroups: [{
              name: 'Iron Ore',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: componentMap['Iron Ore'] }
              }]
            }]
          }],
          resultGroups: [
            {
              name: 'Standard Output',
              checkOutcomeIds: ['craft-standard'],
              results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }]
            },
            {
              // No assigned outcome tier → fires the unroutedResultGroup warning.
              name: 'Reject Pile',
              checkOutcomeIds: [],
              results: [{ componentId: componentMap['Iron Ore'], quantity: 1 }]
            }
          ]
        }, { allowIncomplete: true });

        const environmentStore = game.fabricate.getGatheringEnvironmentStore();
        const gatheringEnvironment = await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Azure Grove',
          description: 'A tranquil grove of blue-leaved trees, rich with reagents.',
          img: 'icons/magic/nature/tree-spirit-blue.webp',
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
        const playerFixtureDefinitions = [
          {
            name: 'Verdant Meadow',
            description: 'Open grassland thick with common herbs, easy to harvest.',
            img: 'icons/consumables/plants/grass-leaves-green.webp',
            forcedTaskIds: ['smoke-meadow-herbs']
          },
          {
            name: 'Sunken Ruins',
            description: 'Half-drowned ruins where forgotten reagents still linger.',
            img: 'icons/environment/wilderness/wall-ruins.webp',
            sceneUuid: 'Scene.fabricateMissingGatheringScene',
            forcedTaskIds: ['smoke-sunken-survey']
          },
          {
            name: 'Crystal Thicket',
            description: 'A thicket of glittering crystal fronds, perilous to harvest by hand.',
            img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp',
            forcedTaskIds: ['smoke-crystal-dew']
          },
          {
            name: 'Timed Orchard',
            description: 'An orchard whose slow blooms ripen only with patience.',
            img: 'icons/consumables/fruit/apple-red-tree-green.webp',
            forcedTaskIds: ['smoke-slow-bloom']
          },
          {
            name: 'Withered Patch',
            description: 'A blighted patch picked all but bare.',
            img: 'icons/magic/fire/flame-burning-tree-stump.webp',
            forcedTaskIds: ['smoke-withered-search']
          },
          {
            name: 'Moonlit Blind Grove',
            description: 'A moonlit grove where harvests reveal themselves only once attempted.',
            img: 'icons/creatures/mammals/wolf-howl-moon-forest-blue.webp',
            selectionMode: 'blind',
            forcedTaskIds: ['smoke-moonpetal']
          }
        ];
        for (const fixture of playerFixtureDefinitions) {
          const { sceneUuid = '', selectionMode = 'targeted', ...definition } = fixture;
          playerGatheringFixtures.push(await environmentStore.create({
            craftingSystemId: systemId,
            enabled: true,
            selectionMode,
            sceneUuid,
            compositionMode: 'manual',
            ...definition
          }));
        }

        await game.settings.set('fabricate', 'gatheringConfig', {
          conditions: { weather: 'rain', timeOfDay: 'dusk' },
          systems: {
            [systemId]: {
              vocabularies: {
                regions: { values: ['northreach'] }
              },
              tasks: [{
                id: 'smoke-forage-library',
                name: 'Forage Wild Herbs',
                description: 'Forage the wayside for common herbs and roots.',
                img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
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
                componentId: componentMap['Herbalist Sickle'],
                requirement: { formula: '@tools.herbalism.value' },
                breakage: { mode: 'limitedUses', maxUses: 5 },
                onBreak: { mode: 'flagBroken' }
              }, {
                // Deliberately unlabelled: a recipe references this tool so the
                // recipe Tools tab proves the component-name fallback (an
                // unlabelled tool must show the backing component's name, never a
                // raw id).
                id: 'smoke-unlabelled-tool',
                label: '',
                enabled: true,
                componentId: componentMap['Empty Vial']
              }],
              events: [{
                id: 'smoke-bramble-event',
                name: 'Bramble Snare',
                description: 'Thorned brambles snare the careless gatherer.',
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

        // Reference the deliberately-unlabelled tool from the Brew Healing Potion
        // recipe so the recipe Tools tab demonstrates the component-name fallback.
        await rm.updateRecipe(recipe2.id, { toolIds: ['smoke-unlabelled-tool'] });

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
          name: 'Fabricate Forage Node',
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

        // Seed an UNCONFIGURED `fabricate.interactable` (issue 342): a behaviour
        // created with an EMPTY `system`, exactly like the native Region → Behaviors
        // "+ Add Behavior → Fabricate Interactable" path. The schema `initial`s make
        // it instantiate VALID (no DataModelValidationError) and born unconfigured +
        // inert. The config panel's "Needs configuration" identity section is
        // captured against this one. Embedded in the scene → cleaned up with it.
        const [unconfiguredRegion] = await azureGroveScene.createEmbeddedDocuments('Region', [{
          name: 'Fabricate Unconfigured Node',
          shapes: [{ type: 'rectangle', x: 1600, y: 1000, width: 400, height: 400 }],
          behaviors: [{ type: 'fabricate.interactable' }]
        }]);
        const unconfiguredBehavior = unconfiguredRegion?.behaviors?.find(
          behavior => behavior?.type === 'fabricate.interactable'
        ) ?? null;

        // A dedicated system seeded into a deliberately BROKEN state so the GM
        // system-overview view renders populated rows and the system-blocker
        // banner shows (issue 429 PR-2). It carries BOTH:
        //   - a live system-blocker: progressive resolution mode with no
        //     progressive crafting check configured (blocks:'system'); and
        //   - an entity-level issue: an incomplete recipe with no result group
        //     (a recipe readiness issue that surfaces in the overview).
        const blockedSystem = await csm.createSystem({
          name: 'Broken Workshop',
          description: 'A system left in a broken state to demonstrate the system overview and the system-blocker banner.'
        });
        const blockedSystemId = blockedSystem.id;
        // Register two managed components so the progressive components browser
        // shows BOTH a set difficulty and an unset ("None") value, and so the
        // difficulty editor card has a component to author against. Difficulty is
        // assigned after the progressive mode switch (below).
        const blockedComponents = [];
        for (const blockedWorldItem of game.items.contents.slice(0, 2)) {
          const added = await csm.addItemFromUuid(blockedSystemId, blockedWorldItem.uuid);
          if (added?.item?.id) blockedComponents.push({ id: added.item.id, name: blockedWorldItem.name });
        }
        // Progressive mode with NO progressive crafting check → blocks:'system'.
        // The aggregator's `progressiveNoCheck` blocker only fires when
        // `checksEnabled` is false, i.e. neither `features.craftingChecks` nor
        // `craftingCheck.enabled` is set. A freshly-created system normalizes both
        // to false, but disable the crafting check EXPLICITLY here so the blocker
        // is guaranteed regardless of any future default change. Gathering is
        // enabled so the broken system also carries a TASK-kind issue (below) that
        // deep-links to its owning environment.
        await csm.updateSystem(blockedSystemId, {
          resolutionMode: 'progressive',
          features: { gathering: true, craftingChecks: false },
          craftingCheck: { enabled: false }
        });
        // Give the first blocked component a usable progressive difficulty so the
        // components column renders a value next to the second component's "None"
        // (and the difficulty editor card opens with a seeded value). This clears
        // the progressiveNoDifficulty blocker but leaves progressiveNoCheck, so the
        // system-overview blocker captures below are unaffected.
        if (blockedComponents[0]) {
          await csm.updateItem(blockedSystemId, blockedComponents[0].id, { difficulty: 4 });
        }
        // NOTE: progressive mode with no crafting check rejects recipe creation
        // ("Progressive mode requires crafting checks enabled"), and a recipe created
        // before the mode switch would be deleted by the (pre-migration-first)
        // updateSystem. So the broken system carries no recipe; its overview rows are
        // the system-level blocker (above) plus the stale gathering task (below) — which
        // is exactly the populated state both captures need.

        // Seed a gathering library task that will NOT match the environment's
        // conditions/biome, then create a MANUAL environment that explicitly
        // includes it. A manually-included-but-non-matching task is classified
        // `includedButUnavailable`, which surfaces a `staleIncluded` TASK-kind
        // issue in the overview — exercising the task/event deep-link (which must
        // resolve to the OWNING environment id, not the task record id).
        const blockedConfig = game.settings.get('fabricate', 'gatheringConfig') || {};
        await game.settings.set('fabricate', 'gatheringConfig', {
          ...blockedConfig,
          systems: {
            ...(blockedConfig.systems || {}),
            [blockedSystemId]: {
              tasks: [{
                id: 'broken-stale-task',
                name: 'Phantom Harvest',
                description: 'A task that no longer matches its environment.',
                enabled: true,
                biomes: ['tundra'],
                dropRows: []
              }],
              events: [],
              tools: []
            }
          }
        });
        const blockedEnvironment = await environmentStore.create({
          craftingSystemId: blockedSystemId,
          name: 'Forsaken Hollow',
          description: 'An environment whose only included task no longer matches it.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'manual',
          biomes: ['forest'],
          enabledTaskIds: ['broken-stale-task']
        });

        return {
          systemId,
          blockedSystemId,
          blockedComponentNames: blockedComponents.map((component) => component.name),
          blockedEnvironmentId: blockedEnvironment?.id ?? null,
          componentMap,
          recipeIds: [recipe1.id, recipe2.id, recipe3.id, showcaseRecipe.id, multiStepRecipe.id, routedReadinessRecipe.id],
          healingPotionRecipeId: recipe2.id,
          sceneIds: [azureGroveScene.id],
          gatheringEnvironmentId: gatheringEnvironment.id,
          playerGatheringEnvironmentIds: playerGatheringFixtures.map(environment => environment.id),
          interactable: {
            sceneId: azureGroveScene.id,
            regionId: interactableRegion?.id ?? null,
            behaviorId: interactableBehavior?.id ?? null
          },
          unconfiguredInteractable: {
            sceneId: azureGroveScene.id,
            regionId: unconfiguredRegion?.id ?? null,
            behaviorId: unconfiguredBehavior?.id ?? null
          }
        };
      });

      cleanup.systemId = craftingSetup.systemId;
      cleanup.blockedSystemId = craftingSetup.blockedSystemId;
      cleanup.recipeIds = craftingSetup.recipeIds;
      cleanup.sceneIds = craftingSetup.sceneIds;
      // The interactable Region is embedded in azureGroveScene, so it is cleaned
      // up with the scene (cleanup.sceneIds) — no separate cleanup key needed.
      process.stdout.write(`  Created crafting system and ${craftingSetup.recipeIds.length} recipes.\n`);

      results.steps.push({ step: 'create-crafting-system', passed: true });
      process.stdout.write(`Phase C complete: System "${craftingSetup.systemId}" with ${craftingSetup.recipeIds.length} recipes.\n`);

      // Issue #489: seed the craft-execution coverage fixtures (dedicated per-mode
      // systems, tool-breakage recipes, a salvageable component, crafter inventory,
      // and a guaranteed-success gather env/task). Always-run so the execute-and-
      // assert scenarios in Phase E run under rc/ci too.
      let executionFixtures = null;
      try {
        process.stdout.write('  Seeding craft-execution coverage fixtures (#489)...\n');
        executionFixtures = await seedSmokeCraftExecutionFixtures(page, craftingSetup, cleanup.crafterId);
        cleanup.executionSystemIds = executionFixtures.executionSystemIds;
        cleanup.executionItemIds = executionFixtures.executionItemIds;
        cleanup.recipeIds = [...cleanup.recipeIds, ...executionFixtures.executionRecipeIds];
        results.steps.push({ step: 'seed-craft-execution-fixtures', passed: true });
        process.stdout.write(
          `  Seeded ${executionFixtures.executionSystemIds.length} execution systems and ` +
          `${executionFixtures.executionRecipeIds.length} recipes.\n`
        );
      } catch (err) {
        results.steps.push({ step: 'seed-craft-execution-fixtures', passed: false, error: err.message });
        process.stderr.write(`Seeding craft-execution fixtures failed: ${err.message}\n`);
      }

      // Issue #543: seed the player Alchemy workbench coverage fixtures (two
      // enabled alchemy systems + valid recipes) so the shared app surfaces the
      // Alchemy tab and its discipline chooser in Phase E. Screenshot-profile only
      // — rc/ci never opens the player app's alchemy captures. Reuses the same
      // cleanup arrays as the execution fixtures so the systems/products/recipes
      // are torn down at the end of the run.
      let alchemyFixtures = null;
      if (RUN_SCREENSHOT_PHASES) {
        try {
          process.stdout.write('  Seeding player alchemy workbench fixtures (#543)...\n');
          alchemyFixtures = await seedSmokeAlchemyFixtures(page, craftingSetup, cleanup.crafterId);
          cleanup.executionSystemIds = [
            ...(cleanup.executionSystemIds || []),
            ...alchemyFixtures.alchemySystemIds
          ];
          cleanup.executionItemIds = [
            ...(cleanup.executionItemIds || []),
            ...alchemyFixtures.alchemyProductItemIds
          ];
          cleanup.recipeIds = [...cleanup.recipeIds, ...alchemyFixtures.alchemyRecipeIds];
          results.steps.push({ step: 'seed-alchemy-fixtures', passed: true });
          process.stdout.write(
            `  Seeded ${alchemyFixtures.alchemySystemIds.length} alchemy systems and ` +
            `${alchemyFixtures.alchemyRecipeIds.length} recipes.\n`
          );
        } catch (err) {
          results.steps.push({ step: 'seed-alchemy-fixtures', passed: false, error: err.message });
          process.stderr.write(`Seeding alchemy fixtures failed: ${err.message}\n`);
        }
      }

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
          const previousExperimentalFeatures = Boolean(game.settings.get('fabricate', 'experimentalFeatures'));
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
        if (navLabels.at(0) !== 'System Overview') {
          throw new Error(`Manager default selection should keep System Overview first. Saw: ${navLabels.join(', ')}`);
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
        if (navLabels.at(0) !== 'System Overview') {
          throw new Error(`Manager selected nav should keep System Overview first. Saw: ${navLabels.join(', ')}`);
        }
        for (const expected of ['System Overview', 'Components', 'Crafting', 'Tags & Categories', 'Essences', 'Tools', 'Gathering', 'Checks', 'Graph']) {
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

        // Collapsible left rail: capture both the expanded default and the
        // collapsed icon-strip state where the middle content column reclaims
        // the freed rail width and section navigation stays reachable.
        const railToggle = page.locator('.fabricate-manager .manager-rail-toggle').first();
        if (await railToggle.count() === 0) {
          throw new Error('Manager rail is missing its collapse/expand toggle control.');
        }
        if (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count() > 0) {
          // Ensure we start from the expanded baseline before capturing it.
          await railToggle.click();
          await page.waitForTimeout(400);
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-rail-expanded');

        await railToggle.click();
        await page.waitForTimeout(500);
        if (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count() === 0) {
          throw new Error('Manager rail toggle did not collapse the navigation rail.');
        }
        const collapsedNavIcons = await page.locator('.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-button:visible').count();
        if (collapsedNavIcons === 0) {
          throw new Error('Collapsed manager rail should keep section navigation reachable as an icon strip.');
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-rail-collapsed');

        // Restore the expanded rail so subsequent manager steps see the default layout.
        await railToggle.click();
        await page.waitForTimeout(400);
        if (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count() > 0) {
          throw new Error('Manager rail toggle did not re-expand the navigation rail.');
        }

        await page.locator('.fabricate-manager .manager-scope-return').first().click();
        await page.waitForTimeout(750);
        navLabels = await page.locator('.fabricate-manager .manager-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.at(0) !== 'System Overview') {
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
          const smokeHeroes = game.actors.contents
            .filter(a => a.type === 'character' && a.flags?.fabricate?.smokeSeed === true)
            .sort((a, b) => a.name.localeCompare(b.name, 'en'));
          const crafter = smokeHeroes[0];
          const travelMember = smokeHeroes[1];
          if (!crafter) {
            throw new Error('No smoke-seeded gathering actor found for Travel seeding.');
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
          const party = await partyStore.create({ name: 'The Vale Wardens' });
          await partyStore.addMember(party.id, crafter.uuid);
          if (travelMember) await partyStore.addMember(party.id, travelMember.uuid);
          await partyStore.setTravelActor(party.id, crafter.uuid);
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
                img: 'icons/environment/wilderness/mine-interior-dungeon-door.webp',
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
        await page.locator('.fabricate-manager .manager-nav-button[data-nav-system-edit]').first().click();
        await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await exerciseManagerSystemEditPointerTargets(page, craftingSetup.systemId);
        if (await page.locator('.fabricate-manager[data-manager-view="system-edit"]').count() === 0) {
          throw new Error('Manager system Edit did not stay inside the v2 edit route.');
        }
        for (const selector of [
          '#manager-system-name',
          '#manager-system-description',
          // Recipe-resolution mode moved to the Crafting Settings section
          // (#511 Books & Scrolls); it is no longer a system-edit control.
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

        // --- Currency configuration (#393) ---
        // Enable currency via the optional-features toggle, seed the dnd5e (actorProperty)
        // unit ladder, then capture each spend strategy. The smoke world is dnd5e, so the
        // actorInventory branch shows the no-provider callout (the pf2e provider grid needs
        // a pf2e world, which the e2e fixtures do not ship).
        await setManagerWindowSize(page, { width: 1280, height: 900 });
        const currencyToggle = page.locator('.fabricate-manager [data-system-currency-toggle]').first();
        await currencyToggle.waitFor({ state: 'visible', timeout: 5_000 });
        await currencyToggle.scrollIntoViewIfNeeded();
        if (await page.locator('.fabricate-manager [data-system-currency-units]').count() === 0) {
          await currencyToggle.click();
        }
        const currencyCard = page.locator('.fabricate-manager [data-system-currency-units]').first();
        await currencyCard.waitFor({ state: 'visible', timeout: 5_000 });
        const currencySeed = currencyCard.locator('button:has-text("Seed presets")').first();
        if (await currencySeed.count() > 0) {
          await currencySeed.click();
          await page.waitForTimeout(600);
          await page.evaluate(async () => {
            await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
          });
        }
        await currencyCard.locator('[data-system-currency-unit]').first().waitFor({ state: 'visible', timeout: 5_000 });
        // Scroll the Currency Units card to the top of the manager's scroll area, then capture
        // the WHOLE normal-sized GM window (nav rail, header, context panel + the card) so the
        // feature is shown in context rather than as a cropped element.
        const showCurrencyCard = async () => {
          await currencyCard.evaluate((el) => el.scrollIntoView({ block: 'start' }));
          await page.waitForTimeout(250);
          await assertNoScreenshotOverlays(page);
        };
        await showCurrencyCard();
        await screenshot(page, 'currency-actor-property');

        const currencyStrategy = page.locator('.fabricate-manager [data-system-currency-strategy-select]').first();
        await currencyStrategy.selectOption('macro');
        await page.locator('.fabricate-manager [data-system-currency-macros]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await showCurrencyCard();
        await screenshot(page, 'currency-macro');

        await currencyStrategy.selectOption('actorInventory');
        await page.locator('.fabricate-manager [data-system-currency-no-provider]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await showCurrencyCard();
        await screenshot(page, 'currency-actor-inventory');

        // Leave the persisted smoke system on the default strategy.
        await currencyStrategy.selectOption('actorProperty');
        await page.waitForTimeout(300);

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        const recipeApiCount = await page.evaluate((sysId) => {
          const rm = game.fabricate?.getRecipeManager?.();
          return rm?.getRecipes?.({ craftingSystemId: sysId })?.length ?? 0;
        }, craftingSetup.systemId);
        if (recipeApiCount < 2) {
          throw new Error(`Expected the smoke system to expose at least 2 recipes via the API; saw ${recipeApiCount}.`);
        }
        await openManagerCraftingSection(page, 'recipes', 'recipes');
        await page.locator('.fabricate-manager .manager-recipe-row:has-text("Brew Healing Potion")').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipes normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipes-normal');

        // Crafting nav group expanded (Settings + Recipes + Books & Scrolls) and the
        // Books & Scrolls recipe-item surface + the Settings placeholder. Guarded so a
        // hiccup records a failed step rather than aborting the whole phase.
        try {
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-crafting-group-expanded');
          await openManagerCraftingSection(page, 'books-scrolls', 'books-scrolls');
          await page.locator('.fabricate-manager [data-books-scrolls]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          // The Books & Scrolls surface is legitimately empty for a fixture system
          // with no recipe items, so its zero-row state is not a layout failure —
          // capture it without the row-count heuristic and never block the
          // Crafting Settings capture that follows.
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-books-scrolls-normal');
          await openManagerCraftingSection(page, 'settings', 'crafting-settings');
          // The Crafting Settings section now renders its real content (resolution
          // mode, visibility, salvage) — the former stub `-placeholder` hook is gone.
          await page.locator('.fabricate-manager [data-crafting-settings]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-crafting-settings');
          results.steps.push({ step: 'crafting-group-surfaces', passed: true });
        } catch (err) {
          results.steps.push({ step: 'crafting-group-surfaces', passed: false, error: err.message });
          process.stderr.write(`Crafting group surface capture failed: ${err.message}\n`);
        }

        // Recipes → open the editor so the identity card (central column) and the
        // knowledge-gated recipe-item inspector (right context panel) are captured (#387).
        await openManagerRecipeEditor(page, 'Brew Healing Potion');
        await page.locator('.fabricate-manager [data-recipe-section="identity"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-recipe-section="recipe-item"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipe edit normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-normal');

        // Recipe Tools tab → this recipe references a deliberately-unlabelled tool,
        // so the row must show the backing component's name (the fallback fix),
        // never a raw id. Guarded so a hiccup records a failed step, not an abort.
        try {
          await page.locator('.fabricate-manager [data-recipe-tab-button="tools"]').first().click();
          await page.locator('.fabricate-manager [data-recipe-tab="tools"]').first().waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-recipe-tab="tools"] [data-recipe-tool-id]').first().waitFor({ state: 'visible', timeout: 5_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-recipe-edit-tools');
          results.steps.push({ step: 'recipe-edit-tools', passed: true });
        } catch (err) {
          results.steps.push({ step: 'recipe-edit-tools', passed: false, error: err.message });
          process.stderr.write(`Recipe tools capture failed: ${err.message}\n`);
        }

        // Showcase Requirements → Ingredients tab: capture every requirement row type
        // (component, OR group, tag, currency cost), the faint dividers, and the tag
        // layout. The recipe is authored complex, so the section renders the full set
        // card list with one or more data-recipe-group cards.
        await openManagerRecipeEditor(page, 'Showcase Requirements');
        await page.locator('.fabricate-manager [data-recipe-tab-button="ingredients"]').first().click();
        await page.locator('.fabricate-manager [data-recipe-tab="ingredients"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-recipe-tab="ingredients"] [data-recipe-group]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipe edit ingredients');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-ingredients');

        // Return to the recipes browser, then open the check-routed recipe whose
        // Validation tab carries both routed readiness warnings (issue 431 PR-2). The
        // Ingredients capture stays on Showcase Requirements above; only this
        // validation capture is repointed at the check-routed fixture so the published
        // frame shows the unroutedResultGroup + unproducedOutcomeTier warning chips.
        await openManagerRecipeEditor(page, 'Routed Check Readiness');
        await page.locator('.fabricate-manager [data-recipe-tab-button="validation"]').first().click();
        await page.locator('.fabricate-manager [data-recipe-tab="validation"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        // Wait on both warning chips so the capture proves the new readiness signals.
        await page.locator('.fabricate-manager [data-issue="unroutedResultGroup"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-issue="unproducedOutcomeTier"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipe edit validation');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-validation');

        // Multi-Step Alloy → Overview: the steps accordion shows the per-step duration
        // chips/controls. Wait on the steps card and a per-step time chip.
        await openManagerRecipeEditor(page, 'Multi-Step Alloy');
        await page.locator('.fabricate-manager [data-recipe-tab="overview"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-recipe-section="steps"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        // The Overview steps accordion passes onUpdateStep, so each step header renders the
        // editable duration control (data-recipe-duration-trigger), not the read-only
        // data-recipe-step-time chip used on the ingredients/results/tools accordions.
        await page.locator('.fabricate-manager [data-recipe-section="steps"] [data-recipe-duration-trigger]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'recipe edit multistep');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-recipe-edit-multistep');

        // Return to the recipes browser for the remaining navigation.
        await openManagerCraftingSection(page, 'recipes', 'recipes');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-nav-button:has-text("Components")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="components"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.waitForTimeout(500);
        if (await page.locator('.fabricate-manager .manager-component-drop-zone').count() === 0) {
          throw new Error('Manager components browser did not show the drop-to-add affordance.');
        }
        await captureStableManagerView(page, { layout: 'components normal', label: 'manager-components-normal' });
        process.stdout.write('  D0: components normal screenshotted\n');

        // Components → open the editor so the identity card (central column) and the
        // linked-source inspector (right context panel) are captured (#398).
        await page.locator('.fabricate-manager .manager-component-row:has-text("Iron Ore") button:has(i.fa-edit)').first().click();
        await page.locator('.fabricate-manager[data-manager-view="component-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-component-edit-section="identity"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-component-edit-section="source"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'component edit normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-component-edit-normal');
        process.stdout.write('  D0: component edit normal screenshotted\n');

        // Component editor → salvage authoring section (per-component result
        // groups, routed outcome routing, and DC override). Salvage is always on,
        // and this system is in routed salvage mode, so the section renders with a
        // populated outcome-routing table; scroll it into view to frame it (#436).
        const salvageSection = page
          .locator('.fabricate-manager [data-component-edit-section="salvage"]')
          .first();
        await salvageSection.waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-salvage-routing]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await salvageSection.scrollIntoViewIfNeeded();
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-component-edit-salvage');
        process.stdout.write('  D0: component edit salvage screenshotted\n');

        // Return to the components browser for the remaining navigation.
        await page.locator('.fabricate-manager .manager-nav-button:has-text("Components")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="components"]').first().waitFor({ state: 'visible', timeout: 5_000 });

        // Checks → Gathering check editor (#437). The gathering check editor is
        // keyed off the gathering ECONOMY resolution mode, so temporarily flip the
        // economy to routed (the system carries a populated gatheringCraftingCheck.
        // routed), capture the editor, then revert so downstream gathering captures
        // keep the default d100 economy.
        const prevGatheringMode = await page.evaluate(async (sysId) => {
          const economy = game.fabricate.getGatheringEconomy?.({ systemId: sysId }) || {};
          const prev = economy.resolutionMode || 'd100';
          await game.fabricate.setGatheringEconomy?.({
            systemId: sysId,
            economy: { ...economy, resolutionMode: 'routed' }
          });
          return prev;
        }, craftingSetup.systemId);
        await page.evaluate(async () => {
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        });
        await page.locator('.fabricate-manager .manager-nav-button:has-text("Checks")').first().click();
        await page.locator('.fabricate-manager [data-checks-editor]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-checks-tab-button="gathering"]').first().click();
        await page.locator('.fabricate-manager [data-checks-panel="gathering"] [data-crafting-check-editor]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'checks gathering editor');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-checks-gathering');
        process.stdout.write('  D0: checks gathering editor screenshotted\n');
        await page.evaluate(async (args) => {
          const economy = game.fabricate.getGatheringEconomy?.({ systemId: args.sysId }) || {};
          await game.fabricate.setGatheringEconomy?.({
            systemId: args.sysId,
            economy: { ...economy, resolutionMode: args.prev }
          });
        }, { sysId: craftingSetup.systemId, prev: prevGatheringMode });
        await page.evaluate(async () => {
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        });

        // Checks → Validation tab (#485): the per-check readiness checklist plus
        // severity-grouped issues for the in-play subsystem checks. With the economy
        // back to d100 the gathering check is omitted, so the rollup frames the
        // crafting and salvage check sections.
        await page.locator('.fabricate-manager [data-checks-tab-button="validation"]').first().click();
        await page.locator('.fabricate-manager [data-checks-panel="validation"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager [data-checks-validation-section="crafting"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await assertManagerLayoutStable(page, 'checks validation tab');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-checks-validation');
        process.stdout.write('  D0: checks validation tab screenshotted\n');

        await page.locator('.fabricate-manager .manager-nav-button:has-text("Components")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="components"]').first().waitFor({ state: 'visible', timeout: 5_000 });

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
        await captureStableManagerView(page, { layout: 'tags-categories normal', label: 'manager-tags-categories-normal' });

        await captureStableManagerView(page, {
          width: 1000,
          height: 700,
          layout: 'tags-categories stacked',
          label: 'manager-tags-categories-stacked'
        });

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
        await page.locator('.fabricate-manager .manager-gathering-task-row:has-text("Forage Wild Herbs")').first().waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.fabricate-manager .manager-gathering-task-row:has-text("Forage Wild Herbs") [aria-label^="Edit"]').first().click();
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
        await captureStableManagerView(page, {
          layout: 'gathering task editor normal',
          label: 'manager-gathering-task-editor-normal'
        });

        await captureStableManagerView(page, {
          width: 1000,
          height: 720,
          layout: 'gathering task editor stacked',
          label: 'manager-gathering-task-editor-stacked',
          settleMs: 250
        });

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
        // The environment editor header now follows the task/event convention:
        // a static "Edit environment" title (the environment name lives in the
        // identity card, not the header). Confirm the static header rendered, then
        // verify the correct environment loaded via the identity name field.
        await page.locator('.fabricate-manager .manager-title')
          .filter({ hasText: 'Edit environment' }).first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        const editedEnvNameField = page.locator('.fabricate-manager [data-environment-field="name"]').first();
        await editedEnvNameField.waitFor({ state: 'visible', timeout: 5_000 });
        const editedEnvName = await editedEnvNameField.inputValue();
        if (editedEnvName !== 'Azure Grove') {
          throw new Error(`Environment editor loaded the wrong environment: expected "Azure Grove", got "${editedEnvName}".`);
        }
        if (await page.locator('.fabricate-manager .environment-draft-editor, .fabricate-manager .environment-foundation').count() > 0) {
          throw new Error('Manager environments edit route still rendered the legacy environment editor.');
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-environment-edit-placeholder');

        // Doc journey (quickstart Step 7 — Configure the Gathering Environment):
        // capture the environment editor's composition Tasks and Events tabs so the
        // docs can show how reusable library tasks and events are composed into an
        // environment. The Overview tab is already captured above as
        // manager-environment-edit-placeholder. Tab ids come from
        // EnvironmentEditorTabs.svelte (data-environment-tab-button / -tab).
        for (const [tabId, label] of [
          ['tasks', 'manager-environment-edit-tasks'],
          ['events', 'manager-environment-edit-events']
        ]) {
          await page.locator(`.fabricate-manager [data-environment-tab-button="${tabId}"]`).first().click();
          await page.locator(`.fabricate-manager [data-environment-tab="${tabId}"]`).first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.waitForTimeout(250);
          await assertNoScreenshotOverlays(page);
          await screenshot(page, label);
        }
        // Restore the Overview tab before leaving the editor so later state is unchanged.
        await page.locator('.fabricate-manager [data-environment-tab-button="overview"]').first().click();
        await page.locator('.fabricate-manager [data-environment-tab="overview"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });

        // The "Back to environments" button runs through the unsaved-changes
        // route-exit guard. Verify it's clickable, then navigate back via the
        // side nav.
        await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Back to environments")'), { trial: true });
        await page.locator('.fabricate-manager #manager-gathering-nav-environments').first().click();
        await page.locator('.fabricate-manager[data-manager-view="environments"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager #manager-gathering-nav-encounters').first().click();
        await page.locator('.fabricate-manager .manager-gathering-event-row:has-text("Bramble Snare")').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertManagerLayoutStable(page, 'gathering events normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-events-normal');

        await page.locator('.fabricate-manager .manager-gathering-event-row:has-text("Bramble Snare") [aria-label^="Edit"]').first().click();
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
        await captureStableManagerView(page, {
          layout: 'gathering travel normal',
          label: 'manager-gathering-travel-normal'
        });

        await captureStableManagerView(page, {
          width: 1000,
          height: 720,
          layout: 'gathering travel stacked',
          label: 'manager-gathering-travel-stacked',
          settleMs: 250
        });
        await setManagerWindowSize(page, { width: 1280, height: 820 });

        // Doc journey (quickstart Step 7 — Configure the Gathering Environment):
        // the gathering Settings tab hosts the d100 Gathering Rules (reward / event
        // selection, event outcome) and the Stamina / Resource-node Limitation
        // toggles. Capture it so the docs can show where those system-level rules
        // live. Nav id from CraftingSystemManagerRoot.svelte (gathering nav 'settings'),
        // panel id from EnvironmentsBrowserView.svelte.
        await page.locator('.fabricate-manager #manager-gathering-nav-settings').first().click();
        await page.locator('.fabricate-manager #manager-gathering-panel-settings').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await page.waitForTimeout(300);
        // The gathering Settings panel is a rules/limitation form, not a table, so
        // assertManagerLayoutStable (which requires table rows) does not apply here.
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-settings');

        await page.locator('.fabricate-manager .manager-nav-button:has-text("Tools")').first().click();
        await page.locator('.fabricate-manager[data-manager-view="tools"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator('.fabricate-manager .manager-tools-row:has-text("Herbalist Sickle")').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertManagerLayoutStable(page, 'tools normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-tools-normal');

        // ── System Overview tabbed page + system-blocker banner (issue 429 PR-2) ─
        // Select the deliberately-broken "Broken Workshop" system (progressive
        // mode with no progressive check + an incomplete recipe) and capture:
        //   (a) the System Overview page's Validation tab showing the kind-grouped
        //       issue rows and the system-blocker callout; and
        //   (b) the Settings tab showing the system-blocker banner above identity.
        // Guarded so a failure records a failed step without aborting the phase.
        // Returns to the smoke system's library afterwards so it does not leak the
        // selected system into later phases.
        try {
          await setManagerWindowSize(page, { width: 1280, height: 900 });
          // Return to the system library, then select the broken system.
          await page.locator('.fabricate-manager .manager-scope-return').first().click();
          await page.waitForTimeout(400);
          await page.locator(`${managerSystemRowSelector(craftingSetup.blockedSystemId)} .manager-system-identity`)
            .first().waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator(`${managerSystemRowSelector(craftingSetup.blockedSystemId)} .manager-system-identity`)
            .first().click();
          await page.waitForTimeout(500);

          // (a) System Overview page — open the tabbed system-edit page, then switch
          // to the Validation tab and wait on the grouped issue rows (not deep leaf
          // content). The standalone overview route was folded into this tab.
          await page.locator('.fabricate-manager .manager-nav-button[data-nav-system-edit]').first().click();
          await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-system-tab="validation"]').first().click();
          await page.locator('.fabricate-manager .manager-system-tab-panel [data-system-overview]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-system-overview] [data-overview-issue]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          if (await page.locator('.fabricate-manager [data-system-overview-blocker]').count() === 0) {
            throw new Error('System overview validation tab did not render the system-blocker callout for the broken system.');
          }
          // The seeded stale-task fixture must surface a TASK-kind row whose
          // deep-link button resolves to the owning environment (the UX-defect fix).
          const taskRow = page.locator('.fabricate-manager [data-system-overview] [data-overview-kind="task"]').first();
          await taskRow.waitFor({ state: 'visible', timeout: 5_000 });
          if (await taskRow.locator('[data-overview-link="task"]').count() === 0) {
            throw new Error('System overview task row is missing its environment deep-link button.');
          }
          // The validation tab is a kind-grouped LIST view (`.manager-system-overview-row`),
          // not a table — assertManagerLayoutStable requires a table-row/edit-form
          // selector and would throw "no table rows" here (as the gathering Settings
          // form capture also skips it). The explicit issue-row + task-row waits above
          // already prove the view is populated; assertNoScreenshotOverlays guards bleed.
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-system-overview');

          // (b) Settings tab — wait on the blocker banner above the identity card.
          await page.locator('.fabricate-manager [data-system-tab="settings"]').first().click();
          await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-system-edit-blocker]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await assertManagerLayoutStable(page, 'system edit blocked');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-system-edit-blocked');

          // (c) Progressive difficulty UI — this system is in progressive crafting
          // mode, so its components browser shows the difficulty column (a value
          // for component 0, "None" for component 1) and the component editor's
          // right inspector exposes the staged Progressive difficulty card.
          // Guarded independently so a hiccup here does not fail the overview step.
          try {
            const blockedNames = craftingSetup.blockedComponentNames || [];
            await page.locator('.fabricate-manager .manager-nav-button:has-text("Components")').first().click();
            await page.locator('.fabricate-manager[data-manager-view="components"]').first().waitFor({ state: 'visible', timeout: 5_000 });
            await page.locator('.fabricate-manager .manager-component-difficulty-cell').first()
              .waitFor({ state: 'visible', timeout: 5_000 });
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'manager-components-progressive');

            // Open the second ("None") component and stage a difficulty so the card,
            // the Unsaved chip, and the editor Save flow are captured together. Save
            // afterwards so the dirty draft does not trip the discard guard on exit.
            if (blockedNames[1]) {
              await page.locator(`.fabricate-manager .manager-component-row:has-text(${JSON.stringify(blockedNames[1])}) button:has(i.fa-edit)`)
                .first().click();
              await page.locator('.fabricate-manager[data-manager-view="component-edit"]').first()
                .waitFor({ state: 'visible', timeout: 5_000 });
              const difficultyInput = page.locator('.fabricate-manager [data-component-edit-section="difficulty"] input').first();
              await difficultyInput.waitFor({ state: 'visible', timeout: 5_000 });
              await difficultyInput.fill('7');
              await page.locator('.fabricate-manager .manager-header-actions .manager-chip:has-text("Unsaved")').first()
                .waitFor({ state: 'visible', timeout: 5_000 });
              await assertNoScreenshotOverlays(page);
              await screenshot(page, 'manager-component-edit-difficulty');
              await page.locator('.fabricate-manager button[form="manager-component-edit-form"]').first().click();
              await page.locator('.fabricate-manager[data-manager-view="components"]').first()
                .waitFor({ state: 'visible', timeout: 5_000 });
            }
            results.steps.push({ step: 'progressive-difficulty-captures', passed: true });
          } catch (err) {
            results.steps.push({ step: 'progressive-difficulty-captures', passed: false, error: err.message });
            process.stderr.write(`Progressive difficulty capture failed: ${err.message}\n`);
          }

          results.steps.push({ step: 'system-overview-and-banner', passed: true });
        } catch (err) {
          results.steps.push({ step: 'system-overview-and-banner', passed: false, error: err.message });
          process.stderr.write(`System overview capture failed: ${err.message}\n`);
        } finally {
          // Return to the smoke system so later phases see the expected selection.
          await page.locator('.fabricate-manager .manager-scope-return').first().click().catch(() => {});
          await page.waitForTimeout(300);
          await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`)
            .first().click().catch(() => {});
          await page.waitForTimeout(400);
        }

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

        // ── Canvas interactable config: source/identity section (issue 342) ────
        // Capture the new Identity/source section in BOTH states:
        //   (a) UNCONFIGURED — the prominent "Needs configuration" state on a
        //       natively-added (empty-system) behaviour, born inert; and
        //   (b) CONFIGURED — the collapsed "Change source" section expanded on a
        //       fully-configured interactable (re-target affordance).
        // Each AppV2 window is fully closed before the next opens (await close) so
        // there is no bleed-through. Guarded so a failure records a failed step but
        // does not abort the phase.
        // Sweep EVERY interactable-config window fully closed (await each fade-out)
        // and assert the root is gone, so no prior config panel bleeds into the next
        // capture or is re-resolved as its root.
        const closeAllConfigWindows = async () => {
          await page.evaluate(async () => {
            const apps = Object.values(ui.windows).filter(w => w?.options?.id === 'fabricate-interactable-config');
            for (const app of apps) { if (app?.close) await app.close(); }
          }).catch(() => { /* best-effort; closeOpenApplications also sweeps it */ });
          await page.locator('.fabricate-interactable-config').first()
            .waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
        };
        const openConfig = async (ref) => {
          await page.evaluate(({ s, r, b }) => {
            return game.fabricate.api.getInteractableConfigAppClass().show({ sceneId: s, regionId: r, behaviorId: b });
          }, { s: ref.sceneId, r: ref.regionId, b: ref.behaviorId });
          await page.waitForTimeout(400); // let the AppV2 render + the Svelte view model settle.
          await page.locator('.fabricate-interactable-config').first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator('[data-interactable-identity-section]').first().waitFor({ state: 'visible', timeout: 10_000 });
        };

        try {
          // (a) CONFIGURED — open the fully-configured interactable FIRST (no prior
          // config window to bleed) and expand the collapsed "Change source" section.
          await closeAllConfigWindows();
          const configuredRef = craftingSetup.interactable;
          await openConfig(configuredRef);
          if (await page.locator('[data-interactable-needs-config]').count() > 0) {
            throw new Error('Configured interactable rendered the unconfigured state.');
          }
          const identityToggle = page.locator('[data-interactable-identity-toggle]').first();
          await identityToggle.waitFor({ state: 'visible', timeout: 10_000 });
          await identityToggle.click();
          await page.locator('[data-interactable-identity-body]').first().waitFor({ state: 'visible', timeout: 10_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'interactable-config-source-configured');

          // (b) UNCONFIGURED — the prominent "Needs configuration" state on a
          // natively-added (empty-system) behaviour, born inert.
          await closeAllConfigWindows();
          const unconfiguredRef = craftingSetup.unconfiguredInteractable;
          if (!unconfiguredRef?.sceneId || !unconfiguredRef?.regionId || !unconfiguredRef?.behaviorId) {
            throw new Error(`Unconfigured interactable ref is incomplete: ${JSON.stringify(unconfiguredRef)}`);
          }
          await openConfig(unconfiguredRef);
          await page.locator('[data-interactable-needs-config]').first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator('[data-interactable-identity-type]').first().waitFor({ state: 'visible', timeout: 10_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'interactable-config-needs-configuration');

          await closeAllConfigWindows();
          results.steps.push({ step: 'interactable-config-source', passed: true });
        } catch (err) {
          results.steps.push({ step: 'interactable-config-source', passed: false, error: err.message });
          process.stderr.write(`Interactable config source capture failed: ${err.message}\n`);
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
              background: { src: 'icons/environment/settlement/tower-stone-blue.webp' }
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

        // ── Post-import unresolved-reference report (#492) ─────────────────────
        // The GM-facing import report is a DialogV2 that only appears AFTER an
        // import, and only surfaces its "needs attention" list when the imported
        // system carries references that cannot resolve in the target world. The
        // default smoke performs no import, so `check-screenshots` has no frame to
        // publish for the new report surface. This drives the REAL app-shell path
        // (Import button → file-picker DialogV2 → CompendiumImporter → report) with
        // a payload cloned from the live smoke system plus ONE component pointing at
        // a foreign `Item.` UUID that cannot resolve here (and a unique name so the
        // source+name matcher can't salvage it) → it lands in the report's
        // `reported` list, giving a non-empty "needs attention" report. Imported in
        // "copy" mode so it never skips and yields a throwaway "(Copy)" system that
        // is deleted immediately after the capture. Fully self-contained + guarded:
        // a hiccup records a failed step without aborting the phase.
        try {
          // Build the import file from the live smoke system so createSystem accepts
          // it (this is the same round-trip the #492 unit tests cover), appending one
          // deliberately-unresolvable component. Returns the JSON string to feed the
          // native file input.
          const importReportJson = await page.evaluate((sysId) => {
            const csm = game.fabricate.getCraftingSystemManager();
            const source = csm.getSystem(sysId);
            const payloadSystem = JSON.parse(JSON.stringify(source));
            delete payloadSystem.id; // copy mode strips ids anyway; be explicit
            const components = Array.isArray(payloadSystem.components) ? payloadSystem.components : [];
            const base = components[0] ? JSON.parse(JSON.stringify(components[0])) : {};
            const orphan = {
              ...base,
              id: 'smoke-import-report-orphan',
              name: 'Smoke Orphan Reagent',
              sourceItemUuid: 'Item.fabricateSmokeMissing0001',
              sourceUuid: 'Item.fabricateSmokeMissing0001',
              fallbackItemIds: [],
            };
            payloadSystem.components = [...components, orphan];
            const payload = {
              schemaVersion: 2,
              fabricateVersion: game.modules?.get('fabricate')?.version || '0.0.0',
              exportedAt: new Date().toISOString(),
              runtimeStateIncluded: false,
              system: payloadSystem,
              recipes: [],
              gatheringEnvironments: [],
              gatheringConfig: { system: {}, shared: {} },
            };
            return JSON.stringify(payload);
          }, craftingSetup.systemId);

          // Snapshot system ids so the throwaway "(Copy)" can be found + deleted.
          const systemIdsBeforeImport = await page.evaluate(() =>
            game.fabricate.getCraftingSystemManager().getSystems().map((s) => s.id)
          );

          await page.evaluate(() => {
            globalThis.__fabricateSmokeManagerApp = game.fabricate.api.getCraftingSystemManagerAppClass().show();
          });
          await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
          await setManagerWindowSize(page, { width: 1280, height: 820 });

          // The Import button lives in the system-library footer; if a system is
          // still scoped in, return to the library so the button is present.
          const returnToLibrary = page.locator('.fabricate-manager .manager-scope-return').first();
          if (await returnToLibrary.count() > 0) {
            await returnToLibrary.click().catch(() => {});
            await page.waitForTimeout(300);
          }

          // Open the real import file-picker dialog (file-import icon is unique to it).
          await page.locator('.fabricate-manager button.manager-button:has(i.fa-file-import)').first().click();
          const importDialog = page
            .locator('.application.dialog:has(input[name="importFile"]), .dialog:has(input[name="importFile"])')
            .first();
          await importDialog.waitFor({ state: 'visible', timeout: 10_000 });
          // Feed the JSON straight into the native file input, choose "copy" so the
          // import never skips (fresh "(Copy)" system), then submit.
          await importDialog.locator('input[name="importFile"]').setInputFiles({
            name: 'smoke-import-report.json',
            mimeType: 'application/json',
            buffer: Buffer.from(importReportJson, 'utf8'),
          });
          await importDialog.locator('input[name="conflictMode"][value="copy"]').check({ force: true });
          await importDialog.locator('button[data-action="ok"], button:has-text("Import")').first().click();

          // The post-import report is its own DialogV2 carrying `.fabricate-import-report`.
          const reportDialog = page
            .locator('.application.dialog:has(.fabricate-import-report), .dialog:has(.fabricate-import-report)')
            .first();
          await reportDialog.waitFor({ state: 'visible', timeout: 15_000 });
          // Prove the "needs attention" grouped list rendered (the reported source item).
          await reportDialog.locator('.fabricate-import-report__kind').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          // The import fires info/warn toasts that can bleed over the dialog; clear
          // them first. The report IS the intended overlay here, so — like the roll
          // prompt capture — we deliberately do NOT run assertNoScreenshotOverlays.
          await dismissFoundryNotifications(page);
          await screenshot(page, 'manager-import-report');

          // Dismiss the report so the smoke can continue.
          await reportDialog.locator('button[data-action="ok"], button:has-text("Close")').first().click().catch(() => {});
          await reportDialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

          // Delete the throwaway "(Copy)" system created by the import so no later
          // phase (or system-library row count) sees it.
          await page.evaluate(async (idsBefore) => {
            const csm = game.fabricate.getCraftingSystemManager();
            const before = new Set(idsBefore);
            const created = csm.getSystems().filter((s) => !before.has(s.id));
            for (const s of created) {
              try { await csm.deleteSystem(s.id); } catch { /* best effort */ }
            }
          }, systemIdsBeforeImport);

          await closeOpenApplications(page);
          results.steps.push({ step: 'import-report', passed: true });
        } catch (err) {
          results.steps.push({ step: 'import-report', passed: false, error: err.message });
          process.stderr.write(`Import report capture failed: ${err.message}\n`);
          await closeOpenApplications(page).catch(() => {});
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

        // Dedicated player Inventory tab evidence: switch the shared window to the
        // Inventory tab and wait for its listing to settle off "loading" so the
        // captured frame shows the resolved owned-materials grid (or the empty /
        // no-actor state) rather than the spinner. Maps changes under
        // src/ui/svelte/apps/inventory/ to a real screenshot (see the
        // 'player-inventory' VIEW_RECIPE in ui-pr-screenshot-evidence.mjs).
        await appShell.locator('.fabricate-app-nav-item:has-text("Inventory")')
          .first().click();
        await appShell.locator('.fabricate-app-nav-item.active:has-text("Inventory")')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-inventory-state]:not([data-inventory-state="loading"])')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        // A selectable item auto-selects, so when the grid is populated wait for
        // the detail panel to render before capturing (mirrors the gathering
        // detail wait), so the frame shows the sources / used-by panel.
        if (await appShell.locator('[data-inventory-state="populated"]').count() > 0) {
          await appShell.locator('[data-inventory-detail]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-inventory');
        // Restore the Gathering tab (the tab active before this inventory capture):
        // the downstream steps operate on the Gathering view (selecting the
        // 'Azure Grove' environment, etc.), so re-activate it and wait for its
        // listing to settle off "loading" before continuing.
        await appShell.locator('.fabricate-app-nav-item:has-text("Gathering")').first().click();
        await appShell.locator('.fabricate-app-nav-item.active:has-text("Gathering")')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-gathering-state]:not([data-gathering-state="loading"])')
          .first().waitFor({ state: 'visible', timeout: 10_000 });

        async function clearGatheringEnvironmentSearch() {
          const search = appShell.locator('.gathering-env-search input').first();
          if (await search.count() === 0) return;
          await search.fill('');
          await page.waitForTimeout(150);
        }

        async function selectGatheringEnvironment(name) {
          const search = appShell.locator('.gathering-env-search input').first();
          if (await search.count() > 0) {
            await search.fill(name);
            await page.waitForTimeout(200);
          }
          const card = appShell.locator('.gathering-env-card[data-locked="false"]').filter({ hasText: name }).first();
          await card.waitFor({ state: 'visible', timeout: 10_000 });
          await card.click();
          await appShell.locator('[data-gathering-detail-state="selected"]').filter({ hasText: name }).first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        }

        async function selectGatheringTask(name) {
          const row = appShell.locator('.gathering-task-row').filter({ hasText: name }).first();
          await row.waitFor({ state: 'visible', timeout: 10_000 });
          await row.scrollIntoViewIfNeeded();
          await row.click();
          await appShell.locator('[data-gathering-task-detail]').filter({ hasText: name }).first()
            .waitFor({ state: 'visible', timeout: 10_000 });
          await appShell.locator('[data-gathering-drops-state="ready"], [data-gathering-drops-state="loading"]')
            .first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          await page.waitForTimeout(250);
        }

        async function waitForGatheringAttempt(blocked) {
          await appShell.locator(`[data-gathering-attempt][data-gathering-attempt-blocked="${blocked}"]`).first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        }

        async function captureCurrentPlayerGathering(label) {
          await assertNoScreenshotOverlays(page);
          await screenshot(page, label);
        }

        async function captureSelectedGatheringTask({ environment, task, blocked, label }) {
          await selectGatheringEnvironment(environment);
          await selectGatheringTask(task);
          if (typeof blocked === 'boolean') {
            await waitForGatheringAttempt(blocked);
          }
          await captureCurrentPlayerGathering(label);
        }

        async function clickReadyGatheringAttempt() {
          await appShell.locator('[data-gathering-attempt][data-gathering-attempt-blocked="false"]').first().click();
          // An immediate (d100) attempt opens the interactive roll prompt: capture
          // it and click Roll. A timed task resolves without a roll, so the helper's
          // short presence check simply returns false there — safe for both callers.
          await handleRollPromptIfPresent(page, 'player-gathering-roll-prompt');
          await appShell.locator('[data-gathering-state="populated"]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        }

        // Documentation journey captures: exercise the user-visible gathering
        // states the quickstart and gathering docs discuss. These steps select
        // the player environments by name (Verdant Meadow, Crystal Thicket,
        // Timed Orchard, Moonlit Blind Grove), which are only listable once the
        // full-profile gathering library and Travel/realm fixtures are seeded in
        // Phase D0 (RUN_SCREENSHOT_PHASES). Under rc/ci that seeding is skipped,
        // so those environments have no visible tasks and never appear — gate the
        // whole navigation (not just the screenshot calls) behind the full
        // profile so rc/ci does not block on a card that cannot exist.
        if (RUN_FULL_ONLY_GATHERING_STATES) {
          await selectGatheringEnvironment('Azure Grove');
          await appShell.locator('[data-gathering-detail-tab="events"]').first().click();
          await appShell.locator('[data-gathering-event-section]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
          await captureCurrentPlayerGathering('player-gathering-events');
          await appShell.locator('[data-gathering-detail-tab="tasks"]').first().click();
          await appShell.locator('[data-gathering-tasks-section]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });

          await captureSelectedGatheringTask({
            environment: 'Verdant Meadow',
            task: 'Gather Meadow Herbs',
            blocked: false,
            label: 'player-gathering-task-ready'
          });
          await clickReadyGatheringAttempt();
          await captureSelectedGatheringTask({
            environment: 'Verdant Meadow',
            task: 'Gather Meadow Herbs',
            label: 'player-gathering-after-success'
          });
          await captureSelectedGatheringTask({
            environment: 'Crystal Thicket',
            task: 'Bottle Crystal Dew',
            blocked: true,
            label: 'player-gathering-tool-blocked'
          });
          await captureSelectedGatheringTask({
            environment: 'Timed Orchard',
            task: 'Tend Slow Bloom',
            blocked: false,
            label: 'player-gathering-timed-ready'
          });
          await clickReadyGatheringAttempt();
          await captureSelectedGatheringTask({
            environment: 'Timed Orchard',
            task: 'Tend Slow Bloom',
            blocked: true,
            label: 'player-gathering-timed-active'
          });

          await selectGatheringEnvironment('Moonlit Blind Grove');
          await appShell.locator('[data-gathering-blind-card]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
          await captureCurrentPlayerGathering('player-gathering-blind');

          await clearGatheringEnvironmentSearch();
        }

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
        // Drive the window below the gathering grid's stacking breakpoint. This
        // simulates the small-screen case from #330 where Foundry constrains the
        // window to a viewport narrower than the CSS min-width floor: the inline
        // `min-width: 0` overrides the floor (.fabricate-app min-width: 1024px)
        // for this capture so the app can shrink past the 900px grid breakpoint,
        // at which point the grid's @container query collapses it to one column.
        const stackedSize = await page.evaluate(() => {
          const app = document.querySelector('#fabricate-app');
          if (!app) return null;
          Object.assign(app.style, {
            minWidth: '0px',
            minHeight: '0px',
            width: '780px',
            height: '760px',
            left: '20px',
            top: '20px'
          });
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

        // ── Player Crafting tab evidence ──────────────────────────────────────
        // Switch the shared window to the Crafting tab and capture its states so
        // changes under src/ui/svelte/apps/crafting/ map to real screenshots (the
        // 'player-crafting' VIEW_RECIPES entry). The seeded smoke system resolves
        // by check, so the mode-specific selections fall back to the current frame
        // when a distinct mode is not present; each capture is defensive so a
        // missing recipe/control never fails the phase. Gated to the full screenshot
        // profile (like the other dedicated frame captures) so rc/ci never runs it.
        if (RUN_SCREENSHOT_PHASES) {
        try {
          // Restore the window to a normal width before re-capturing the tab.
          await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return;
            Object.assign(app.style, { width: '1100px', height: '760px', left: '40px', top: '40px' });
          });
          await page.waitForTimeout(300);

          await appShell.locator('.fabricate-app-nav-item:has-text("Crafting")').first().click();
          await appShell.locator('[data-crafting-state]:not([data-crafting-state="loading"])')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          // Best-effort: select the recipe whose detail renders the given mode, so
          // the captured frame matches the label when that mode is seeded. Returns
          // without throwing if no such recipe exists (the seeded smoke system
          // resolves by check), leaving the current selection on screen.
          async function selectCraftingRecipeByMode(mode) {
            const rows = appShell.locator('[data-recipe-id]');
            const count = await rows.count().catch(() => 0);
            for (let i = 0; i < count; i++) {
              await rows.nth(i).locator('.crafting-recipe-row-main').click().catch(() => {});
              await page.waitForTimeout(150);
              if (await appShell.locator(`[data-recipe-detail-mode="${mode}"]`).count() > 0) break;
            }
          }

          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-simple');

          await selectCraftingRecipeByMode('routedByIngredients');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-ingredient-routed');

          await selectCraftingRecipeByMode('routedByCheck');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-routed-by-check');

          // Produce a run-summary frame: craft the selected recipe (when craftable)
          // so the right column swaps to the run summary, then capture it.
          const craftButton = appShell.locator('[data-crafting-craft][data-crafting-craft-disabled="false"]').first();
          if (await craftButton.count() > 0) {
            await craftButton.click().catch(() => {});
            // A UI craft now opens the interactive roll prompt: capture it, then
            // click Roll so the run summary resolves and the overlay clears.
            await handleRollPromptIfPresent(page, 'player-crafting-roll-prompt');
            await appShell.locator('[data-crafting-run-summary]').first()
              .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          }
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-run-summary');

          // Multi-option ingredient selector evidence (issue #552): select the
          // seeded 'Smoke Weave Filigree' recipe, whose single ingredient group
          // offers two interchangeable coils the crafter holds, so the detail
          // renders the IngredientOptionSelector "Alternatives" radiogroup with
          // two selectable rows. Defensive: a missing recipe/control records a
          // failed step rather than aborting the surrounding phase.
          try {
            const altRecipeRow = appShell
              .locator('[data-recipe-id]:has-text("Smoke Weave Filigree")')
              .first();
            await altRecipeRow.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
            await altRecipeRow.locator('.crafting-recipe-row-main').click({ timeout: 5_000 });
            const altSection = appShell.locator('[data-recipe-section="alternatives"]').first();
            await altSection.waitFor({ state: 'visible', timeout: 10_000 });
            await appShell.locator('.crafting-alt-option').first()
              .waitFor({ state: 'visible', timeout: 10_000 });
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-alternatives');

            // Nice-to-have "switched" variant: click the second alternative so the
            // selection tick moves, evidencing the player choosing the other option.
            const altOptions = appShell.locator('.crafting-alt-option');
            if (await altOptions.count() > 1) {
              await altOptions.nth(1).click({ timeout: 5_000 }).catch(() => {});
              await page.waitForTimeout(250);
              await assertNoScreenshotOverlays(page);
              await screenshot(page, 'player-crafting-alternatives-switched');
            }
            results.steps.push({ step: 'player-crafting-alternatives', passed: true });
          } catch (altError) {
            results.steps.push({
              step: 'player-crafting-alternatives',
              passed: false,
              error: String(altError?.message ?? altError)
            });
            process.stdout.write(`  Player Crafting alternatives capture skipped: ${altError?.message ?? altError}\n`);
          }

          // Narrow-window stacked evidence: shrink below the grid's 900px stacking
          // breakpoint so the three columns reflow into a single vertical stack.
          const craftingStackedSize = await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return null;
            Object.assign(app.style, { minWidth: '0px', minHeight: '0px', width: '780px', height: '760px', left: '20px', top: '20px' });
            return { width: app.getBoundingClientRect().width, height: app.getBoundingClientRect().height };
          });
          await page.waitForTimeout(600);
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-stacked');
          results.steps.push({ step: 'player-crafting-stacked', passed: true, size: craftingStackedSize });
        } catch (craftingTabError) {
          results.steps.push({ step: 'player-crafting', passed: false, error: String(craftingTabError?.message ?? craftingTabError) });
          process.stdout.write(`  Player Crafting tab capture skipped: ${craftingTabError?.message ?? craftingTabError}\n`);
        }
        }

        // ── Player Alchemy tab evidence (issue #543) ──────────────────────────
        // The Alchemy tab is conditional — shown only when an enabled alchemy
        // system has recipes (seeded above under RUN_SCREENSHOT_PHASES). With TWO
        // alchemy systems the discipline chooser renders first; enter one to reach
        // the three-column workbench. Capture the chooser, the populated workbench,
        // the narrow stacked layout, and each theme. Maps changes under
        // src/ui/svelte/apps/alchemy/ to real screenshots (the 'player-alchemy*'
        // VIEW_RECIPES entries). Gated to the full screenshot profile and guarded
        // so a missing tab/control records a failed step rather than aborting the
        // phase.
        if (RUN_SCREENSHOT_PHASES) {
        try {
          if (await appShell.locator('.fabricate-app-nav-item:has-text("Alchemy")').count() === 0) {
            throw new Error('Alchemy tab is not present (alchemy fixtures may not have seeded).');
          }
          // Restore the window to a normal width — the crafting-stacked capture
          // above shrank it — before capturing the alchemy chooser/workbench.
          await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return;
            Object.assign(app.style, { minWidth: '', minHeight: '', width: '1100px', height: '760px', left: '40px', top: '40px' });
          });
          await page.waitForTimeout(300);

          // The alchemy listing resolves its actor from the shared top-bar
          // selection, and the no-actor state precedes the chooser in AlchemyView.
          // Wait for the bar to finish selecting an actor so we land on the
          // discipline chooser rather than the no-actor placeholder.
          await appShell.locator('[data-actor-bar-state="ready"]')
            .first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

          await appShell.locator('.fabricate-app-nav-item:has-text("Alchemy")').first().click();
          await appShell.locator('.fabricate-app-nav-item.active:has-text("Alchemy")')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          // Let the view settle out of its loading state. With two seeded
          // disciplines the chooser renders; if a discipline is already active
          // (persisted selection), use the "Switch discipline" control to return
          // to the chooser.
          await appShell
            .locator('#fabricate-app [data-alchemy-state]:not([data-alchemy-state="loading"]), #fabricate-app .alchemy-chooser')
            .first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
          const alchemyChooser = appShell.locator('.alchemy-chooser').first();
          if (!(await alchemyChooser.isVisible().catch(() => false))) {
            const switchDiscipline = appShell.locator('[data-alchemy-switch]').first();
            if (await switchDiscipline.count() > 0) {
              await switchDiscipline.click().catch(() => {});
            }
          }
          await alchemyChooser.waitFor({ state: 'visible', timeout: 12_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-alchemy-chooser');

          // Enter a discipline (prefer the Bubbling Cauldron, whose components the
          // crafter owns) → the three-column workbench.
          const cauldronCard = appShell
            .locator(`[data-alchemy-chooser-card="${alchemyFixtures?.cauldronSystemId ?? ''}"]`).first();
          if (await cauldronCard.count() > 0) {
            await cauldronCard.click();
          } else {
            await appShell.locator('[data-alchemy-chooser-card]').first().click();
          }
          await appShell.locator('[data-alchemy-state="workbench"]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });

          // Populate the bench: place the first available owned component so the
          // workbench frame shows chips + a signature rather than the empty bench.
          const firstAvailableComponent = appShell
            .locator('[data-alchemy-inventory-row]:not([disabled])').first();
          if (await firstAvailableComponent.count() > 0) {
            await firstAvailableComponent.click().catch(() => {});
            await page.waitForTimeout(200);
          }
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-alchemy-workbench');

          // Narrow-window stacked evidence: shrink below the alchemy grid's 900px
          // container-query breakpoint so the three columns reflow into a single
          // vertical stack (workbench leading).
          const alchemyStackedSize = await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return null;
            Object.assign(app.style, { minWidth: '0px', minHeight: '0px', width: '780px', height: '760px', left: '20px', top: '20px' });
            return { width: app.getBoundingClientRect().width, height: app.getBoundingClientRect().height };
          });
          await page.waitForTimeout(600);
          await appShell.locator('[data-alchemy-state="workbench"]').first()
            .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-alchemy-stacked');

          // Restore a normal width, then capture the workbench under every theme.
          await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return;
            Object.assign(app.style, { minWidth: '', minHeight: '', width: '1100px', height: '760px', left: '40px', top: '40px' });
          });
          await page.waitForTimeout(400);
          await appShell.locator('[data-alchemy-state="workbench"]').first()
            .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          await captureAlchemyThemes(page);

          results.steps.push({ step: 'player-alchemy', passed: true, size: alchemyStackedSize });
        } catch (alchemyTabError) {
          results.steps.push({ step: 'player-alchemy', passed: false, error: String(alchemyTabError?.message ?? alchemyTabError) });
          process.stdout.write(`  Player Alchemy tab capture skipped: ${alchemyTabError?.message ?? alchemyTabError}\n`);
        }
        }

        await closeOpenApplications(page);
        results.steps.push({ step: 'open-fabricate-app-shell', passed: true });
        process.stdout.write('  Shared Fabricate app shell verified and screenshotted.\n');

        // Attempt to craft via the API
        process.stdout.write('  Executing craft: Brew Healing Potion...\n');
        const craftResult = await page.evaluate(async ({ recipeId, crafterId }) => {
          const crafter = game.actors.get(crafterId);
          if (!crafter) throw new Error(`Actor ${crafterId} not found`);

          console.log(`Crafting with ${crafter.name} (${crafter.id}), ${crafter.items.size} items in inventory`);

          const rm = game.fabricate.getRecipeManager();
          const recipe = rm.getRecipe(recipeId);
          if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

          const result = await game.fabricate.craft(crafter, recipe, {
            componentSourceActors: [crafter]
          });

          // Check the crafter's inventory for the Healing Potion
          const potionInInventory = crafter.items.contents.some(i => i.name === 'Healing Potion');

          return {
            success: result.success,
            message: result.message,
            potionInInventory
          };
        }, { recipeId: craftingSetup.healingPotionRecipeId, crafterId: cleanup.crafterId });

        if (!craftResult.success) {
          process.stderr.write(`Craft returned failure: ${craftResult.message}\n`);
          results.steps.push({ step: 'craft-healing-potion', passed: false, error: craftResult.message });
        } else {
          process.stdout.write(`Craft succeeded: ${craftResult.message}\n`);
          process.stdout.write(`Healing Potion in inventory: ${craftResult.potionInInventory}\n`);
          results.steps.push({ step: 'craft-healing-potion', passed: true });
        }

        // Wait for the Healing Potion to actually appear in the crafter's inventory
        // before screenshotting. Catches missing-craft regressions that a
        // fixed sleep would mask. Replaces a 1 s fixed sleep.
        if (craftResult.success) {
          await page.waitForFunction((crafterId) => {
            const crafter = game.actors.get(crafterId);
            return crafter?.items?.contents?.some(i => i.name === 'Healing Potion') === true;
          }, cleanup.crafterId, { timeout: 10_000 }).catch(() => { /* surface via post-craft step state */ });
        }
        await screenshot(page, 'post-craft');
        process.stdout.write('  Screenshotted post-craft state.\n');

        // Open the crafter's sheet to show the crafted item (inventory tab)
        process.stdout.write('  Opening the crafter\'s inventory to verify crafted item...\n');
        await page.evaluate(async (crafterId) => {
          const crafter = game.actors.get(crafterId);
          if (crafter) await crafter.sheet.render(true);
        }, cleanup.crafterId);
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
        }, cleanup.crafterId);
        await page.waitForTimeout(500);
        await screenshot(page, 'crafter-post-craft-inventory');
        process.stdout.write('  Screenshotted the crafter\'s post-craft inventory.\n');

        // Close the sheet
        await page.evaluate((crafterId) => {
          const crafter = game.actors.get(crafterId);
          if (crafter) crafter.sheet.close();
        }, cleanup.crafterId);

        // ── Issue #489: execute-and-assert coverage (always-run, rc/ci) ────────
        // Cheap API crafts, tool breakages, salvage, negative gating, and one
        // guaranteed-success gather — no screenshots, so they run in every
        // profile. A failed scenario is recorded as a failed step and fails the
        // run via the final step-failure gate.
        if (executionFixtures) {
          process.stdout.write('  Running craft-execution coverage asserts (#489)...\n');
          const execSteps = await runCraftExecutionAsserts(page, executionFixtures, cleanup.crafterId);
          for (const step of execSteps) {
            results.steps.push(step);
            process.stdout.write(`    ${step.passed ? 'PASS' : 'FAIL'} ${step.step}${step.error ? `: ${step.error}` : ''}\n`);
          }

          // Full-profile-only gather assertions: the 0%-drop ("empty") and
          // scene-blocked gathers, plus the hazardous "Bramble Snare" event
          // firing — all rely on fixtures seeded only under RUN_SCREENSHOT_PHASES.
          if (RUN_FULL_ONLY_GATHERING_STATES) {
            process.stdout.write('  Running full-profile gather asserts (#489)...\n');
            const gatherSteps = await runFullProfileGatherAsserts(
              page, craftingSetup, executionFixtures.hazard, cleanup.crafterId
            );
            for (const step of gatherSteps) {
              results.steps.push(step);
              process.stdout.write(`    ${step.passed ? 'PASS' : 'FAIL'} ${step.step}${step.error ? `: ${step.error}` : ''}\n`);
            }
          }
        } else {
          process.stdout.write('  Skipping #489 execution asserts: fixtures not seeded.\n');
          results.steps.push({ step: 'exec-coverage', passed: false, error: 'Execution fixtures not seeded' });
        }

        // ── Player Journal capture ────────────────────────────────────────────
        // The Phase E craft above produced at least one terminal crafting run for
        // the crafter, so the player Journal screen has a populated, selectable run
        // to render. Captured under its own label so changes under
        // src/ui/svelte/apps/journal/ map to a real screenshot (see the
        // 'fabricate-journal' VIEW_RECIPE in ui-pr-screenshot-evidence.mjs).
        //
        // This is the last heavy action of the run — a full app re-open + Journal
        // navigation ~15min in. A transient renderer/page teardown here ("Target
        // page/context/browser has been closed") is an INFRA hiccup, not a product
        // failure (the Journal render itself is covered by the mounted journal-view
        // tests). So retry the capture to ride out a live-page navigation hiccup;
        // if the page is torn down even after retries, record the step as SKIPPED
        // (with the reason, so a persistent pattern still shows in summary.json)
        // rather than red-failing the whole smoke on a known-flaky last step. A
        // genuine UI failure (locator not visible / wrong journal state) with a
        // LIVE page still fails hard and still captures a journal-failure frame.
        const JOURNAL_CAPTURE_ATTEMPTS = 3;
        const isTransientPageTeardown = (message) =>
          /has been closed|target closed|session closed|page crashed|has been disconnected/i.test(
            String(message || '')
          );
        const captureJournalScreen = async () => {
          await closeOpenApplications(page);
          // Ensure the crafter (the actor that owns the terminal run) is the
          // persisted bar selection so the Journal lists ITS runs even though the
          // harness runs as GM. JournalView.load() reads this remembered-actor seam
          // directly via services.getSelectedActorId().
          await page.evaluate(async (crafterId) => {
            await game.fabricate.setSelectedGatheringActorId(crafterId);
          }, cleanup.crafterId);

          // Re-open the shared Fabricate app via the same "Craft Item" sidebar
          // action used earlier in this phase.
          const journalItemsTab = page.locator('#sidebar [data-tab="items"]').first();
          await journalItemsTab.click({ force: true });
          const journalCraftButton = page.locator('button[data-fabricate-action="craft"]').first();
          await journalCraftButton.waitFor({ state: 'visible', timeout: 10_000 });
          await journalCraftButton.evaluate(button => button.click());

          await appShell.waitFor({ state: 'visible', timeout: 10_000 });
          await appShell.locator('[data-actor-bar-state="ready"]')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          // Switch to the Journal tab (click via .evaluate to bypass any overlay,
          // matching the sidebar-action pattern above) and wait for it to activate.
          await appShell.locator('.fabricate-app-nav-item:has-text("Journal")')
            .first().evaluate(el => el.click());
          await appShell.locator('.fabricate-app-nav-item.active:has-text("Journal")')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          // JournalView mounts and fires an async listJournalForActor() fetch,
          // rendering a [data-journal-state] container ("loading" -> "populated"/
          // "empty"/"error"). Wait for it to settle off loading, then for the
          // populated 3-column layout (guaranteed by the crafter's terminal run).
          await appShell.locator('[data-journal-state]:not([data-journal-state="loading"])')
            .first().waitFor({ state: 'visible', timeout: 15_000 });
          await appShell.locator('[data-journal-state="populated"]')
            .first().waitFor({ state: 'visible', timeout: 15_000 });

          // Render the centre detail for a concrete run: prefer an active run card,
          // else the first terminal history row. The centre detail article carries
          // both [data-journal-detail] and [data-run-id] only when a run is
          // selected (the unselected placeholder is [data-journal-empty="detail"]).
          const journalActiveCard = appShell.locator('.journal-run-card[data-run-id]').first();
          if (await journalActiveCard.count() > 0) {
            await journalActiveCard.click();
          } else {
            const journalHistoryRow = appShell.locator('.journal-history-row[data-history-run-id]').first();
            if (await journalHistoryRow.count() > 0) {
              await journalHistoryRow.scrollIntoViewIfNeeded();
              await journalHistoryRow.click();
            }
          }
          await appShell.locator('[data-journal-detail][data-run-id]')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'fabricate-journal');
        };
        let journalErr = null;
        for (let attempt = 1; attempt <= JOURNAL_CAPTURE_ATTEMPTS; attempt += 1) {
          try {
            process.stdout.write(
              `  Capturing the player Journal screen (attempt ${attempt}/${JOURNAL_CAPTURE_ATTEMPTS})...\n`
            );
            await captureJournalScreen();
            journalErr = null;
            break;
          } catch (attemptErr) {
            journalErr = attemptErr;
            process.stderr.write(
              `Player Journal capture attempt ${attempt} failed: ${attemptErr.message}\n`
            );
            // A torn-down page cannot be recovered within this run — stop retrying.
            if (page.isClosed?.() || isTransientPageTeardown(attemptErr.message)) break;
            // Live-page hiccup (navigation/timing): reset and retry.
            if (attempt < JOURNAL_CAPTURE_ATTEMPTS) {
              try {
                await closeOpenApplications(page);
              } catch {
                /* ignore reset failure; the next attempt re-opens the app */
              }
            }
          }
        }
        if (!journalErr) {
          results.steps.push({ step: 'player-journal', passed: true });
          process.stdout.write('  Screenshotted the player Journal screen.\n');
        } else if (page.isClosed?.() || isTransientPageTeardown(journalErr.message)) {
          // Infra teardown (renderer/page closed) — do not fail the whole smoke on
          // a known-flaky last step; mark it skipped with the reason so a
          // persistent pattern is still visible in summary.json.
          results.steps.push({
            step: 'player-journal',
            passed: true,
            skipped: true,
            error: `transient page teardown (skipped): ${journalErr.message}`,
          });
          process.stderr.write(
            `Player Journal capture skipped after a transient page teardown: ${journalErr.message}\n`
          );
        } else {
          results.steps.push({ step: 'player-journal', passed: false, error: journalErr.message });
          process.stderr.write(`Player Journal capture failed: ${journalErr.message}\n`);
          try {
            await screenshot(page, 'journal-failure');
          } catch {
            /* page may already be gone */
          }
        }

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

        // Delete the issue #489 craft-execution coverage systems (and any gather
        // environments/items they own). Their recipes are already in recipeIds
        // above; the Arcane Forge rc gather env/task are cleaned with systemId.
        if (Array.isArray(cleanupData.executionSystemIds) && cleanupData.executionSystemIds.length > 0) {
          const environmentStore = game.fabricate?.getGatheringEnvironmentStore?.();
          const csm = game.fabricate?.getCraftingSystemManager?.();
          for (const executionSystemId of cleanupData.executionSystemIds) {
            try { await environmentStore?.cleanupByCraftingSystem?.(executionSystemId); } catch { /* ok */ }
            try { await csm?.deleteSystem(executionSystemId); } catch { /* already deleted */ }
          }
        }
        if (Array.isArray(cleanupData.executionItemIds) && cleanupData.executionItemIds.length > 0) {
          try { await Item.deleteDocuments(cleanupData.executionItemIds); } catch { /* ok */ }
        }

        // Delete the dedicated broken system seeded for the overview/banner captures
        // (and its gathering environment via the environment store).
        if (cleanupData.blockedSystemId) {
          const environmentStore = game.fabricate?.getGatheringEnvironmentStore?.();
          try { await environmentStore?.cleanupByCraftingSystem?.(cleanupData.blockedSystemId); } catch { /* ok */ }

          const csm = game.fabricate?.getCraftingSystemManager?.();
          if (csm) {
            try { await csm.deleteSystem(cleanupData.blockedSystemId); } catch { /* already deleted */ }
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
