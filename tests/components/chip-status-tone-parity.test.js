/* THE CONVERTED STATUS TONES, ARBITRATED IN A REAL BROWSER, ONCE PER THEME (issue 1506). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { CHIP_TONES } from '../helpers/chipTone.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const chip = scopedComponentCss(resolve(repoRoot, 'src/ui/svelte/components/Chip.svelte'));

/** THE SEVEN THEME ROOTS, read from the sheet rather than typed. */
const THEMES = [...sheet.matchAll(/\.fabricate\[data-fabricate-theme='?"([\w-]+)"'?\]/g)].map(
  ([, name]) => name
);

/** THE FROZEN MAPPING TABLE, as the TOKENS each converted face is made of. */
const MAPPED_FACES = Object.freeze([
  Object.freeze({
    pillTone: 'success',
    chipTone: 'positive',
    ink: '--fab-success-text',
    edge: '--fab-success-border',
    fill: '--fab-success-soft',
  }),
  Object.freeze({
    pillTone: 'danger',
    chipTone: 'danger',
    ink: '--fab-danger-text',
    edge: '--fab-danger-border',
    fill: '--fab-danger-soft',
  }),
  Object.freeze({
    pillTone: 'warning',
    chipTone: 'warning',
    ink: '--fab-warning-text',
    edge: '--fab-warning-border',
    fill: '--fab-warning-soft',
  }),
  Object.freeze({
    pillTone: 'info',
    chipTone: 'info',
    ink: '--fab-info-text',
    edge: '--fab-info-border',
    fill: '--fab-info-soft',
  }),
  Object.freeze({
    pillTone: 'subtle',
    chipTone: 'subtle',
    // The pill declared two properties and inherited `border: 1px solid transparent` from its
    // base; the chip's base is a real `--fab-border` hairline, so the transparent edge is an
    // explicit declaration here or every converted subtle chip grows a visible border.
    ink: '--fab-text-subtle',
    edge: 'transparent',
    fill: '--fab-surface-raised',
  }),
  Object.freeze({
    pillTone: 'neutral',
    chipTone: 'neutral',
    // The look-alikes declared `--fab-surface-raised` on their own base rule.
    ink: '--fab-text-muted',
    edge: '--fab-border',
    fill: '--fab-overlay-light-06',
  }),
  Object.freeze({
    pillTone: 'accent',
    chipTone: 'accent',
    ink: '--fab-accent-text',
    retiredInk: '--fab-accent',
    edge: '--fab-accent-border',
    fill: '--fab-accent-soft',
  }),
]);

/** The recessive ink ladder, strongest first (issue 1506). */
const INK_LADDER = [
  '--fab-text-secondary',
  '--fab-text-muted',
  '--fab-text-subtle',
  '--fab-text-disabled',
];

/** The two roots where `--fab-surface-raised` and `--fab-overlay-light-06` are byte-identical. */
const EQUAL_GROUND_THEMES = new Set(['mythwright', 'foundry-native']);

const TOKEN_PROBES = [
  ...new Set([
    ...MAPPED_FACES.flatMap((face) => [face.ink, face.edge, face.fill, face.retiredInk]).filter(
      Boolean
    ),
    ...INK_LADDER,
    '--fab-bg-1',
  ]),
];

const value = (token) => (token.startsWith('--') ? `var(${token})` : token);

function themeBlock(theme) {
  const chips = MAPPED_FACES.map(({ chipTone }) =>
    withScopeHash(
      `<span class="manager-chip is-${chipTone}" data-probe="${theme}-chip-${chipTone}">x</span>`,
      'manager-chip',
      chip.hashClass
    )
  ).join('');
  // One probe per token the table names, painted with that token and nothing else.
  const tokens = TOKEN_PROBES.map(
    (token) =>
      `<span data-token="${theme}-${token}" style="color:${value(token)};` +
      `border-color:${value(token)};background-color:${value(token)}">x</span>`
  ).join('');
  return (
    `<div class="fabricate fabricate-manager" data-fabricate-theme="${theme}" data-theme-root="${theme}">` +
    `${chips}${tokens}</div>`
  );
}

const PAGE =
  '<!doctype html><html><head><meta charset="utf-8">' +
  `<style id="layered-sheet">@layer modules { ${sheet} }</style>` +
  `<style>${chip.css}</style>` +
  '<style>:root { --font-primary: Arial, sans-serif; } html, body { margin: 0; padding: 0; }</style>' +
  `</head><body>${THEMES.map((theme) => themeBlock(theme)).join('')}</body></html>`;

let browser;
let page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  await page.setContent(PAGE);
});

after(async () => {
  await browser?.close();
});

/**
 * The rendered `[ink, edge, fill]` of one probe, as resolved rgb.
 *
 * @param {string} attribute `data-probe` or `data-token`
 * @param {string} key the probe's value
 * @returns {Promise<string[]>}
 */
function tripleOf(attribute, key) {
  return page.evaluate(
    ([attributeName, probeKey]) => {
      const element = document.querySelector(`[${attributeName}="${probeKey}"]`);
      const styles = getComputedStyle(element);
      return [styles.color, styles.borderTopColor, styles.backgroundColor];
    },
    [attribute, key]
  );
}

