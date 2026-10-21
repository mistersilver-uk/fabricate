#!/usr/bin/env node
/**
 * The hero-demo capture (issue 2571): walk the View Lab's `world=demo` through a scripted journey
 * and write numbered PNG frames plus a `manifest.json` of per-frame durations for encoding.
 *
 *   node scripts/demo-capture.mjs [output-dir] [--seed <n>] [--scale <factor>] [--no-captions]
 *
 * The output defaults to `tmp/demo-frames/` (gitignored); only its `NNNN.png` frames and
 * `manifest.json` are ever replaced. The lab server binds port 0, so a lab already serving 5273 in
 * another session is left alone. Encoding is a separate local step (`scripts/README.md`).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { DEFAULT_FABRICATE_THEME, FABRICATE_THEME_CHOICES } from '../src/ui/theme.js';
import { DEMO_SEED } from '../tests/view-lab/demo/demoContent.js';

import {
  assertSafeOutput,
  MANIFEST_FILE,
  publishFrames,
  removeStaleStaging,
  STAGING_PREFIX,
} from './lib/demoCaptureOutput.js';
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
/** 4/3, so the default frame is 1600x1000: whole pixels from the 1200x750 window. */
const DEFAULT_SCALE = 4 / 3;

const FORGE = 'demo-emberdeep-forge';
const STILL = 'demo-hollowmere-still';
const PLAYER = 'fabricate-app';
const MANAGER = 'fabricate-crafting-system-manager';
/** Every scene draws in the default palette; only the palette scene cuts through the rest. */
const THEME = DEFAULT_FABRICATE_THEME;
/** Each through the production `applyFabricateTheme`, ending back on the default. */
const PALETTE_CUTS = Object.entries(FABRICATE_THEME_CHOICES).filter(([id]) => id !== THEME);
const PROMPT = '.fabricate-app [data-manager-modal][data-roll-prompt="single"]';

/**
 * One lower-third caption per beat: a mono kicker over a serif line, drawn into the page so the type
 * stays crisp. `top` lifts it clear of a beat whose subject sits at the bottom of the window.
 */
const CAPTIONS = Object.freeze({
  editor: {
    kicker: 'GM authoring',
    text: 'Powerful, flexible, simple to author.',
    position: 'top',
  },
  forge: { kicker: 'Crafting checks', text: 'Checks decide the outcome.', position: 'top' },
  choice: {
    kicker: 'Player choice',
    text: 'Players choose their materials and rewards.',
    position: 'top',
  },
  pack: {
    kicker: 'Crafting inventory',
    text: 'Your whole crafting inventory, in one app.',
    position: 'top',
  },
  palettes: { kicker: 'Seven themes', text: 'Dress Fabricate for your world.', position: 'top' },
  essences: {
    kicker: 'Essences',
    text: 'Any reagent with the right essence will do.',
    position: 'top',
  },
  knowledge: { kicker: 'Recipe knowledge', text: 'Track who knows what.', position: 'top' },
  discovery: { kicker: 'Alchemy', text: 'Experiment to discover new recipes.', position: 'top' },
  salvage: { kicker: 'Salvage', text: 'Break it back down.', position: 'top' },
});
/** A caption's fade-in after its beat starts: each step's opacity and how long it holds. */
const CAPTION_FADE = Object.freeze([
  [0, 120],
  [0.4, 80],
  [0.75, 80],
]);
/** Beats shorter than this show their caption at once rather than spending them on a fade. */
const CAPTION_FADE_MIN_MS = 600;

function parseArgs(argv) {
  const options = {
    output: join(ROOT, 'tmp', 'demo-frames'),
    seed: DEMO_SEED,
    scale: DEFAULT_SCALE,
    captions: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--seed': {
        options.seed = Number(argv[(index += 1)]);
        break;
      }
      case '--scale': {
        options.scale = Number(argv[(index += 1)]);
        break;
      }
      case '--no-captions': {
        options.captions = false;
        break;
      }
      default: {
        if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
        options.output = resolve(arg);
      }
    }
  }
  if (!Number.isInteger(options.seed)) throw new Error('--seed needs an integer');
  if (!(options.scale > 0 && options.scale <= 2)) {
    throw new Error('--scale needs a factor in (0, 2]');
  }
  return options;
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

/**
 * Draw, update or clear the caption in the window frame, in Fabricate's own faces and the active
 * palette's tokens. Fails when a face falls back, since a frame in a fallback serif is not the product.
 */
