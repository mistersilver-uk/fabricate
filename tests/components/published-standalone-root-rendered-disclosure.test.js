/**
 * The standalone style root's admission clause for the published `Disclosure` (issue 2862), in
 * Chromium: its specimens mounted through the real seam in happy-dom into the player window's
 * `.window-content` and into a bare ApplicationV2 one, their head and body slots filled as a
 * companion fills them, then drawn in one page per palette with `<html>` naming the other. Every
 * element computes the same compared properties, pseudo elements and border box in both hosts at
 * rest, under keyboard focus, under the pointer, under reduced motion and under forced colours, and
 * its specimens draw every value of the keys the card reads.
 * It is a file of its own so `published-standalone-root-rendered.test.js` stays inside the per-file
 * timeout; it repeats that file's minimum, the target face, the core-min sheets, the per-element
 * read and its harvested arm over Foundry 14.365's own sheet, which skips where no harvest exists,
 * without panels, which no disclosure opens.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';
import {
  STANDALONE_COMPARED,
  STANDALONE_PSEUDO_COMPARED,
} from '../fixtures/published-components/standaloneSpecimens.js';
import {
  harvestedFoundryChromeCss,
  registerChromeRunnerGuards,
  skipWithoutHarvest,
} from '../helpers/harvestedFoundryChrome.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const THEME = 'data-fabricate-theme';
const PALETTES = Object.freeze(['fabricate', 'foundry-native']);
const HOSTS = Object.freeze(['window', 'bare']);
const ENTRY = 'Disclosure';
const fixture = (name) => readFileSync(resolve(repoRoot, `tests/fixtures/${name}`), 'utf8');
const CORE_MIN_SHEETS = Object.freeze([
  fixture('foundry-core-button-min.css'),
  fixture('foundry-core-input-min.css'),
]);
/** The disclosure's own drawn properties beyond the shared lists: its turn, its chevron and its head. */
const COMPARED = Object.freeze([
  ...new Set([
    ...STANDALONE_COMPARED,
    'transform',
    'border-right-color',
    'border-bottom-color',
    'justify-content',
    'margin-top',
    'margin-bottom',
  ]),
]);
/** The target face `published-standalone-root-rendered.test.js` writes on both hosts. */
const targetFace = (width) =>
  `width: ${width}px; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px`;

/** Each specimen's props, `onToggle` aside: together they draw every value of the keys it reads. */
const SPECIMENS = Object.freeze([
  ['disclosure-closed', { head: true, body: true }],
  ['disclosure-open-h2', { head: true, body: true, open: true, level: 2 }],
  ['disclosure-disabled', { head: true, body: true, disabled: true, level: 4 }],
  ['disclosure-disabled-open', { head: true, body: true, disabled: true, open: true, level: 5 }],
  ['disclosure-h6', { head: true, body: true, level: 6 }],
]);
/** The specimens Tab reaches: every head, a disabled one included, takes keyboard focus. */
const FOCUSED = SPECIMENS.map(([id]) => id);

let browser;
const MEASURED = {};

/** One specimen's target as drawn under a frame classed `classes`, its slots filled. */
function drawnMarkup(ui, props, { classes, palette }) {
  const frame = document.createElement('div');
  frame.className = classes;
  if (palette) frame.setAttribute(THEME, palette);
  const content = document.createElement('div');
  content.className = 'window-content';
  const target = document.createElement('div');
  target.setAttribute('data-target', '');
  target.setAttribute('style', targetFace(280));
  content.append(target);
  frame.append(content);
  document.body.append(frame);
  const handle = ui.mount(ENTRY, { target, props: { ...props, onToggle() {} } });
  handle.slot('head').append('Ironwrights’ Guild');
  handle.slot('body').innerHTML = '<p style="margin:0">Holds the forges on the east quay.</p>';
  flushSync();
  const html = target.outerHTML;
  handle.destroy();
  frame.remove();
  return html;
}

