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
 * A CHANGE TO THIS FILE SELECTS EVERY PUBLISHABLE CASE, and that is a decision rather than an
 * oversight (issue 1049). Two of the lab's other inputs are narrowed from their own diff — the case
 * registry per case literal, `labActors.js` per fixture table — and the obvious next move is to
 * narrow this one too, on the grounds that argument parsing and the step vocabulary cannot change a
 * pixel while the render path can. That distinction is not drawable from a diff of this module.
 * `runSteps`' verb table, `assertViewportFits`, the console-error gate, the readiness wait and the
 * `frame.screenshot()` call are interleaved here, and `commandApps` reads `process.argv` and drives
 * the render in the same function — so a region map over this file would have to cut through the
 * middle of a function, and a wrong cut fails in the silent direction: a run that photographs a
 * corpus its own driver just changed and publishes it as unaffected. The narrowings that do exist
 * are the ones whose regions are declarative data with a readership that can be read off the render
 * path; this file is neither.
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
import { publishableCases } from './lib/viewLabCases.js';
import { groupFrames, renderIndexHtml, summarise } from './lib/viewLabIndex.js';
import { assertViewLabLayout } from './lib/viewLabLayoutAssertion.js';

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

/**
 * Fabricate warnings that describe the LAB's environment rather than a defect in what it renders.
 *
 * Kept to an explicit, reasoned list rather than a prefix carve-out. A warning gate that tolerates a
 * category tolerates the next bug in that category too; this one has to name the message it excuses.
 */
const TOLERATED_WARNINGS = [
  // The lab declares module version `0.0.0-viewlab`, which cannot satisfy the Item Piles minimum.
  // It is a statement about the harness's own manifest, not about any rendered surface, and it
  // fires on every case regardless of fixture.
  /Item Piles integration: version .* does not meet minimum/,
];

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--force-color-profile=srgb'];
const READY_TIMEOUT_MS = 20_000;
// Playwright's default `page.goto` timeout is 30s, and that is NOT enough for the FIRST
// navigation against a cold Vite server: the dep optimiser has to build the lab's whole
// module graph before it serves anything, measured at ~90s in a fresh checkout. Every case
// then failed at `page.goto` before rendering a pixel, which reads as "the View Lab is
// broken" rather than "the server was still warming up" — it cost one round to diagnose.
// Subsequent navigations are served from the warm cache and finish in well under a second,
// so this ceiling only ever binds once per run.
const NAVIGATION_TIMEOUT_MS = 150_000;

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
 * The click modifiers Playwright accepts. Checked here rather than left to Playwright because its
 * own error names neither the case nor the selector, and locating one bad step part-way through a
 * 155-frame capture costs a whole run.
 */
const CLICK_MODIFIERS = ['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'];

/**
 * The verbs a `modifiers` step may NOT carry. `selectOption`, `fill`, `setInputFiles` and
 * `scrollIntoViewIfNeeded` take no `modifiers` option, so the pairing would be silently INERT: the
 * step would run unmodified and the case would publish a frame of the WRONG state under the right
 * name. That is the failure class every other guard in this runner exists to prevent, so the
 * pairing is rejected rather than dropped.
 */
const MODIFIER_INCOMPATIBLE_VERBS = ['select', 'fill', 'upload', 'scroll'];

