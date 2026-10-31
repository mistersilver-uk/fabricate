/**
 * The module sheet and every component style against the published `Modal` (issue 2656): the
 * four selectors that name its root, `fabricate-modal`, which are Well's modal-fill rule, the roll
 * prompt's height rule, which no published dialog matches, Modal's own close-control paint and the
 * module sheet's rule keeping the focused dialog free of the module ring;
 * the subtitle, which no `.manager-muted` rule reaches; the close control's module ring; the
 * header band's inks; and the dialog's edge against the window its scrim dims, with the window's
 * text and focus ring it fades and how far it shifts each ground (issue 2859).
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
import {
  contrast,
  declaredToken,
  flatten,
  propertiesOf,
  shortfalls,
  themePalettes,
} from './helpers/themePaletteContrast.js';

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
          'scrim',
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

describe('the published Modal’s edge against the window its scrim dims', () => {
  const themes = themePalettes(rulesIn(collectStyleCorpus()['styles/fabricate.css']));
  const rules = rulesIn(collectStyleCorpus()[COMPONENT]);
  const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
  const scrim = declaredToken(rules, '.manager-modal-scrim', 'background', COMPONENT);
  const frame = propertiesOf(rules.find((rule) => rule.selector === '.fabricate-modal'));
  const [, edge] = frame.get('border').match(/^1px solid var\((--fab-[\w-]+)\)$/u) ?? [];
  const surface = frame.get('background').match(/^var\((--fab-[\w-]+)\)$/u)?.[1];
  /** Each palette and ground: the edge, over the dialog's own surface, against the window dimmed and not. */
  const cells = [...themes].flatMap(([theme, tokens]) =>
    GROUNDS.map((ground) => {
      const drawn = flatten(tokens.get(edge), tokens.get(surface));
      const dimmed = flatten(tokens.get(scrim), tokens.get(ground));
      const faded = (ink) =>
        flatten(tokens.get(scrim), flatten(tokens.get(ink), tokens.get(ground)));
      return {
        cell: `${theme} over ${ground}`,
        dimmed: contrast(drawn, dimmed),
        plain: contrast(drawn, tokens.get(ground)),
        surface: contrast(tokens.get(surface), dimmed),
        shift: contrast(dimmed, tokens.get(ground)),
        text: contrast(tokens.get('--fab-text'), tokens.get(ground)),
        textDimmed: contrast(faded('--fab-text'), dimmed),
        ring: contrast(faded('--fab-accent'), dimmed),
      };
    })
  );
  const range = (key) =>
    [Math.min, Math.max].map((pick) => pick(...cells.map((cell) => cell[key])).toFixed(2));

  it('dims in the dark overlay token, under a 1px border-strong edge on the bg-1 surface', () => {
    assert.deepEqual(
      [scrim, edge, surface],
      ['--fab-overlay-dark-78', '--fab-border-strong', '--fab-bg-1']
    );
    assert.equal(cells.length, 28, 'seven palettes over four grounds');
  });

  it('never lowers the edge’s contrast with the window in any palette or ground', () => {
    const lowered = cells
      .filter(({ dimmed, plain }) => dimmed < plain - 1e-9)
      .map(({ cell }) => cell);
    assert.deepEqual(lowered, []);
  });

  it('leaves the edge under 3:1 in every cell, between the figures the design-system spec states', () => {
    assert.deepEqual(
      cells.filter(({ dimmed }) => dimmed >= 3).map(({ cell }) => cell),
      []
    );
    assert.deepEqual(range('dimmed'), ['1.66', '2.51']);
    assert.deepEqual(range('surface'), ['1.01', '1.15']);
  });

  it('fades the window’s text and a focus ring behind it, and shifts its grounds little, by the figures the specs state', () => {
    assert.deepEqual(range('text'), ['10.15', '17.72'], 'the text on the window, undimmed');
    assert.deepEqual(range('textDimmed'), ['1.68', '1.91'], 'the same text under the scrim');
    assert.deepEqual(range('ring'), ['1.35', '1.69'], 'the accent ring under the scrim');
    assert.deepEqual(range('shift'), ['1.00', '1.32'], 'each ground against itself dimmed');
    const unmoved = [...themes]
      .filter(
        ([, tokens]) =>
          contrast(flatten(tokens.get(scrim), tokens.get('--fab-bg-0')), tokens.get('--fab-bg-0')) <
          1.005
      )
      .map(([theme]) => theme);
    assert.equal(unmoved.length, 6, `the bg-0 ground is unchanged in six palettes: ${unmoved}`);
    assert.ok(!unmoved.includes('mythwright'), 'all but mythwright');
  });
});
