#!/usr/bin/env node
/**
 * The hero-demo capture (issue 2571): walk the View Lab's `world=demo` through a scripted journey
 * and write numbered PNG frames plus a `manifest.json` of per-frame durations for encoding.
 *
 *   node scripts/demo-capture.mjs [output-dir] [--seed <n>] [--scale <factor>]
 *
 * The output defaults to `tmp/demo-frames/` (gitignored); only its `NNNN.png` frames and
 * `manifest.json` are ever replaced. The lab server binds port 0, so a lab already serving 5273 in
 * another session is left alone. Encoding is a separate local step (`scripts/README.md`).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { DEMO_SEED } from '../tests/view-lab/demo/demoContent.js';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import { collectPageFailures, LAUNCH_ARGS } from './lib/primitiveLabBrowser.js';
import { startLabServer } from './lib/primitiveLabSmoke.js';
import { TOLERATED_WARNINGS } from './lib/viewLabCases.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOUNT_PATH = '/tests/view-lab/index.html';
/** Served by the lab's Vite root, and imported in the page so a palette cut is the production path. */
const THEME_MODULE = '/src/ui/theme.js';
const NAVIGATION_TIMEOUT_MS = 150_000;
/** The window every scene draws, in CSS pixels; `--scale` maps it to the frame's device pixels. */
const WINDOW = Object.freeze({ width: 1200, height: 750 });
const DEFAULT_SCALE = 2 / 3;
/** The only files this tool writes, and so the only ones it ever replaces. */
const FRAME_FILE = /^\d{4}\.png$/;
const MANIFEST_FILE = 'manifest.json';

const FORGE = 'demo-emberdeep-forge';
const PLAYER = 'fabricate-app';
const MANAGER = 'fabricate-crafting-system-manager';
/** Cut on one screen after the forge, each through the production `applyFabricateTheme`. */
const PALETTE_CUTS = ['fabricate', 'mythwright', 'starglass-arcana', 'sovereign', 'hearth-herb'];
const PROMPT = '.fabricate-app [data-manager-modal][data-roll-prompt="single"]';

function parseArgs(argv) {
  const options = {
    output: join(ROOT, 'tmp', 'demo-frames'),
    seed: DEMO_SEED,
    scale: DEFAULT_SCALE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--seed') options.seed = Number(argv[(index += 1)]);
    else if (arg === '--scale') options.scale = Number(argv[(index += 1)]);
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else options.output = resolve(arg);
  }
  if (!Number.isInteger(options.seed)) throw new Error('--seed needs an integer');
  if (!(options.scale > 0 && options.scale <= 2)) {
    throw new Error('--scale needs a factor in (0, 2]');
  }
  return options;
}

/**
 * Refuse an output directory this tool could not have written: the repository root or one of its
 * ancestors, or a non-empty directory holding neither a manifest nor a numbered frame.
 */
function assertSafeOutput(output) {
  // An absolute answer means another drive, which cannot contain the repository.
  const toRoot = relative(output, ROOT);
  if (toRoot === '' || !(toRoot.startsWith('..') || isAbsolute(toRoot))) {
    throw new Error(`refusing to write into ${output}: it is the repository root or contains it`);
  }
  if (!existsSync(output)) return;
  const entries = readdirSync(output);
  const ours = entries.some((name) => name === MANIFEST_FILE || FRAME_FILE.test(name));
  if (entries.length > 0 && !ours) {
    throw new Error(`refusing to write into ${output}: it holds files this tool did not write`);
  }
}

/** Replace the previous set's frames and manifest with the new set, touching nothing else. */
function publishFrames(staging, output) {
  for (const name of readdirSync(output)) {
    if (name === MANIFEST_FILE || FRAME_FILE.test(name)) rmSync(join(output, name));
  }
  for (const name of readdirSync(staging)) renameSync(join(staging, name), join(output, name));
}

