/**
 * The module sheet and every component style against the published `Popover` (issue 2861): the
 * one selector beyond its own scoped style that names its root, `fabricate-popover`, the module
 * sheet's rule keeping the focused panel free of the module ring; the entry's published shape;
 * and the inks on its surface over the seven palettes.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { entryNamed, shippedCensus } from './helpers/publishedComponentCensus.js';
import { byName, declarationsOf, gatedRoot } from './helpers/publishedComponentGate.js';
import { collectStyleCorpus, rulesIn } from './helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  propertiesOf,
  shortfalls,
  stackGround,
  themePalettes,
} from './helpers/themePaletteContrast.js';

const COMPONENT = 'src/ui/svelte/components/Popover.svelte';

/** The panel's root, which no published key classes and no Fabricate rule redraws under an ancestor. */
const PANEL = Object.freeze({
  root: 'fabricate-popover',
  writable: new Set(),
  ancestors: new Set(),
  drawsChildren: true,
  undrawn: new Set(),
});

/** The four grounds a panel is drawn over. */
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

const writtenOf = (census) =>
  census.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);

describe('the module sheet and every component style against the published Popover', () => {
  it('names the panel root in one selector beyond its own scoped style: the module sheet’s rule keeping the focused panel free of the ring', () => {
    assert.deepEqual(writtenOf(shippedCensus(PANEL, 'Popover')), [
      'styles/fabricate-base.css: .fabricate-popover.fabricate-popover[tabindex]',
    ]);
    const entry = entryNamed('Popover');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry), entry.rest, entry.overlays],
      [
        [
          'open',
          'anchorId',
          'placement',
          'title',
          'ariaLabel',
          'closeOnOutsideClick',
          'onClose',
          'body',
        ],
        'fabricate',
        false,
        true,
      ],
      'a published class, style, rest, or a gated root other than `fabricate` reopens the census'
    );
  });

  it('pins the module sheet rule on the panel to no ring, over the module focus pair', () => {
    const unringed = shippedCensus(PANEL, 'Popover').find(({ written }) =>
      written.startsWith('styles/fabricate-base.css:')
    );
    assert.deepEqual(declarationsOf(unringed.rule), [['outline', 'none']]);
  });
});

describe('the inks on the published Popover’s surface', () => {
  const rules = rulesIn(collectStyleCorpus()[COMPONENT]);
  const themes = themePalettes(rulesIn(collectStyleCorpus()['styles/fabricate.css']));

  it('paints the panel on --fab-bg-0 with a --fab-border-strong edge', () => {
    assert.equal(declaredToken(rules, '.fabricate-popover', 'background', COMPONENT), '--fab-bg-0');
    const edge = rules
      .filter((rule) => rule.selector === '.fabricate-popover')
      .map((rule) => propertiesOf(rule).get('border'))
      .filter(Boolean);
    assert.deepEqual(edge, ['1px solid var(--fab-border-strong)']);
  });

  it('clears 4.5:1 for the title and the body’s inherited ink on the panel in every palette', () => {
    assert.equal(
      declaredToken(rules, '.fabricate-popover-title', 'color', COMPONENT),
      '--fab-text'
    );
    assert.deepEqual(shortfalls(themes, '--fab-text', ['--fab-bg-0']), []);
  });

  it('clears 3:1 for the body’s inset accent ring on the panel in every palette', () => {
    const ring = rulesIn(collectStyleCorpus()['styles/fabricate.css']).filter(
      (rule) =>
        rule.selector === '.fabricate-popover-body.fabricate-popover-body[tabindex]:focus-visible'
    );
    assert.equal(ring.length, 1, 'the module sheet draws the body’s ring');
    assert.equal(propertiesOf(ring[0]).get('outline'), '2px solid var(--fab-accent)');
    assert.equal(propertiesOf(ring[0]).get('outline-offset'), '-2px');
    assert.deepEqual(shortfalls(themes, '--fab-accent', ['--fab-bg-0'], 3), []);
  });

  it('reads the edge, which carries no state, between 1.6:1 and 2.3:1 over the four grounds in every palette', () => {
    const ratios = [...themes].flatMap(([, tokens]) =>
      GROUNDS.map((ground) =>
        contrast(tokens.get('--fab-border-strong'), stackGround(tokens, [ground]))
      )
    );
    assert.equal(ratios.length, 28, 'seven palettes by four grounds');
    assert.ok(Math.min(...ratios) >= 1.6, `the lowest is ${Math.min(...ratios).toFixed(2)}:1`);
    assert.ok(Math.max(...ratios) <= 2.3, `the highest is ${Math.max(...ratios).toFixed(2)}:1`);
  });
});
