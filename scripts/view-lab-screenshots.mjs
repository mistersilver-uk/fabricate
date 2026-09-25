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
 * A CHANGE TO THIS FILE SELECTS SURFACE COVERAGE — one frame of every route and tab the lab
 * renders, not one region of it — and that is a decision rather than an oversight (issue 1049).
 * Three of the lab's other inputs are narrowed from their own diff — the case registry per case
 * literal, `labActors.js` per fixture table, `mount.js` per marked region — and the obvious next
 * move is to narrow this one too, on the grounds that argument parsing and the step vocabulary
 * cannot change a pixel while the render path can. That distinction is not drawable from a diff of this module. `runSteps`' verb table,
 * `assertViewportFits`, the console-error gate, the readiness wait and the `frame.screenshot()`
 * call are interleaved here, and `commandApps` reads `process.argv` and drives the render in the
 * same function — so a region map over this file would have to cut through the middle of a
 * function, and a wrong cut fails in the silent direction: a run that photographs frames its own
 * driver just changed and publishes them as unaffected. The narrowings that do exist are the ones
 * whose regions are declarative data with a readership that can be read off the render path; this
 * file is neither.
 *
 * Coverage rather than the whole corpus is the OTHER half of that decision (`LAB_SURFACE_CASES` in
 * `scripts/lib/viewLabCases.js`). What a change to this driver has to prove is that the driver
 * still drives: that both windows still mount, every route and tab is still reachable, and a frame
 * is still written for every surface. Re-photographing all 246 states to establish that bought a
 * twenty-five minute job and a wall of frames nobody read.
 *
 * Commands:
 *   chrome    capture the empty window chrome for every app - the fidelity baseline
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import { APP_CHROME, APP_CHROME_IDS, minimumViewportFor } from './lib/foundryChromeSpec.js';
import { partitionConsoleErrors, publishableCases } from './lib/viewLabCases.js';
import { groupFrames, renderIndexHtml, summarise } from './lib/viewLabIndex.js';
import { assertViewLabLayout } from './lib/viewLabLayoutAssertion.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_DIR = join(ROOT, 'ui-screenshot-artifact');
const MOUNT_PATH = '/tests/view-lab/index.html';

/**
 * Byte-identical to the live smoke's context (`scripts/foundry-test-run.mjs`), so a lab frame and a
 * smoke frame are comparable without a mental correction.
 */
const BROWSER_CONTEXT = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
};

/**
 * Fabricate warnings that describe the lab's environment rather than a defect in what it renders.
 */
const TOLERATED_WARNINGS = [
  // The lab declares module version `0.0.0-viewlab`, which cannot satisfy the Item Piles minimum.
  /Item Piles integration: version .* does not meet minimum/,
  // The `1.30.0` world-scope migration's own completion notice
  // (`src/systems/worldScopeEntityNotice.js`), reporting what it created and merged.
  /Fabricate gave this world one shared record per component, essence and tool/,
  // The Valid Id Basis fail-safe declining to prune. This is the safety behaviour working: the two
  // component-keyed passes are withheld and, as the message says itself, nothing is removed.
  /Startup cleanup skipped: the ids it would prune against are not known to be complete/,
];

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--force-color-profile=srgb'];
const READY_TIMEOUT_MS = 20_000;
// Playwright's default `page.goto` timeout is 30s, and that is not enough for the first navigation
// against a cold Vite server: the dep optimiser has to build the lab's whole module graph before it
// serves anything, measured at ~90s in a fresh checkout.
const NAVIGATION_TIMEOUT_MS = 150_000;

/**
 * Vite is loaded through an indirect specifier so that neither a static nor a literal dynamic
 * import appears in the source. `eslint-plugin-import-x` builds an export map for every resolved
 * specifier before any rule filtering, and it crashes outright on Vite's exports map ("node with
 * invalid interface loaded as resolver") — an `eslint-disable` comment does not help, because the
 * crash happens before rules run. Keeping the specifier opaque is what keeps this file inside the
 * `npm run lint` gate, which since issue #1660 it is. Vite is only needed when a
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

/** The click modifiers Playwright accepts. */
const CLICK_MODIFIERS = ['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'];
const PRESS_KEYS = ['Enter', 'Space'];

/** The verbs a `modifiers` step may not carry. */
const MODIFIER_INCOMPATIBLE_VERBS = ['select', 'fill', 'upload', 'scroll', 'press'];

