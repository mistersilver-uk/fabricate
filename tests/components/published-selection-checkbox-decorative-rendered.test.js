/**
 * Issue 2881 — the published `SelectionCheckbox`'s decorative form and success tone, measured in
 * Chromium on the markup the seam draws in a companion's shell, each decorative box inside the
 * companion's own `<button aria-pressed>` row beside its own text: Chromium's tree gives the row
 * its role, name and pressed state and the box nothing, the decorative box keeps its 16, 20 and
 * 22px rungs, and the ticked success box paints `--fab-success` inside a `--fab-success-strong`
 * edge with its tick in `--fab-on-success` in all seven palettes, the edge clearing 3:1 over the
 * four grounds and the tick 3:1 on the fill; under forced colours it takes `Highlight` and its
 * tick `HighlightText`, as the accent box does.
 * Limit: Font Awesome is not loaded, so a check mark stands in for the tick glyph.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { chromiumAxNode, chromiumAxState } from '../helpers/chromiumAxNode.js';
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
import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { contrast, themePalettes } from '../helpers/themePaletteContrast.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-selection-checkbox-decorative-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/SelectionCheckbox.svelte',
});

const PALETTES = Object.freeze([
  ...themePalettes(rulesIn(collectStyleCorpus()['styles/fabricate.css'])).keys(),
]);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const OBJECTIVE = 'Gather three iron ore';
/** Each row's id, whether it is pressed, and the props its decorative box takes. */
const ROWS = Object.freeze([
  ['done', true, { checked: true, tone: 'success' }],
  ['open', false, { checked: false, tone: 'success' }],
  ['done-compact', true, { checked: true, tone: 'success', density: 'compact' }],
  ['done-comfortable', true, { checked: true, tone: 'success', density: 'comfortable' }],
  ['accent', true, { checked: true }],
]);

let browser;
let tab;

/** The companion's own row: its pressable button holding the box the seam drew, then its text. */
const rowOf = (id, pressed, html) =>
  `<button type="button" data-row="${id}" aria-pressed="${pressed}" style="display:flex;gap:8px;align-items:center;padding:6px;background:var(--fab-bg-1);color:var(--fab-text);border:0">` +
  `<span data-target>${html}</span><span${pressed ? ' style="text-decoration:line-through"' : ''}>${OBJECTIVE}</span></button>`;