async function mountSpecimens() {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-standalone-root-disclosure-',
    rawModules: PUBLISHED_RAW_MODULES,
    runeModules: PUBLISHED_RUNE_MODULES,
    compiledModules: PUBLISHED_COMPILED_MODULES,
    componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
  });
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report: assert.fail });
    const markup = {};
    for (const palette of PALETTES) {
      document.documentElement.setAttribute(THEME, palette);
      markup[palette] = {};
      for (const [id, props] of SPECIMENS) {
        markup[palette][id] = {
          window: drawnMarkup(ui, props, {
            classes: 'application fabricate fabricate-app',
            palette,
          }),
          bare: drawnMarkup(ui, props, { classes: 'application' }),
        };
        await settle();
      }
    }
    return markup;
  } finally {
    harness.teardown();
  }
}

/** The page: `sheets`, core-min and the module sheet; the card has no scoped style. */
function pageFor(markup, palette, sheets) {
  const meta = '<meta charset="utf-8">';
  const head = renderedPageHead([]).replace(
    meta,
    () => `${meta}${sheets.map((css) => `<style>${css}</style>`).join('')}`
  );
  const sections = SPECIMENS.map(([id]) => {
    const frames = HOSTS.map((host) => {
      const classes =
        host === 'window'
          ? `application fabricate fabricate-app" ${THEME}="${palette}`
          : 'application';
      return `<button type="button" data-sentinel="${id}-${host}">Before</button>
<div class="${classes}" data-host="${id}-${host}" style="width:340px"><div class="window-content">${markup[id][host]}</div></div>`;
    });
    return `<section style="display:flex;gap:24px;align-items:flex-start;padding:8px 0">${frames.join('')}</section>`;
  });
  return `${head}<body class="game" style="margin:0;padding:48px 24px;font-family:Arial, sans-serif">${sections.join('\n')}</body></html>`;
}

/** Each element drawn in `host`, in tree order: its tag, properties, pseudo elements and box. */
function readHost({ id, host, properties, pseudo }) {
  const target = document.querySelector(`[data-host="${id}-${host}"] [data-target]`);
  const drawnIn = host === 'bare' ? target.firstElementChild : target;
  const origin = target.getBoundingClientRect();
  const pick = (style, names) =>
    Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  return [...drawnIn.querySelectorAll('*')].map((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      tag: element.localName,
      properties: pick(style, properties),
      pseudo: Object.fromEntries(
        ['::before', '::after'].map((which) => [
          which,
          pick(getComputedStyle(element, which), pseudo),
        ])
      ),
      // A closed body and what it holds have no box, so they are read where they are not laid out.
      box:
        style.display === 'contents' || element.getClientRects().length === 0
          ? null
          : [box.width, box.height, box.left - origin.left, box.top - origin.top].map(Math.round),
    };
  });
}

const read = (tab, id, host) =>
  tab.evaluate(readHost, { id, host, properties: COMPARED, pseudo: STANDALONE_PSEUDO_COMPARED });

const bothHosts = async (readOne) =>
  Object.fromEntries(await Promise.all(HOSTS.map(async (host) => [host, await readOne(host)])));

/** Past two frames and every running transition, so a read never lands mid-transition. */
const settled = (tab) =>
  tab.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
    await frame();
    await Promise.all(document.getAnimations().map((each) => each.finished.catch(() => {})));
    await frame();
  });

/** Whether Tab from a host's sentinel lands on the head under `:focus-visible`. */
const focusOf = (tab, id, host) =>
  tab.evaluate((selector) => {
    const head = document.querySelector(selector);
    return document.activeElement === head && head.matches(':focus-visible');
  }, `[data-host="${id}-${host}"] .fabricate-disclosure-head`);

