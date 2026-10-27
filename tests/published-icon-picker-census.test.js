/**
 * The module sheet and every component style against the published `IconPicker` (issue 2647): the
 * 13 selectors that name its two roots, the trigger's `fabricate-icon-picker` and the panel's
 * `fabricate-icon-picker-popover`, each of which a published picker matches with nothing above its
 * root, the classes its file spells on them, the bare `button` rules its trigger takes, and the
 * focus marks: the trigger's module ring, 2px wide and 2px clear, which clears 3:1 on the four
 * grounds its group names, and the query field's 1px accent border, drawn on the field's own fill.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, reads no
 * rule that styles the picker's rows or trigger without naming a root, and counts every class the
 * shared panel draws for a row as drawn.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineAccentRingContrast } from './helpers/accentRingContrast.js';
import { walkNodes } from './helpers/moduleAst.js';
import {
  BARE_BUTTON_ANCESTORS,
  BARE_BUTTON_RULES,
  bareButtonSelectors,
  dataHooksOf,
  entryNamed,
  placementFaults,
  shippedCensus,
  spelledStrings,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import {
  SHIPPED,
  byName,
  declarationsOf,
  everyStylesheet,
  gatedRoot,
} from './helpers/publishedComponentGate.js';
import { collectStyleCorpus, rulesIn } from './helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls,
  themePalettes,
} from './helpers/themePaletteContrast.js';

const COMPONENT = 'src/ui/svelte/components/IconPicker.svelte';
const SHEET = 'styles/fabricate-manager-library.css';

/**
 * The trigger side's root: the classes every published picker draws beside it, which no published
 * key writes or withholds, and no ancestor a Fabricate rule redraws it under.
 */
const PICKER = Object.freeze({
  root: 'fabricate-icon-picker',
  writable: new Set(['essence-icon-picker', 'fabricate-picker', 'manager-travel-picker']),
  ancestors: new Set(),
  drawsChildren: true,
  undrawn: new Set(['icon-only']),
});

/** The panel's root, which the shared picker portals into the overlay host, likewise. */
const PANEL = Object.freeze({
  root: 'fabricate-icon-picker-popover',
  writable: new Set([
    'essence-icon-picker-popover',
    'fabricate-picker-popover',
    'manager-travel-popover',
  ]),
  ancestors: new Set(),
  drawsChildren: true,
  undrawn: new Set(['is-compact-option-rows']),
});

/** The five rules that draw the trigger side, every one in its sheet. */
const PICKER_FAMILY = Object.freeze([
  '.fabricate-icon-picker .essence-icon-picker-preview',
  '.fabricate-icon-picker .essence-icon-picker-trigger',
  '.fabricate-icon-picker .essence-icon-picker-trigger',
  '.fabricate-icon-picker .essence-icon-picker-trigger-label',
  '.fabricate-icon-picker.essence-icon-picker',
]);

/** The eight rules that draw the panel, every one in its sheet; `pinned` is drawn on the value's row. */
const PANEL_FAMILY = Object.freeze([
  '.fabricate-icon-picker-popover .essence-icon-picker-option span:last-child',
  '.fabricate-icon-picker-popover .essence-icon-picker-preview',
  '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-option',
  '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-option.pinned',
  ".fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-option[aria-selected='true']",
  '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-option:hover',
  '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-options',
  '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-preview',
]);

/** The rule that marks the query field's focus by its border, which the module's field ring yields to. */
const FIELD_FOCUS = '.fabricate-picker-popover .manager-travel-popover-search input:focus-visible';
const FIELD = '.fabricate-picker-popover .manager-travel-popover-search input';

const writtenOf = (census) =>
  census.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = (shape) => shippedCensus(shape, 'IconPicker');
const inSheet = (selectors) => selectors.map((selector) => `${SHEET}: ${selector}`).sort(byName);
/** Whether a declaration draws or strips a ring. */
const ringProperty = ([property]) =>
  property === 'all' || property === 'box-shadow' || property.startsWith('outline');