async function drawCaption(page, caption, opacity) {
  const fallen = await page.evaluate(
    async ({ spec, alpha }) => {
      const doc = globalThis.document;
      const frame = doc.querySelector('[data-view-lab-frame]');
      let node = frame.querySelector('[data-demo-caption]');
      if (!spec) {
        node?.remove();
        return [];
      }
      const faces = ['600 24px Spectral', '500 11px "JetBrains Mono"'];
      await Promise.all(faces.map((face) => doc.fonts.load(face)));
      const missing = faces.filter((face) => !doc.fonts.check(face));
      if (!node) {
        node = doc.createElement('div');
        node.dataset.demoCaption = '';
        node.style.cssText =
          'position:absolute;left:50%;transform:translateX(-50%);z-index:100000;' +
          'pointer-events:none;text-align:center;white-space:nowrap;padding:10px 26px 12px;' +
          'border-radius:14px;border:1px solid var(--fab-accent-border);' +
          'background:color-mix(in srgb, var(--fab-bg-0) 86%, transparent);' +
          'box-shadow:0 8px 28px var(--fab-overlay-dark-24);';
        const kicker = doc.createElement('div');
        kicker.dataset.demoCaptionKicker = '';
        kicker.style.cssText =
          'font:500 11px/1.3 var(--fab-font-mono);letter-spacing:0.16em;' +
          'text-transform:uppercase;color:var(--fab-accent);margin-bottom:3px;';
        const line = doc.createElement('div');
        line.dataset.demoCaptionText = '';
        line.style.cssText = 'font:600 24px/1.25 var(--fab-font-serif);color:var(--fab-text);';
        node.append(kicker, line);
        frame.append(node);
      }
      node.querySelector('[data-demo-caption-kicker]').textContent = spec.kicker;
      node.querySelector('[data-demo-caption-text]').textContent = spec.text;
      node.style.top = spec.position === 'top' ? '44px' : 'auto';
      node.style.bottom = spec.position === 'top' ? 'auto' : '28px';
      node.style.opacity = String(alpha);
      return missing;
    },
    { spec: caption, alpha: opacity }
  );
  if (fallen.length > 0) {
    throw new Error(`caption faces fell back in the lab page: ${fallen.join(', ')}`);
  }
}

/** The frames one run writes, and the page actions that lead to them. */
class Take {
  constructor({ output, frames, scale, captions }) {
    this.output = output;
    this.frames = frames;
    this.scale = scale;
    this.captions = captions;
    this.page = null;
    this.theme = null;
    this.problems = [];
    this.caption = null;
    this.kicker = null;
    this.captionShown = false;
  }

  /** Show `key`'s caption from the next beat on, fading in on the first beat long enough for it. */
  captionFor(key) {
    if (!CAPTIONS[key]) throw new Error(`no caption for "${key}"`);
    this.caption = key;
    this.kicker = null;
    this.captionShown = false;
  }

  /** Swap the showing caption's kicker without fading it again, as each palette names itself. */
  kickerFor(kicker) {
    this.kicker = kicker;
  }