/** Every state's reads of every specimen in both hosts, on the page for `palette` over `sheets`. */
async function measure(markup, palette, sheets = CORE_MIN_SHEETS) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(pageFor(markup[palette], palette, sheets), { waitUntil: 'load' });
  const other = PALETTES.find((each) => each !== palette);
  await tab.evaluate(
    ([name, value]) => document.documentElement.setAttribute(name, value),
    [THEME, other]
  );
  await tab.mouse.move(0, 0);
  await settled(tab);
  const sheet = await tab.evaluate(() => ({
    sentinel: getComputedStyle(document.querySelector('[data-sentinel]')).justifyContent,
    headings: [...document.querySelectorAll('.fabricate-disclosure-heading')].map((heading) => {
      const style = getComputedStyle(heading);
      const target = getComputedStyle(heading.closest('[data-target]'));
      return [
        style.marginTop,
        style.borderBottomStyle,
        style.fontSize === target.fontSize,
        style.fontWeight === target.fontWeight,
      ].join(',');
    }),
  }));
  const reads = { sheet, rest: {}, focus: {}, hover: {}, reduced: {}, forced: {}, reached: {} };
  for (const [id] of SPECIMENS) reads.rest[id] = await bothHosts((host) => read(tab, id, host));
  for (const id of FOCUSED) {
    reads.reached[id] = {};
    for (const host of HOSTS) {
      await tab.focus(`[data-sentinel="${id}-${host}"]`);
      await tab.keyboard.press('Tab');
      await settled(tab);
      reads.reached[id][host] = await focusOf(tab, id, host);
      reads.focus[id] ??= {};
      reads.focus[id][host] = await read(tab, id, host);
    }
    await tab.evaluate(() => document.activeElement?.blur());
  }
  for (const [id] of SPECIMENS) {
    reads.hover[id] = {};
    for (const host of HOSTS) {
      await tab.hover(`[data-host="${id}-${host}"] .fabricate-disclosure-head`, { force: true });
      await settled(tab);
      reads.hover[id][host] = await read(tab, id, host);
      await tab.mouse.move(0, 0);
    }
  }
  await tab.emulateMedia({ reducedMotion: 'reduce' });
  await settled(tab);
  for (const [id] of SPECIMENS) reads.reduced[id] = await bothHosts((host) => read(tab, id, host));
  await tab.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  await settled(tab);
  for (const [id] of SPECIMENS) reads.forced[id] = await bothHosts((host) => read(tab, id, host));
  reads.rooted = await tab.evaluate(() =>
    [...document.querySelectorAll('[data-host$="-bare"] [data-target]')].map(
      (target) => target.firstElementChild.className
    )
  );
  await tab.close();
  return reads;
}

const chrome = harvestedFoundryChromeCss(repoRoot);
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/published-standalone-root-rendered-disclosure.test.js',
  chrome,
});
const skip = skipWithoutHarvest(chrome);
/** The main file's layout-only rule, written on both hosts alike, that lays core's stacked windows back in flow. */
const HOSTS_IN_FLOW = `html, body {
  display: block; position: static; inset: auto; width: auto; height: auto;
  min-height: 0; max-height: none; overflow: visible; transform: none;
}
[data-host] {
  position: static; inset: auto; transform: none; z-index: auto; contain: none;
  container-type: normal; filter: none; perspective: none; will-change: auto;
  backdrop-filter: none; translate: none; rotate: none; scale: none;
  margin: 0; height: auto; max-height: none; min-width: 0; overflow: visible;
}
[data-host] > .window-content { overflow: visible; }`;
const fontAwesome = () => {
  const cache = resolveChromeCache(repoRoot);
  return readFileSync(join(cache.dir, 'fonts', 'fontawesome', 'css', 'all.min.css'), 'utf8');
};
let harvested = null;

before(
  async () => {
    const markup = await mountSpecimens();
    browser = await chromium.launch();
    if (chrome) {
      harvested = measure(markup, 'fabricate', [chrome, fontAwesome(), HOSTS_IN_FLOW]);
    }
    for (const palette of PALETTES) MEASURED[palette] = await measure(markup, palette);
    if (harvested) harvested = await harvested;
  },
  { timeout: 280_000 }
);

after(async () => {
  await browser?.close();
});