/** Drive a case to its named view state. */
async function runSteps(page, steps, label, scratch) {
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
      const target = element.first();

      // `modifiers` is a modifier on the click, not a sixth verb: it does not choose which action
      // runs, it changes how the default one runs.
      const modifiers = 'modifiers' in step ? [step.modifiers].flat() : null;
      if (modifiers) {
        // A modifier paired with a non-click verb would be dropped without a word, and the case
        // would capture the UNMODIFIED state under its own name — a frame of the wrong state,
        // published as evidence of the right one. Split such a step into two instead.
        const paired = MODIFIER_INCOMPATIBLE_VERBS.filter((verb) => verb in step);
        if (paired.length > 0) {
          throw new Error(
            `${label}: step for "${step.selector}" pairs \`modifiers\` with \`${paired.join('`, `')}\` — ` +
              `a modifier only applies to a click, so it would be silently dropped and the case ` +
              `would publish a frame of the unmodified state. Split it into two steps.`
          );
        }
        const unknown = modifiers.filter((name) => !CLICK_MODIFIERS.includes(name));
        if (unknown.length > 0) {
          throw new Error(
            `${label}: step for "${step.selector}" names unknown modifier(s) ` +
              `${unknown.map((name) => JSON.stringify(name)).join(', ')} — ` +
              `Playwright accepts ${CLICK_MODIFIERS.join(', ')}`
          );
        }
      }

      // Six verbs, because a click alone cannot reach every state the smoke photographs.
      if ('select' in step) {
        // A `<select>` whose chosen value changes the screen — the system currency strategy picker
        // and the recipe category filter both work this way.
        await target.selectOption(step.select);
      } else if ('fill' in step) {
        // Typed input. The only route to a DIRTY form: `data-system-details-dirty` appears on an
        // `input` event, so no click reaches it.
        await target.fill(step.fill);
      } else if ('upload' in step) {
        // A native `<input type="file">`.
        const payload = join(scratch, `${label}.json`);
        writeFileSync(payload, step.upload);
        await target.setInputFiles(payload);
      } else if (step.scroll) {
        // Element exists but sits below an inner panel's fold.
        await target.scrollIntoViewIfNeeded();
      } else if ('press' in step) {
        if (!PRESS_KEYS.includes(step.press)) {
          throw new Error(
            `${label}: step for "${step.selector}" names unknown key ${JSON.stringify(step.press)} — ` +
              `press accepts ${PRESS_KEYS.join(', ')}`
          );
        }
        await target.press(step.press);
      } else {
        await target.click(modifiers ? { modifiers } : {});
      }

      await page.evaluate(() => globalThis.__FABRICATE_VIEW__.settle());
      continue;
    }

    const selector = '.manager-nav-button';
    const name = step;

    // Scoped and exact-prefixed, deliberately.
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

/**
 * Navigate a throwaway page once so Vite's dependency optimiser builds the lab's module graph
 * before any case is timed.
 */
