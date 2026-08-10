/**
 * The Foundry setup → license → auth → launch → join path, shared by every harness that needs a
 * logged-in Foundry page (issue #1088).
 *
 * WHY THIS IS A MODULE AND NOT A COPY. It was extracted from `scripts/foundry-test-run.mjs`, which
 * exports nothing, imports Playwright at top level and calls `main()` on import — so a second
 * harness cannot reuse it by importing that file, and copying it would duplicate ~250 lines
 * (`evaluateJoinControl` alone is 135) straight into SonarCloud's new-code duplication gate. The
 * select-vs-tile join fallback and the license/activation distinction below are also the parts of
 * the boot path that took real effort to get right; re-deriving them for a second caller would be a
 * fresh source of boot flake, not a saving.
 *
 * WHY IT IS SEPARATE FROM `foundryRunIdentity.js` AND FRIENDS — A DELIBERATE EXCEPTION, NOT A
 * VIOLATION. The rest of `scripts/lib/` is Playwright-free by design so `node --test` can import it;
 * `foundryRunIdentity.js`'s header states the rule and its reason (a top-level Playwright import, or
 * an autorun `main()`, launches Chromium under `node --test` and then `process.exit()`s the whole
 * run — the `# cancelled` catastrophe). This module keeps the LETTER of that rule: it imports
 * nothing, Playwright included, and only ever uses a `page` and a `context` it is handed. But it is
 * useless without a live browser and must never be imported by a test, so it is filed apart from the
 * pure derivations rather than mixed in among them. Nothing under `tests/` imports it, and nothing
 * should: its behaviour is verified by running the harnesses, not by a unit test.
 *
 * REPORTING IS INJECTED. The smoke records `results.steps[]` entries and captures screenshots as it
 * boots; the version arm records neither. Both behaviours are supplied by the caller through a
 * reporter, so neither harness's bookkeeping leaks into the other's.
 */

export const JOIN_BUTTON_SELECTOR = 'button:has-text("Join Game Session"), button[name="join"]';
export const JOIN_USER_SELECT_SELECTOR = 'select[name="userid"]';
export const JOIN_USER_TILE_SELECTOR = '[data-user-id]';

/**
 * @typedef {object} BootReporter
 * @property {(page: object, label: string) => Promise<unknown>} screenshot Capture a labelled frame.
 * @property {(step: Record<string, boolean|string>) => void} recordStep Record a harness step.
 * @property {(message: string) => void} log Progress output.
 */

/**
 * Build a reporter, defaulting every sink to a no-op.
 *
 * @param {Partial<BootReporter>} [overrides]
 * @returns {BootReporter}
 */
export function createBootReporter(overrides = {}) {
  return {
    screenshot: async () => {},
    recordStep: () => {},
    log: () => {},
    ...overrides,
  };
}

const DEFAULT_REPORTER = createBootReporter();

/**
 * Safely parse a page pathname.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
export function getPathname(rawUrl) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return '';
  }
}

/**
 * Summarize join-page state for debugging.
 *
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
export function describeJoinState(state, userLabel) {
  /** @type {string[]} */
  const parts = [];
  if (state.mode) parts.push(`mode=${state.mode}`);
  if (state.selectedLabel) parts.push(`selectedLabel=${state.selectedLabel}`);
  if (state.selectedValue) parts.push(`selectedValue=${state.selectedValue}`);
  if (typeof state.selectionMatches === 'boolean') {
    parts.push(`selectionMatches=${state.selectionMatches}`);
  }
  if (typeof state.joinButtonDisabled === 'boolean') {
    parts.push(`joinButtonDisabled=${state.joinButtonDisabled}`);
  }
  if (Array.isArray(state.availableUsers) && state.availableUsers.length > 0) {
    parts.push(`availableUsers=${state.availableUsers.join(', ')}`);
  }
  if (state.reason) parts.push(`reason=${state.reason}`);
  return `Join diagnostics for "${userLabel}": ${parts.join('; ') || 'no details available'}.`;
}

/**
 * Accept the first-run license if Foundry redirects to `/license`.
 *
 * Safe to call on every run; a no-op when the license page is not present.
 *
 * @param {object} page Playwright page.
 * @param {{ reporter?: BootReporter }} [options]
 */
