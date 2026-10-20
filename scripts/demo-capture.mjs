#!/usr/bin/env node
/**
 * The hero-demo capture (issue 2571): walk the View Lab's `world=demo` through a scripted journey
 * and write numbered PNG frames plus a `manifest.json` of per-frame durations for encoding.
 *
 *   node scripts/demo-capture.mjs [output-dir] [--seed <n>] [--scale <factor>]
 *
 * The output defaults to `tmp/demo-frames/` (gitignored). The lab server runs on a free port, so a
 * lab already serving 5273 in another session is left alone. Encoding is a separate local step.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOUNT_PATH = '/tests/view-lab/index.html';
/** Served by the lab's Vite root, and imported in the page so a palette cut is the production path. */
const THEME_MODULE = '/src/ui/theme.js';
const VITE_SPECIFIER = 'vite';
const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--force-color-profile=srgb'];
const NAVIGATION_TIMEOUT_MS = 150_000;
/** The window every scene draws, in CSS pixels; `--scale` maps it to the frame's device pixels. */
const WINDOW = Object.freeze({ width: 1200, height: 750 });
const DEFAULT_SCALE = 2 / 3;

const FORGE = 'demo-emberdeep-forge';
const PLAYER = 'fabricate-app';
const MANAGER = 'fabricate-crafting-system-manager';
const PROMPT = '.fabricate-app [data-manager-modal][data-roll-prompt="single"]';
/** The lab's own environment notices, tolerated exactly as `view-lab-screenshots.mjs` does. */
const TOLERATED_WARNINGS = [
  /Fabricate gave this world one shared record per component, essence and tool/,
  /Startup cleanup skipped: the ids it would prune against are not known to be complete/,
];

function parseArgs(argv) {
  const options = { output: join(ROOT, 'tmp', 'demo-frames'), seed: null, scale: DEFAULT_SCALE };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--seed') options.seed = Number(argv[(index += 1)]);
    else if (arg === '--scale') options.scale = Number(argv[(index += 1)]);
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else options.output = resolve(arg);
  }
  if (options.seed !== null && !Number.isInteger(options.seed))
    throw new Error('--seed needs an integer');
  if (!(options.scale > 0 && options.scale <= 2))
    throw new Error('--scale needs a factor in (0, 2]');
  return options;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

async function startLabServer() {
  const { createServer } = await import(VITE_SPECIFIER);
  const port = await freePort();
  const server = await createServer({
    configFile: join(ROOT, 'tests/view-lab/vite.config.js'),
    server: { port, strictPort: true },
    logLevel: 'warn',
  });
  await server.listen();
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() };
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
    this.watch(this.page);
    const seeded = seed === null ? null : { demoSeed: String(seed) };
    const search = new URLSearchParams({
      app,
      world: 'demo',
      dialog: 'open',
      w: String(WINDOW.width),
      h: String(WINDOW.height),
      ...seeded,
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

  watch(page) {
    page.on('console', (message) => {
      const text = message.text();
      const fabricateWarning = message.type() === 'warning' && text.includes('Fabricate |');
      const tolerated = TOLERATED_WARNINGS.some((pattern) => pattern.test(text));
      if ((message.type() === 'error' || fabricateWarning) && !tolerated) this.problems.push(text);
    });
    page.on('pageerror', (error) => {
      this.problems.push(String(error?.message ?? error));
    });
    page.on('response', (response) => {
      if (response.status() >= 400) this.problems.push(`${response.status()} ${response.url()}`);
    });
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
    if (this.problems.length > 0) {
      throw new Error(`console errors before "${beat}":\n  ${this.problems.join('\n  ')}`);
    }
    await this.page.evaluate(
      async ({ module, id }) => (await import(module)).applyFabricateTheme(id),
      { module: THEME_MODULE, id: this.theme }
    );
    const file = `${String(this.frames.length + 1).padStart(4, '0')}.png`;
    const frame = this.page.locator('[data-view-lab-frame]');
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
      await this.hold(stepMs, beat);
    }
    await this.page.evaluate(() =>
      globalThis.document.querySelector('[data-demo-glide]')?.removeAttribute('data-demo-glide')
    );
  }
}

/** (a)-(b): the forge in Ironblood Forge, a routed craft to its tier, then the palette cut. */
async function forgeScene(take, open) {
  await open({ app: PLAYER, theme: 'ironblood-forge', query: { tab: 'crafting' } });
  await take.hold(1600, 'forge: the recipe browser');
  await take.click('[data-crafting-system-filter]');
  await take.hold(500, 'forge: filter by crafting system');
  await take.click(`[data-popover-option="${FORGE}"]`);
  await take.click('.crafting-recipe-row[data-recipe-id="ed-r-longsword"]');
  await take.hold(1600, 'forge: Forge Longsword, the grip is in another pack');
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
  await take.hold(600, 'forge: ready to craft');
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
  await take.hold(2200, 'forge: Masterwork Longsword');
  for (const theme of [
    'fabricate',
    'mythwright',
    'starglass-arcana',
    'sovereign',
    'foundry-native',
  ]) {
    await take.palette(theme);
    await take.hold(900, `palette: ${theme}`);
  }
  await take.palette('ironblood-forge');
  await take.hold(700, 'palette: back to ironblood-forge');
}

/** (c): the GM recipe editor, routing the check's tiers to result sets. */
async function editorScene(take, open) {
  await open({ app: MANAGER, theme: 'mythwright', query: { system: FORGE } });
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
  await take.hold(2200, 'still: Draught of Mending, ready to brew');
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
  await take.hold(2400, 'salvage: steel and leather back in the pack');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new Error(missingChromeMessage(ROOT));
  rmSync(options.output, { recursive: true, force: true });
  mkdirSync(options.output, { recursive: true });

  const frames = [];
  const take = new Take({ output: options.output, frames, scale: options.scale });
  const server = await startLabServer();
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  try {
    const open = (scene) => take.open(browser, server.baseUrl, { seed: options.seed, ...scene });
    for (const scene of [forgeScene, editorScene, stillScene, salvageScene]) {
      await scene(take, open);
    }
  } finally {
    await browser.close();
    await server.close();
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
  writeFileSync(join(options.output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `wrote ${frames.length} frames (${(totalMs / 1000).toFixed(1)}s) to ${options.output}`
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