async function warmUpLabServer(browser, baseUrl) {
  const context = await browser.newContext(BROWSER_CONTEXT);
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}${MOUNT_PATH}`, {
      waitUntil: 'load',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
  } catch {
    // Intentionally ignored — see above.
  } finally {
    await context.close();
  }
}

async function renderPage(
  browser,
  baseUrl,
  {
    appId,
    query,
    label,
    steps = [],
    expectView = null,
    expectTab = null,
    expectSelector = null,
    expectLayout = null,
    expectAttributes = [],
    expectVisible = null,
    expectContained = [],
    expectCenterHit = null,
    expectClick = null,
    expectNoHorizontalOverflow = null,
    expectOverflowY = null,
    expectScrollable = null,
    // The console errors this case declares it produces, as patterns.
    allowedConsoleErrors = [],
  }
) {
  const context = await browser.newContext(BROWSER_CONTEXT);
  // Every wait in this harness, not only the ones that name a timeout: against a cold Vite server
  // the dep optimiser rebuilds the lab's module graph before it serves anything, so the first
  // case's readiness wait blows Playwright's 30s default long before the page is able to answer.
  context.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
  const page = await context.newPage();
  // `mkdtemp` rather than a fixed name in `tmpdir()`: the old path was predictable, and a harness
  // that writes a predictable path in a shared directory is a symlink-swap away from writing
  // somewhere else. It costs one call to not have that property.
  const scratch = mkdtempSync(join(tmpdir(), 'view-lab-'));
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
      return;
    }
    // Fabricate's own warnings are fatal here. Not Foundry's, not Vite's, not a dependency's —
    // Fabricate's, which are prefixed `Fabricate |` by convention.
    if (
      message.type() === 'warning' &&
      message.text().includes('Fabricate |') &&
      TOLERATED_WARNINGS.every((pattern) => !pattern.test(message.text()))
    ) {
      consoleErrors.push(`warning: ${message.text()}`);
    }
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
    await page.goto(`${baseUrl}${MOUNT_PATH}?${search}`, {
      waitUntil: 'load',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
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

    if (steps.length > 0) await runSteps(page, steps, label, scratch);

    // The hard gate against the failure this harness is most exposed to: a step that clicks
    // something, changes nothing, and captures whichever screen happened to be showing.
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

    // The same gate for the player window, which had none.
    if (expectTab) {
      const actual = await page.evaluate(
        () => globalThis.document.querySelector('.fabricate-app-shell')?.dataset.activeTab ?? null
      );
      if (actual !== expectTab) {
        throw new Error(
          `${label}: expected the player app to be on the "${expectTab}" tab after its steps, but ` +
            `it is on "${actual}". The capture would have shown the wrong tab.`
        );
      }
    }

    // `expectView` and `expectTab` gate the route, and a route survives everything that happens on
    // top of it: a modal that never opened, a dialog that was dismissed, an inspector that stayed
    // collapsed.
    if (expectSelector) {
      const present = (await page.locator(expectSelector).count()) > 0;
      if (!present) {
        throw new Error(
          `${label}: expected "${expectSelector}" to be present after its steps, and it is not. ` +
            `The route is right, so the capture would have shown the screen UNDERNEATH the state ` +
            `this case is named for.`
        );
      }
    }

    for (const expectation of expectAttributes) {
      const actual = await page.locator(expectation.selector).getAttribute(expectation.name);
      if (actual !== expectation.value) {
        throw new Error(
          `${label}: expected ${expectation.selector} ${expectation.name}="${expectation.value}", got "${actual}".`
        );
      }
    }

    if (expectVisible) {
      const visible = await page.locator(expectVisible).isVisible();
      if (!visible) throw new Error(`${label}: expected ${expectVisible} to be visibly rendered.`);
    }

    for (const expectation of expectContained) {
      const contained = await page.evaluate(({ container, target }) => {
        const outer = globalThis.document.querySelector(container);
        const inner = globalThis.document.querySelector(target);
        if (!outer || !inner) return false;
        const outerBox = outer.getBoundingClientRect();
        const innerBox = inner.getBoundingClientRect();
        return (
          innerBox.width > 0 &&
          innerBox.height > 0 &&
          innerBox.left >= outerBox.left &&
          innerBox.right <= outerBox.right &&
          innerBox.top >= outerBox.top &&
          innerBox.bottom <= outerBox.bottom
        );
      }, expectation);
      if (!contained) {
        throw new Error(
          `${label}: ${expectation.target} is clipped or extends outside ${expectation.container}.`
        );
      }
    }

    if (expectCenterHit) {
      const hit = await page.evaluate((selector) => {
        const element = globalThis.document.querySelector(selector);
        if (!element) return false;
        const box = element.getBoundingClientRect();
        const target = globalThis.document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2
        );
        return target === element || element.contains(target);
      }, expectCenterHit);
      if (!hit)
        throw new Error(`${label}: ${expectCenterHit} does not own its centre pointer target.`);
    }

    if (expectClick) {
      const clickTarget = page.locator(expectClick);
      await clickTarget.evaluate((element) => {
        element.dataset.viewLabPointerClicks = '0';
        element.addEventListener('click', (event) => {
          event.preventDefault();
          element.dataset.viewLabPointerClicks = String(
            Number(element.dataset.viewLabPointerClicks) + 1
          );
        });
      });
      await clickTarget.click();
      const clicked = await clickTarget.evaluate((element) => {
        return element.dataset.viewLabPointerClicks === '1';
      });
      if (!clicked) throw new Error(`${label}: ${expectClick} did not accept an actual click.`);
    }

    if (expectNoHorizontalOverflow) {
      const selectors = Array.isArray(expectNoHorizontalOverflow)
        ? expectNoHorizontalOverflow
        : [expectNoHorizontalOverflow];
      for (const selector of selectors) {
        const overflows = await page
          .locator(selector)
          .evaluate((element) => element.scrollWidth > element.clientWidth + 1);
        if (overflows) throw new Error(`${label}: ${selector} overflows horizontally.`);
      }
    }

    if (expectScrollable) {
      const scrollable = await page.locator(expectScrollable).evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        return /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
      });
      if (!scrollable)
        throw new Error(`${label}: ${expectScrollable} is not vertically scrollable.`);
    }

    if (expectOverflowY) {
      const ownsVerticalOverflow = await page.locator(expectOverflowY).evaluate((element) => {
        return /auto|scroll/.test(globalThis.getComputedStyle(element).overflowY);
      });
      if (!ownsVerticalOverflow)
        throw new Error(`${label}: ${expectOverflowY} does not own vertical overflow.`);
    }

    await assertViewLabLayout(page, expectLayout, label);

    const frame = page.locator(`[data-view-lab-frame="${appId}"]`);
    const buffer = await frame.screenshot({ animations: 'disabled', caret: 'hide' });
    const box = await frame.boundingBox();
    const { unmatched, unusedAllowances } = partitionConsoleErrors(
      consoleErrors,
      allowedConsoleErrors
    );
    if (unmatched.length > 0) {
      throw new Error(`${label}: console errors during render:\n  ${unmatched.join('\n  ')}`);
    }
    // A declared error that never arrived fails the case.
    if (unusedAllowances.length > 0) {
      throw new Error(
        `${label}: declared allowedConsoleErrors that never matched:\n  ` +
          `${unusedAllowances.join('\n  ')}\n` +
          'the case no longer reaches the refusal it is named for, or the message was reworded.'
      );
    }
    return { buffer, box };
  } finally {
    await context.close();
    rmSync(scratch, { recursive: true, force: true });
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

/** The window states captured with real content. Each entry is one PNG. */
const APP_CASES = publishableCases();

/** The commit each frame was captured at, so a stale one is identifiable. */
function currentHead() {
  // Read `.git` directly rather than shelling out to `git rev-parse`.
  try {
    const dirs = resolveGitDirs();
    if (!dirs) return null;

    const head = readFileSync(join(dirs.gitDir, 'HEAD'), 'utf8').trim();
    const ref = /^ref:\s*(.+)$/.exec(head);
    if (!ref) return head.slice(0, 8);

    // Per-worktree refs (`refs/bisect`, `refs/worktree`) live in the worktree gitdir; everything
    // else — including `refs/heads` — lives in the common dir shared with the main checkout.
    for (const base of [dirs.gitDir, dirs.commonDir]) {
      const refPath = join(base, ref[1]);
      if (existsSync(refPath)) return readFileSync(refPath, 'utf8').trim().slice(0, 8);
    }

    // A packed ref — the loose file is absent once `git gc` has run.
    const packed = readFileSync(join(dirs.commonDir, 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((entry) => entry.endsWith(` ${ref[1]}`));
    return line ? line.slice(0, 8) : null;
  } catch {
    return null;
  }
}

/** The git directory pair for this checkout. */
function resolveGitDirs() {
  const dotGit = join(ROOT, '.git');
  if (!existsSync(dotGit)) return null;

  let gitDir = dotGit;
  if (statSync(dotGit).isFile()) {
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'));
    if (!pointer) return null;
    gitDir = resolve(ROOT, pointer[1].trim());
  }

  const commonPath = join(gitDir, 'commondir');
  const commonDir = existsSync(commonPath)
    ? resolve(gitDir, readFileSync(commonPath, 'utf8').trim())
    : gitDir;
  return { gitDir, commonDir };
}

/** The manifest already on disk, or an empty one. */
function readManifest(outputDir) {
  const path = join(outputDir, 'manifest.json');
  if (!existsSync(path)) return { frames: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return { frames: Array.isArray(parsed.frames) ? parsed.frames : [] };
  } catch {
    // A truncated manifest means an interrupted run. Treat it as absent rather than half-trusting
    // it — the PNGs are still on disk and the next full capture rebuilds the record.
    return { frames: [] };
  }
}

/** Merge this run's frames over the previous set, keeping only frames whose PNG exists. */
function mergeManifest({ existing, rendered, outputDir }) {
  const byId = new Map(existing.frames.map((frame) => [frame.id, frame]));
  for (const frame of rendered) byId.set(frame.id, frame);
  return [...byId.values()]
    .filter((frame) => existsSync(join(outputDir, `${frame.id}.png`)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function commandApps() {
  const cache = ensureChrome();
  assertViewportFits();
  console.log(`using harvested Foundry ${cache.version} chrome`);
  const positional = process.argv.slice(3).find((a) => !a.startsWith('--'));

  const outputDir = join(ARTIFACT_DIR, 'apps');
  // accumulate. A targeted capture used to wipe the directory first, so rendering one case left you
  // with one PNG and destroyed the other 149.
  if (process.argv.includes('--clean')) rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const only = positional ? new Set(positional.split(',')) : null;
  const cases = only ? APP_CASES.filter((entry) => only.has(entry.id)) : APP_CASES;

  // A requested id that names no case is a typo, not an empty result.
  if (only) {
    const unmatched = [...only].filter((id) => APP_CASES.every((entry) => entry.id !== id));
    if (unmatched.length > 0) {
      console.error(
        `no publishable case matches: ${unmatched.join(', ')}\n` +
          `  (${APP_CASES.length} publishable cases; check scripts/lib/viewLabCases.js)`
      );
      return 1;
    }
  }

  // An empty selection is a legitimate outcome — a PR that changes no render file needs no frame —
  // but it MUST announce itself rather than look like a successful run that produced nothing.
  if (cases.length === 0) {
    console.log('SELECTION EMPTY: no cases selected, so no frames were rendered.');
    writeFileSync(
      join(outputDir, 'manifest.json'),
      `${JSON.stringify({ selectionEmpty: true, frames: [], failures: [] }, null, 2)}\n`
    );
    return 0;
  }

  const server = await startLabServer();
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  // Pay Vite's cold dep-optimise once, on a throwaway page, before any case is timed.
  await warmUpLabServer(browser, server.baseUrl);
  const rendered = [];
  const failures = [];
  const distinctEvidence = new Map();
  try {
    for (const viewCase of cases) {
      try {
        const { buffer, box } = await renderPage(browser, server.baseUrl, {
          appId: viewCase.app,
          query: {
            ...viewCase.query,
            case: viewCase.id,
            ...(viewCase.position && {
              w: String(viewCase.position.width),
              h: String(viewCase.position.height),
            }),
          },
          label: viewCase.id,
          steps: viewCase.steps ?? [],
          expectView: viewCase.expectView ?? null,
          // The player app has no declared route field: the tab it was asked for is the tab it must
          // be showing.
          expectTab: viewCase.app === 'fabricate-app' ? (viewCase.query?.tab ?? 'crafting') : null,
          expectSelector: viewCase.expectSelector ?? null,
          expectLayout: viewCase.expectLayout ?? null,
          expectAttributes: viewCase.expectAttributes ?? [],
          expectVisible: viewCase.expectVisible ?? null,
          expectContained: viewCase.expectContained ?? [],
          expectCenterHit: viewCase.expectCenterHit ?? null,
          expectClick: viewCase.expectClick ?? null,
          expectNoHorizontalOverflow: viewCase.expectNoHorizontalOverflow ?? null,
          expectOverflowY: viewCase.expectOverflowY ?? null,
          expectScrollable: viewCase.expectScrollable ?? null,
          allowedConsoleErrors: viewCase.allowedConsoleErrors ?? [],
        });
        if (viewCase.distinctEvidenceGroup) {
          const prior = distinctEvidence.get(viewCase.distinctEvidenceGroup) ?? [];
          const duplicate = prior.find((entry) => entry.buffer.equals(buffer));
          if (duplicate) {
            throw new Error(
              `evidence frame is byte-identical to ${duplicate.id} in distinct group ` +
                `'${viewCase.distinctEvidenceGroup}'`
            );
          }
          distinctEvidence.set(viewCase.distinctEvidenceGroup, [
            ...prior,
            { id: viewCase.id, buffer },
          ]);
        }
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

  // Merge into whatever was already captured, so a subset run updates its frames and leaves the
  // rest listed.
  const head = currentHead();
  const merged = mergeManifest({
    existing: readManifest(outputDir),
    rendered: rendered.map((frame) => ({ ...frame, head })),
    outputDir,
  });

  writeFileSync(
    join(outputDir, 'manifest.json'),
    `${JSON.stringify({ foundryVersion: cache.version, head, frames: merged, failures }, null, 2)}\n`
  );

  // The index is written from the merged manifest, so the page always describes the whole directory
  // rather than just the last run.
  writeFileSync(
    join(outputDir, 'index.html'),
    renderIndexHtml({
      sections: groupFrames(merged, APP_CASES),
      counts: summarise(merged, APP_CASES),
      foundryVersion: cache.version,
      head,
    })
  );

  console.log(
    `\n${rendered.length}/${cases.length} frames captured to ui-screenshot-artifact/apps/` +
      (rendered.length > 0 ? '\nopen ui-screenshot-artifact/apps/index.html to browse them' : '')
  );
  if (failures.length > 0) {
    console.log('\nfailures:');
    for (const failure of failures) console.log(`\n--- ${failure.id} ---\n${failure.message}`);
  }

  // Selected cases but rendered nothing is a harness failure, not an empty result.
  if (rendered.length === 0) {
    console.error(
      `\nrendered 0 of ${cases.length} selected cases and recorded ${failures.length} failures — ` +
        'the harness produced no frames at all.'
    );
    return 1;
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