export async function acceptLicenseIfPresent(page, { reporter = DEFAULT_REPORTER } = {}) {
  if (getPathname(page.url()) !== '/license') {
    reporter.recordStep({ step: 'license-check', passed: true, skipped: true });
    return;
  }

  reporter.log('License agreement detected. Accepting terms...\n');
  await reporter.screenshot(page, 'license');

  const checkboxCandidates = page.locator(
    'input[name="agree"], input[id*="agree" i], input[type="checkbox"]'
  );
  if ((await checkboxCandidates.count()) === 0) {
    // No EULA checkbox usually means Foundry booted unlicensed and is showing the License Key
    // Activation page (a license-key text field + Submit Key button) rather than the EULA. That is
    // an activation/credentials problem, not an EULA one — surface it clearly. Fix: ensure
    // FOUNDRY_LICENSE_KEY is set and forwarded to the container (docker-compose.foundry.yml) so
    // felddy activates at boot.
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
  if ((await agreeButtonCandidates.count()) === 0) {
    throw new Error('License page detected, but AGREE button was not found.');
  }

  const agreeButton = agreeButtonCandidates.first();
  await agreeButton.waitFor({ state: 'visible', timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/(setup|auth)(?:\?.*)?$/, { timeout: 60_000 }),
    agreeButton.click(),
  ]);

  await reporter.screenshot(page, 'license-accepted');
  reporter.recordStep({ step: 'license-accepted', passed: true });
}

/**
 * Enter the admin key on the `/auth` page if present. Foundry redirects to `/setup` on success.
 *
 * @param {object} page Playwright page.
 * @param {{ adminKey: string, reporter?: BootReporter }} options
 */
export async function authenticateIfRequired(page, { adminKey, reporter = DEFAULT_REPORTER }) {
  if (getPathname(page.url()) !== '/auth') {
    return;
  }

  reporter.log('Admin auth page detected. Entering admin key...\n');
  const adminInput = page
    .locator('input[name="adminKey"], input[name="password"], input[type="password"]')
    .first();
  await adminInput.waitFor({ state: 'visible', timeout: 10_000 });
  await adminInput.fill(adminKey);

  const submitBtn = page
    .locator('button[type="submit"], button:has-text("Submit"), button:has-text("Log In")')
    .first();
  await Promise.all([page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 60_000 }), submitBtn.click()]);

  await reporter.screenshot(page, 'auth-complete');
  reporter.recordStep({ step: 'admin-auth-page', passed: true });
}

/**
 * Dismiss first-run overlay dialogs on the setup page: telemetry consent, backup tour, etc.
 *
 * @param {object} page Playwright page.
 * @param {{ reporter?: BootReporter }} [options]
 */
export async function dismissFirstRunDialogs(page, { reporter = DEFAULT_REPORTER } = {}) {
  // 1. Telemetry / usage sharing dialog
  try {
    const declineSharing = page.locator('button:has-text("Decline Sharing")');
    await declineSharing.waitFor({ state: 'visible', timeout: 10_000 });
    reporter.log('Telemetry dialog detected. Declining...\n');
    await declineSharing.click();
    await declineSharing.waitFor({ state: 'hidden', timeout: 5000 });
    reporter.recordStep({ step: 'dismiss-telemetry', passed: true });
  } catch {
    // Not shown
  }

  // 2. Foundry tours (e.g. "Backups Overview") — dismiss via API
  try {
    await page.waitForTimeout(2000); // Allow tours to start
    const dismissed = await page.evaluate(() => {
      const tour = globalThis.foundry?.nue?.Tour;
      if (tour?.activeTour) {
        tour.activeTour.exit();
        return true;
      }
      return false;
    });
    if (dismissed) {
      reporter.log('Active tour dismissed via API.\n');
      reporter.recordStep({ step: 'dismiss-tour', passed: true });
    }
  } catch {
    // No active tour
  }
}