/** Close one resource, reporting rather than throwing, so the next one still closes. */
async function closeQuietly(resource, what) {
  try {
    await resource?.close();
  } catch (error) {
    console.error(`could not close the ${what}: ${error instanceof Error ? error.message : error}`);
  }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The frames one run writes, and the page actions that lead to them. */
class Take {
  constructor({ output, frames, scale }) {
    this.output = output;
    this.frames = frames;
    this.scale = scale;
    this.page = null;
    this.theme = null;
    this.problems = [];
  }

  async open(browser, baseUrl, { app, theme, seed, query = {} }) {
    await this.page?.context().close();
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: this.scale,
      colorScheme: 'light',
      locale: 'en-US',
      timezoneId: 'UTC',
      reducedMotion: 'reduce',
    });
    context.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    this.page = await context.newPage();
    this.problems = collectPageFailures(this.page);
    const search = new URLSearchParams({
      app,
      world: 'demo',
      dialog: 'open',
      w: String(WINDOW.width),
      h: String(WINDOW.height),
      demoSeed: String(seed),
      ...query,
    });
    await this.page.goto(`${baseUrl}${MOUNT_PATH}?${search}`, { timeout: NAVIGATION_TIMEOUT_MS });
    await this.page.waitForFunction(() => {
      const { viewLabReady, viewLabError } = globalThis.document.body.dataset;
      return viewLabReady !== undefined || viewLabError !== undefined;
    });
    const failure = await this.page.evaluate(() => globalThis.document.body.dataset.viewLabError);
    if (failure) throw new Error(`${app}: ${failure}`);
    await this.palette(theme);
  }

  /** Apply a palette through the production `applyFabricateTheme`, to every root now mounted. */
  async palette(themeId) {
    this.theme = themeId;
    await this.page.evaluate(
      async ({ module, id }) => (await import(module)).applyFabricateTheme(id),
      { module: THEME_MODULE, id: themeId }
    );
  }

  async settle() {
    await this.page.evaluate(() => globalThis.__FABRICATE_VIEW__.settle());
  }

  async act(selector, action = (target) => target.click()) {
    const target = this.page.locator(selector).first();
    if ((await target.count()) === 0) throw new Error(`the journey cannot reach "${selector}"`);
    await action(target);
    await this.settle();
  }

  click(selector) {
    return this.act(selector);
  }

  fill(selector, text) {
    return this.act(selector, (target) => target.fill(text));
  }

  async press(key) {
    await this.page.keyboard.press(key);
    await this.settle();
  }

  async expect(selector, why) {
    if ((await this.page.locator(selector).count()) === 0) throw new Error(why);
  }

  /** Write one frame, held for `ms`. A palette is re-applied first, for roots that mounted since. */
  async hold(ms, beat) {
    const problems = this.problems.filter((problem) =>
      TOLERATED_WARNINGS.every((pattern) => !pattern.test(problem))
    );
    if (problems.length > 0) {
      throw new Error(`console errors before "${beat}":\n  ${problems.join('\n  ')}`);
    }
    await this.page.evaluate(
      async ({ module, id }) => (await import(module)).applyFabricateTheme(id),
      { module: THEME_MODULE, id: this.theme }
    );
    const file = `${String(this.frames.length + 1).padStart(4, '0')}.png`;
    const frame = this.page.locator('[data-view-lab-frame]');
    // A cold image cache would otherwise photograph a blank tile.
    await frame.evaluate((root) =>
      Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
    );
    await frame.screenshot({
      path: join(this.output, file),
      animations: 'disabled',
      caret: 'hide',
    });
    this.frames.push({ file, durationMs: ms, beat, theme: this.theme });
  }

  /** Ease the element's scroll container until `selector` sits near its top, a frame per step. */
  async glide(selector, beat, { steps = 6, stepMs = 60 } = {}) {
    const span = await this.page
      .locator(selector)
      .first()
      .evaluate((element) => {
        let box = element.parentElement;
        while (
          box &&
          !(
            box.scrollHeight > box.clientHeight + 1 &&
            /auto|scroll/.test(globalThis.getComputedStyle(box).overflowY)
          )
        ) {
          box = box.parentElement;
        }
        if (!box) return null;
        box.dataset.demoGlide = '';
        const offset = element.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
        const end = Math.min(box.scrollTop + offset, box.scrollHeight - box.clientHeight);
        return { start: box.scrollTop, end };
      });
    if (!span) throw new Error(`no scroll container holds "${selector}"`);
    for (let step = 1; step <= steps; step += 1) {
      const top = span.start + (span.end - span.start) * easeInOut(step / steps);
      await this.page.evaluate((value) => {
        globalThis.document.querySelector('[data-demo-glide]').scrollTop = value;
      }, top);
      // `hold` decodes every image in the frame first, so a scrolled-in tile is never blank.
      await this.hold(stepMs, beat);
    }
    await this.page.evaluate(() =>
      globalThis.document.querySelector('[data-demo-glide]')?.removeAttribute('data-demo-glide')
    );
  }
}

/** (a): the forge in Ironblood Forge, a routed craft to its tier and the blade in the pack. */
async function forgeScene(take, open) {
  await open({ app: PLAYER, theme: 'ironblood-forge', query: { tab: 'crafting' } });
  await take.click('[data-crafting-system-filter]');
  await take.click(`[data-popover-option="${FORGE}"]`);
  await take.click('.crafting-recipe-row[data-recipe-id="ed-r-longsword"]');
  await take.hold(2200, 'forge: Forge Longsword, the grip is in another pack');
  await take.click('.actor-bar-trigger');
  await take.hold(900, 'forge: choose the crafting actor');
  await take.click('.actor-bar-trigger');
  await take.click('[data-crafting-sources-add]');
  await take.hold(700, 'forge: add a component source');
  await take.click('.fabricate-set-picker-option[title="Maren of the Still"]');
  await take.hold(1000, 'forge: two sources, ready to craft');
  await take.press('Escape');
  await take.expect(
    '[data-crafting-craft][data-crafting-craft-disabled="false"]',
    'Forge Longsword is not craftable after adding the source'
  );
  await take.glide('[data-recipe-section="outcome-tiers"]', 'forge: the outcome tiers');
  await take.hold(1700, 'forge: three blades, one roll');
  await take.click('[data-crafting-craft][data-crafting-craft-disabled="false"]');
  await take.hold(1300, 'forge: the crafting check');
  await take.click(`${PROMPT} button[type="submit"]`);
  await take.expect(
    '[data-outcome-tier="ed-masterwork"][data-outcome-rolled="true"]',
    'the roll did not reach Masterwork; re-tune the journey with --seed (see DEMO_SEED)'
  );
  await take.glide('[data-outcome-tier="ed-masterwork"]', 'forge: the roll lands on Masterwork', {
    steps: 4,
  });
  await take.hold(1500, 'forge: your roll, Masterwork');
  await take.click('[data-player-nav-tab="inventory"]');
  await take.fill('[data-inventory-search]', 'sword');
  await take.click(
    `.inventory-card[data-inventory-card="${FORGE}:ed-masterwork-longsword"] .inventory-card-button`
  );
  await take.hold(2600, 'forge: the Masterwork Longsword in the pack');
}

