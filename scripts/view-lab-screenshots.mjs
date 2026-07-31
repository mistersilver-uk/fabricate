#!/usr/bin/env node
/**
 * Fabricate View Lab capture driver.
 *
 * Renders Fabricate application windows in a real Chromium over the real Foundry window chrome
 * (harvested locally; see `scripts/lib/foundryChromeCache.js`) and writes one PNG per case.
 *
 * Deliberately a plain `playwright` library script rather than a `@playwright/test` suite, and
 * deliberately outside the `npm test` glob: browser flake must never surface as `# cancelled`
 * in the main suite.
 *
 * Commands:
 *   chrome    capture the empty window chrome for every app - the fidelity baseline
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import { APP_CHROME, APP_CHROME_IDS, minimumViewportFor } from './lib/foundryChromeSpec.js';
import { publishableCases } from './lib/viewLabCases.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_DIR = join(ROOT, 'ui-screenshot-artifact');
const MOUNT_PATH = '/tests/view-lab/index.html';

/**
 * Byte-identical to the live smoke's context (`scripts/foundry-test-run.mjs`), so a lab frame and
 * a smoke frame are comparable without a mental correction. 1080px of viewport also clears the
 * `.application` max-height ceiling for both windows - see `minimumViewportFor`.
 */
const BROWSER_CONTEXT = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
};

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--force-color-profile=srgb'];
const READY_TIMEOUT_MS = 20_000;

/**
 * Vite is loaded through an indirect specifier so that neither a static nor a literal dynamic
 * import appears in the source. `eslint-plugin-import-x` builds an export map for every resolved
 * specifier before any rule filtering, and it crashes outright on Vite's exports map ("node with
 * invalid interface loaded as resolver") — an `eslint-disable` comment does not help, because the
 * crash happens before rules run. Keeping the specifier opaque is what keeps this file inside the
 * `npm run lint` gate instead of parked in KNOWN_UNGATED_SCRIPTS. Vite is only needed when a
 * capture actually runs, so the lazy load is honest on its own terms too.
 */
const VITE_SPECIFIER = 'vite';

function ensureChrome() {
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new Error(missingChromeMessage(ROOT));
  return cache;
}

function assertViewportFits() {
  for (const appId of APP_CHROME_IDS) {
    const minimum = minimumViewportFor(appId);
    if (
      BROWSER_CONTEXT.viewport.height >= minimum.height &&
      BROWSER_CONTEXT.viewport.width >= minimum.width
    )
      continue;
    throw new Error(
      `viewport ${BROWSER_CONTEXT.viewport.width}x${BROWSER_CONTEXT.viewport.height} is too small for ${appId}: ` +
        `Foundry clamps .application to the viewport minus 1.5x the hotbar, so it needs at least ` +
        `${minimum.width}x${minimum.height}.`
    );
  }
}