/**
 * Drive a case to its named view state.
 *
 * The manager's route (`activeView`) is component-local `$state` — not a prop, and not in
 * `adminStore` — so there is no parameter that reaches it. Clicking is the only mechanism, which is
 * exactly how the live smoke reaches those views too. Steps are matched by accessible name so they
 * read as what a user does, and a step that matches nothing fails loudly rather than silently
 * capturing the wrong screen.
 *
 * A step is either a rail label (matched by text against `.manager-nav-button`) or an object naming
 * a stable selector plus the verb to apply to it:
 *
 *   { selector }                       click it (the default)
 *   { selector, modifiers: ['Shift'] } click it with those keys held — a VARIANT of the click
 *                                      above, not a peer of the verbs below, so it composes with
 *                                      the default and with nothing else
 *   { selector, select: 'macro' }      choose that option on a `<select>`
 *   { selector, fill: 'text' }         type into it, which is the only way to reach a dirty form
 *   { selector, scroll: true }         scroll it into view inside its own overflow container
 *   { selector, upload: json }         choose a file on a native file input
 *
 * @param {import('playwright').Page} page The lab page.
 * @param {Array<string|object>} steps Ordered steps.
 * @param {string} label Case label, for error messages.
 * @param {string} scratch Per-render temp directory for `upload` payloads.
 */
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

      // `modifiers` is a MODIFIER ON THE CLICK, not a sixth verb: it does not choose which action
      // runs, it changes how the default one runs. Bulk selection is shift-click, so without it
      // every multi-selected state in the player inventory is unphotographable.
      //
      // Both guards run BEFORE the dispatch below, because both failures are silent otherwise.
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

      // Five verbs, because a click alone cannot reach every state the smoke photographs. The smoke
      // itself drives these surfaces with `selectOption` and `fill`; a click-only runner leaves those
      // states permanently out of reach no matter how many stable hooks exist, which is not a
      // fixture problem and cannot be solved by fixture work.
      if ('select' in step) {
        // A `<select>` whose chosen value changes the screen — the system currency strategy picker
        // and the recipe category filter both work this way.
        await target.selectOption(step.select);
      } else if ('fill' in step) {
        // Typed input. The only route to a DIRTY form: `data-system-details-dirty` appears on an
        // `input` event, so no click reaches it.
        await target.fill(step.fill);
      } else if ('upload' in step) {
        // A native `<input type="file">`. `renderSystemImportDialog` returns null unless a file was
        // actually chosen, so the import report is unreachable without this — and `fill` THROWS on a
        // file input rather than degrading, which is why the case sat blocked rather than wrong.
        //
        // The payload is written to a temp file because Playwright's `setInputFiles` wants a path.
        //
        // It must OUTLIVE the step. A `File` in Chromium is a lazy handle on the path, not a copy
        // of its bytes, so `file.text()` — which `renderSystemImportDialog` calls when the Import
        // button is pressed, several steps later — reads the file at THAT moment. Deleting it here
        // made every import fail with a bare "A requested file or directory could not be found",
        // caught only once notifications stopped being swallowed. The scratch directory is removed
        // when the page closes, which is the first point at which nothing can still read it.
        const payload = join(scratch, `${label}.json`);
        writeFileSync(payload, step.upload);
        await target.setInputFiles(payload);
      } else if (step.scroll) {
        // Element exists but sits below an inner panel's fold. `frame.screenshot()` on the outer
        // `.application` does NOT scroll nested overflow containers, so a card that never scrolled
        // into view is simply absent from the frame while every assertion still passes.
        await target.scrollIntoViewIfNeeded();
      } else {
        await target.click(modifiers ? { modifiers } : {});
      }

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

