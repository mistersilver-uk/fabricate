/**
 * The standalone style root's admission clause for the published `Popover` (issue 2861), in
 * Chromium: its specimens mounted open through the real seam in happy-dom, each beside a companion
 * anchor, into the player window's `.window-content` and into a bare ApplicationV2 one, then drawn
 * in one page per palette with `<html>` naming the other. The panel is drawn where the seam put
 * it, in the window's frame or on the standalone layer, one host's at a time, and every element
 * of it computes the same compared properties, pseudo elements and box, measured from the panel,
 * in both hosts at rest, under keyboard focus, under the pointer, under reduced motion and under
 * forced colours; its specimens draw every placement and each naming form.
 * It is a file of its own so `published-standalone-root-rendered.test.js` stays inside the
 * per-file timeout; it repeats that file's minimum, the target face, the core-min sheets, the
 * per-element read and, where a harvest exists, its arm over Foundry 14.365's own sheet with the
 * hosts laid back in flow, which reaches the panel's heading where the core-min fixtures do not.
 * Limit: happy-dom lays nothing out, so each panel's placement is computed from a zero box in both
 * hosts and only its own geometry is compared.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { POPOVER_PLACEMENTS } from '../../src/ui/svelte/util/popoverLayout.js';
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
const fixture = (name) => readFileSync(resolve(repoRoot, `tests/fixtures/${name}`), 'utf8');
const CORE_MIN_SHEETS = Object.freeze([
  fixture('foundry-core-button-min.css'),
  fixture('foundry-core-input-min.css'),
]);
/** The target face `published-standalone-root-rendered.test.js` writes on both hosts. */
const TARGET_FACE =
  'width: 280px; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px';
/** The companion's own body content: a value input, a delta button and a reason input. */
const BODY =
  '<input type="number" aria-label="Value" value="14"><button type="button">+1</button><input type="text" aria-label="Reason" placeholder="Blessing of the oak">';

/** Each specimen's props, `anchorId` and `onClose` aside: every placement and each naming form. */
const SPECIMENS = Object.freeze([
  ['popover-titled', { title: 'Strength', body: true }],
  ['popover-labelled-end', { ariaLabel: 'Adjust Strength', placement: 'bottom-end', body: true }],
  [
    'popover-both-top',
    { title: 'Strength', ariaLabel: 'Adjust Strength', placement: 'top-start', body: true },
  ],
  ['popover-top-end-empty', { ariaLabel: 'Adjust Strength', placement: 'top-end' }],
]);
const FILLED = SPECIMENS.filter(([, props]) => props.body).map(([id]) => id);

let browser;
const MEASURED = {};

/** happy-dom lays nothing out, so the window's frame is given the viewport the layer measures as. */
function viewportOf() {
  const { innerWidth: width, innerHeight: height } = document.defaultView;
  return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0 };
}

/** The panel the seam drew: its container in the window's frame, or the standalone layer. */
function drawnPanel(frame, content) {
  const container = [...frame.children].find((child) => child !== content);
  const layer = document.body.querySelector(':scope > .fabricate-standalone-overlay');
  return container ?? layer ?? null;
}

/** One specimen as drawn under a frame classed `classes`: its target and its open panel. */
async function drawnMarkup(ui, [id, props], { host, classes, palette }) {
  const frame = document.createElement('div');
  frame.className = classes;
  if (palette) frame.setAttribute(THEME, palette);
  if (host === 'window') frame.getBoundingClientRect = viewportOf;
  const content = document.createElement('div');
  content.className = 'window-content';
  const anchor = document.createElement('button');
  Object.assign(anchor, { type: 'button', id: `${id}-${host}`, textContent: 'Strength 14' });
  const target = document.createElement('div');
  target.setAttribute('data-target', '');
  target.setAttribute('style', TARGET_FACE);
  content.append(anchor, target);
  frame.append(content);
  document.body.append(frame);
  const handle = ui.mount('Popover', {
    target,
    props: { open: true, anchorId: anchor.id, onClose() {}, ...props },
  });
  if (props.body) handle.slot('body').innerHTML = BODY;
  flushSync();
  await settle();
  const panel = drawnPanel(frame, content);
  assert.ok(
    panel?.querySelector('.fabricate-popover'),
    `${id} draws its panel in the ${host} host`
  );
  for (const field of panel.querySelectorAll('input')) field.setAttribute('value', field.value);
  const html = { content: content.outerHTML, panel: panel.outerHTML };
  handle.destroy();
  frame.remove();
  await settle();
  assert.ok(!drawnPanel(frame, content), `${id} leaves no panel once destroyed`);
  return html;
}

