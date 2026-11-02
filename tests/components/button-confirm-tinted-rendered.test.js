/**
 * The published `Button` in Chromium, on the markup the seam draws, under the module sheet, in all
 * seven palettes: the `confirm` role (issue 2890) at rest, under the pointer, disabled, busy, under
 * keyboard focus and under forced colours.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { buttonFaceOf, openButtonCases, tokenColours } from '../helpers/renderedButtonCases.js';
import { contrast, flatten } from '../helpers/themePaletteContrast.js';

const { mountEntry } = publishedEntrySeam('fab-button-confirm-tinted-rendered-');

const ROLES = Object.freeze([
  'neutral',
  'primary',
  'ghost',
  'dashed',
  'danger',
  'warning',
  'info',
  'accent',
  'urgent',
  'confirm',
]);
const THEMES = Object.freeze([
  'fabricate',
  'mythwright',
  'ironblood-forge',
  'hearth-herb',
  'starglass-arcana',
  'foundry-native',
  'sovereign',
]);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const TINTS = Object.freeze(['info', 'accent', 'success', 'warning', 'danger']);
const TOKENS = Object.freeze([
  ...GROUNDS,
  '--fab-bg-3',
  ...TINTS.map((tint) => `--fab-${tint}-soft`),
  '--fab-accent',
  '--fab-success-text',
  '--fab-success-strong',
]);

/** Each case's id and the props its button takes beside its label, glyph and `onclick`. */
const CASES = Object.freeze([
  ...ROLES.map((role) => [role, { role }]),
  ['neutral-disabled', { disabled: true }],
  ['confirm-disabled', { role: 'confirm', disabled: true }],
  ['confirm-busy', { role: 'confirm', busy: true }],
]);

let browser;
let tab;
let opened;

/** Opens the page that holds every case, once per file. */
async function renderPage() {
  ({ browser, tab } = await openButtonCases({
    mountEntry,
    base: { children: 'Confirm the stage', icon: 'fas fa-check' },
    cases: CASES,
    tokens: TOKENS,
    viewport: { width: 600, height: 900 },
  }));
}

const openPage = () => (opened ??= renderPage());

after(async () => {
  await browser?.close();
});

const faceOf = (id) => buttonFaceOf(tab, id);
const probesNow = () => tokenColours(tab);

const setTheme = (theme) =>
  tab.evaluate((id) => {
    document.querySelector('.fabricate').dataset.fabricateTheme = id;
  }, theme);

const rest = async () => {
  await tab.mouse.move(590, 890);
  await tab.evaluate(() => document.activeElement?.blur());
};

const hover = async (id) => {
  await tab.hover(`[data-case="${id}"] button`);
  return faceOf(id);
};

/** A computed `rgb()`/`rgba()` as the palette helper's `rgb(r g b / a%)`. */
function paletteForm(computed) {
  const [r, g, b, a = '1'] = computed.match(/[\d.]+/gu);
  return `rgb(${r} ${g} ${b} / ${Number(a) * 100}%)`;
}

/** The opaque colour `stack` paints, its layers computed colours, top first. */
const paint = (stack) =>
  stack
    .slice(0, -1)
    .reduceRight((base, layer) => flatten(paletteForm(layer), base), paletteForm(stack.at(-1)));

/** A face's label, edge and tile contrast where it sits on the opaque `surround`. */
function readings(face, surround) {
  const fill = flatten(paletteForm(face.fill), surround);
  return {
    label: contrast(paletteForm(face.ink), fill),
    edge: contrast(paletteForm(face.edge), surround),
    tile: contrast(fill, surround),
  };
}