/**
 * Remove anything on the Setup page that swallows pointer events, and report what was removed.
 *
 * Foundry's New User Experience starts a setup tour whose full-viewport `.tour-overlay` intercepts
 * every click, so a perfectly correct selector still times out with Playwright's "element is
 * visible, enabled and stable" message — which reads as a missing control rather than a blocked
 * one. `suppressFoundryTours` seeds `core.tourProgress` pre-boot and normally prevents this
 * entirely; this is the reactive backstop for the setup-side tours that seeding does not reach, and
 * it is cheap enough to call unconditionally.
 *
 * WHAT IT MUST NOT REMOVE, LEARNED THE EXPENSIVE WAY. An earlier version also deleted `#tooltip`,
 * copied from a throwaway probe where it was harmless. It is not harmless: `#tooltip` is
 * Foundry-owned infrastructure that `TooltipManager` holds a live reference to, and pulling it out
 * of the DOM made `TooltipManager.deactivate` throw `Cannot read properties of null (reading
 * 'classList')` — twice, from `SetupTour._postStep`, on the first V13 run that took the setup path.
 * The tooltip is `pointer-events: none` and blocks nothing, so removing it bought exactly nothing
 * and cost two `pageerror`s. Only genuinely click-swallowing overlays belong in the sweep.
 *
 * @param {object} page Playwright page.
 * @returns {Promise<string[]>} What was cleared, for diagnostics.
 */
export async function clearBlockingOverlays(page) {
  return page.evaluate(() => {
    const removed = [];
    try {
      const tour = globalThis.foundry?.nue?.Tour;
      if (tour?.activeTour) {
        // Preferred over any DOM surgery: `exit()` unwinds the tour's own state, so nothing is left
        // holding a reference to an element that no longer exists.
        tour.activeTour.exit();
        removed.push('activeTour.exit()');
      }
    } catch {
      // Fall through to the DOM sweep: an exiting tour must never stop the boot.
    }
    for (const selector of ['.tour-overlay', '.tour.active']) {
      for (const element of document.querySelectorAll(selector)) {
        element.remove();
        removed.push(selector);
      }
    }
    return removed;
  });
}

/**
 * Evaluate the current join-form state from the page, optionally selecting the target user.
 *
 * @param {object} page Playwright page.
 * @param {string} userLabel
 * @param {'read'|'select'} action
 */
