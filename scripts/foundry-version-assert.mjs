/**
 * foundry-version-assert.mjs — the narrow boot-and-assert arm (issue #1088).
 *
 * Boots the Foundry generation the selected smoke arm names, joins the smoke world as Gamemaster,
 * confirms Fabricate loads, and asserts a small set of version-sensitive API shapes. Then it exits.
 *
 * WHY THIS EXISTS AT ALL. `module.json` declares `minimum: "13"`, and until this arm landed nothing
 * had ever booted Fabricate on 13: the smoke, the View Lab and CI all ran 14.365 exclusively. The
 * full walk in `scripts/foundry-test-run.mjs` takes ~32 minutes and pins Phase D0 selectors by
 * class, `.nth(N)` and visible button text — making THAT file version-aware would be a large,
 * open-ended triage. This arm deliberately buys the other thing: a ~5-minute answer to "is Fabricate
 * broken on V13?", which is the question that actually goes unanswered between releases.
 *
 * WHAT IT ASSERTS, AND WHY THOSE. Every check below is either a NON-VACUITY control or a shape that
 * the two supported generations are known to implement differently. EVERY ONE OF THEM IS A CHECK
 * SOME BUILD COULD FAIL — an observation no verdict rests on is reported under `reportedOnly`
 * instead, because a check that cannot fail is worse than no check: it buys confidence it has not
 * earned, and it inflates the pass count that a reader uses to judge coverage.
 *
 *   core-build          The container really is running the arm's Foundry. Without this a mis-set
 *                       FOUNDRY_IMAGE silently tests 14 twice and reports it as a V13 pass — which
 *                       is worse than no arm at all.
 *   fabricate-ready     The spine. `src/main.js`'s init/ready bodies are the module's highest
 *                       fan-out surface (settings, sheet registration, socket wiring, and hooks for
 *                       getCompendiumContextOptions, renderItemDirectory, updateItem,
 *                       updateSetting/createSetting, canvasReady, getSceneControlButtons,
 *                       renderTileHUD/renderTokenHUD, preCreateRegionBehavior, chatMessage). One
 *                       check, the broadest coverage in the arm.
 *   compendium-directory The PRECONDITION for the next check: the Compendium Directory rendered a
 *                       row for an Item pack and a row for a non-Item pack. Separate so a sidebar
 *                       that never rendered fails under a name that points at the sidebar.
 *   compendium-context  Fabricate's Compendium Directory entry is contributed in the MODERN
 *                       `{label, icon, visible, onClick}` shape, its `visible()` returns true for a
 *                       really-rendered Item pack row — which pins `data-pack` against the DOM the
 *                       running generation actually emits — and false for a non-Item row, without
 *                       which a `visible` returning a constant true would read as a pass.
 *   settings-round-trip A Fabricate WORLD setting survives set → get → restore.
 *   region-subtype      `fabricate.interactable`, the one sub-type `module.json` declares, is
 *                       registered in `game.documentTypes` and carries a data model.
 *   region-sheet        `DocumentSheetConfig.registerSheet` landed. V14.365 added a hard validation
 *                       throw that V13.351 does not have, so the two builds run different code here
 *                       and `assignInteractableConfigSheet` swallows failures by design — the only
 *                       way to know it worked is to look at where it should have landed.
 *   scene-control       The `fabricate` scene-control group is contributed WITHOUT an `activeTool`.
 *                       V13.351's `#prepareControls` does `this.#tools[name] ||= control.activeTool`
 *                       and leaves `undefined`; V14.365 falls back to `?? null`. The omission in
 *                       `src/ui/interactableSceneControl.js` exists to dodge a V13 double-icon bug,
 *                       so this asserts the mechanism rather than trusting the comment.
 *   app-renders         The Crafting System Manager opens and mounts. Cheapest broad UI signal.
 *
 * Reported only: which path `CompendiumCollection` resolves from. Both supported builds expose the
 * namespaced path AND the bare global, so any assertion over it would pass by construction.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never touches the canvas, creates no placeables, and adds no
 * console-error waiver keyed on a render-flag queue name. `Canvas##activateTicker` builds
 * `pendingRenderFlags` with two queues on 13.351 and three on 14.365, so a placeable created before
 * the first scene draw throws `reading 'OBJECTS'` on V13 and `reading 'INTERFACE'` on V14 — the same
 * defect under two names. Issue #1010 RETIRED that waiver from the smoke after it hid a real defect
 * for a year; an arm that reintroduced a variant of it would undo that. Anything needing a drawn
 * canvas belongs in the full walk, which already waits properly via `foundryCanvasReadiness.js`.
 *
 * Usage:
 *   npm run test:foundry:v13                        # up + this + down, on Foundry 13
 *   node scripts/foundry-test.mjs --arm=v14 --check=version
 *   node scripts/foundry-version-assert.mjs         # against an already-running container
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  acceptLicenseIfPresent,
  authenticateIfRequired,
  clearBlockingOverlays,
  createBootReporter,
  getPathname,
  joinWorldSession,
  launchWorld,
} from './lib/foundryBrowserBoot.js';
import { deriveRunIdentity, reconcileFoundryEndpoint } from './lib/foundryRunIdentity.js';
import { resolveSmokeArmFromEnv } from './lib/foundrySmokeArms.js';
import { TOUR_PROGRESS_STORAGE_KEY, withSuppressedTours } from './lib/foundryTourSuppression.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = join(ROOT, 'test-results');
const WORLD_ID = 'fabricate-smoke-ci';
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin';
const ARM = resolveSmokeArmFromEnv();

const FOUNDRY_URL = reconcileFoundryEndpoint({
  url: process.env.FOUNDRY_URL,
  hostPort: process.env.FOUNDRY_HOST_PORT,
  fallbackPort: deriveRunIdentity(ROOT).port,
}).url;

/**
 * Console-error waivers. Kept to one entry on purpose: this arm's whole value is that a NEW error on
 * an unexercised generation is loud. A `pageerror` is never waivable here.
 */
