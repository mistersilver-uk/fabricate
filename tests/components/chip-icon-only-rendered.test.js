/**
 * Issue 2858 — the published `Chip`'s icon-only form and `dashed` emphasis, measured in Chromium
 * on the markup the seam draws, under the chip's scoped styles: the 20px and 15px squares with the
 * glyph centred, under `truncate` and beside a blank label too; the role and name Chromium's own
 * accessibility tree, read over CDP, gives the icon-only chip, the named labelled chip and an
 * icon-only `li`, beside Playwright's snapshot of each and of a plain chip; no stop in the Tab
 * order; and the dashed edge on every side, solid on its sibling, kept under forced colours with
 * the icon-only chip's edge and glyph.
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
  companionTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-chip-icon-only-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/Chip.svelte',
});

const GLYPH = { icon: 'fas fa-hourglass-half', ariaLabel: 'Waiting on your roll' };
/** Each case's id and the props its chip takes. */
const CASES = Object.freeze([
  ['glyph', { ...GLYPH, tone: 'warning' }],
  ['glyph-list', { ...GLYPH, tone: 'info', density: 'list' }],
  ['glyph-dashed', { ...GLYPH, emphasis: 'dashed' }],
  ['glyph-truncate', { ...GLYPH, truncate: true }],
  ['glyph-blank', { ...GLYPH, children: '  ' }],
  ['named', { children: '3', ariaLabel: '3 days waiting', tone: 'info' }],
  ['unnamed', { children: '3', tone: 'info' }],
  ['plain', { children: 'Locked', icon: 'fas fa-lock' }],
  ['dashed', { children: 'Locked until the harvest', icon: 'fas fa-lock', emphasis: 'dashed' }],
]);
const SIDES = Object.freeze(['Top', 'Right', 'Bottom', 'Left']);

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
      const target = companionTarget(shells);
      const handle = ui.mount('Chip', { target, props });
      await settle();
      cells.push(`<div data-case="${id}">${target.innerHTML}</div>`);
      handle.destroy();
    }
    // `tag` is not published, so the `li` host is mounted directly, as Fabricate's own callers do.
    const item = await harness.mount({ tag: 'li', ...GLYPH });
    cells.push(`<ul data-case="glyph-li">${item.innerHTML}</ul>`);
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 600, height: 500 } });
  await tab.setContent(
    `${renderedPageHead(['Chip'])}<body class="game">` +
      '<div class="fabricate fabricate-app" data-fabricate-theme="fabricate" style="background:var(--fab-bg-1)">' +
      // Font Awesome is not loaded, so a check mark stands in for each glyph.
      String.raw`<style>[data-case]{display:flex;padding:8px} .fas::before{content:"\2713"}</style>` +
      `<button data-before>Before</button>${cells.join('')}<button data-after>After</button>` +
      '<i data-system style="color:CanvasText"></i></div></body></html>',
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const chipOf = (id) => `[data-case="${id}"] .manager-chip`;

/** The case's chip box, its glyph's centre offset, and its edge on every side. */
const drawn = (id) =>
  tab.$eval(chipOf(id), (chip) => {
    const box = chip.getBoundingClientRect();
    const glyph = chip.querySelector('i')?.getBoundingClientRect();
    const style = getComputedStyle(chip);
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    return {
      width: box.width,
      height: box.height,
      offset: glyph
        ? [
            Math.abs(glyph.x + glyph.width / 2 - (box.x + box.width / 2)),
            Math.abs(glyph.y + glyph.height / 2 - (box.y + box.height / 2)),
          ]
        : null,
      styles: sides.map((side) => style[`border${side}Style`]),
      edges: sides.map((side) => style[`border${side}Color`]),
      fill: style.backgroundColor,
      ink: glyph ? getComputedStyle(chip.querySelector('i')).color : style.color,
    };
  });

describe('the published icon-only Chip in Chromium', () => {
  it('draws the glyph centred on a 20px square at the default density and a 15px one at list', async () => {
    for (const [id, side] of [
      ['glyph', 20],
      ['glyph-list', 15],
      ['glyph-truncate', 20],
      ['glyph-blank', 20],
    ]) {
      const { width, height, offset } = await drawn(id);
      assert.deepEqual([width, height], [side, side], id);
      assert.ok(
        offset.every((delta) => delta <= 0.5),
        `${id} glyph off centre by ${offset}`
      );
    }
  });

  /** A node's role and name, and each descendant the tree does not ignore, by role and name. */
  const axOf = async (id) => {
    const { role, name, ignored, descendants } = await chromiumAxNode(tab, chipOf(id));
    const below = descendants
      .filter((node) => node.role !== 'InlineTextBox')
      .map((node) => `${node.role} "${node.name}"`);
    return { node: `${role} "${name}"`, ignored, below };
  };

  it('is an image under its ariaLabel with nothing beneath it, in Chromium’s own accessibility tree', async () => {
    assert.deepEqual(await axOf('glyph'), {
      node: 'image "Waiting on your roll"',
      ignored: false,
      below: [],
    });
  });

  it('reads a named labelled chip as its name alone, with no image role and the label ignored', async () => {
    const { node, below } = await axOf('named');
    assert.ok(!node.startsWith('image'), node);
    assert.deepEqual(below, ['StaticText "3 days waiting"']);
  });

  it('draws a named labelled chip exactly as its unnamed twin, the hidden name taking no room', async () => {
    const box = (id) =>
      tab.$eval(chipOf(id), (chip) => {
        const { width, height } = chip.getBoundingClientRect();
        return [width, height];
      });
    assert.deepEqual(await box('named'), await box('unnamed'));
  });

  it('keeps an li host its list item role and speaks the name inside it', async () => {
    const item = await chromiumAxNode(tab, '[data-case="glyph-li"] > li');
    assert.equal(item.role, 'listitem');
    assert.deepEqual(
      item.descendants.filter((node) => node.role !== 'InlineTextBox').map((node) => node.name),
      ['Waiting on your roll']
    );
  });

  it('matches Playwright’s accessibility snapshot of each chip, a plain one read as its text', async () => {
    const tree = async (id) => String(await tab.locator(`[data-case="${id}"]`).ariaSnapshot());
    assert.equal(await tree('glyph'), '- img "Waiting on your roll"');
    assert.equal(await tree('named'), '- text: 3 days waiting');
    assert.equal(await tree('plain'), '- text: Locked');
  });

  it('takes no stop in the Tab order', async () => {
    await tab.focus('[data-before]');
    await tab.keyboard.press('Tab');
    const reached = await tab.evaluate(() => document.activeElement?.hasAttribute('data-after'));
    assert.equal(reached, true, 'Tab moves from the button before the chips to the one after');
  });
});

describe('the published dashed Chip in Chromium', () => {
  it('dashes the edge on every side of the labelled and the icon-only chip, and its sibling stays solid', async () => {
    for (const id of ['dashed', 'glyph-dashed']) {
      assert.deepEqual(
        (await drawn(id)).styles,
        SIDES.map(() => 'dashed'),
        id
      );
    }
    assert.deepEqual(
      (await drawn('plain')).styles,
      SIDES.map(() => 'solid')
    );
  });

  it('keeps the dashed edge, and the icon-only chip its edge and glyph, under forced colours', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      const canvasText = await tab.$eval('[data-system]', (probe) => getComputedStyle(probe).color);
      for (const id of ['dashed', 'glyph-dashed']) {
        assert.deepEqual(
          (await drawn(id)).styles,
          SIDES.map(() => 'dashed'),
          id
        );
      }
      assert.deepEqual(
        (await drawn('plain')).styles,
        SIDES.map(() => 'solid')
      );
      const glyph = await drawn('glyph');
      assert.deepEqual(
        glyph.styles,
        SIDES.map(() => 'solid')
      );
      assert.ok(
        glyph.edges.every((edge) => edge !== 'rgba(0, 0, 0, 0)' && edge !== glyph.fill),
        `the square keeps a visible edge: ${glyph.edges} on ${glyph.fill}`
      );
      assert.equal(glyph.ink, canvasText, 'the glyph is drawn in the reader’s text colour');
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });
});