async function evaluateJoinControl(page, userLabel, action) {
  return page.evaluate(
    ({ selectSelector, tileSelector, userLabel: targetLabel, action: mode }) => {
      const normalize = (value) =>
        String(value ?? '')
          .trim()
          .toLowerCase();
      const target = normalize(targetLabel);
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (element.hidden) return false;
        const style = globalThis.getComputedStyle(element);
        return (
          style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null
        );
      };
      const matchTarget = (value) => {
        const normalized = normalize(value);
        if (!normalized) return false;
        return normalized === target || normalized.includes(target) || target.includes(normalized);
      };
      const getNodeLabel = (node) => {
        const candidates = [
          node.dataset.userName,
          node.getAttribute('aria-label'),
          node.textContent,
        ];
        return candidates.map((value) => String(value ?? '').trim()).find(Boolean) ?? '';
      };
      const findJoinButton = () =>
        [...document.querySelectorAll('button')].find((button) => {
          const text = normalize(button.textContent);
          return text.includes('join game session') || button.name === 'join';
        }) ?? null;
      const findSelect = () => {
        const selects = [...document.querySelectorAll(selectSelector)].filter(
          (node) => node instanceof HTMLSelectElement
        );
        return selects.find(isVisible) ?? selects.at(-1) ?? null;
      };
      const readOptions = (select) =>
        [...select.options]
          .map((option) => ({
            option,
            label: option.textContent?.trim() ?? '',
            value: option.value,
            disabled: option.disabled,
          }))
          .filter((option) => option.value && !option.disabled);
      const readSelectState = (select) => {
        const options = readOptions(select);
        const selectedOption = select.selectedOptions?.[0];
        const selectedLabel = selectedOption?.textContent?.trim() ?? '';
        const selectedValue = select.value ?? '';

        return {
          mode: 'select',
          targetFound: options.some((option) => matchTarget(option.label)),
          selectionMatches: Boolean(selectedValue) && matchTarget(selectedLabel),
          selectedLabel,
          selectedValue,
          availableUsers: options.map((option) => option.label || option.value).filter(Boolean),
          joinButtonDisabled: Boolean(findJoinButton()?.disabled),
          reason: options.length === 0 ? 'User select has no joinable options yet.' : null,
        };
      };
      const readTileState = (fallbackTile = null) => {
        const tiles = [...document.querySelectorAll(tileSelector)].filter(isVisible);
        const availableUsers = tiles.map(getNodeLabel).filter(Boolean);
        const hiddenInput = document.querySelector('input[name="userid"]');
        const selectedValue = hiddenInput instanceof HTMLInputElement ? hiddenInput.value : '';
        const selectedTile =
          tiles.find((tile) =>
            tile.matches(
              '[aria-selected="true"], .selected, [data-selected="true"], [aria-pressed="true"]'
            )
          ) ??
          tiles.find((tile) => {
            const tileUserId = tile.dataset.userId ?? '';
            return Boolean(selectedValue) && tileUserId === selectedValue;
          }) ??
          fallbackTile;
        const selectedLabel = selectedTile ? getNodeLabel(selectedTile) : '';

        return {
          mode: tiles.length > 0 ? 'tile' : null,
          targetFound: availableUsers.some((user) => matchTarget(user)),
          selectionMatches:
            Boolean(selectedValue || selectedLabel) && matchTarget(selectedLabel || selectedValue),
          selectedLabel,
          selectedValue,
          availableUsers,
          joinButtonDisabled: Boolean(findJoinButton()?.disabled),
          reason: tiles.length === 0 ? 'Join page did not expose a selectable user control.' : null,
        };
      };

      const select = findSelect();
      if (mode === 'select') {
        if (select) {
          const options = readOptions(select);
          const match = options.find((entry) => matchTarget(entry.label)) ?? null;
          if (!match) {
            return {
              ...readSelectState(select),
              selected: false,
              reason: `User "${targetLabel}" was not found in the join select.`,
            };
          }

          select.selectedIndex = match.option.index;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          const state = readSelectState(select);
          return { ...state, selected: state.selectionMatches, reason: null };
        }

        const tiles = [...document.querySelectorAll(tileSelector)].filter(isVisible);
        const match = tiles.find((tile) => matchTarget(getNodeLabel(tile))) ?? null;
        if (!match) {
          return {
            ...readTileState(),
            selected: false,
            reason: `User "${targetLabel}" was not found in the join tiles.`,
          };
        }

        match.click();
        const state = readTileState(match);
        return { ...state, selected: state.selectionMatches, reason: null };
      }

      return select ? readSelectState(select) : readTileState();
    },
    {
      selectSelector: JOIN_USER_SELECT_SELECTOR,
      tileSelector: JOIN_USER_TILE_SELECTOR,
      userLabel,
      action,
    }
  );
}

/**
 * Read the current join-form state from the page.
 *
 * @param {object} page Playwright page.
 * @param {string} userLabel
 */
async function readJoinState(page, userLabel) {
  return evaluateJoinControl(page, userLabel, 'read');
}

/**
 * Wait until the join UI exposes a selectable user.
 *
 * @param {object} page Playwright page.
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
 * Join the running world from the Foundry join page.
 *
 * @param {object} page Playwright page.
 * @param {{
 *   userLabel?: string,
 *   stepName?: string | null,
 *   reporter?: BootReporter
 * }} [options]
 */