describe('the module sheet and every component style against the published IconPicker', () => {
  it('reaches a published picker through all 13 selectors that name its two roots', () => {
    const [picker, panel] = [census(PICKER), census(PANEL)];
    assert.equal(picker.length, 5, 'the census of every selector naming the trigger root');
    assert.equal(panel.length, 8, 'the census of every selector naming the panel root');
    assert.deepEqual(writtenOf(reachingOf(picker)), inSheet(PICKER_FAMILY));
    assert.deepEqual(writtenOf(reachingOf(panel)), inSheet(PANEL_FAMILY));
    const entry = entryNamed('IconPicker');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry), entry.rest],
      [
        [
          'value',
          'onChange',
          'ariaLabel',
          'listLabel',
          'searchLabel',
          'searchPlaceholder',
          'noMatchesText',
        ],
        'fabricate',
        false,
      ],
      'a published disabled, iconOnly, bounds, class, rest, or a gated root other than `fabricate` reopens the census'
    );
  });

  it('draws a published picker alike under any ancestor, and no reaching rule draws a ring or reads a hook', () => {
    for (const shape of [PICKER, PANEL]) {
      const reaching = reachingOf(census(shape));
      assert.deepEqual(placementFaults(reaching, shape, []), [], shape.root);
      assert.deepEqual(
        dataHooksOf(reaching),
        [],
        `${shape.root}: no reaching rule reads a data-* hook`
      );
      assert.deepEqual(
        reaching.flatMap(({ written, rule }) =>
          declarationsOf(rule)
            .filter((declaration) => ringProperty(declaration))
            .map(([property]) => `${written} declares ${property}`)
        ),
        [],
        `${shape.root}: the trigger takes the module ring, and the field its own border`
      );
    }
  });

  it('holds the classes its file spells beside each root to the census', () => {
    // A class handed to the shared picker as a `*Class` prop's text is spelled there too.
    const handed = [...walkNodes(SHIPPED.component(COMPONENT).fragment)]
      .filter((node) => node.type === 'Attribute' && node.name.endsWith('Class'))
      .flatMap(({ value }) => [value].flat().filter((part) => part.type === 'Text'))
      .map(({ data }) => data);
    const tokens = new Set(
      [...spelledStrings(COMPONENT, SHIPPED), ...handed].flatMap((spelled) => spelled.split(/\s+/))
    );
    for (const name of [
      PICKER.root,
      PANEL.root,
      'essence-icon-picker',
      'essence-icon-picker-popover',
      'icon-only',
      'pinned',
    ]) {
      assert.ok(tokens.has(name), `${COMPONENT} spells ${name}`);
    }
  });

  it('takes the four module rules a bare button takes on its trigger, and no other bare button rule', () => {
    const trigger = { writable: new Set(['essence-icon-picker-trigger']) };
    const bare = everyStylesheet().flatMap(([file, css]) =>
      bareButtonSelectors(file, css, trigger, BARE_BUTTON_ANCESTORS)
    );
    assert.ok(bare.length >= 18, `the sheets were read: ${bare.length} bare button selectors`);
    assert.deepEqual(writtenOf(reachingOf(bare)), [...BARE_BUTTON_RULES].sort(byName));
  });
});

describe('the icon picker census, synthetic', () => {
  const reachingIn = (shape, css) => writtenOf(reachingOf(syntheticCensus(shape, css)));

  for (const [shape, selector] of [
    [PICKER, '.fabricate-icon-picker .essence-icon-picker-trigger.icon-only'],
    [PANEL, '.fabricate-icon-picker-popover.is-compact-option-rows .essence-icon-picker-option'],
    [PICKER, '.fabricate-icon-picker.is-disabled'],
  ]) {
    it(`admits ${selector}, which a published picker cannot take`, () => {
      assert.deepEqual(reachingIn(shape, `${selector} { gap: 0 }`), []);
    });
  }

  for (const [shape, selector] of [
    [PICKER, '.fabricate-icon-picker .essence-icon-picker-trigger'],
    [PANEL, '.fabricate .fabricate-icon-picker-popover .essence-icon-picker-option'],
    [PANEL, '.fabricate-icon-picker-popover[data-x]'],
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published picker`, () => {
      assert.deepEqual(reachingIn(shape, `${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});

describe('the keyboard ring on the published IconPicker’s trigger, which is the module ring', () => {
  defineAccentRingContrast('.fabricate button:focus-visible', { moduleRings: [] });
});

describe('the focus mark on the published IconPicker’s query field', () => {
  const rules = rulesIn(collectStyleCorpus()['styles/fabricate.css']);
  const themes = themePalettes(rules);

  it('turns its 1px border to the accent and draws no outline', () => {
    const focus = rules.filter((rule) => rule.selector === FIELD_FOCUS);
    assert.equal(focus.length, 1, 'one rule marks the focused field');
    assert.deepEqual(Object.fromEntries(propertiesOf(focus[0])), {
      outline: 'none',
      'border-color': 'var(--fab-accent)',
    });
    assert.equal(
      propertiesOf(rules.find((rule) => rule.selector === FIELD)).get('border'),
      '1px solid var(--fab-accent-border)'
    );
  });

  it('clears 3:1 against the field’s own fill in every theme', () => {
    const fill = declaredToken(rules, FIELD, 'background');
    assert.deepEqual(shortfalls(themes, '--fab-accent', [fill], 3), []);
  });
});
