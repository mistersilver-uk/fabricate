/**
 * The published `Button` in Chromium, on the markup the seam draws, under the module sheet, in all
 * seven palettes: the `confirm` role (issue 2890) at rest, under the pointer, disabled, busy, under
 * keyboard focus and under forced colours; and every role's label, edge and tile composited over the
 * five tinted fills on the four grounds (issue 2898), pinning which clear 4.5:1 and 3:1 there.
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
    let weakestEdge = '';
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
          if (read.edge < worst.edge) weakestEdge = `${theme} ${ground}`;
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
    assert.equal(worst.edge.toFixed(2), '3.94', 'the weakest edge, as the Button section states');
    assert.equal(weakestEdge, 'foundry-native --fab-bg-2', 'where the weakest edge sits');
    assert.ok(
      shortOnBg3.size > 0,
      'as every role but primary and urgent, it falls short on --fab-bg-3'
    );
    await setTheme('fabricate');
  });

  it('draws the accent and confirm edges as one colour in mythwright alone, where the accent is --fab-success-strong', async () => {
    const one = [];
    for (const theme of THEMES) {
      await setTheme(theme);
      await rest();
      const token = await probesNow();
      const [accent, confirm] = await Promise.all(['accent', 'confirm'].map(faceOf));
      assert.equal(
        token['--fab-accent'] === token['--fab-success-strong'],
        accent.edge === confirm.edge,
        theme
      );
      if (accent.edge === confirm.edge) one.push(theme);
    }
    assert.deepEqual(one, ['mythwright']);
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

  // An unknown role also draws neutral, so equality with neutral alone would pass without the role;
  // the role's own face differs from neutral's outside forced colours (above), and this guards against
  // a later `forced-color-adjust: none` on the confirm class, which would keep its success colours.
  for (const colorScheme of ['light', 'dark']) {
    it(`is repainted as a plain button under forced colours in a ${colorScheme} scheme, with no forced-color-adjust opt-out`, async () => {
      await rest();
      await tab.emulateMedia({ forcedColors: 'active', colorScheme });
      try {
        const [neutral, confirm] = await Promise.all(['neutral', 'confirm'].map(faceOf));
        const adjust = await tab.evaluate(
          () =>
            getComputedStyle(document.querySelector('[data-case="confirm"] button'))
              .forcedColorAdjust
        );
        assert.equal(adjust, 'auto');
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

describe('every Button role on the tinted fills (issue 2898)', () => {
  /** `shortfalls[role][state][measure]`: each `palette tint over ground` under its floor. */
  const shortfalls = {};
  const floors = {};

  before(async () => {
    await openPage();
    for (const role of ROLES) {
      shortfalls[role] = {};
      floors[role] = {};
      for (const state of ['rest', 'hover']) {
        shortfalls[role][state] = { label: [], edge: [], tile: [], both: [], ground: [] };
        floors[role][state] = { label: Infinity, edge: Infinity, tile: Infinity };
      }
    }
    for (const theme of THEMES) {
      await setTheme(theme);
      await rest();
      const token = await probesNow();
      for (const role of ROLES) {
        await rest();
        for (const [state, face] of [
          ['rest', await faceOf(role)],
          ['hover', await hover(role)],
        ]) {
          const short = shortfalls[role][state];
          for (const ground of GROUNDS) {
            if (readings(face, paint([token[ground]])).edge < 3) short.ground.push(theme);
            for (const tint of TINTS) {
              const where = `${theme} ${tint} over ${ground}`;
              const read = readings(face, paint([token[`--fab-${tint}-soft`], token[ground]]));
              for (const measure of ['label', 'edge', 'tile'])
                floors[role][state][measure] = Math.min(
                  floors[role][state][measure],
                  read[measure]
                );
              if (read.label < 4.5) short.label.push(where);
              if (read.edge < 3) short.edge.push(where);
              if (read.tile < 3) short.tile.push(where);
              if (read.edge < 3 && read.tile < 3) short.both.push(where);
            }
          }
        }
      }
    }
    await rest();
    await setTheme('fabricate');
  });

  const fixed = (value) => value.toFixed(2);
  /** The role's weakest reading of `measure` on a tinted fill, at rest or under the pointer. */
  const floorOf = (role, measure) =>
    Math.min(floors[role].rest[measure], floors[role].hover[measure]);
  const palettesOf = (list) => [...new Set(list.map((where) => where.split(' ', 1)[0]))];

  it('inks a clear label on every tinted fill at rest and under the pointer in neutral, warning, info, accent, urgent and confirm', (t) => {
    for (const role of ['neutral', 'warning', 'info', 'accent', 'urgent', 'confirm']) {
      t.diagnostic(`${role} label floor ${fixed(floorOf(role, 'label'))}:1`);
      assert.deepEqual(shortfalls[role].rest.label, [], `${role} at rest`);
      assert.deepEqual(shortfalls[role].hover.label, [], `${role} under the pointer`);
    }
  });

  it('leaves confirm the weakest label of neutral, warning, info, accent, urgent and confirm on a tinted fill', () => {
    for (const role of ['neutral', 'warning', 'info', 'accent', 'urgent']) {
      assert.ok(floorOf(role, 'label') > floors.confirm.hover.label, role);
    }
    assert.equal(floorOf('confirm', 'label'), floors.confirm.hover.label);
  });

  it('inks a clear primary label at rest, and under the pointer falls short in foundry-native alone', () => {
    assert.deepEqual(shortfalls.primary.rest.label, []);
    assert.equal(shortfalls.primary.hover.label.length, TINTS.length * GROUNDS.length);
    assert.deepEqual(palettesOf(shortfalls.primary.hover.label), ['foundry-native']);
  });

  it('inks a clear danger label at rest, and under the pointer falls short on the success and warning fills over --fab-bg-2 in hearth-herb', () => {
    assert.deepEqual(shortfalls.danger.rest.label, []);
    assert.deepEqual(shortfalls.danger.hover.label, [
      'hearth-herb success over --fab-bg-2',
      'hearth-herb warning over --fab-bg-2',
    ]);
  });

  it('inks the ghost and dashed resting label under 4.5:1 on each tinted fill in at least one palette, and clears it under the pointer', () => {
    for (const role of ['ghost', 'dashed']) {
      for (const tint of TINTS) {
        assert.ok(
          shortfalls[role].rest.label.some((where) => where.includes(` ${tint} over `)),
          `${role} on ${tint}`
        );
      }
      assert.deepEqual(shortfalls[role].hover.label, [], role);
    }
  });

  it('clears 3:1 for the urgent tile and edge and the accent edge on every tinted fill, and the confirm edge on all but the accent fill over --fab-bg-2 in foundry-native', (t) => {
    for (const role of ['urgent', 'accent', 'confirm']) {
      t.diagnostic(
        `${role} edge floor ${fixed(floorOf(role, 'edge'))}:1, tile floor ${fixed(floorOf(role, 'tile'))}:1`
      );
    }
    for (const state of ['rest', 'hover']) {
      assert.deepEqual(shortfalls.urgent[state].tile, [], `urgent tile ${state}`);
      assert.deepEqual(shortfalls.urgent[state].edge, [], `urgent edge ${state}`);
      assert.deepEqual(shortfalls.accent[state].edge, [], `accent edge ${state}`);
      assert.deepEqual(
        shortfalls.confirm[state].edge,
        ['foundry-native accent over --fab-bg-2'],
        `confirm edge ${state}`
      );
    }
  });

  it('pins the floors the Button section states: the urgent tile and edge at 3.67:1, the confirm label at 4.71:1 under the pointer and the confirm edge at 2.96:1', () => {
    assert.deepEqual(
      [fixed(floorOf('urgent', 'tile')), fixed(floorOf('urgent', 'edge'))],
      ['3.67', '3.67']
    );
    assert.equal(fixed(floors.confirm.hover.label), '4.71');
    assert.ok(floors.confirm.rest.label > floors.confirm.hover.label, 'the pointer is the weakest');
    assert.equal(fixed(floorOf('confirm', 'edge')), '2.96');
    assert.equal(fixed(floorOf('accent', 'tile')), '1.00', 'the accent draws no fill');
  });

  it('draws the confirm hover fill as a subtle cue, never 3:1 against the tinted fill it hovers on, and as faint as 1.12:1', () => {
    assert.equal(
      shortfalls.confirm.hover.tile.length,
      THEMES.length * TINTS.length * GROUNDS.length
    );
    assert.equal(fixed(floors.confirm.hover.tile), '1.12');
  });

  it('leaves every other role, at rest, with neither edge nor tile at 3:1 on each tinted fill in at least one palette', () => {
    for (const role of ['neutral', 'primary', 'ghost', 'dashed', 'danger', 'warning', 'info']) {
      for (const tint of TINTS) {
        assert.ok(
          shortfalls[role].rest.both.some((where) => where.includes(` ${tint} over `)),
          `${role} on ${tint}`
        );
      }
    }
  });

  it('draws the neutral, ghost, dashed and danger edges under 3:1 on the four grounds in every palette, and the info edge in six', () => {
    for (const role of ['neutral', 'ghost', 'dashed', 'danger']) {
      assert.equal(palettesOf(shortfalls[role].rest.ground).length, THEMES.length, role);
    }
    assert.equal(palettesOf(shortfalls.info.rest.ground).length, THEMES.length - 1, 'info');
  });
});