const WAIVED_CONSOLE_ERRORS = [/favicon/i];

/** A Fabricate WORLD setting with a constrained value set, used for the round-trip probe. */
const ROUND_TRIP_SETTING = Object.freeze({ namespace: 'fabricate', key: 'theme' });

/**
 * How long the Compendium Directory gets to render the pack rows `compendium-context` needs.
 *
 * Generous, because exceeding it is a real finding rather than a slow machine: the sidebar renders
 * during boot and the arm has already waited for `game.fabricate.ready` before asking.
 */
const COMPENDIUM_DIRECTORY_TIMEOUT_MS = 30_000;

function log(message) {
  process.stdout.write(message);
}

/**
 * Record every console error, page error and failing response for one page.
 *
 * @param {object} page Playwright page.
 */
function attachErrorCapture(page) {
  const consoleErrors = [];
  const waived = [];
  const pageErrors = [];
  const transcript = [];

  page.on('console', (message) => {
    const location = message.type() === 'error' ? message.location()?.url || '' : '';
    const text = location ? `${message.text()} (${location})` : message.text();
    transcript.push(`[${message.type()}] ${text}`);
    if (message.type() !== 'error') return;
    if (WAIVED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) waived.push(text);
    else consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.message ?? error));
    transcript.push(`[pageerror] ${error?.message ?? error}`);
    if (error?.stack) transcript.push(`[pageerror-stack] ${error.stack}`);
  });
  page.on('requestfailed', (request) => {
    transcript.push(`[requestfailed] ${request.url()} :: ${request.failure()?.errorText}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      transcript.push(`[response ${response.status()}] ${response.url()}`);
  });

  return { consoleErrors, waived, pageErrors, transcript };
}

/**
 * Stop Foundry's New User Experience tours ever starting.
 *
 * The value is computed HERE with the unit-tested `withSuppressedTours` and passed in whole, so the
 * page-side script is a bare `setItem`. `scripts/foundry-test-run.mjs` inlines the merge instead
 * because it reloads mid-run into a context that may already carry recorded progress; this arm
 * starts from a fresh browser context every time and has no progress to preserve, so a plain
 * overwrite is both correct and the version with nothing to keep in step.
 *
 * @param {object} context Playwright browser context.
 */
async function suppressTours(context) {
  await context.addInitScript(
    ({ key, value }) => {
      try {
        globalThis.localStorage.setItem(key, value);
      } catch {
        // A boot must never depend on localStorage being writable.
      }
    },
    { key: TOUR_PROGRESS_STORAGE_KEY, value: JSON.stringify(withSuppressedTours(null)) }
  );
}

/**
 * Bring the page to a joined, Fabricate-ready Gamemaster session.
 *
 * @param {object} page Playwright page.
 */
async function bootToReadyWorld(page) {
  const reporter = createBootReporter({ log });

  await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle', timeout: 120_000 });
  await acceptLicenseIfPresent(page, { reporter });
  await authenticateIfRequired(page, { adminKey: ADMIN_KEY, reporter });

  const path = getPathname(page.url());
  if (path !== '/join' && path !== '/game') {
    // Foundry's NUE starts a setup tour whose full-viewport `.tour-overlay` intercepts every click,
    // so a perfectly correct selector times out as "element is visible, enabled and stable" — which
    // reads as a missing control rather than a blocked one. The sweep lives HERE and not inside
    // `launchWorld`, because that function is the full smoke's own launch block moved verbatim and
    // must stay that way; the smoke has never needed the sweep.
    await page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 30_000 });
    const cleared = await clearBlockingOverlays(page);
    if (cleared.length > 0) log(`Cleared blocking setup overlays: ${cleared.join(', ')}\n`);
    await launchWorld(page, { worldId: WORLD_ID, foundryUrl: FOUNDRY_URL, reporter });
  }

  await joinWorldSession(page, { userLabel: 'Gamemaster', reporter });
  await page.waitForFunction(() => typeof game !== 'undefined' && game.ready === true, null, {
    timeout: 120_000,
  });
  await clearBlockingOverlays(page);

  const active = await page.evaluate(() => game.modules.get('fabricate')?.active === true);
  if (!active) {
    log('Fabricate module not active; enabling it and reloading...\n');
    await page.evaluate(async () => {
      const moduleSettings = game.settings.get('core', 'moduleConfiguration') || {};
      moduleSettings.fabricate = true;
      await game.settings.set('core', 'moduleConfiguration', moduleSettings);
    });
    await page.reload({ waitUntil: 'load', timeout: 60_000 });
    await joinWorldSession(page, { userLabel: 'Gamemaster', reporter });
    await page.waitForFunction(() => typeof game !== 'undefined' && game.ready === true, null, {
      timeout: 120_000,
    });
  }

  await page.waitForFunction(() => game.modules.get('fabricate')?.active === true, null, {
    timeout: 30_000,
  });
  await page.waitForFunction(() => globalThis.game?.fabricate?.ready === true, null, {
    timeout: 60_000,
  });
}

/**
 * Wait for the Compendium Directory to render the two pack rows the context-menu probe needs.
 *
 * WHY THIS IS ITS OWN STEP, WITH ITS OWN RESULT. `compendium-context` exercises Fabricate's
 * `visible()` against a really-rendered row, so it needs a row of each kind to exist. Reading the DOM
 * without waiting made a slow, unrendered or still-populating sidebar report `compendium-context:
 * FAIL` — i.e. "Fabricate is broken on V13" — and the arm's entire value is that a red result is
 * believable. `game.fabricate.ready` is the only gate before this, and that is a Fabricate signal,
 * not a sidebar-render one.
 *
 * So the precondition is waited for explicitly and reported under its OWN name: a directory that
 * never renders fails as `compendium-directory`, which sends the reader to the sidebar rather than
 * to `buildCompendiumImportContextOption`.
 *
 * A collapsed folder is not a problem — Foundry keeps every entry in the DOM and hides it with CSS,
 * and `visible()` reads `target.dataset.pack`, so DOM presence is exactly the right requirement.
 *
 * @param {object} page Playwright page.
 * @returns {Promise<{ready: boolean, rows: number, itemPackRows: number, nonItemPackRows: number}>}
 */
async function awaitCompendiumDirectory(page) {
  // Force a render rather than hoping one has already happened: the sidebar renders during boot,
  // but nothing the arm has waited on so far actually promises it finished.
  await page.evaluate(() => globalThis.ui?.compendium?.render?.(true)).catch(() => {});

  const hasBothPackKinds = () => {
    const kinds = [...document.querySelectorAll('[data-pack]')]
      .map((row) => globalThis.game?.packs?.get(row.dataset.pack)?.documentName)
      .filter(Boolean);
    return kinds.includes('Item') && kinds.some((kind) => kind !== 'Item');
  };

  let ready = true;
  try {
    await page.waitForFunction(hasBothPackKinds, null, {
      timeout: COMPENDIUM_DIRECTORY_TIMEOUT_MS,
      polling: 'raf',
    });
  } catch {
    // Fall through: the census below reports what WAS there, which is the useful half of a timeout.
    ready = false;
  }

  const census = await page.evaluate(() => {
    const kinds = [...document.querySelectorAll('[data-pack]')].map(
      (row) => globalThis.game?.packs?.get(row.dataset.pack)?.documentName ?? null
    );
    return {
      rows: kinds.length,
      itemPackRows: kinds.filter((kind) => kind === 'Item').length,
      nonItemPackRows: kinds.filter((kind) => kind && kind !== 'Item').length,
    };
  });

  return { ready, ...census };
}

/**
 * Read every version-sensitive shape in ONE page evaluation, returning plain data.
 *
 * Observation happens in the page; every verdict is reached in Node, below. That split is what makes
 * a failure readable: an assertion that lives inside `page.evaluate` reports as a rejected evaluate
 * with no record of what it saw.
 *
 * @param {object} page Playwright page.
 */
async function observeVersionSensitiveShapes(page) {
  return page.evaluate(
    async ({ settingNamespace, settingKey }) => {
      // Reported, NOT asserted. Both supported builds expose both paths, so a check on either would
      // be pass-by-construction — and a check that cannot fail is worse than no check, because it
      // buys confidence it has not earned. Recorded so a future build that moves the class shows the
      // move in the run record; the spine assertions and the console-error gate are what would
      // actually go red if Fabricate could no longer reach it.
      const compendiumCollectionPaths = [
        [
          'foundry.documents.collections',
          globalThis.foundry?.documents?.collections?.CompendiumCollection,
        ],
        ['globalThis', globalThis.CompendiumCollection],
      ];
      const resolvedPath =
        compendiumCollectionPaths.find(([, value]) => typeof value === 'function') ?? null;

      // The context-menu entry, contributed exactly the way core contributes it, then exercised
      // against a really-rendered Item pack row so `data-pack` is pinned to this build's DOM.
      const entries = [];
      globalThis.Hooks?.callAll?.(
        'getCompendiumContextOptions',
        globalThis.ui?.compendium,
        entries
      );
      const fabricateEntry =
        entries.find((entry) => String(entry?.icon ?? '').includes('fa-hammer')) ?? null;
      const renderedPackRows = [...document.querySelectorAll('[data-pack]')];
      const itemPackRow =
        renderedPackRows.find(
          (row) => globalThis.game?.packs?.get(row.dataset.pack)?.documentName === 'Item'
        ) ?? null;
      const nonItemPackRow =
        renderedPackRows.find(
          (row) =>
            globalThis.game?.packs?.get(row.dataset.pack) &&
            globalThis.game.packs.get(row.dataset.pack).documentName !== 'Item'
        ) ?? null;
      const originalTheme = globalThis.game?.settings?.get(settingNamespace, settingKey);
      const probeValue = originalTheme === 'sovereign' ? 'mythwright' : 'sovereign';
      await globalThis.game.settings.set(settingNamespace, settingKey, probeValue);
      const readBack = globalThis.game.settings.get(settingNamespace, settingKey);
      await globalThis.game.settings.set(settingNamespace, settingKey, originalTheme);
      const restored = globalThis.game.settings.get(settingNamespace, settingKey);

      const subtype = 'fabricate.interactable';
      const declaredTypes = globalThis.game?.documentTypes?.RegionBehavior ?? [];
      const sheetClasses = globalThis.CONFIG?.RegionBehavior?.sheetClasses?.[subtype] ?? {};

      const sceneControls = {};
      globalThis.Hooks?.callAll?.('getSceneControlButtons', sceneControls);
      const group = sceneControls.fabricate ?? null;

      return {
        core: {
          version: globalThis.game?.version ?? globalThis.game?.release?.version ?? null,
          generation: globalThis.game?.release?.generation ?? null,
        },
        fabricate: {
          moduleActive: globalThis.game?.modules?.get('fabricate')?.active === true,
          ready: globalThis.game?.fabricate?.ready === true,
          api: typeof globalThis.game?.fabricate?.api === 'object',
          craftingSystemManager:
            typeof globalThis.game?.fabricate?.getCraftingSystemManager === 'function',
          recipeManager: typeof globalThis.game?.fabricate?.getRecipeManager === 'function',
        },
        compendiumCollection: {
          availablePaths: compendiumCollectionPaths
            .filter(([, value]) => typeof value === 'function')
            .map(([path]) => path),
          resolvedFrom: resolvedPath?.[0] ?? null,
        },
        compendiumContext: {
          entryCount: entries.length,
          found: Boolean(fabricateEntry),
          modernShape:
            typeof fabricateEntry?.label === 'string' &&
            typeof fabricateEntry?.visible === 'function' &&
            typeof fabricateEntry?.onClick === 'function' &&
            fabricateEntry?.name === undefined &&
            fabricateEntry?.callback === undefined,
          renderedPackRows: renderedPackRows.length,
          itemPackId: itemPackRow?.dataset?.pack ?? null,
          visibleForItemPack: itemPackRow ? fabricateEntry?.visible?.(itemPackRow) === true : null,
          // The control: the same entry must REFUSE a pack that holds no Items. Without it,
          // `visible` returning a constant true would read as a pass.
          nonItemPackId: nonItemPackRow?.dataset?.pack ?? null,
          visibleForNonItemPack: nonItemPackRow
            ? fabricateEntry?.visible?.(nonItemPackRow) === true
            : null,
        },
        settingsRoundTrip: { originalTheme, probeValue, readBack, restored },
        regionSubtype: {
          declared: [...declaredTypes].includes(subtype),
          hasDataModel:
            typeof globalThis.CONFIG?.RegionBehavior?.dataModels?.[subtype] === 'function',
        },
        regionSheet: {
          registeredIds: Object.keys(sheetClasses),
          fabricateIds: Object.keys(sheetClasses).filter((id) => id.startsWith('fabricate')),
        },
        sceneControl: {
          contributedGroups: Object.keys(sceneControls),
          found: Boolean(group),
          // The V13 mechanism itself: a button-only group must declare no activeTool at all.
          declaresActiveTool: group ? Object.hasOwn(group, 'activeTool') : null,
          toolNames: group ? Object.keys(group.tools ?? {}) : [],
        },
      };
    },
    { settingNamespace: ROUND_TRIP_SETTING.namespace, settingKey: ROUND_TRIP_SETTING.key }
  );
}

/**
 * Open the Crafting System Manager, confirm it mounts, and close it again.
 *
 * @param {object} page Playwright page.
 */
async function observeManagerRender(page) {
  // No handle is kept on the page: the app is closed through its own window control, the same way
  // the full walk does it (`#fabricate-crafting-system-manager button[data-action="close"]`), so
  // nothing has to be stashed on a global.
  await page.evaluate(async () => {
    (await game.fabricate.api.loadCraftingSystemManagerAppClass()).show();
  });
  await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 30_000 });
  const detail = await page.evaluate(() => {
    const appWindow = document.querySelector('#fabricate-crafting-system-manager');
    const manager = appWindow?.querySelector('.fabricate-manager') ?? null;
    return {
      // The ApplicationV2 frame AND the Svelte root inside it: the frame alone proves the window
      // opened, the root proves the component tree actually mounted into it.
      appWindow: Boolean(appWindow?.isConnected),
      mounted: Boolean(manager?.isConnected),
      // Any interactive control, NOT `.manager-nav-button`. The smoke world starts with an empty
      // crafting-system library, so the manager renders its onboarding empty state and the nav rail
      // is legitimately absent — an earlier draft asserted on nav buttons and failed a perfectly
      // healthy V13 render for a reason that had nothing to do with the Foundry version.
      buttons: manager?.querySelectorAll('button').length ?? 0,
      navButtons: manager?.querySelectorAll('.manager-nav-button').length ?? 0,
      emptyState: Boolean(manager?.querySelector('.manager-empty')),
    };
  });
  await page
    .locator('#fabricate-crafting-system-manager button[data-action="close"]')
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  return detail;
}