async function mountSpecimens() {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-standalone-root-popover-',
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
          window: await drawnMarkup(ui, specimen, {
            host: 'window',
            classes: 'application fabricate fabricate-app',
            palette,
          }),
          bare: await drawnMarkup(ui, specimen, { host: 'bare', classes: 'application' }),
        };
      }
    }
    return markup;
  } finally {
    harness.teardown();
  }
}

/** Every panel but the one whose host is read draws nothing, so no two overlap. */
const PANELS_SHOWN_ONE_AT_A_TIME = `<style>[data-panel] { display: contents; }
[data-panel]:not([data-shown]) { display: none; }</style>`;

/** A host's panel, after a sentinel of its own that Tab into the panel starts from. */
const panelWrapper = (id, host, panel) =>
  `<div data-panel="${id}-${host}"><button type="button" data-sentinel="${id}-${host}">Before</button>${panel}</div>`;

/** The page: the core-min sheets, core-min, the module sheet and the popover's scoped styles. */
function pageFor(markup, palette, sheets = CORE_MIN_SHEETS) {
  const meta = '<meta charset="utf-8">';
  const head = renderedPageHead(['Popover']).replace(
    meta,
    () =>
      `${meta}${sheets.map((css) => `<style>${css}</style>`).join('')}${PANELS_SHOWN_ONE_AT_A_TIME}`
  );
  const sections = SPECIMENS.map(([id]) => {
    const frames = HOSTS.map((host) => {
      const classes =
        host === 'window'
          ? `application fabricate fabricate-app" ${THEME}="${palette}`
          : 'application';
      const { content, panel } = markup[id][host];
      const framed = host === 'window' ? panelWrapper(id, host, panel) : '';
      return `<div class="${classes}" data-host="${id}-${host}" style="width:340px">${content}${framed}</div>`;
    });
    return `<section style="display:flex;gap:24px;align-items:flex-start;padding:8px 0">${frames.join('')}</section>`;
  });
  const layered = SPECIMENS.map(([id]) => panelWrapper(id, 'bare', markup[id].bare.panel));
  return `${head}<body class="game" style="margin:0;padding:48px 24px;font-family:Arial, sans-serif">${sections.join('\n')}${layered.join('')}</body></html>`;
}

/** Each element of the panel `id` draws in `host`, in tree order, its box measured from the panel. */
function readHost({ id, host, properties, pseudo }) {
  const panel = document.querySelector(`[data-panel="${id}-${host}"] .fabricate-popover`);
  const origin = panel.getBoundingClientRect();
  const pick = (style, names) =>
    Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  return [panel, ...panel.querySelectorAll('*')].map((element) => {
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

/** Shows the panel of `id` in `host` alone, past two frames and every running transition. */
const show = (tab, id, host) =>
  tab.evaluate(async (shown) => {
    for (const wrapper of document.querySelectorAll('[data-panel]')) {
      wrapper.toggleAttribute('data-shown', wrapper.dataset.panel === shown);
    }
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
    await frame();
    await Promise.all(document.getAnimations().map((each) => each.finished.catch(() => {})));
    await frame();
  }, `${id}-${host}`);

const read = async (tab, id, host) => {
  await show(tab, id, host);
  return tab.evaluate(readHost, {
    id,
    host,
    properties: STANDALONE_COMPARED,
    pseudo: STANDALONE_PSEUDO_COMPARED,
  });
};

async function bothHosts(readOne) {
  const reads = {};
  for (const host of HOSTS) reads[host] = await readOne(host);
  return reads;
}

/** Every state's reads of every specimen in both hosts, on the page for `palette`. */
async function measure(markup, palette, sheets = CORE_MIN_SHEETS) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(pageFor(markup[palette], palette, sheets), { waitUntil: 'load' });
  const other = PALETTES.find((each) => each !== palette);
  await tab.evaluate(
    ([name, value]) => document.documentElement.setAttribute(name, value),
    [THEME, other]
  );
  await tab.mouse.move(0, 0);
  const reads = {
    rest: {},
    focus: {},
    hover: {},
    reduced: {},
    forced: {},
    reached: {},
    rooted: {},
  };
  for (const [id] of SPECIMENS) reads.rest[id] = await bothHosts((host) => read(tab, id, host));
  for (const id of FILLED) {
    reads.reached[id] = {};
    reads.focus[id] = {};
    reads.hover[id] = {};
    for (const host of HOSTS) {
      await show(tab, id, host);
      await tab.focus(`[data-sentinel="${id}-${host}"]`);
      await tab.keyboard.press('Tab');
      reads.reached[id][host] = await tab.evaluate(
        (selector) => document.activeElement === document.querySelector(selector),
        `[data-panel="${id}-${host}"] .fabricate-popover input`
      );
      reads.focus[id][host] = await read(tab, id, host);
      await tab.evaluate(() => document.activeElement?.blur());
      await tab.hover(`[data-panel="${id}-${host}"] .fabricate-popover button`, { force: true });
      reads.hover[id][host] = await read(tab, id, host);
      await tab.mouse.move(0, 0);
    }
  }
  await tab.emulateMedia({ reducedMotion: 'reduce' });
  for (const [id] of SPECIMENS) reads.reduced[id] = await bothHosts((host) => read(tab, id, host));
  await tab.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  for (const [id] of SPECIMENS) reads.forced[id] = await bothHosts((host) => read(tab, id, host));
  for (const [id] of SPECIMENS) {
    reads.rooted[id] = await tab.evaluate(
      (selector) => document.querySelector(selector)?.className ?? null,
      `[data-host="${id}-bare"] [data-target] > *`
    );
  }
  reads.coreReached = await tab.evaluate(
    () => getComputedStyle(document.querySelector('[data-sentinel]')).justifyContent
  );
  await tab.close();
  return reads;
}

const chrome = harvestedFoundryChromeCss(repoRoot);
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/published-standalone-root-rendered-popover.test.js',
  chrome,
});
const skip = skipWithoutHarvest(chrome);
/** The main admission file's layout-only rule, written on both hosts alike, laying them in flow. */
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
let harvested = null;