/**
 * The contrast of an ink composited over this theme's own `--fab-bg-1`.
 *
 * @param {string} ink an `rgb()`/`rgba()` string
 * @param {string} ground an opaque `rgb()` string
 * @returns {number}
 */
function contrastOver(ink, ground) {
  const parse = (colour) => colour.match(/[\d.]+/g).map(Number);
  const [red, green, blue, alpha = 1] = parse(ink);
  const [groundRed, groundGreen, groundBlue] = parse(ground);
  const composite = [
    red * alpha + groundRed * (1 - alpha),
    green * alpha + groundGreen * (1 - alpha),
    blue * alpha + groundBlue * (1 - alpha),
  ];
  const luminance = (channels) => {
    const [r, g, b] = channels.map((channel) => {
      const ratio = channel / 255;
      return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const first = luminance(composite);
  const second = luminance([groundRed, groundGreen, groundBlue]);
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('1506 Chip — the converted status faces, per theme', () => {
  it('sweeps the seven theme roots the sheet declares, and no others', () => {
    assert.equal(
      THEMES.length,
      7,
      `the sheet declares ${THEMES.length} theme roots; a new one joins this sweep by existing, and a lost one is a palette regression: ${THEMES.join(', ')}`
    );
  });

  it('names a chip tone that Chip actually paints for every converted face', () => {
    const undrawn = MAPPED_FACES.filter(({ chipTone }) => !CHIP_TONES.has(chipTone));
    assert.deepEqual(
      undrawn,
      [],
      'a face routed to a tone the component does not declare renders an untoned chip, silently'
    );
  });

  for (const theme of THEMES) {
    describe(theme, () => {
      it('DISCRIMINATES: the four semantic faces are pairwise distinct triples', async () => {
        // The non-vacuity guard, and it is the whole triple rather than the ink.
        // page reports `rgb(0, 0, 0)` / `rgba(0, 0, 0, 0)` for everything, which would pass every
        // equality below vacuously — while `foundry-native` flattens all four semantic INKS to
        // one value, so an ink-only discriminator would red there on a correct implementation.
        const triples = await Promise.all(
          ['positive', 'danger', 'warning', 'info'].map((tone) =>
            tripleOf('data-probe', `${theme}-chip-${tone}`)
          )
        );
        assert.equal(
          new Set(triples.map((triple) => triple.join('|'))).size,
          4,
          `the four semantic faces must differ somewhere: ${JSON.stringify(triples)}`
        );
      });

      for (const face of MAPPED_FACES) {
        it(`draws ${face.pillTone} as ${face.chipTone}, from the tokens the map names`, async () => {
          const rendered = await tripleOf('data-probe', `${theme}-chip-${face.chipTone}`);
          const expected = await Promise.all(
            [face.ink, face.edge, face.fill].map((token) =>
              tripleOf('data-token', `${theme}-${token}`)
            )
          );
          assert.deepEqual(
            rendered,
            [expected[0][0], expected[1][1], expected[2][2]],
            `${face.chipTone} must ink ${face.ink}, edge ${face.edge} and fill ${face.fill}`
          );
        });
      }

      it('inks accent with the REPAIRED token, which is a real difference here', async () => {
        // The one converted face that moves a property.
        const repaired = await tripleOf('data-token', `${theme}---fab-accent-text`);
        const retired = await tripleOf('data-token', `${theme}---fab-accent`);
        assert.notEqual(
          repaired[0],
          retired[0],
          'the accent ink the chip uses must not be the one the retired pill used'
        );
      });

      it("pins `neutral`'s ground move as a five/two per-theme split", async () => {
        // Decision LLL: an unconditional UNEQUAL reds on a CORRECT implementation in the two
        // themes whose ground tokens are byte-identical, the same degeneracy DDD corrects for
        // the inks. The split is pinned as DATA so a token edit that flattened a sixth theme
        // reds instead of silently widening the EQUAL set.
        const raised = await tripleOf('data-token', `${theme}---fab-surface-raised`);
        const overlay = await tripleOf('data-token', `${theme}---fab-overlay-light-06`);
        (EQUAL_GROUND_THEMES.has(theme) ? assert.equal : assert.notEqual)(
          overlay[2],
          raised[2],
          `the converted \`neutral\` chips take ${overlay[2]} where the retired look-alikes took ${raised[2]}`
        );
      });

      it('orders the FOUR-rank recessive ink ladder by composited contrast', async () => {
        // `secondary` names the rule the GM is reading, `neutral` a fact merely present.
        const ground = (await tripleOf('data-token', `${theme}---fab-bg-1`))[2];
        const contrasts = [];
        for (const token of INK_LADDER) {
          const ink = (await tripleOf('data-token', `${theme}-${token}`))[0];
          contrasts.push(contrastOver(ink, ground));
        }
        const descending = contrasts.every(
          (contrast, index) => index === 0 || contrasts[index - 1] > contrast
        );
        assert.ok(
          descending,
          `the ladder must weaken at every rung, but read ${contrasts.map((c) => c.toFixed(2)).join(' / ')}`
        );
      });
    });
  }
});
