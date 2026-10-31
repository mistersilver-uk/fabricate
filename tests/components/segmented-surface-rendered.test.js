/**
 * Issue 2856 — the published `SegmentedControl`'s `surface` and option names, measured in
 * Chromium on the markup the seam draws, under the module sheet and the control's scoped styles:
 * each density's track height on either surface, the `'panel'` track's `--fab-bg-0` fill in all
 * seven palettes over every density's own fill and none in the `'pill'` shape, its idle, hover,
 * selected and keyboard-focused faces, forced colours, and each radio's name as the arrow keys
 * reach it.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { chromiumAxNode } from '../helpers/chromiumAxNode.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-segmented-surface-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});
const { hashClass } = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/components/SegmentedControl.svelte')
);

const THEMES = Object.freeze([
  'fabricate',
  'mythwright',
  'ironblood-forge',
  'hearth-herb',
  'starglass-arcana',
  'foundry-native',
  'sovereign',
]);
const DENSITIES = Object.freeze(['default', 'compact', 'field', 'inline']);
/** Each density's own track fill, which `'panel'` replaces. */
const OWN_FILL = Object.freeze({
  default: '--fab-surface-soft',
  compact: '--fab-bg-1',
  field: '--fab-bg-1',
  inline: '--fab-bg-1',
});
const TOKENS = Object.freeze([
  '--fab-bg-0',
  '--fab-bg-1',
  '--fab-surface-soft',
  '--fab-text-muted',
  '--fab-text-secondary',
  '--fab-text',
  '--fab-accent',
]);
const OPTIONS = Object.freeze([
  { value: 'oak', label: 'Oak', ariaLabel: 'Oak, chosen by Mira' },
  { value: 'ash', label: 'Ash' },
  { value: 'yew', label: 'Yew', ariaLabel: 'Yew, not chosen' },
]);

/** Each case's id and the props its control takes beside `options`, `ariaLabel` and `onChange`. */
const CASES = Object.freeze([
  ...DENSITIES.flatMap((density) => [
    [`panel-${density}`, { density, surface: 'panel' }],
    [`own-${density}`, { density }],
    [`sized-${density}`, { density, size: 34 }],
    [`sized-panel-${density}`, { density, size: '34', surface: 'panel' }],
  ]),
  ['sized-pill', { shape: 'pill', size: 34 }],
  ['sized-panel-pill', { shape: 'pill', size: 34, surface: 'panel' }],
  ...['compact', 'field', 'inline'].map((density) => [
    `pill-${density}`,
    { density, shape: 'pill' },
  ]),
  ['unsized-35', { density: 'compact', size: 35 }],
  ['unsized-px', { density: 'compact', size: '34px' }],
  ['panel-pill', { shape: 'pill', surface: 'panel' }],
  ['panel-accent', { density: 'compact', tone: 'accent', surface: 'panel' }],
]);

let browser;
let tab;

