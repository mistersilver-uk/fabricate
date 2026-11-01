/**
 * The standalone style root's admission clause for the published `Typeahead` (issue 2860), in
 * Chromium: its specimens mounted through the real seam in happy-dom into the player window's
 * `.window-content` and into a bare ApplicationV2 one, one of them with a query typed and a row
 * made active so its list is open, then drawn in one page per palette with `<html>` naming the
 * other. The open list is drawn where the seam put it, in the window's frame and on the standalone
 * layer for the bare host, each shown only while its own host is read and measured from its own box.
 * Every element of the field and of the open list computes the same compared properties, pseudo
 * elements and border box in both hosts at rest, under keyboard focus or the pointer, under
 * reduced motion and under forced colours. The harvested arm repeats the comparison over Foundry's
 * own sheet and Font Awesome. It is a file of its own so `published-standalone-root-rendered.test.js`
 * stays inside the per-file timeout, and repeats that file's minimum, the target face, the
 * core-min sheets and the per-element read.
 * Limit: happy-dom lays nothing out, so the list's inline placement is the one it computed, alike in
 * both hosts; its placement in a laid-out page is `typeahead-published-rendered.test.js`'s.
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
const STATES = Object.freeze(['rest', 'focus', 'hover', 'reduced', 'forced']);
const fixture = (name) => readFileSync(resolve(repoRoot, `tests/fixtures/${name}`), 'utf8');
const CORE_MIN_SHEETS = Object.freeze([
  fixture('foundry-core-button-min.css'),
  fixture('foundry-core-input-min.css'),
]);
/** The target face `published-standalone-root-rendered.test.js` writes on both hosts. */
const targetFace = (width) =>
  `display: flex; width: ${width}px; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px`;

const NAMED = Object.freeze({
  options: [],
  ariaLabel: 'Find a reward',
  placeholder: 'Search rewards',
});
const ROWS = Object.freeze([
  { value: 'iron-ingot', label: 'Iron ingot', icon: 'fas fa-cube', detail: 'Metal · 3 in stock' },
  { value: 'iron-ore', label: 'Iron ore', icon: 'fas fa-mountain' },
  { value: 7, label: 'Ironwood plank', icon: 'fas fa-tree', detail: 'Timber' },
]);
/**
 * Each specimen's props, `onChange` aside, and the query typed into it, if any: together they draw
 * every density and the error face, and the open list's detail lines, glyphs, cursor and tick.
 */
const SPECIMENS = Object.freeze([
  ['typeahead-default', { ...NAMED }],
  ['typeahead-toolbar', { ...NAMED, density: 'toolbar' }],
  ['typeahead-inline', { ...NAMED, density: 'inline' }],
  ['typeahead-error', { ...NAMED, error: 'Choose a reward from the list.' }],
  ['typeahead-open', { ...NAMED, options: ROWS, value: 7 }, 'iron'],
]);
const OPEN = SPECIMENS.filter((specimen) => specimen[2]).map(([id]) => id);

let browser;
const MEASURED = {};

/** Types `query` into the field in `target` and makes its first row active, as a user does. */
function openList(target, query) {
  const input = target.querySelector('input');
  input.focus();
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  flushSync();
}

/**
 * The open list's container as the seam drew it: in the window's frame, or the whole standalone
 * layer it sits on for a bare host.
 */
function drawnPanel(frame) {
  const framed = [...frame.children].find((child) => child.querySelector?.('[role="listbox"]'));
  if (framed) return framed.outerHTML;
  return document.querySelector('.fabricate-standalone-overlay')?.outerHTML ?? null;
}

/** One specimen's target, and its open list, as drawn under a frame classed `classes`. */
function drawnMarkup(ui, [, props, query], { classes, palette }) {
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
  const handle = ui.mount('Typeahead', { target, props: { ...props, onChange() {} } });
  flushSync();
  if (query) openList(target, query);
  for (const field of target.querySelectorAll('input')) field.setAttribute('value', field.value);
  const html = { target: target.outerHTML, panel: query ? drawnPanel(frame) : null };
  handle.destroy();
  frame.remove();
  assert.ok(!document.querySelector('[role="listbox"]'), 'no list outlives its mount');
  return html;
}

async function mountSpecimens() {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-standalone-root-typeahead-',
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
      for (const specimen of SPECIMENS) {
        markup[palette][specimen[0]] = {
          window: drawnMarkup(ui, specimen, {
            classes: 'application fabricate fabricate-app',
            palette,
          }),
          bare: drawnMarkup(ui, specimen, { classes: 'application' }),
        };
        await settle();
      }
    }
    return markup;
  } finally {
    harness.teardown();
  }
}

/** Layout only, on the page's own hooks: one open list is drawn at a time, its wrapper boxless. */
const PANELS_ONE_AT_A_TIME = `<style>[data-panel] { display: contents; }
[data-panel]:not([data-shown]) { display: none; }</style>`;

const panelWrapper = (id, host, panel) =>
  panel ? `<div data-panel="${id}-${host}">${panel}</div>` : '';

