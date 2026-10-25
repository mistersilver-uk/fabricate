/**
 * The module sheet and every component style against the published `Modal` (issue 2656): the
 * three selectors that name its root, `fabricate-modal`, which are Well's modal-fill rule, the roll
 * prompt's height rule, which no published dialog matches, and Modal's own close-control paint;
 * the module sheet's `.manager-muted` rules that can restyle the subtitle; the close control's
 * module ring; and the header band's inks, the subtitle's pinned shortfall for shortfall.
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
  importClosure,
} from './helpers/publishedComponentGate.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from './helpers/styleBlockScan.js';
import { propertiesOf, shortfalls, themePalettes } from './helpers/themePaletteContrast.js';

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

/** The properties the scoped `.manager-modal-subtitle` rule declares. */
const SUBTITLE_PROPERTIES = Object.freeze([
  'margin',
  'color',
  'font-size',
  'font-weight',
  'line-height',
]);

/**
 * The module sheet's `.fabricate-manager … .manager-muted` rules a subtitle can match, which sits
 * in `.manager-modal-heading` and carries no `is-danger`, beside what each declares that the
 * scoped subtitle rule also declares.
 */
const SUBTITLE_RESTYLES = Object.freeze({
  '.fabricate-manager .manager-checks-rail .manager-muted': [
    ['margin', '0'],
    ['color', 'var(--fab-text-subtle)'],
    ['font-size', '10.5px'],
    ['font-weight', '400'],
    ['line-height', '1.5'],
  ],
  '.fabricate-manager .manager-checks-active-card .manager-muted': [
    ['color', 'var(--fab-text-muted)'],
    ['font-size', '10.5px'],
    ['line-height', '1.35'],
  ],
  '.fabricate-manager[data-manager-view="recipe-edit"] .manager-muted': [['font-size', '0.64rem']],
  '.fabricate-manager[data-manager-view="recipes"] .manager-muted': [['font-size', '0.64rem']],
  '.fabricate-manager .manager-muted': [
    ['margin', 'var(--fab-space-2xs) 0 0'],
    ['color', 'var(--fab-text-muted)'],
    ['font-size', '0.78rem'],
    ['line-height', '1.35'],
  ],
  '.fabricate-manager .manager-tools-authority-card .manager-muted': [
    ['margin', 'var(--fab-space-1) 0 0'],
    ['font-size', '0.7rem'],
    ['line-height', '1.3'],
  ],
});

/** The `.manager-muted` selectors no subtitle can match: a danger note, and a direct child of another parent. */
const UNMATCHED_MUTED = Object.freeze([
  '.fabricate-manager .manager-muted.is-danger',
  '.fabricate-manager .manager-tool-browser-inspector > .manager-muted',
]);

const writtenOf = (census) =>
  census.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);

describe('the module sheet and every component style against the published Modal', () => {
  const rules = rulesIn(collectStyleCorpus()['styles/fabricate.css']);

  it('names the dialog root in three selectors: the modal-fill rule, the roll prompt’s and its own close-control paint', () => {
    assert.deepEqual(writtenOf(shippedCensus(DIALOG, 'Modal')), [
      `${ROLL_PROMPT}: :global(.fabricate-modal[data-manager-modal][data-roll-prompt])`,
      `${COMPONENT}: .fabricate-modal :global([data-manager-modal-close])`,
      `${WELL}: :global(.fabricate-modal) .fab-well`,
    ]);
    const entry = entryNamed('Modal');
    assert.deepEqual(
      [Object.keys(entry.props), entry.root, entry.rest],
      [
        [
          'open',
          'title',
          'subtitle',
          'closeLabel',
          'closeOnOutsideClick',
          'onClose',
          'body',
          'footer',
        ],
        'fabricate',
        false,
      ],
      'a published dialogProps, width, class, rest or wider root reopens the census'
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

  it('holds no module sheet rule naming a manager-modal-* class or a data-manager-modal* hook', () => {
    const named = rules
      .flatMap((rule) => splitSelectorList(rule.selector))
      .filter((selector) => /manager-modal-|data-manager-modal/u.test(selector));
    assert.deepEqual(named, []);
  });

  it('restyles a subtitle in the Manager through each .manager-muted rule that can match it', () => {
    const muted = rules.flatMap((rule) =>
      splitSelectorList(rule.selector)
        .filter((selector) => /\.manager-muted\b/u.test(selector))
        .map((selector) => [selector, rule])
    );
    const matching = muted.filter(([selector]) => !UNMATCHED_MUTED.includes(selector));
    assert.deepEqual(
      muted.map(([selector]) => selector).sort(byName),
      [...Object.keys(SUBTITLE_RESTYLES), ...UNMATCHED_MUTED].sort(byName)
    );
    for (const [selector, rule] of matching) {
      const shared = [...propertiesOf(rule)].filter(([property]) =>
        SUBTITLE_PROPERTIES.includes(property)
      );
      assert.deepEqual(shared, SUBTITLE_RESTYLES[selector], selector);
    }
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

  it('clears 4.5:1 for the subtitle’s Manager ink on the header band in every palette', () => {
    assert.deepEqual(shortfalls(themes, '--fab-text-muted', ['--fab-bg-2']), []);
  });

  it('falls short of 4.5:1 for the subtitle’s own ink on the header band in six palettes, recorded and not fixed', () => {
    assert.deepEqual(shortfalls(themes, '--fab-text-subtle', ['--fab-bg-2']), [
      'fabricate: --fab-text-subtle on --fab-bg-2 3.54:1',
      'ironblood-forge: --fab-text-subtle on --fab-bg-2 3.34:1',
      'hearth-herb: --fab-text-subtle on --fab-bg-2 3.40:1',
      'starglass-arcana: --fab-text-subtle on --fab-bg-2 3.48:1',
      'foundry-native: --fab-text-subtle on --fab-bg-2 3.47:1',
      'sovereign: --fab-text-subtle on --fab-bg-2 3.78:1',
    ]);
  });
});