async function startLabServer() {
  const { createServer } = await import(VITE_SPECIFIER);
  const server = await createServer({ configFile: join(ROOT, 'tests/view-lab/vite.config.js') });
  await server.listen();
  const port = server.config.server.port;
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/**
 * Drive a case to its named view state.
 *
 * The manager's route (`activeView`) is component-local `$state` — not a prop, and not in
 * `adminStore` — so there is no parameter that reaches it. Clicking is the only mechanism, which is
 * exactly how the live smoke reaches those views too. Steps are matched by accessible name so they
 * read as what a user does, and a step that matches nothing fails loudly rather than silently
 * capturing the wrong screen.
 *
 * @param {import('playwright').Page} page The lab page.
 * @param {string[]} steps Accessible names to click, in order.
 * @param {string} label Case label, for error messages.
 */
async function runSteps(page, steps, label) {
  for (const step of steps) {
    // A `{selector}` step clicks a stable element id — preferred wherever the UI offers one, since
    // it survives a label change. A string step is a rail entry matched by its label.
    if (typeof step === 'object') {
      const element = page.locator(step.selector);
      if ((await element.count()) === 0) {
        throw new Error(
          `${label}: nothing matches "${step.selector}" — the case cannot reach its view state`
        );
      }
      await element.first().click();
      await page.evaluate(() => globalThis.__FABRICATE_VIEW__.settle());
      continue;
    }

    const selector = '.manager-nav-button';
    const name = step;

    // Scoped and exact-prefixed, deliberately. A loose `getByRole('button', {name, exact: false})`
    // matched the "Crafting Systems" BREADCRUMB before the rail's "Crafting" entry, so the case
    // clicked its way back to the systems browser and captured that instead — green run, wrong
    // screen. Rail buttons render as "<Label> <count>", hence the prefix match rather than equality.
    // `hasText` matches raw textContent, which carries the markup's own indentation — hence the
    // leading `\s*`. The trailing `(\s|$)` is what keeps "Crafting" off "Crafting Systems".
    const matches = page
      .locator(selector)
      .filter({ hasText: new RegExp(String.raw`^\s*${escapeForRegExp(name)}(\s|$)`) });
    const count = await matches.count();
    if (count === 0) {
      const available = await page.locator(selector).allInnerTexts();
      throw new Error(
        `${label}: no "${selector}" element labelled "${name}" — the case cannot reach its view state.\n` +
          `  available: ${available.map((text) => JSON.stringify(text.replaceAll(/\s+/g, ' ').trim())).join(', ')}`
      );
    }
    await matches.first().click();
    await page.evaluate(() => globalThis.__FABRICATE_VIEW__.settle());
  }
}

function escapeForRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

async function renderPage(
  browser,
  baseUrl,
  { appId, query, label, steps = [], expectView = null }
) {
  const context = await browser.newContext(BROWSER_CONTEXT);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error?.message ?? error));
  });
  // A bare "Failed to load resource: 404" from the console names nothing, which makes a missing
  // asset one of the slowest things here to diagnose. Record the URL and the element that asked.
  page.on('response', (response) => {
    if (response.status() < 400) return;
    consoleErrors.push(
      `${response.status()} ${response.request().resourceType()} ${response.url()}`
    );
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  try {
    const search = new URLSearchParams({ app: appId, ...query }).toString();
    await page.goto(`${baseUrl}${MOUNT_PATH}?${search}`, { waitUntil: 'load' });
    // These two callbacks are serialized into the PAGE, not run here, so they reach for
    // `globalThis.document` - the Node lint scope has no `document` binding.
    await page.waitForFunction(
      () => {
        const { viewLabReady, viewLabError } = globalThis.document.body.dataset;
        return viewLabReady !== undefined || viewLabError !== undefined;
      },
      { timeout: READY_TIMEOUT_MS }
    );
    const failure = await page.evaluate(
      () => globalThis.document.body.dataset.viewLabError ?? null
    );
    if (failure) throw new Error(`${label}: ${failure}`);

    if (steps.length > 0) await runSteps(page, steps, label);

    // The hard gate against the failure this harness is most exposed to: a step that clicks
    // something, changes nothing, and captures whichever screen happened to be showing. The manager
    // publishes its route on the root element, so the case can state which screen it expects and be
    // held to it. Found the hard way — a loose text match hit the "Crafting Systems" breadcrumb and
    // the recipes case quietly captured the systems browser instead.
    if (expectView) {
      const actual = await page.evaluate(
        () => globalThis.document.querySelector('.fabricate-manager')?.dataset.managerView ?? null
      );
      if (actual !== expectView) {
        throw new Error(
          `${label}: expected the manager to be on "${expectView}" after its steps, but it is on ` +
            `"${actual}". The capture would have shown the wrong screen.`
        );
      }
    }

    const frame = page.locator(`[data-view-lab-frame="${appId}"]`);
    const buffer = await frame.screenshot({ animations: 'disabled', caret: 'hide' });
    const box = await frame.boundingBox();
    if (consoleErrors.length > 0) {
      throw new Error(`${label}: console errors during render:\n  ${consoleErrors.join('\n  ')}`);
    }
    return { buffer, box };
  } finally {
    await context.close();
  }
}

async function commandChrome() {
  const cache = ensureChrome();
  assertViewportFits();
  console.log(`using harvested Foundry ${cache.version} chrome`);

  const outputDir = join(ARTIFACT_DIR, 'chrome-baseline');
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const server = await startLabServer();
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  const rendered = [];
  try {
    for (const appId of APP_CHROME_IDS) {
      const label = `chrome:${appId}`;
      const { buffer, box } = await renderPage(browser, server.baseUrl, {
        appId,
        query: { chromeOnly: '1', case: label },
        label,
      });
      const file = `${appId}.png`;
      writeFileSync(join(outputDir, file), buffer);
      const declared = APP_CHROME[appId].position;
      rendered.push({
        appId,
        file,
        declared,
        rendered: { width: Math.round(box.width), height: Math.round(box.height) },
      });
      console.log(
        `  ${file}  ${Math.round(box.width)}x${Math.round(box.height)} (declared ${declared.width}x${declared.height})`
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }

  writeFileSync(
    join(outputDir, 'manifest.json'),
    `${JSON.stringify({ foundryVersion: cache.version, frames: rendered }, null, 2)}\n`
  );
  console.log(
    `wrote ${rendered.length} chrome baseline frames to ui-screenshot-artifact/chrome-baseline/`
  );
  return 0;
}

/**
 * The window states captured with real content. Each entry is one PNG.
 *
 * `tab` drives the player app's nav rail; the manager's own routing is component-local `$state`
 * and is reached by interaction rather than by parameter, so its entries land on the default route
 * until the case registry lands.
 */
/** Lab fixture system id -> the smoke system that carries the same capability. */
const SMOKE_SYSTEM_FOR = Object.freeze({
  'lab-alchemy': 'Warded Athenaeum',
  'lab-herbalism': "The Herbalist's Compendium",
  'lab-smithing': 'Smoke Simple Forge',
  'lab-jewelry': 'Smoke Ingredient Router',
  'lab-runework': 'Smoke Check Router',
});

const APP_CASES = publishableCases();

async function commandApps() {
  const cache = ensureChrome();
  assertViewportFits();
  console.log(`using harvested Foundry ${cache.version} chrome`);

  // `--smoke-fixtures` replays the live smoke's own crafting seed instead of the compact lab
  // fixture, so a frame differs from its smoke counterpart in nothing but the chrome around it.
  const smokeFixtures = process.argv.includes('--smoke-fixtures');
  const positional = process.argv.slice(3).find((a) => !a.startsWith('--'));

  const outputDir = join(ARTIFACT_DIR, smokeFixtures ? 'apps-smoke-data' : 'apps');
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const only = positional ? new Set(positional.split(',')) : null;
  const cases = only ? APP_CASES.filter((entry) => only.has(entry.id)) : APP_CASES;

  const server = await startLabServer();
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  const rendered = [];
  const failures = [];
  try {
    for (const viewCase of cases) {
      try {
        const { buffer, box } = await renderPage(browser, server.baseUrl, {
          appId: viewCase.app,
          query: {
            ...viewCase.query,
            case: viewCase.id,
            ...(smokeFixtures && { smokeFixtures: '1' }),
            // The lab fixture's system ids do not exist under the smoke seed, so a case that seeds
            // one is remapped to the smoke system carrying the same capability — the Access rail
            // exists only for a restricted-visibility system, which is the Warded Athenaeum.
            ...(smokeFixtures &&
              viewCase.query?.system && {
                system: SMOKE_SYSTEM_FOR[viewCase.query.system] ?? viewCase.query.system,
              }),
            ...(viewCase.position && {
              w: String(viewCase.position.width),
              h: String(viewCase.position.height),
            }),
          },
          label: viewCase.id,
          steps: viewCase.steps ?? [],
          expectView: viewCase.expectView ?? null,
        });
        writeFileSync(join(outputDir, `${viewCase.id}.png`), buffer);
        rendered.push({
          id: viewCase.id,
          app: viewCase.app,
          width: Math.round(box.width),
          height: Math.round(box.height),
        });
        console.log(
          `  ok    ${viewCase.id}.png  ${Math.round(box.width)}x${Math.round(box.height)}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ id: viewCase.id, message });
        console.log(`  FAIL  ${viewCase.id}: ${message.split('\n', 1)[0]}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  writeFileSync(
    join(outputDir, 'manifest.json'),
    `${JSON.stringify({ foundryVersion: cache.version, frames: rendered, failures }, null, 2)}\n`
  );
  console.log(
    `\n${rendered.length}/${cases.length} frames captured to ui-screenshot-artifact/apps/`
  );
  if (failures.length > 0) {
    console.log('\nfailures:');
    for (const failure of failures) console.log(`\n--- ${failure.id} ---\n${failure.message}`);
  }
  return failures.length === 0 ? 0 : 1;
}

const COMMANDS = { chrome: commandChrome, apps: commandApps };

const requested = process.argv[2] ?? 'chrome';
const command = COMMANDS[requested];
if (command) {
  try {
    process.exitCode = await command();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  console.error(
    `unknown command "${requested}"; expected one of ${Object.keys(COMMANDS).join(', ')}`
  );
  process.exitCode = 1;
}
