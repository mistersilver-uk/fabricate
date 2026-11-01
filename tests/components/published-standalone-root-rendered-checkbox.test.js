/**
 * The standalone style root's admission clause for the published `SelectionCheckbox` (issue 2836),
 * in Chromium: its specimens mounted through the real seam in happy-dom into the player window's
 * `.window-content` and into a bare ApplicationV2 one, then drawn in one page per palette with
 * `<html>` naming the other. Every element computes the same compared properties, pseudo elements
 * and border box in both hosts at rest, under keyboard focus, under the pointer, under reduced
 * motion and under forced colours, and its specimens draw every value of the keys the box reads.
 * It is a file of its own so `published-standalone-root-rendered.test.js` stays inside the
 * per-file timeout; it repeats that file's minimum, the target face, the core-min sheets and the
 * per-element read, without panels, slots or the harvested arm, which no checkbox draws or needs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  STANDALONE_COMPARED,
  STANDALONE_PSEUDO_COMPARED,
} from '../fixtures/published-components/standaloneSpecimens.js';
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
const LABEL = 'Award the recipe’s ingredients first';
const fixture = (name) => readFileSync(resolve(repoRoot, `tests/fixtures/${name}`), 'utf8');
const CORE_MIN_SHEETS = Object.freeze([
  fixture('foundry-core-button-min.css'),
  fixture('foundry-core-input-min.css'),
]);
/** The target face `published-standalone-root-rendered.test.js` writes on both hosts. */
const targetFace = (width) =>
  `width: ${width}px; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px`;

/** Each specimen's props, `onChange` aside: together they draw every value of the keys the box reads. */
const SPECIMENS = Object.freeze([
  ['checkbox-off', { checked: false, label: LABEL }],
  ['checkbox-on-compact', { checked: true, density: 'compact', label: 'Spent' }],
  [
    'checkbox-mixed-comfortable-named',
    { checked: false, indeterminate: true, density: 'comfortable', ariaLabel: 'Select Iron ore' },
  ],
  ['checkbox-disabled', { checked: true, disabled: true, label: LABEL }],
  ['checkbox-off-compact', { checked: false, density: 'compact', label: 'Spent' }],
  [
    'checkbox-disabled-mixed',
    { checked: false, indeterminate: true, disabled: true, density: 'comfortable', label: LABEL },
  ],
]);
/** The specimens Tab reaches, whose input takes keyboard focus. */
const FOCUSED = SPECIMENS.filter(([, props]) => props.disabled !== true).map(([id]) => id);

let browser;
const MEASURED = {};

/** One specimen's target as drawn under a frame classed `classes`, its field state written back. */
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
  const handle = ui.mount('SelectionCheckbox', { target, props: { ...props, onChange() {} } });
  flushSync();
  for (const field of target.querySelectorAll('input')) {
    field.toggleAttribute('checked', field.checked);
  }
  const html = target.outerHTML;
  handle.destroy();
  frame.remove();
  return html;
}

async function mountSpecimens() {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-standalone-root-checkbox-',
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

/** The page: the core-min sheets, core-min, the module sheet and the box's scoped styles. */
function pageFor(markup, palette) {
  const meta = '<meta charset="utf-8">';
  const head = renderedPageHead(['SelectionCheckbox']).replace(
    meta,
    () => `${meta}${CORE_MIN_SHEETS.map((css) => `<style>${css}</style>`).join('')}`
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
      box:
        style.display === 'contents'
          ? null
          : [box.width, box.height, box.left - origin.left, box.top - origin.top].map(Math.round),
    };
  });
}