  async open(browser, baseUrl, { app, seed, query = {} }) {
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
    this.caption = null;
    await this.page.goto(`${baseUrl}${MOUNT_PATH}?${search}`, { timeout: NAVIGATION_TIMEOUT_MS });
    await this.page.waitForFunction(() => {
      const { viewLabReady, viewLabError } = globalThis.document.body.dataset;
      return viewLabReady !== undefined || viewLabError !== undefined;
    });
    const failure = await this.page.evaluate(() => globalThis.document.body.dataset.viewLabError);
    if (failure) throw new Error(`${app}: ${failure}`);
    await this.palette(THEME);
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

  /** Write one beat, held for `ms`, fading its caption in when it is the caption's first long beat. */
  async hold(ms, beat) {
    const fading = this.captions && this.caption && !this.captionShown && ms >= CAPTION_FADE_MIN_MS;
    let remaining = ms;
    if (fading) {
      for (const [opacity, stepMs] of CAPTION_FADE) {
        await this.frame(stepMs, beat, opacity);
        remaining -= stepMs;
      }
    }
    if (this.caption && (fading || ms >= CAPTION_FADE_MIN_MS)) this.captionShown = true;
    await this.frame(remaining, beat, this.captionShown ? 1 : 0);
  }

  /** Write one frame. A palette is re-applied first, for roots that mounted since. */
  async frame(ms, beat, captionOpacity) {
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
    const caption =
      this.captions && this.caption
        ? { ...CAPTIONS[this.caption], ...(this.kicker && { kicker: this.kicker }) }
        : null;
    await drawCaption(this.page, caption, captionOpacity);
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
    this.frames.push({
      file,
      durationMs: ms,
      beat,
      theme: this.theme,
      caption: caption && captionOpacity > 0 ? this.caption : null,
    });
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

/** (a): the GM recipe editor: an "any one of" grip, a reward the player picks, tiers routed. */
async function editorScene(take, open) {
  await open({ app: MANAGER, query: { system: FORGE } });
  take.captionFor('editor');
  await take.click('.manager-nav-button:has-text("Crafting")');
  await take.hold(1000, 'editor: the forge recipes');
  await take.click('[data-recipe-edit="ed-r-longsword"]');
  await take.click('#recipe-tab-ingredients');
  await take.hold(1600, 'editor: any one of two grips');
  await take.click('[data-recipe-group-id="ed-set-blade-g1"] .manager-recipe-or-trigger');
  await take.hold(1300, 'editor: offer an alternative to the steel');
  await take.press('Escape');
  await take.click('#recipe-tab-results');
  await take.glide('[data-recipe-result-group="ed-mw-flourish"]', 'editor: the flourish', {
    steps: 4,
  });
  await take.click('[data-recipe-group-chooser="rolled"]');
  await take.hold(900, 'editor: rolled for the player');
  await take.click('[data-recipe-group-chooser="playerChooses"]');
  await take.expect(
    '[data-recipe-group-chooser="playerChooses"] input:checked',
    'the flourish did not switch back to the player choosing'
  );
  await take.hold(1500, 'editor: or the player chooses');
  await take.click('#recipe-tab-overview');
  await take.glide('[data-recipe-section="routing"]', 'editor: routing', { steps: 4 });
  await take.hold(1800, 'editor: each tier picks its result set');
}

/** (b): the forge, the grip the player picks, and a crafting check that lands on Masterwork. */
async function forgeScene(take, open) {
  await open({ app: PLAYER, query: { tab: 'crafting' } });
  take.captionFor('forge');
  await take.click('[data-crafting-system-filter]');
  await take.click(`[data-popover-option="${FORGE}"]`);
  await take.click('.crafting-recipe-row[data-recipe-id="ed-r-longsword"]');
  await take.hold(1800, 'forge: Forge Longsword, the grips are in another pack');
  await take.click('[data-crafting-sources-add]');
  await take.hold(600, 'forge: add a component source');
  await take.click('.fabricate-set-picker-option[title="Maren of the Still"]');
  await take.press('Escape');
  await take.hold(900, 'forge: two sources');
  take.captionFor('choice');
  await take.hold(1300, 'forge: oiled grip or wyrmhide wrap');
  await take.click('.crafting-alt-option[data-option-index="1"] button');
  await take.expect(
    '.crafting-alt-option[data-option-index="1"] button[aria-pressed="true"]',
    'the wyrmhide wrap was not picked'
  );
  await take.hold(1300, 'forge: the player picks the wyrmhide wrap');
  await take.expect(
    '[data-crafting-craft][data-crafting-craft-disabled="false"]',
    'Forge Longsword is not craftable after picking the grip'
  );
  await take.glide('[data-recipe-section="outcome-tiers"]', 'forge: the outcome tiers', {
    steps: 4,
  });
  take.captionFor('forge');
  await take.hold(1500, 'forge: three blades, one check');
  await take.click('[data-crafting-craft][data-crafting-craft-disabled="false"]');
  await take.hold(1200, 'forge: the crafting check');
  await take.click(`${PROMPT} button[type="submit"]`);
  await take.expect(
    '[data-outcome-tier="ed-masterwork"][data-outcome-rolled="true"]',
    'the roll did not reach Masterwork; re-tune the journey with --seed (see DEMO_SEED)'
  );
  await take.glide('[data-outcome-tier="ed-masterwork"]', 'forge: the check lands on Masterwork', {
    steps: 4,
  });
  await take.hold(1500, 'forge: Masterwork');
}

/** (c): the player picks the Masterwork tier's flourish in the journal. */
async function choiceScene(take) {
  await take.click('[data-player-nav-tab="journal"]');
  take.captionFor('choice');
  await take.hold(1200, 'choice: the run waits on a pick');
  await take.click('[data-award-choice-id="ed-mw-flourish"] button[aria-pressed]');
  await take.hold(1000, 'choice: the sword belt');
  await take.click('[data-award-confirm="ed-mw-flourish"]');
  await take.expect('[data-award-outcome="claimed"]', 'the flourish was not claimed');
  await take.hold(1500, 'choice: claimed');
}

/** (d): the pack: the new blade and belt, then the whole inventory. */
async function packScene(take) {
  await take.click('[data-player-nav-tab="inventory"]');
  take.captionFor('pack');
  await take.fill('[data-inventory-search]', 'sword');
  await take.click(
    `.inventory-card[data-inventory-card="${FORGE}:ed-masterwork-longsword"] .inventory-card-button`
  );
  await take.hold(2200, 'pack: the Masterwork Longsword and its belt');
  await take.fill('[data-inventory-search]', '');
  await take.hold(1600, 'pack: everything the party carries');
}

/** (e): the palette cut, on the whole pack: the default first, then each palette by name. */
async function paletteScene(take) {
  take.captionFor('palettes');
  await take.hold(1000, `palette: ${THEME}`);
  for (const [theme, name] of PALETTE_CUTS) {
    await take.palette(theme);
    take.kickerFor(`Theme · ${name}`);
    await take.hold(900, `palette: ${theme}`);
  }
  await take.palette(THEME);
}

/** (f): the still, reagents matched by the essences they carry and brewed on a check. */
async function essenceScene(take, open) {
  await open({ app: PLAYER, query: { tab: 'alchemy' } });
  take.captionFor('essences');
  await take.hold(1000, 'essences: the workbench');
  await take.click('[data-alchemy-recipe="hm-r-mending"]');
  await take.click('[data-alchemy-inventory-row="hm-bitterfern"]');
  await take.hold(1200, 'essences: bitterfern carries life, still needs water');
  await take.click('[data-alchemy-inventory-row="hm-moonbell"]');
  await take.click('[data-alchemy-inventory-row="hm-empty-phial"]');
  await take.expect('[data-alchemy-brew]:not([disabled])', 'the bench did not recognise the brew');
  await take.hold(1600, 'essences: life and water, Draught of Mending');
  await take.click('[data-alchemy-brew]');
  await take.click(`${PROMPT} button[type="submit"]`);
  await take.expect(
    '[data-alchemy-banner-status="success"]',
    'the brew did not succeed; re-tune the journey with --seed (see DEMO_SEED)'
  );
  await take.hold(1600, 'essences: brewed');
}

/** (g): the GM's view of who knows which of the still's recipes. */
async function knowledgeScene(take, open) {
  await open({ app: MANAGER, query: { system: STILL } });
  take.captionFor('knowledge');
  await take.click('.manager-nav-button:has-text("Crafting")');
  await take.click('#manager-crafting-nav-knowledge');
  await take.click('[data-knowledge-actor="demo-actor-hilde"]');
  await take.click('[data-knowledge-tab="learnedRecipes"]');
  await take.expect('[data-knowledge-learned="hm-r-mending"]', 'Hilde does not know Mending');
  await take.hold(2600, 'knowledge: what Hilde has learned');
}

/** (h): an untried mix on the bench, brewed as an experiment, reveals a recipe. */
async function discoveryScene(take, open) {
  await open({ app: PLAYER, query: { tab: 'alchemy' } });
  take.captionFor('discovery');
  await take.click('[data-alchemy-inventory-row="hm-stonecrop"]');
  await take.click('[data-alchemy-inventory-row="hm-stonecrop"]');
  await take.click('[data-alchemy-inventory-row="hm-bitterfern"]');
  await take.click('[data-alchemy-inventory-row="hm-empty-phial"]');
  await take.expect('[data-alchemy-status="untried"]', 'the bench does not hold an untried mix');
  await take.hold(1800, 'discovery: an unknown outcome');
  await take.click('[data-alchemy-brew]');
  await take.click(`${PROMPT} button[type="submit"]`);
  await take.expect(
    '[data-alchemy-banner-status="success"]',
    'the experiment did not succeed; re-tune the journey with --seed (see DEMO_SEED)'
  );
  await take.hold(2400, 'discovery: Elixir of Stoneskin, discovered');
}

/** (i): salvage a Longsword back to its stock. */
async function salvageScene(take, open) {
  await open({ app: PLAYER, query: { tab: 'inventory' } });
  take.captionFor('salvage');
  await take.fill('[data-inventory-search]', 'Longsword');
  await take.click(
    `.inventory-card[data-inventory-card="${FORGE}:ed-longsword"] .inventory-card-button`
  );
  await take.click('[data-inventory-detail-tab="salvage"]');
  await take.hold(1400, 'salvage: what a Longsword breaks down into');
  await take.click('[data-inventory-salvage-action]');
  await take.expect('[data-inventory-salvage-summary="success"]', 'the salvage did not complete');
  await take.hold(2200, 'salvage: steel and leather back in the pack');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertSafeOutput(options.output, ROOT);
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new Error(missingChromeMessage(ROOT));
  mkdirSync(options.output, { recursive: true });
  removeStaleStaging(options.output);
  // The new set is built beside the old one, which survives until the new set is complete.
  const staging = mkdtempSync(join(options.output, STAGING_PREFIX));

  const frames = [];
  const take = new Take({
    output: staging,
    frames,
    scale: options.scale,
    captions: options.captions,
  });
  let server = null;
  let browser = null;
  try {
    server = await startLabServer(ROOT);
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    const open = (scene) => take.open(browser, server.baseUrl, { seed: options.seed, ...scene });
    for (const scene of [
      editorScene,
      forgeScene,
      choiceScene,
      packScene,
      paletteScene,
      essenceScene,
      knowledgeScene,
      discoveryScene,
      salvageScene,
    ]) {
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
      captions: options.captions,
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
