/**
 * The module sheet and every component style against the published `TintSwatches` (issue 2901):
 * no selector outside its own scoped block names its root class, so a published strip draws alike
 * under any ancestor, and the marks its own scoped rules draw, the inset keyboard ring and the
 * outset hover ring in the accent, which clear 3:1 on the four grounds a published strip sits on;
 * the checked ring's is `tint-picker-ring-contrast.test.js`'s.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  entryNamed,
  placementFaults,
  shippedCensus,
  spelledStrings,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import { SHIPPED, gatedRoot } from './helpers/publishedComponentGate.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from './helpers/styleBlockScan.js';
import { propertiesOf, shortfalls, themePalettes } from './helpers/themePaletteContrast.js';

const COMPONENT = 'src/ui/svelte/components/TintSwatches.svelte';

/** The published strip's root: no class beside it, and no Fabricate rule lays it out from above. */
const STRIP = Object.freeze({
  root: 'fabricate-tint-swatches',
  writable: new Set(),
  ancestors: new Set(),
  drawsChildren: true,
  disables: false,
  undrawn: new Set(['is-none']),
});

/** A published swatch's class and the checked class `value` writes beside it. */
const SWATCH_CLASSES = Object.freeze(['fabricate-tint-swatch', 'is-selected']);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const own = rulesIn(corpus[COMPONENT]);

/** The one declaration of `property` on the scoped rule whose selector list holds `selector`. */
function ownDeclared(selector, property) {
  const values = own
    .filter((rule) => splitSelectorList(rule.selector).includes(selector))
    .map((rule) => propertiesOf(rule).get(property))
    .filter(Boolean);
  assert.equal(values.length, 1, `${COMPONENT} declares ${property} on ${selector} once`);
  return values[0];
}

const census = () => shippedCensus(STRIP, 'TintSwatches');

describe('the module sheet and every component style against the published TintSwatches', () => {
  it('names its root in no selector outside its own block, and so reaches it through none', () => {
    assert.deepEqual(census(), []);
    const entry = entryNamed('TintSwatches');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry)],
      [['value', 'onChange', 'ariaLabel', 'tints', 'labels'], 'fabricate'],
      'a published class or rest key reopens the census'
    );
  });

  it('draws a published strip alike under any ancestor', () => {
    assert.deepEqual(placementFaults(census(), STRIP, []), []);
  });

  it('spells its root and the swatch classes the census and its marks read', () => {
    const tokens = new Set(
      spelledStrings(COMPONENT, SHIPPED).flatMap((spelled) => spelled.split(/\s+/))
    );
    for (const name of [STRIP.root, ...SWATCH_CLASSES, ...STRIP.undrawn]) {
      assert.ok(tokens.has(name), `${COMPONENT} spells ${name}`);
    }
  });
});

describe('the tint swatches census, synthetic', () => {
  for (const selector of [
    '.fabricate-tint-swatches',
    '.fabricate .fabricate-tint-swatches',
    '.fabricate-tint-swatches button',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published strip`, () => {
      assert.deepEqual(
        syntheticCensus(STRIP, `${selector} { gap: 0 }`)
          .filter(({ safe }) => !safe)
          .map(({ written }) => written),
        [`sheet.css: ${selector}`]
      );
    });
  }
});

describe('the marks on the published TintSwatches’ swatches', () => {
  it('draws keyboard focus as the 2px accent outline inset 2px, and hover as the accent 1px clear of the edge', () => {
    assert.equal(
      ownDeclared('.fabricate-tint-swatch:focus-visible', 'outline'),
      '2px solid var(--fab-accent)'
    );
    assert.equal(ownDeclared('.fabricate-tint-swatch:focus-visible', 'outline-offset'), '-2px');
    assert.equal(
      ownDeclared('.fabricate-tint-swatch:hover::after', 'border'),
      '2px solid var(--fab-accent)'
    );
    assert.equal(ownDeclared('.fabricate-tint-swatch:hover::after', 'inset'), '-4px');
  });

  it('draws the accent marks at 3:1 on each ground a published strip sits on, in every palette', () => {
    assert.equal(themes.size, 7);
    for (const ground of GROUNDS) {
      assert.deepEqual(shortfalls(themes, '--fab-accent', [ground], 3), [], ground);
    }
  });

  it('keeps each tint and its ring under forced colours, and edges the checked swatch in Highlight', () => {
    const forced = own
      .filter((rule) => rule.context === '@media (forced-colors: active)')
      .map((rule) => [rule.selector, Object.fromEntries(propertiesOf(rule))]);
    assert.deepEqual(forced, [
      ['.fabricate-tint-swatch-fill', { 'forced-color-adjust': 'none' }],
      ['.fabricate-tint-swatch.is-selected', { 'border-color': 'highlight' }],
    ]);
  });
});
