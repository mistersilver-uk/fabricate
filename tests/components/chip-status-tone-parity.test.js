/*
 * THE CONVERTED STATUS TONES, ARBITRATED IN A REAL BROWSER, ONCE PER THEME (issue 1506).
 *
 * The 36 status pills across the manager and the player window are chips now, and the tone map
 * says which chip tone each of the retired pill's six draws on. Four of the six were supposed to
 * be a byte-identical reproduction, `subtle` a reproduction of the pill's own default face, and
 * `accent` a deliberate one-property move — its ink from the family base to `--fab-accent-text`,
 * which is an accessibility repair the chip already made and recorded.
 *
 * ── WHY THIS IS NOT A COMPARISON AGAINST THE PILL ───────────────────────────────────────────
 * Because the pill does not survive this change. A gate that compared the two components' scoped
 * blocks would be evidence rather than coverage: green for one commit, then unrunnable forever.
 * That comparison WAS run, while both files existed, and its output is in the PR. What lands is
 * the half that still has both of its sides: the chip's tone rules, and the TOKENS the mapping
 * table says each converted face is made of. So this asks "does `positive` still ink, edge and
 * fill from the success family?" rather than "does `positive` still equal what the pill drew",
 * and it keeps answering that through a token VALUE change, a theme edit or a palette move —
 * while reddening the day a tone rule re-points at a different family.
 *
 * ── WHY A BROWSER, AND WHY PER THEME ────────────────────────────────────────────────────────
 * happy-dom computes no cascade and returns `""` for every `var()`-built value, so a mounted
 * version of this file would compare token NAMES — which is what the plan's table already did by
 * hand, and which cannot see a per-theme divergence. The sweep is per theme because the themes
 * disagree in ways that break the obvious assertions: `foundry-native` flattens all four semantic
 * inks to one value, and two of the seven state `--fab-surface-raised` and `--fab-overlay-light-06`
 * at the same percentage where five do not.
 *
 * The page mirrors production's cascade rather than flattening it: `styles/fabricate.css` is
 * imported by Foundry at `layer(modules)` while a Svelte `css: 'injected'` block lands UNLAYERED
 * and beats it at any specificity, so a fixture that loaded the two flat could prove the wrong
 * winner. `tests/view-lab/cascade.css` is the reference that states it.
 */
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

/**
 * THE SEVEN THEME ROOTS, read from the sheet rather than typed, so a new theme joins this sweep
 * by existing. Every `--fab-*` this file reads is declared by the root wrapper and not by the
 * sheet import, which is why each probe renders inside one.
 */
const THEMES = [...sheet.matchAll(/\.fabricate\[data-fabricate-theme='?"([\w-]+)"'?\]/g)].map(
  ([, name]) => name
);

/**
 * THE FROZEN MAPPING TABLE, as the TOKENS each converted face is made of.
 *
 * `chipTone` is what the map sends the pill's tone to; the three token names are what that face
 * is required to be built from. `accent` is the one row whose ink is deliberately NOT the family
 * base the retired pill used: `--fab-accent` over `--fab-accent-soft` measures under AA in
 * `ironblood-forge`, and `--fab-accent-text` is the repair. The row records both, and the test
 * below asserts the repair is a real difference rather than a rename.
 */
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
    pillTone: 'accent',
    chipTone: 'accent',
    ink: '--fab-accent-text',
    retiredInk: '--fab-accent',
    edge: '--fab-accent-border',
    fill: '--fab-accent-soft',
  }),
]);

/** The recessive ink ladder, strongest first (issue 1506). */
const INK_LADDER = ['--fab-text-secondary', '--fab-text-muted', '--fab-text-subtle', '--fab-text-disabled'];

const TOKEN_PROBES = [...new Set(MAPPED_FACES.flatMap((face) => [face.ink, face.edge, face.fill, face.retiredInk]).filter(Boolean)), ...INK_LADDER, '--fab-bg-1'];

const value = (token) => (token.startsWith('--') ? `var(${token})` : token);

function themeBlock(theme) {
  const chips = MAPPED_FACES.map(({ chipTone }) =>
    withScopeHash(
      `<span class="manager-chip is-${chipTone}" data-probe="${theme}-chip-${chipTone}">x</span>`,
      'manager-chip',
      chip.hashClass
    )
  ).join('');
  // One probe per token the table names, painted with that token and nothing else, so the
  // comparison is against the TOKEN as this theme resolves it rather than against a literal.
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
 * The contrast of an ink composited over this theme's own `--fab-bg-1`, which is the quantity the
 * recessive ladder is ordered by. It is named because two obvious readings are degenerate: five
 * roots state the ladder as one hue at three alphas, `mythwright` states three DIFFERENT opaque
 * hues plus one alpha, and `foundry-native` mixes two base triples — so alpha ties three of four
 * in one theme and a per-channel read ties them in another.
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
        // The non-vacuity guard, and it is the whole triple rather than the ink: an unresolved
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
        // The one converted face that moves a property, and the move is an accessibility repair
        // rather than a regression: the family base over the 16% soft fill measures under AA in
        // `ironblood-forge`. Asserted as a difference so a revert to the base reds rather than
        // reading as a rename.
        const repaired = await tripleOf('data-token', `${theme}---fab-accent-text`);
        const retired = await tripleOf('data-token', `${theme}---fab-accent`);
        assert.notEqual(
          repaired[0],
          retired[0],
          'the accent ink the chip uses must not be the one the retired pill used'
        );
      });

      it('orders the FOUR-rank recessive ink ladder by composited contrast', async () => {
        // `secondary` names the rule the GM is reading, `neutral` a fact merely present, `subtle`
        // a quiet non-actionable state, `muted` unavailable — each measurably weaker than the
        // last. The ORDER is the invariant, never a percentage: five roots state it as one hue at
        // 74/56/42%, `mythwright` as three opaque hues plus an alpha, `foundry-native` at
        // 78/60% over a different base triple.
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