before(async () => {
  const shells = [];
  const cells = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    for (const [id, props] of CASES) {
      const target = fabricateTarget(shells);
      const handle = ui.mount('SegmentedControl', {
        target,
        props: { options: OPTIONS, value: 'oak', ariaLabel: 'Reward', onChange() {}, ...props },
      });
      await settle();
      cells.push(`<div data-case="${id}">${target.innerHTML}</div>`);
      handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  const probes = TOKENS.map(
    (token) => `<i data-token="${token}" style="background:var(${token})"></i>`
  ).join('');
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await tab.setContent(
    `${renderedPageHead(['SegmentedControl'])}<body class="game">` +
      '<div class="fabricate fabricate-app" data-fabricate-theme="fabricate" style="background:var(--fab-bg-1)">' +
      `<style>[data-case]{display:flex;padding:8px}</style>${cells.join('')}<div>${probes}</div></div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

/** Names every case's segmented markup carries the component's scope hash, or the CSS is not reached. */
const trackOf = (id) => `[data-case="${id}"] .manager-segmented`;

/** The case's track and its segments, as Chromium computes them now. */
const faceOf = (id) =>
  tab.$eval(trackOf(id), (track) => {
    const face = (element) => {
      const style = getComputedStyle(element);
      return {
        ink: style.color,
        fill: style.backgroundColor,
        edge: style.borderTopColor,
        weight: style.fontWeight,
        outline: [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor],
      };
    };
    const [chosen, idle] = [
      track.querySelector('.manager-segment.is-active'),
      track.querySelector('.manager-segment:not(.is-active)'),
    ];
    return {
      height: track.getBoundingClientRect().height,
      fill: getComputedStyle(track).backgroundColor,
      chosen: face(chosen),
      idle: face(idle),
    };
  });

const tokens = () =>
  tab.$$eval('[data-token]', (probes) =>
    Object.fromEntries(
      probes.map((probe) => [probe.dataset.token, getComputedStyle(probe).backgroundColor])
    )
  );

const setTheme = (theme) =>
  tab.$eval(
    '.fabricate-app',
    (root, name) => root.setAttribute('data-fabricate-theme', name),
    theme
  );

describe('the published SegmentedControl surface in Chromium', () => {
  it('draws the markup under the control’s scoped styles', async () => {
    const scoped = await tab.$$eval(
      '.manager-segmented',
      (tracks, hash) => tracks.filter((track) => track.classList.contains(hash)).length,
      hashClass
    );
    assert.equal(scoped, CASES.length);
  });

  it('keeps each density’s track height on the panel surface: 36px compact and field, 30px inline', async () => {
    const heights = {};
    for (const density of DENSITIES) {
      const [panel, own] = [await faceOf(`panel-${density}`), await faceOf(`own-${density}`)];
      assert.equal(panel.height, own.height, `${density}: the surface moves no height`);
      heights[density] = panel.height;
    }
    assert.deepEqual(
      { compact: heights.compact, field: heights.field, inline: heights.inline },
      { compact: 36, field: 36, inline: 30 }
    );
    assert.ok(heights.default > 0);
  });

  it('draws the pill shape 8px shorter, as it drops the track padding: 28px compact and field, 26px inline', async () => {
    const pills = {};
    for (const density of ['compact', 'field', 'inline']) {
      pills[density] = (await faceOf(`pill-${density}`)).height;
    }
    assert.deepEqual(pills, { compact: 28, field: 28, inline: 26 });
  });

  it('pins the track at 34px for size 34 or "34" on every density and in the pill shape, each segment filling it inside the padding', async () => {
    const pinned = [
      'sized-pill',
      'sized-panel-pill',
      ...DENSITIES.flatMap((d) => [`sized-${d}`, `sized-panel-${d}`]),
    ];
    for (const id of pinned) {
      const box = await tab.$eval(trackOf(id), (track) => {
        const style = getComputedStyle(track);
        const inner =
          track.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const segments = [...track.querySelectorAll('.manager-segment')];
        return {
          height: track.getBoundingClientRect().height,
          filled: segments.every((segment) => segment.getBoundingClientRect().height === inner),
        };
      });
      assert.deepEqual(box, { height: 34, filled: true }, id);
    }
    for (const id of ['unsized-35', 'unsized-px']) {
      assert.equal((await faceOf(id)).height, 36, `${id} keeps the compact track's own height`);
    }
  });

  it('fills the panel track with --fab-bg-0 over every density’s own fill, in all seven palettes', async () => {
    for (const theme of THEMES) {
      await setTheme(theme);
      const paint = await tokens();
      assert.notEqual(paint['--fab-bg-0'], paint['--fab-bg-1'], `${theme} has two grounds`);
      for (const density of DENSITIES) {
        assert.equal((await faceOf(`panel-${density}`)).fill, paint['--fab-bg-0'], theme);
        const own = (await faceOf(`own-${density}`)).fill;
        assert.equal(own, paint[OWN_FILL[density]], `${theme} ${density} keeps its own fill`);
      }
    }
    await setTheme('fabricate');
  });

  it('draws no track fill in the pill shape, and leaves a tone’s selected fill to the tone', async () => {
    const paint = await tokens();
    assert.equal((await faceOf('panel-pill')).fill, 'rgba(0, 0, 0, 0)');
    assert.equal((await faceOf('sized-panel-pill')).fill, 'rgba(0, 0, 0, 0)');
    const accent = await faceOf('panel-accent');
    assert.equal(accent.fill, paint['--fab-bg-0']);
    assert.equal(accent.chosen.fill, paint['--fab-accent']);
  });

  it('inks the idle segment muted at rest and secondary under the pointer, and the chosen one in --fab-text at 600', async () => {
    const paint = await tokens();
    for (const density of DENSITIES) {
      const id = `panel-${density}`;
      const rest = await faceOf(id);
      assert.equal(rest.idle.ink, paint['--fab-text-muted'], `${density} idle`);
      assert.equal(rest.chosen.ink, paint['--fab-text'], `${density} chosen`);
      assert.deepEqual([rest.chosen.weight, rest.idle.weight], ['600', '500'], density);
      await tab.hover(`${trackOf(id)} .manager-segment:not(.is-active)`);
      assert.equal((await faceOf(id)).idle.ink, paint['--fab-text-secondary'], `${density} hover`);
      await tab.mouse.move(0, 0);
    }
  });

  it('draws the 2px accent keyboard ring 2px clear of a focused segment on the panel track', async () => {
    const paint = await tokens();
    await tab.focus(`${trackOf('panel-compact')} input[value="oak"]`);
    await tab.keyboard.press('ArrowRight');
    const focused = await tab.$eval(`${trackOf('panel-compact')} input:focus`, (radio) => {
      const style = getComputedStyle(radio.closest('label'));
      return [
        radio.value,
        style.outlineStyle,
        style.outlineWidth,
        style.outlineOffset,
        style.outlineColor,
      ];
    });
    assert.deepEqual(focused, ['ash', 'solid', '2px', '2px', paint['--fab-accent']]);
    const idle = await faceOf('panel-field');
    assert.equal(idle.idle.outline[0], 'none', 'no ring without focus');
    await tab.$eval('input:focus', (radio) => radio.blur());
  });

  it('carries the selected state by weight under forced colours on the panel track, as on its own', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      for (const density of DENSITIES) {
        for (const id of [`panel-${density}`, `own-${density}`]) {
          const { chosen, idle } = await faceOf(id);
          assert.deepEqual([chosen.weight, idle.weight], ['600', '500'], id);
        }
      }
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });
});