before(
  async () => {
    const markup = await mountSpecimens();
    browser = await chromium.launch();
    for (const palette of PALETTES) MEASURED[palette] = await measure(markup, palette);
    if (chrome) harvested = await measure(markup, 'fabricate', [chrome, HOSTS_IN_FLOW]);
  },
  { timeout: 280_000 }
);

after(async () => {
  await browser?.close();
});

describe('the standalone popover specimens', () => {
  it('draw every placement, a title alone, an ariaLabel alone, both, and an empty body', () => {
    const drawn = new Set(SPECIMENS.map(([, props]) => props.placement ?? 'bottom-start'));
    const byText = (left, right) => left.localeCompare(right);
    assert.deepEqual([...drawn].sort(byText), [...POPOVER_PLACEMENTS].sort(byText));
    const naming = SPECIMENS.map(([, { title, ariaLabel }]) => [
      Boolean(title),
      Boolean(ariaLabel),
    ]);
    for (const form of [
      [true, false],
      [false, true],
      [true, true],
    ]) {
      assert.ok(
        naming.some((each) => each.join(',') === form.join(',')),
        `${form} is drawn`
      );
    }
    assert.ok(
      SPECIMENS.some(([, props]) => !props.body),
      'an empty body'
    );
  });
});

for (const palette of PALETTES) {
  describe(`the published Popover in the ${palette} palette`, () => {
    it('draws each bare specimen’s target inside one Fabricate style root', () => {
      for (const [id, classes] of Object.entries(MEASURED[palette].rooted)) {
        assert.equal(classes, 'fabricate fabricate-standalone-root', id);
      }
    });

    it('reaches each filled panel’s first control from the keyboard in both hosts', () => {
      for (const id of FILLED) {
        assert.deepEqual(MEASURED[palette].reached[id], { window: true, bare: true }, id);
      }
    });

    for (const state of ['rest', 'focus', 'hover', 'reduced', 'forced']) {
      it(`computes the same styles, pseudo elements and border box in both hosts, ${state}`, () => {
        const reads = MEASURED[palette][state];
        assert.ok(Object.keys(reads).length > 0, `${state} read something`);
        for (const [id, { window, bare }] of Object.entries(reads)) {
          assert.ok(window.length > 0, `${id} drew its panel`);
          assert.deepEqual(bare, window, `${id} ${state}`);
        }
      });
    }

    it('changes what focus, hover and forced colours change, so each state was reached', () => {
      const { rest, focus, hover, forced } = MEASURED[palette];
      const differs = (state, id) =>
        JSON.stringify(state[id].bare) !== JSON.stringify(rest[id].bare);
      assert.ok(differs(focus, 'popover-titled'), 'focus draws the input’s ring');
      assert.ok(differs(hover, 'popover-titled'), 'the pointer is over the button');
      assert.ok(differs(forced, 'popover-titled'), 'forced colours repaint the panel');
    });
  });
}

describe('the published Popover over Foundry’s harvested sheet', { skip }, () => {
  it('really laid the harvested sheet over the page', () => {
    assert.equal(harvested.coreReached, 'center', "core's own button rule reached the sentinel");
  });

  for (const state of ['rest', 'focus', 'hover', 'reduced', 'forced']) {
    it(`computes the same styles, pseudo elements and border box in both hosts, ${state}`, () => {
      for (const [id, { window, bare }] of Object.entries(harvested[state])) {
        assert.deepEqual(bare, window, `${id} ${state}`);
      }
    });
  }
});