/** The page: `sheets`, core-min, the module sheet, and every specimen in both hosts. */
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
      const { target, panel } = markup[id][host];
      const framed = host === 'window' ? panelWrapper(id, host, panel) : '';
      return `<button type="button" data-sentinel="${id}-${host}">Before</button>
<div class="${classes}" data-host="${id}-${host}" style="width:340px"><div class="window-content">${target}</div>${framed}</div>`;
    });
    return `<section style="display:flex;gap:24px;align-items:flex-start;padding:8px 0">${frames.join('')}</section>`;
  });
  const layered = OPEN.map((id) => panelWrapper(id, 'bare', markup[id].bare.panel));
  return `${head}${PANELS_ONE_AT_A_TIME}<body class="game" style="margin:0;padding:48px 24px;font-family:Arial, sans-serif">${sections.join('\n')}${layered.join('')}</body></html>`;
}

/**
 * Each element drawn in `host`'s target, or in its open list, in tree order: its tag, properties,
 * pseudo elements and box, a list's measured from the list itself.
 */
function readHost({ id, host, scope, properties, pseudo }) {
  const target = document.querySelector(`[data-host="${id}-${host}"] [data-target]`);
  const list = document.querySelector(`[data-panel="${id}-${host}"] [role="listbox"]`);
  const drawnIn = scope === 'panel' ? list : host === 'bare' ? target.firstElementChild : target;
  if (!drawnIn) return null;
  const origin = (scope === 'panel' ? list : target).getBoundingClientRect();
  const pick = (style, names) =>
    Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  const elements =
    scope === 'panel' ? [list, ...list.querySelectorAll('*')] : [...drawnIn.querySelectorAll('*')];
  return elements.map((element) => {
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
      box:
        style.display === 'contents'
          ? null
          : [box.width, box.height, box.left - origin.left, box.top - origin.top].map(Math.round),
    };
  });
}

const read = (tab, id, host, scope = 'target') =>
  tab.evaluate(readHost, {
    id,
    host,
    scope,
    properties: STANDALONE_COMPARED,
    pseudo: STANDALONE_PSEUDO_COMPARED,
  });

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

/** Shows the open list of `id` in `host` alone. */
const showPanel = (tab, id, host) =>
  tab.evaluate((shown) => {
    for (const wrapper of document.querySelectorAll('[data-panel]')) {
      wrapper.toggleAttribute('data-shown', wrapper.dataset.panel === shown);
    }
  }, `${id}-${host}`);

/** Reads each open list in both hosts, each shown alone, after `act` on the shown one. */
async function readPanels(tab, act = async () => {}) {
  const reads = {};
  for (const id of OPEN) {
    reads[id] = {};
    for (const host of HOSTS) {
      await showPanel(tab, id, host);
      await act(id, host);
      await settled(tab);
      reads[id][host] = await read(tab, id, host, 'panel');
    }
  }
  await showPanel(tab, '', '');
  return reads;
}

/** Whether Tab from a host's sentinel lands on the field's input. */
const focusOf = (tab, id, host) =>
  tab.evaluate(
    (selector) => document.activeElement === document.querySelector(selector),
    `[data-host="${id}-${host}"] input`
  );

/** Every state's reads of every specimen, and of each open list, in both hosts. */
async function measure(markup, palette, sheets) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await tab.setContent(pageFor(markup[palette], palette, sheets), { waitUntil: 'load' });
  const other = PALETTES.find((each) => each !== palette);
  await tab.evaluate(
    ([name, value]) => document.documentElement.setAttribute(name, value),
    [THEME, other]
  );
  await tab.mouse.move(0, 0);
  await settled(tab);
  const reads = Object.fromEntries(STATES.map((state) => [state, {}]));
  const panels = {};
  reads.reached = {};
  for (const [id] of SPECIMENS) {
    reads.rest[id] = await bothHosts((host) => read(tab, id, host));
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
    reads.hover[id] = {};
    for (const host of HOSTS) {
      await tab.hover(`[data-host="${id}-${host}"] .fabricate-search`);
      await settled(tab);
      reads.hover[id][host] = await read(tab, id, host);
      await tab.mouse.move(0, 0);
    }
  }
  panels.rest = await readPanels(tab);
  panels.hover = await readPanels(tab, (id, host) =>
    tab.hover(`[data-panel="${id}-${host}"] [role="option"]:nth-child(2)`)
  );
  await tab.mouse.move(0, 0);
  await tab.emulateMedia({ reducedMotion: 'reduce' });
  await settled(tab);
  for (const [id] of SPECIMENS) reads.reduced[id] = await bothHosts((host) => read(tab, id, host));
  panels.reduced = await readPanels(tab);
  await tab.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  await settled(tab);
  for (const [id] of SPECIMENS) reads.forced[id] = await bothHosts((host) => read(tab, id, host));
  panels.forced = await readPanels(tab);
  reads.rooted = await tab.evaluate(() =>
    [...document.querySelectorAll('[data-host$="-bare"] [data-target]')].map(
      (target) => target.firstElementChild.className
    )
  );
  reads.centred = await tab.evaluate(
    () => getComputedStyle(document.querySelector('[data-sentinel]')).justifyContent
  );
  await tab.close();
  return { reads, panels };
}