describe('the standalone disclosure specimens', () => {
  it('draw every value of open, disabled and level', () => {
    const drawn = (key, readOne) => new Set(SPECIMENS.map(([, props]) => readOne(props[key])));
    const flag = (value) => value === true;
    const both = new Set([false, true]);
    assert.deepEqual(drawn('open', flag), both);
    assert.deepEqual(drawn('disabled', flag), both);
    // Read from the card's own table, so a seventh heading level cannot hide.
    const table = [
      ...walkNodes(componentAstOf('src/ui/svelte/components/Disclosure.svelte').instance),
    ].find((node) => node.type === 'VariableDeclarator' && node.id?.name === 'HEADINGS');
    const levels = new Set(
      table.init.arguments[0].elements.map(({ elements }) => elements[0].value)
    );
    assert.equal(levels.size, 5, 'the heading table was read');
    assert.deepEqual(
      drawn('level', (value) => value ?? 3),
      levels
    );
  });
});

for (const palette of PALETTES) {
  describe(`the published ${ENTRY} in the ${palette} palette`, () => {
    it('draws each bare specimen inside one Fabricate style root, and each window one under none', () => {
      const { rooted } = MEASURED[palette];
      assert.equal(rooted.length, SPECIMENS.length);
      for (const classes of rooted) assert.ok(classes.split(' ').includes('fabricate'), classes);
    });

    it('draws each heading as nothing of its own over the core-min sheets', () => {
      const { headings } = MEASURED[palette].sheet;
      assert.equal(headings.length, SPECIMENS.length * HOSTS.length);
      for (const heading of headings) assert.equal(heading, '0px,none,true,true');
    });

    it('reaches each head, a disabled one included, from the keyboard in both hosts', () => {
      for (const id of FOCUSED) {
        assert.deepEqual(MEASURED[palette].reached[id], { window: true, bare: true }, id);
      }
    });

    for (const state of ['rest', 'focus', 'hover', 'reduced', 'forced']) {
      it(`computes the same styles, pseudo elements and border box in both hosts, ${state}`, () => {
        const reads = MEASURED[palette][state];
        assert.ok(Object.keys(reads).length > 0, `${state} read something`);
        for (const [id, { window, bare }] of Object.entries(reads)) {
          assert.ok(window.length >= 6, `${id} drew its card, heading, head, chevron and body`);
          assert.deepEqual(bare, window, `${id} ${state}`);
        }
      });
    }

    it('changes what focus, hover and forced colours change, so each state was reached, and reduced motion nothing', () => {
      const { rest, focus, hover, reduced, forced } = MEASURED[palette];
      const differs = (state, id) =>
        JSON.stringify(state[id].bare) !== JSON.stringify(rest[id].bare);
      assert.ok(differs(focus, 'disclosure-closed'), 'focus draws the ring');
      assert.ok(differs(hover, 'disclosure-closed'), 'the pointer raises the head');
      assert.ok(!differs(reduced, 'disclosure-closed'), 'the card draws no motion to still');
      assert.ok(differs(forced, 'disclosure-open-h2'), 'forced colours repaint the card');
    });
  });
}

/** Each state's reads, `bare` drawn as `window` in every specimen. */
function assertHostsAlike(reads, label) {
  for (const state of ['rest', 'focus', 'hover', 'reduced', 'forced']) {
    assert.ok(Object.keys(reads[state]).length > 0, `${label} ${state} read something`);
    for (const [id, { window, bare }] of Object.entries(reads[state])) {
      assert.deepEqual(bare, window, `${label}: ${id} ${state}`);
    }
  }
}

describe(`the published ${ENTRY} over Foundry’s harvested sheet and Font Awesome`, { skip }, () => {
  it('really laid the harvested sheet over the page', () => {
    assert.equal(harvested.sheet.sentinel, 'center', "core's own button rule reached the sentinel");
  });

  it('draws each heading as nothing of its own over core’s heading rules', () => {
    assert.equal(harvested.sheet.headings.length, SPECIMENS.length * HOSTS.length);
    for (const heading of harvested.sheet.headings) assert.equal(heading, '0px,none,true,true');
  });

  it('reaches each head from the keyboard in both hosts', () => {
    for (const id of FOCUSED) assert.deepEqual(harvested.reached[id], { window: true, bare: true });
  });

  it('computes the same styles, pseudo elements and border box in both hosts, in every state', () => {
    assertHostsAlike(harvested, 'harvested');
  });
});
