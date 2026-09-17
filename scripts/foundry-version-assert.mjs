/** The narrow boot-and-assert arm (issue #1088). */

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

/** How long the Compendium Directory gets to render the pack rows `compendium-context` needs. */
const COMPENDIUM_DIRECTORY_TIMEOUT_MS = 30_000;

function log(message) {
  process.stdout.write(message);
}

/** Record every console error, page error and failing response for one page. */
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

/** Stop Foundry's New User Experience tours ever starting. */
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

/** Bring the page to a joined, Fabricate-ready Gamemaster session. */
async function bootToReadyWorld(page) {
  const reporter = createBootReporter({ log });

  await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle', timeout: 120_000 });
  await acceptLicenseIfPresent(page, { reporter });
  await authenticateIfRequired(page, { adminKey: ADMIN_KEY, reporter });

  const path = getPathname(page.url());
  if (path !== '/join' && path !== '/game') {
    // Foundry's nue starts a setup tour whose full-viewport `.tour-overlay` intercepts every click,
    // so a perfectly correct selector times out as "element is visible, enabled and stable" — which
    // reads as a missing control rather than a blocked one.
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

/** Wait for the Compendium Directory to render the two pack rows the context-menu probe needs. */
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

/** Read every version-sensitive shape in one page evaluation, returning plain data. */
async function observeVersionSensitiveShapes(page) {
  return page.evaluate(
    async ({ settingNamespace, settingKey }) => {
      // Reported, not asserted.
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

/** Open the Crafting System Manager, confirm it mounts, and close it again. */
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
      // Any interactive control, not `.manager-nav-button`.
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

/** Turn observations into verdicts. */
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