const chrome = harvestedFoundryChromeCss(repoRoot);
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/published-standalone-root-rendered-typeahead.test.js',
  chrome,
});
const skip = skipWithoutHarvest(chrome);
/**
 * Layout only, written on both hosts alike, as the main suite's harvested arm writes it: core
 * places every `.application` as a window, so each host is laid back in flow and unclipped.
 */
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

let markup;
let harvested = null;

before(
  async () => {
    markup = await mountSpecimens();
    browser = await chromium.launch();
    for (const palette of PALETTES) {
      MEASURED[palette] = await measure(markup, palette, CORE_MIN_SHEETS);
    }
    if (chrome) {
      harvested = await measure(markup, 'fabricate', [chrome, fontAwesome(), HOSTS_IN_FLOW]);
    }
  },
  { timeout: 280_000 }
);

after(async () => {
  await browser?.close();
});

/** Every state's field reads, and the open list's, are alike in both hosts and read something. */
function assertHostsAlike({ reads, panels }) {
  for (const state of STATES) {
    for (const [id, { window, bare }] of Object.entries(reads[state])) {
      assert.ok(window.length >= 4, `${id} drew its column, shell, glyph and input`);
      assert.deepEqual(bare, window, `${id} ${state}`);
    }
    const open = panels[state === 'focus' ? 'hover' : state];
    for (const [id, { window, bare }] of Object.entries(open)) {
      assert.ok(window?.length >= 8, `${id}'s open list drew its rows, ${state}`);
      assert.deepEqual(bare, window, `${id}'s open list, ${state}`);
    }
  }
}

describe('the standalone typeahead specimens', () => {
  it('draw every published density, the error face, and an open list with a cursor and a tick', () => {
    const densities = new Set(SPECIMENS.map(([, props]) => props.density ?? 'default'));
    assert.deepEqual(densities, new Set(['default', 'toolbar', 'inline']));
    assert.ok(SPECIMENS.some(([, props]) => props.error));
    for (const palette of PALETTES) {
      for (const host of HOSTS) {
        const { panel } = markup[palette]['typeahead-open'][host];
        assert.match(panel, /aria-selected="true"/u, `${palette} ${host}: a row is active`);
        assert.match(
          panel,
          /fabricate-typeahead-option-tick/u,
          `${palette} ${host}: a row is ticked`
        );
      }
      assert.match(markup[palette]['typeahead-open'].bare.panel, /fabricate-standalone-overlay/u);
      assert.doesNotMatch(
        markup[palette]['typeahead-open'].window.panel,
        /fabricate-standalone-overlay/u
      );
    }
  });
});

for (const palette of PALETTES) {
  describe(`the published Typeahead in the ${palette} palette`, () => {
    it('draws each bare specimen inside one Fabricate style root', () => {
      const { rooted } = MEASURED[palette].reads;
      assert.equal(rooted.length, SPECIMENS.length);
      for (const classes of rooted) assert.ok(classes.split(' ').includes('fabricate'), classes);
    });

    it('reaches each field’s input from the keyboard in both hosts', () => {
      for (const [id] of SPECIMENS) {
        assert.deepEqual(MEASURED[palette].reads.reached[id], { window: true, bare: true }, id);
      }
    });

    it('computes the same styles, pseudo elements and border box in both hosts, for the field and the open list, in every state', () => {
      assertHostsAlike(MEASURED[palette]);
    });

    it('changes what focus, the pointer, the error face and forced colours change, so each state was reached', () => {
      const { reads, panels } = MEASURED[palette];
      const differs = (one, two) => JSON.stringify(one) !== JSON.stringify(two);
      assert.ok(
        differs(reads.focus['typeahead-default'].bare, reads.rest['typeahead-default'].bare)
      );
      assert.ok(differs(reads.forced['typeahead-error'].bare, reads.rest['typeahead-error'].bare));
      assert.ok(
        differs(reads.rest['typeahead-error'].bare, reads.rest['typeahead-default'].bare),
        'the error face differs from the default shell'
      );
      const list = 'typeahead-open';
      assert.ok(
        differs(panels.hover[list].bare, panels.rest[list].bare),
        'the pointer fills a row'
      );
      assert.ok(
        differs(panels.forced[list].bare, panels.rest[list].bare),
        'forced colours repaint it'
      );
    });
  });
}

describe(
  'the published Typeahead over Foundry’s harvested sheet and Font Awesome',
  { skip },
  () => {
    it('really laid the harvested sheet over the page', () => {
      assert.equal(
        harvested.reads.centred,
        'center',
        "core's own button rule reached the sentinel"
      );
    });

    it('computes the same styles, pseudo elements and border box in both hosts, for the field and the open list, in every state', () => {
      assertHostsAlike(harvested);
    });
  }
);