/**
 * Turn observations into verdicts.
 *
 * @param {object} observation
 * @param {object} managerRender
 * @param {{ready: boolean, rows: number, itemPackRows: number, nonItemPackRows: number}} directory
 * @returns {Array<{ id: string, passed: boolean, detail: unknown }>}
 */
function evaluateAssertions(observation, managerRender, directory) {
  const context = observation.compendiumContext;
  const roundTrip = observation.settingsRoundTrip;
  return [
    {
      id: 'core-build',
      passed:
        observation.core.version === ARM.foundryVersion &&
        observation.core.generation === ARM.generation,
      detail: {
        expected: `${ARM.foundryVersion} (generation ${ARM.generation})`,
        ...observation.core,
      },
    },
    {
      id: 'fabricate-ready',
      passed: Object.values(observation.fabricate).every(Boolean),
      detail: observation.fabricate,
    },
    {
      // The PRECONDITION for compendium-context, named separately so its failure sends the reader
      // to the sidebar rather than to Fabricate's `visible()`.
      id: 'compendium-directory',
      passed: directory.ready,
      detail: directory.ready
        ? directory
        : {
            ...directory,
            why: `the Compendium Directory did not render both an Item pack row and a non-Item pack row within ${COMPENDIUM_DIRECTORY_TIMEOUT_MS}ms — compendium-context could not be exercised, and this is a sidebar problem, not a Fabricate one`,
          },
    },
    {
      id: 'compendium-context',
      passed:
        directory.ready &&
        context.found &&
        context.modernShape &&
        context.visibleForItemPack === true &&
        context.visibleForNonItemPack === false,
      detail: directory.ready ? context : { blockedBy: 'compendium-directory', ...context },
    },
    {
      id: 'settings-round-trip',
      passed:
        roundTrip.readBack === roundTrip.probeValue &&
        roundTrip.restored === roundTrip.originalTheme,
      detail: roundTrip,
    },
    {
      id: 'region-subtype',
      passed: observation.regionSubtype.declared && observation.regionSubtype.hasDataModel,
      detail: observation.regionSubtype,
    },
    {
      id: 'region-sheet',
      passed: observation.regionSheet.fabricateIds.length > 0,
      detail: observation.regionSheet,
    },
    {
      id: 'scene-control',
      passed:
        observation.sceneControl.found &&
        observation.sceneControl.declaresActiveTool === false &&
        observation.sceneControl.toolNames.length > 0,
      detail: observation.sceneControl,
    },
    {
      id: 'app-renders',
      passed: managerRender.appWindow && managerRender.mounted && managerRender.buttons > 0,
      detail: managerRender,
    },
  ];
}

