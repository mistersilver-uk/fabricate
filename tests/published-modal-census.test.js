/**
 * The module sheet and every component style against the published `Modal` (issue 2656): the
 * four selectors that name its root, `fabricate-modal`, which are Well's modal-fill rule, the roll
 * prompt's height rule, which no published dialog matches, Modal's own close-control paint and the
 * module sheet's rule keeping the focused dialog free of the module ring;
 * the subtitle, which no `.manager-muted` rule reaches; the close control's module ring; and the
 * header band's inks.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineAccentRingContrast } from './helpers/accentRingContrast.js';
import { entryNamed, shippedCensus, spelledStrings } from './helpers/publishedComponentCensus.js';
import {
  SHIPPED,
  byName,
  declarationsOf,
  gatedRoot,
  importClosure,
} from './helpers/publishedComponentGate.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from './helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from './helpers/themePaletteContrast.js';

const COMPONENT = 'src/ui/svelte/components/Modal.svelte';
const WELL = 'src/ui/svelte/components/Well.svelte';
const ROLL_PROMPT = 'src/ui/svelte/apps/crafting/RollPrompt.svelte';

/** The dialog's root, which no published key classes and no Fabricate rule redraws under an ancestor. */
const DIALOG = Object.freeze({
  root: 'fabricate-modal',
  writable: new Set(),
  ancestors: new Set(),
  drawsChildren: true,
  undrawn: new Set(),
});

const writtenOf = (census) =>
  census.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);

describe('the module sheet and every component style against the published Modal', () => {
  const rules = rulesIn(collectStyleCorpus()['styles/fabricate.css']);

  it('names the dialog root in four selectors: the modal-fill rule, the roll prompt’s, its own close-control paint and the focused dialog’s ring', () => {
    assert.deepEqual(writtenOf(shippedCensus(DIALOG, 'Modal')), [
      `${ROLL_PROMPT}: :global(.fabricate-modal[data-manager-modal][data-roll-prompt])`,
      `${COMPONENT}: .fabricate-modal :global([data-manager-modal-close])`,
      `${WELL}: :global(.fabricate-modal) .fab-well`,
      'styles/fabricate-base.css: .fabricate-modal.fabricate-modal[tabindex]',
    ]);
    const entry = entryNamed('Modal');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry), entry.rest],
      [
        [
          'open',
          'title',
          'subtitle',
          'icon',
          'size',
          'closeLabel',
          'closeOnOutsideClick',
          'trapFocus',
          'initialFocus',
          'footerLayout',
          'onClose',
          'body',
          'footer',
        ],
        'fabricate',
        false,
      ],
      'a published dialogProps, width, class, rest, or a gated root other than `fabricate` reopens the census'
    );
  });

  it('keeps the roll prompt’s rule off a published dialog, whose closure spells no data-roll-prompt', () => {
    const spelled = [...importClosure(COMPONENT, SHIPPED)].flatMap((file) => [
      ...spelledStrings(file, SHIPPED),
    ]);
    assert.ok(spelled.includes('fabricate-modal'), `${COMPONENT} spells its root`);
    assert.ok(
      spelled.every((text) => !text.includes('data-roll-prompt')),
      'only the unpublished dialogProps writes data-roll-prompt'
    );
  });

  it('pins the Well rule as the modal fill, a well inside a dialog taking --fab-bg-2', () => {
    const well = shippedCensus(DIALOG, 'Modal').find(({ written }) => written.startsWith(WELL));
    assert.deepEqual(declarationsOf(well.rule), [['background', 'var(--fab-bg-2)']]);
  });

  it('pins the module sheet rule on the dialog to no ring, over the module focus pair', () => {
    const unringed = shippedCensus(DIALOG, 'Modal').find(({ written }) =>
      written.startsWith('styles/fabricate-base.css:')
    );
    assert.deepEqual(declarationsOf(unringed.rule), [['outline', 'none']]);
  });

  it('holds no module sheet rule naming a manager-modal-* class or a data-manager-modal* hook', () => {
    const named = rules
      .flatMap((rule) => splitSelectorList(rule.selector))
      .filter((selector) => /manager-modal-|data-manager-modal/u.test(selector));
    assert.deepEqual(named, []);
  });

  it('draws the subtitle with no manager-muted class, so no .manager-muted rule reaches it', () => {
    const tokens = new Set(
      [...spelledStrings(COMPONENT, SHIPPED)].flatMap((text) => text.split(/\s+/u))
    );
    assert.ok(tokens.has('manager-modal-subtitle'), `${COMPONENT} spells its subtitle class`);
    assert.ok(!tokens.has('manager-muted'), `${COMPONENT} spells manager-muted`);
  });
});

describe('the keyboard ring on the published Modal’s close control, which is the module ring', () => {
  defineAccentRingContrast('.fabricate button:focus-visible', { moduleRings: [] });
});

describe('the inks on the published Modal’s header band', () => {
  const themes = themePalettes(rulesIn(collectStyleCorpus()['styles/fabricate.css']));

  it('clears 3:1 for the ring on the header band in every palette', () => {
    assert.deepEqual(shortfalls(themes, '--fab-accent', ['--fab-bg-2'], 3), []);
  });

  it('clears 4.5:1 for the title on the header band in every palette', () => {
    assert.deepEqual(shortfalls(themes, '--fab-text', ['--fab-bg-2']), []);
  });

  it('clears 3:1 for the close glyph on the header band in every palette', () => {
    assert.deepEqual(shortfalls(themes, '--fab-text-muted', ['--fab-bg-2'], 3), []);
  });

  it('clears 4.5:1 for the header glyph on the header band in every palette', () => {
    const ink = declaredToken(
      rulesIn(collectStyleCorpus()[COMPONENT]),
      '.manager-modal-icon',
      'color',
      COMPONENT
    );
    assert.equal(ink, '--fab-accent-text');
    assert.deepEqual(shortfalls(themes, ink, ['--fab-bg-2']), []);
  });

  it('clears 4.5:1 for the subtitle on the header band in every palette', () => {
    const ink = declaredToken(
      rulesIn(collectStyleCorpus()[COMPONENT]),
      '.manager-modal-subtitle',
      'color',
      COMPONENT
    );
    assert.equal(ink, '--fab-text-muted');
    assert.deepEqual(shortfalls(themes, ink, ['--fab-bg-2']), []);
  });
});