before(async () => {
  const shells = [];
  const rows = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report: assert.fail });
    const mounted = ROWS.map(([id, pressed, props]) => {
      const target = companionTarget(shells);
      const handle = ui.mount('SelectionCheckbox', {
        target,
        props: { ...props, decorative: true },
      });
      return { id, pressed, target, handle };
    });
    await settle();
    for (const { id, pressed, target, handle } of mounted) {
      rows.push(rowOf(id, pressed, target.innerHTML));
      handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 600, height: 600 } });
  await tab.setContent(
    `${renderedPageHead(['SelectionCheckbox'])}<body class="game">` +
      String.raw`<style>.fa-check::before{content:"\2713"} .fa-minus::before{content:"\2212"}</style>` +
      `<div data-companion>${rows.join('')}</div>` +
      '<i data-system style="color:HighlightText;background:Highlight"></i></body></html>',
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

/** A computed `rgb(r, g, b)` in the space-separated form the contrast helper reads. */
const spaced = (colour) => colour.replaceAll(/,\s*/gu, ' ');
const boxOf = (id) => `[data-row="${id}"] .fab-selection-check`;

/** A row's box: its border-box size, fill, edge and tick colour, and the tick's visibility. */
const paintOf = (id) =>
  tab.$eval(boxOf(id), (box) => {
    const style = getComputedStyle(box);
    const glyph = getComputedStyle(box.querySelector('i'));
    return {
      width: box.getBoundingClientRect().width,
      height: box.getBoundingClientRect().height,
      fill: style.backgroundColor,
      edge: style.borderTopColor,
      tick: glyph.color,
      visibility: glyph.visibility,
    };
  });

/** What `--fab-*` tokens resolve to on the page's root, as computed colours. */
const tokensOf = (names) =>
  tab.evaluate((list) => {
    const probe = document.createElement('i');
    document.body.append(probe);
    const read = Object.fromEntries(
      list.map((name) => {
        probe.style.color = `var(${name})`;
        return [name, getComputedStyle(probe).color];
      })
    );
    probe.remove();
    return read;
  }, names);

describe('the decorative box inside a companion’s pressable row', () => {
  for (const [id, pressed] of ROWS) {
    it(`${id}: the row is one pressable button named by its own text, and the box adds nothing`, async () => {
      const row = await chromiumAxState(tab, `[data-row="${id}"]`);
      assert.equal(row.role, 'button');
      assert.equal(row.name, OBJECTIVE);
      assert.equal(row.pressed, pressed ? 'true' : 'false');
      const tree = await chromiumAxNode(tab, `[data-row="${id}"]`);
      assert.deepEqual(
        tree.descendants.filter(({ role }) => role !== 'StaticText' && role !== 'InlineTextBox'),
        [],
        'no checkbox, image or generic node of the box'
      );
      // Chromium prunes a hidden node inside a button's subtree, or keeps it ignored.
      const box = await chromiumAxNode(tab, boxOf(id)).catch(() => ({ ignored: true }));
      assert.equal(box.ignored, true, 'the box is hidden from the tree');
    });
  }

  it('draws no checkbox anywhere in the page, and nothing focusable inside a row', async () => {
    assert.equal(await tab.getByRole('checkbox').count(), 0);
    assert.equal(await tab.locator('[data-row] :is(input, label, [tabindex])').count(), 0);
    assert.equal(await tab.getByRole('button', { name: OBJECTIVE, pressed: true }).count(), 4);
  });

  it('keeps the 16, 20 and 22px rungs', async () => {
    const paints = await Promise.all(['done-compact', 'done', 'done-comfortable'].map(paintOf));
    assert.deepEqual(
      paints.map(({ width, height }) => [width, height]),
      [
        [16, 16],
        [20, 20],
        [22, 22],
      ]
    );
  });
});

describe('the ticked success box in every palette', () => {
  for (const palette of PALETTES) {
    it(`${palette}: fills --fab-success inside a --fab-success-strong edge with the tick in --fab-on-success, each density, and an empty one keeps the outline`, async () => {
      await tab.evaluate((name) => {
        document.documentElement.setAttribute('data-fabricate-theme', name);
      }, palette);
      const tokens = await tokensOf([
        '--fab-success',
        '--fab-success-strong',
        '--fab-on-success',
        '--fab-accent',
        '--fab-text-subtle',
        ...GROUNDS,
      ]);
      const ids = ['done', 'done-compact', 'done-comfortable'];
      const paints = await Promise.all(ids.map(paintOf));
      for (const [index, id] of ids.entries()) {
        const paint = paints[index];
        assert.deepEqual(
          [paint.fill, paint.edge, paint.tick],
          [tokens['--fab-success'], tokens['--fab-success-strong'], tokens['--fab-on-success']],
          id
        );
        assert.ok(contrast(spaced(paint.tick), spaced(paint.fill)) >= 3, `${id} tick on its fill`);
        for (const ground of GROUNDS) {
          assert.ok(
            contrast(spaced(paint.edge), spaced(tokens[ground])) >= 3,
            `${id} edge on ${ground}`
          );
        }
      }
      const open = await paintOf('open');
      assert.equal(open.edge, tokens['--fab-text-subtle'], 'an empty success box is unchanged');
      assert.equal((await paintOf('accent')).fill, tokens['--fab-accent']);
    });
  }
});

describe('the success box under forced colours', () => {
  it('fills Highlight with the tick in HighlightText, as the accent box does, and an empty box hides its tick', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      const system = await tab.$eval('[data-system]', (probe) => ({
        fill: getComputedStyle(probe).backgroundColor,
        tick: getComputedStyle(probe).color,
      }));
      const ids = ['done', 'done-compact', 'accent'];
      const paints = await Promise.all(ids.map(paintOf));
      assert.deepEqual(
        paints.map(({ fill, tick }) => [fill, tick]),
        ids.map(() => [system.fill, system.tick])
      );
      assert.equal((await paintOf('open')).visibility, 'hidden');
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });
});