/**
 * Navigate a throwaway page once so Vite's dependency optimiser builds the lab's module
 * graph BEFORE any case is timed. Measured at ~90s in a fresh checkout, against a
 * Playwright default of 30s — so without this the first case fails at its readiness wait
 * having rendered nothing, and the run reports the harness as broken.
 *
 * Deliberately swallows its own failure: this is a warm-up, not a check. If the server is
 * genuinely unreachable the first real case will say so with its own, accurate message,
 * and a warm-up that could abort the run would be a second thing to diagnose.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} baseUrl
 * @returns {Promise<void>}
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
  }
) {
  const context = await browser.newContext(BROWSER_CONTEXT);
  // Every wait in this harness, not only the ones that name a timeout: against a COLD Vite
  // server the dep optimiser rebuilds the lab's module graph before it serves anything, so
  // the first case's readiness wait blows Playwright's 30s default long before the page is
  // able to answer. Raising only `page.goto` moved the failure to `waitForFunction` rather
  // than fixing it. A warm run never approaches this ceiling — see `warmUpLabServer`.
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
    // FABRICATE'S OWN WARNINGS ARE FATAL HERE. Not Foundry's, not Vite's, not a dependency's —
    // Fabricate's, which are prefixed `Fabricate |` by convention.
    //
    // This is the generic defence against the defect class that has cost this harness the most: a
    // fixture authored in a shape production does not read. Every instance so far degraded to a
    // DEFAULT rather than throwing — a tool breakage config, four gathering drop tables, three
    // character-prerequisite paths — so the frame rendered cleanly, published, and claimed to be
    // evidence of the thing it was not showing. In each case the resolver did say something; it
    // said it at `warn`, and this listener only collected `error`.
    //
    // Scoped to the prefix on purpose: an unscoped warning gate would fail on the Item Piles version
    // notice every run, and a gate that has to be muted is a gate nobody keeps.
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

    // The same gate for the player window, which had none. Every player case shares
    // `.fabricate-app-shell` as its readiness selector, and that element is present on every tab in
    // every state — so a case whose `?tab=` never applied, or whose steps silently no-oped, still
    // published a frame and still passed. `expectTab` is derived rather than declared: the tab a
    // case asks for in its query IS the tab it must be showing, so there is no second field to keep
    // in sync and no way to declare one that disagrees with the URL.
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

    // `expectView` and `expectTab` gate the ROUTE, and a route survives everything that happens on
    // top of it: a modal that never opened, a dialog that was dismissed, an inspector that stayed
    // collapsed. `manager-import-report` published the plain systems browser for the whole of
    // increment 2 while passing `expectView: 'systems'`, because the systems browser is exactly
    // what is underneath the report. A case whose subject is an OVERLAY names the element that
    // proves it, and is held to it.
    if (expectSelector) {
      const present = await page.evaluate(
        (selector) => globalThis.document.querySelector(selector) !== null,
        expectSelector
      );
      if (!present) {
        throw new Error(
          `${label}: expected "${expectSelector}" to be present after its steps, and it is not. ` +
            `The route is right, so the capture would have shown the screen UNDERNEATH the state ` +
            `this case is named for.`
        );
      }
    }

    await assertViewLabLayout(page, expectLayout, label);

    const frame = page.locator(`[data-view-lab-frame="${appId}"]`);
    const buffer = await frame.screenshot({ animations: 'disabled', caret: 'hide' });
    const box = await frame.boundingBox();
    if (consoleErrors.length > 0) {
      throw new Error(`${label}: console errors during render:\n  ${consoleErrors.join('\n  ')}`);
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

/**
 * The window states captured with real content. Each entry is one PNG.
 *
 * `tab` drives the player app's nav rail; the manager's own routing is component-local `$state`
 * and is reached by interaction rather than by parameter, so its entries land on the default route
 * until the case registry lands.
 */
/** Lab fixture system id -> the smoke system that carries the same capability. */
const APP_CASES = publishableCases();

/**
 * The commit each frame was captured at, so a stale one is identifiable.
 *
 * Accumulation trades "the directory matches one run" for "the directory keeps what is still
 * accurate". That trade is only honest if staleness is visible, and a head sha is more useful than a
 * timestamp: it says WHICH code drew the frame, which is the question a reviewer actually has.
 *
 * @returns {string|null} Short head sha, or null outside a repository.
 */