export async function joinWorldSession(page, options = {}) {
  if (getPathname(page.url()) !== '/join') {
    return;
  }

  const userLabel = options.userLabel ?? 'Gamemaster';
  const stepName = options.stepName ?? null;
  const reporter = options.reporter ?? DEFAULT_REPORTER;

  reporter.log(`Join page detected. Joining as ${userLabel}...\n`);
  await page.waitForLoadState('domcontentloaded');
  await waitForJoinUi(page, userLabel);

  let joinState = await readJoinState(page, userLabel);
  if (!joinState.selectionMatches) {
    let selected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await evaluateJoinControl(page, userLabel, 'select');
      await page.waitForTimeout(250 * attempt);
      joinState = await readJoinState(page, userLabel);
      if (joinState.selectionMatches) {
        selected = true;
        break;
      }
    }

    if (!selected) {
      await reporter.screenshot(page, 'join-selection-failed');
      throw new Error(`Unable to select join user. ${describeJoinState(joinState, userLabel)}`);
    }
  }

  const joinButton = page.locator(JOIN_BUTTON_SELECTOR).first();
  await joinButton.waitFor({ state: 'visible', timeout: 10_000 });
  await page
    .waitForFunction(
      () => {
        const button = [...document.querySelectorAll('button')].find((candidate) => {
          const text = String(candidate.textContent ?? '')
            .trim()
            .toLowerCase();
          return text.includes('join game session') || candidate.name === 'join';
        });
        return button instanceof HTMLButtonElement ? !button.disabled : true;
      },
      null,
      { timeout: 5000 }
    )
    .catch(() => {});

  await reporter.screenshot(page, 'join-ready');

  try {
    await Promise.all([
      page.waitForURL(/\/game/, { timeout: 60_000, waitUntil: 'load' }),
      joinButton.click(),
    ]);
  } catch (error) {
    const failureState = await readJoinState(page, userLabel);
    await reporter.screenshot(page, 'join-submit-failed');
    throw new Error(
      `Join session did not reach /game after selecting "${userLabel}". ` +
        `${describeJoinState(failureState, userLabel)} Cause: ${error.message}`,
      { cause: error }
    );
  }

  if (stepName) {
    reporter.recordStep({ step: stepName, passed: true });
  }
}

/**
 * Launch a world from the Foundry setup page and wait for the join (or game) page.
 *
 * Assumes the page is already authenticated and heading for `/setup`; the caller decides whether the
 * world is already running (in which case Foundry never shows `/setup` at all).
 *
 * This body is the full smoke's own launch block, moved verbatim. It deliberately does NOT sweep the
 * DOM with {@link clearBlockingOverlays}: the smoke has never needed to, and adding a step here
 * would change the behaviour of a harness this extraction is supposed to leave untouched. A caller
 * that wants that backstop calls it itself before this — the version arm does.
 *
 * @param {object} page Playwright page.
 * @param {{
 *   worldId: string,
 *   foundryUrl: string,
 *   reporter?: BootReporter
 * }} options
 */
export async function launchWorld(page, { worldId, foundryUrl, reporter = DEFAULT_REPORTER }) {
  await page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 15_000 });

  // Dismiss first-run dialogs (telemetry, tours) that overlay the setup page
  await dismissFirstRunDialogs(page, { reporter });

  await reporter.screenshot(page, 'setup-ready');
  reporter.recordStep({ step: 'setup-ready', passed: true });

  // Navigate to the Worlds tab via JavaScript (Foundry V13 setup page)
  await page.evaluate(() => {
    // Foundry V13 uses ApplicationV2 tabs — switch to worlds tab
    const tab = document.querySelector('#setup-packages-header [data-tab="worlds"]');
    if (tab) tab.click();
  });
  // Wait for the world's card to be present (replaces a 2 s fixed sleep)
  await page
    .locator(`[data-package-id="${worldId}"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });
  await reporter.screenshot(page, 'worlds-tab');

  // Click the Launch World button (visible on hover in Foundry V13)
  const worldCard = page.locator(`[data-package-id="${worldId}"]`);
  await worldCard.hover();
  const launchBtn = worldCard.locator('[data-action="worldLaunch"]');
  await launchBtn.waitFor({ state: 'visible', timeout: 5000 });
  await launchBtn.click();
  // After launch, Foundry navigates to /join (player selection) or /game
  try {
    await page.waitForURL(/\/(join|game)/, { timeout: 120_000 });
  } catch (error) {
    if (!String(error?.message ?? '').includes('ERR_CONNECTION_REFUSED')) {
      throw error;
    }
    await page.waitForTimeout(10_000);
    await page.goto(`${foundryUrl}/join`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForURL(/\/(join|game)/, { timeout: 60_000 });
  }
  await reporter.screenshot(page, 'world-launching');
  reporter.recordStep({ step: 'launch-world', passed: true });
}