describe('the published Button confirm role, rendered (issue 2890)', () => {
  before(openPage);

  it('draws no fill at rest, the success text label inside the strong success edge, and the soft success fill under the pointer', async () => {
    await setTheme('fabricate');
    await rest();
    const token = await probesNow();
    const face = await faceOf('confirm');
    const ink = token['--fab-success-text'];
    assert.deepEqual(
      [face.ink, face.fill, face.edge],
      [ink, 'rgba(0, 0, 0, 0)', token['--fab-success-strong']]
    );
    const hovered = await hover('confirm');
    assert.deepEqual(
      [hovered.ink, hovered.fill, hovered.edge],
      [ink, token['--fab-success-soft'], token['--fab-success-strong']]
    );
  });

  it('differs from the neutral and primary faces in ink, fill and edge', async () => {
    await rest();
    const [neutral, primary, confirm] = await Promise.all(
      ['neutral', 'primary', 'confirm'].map((id) => faceOf(id))
    );
    for (const face of [neutral, primary]) {
      assert.notEqual(confirm.ink, face.ink);
      assert.notEqual(confirm.fill, face.fill);
      assert.notEqual(confirm.edge, face.edge);
    }
  });

  it('clears 4.5:1 for its label and 3:1 for its edge on the four grounds, at rest and under the pointer, in all seven palettes, and not on --fab-bg-3 in each', async (t) => {
    const found = [];
    const shortOnBg3 = new Set();
    let worst = { label: Infinity, edge: Infinity };
    for (const theme of THEMES) {
      await setTheme(theme);
      await rest();
      const token = await probesNow();
      for (const [state, face] of [
        ['rest', await faceOf('confirm')],
        ['hover', await hover('confirm')],
      ]) {
        for (const ground of GROUNDS) {
          const read = readings(face, paint([token[ground]]));
          worst = {
            label: Math.min(worst.label, read.label),
            edge: Math.min(worst.edge, read.edge),
          };
          if (read.label < 4.5) found.push(`${theme} ${state} ${ground} label ${read.label}`);
          if (read.edge < 3) found.push(`${theme} ${state} ${ground} edge ${read.edge}`);
        }
        if (readings(face, paint([token['--fab-bg-3']])).label < 4.5) shortOnBg3.add(theme);
      }
    }
    t.diagnostic(`worst label ${worst.label.toFixed(2)}:1, edge ${worst.edge.toFixed(2)}:1`);
    t.diagnostic(`label under 4.5:1 on --fab-bg-3 in ${[...shortOnBg3].join(', ')}`);
    assert.deepEqual(found, []);
    assert.ok(shortOnBg3.size > 0, 'as every role but primary and urgent, it falls short on --fab-bg-3');
    await setTheme('fabricate');
  });

  it('draws the neutral disabled face when disabled, and dims its own face with no hover while busy', async () => {
    await setTheme('fabricate');
    await rest();
    assert.deepEqual(await faceOf('confirm-disabled'), await faceOf('neutral-disabled'));
    const resting = await faceOf('confirm');
    const busy = await faceOf('confirm-busy');
    assert.equal(busy.opacity, '0.7');
    assert.deepEqual([busy.ink, busy.fill, busy.edge], [resting.ink, resting.fill, resting.edge]);
    const pointed = await hover('confirm-busy');
    assert.equal(pointed.fill, 'rgba(0, 0, 0, 0)', 'the busy button takes no hover fill');
  });

  it('draws the accent keyboard ring 2px clear of its edge, the one colour as the edge in mythwright', async () => {
    for (const theme of THEMES) {
      await setTheme(theme);
      await rest();
      const token = await probesNow();
      await tab.focus('[data-case="urgent"] button');
      await tab.keyboard.press('Tab');
      const face = await faceOf('confirm');
      assert.deepEqual(face.outline, ['solid', '2px', '2px', token['--fab-accent']], theme);
      assert.equal(face.outline[3] === face.edge, theme === 'mythwright', theme);
    }
    await rest();
    await setTheme('fabricate');
  });

  for (const colorScheme of ['light', 'dark']) {
    it(`is repainted as a plain button under forced colours in a ${colorScheme} scheme`, async () => {
      await rest();
      await tab.emulateMedia({ forcedColors: 'active', colorScheme });
      try {
        const [neutral, confirm] = await Promise.all(['neutral', 'confirm'].map(faceOf));
        // The repaint keeps a fill's alpha, so a translucent neutral fill differs from an opaque one there alone.
        const opaque = (colour) =>
          colour.replace(/^rgba\((\d+), (\d+), (\d+), [\d.]+\)$/u, 'rgb($1, $2, $3)');
        assert.deepEqual(
          [confirm.ink, opaque(confirm.fill), confirm.edge],
          [neutral.ink, opaque(neutral.fill), neutral.edge]
        );
      } finally {
        await tab.emulateMedia({ forcedColors: 'none', colorScheme: 'light' });
      }
    });
  }
});