function currentHead() {
  // Read `.git` directly rather than shelling out to `git rev-parse`. Spawning a binary resolved
  // through PATH is a security finding (S4036) for a script that CI runs with an OIDC role in
  // scope, and it is unnecessary here: HEAD is either a ref pointer or a detached sha, both of
  // which are one file read. No subprocess, no PATH dependency, and it works in a container that
  // has no git installed.
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

/**
 * The git directory pair for this checkout.
 *
 * In an ordinary clone `.git` is a directory and both are the same path. In a WORKTREE it is a
 * file holding `gitdir: <path>`, and reading it as a directory throws `ENOTDIR` — which the caller
 * swallows, so every frame stamps `null` and nothing is ever marked stale. That matters more here
 * than it looks: `AGENTS.md` mandates an isolated worktree for every lane, so the environment this
 * project actually runs captures in is exactly the one where head-stamping silently did nothing,
 * and head-stamping is what pays for capture accumulation.
 *
 * @returns {{gitDir: string, commonDir: string}|null} Resolved dirs, or null outside a repository.
 */
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

/**
 * The manifest already on disk, or an empty one.
 *
 * @param {string} outputDir Capture directory.
 * @returns {{frames: object[]}} Previous manifest.
 */
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

/**
 * Merge this run's frames over the previous set, keeping only frames whose PNG exists.
 *
 * @param {object} options Options.
 * @param {{frames: object[]}} options.existing Previous manifest.
 * @param {object[]} options.rendered Frames from this run.
 * @param {string} options.outputDir Capture directory, for existence checks.
 * @returns {object[]} Merged frames, id-sorted.
 */
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
  // ACCUMULATE. A targeted capture used to wipe the directory first, so rendering one case left you
  // with one PNG and destroyed the other 149. That is defensible only if a subset run is always a
  // fresh start — and it is not: the whole point of the changed-file mapping is that frames the
  // change cannot affect stay accurate, so re-rendering the affected subset over an existing set is
  // the normal case, not an anomaly.
  //
  // What accumulation costs is the guarantee that the directory matches one run. That is paid for by
  // recording the head each frame was captured at, so a stale frame is identifiable rather than
  // merely undetectable. `--clean` restores the old behaviour when a full reset is what you want.
  if (process.argv.includes('--clean')) rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const only = positional ? new Set(positional.split(',')) : null;
  const cases = only ? APP_CASES.filter((entry) => only.has(entry.id)) : APP_CASES;

  // A requested id that names no case is a TYPO, not an empty result. Without this the driver
  // silently rendered whatever subset happened to match — and a fully-unmatched list produced zero
  // frames, zero failures, and exit 0, which is indistinguishable from success to any caller.
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
  // Pay Vite's cold dep-optimise ONCE, on a throwaway page, before any case is timed.
  // Without it the first case absorbs a ~90s server build inside its own readiness wait and
  // fails at whatever ceiling that wait happens to name — which reads as "the View Lab is
  // broken" rather than "the server was still warming up", and cost a full round to
  // diagnose. A warm server answers in well under a second, so this is a one-off cost, and
  // a failure here is deliberately NOT fatal: it means the run proceeds and the first case
  // reports the real error rather than this one.
  await warmUpLabServer(browser, server.baseUrl);
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
            ...(viewCase.position && {
              w: String(viewCase.position.width),
              h: String(viewCase.position.height),
            }),
          },
          label: viewCase.id,
          steps: viewCase.steps ?? [],
          expectView: viewCase.expectView ?? null,
          // The player app has no declared route field: the tab it was ASKED for is the tab it must
          // be showing. Deriving it here means a case cannot declare a tab that disagrees with the
          // query that produced the frame.
          expectTab: viewCase.app === 'fabricate-app' ? (viewCase.query?.tab ?? 'crafting') : null,
          expectSelector: viewCase.expectSelector ?? null,
          expectLayout: viewCase.expectLayout ?? null,
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

  // Merge into whatever was already captured, so a subset run updates its frames and leaves the
  // rest listed. Frames whose PNG has since been deleted are dropped, so the manifest can never
  // describe a file that is not there.
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

  // The index is written from the MERGED manifest, so the page always describes the whole directory
  // rather than just the last run. Generated here rather than left to a separate command because an
  // index someone has to remember to refresh is one that is quietly wrong most of the time.
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

  // Selected cases but rendered nothing is a HARNESS failure, not an empty result. It can happen
  // with zero entries in `failures` — a browser or server that dies before the loop body runs — and
  // without this the run would exit 0 having published no evidence at all. The genuinely-empty
  // selection returned above, before any of this, so reaching here with no frames is always wrong.
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