/** (b): the palette cut, on the pack with the new blade selected. */
async function paletteScene(take) {
  // The whole pack, so each palette is judged across the grid and the selected blade together.
  await take.fill('[data-inventory-search]', '');
  for (const theme of PALETTE_CUTS) {
    await take.palette(theme);
    await take.hold(1000, `palette: ${theme}`);
  }
}

/** (c): the GM recipe editor, routing the check's tiers to result sets. */
async function editorScene(take, open) {
  await open({ app: MANAGER, theme: 'foundry-native', query: { system: FORGE } });
  await take.click('.manager-nav-button:has-text("Crafting")');
  await take.hold(1100, 'editor: the forge recipes');
  await take.click('[data-recipe-edit="ed-r-longsword"]');
  await take.hold(1100, 'editor: Forge Longsword');
  await take.glide('[data-recipe-section="routing"]', 'editor: routing');
  await take.hold(2200, 'editor: each tier picks its result set');
  await take.click('#recipe-tab-results');
  await take.hold(1600, 'editor: results by outcome');
}

/** (d): the still in Hearth & Herb, reagents combined by essence up to a known brew. */
async function stillScene(take, open) {
  await open({ app: PLAYER, theme: 'hearth-herb', query: { tab: 'alchemy' } });
  await take.hold(1200, 'still: the workbench');
  await take.click('[data-alchemy-recipe="hm-r-mending"]');
  await take.click('[data-alchemy-inventory-row="hm-bitterfern"]');
  await take.hold(1400, 'still: bitterfern, still needs water');
  await take.click('[data-alchemy-inventory-row="hm-moonbell"]');
  await take.hold(700, 'still: moonbell');
  await take.click('[data-alchemy-inventory-row="hm-empty-phial"]');
  await take.expect('[data-alchemy-brew]:not([disabled])', 'the bench did not recognise the brew');
  await take.hold(2500, 'still: Draught of Mending, ready to brew');
}

/** (e): salvage a Longsword back to its stock. */
async function salvageScene(take, open) {
  await open({ app: PLAYER, theme: 'starglass-arcana', query: { tab: 'inventory' } });
  await take.hold(1100, 'salvage: the inventory');
  await take.fill('[data-inventory-search]', 'Longsword');
  await take.click(
    `.inventory-card[data-inventory-card="${FORGE}:ed-longsword"] .inventory-card-button`
  );
  await take.click('[data-inventory-detail-tab="salvage"]');
  await take.hold(1500, 'salvage: what a Longsword breaks down into');
  await take.click('[data-inventory-salvage-action]');
  await take.expect('[data-inventory-salvage-summary="success"]', 'the salvage did not complete');
  await take.hold(2600, 'salvage: steel and leather back in the pack');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new Error(missingChromeMessage(ROOT));
  assertSafeOutput(options.output);
  mkdirSync(options.output, { recursive: true });
  // The new set is built beside the old one, which survives until the new set is complete.
  const staging = mkdtempSync(join(options.output, '.demo-capture-'));

  const frames = [];
  const take = new Take({ output: staging, frames, scale: options.scale });
  let server = null;
  let browser = null;
  try {
    server = await startLabServer(ROOT);
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    const open = (scene) => take.open(browser, server.baseUrl, { seed: options.seed, ...scene });
    for (const scene of [forgeScene, paletteScene, editorScene, stillScene, salvageScene]) {
      await scene(take, open);
    }
    const totalMs = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
    const manifest = {
      foundryVersion: cache.version,
      window: WINDOW,
      scale: options.scale,
      frameSize: {
        width: Math.round(WINDOW.width * options.scale),
        height: Math.round(WINDOW.height * options.scale),
      },
      seed: options.seed,
      loop: true,
      totalMs,
      frames,
    };
    writeFileSync(join(staging, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    publishFrames(staging, options.output);
    console.log(
      `wrote ${frames.length} frames (${(totalMs / 1000).toFixed(1)}s) to ${options.output}`
    );
  } finally {
    await closeQuietly(browser, 'browser');
    await closeQuietly(server, 'lab server');
    rmSync(staging, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
// Explicitly, so a handle a failed launch or listen left open cannot keep the process alive.
process.exit(process.exitCode ?? 0);