describe('the published SegmentedControl option names in Chromium', () => {
  /** The focused radio's role, name and checked state, in Playwright's accessibility snapshot. */
  const focusedNode = async () =>
    String(await tab.locator(`${trackOf('panel-default')} input:focus`).ariaSnapshot());

  it('announces each radio the arrow keys reach by its ariaLabel, or by its label without one', async () => {
    await tab.$eval(`${trackOf('panel-default')} input[value="oak"]`, (radio) => {
      radio.checked = true;
    });
    await tab.focus(`${trackOf('panel-default')} input[value="oak"]`);
    const heard = [await focusedNode()];
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']) {
      await tab.keyboard.press(key);
      heard.push(await focusedNode());
    }
    assert.deepEqual(heard, [
      '- radio "Oak, chosen by Mira" [checked]',
      '- radio "Ash" [checked]',
      '- radio "Yew, not chosen" [checked]',
      '- radio "Oak, chosen by Mira" [checked]',
      '- radio "Yew, not chosen" [checked]',
    ]);
  });

  it('names each radio in Chromium’s own accessibility tree by its ariaLabel, or by its label without one', async () => {
    const radio = (value) =>
      chromiumAxNode(tab, `${trackOf('panel-default')} input[value="${value}"]`);
    const read = await Promise.all(['oak', 'ash', 'yew'].map(radio));
    assert.deepEqual(
      read.map(({ role, name, ignored }) => [role, name, ignored]),
      [
        ['radio', 'Oak, chosen by Mira', false],
        ['radio', 'Ash', false],
        ['radio', 'Yew, not chosen', false],
      ]
    );
  });

  it('keeps the group named by its own ariaLabel and every visible label as authored', async () => {
    const tree = String(await tab.locator(trackOf('own-default')).ariaSnapshot());
    assert.match(tree, /^- radiogroup "Reward":/u);
    const shown = await tab.$$eval(`${trackOf('own-default')} .manager-segment-label`, (labels) =>
      labels.map((label) => label.textContent)
    );
    assert.deepEqual(shown, ['Oak', 'Ash', 'Yew']);
  });
});