const read = (tab, id, host) =>
  tab.evaluate(readHost, {
    id,
    host,
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

/** Where Tab from a host's sentinel lands, and whether it is the input under `:focus-visible`. */
const focusOf = (tab, id, host) =>
  tab.evaluate((selector) => {
    const input = document.querySelector(selector);
    return document.activeElement === input && input.matches(':focus-visible');
  }, `[data-host="${id}-${host}"] input`);

/** Every state's reads of every specimen in both hosts, on the page for `palette`. */
async function measure(markup, palette) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(pageFor(markup[palette], palette), { waitUntil: 'load' });
  const other = PALETTES.find((each) => each !== palette);
  await tab.evaluate(
    ([name, value]) => document.documentElement.setAttribute(name, value),
    [THEME, other]
  );
  await tab.mouse.move(0, 0);
  await settled(tab);
  const reads = { rest: {}, focus: {}, hover: {}, reduced: {}, forced: {}, reached: {} };
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
      await tab.hover(`[data-host="${id}-${host}"] .fab-selection-checkbox`, { force: true });
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

before(
  async () => {
    const markup = await mountSpecimens();
    browser = await chromium.launch();
    for (const palette of PALETTES) MEASURED[palette] = await measure(markup, palette);
  },
  { timeout: 280_000 }
);

after(async () => {
  await browser?.close();
});

describe('the standalone checkbox specimens', () => {
  it('draw every value of checked, indeterminate, disabled, density and label', () => {
    const drawn = (key, read) => new Set(SPECIMENS.map(([, props]) => read(props[key])));
    const flag = (value) => value === true;
    const both = new Set([false, true]);
    assert.deepEqual(drawn('checked', flag), both);
    assert.deepEqual(drawn('indeterminate', flag), both);
    assert.deepEqual(drawn('disabled', flag), both);
    assert.deepEqual(drawn('label', Boolean), both);
    // Read from the box's own table, so a fourth density cannot hide.
    const table = [
      ...walkNodes(componentAstOf('src/ui/svelte/components/SelectionCheckbox.svelte').instance),
    ].find((node) => node.type === 'VariableDeclarator' && node.id?.name === 'DENSITY_CLASSES');
    const densities = new Set(
      table.init.arguments[0].properties.map(({ key }) => key.name ?? key.value)
    );
    assert.equal(densities.size, 3, 'the density table was read');
    assert.deepEqual(
      drawn('density', (value) => value ?? 'default'),
      densities
    );
  });
});

for (const palette of PALETTES) {
  describe(`the published SelectionCheckbox in the ${palette} palette`, () => {
    it('draws each bare specimen inside one Fabricate style root, and each window one under none', () => {
      const { rooted } = MEASURED[palette];
      assert.equal(rooted.length, SPECIMENS.length);
      for (const classes of rooted) assert.ok(classes.split(' ').includes('fabricate'), classes);
    });

    it('reaches each enabled input from the keyboard in both hosts', () => {
      for (const id of FOCUSED) {
        assert.deepEqual(MEASURED[palette].reached[id], { window: true, bare: true }, id);
      }
    });

    for (const state of ['rest', 'focus', 'hover', 'reduced', 'forced']) {
      it(`computes the same styles, pseudo elements and border box in both hosts, ${state}`, () => {
        const reads = MEASURED[palette][state];
        assert.ok(Object.keys(reads).length > 0, `${state} read something`);
        for (const [id, { window, bare }] of Object.entries(reads)) {
          assert.ok(window.length >= 3, `${id} drew its wrapper, input and box`);
          assert.deepEqual(bare, window, `${id} ${state}`);
        }
      });
    }

    it('changes what focus, hover and forced colours change, so each state was reached', () => {
      const { rest, focus, hover, forced } = MEASURED[palette];
      const differs = (state, id) =>
        JSON.stringify(state[id].bare) !== JSON.stringify(rest[id].bare);
      assert.ok(differs(focus, 'checkbox-off'), 'focus draws the ring');
      assert.ok(differs(hover, 'checkbox-off'), 'the pointer raises the empty edge');
      assert.ok(differs(forced, 'checkbox-on-compact'), 'forced colours repaint the box');
    });
  });
}