function formatAssertionTable(assertions) {
  const width = Math.max(...assertions.map((assertion) => assertion.id.length));
  return assertions
    .map(
      (assertion) =>
        `  ${assertion.passed ? 'PASS' : 'FAIL'}  ${assertion.id.padEnd(width)}  ` +
        JSON.stringify(assertion.detail)
    )
    .join('\n');
}

async function main() {
  log(
    `Foundry version arm: ${ARM.id} — expecting Foundry ${ARM.foundryVersion} at ${FOUNDRY_URL}\n`
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await suppressTours(context);
  const page = await context.newPage();
  const captured = attachErrorCapture(page);

  /** @type {Array<{ id: string, passed: boolean, detail: unknown }>} */
  let assertions = [];
  /** Observed, reported, and NOT asserted — see `compendiumCollection` in the page evaluation. */
  let reportedOnly = null;
  let failure = null;
  try {
    await bootToReadyWorld(page);
    const directory = await awaitCompendiumDirectory(page);
    const observation = await observeVersionSensitiveShapes(page);
    const managerRender = await observeManagerRender(page);
    assertions = evaluateAssertions(observation, managerRender, directory);
    reportedOnly = { compendiumCollection: observation.compendiumCollection };
  } catch (error) {
    failure = error?.message ?? String(error);
    await page
      .screenshot({ path: join(RESULTS_DIR, `version-arm-${ARM.id}-failure.png`) })
      .catch(() => {});
  }

  const failedAssertions = assertions.filter((assertion) => !assertion.passed);
  const passed =
    failure === null &&
    assertions.length > 0 &&
    failedAssertions.length === 0 &&
    captured.pageErrors.length === 0 &&
    captured.consoleErrors.length === 0;

  const summary = {
    arm: ARM.id,
    expectedFoundryVersion: ARM.foundryVersion,
    image: ARM.image,
    passed,
    failure,
    assertions,
    // Compatibility observations that no verdict rests on. Kept OUT of `assertions` so the pass
    // count means what it says: every entry there is a check some build could fail.
    reportedOnly,
    pageErrors: captured.pageErrors,
    consoleErrors: captured.consoleErrors,
    waivedConsoleErrors: captured.waived,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    join(RESULTS_DIR, `version-arm-${ARM.id}.json`),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  await writeFile(
    join(RESULTS_DIR, `version-arm-${ARM.id}-console.log`),
    `${captured.transcript.join('\n')}\n`
  );

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  if (assertions.length > 0) log(`${formatAssertionTable(assertions)}\n`);
  if (reportedOnly) log(`  ----  reported only        ${JSON.stringify(reportedOnly)}\n`);
  if (failure) log(`Boot failure: ${failure}\n`);
  for (const error of captured.pageErrors) log(`pageerror: ${error}\n`);
  for (const error of captured.consoleErrors) log(`console error: ${error}\n`);
  log(
    `Version arm ${ARM.id}: ${passed ? 'PASSED' : 'FAILED'} (test-results/version-arm-${ARM.id}.json)\n`
  );

  if (!passed) process.exit(1);
}

await main();
