/**
 * The module sheet and every component style against the published `Select` (issue 2454): every
 * selector that names a `fabricate-select*` or `fabricate-picker*` class, which of them a published
 * select can match, and the classes its trigger and panel draw. A rule a published select takes
 * names only classes it draws and no Fabricate root, so it draws the trigger in `target` and the
 * panel in any overlay host alike; every other sits under a pinned ancestor, or needs a class or a
 * hook no published key draws. Its trigger is a bare `button`, so it also takes the four module
 * rules a published `Button` does, `.fabricate-manager button`'s `font: inherit` under the Manager
 * alone, as every select of Fabricate's own does.
 * Limit: the census takes on trust that no extension target sits under a pinned ancestor, reads a
 * component's selector only where `:global` reaches it, and counts every class a member of a
 * companion's `options` can draw as drawn, the private members' included.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { templateOf } from './helpers/apiConvention.js';
import { walkNodes } from './helpers/moduleAst.js';
import { drawnClosure } from './helpers/publishedClosureDrawn.js';
import {
  BARE_BUTTON_ANCESTORS,
  BARE_BUTTON_RULES,
  bareButtonSelectors,
  classesOf,
  compoundsOf,
  entryNamed,
  ownFilesOf,
  reachedByGlobal,
  spelledStrings,
} from './helpers/publishedComponentCensus.js';
import {
  SHIPPED,
  byName,
  everyStylesheet,
  gatedRoot,
  selectorsWithRules,
  writtenSelector,
} from './helpers/publishedComponentGate.js';

const SELECT = 'src/ui/svelte/components/Select.svelte';
const FAMILY = /^fabricate-(?:select|picker)/;
const APP_ROOTS = new Set(['fabricate', 'fabricate-app', 'fabricate-manager']);

/** The published `size` values, each of which `Select` composes into a trigger and a panel class. */
const RUNGS = Object.freeze(['form', 'inline', 'toolbar']);
const RUNG_PREFIXES = Object.freeze(['fabricate-select-trigger-', 'fabricate-select-popover-']);

/** Every class a published select draws: its picker root, trigger, value, panel, list and rows. */
const SELECT_DRAWN = new Set([
  'fabricate-picker',
  'manager-travel-picker',
  'fabricate-select',
  'fabricate-select-trigger',
  ...RUNGS.map((rung) => `fabricate-select-trigger-${rung}`),
  'manager-travel-picker-value',
  'fabricate-select-value',
  'fabricate-select-value-placeholder',
  'fabricate-picker-popover',
  'manager-travel-popover',
  'fabricate-select-popover',
  ...RUNGS.map((rung) => `fabricate-select-popover-${rung}`),
  'fabricate-select-popover-ticked',
  'manager-travel-popover-options',
  'fabricate-select-options',
  'manager-travel-popover-group',
  'manager-travel-popover-group-label',
  'manager-travel-popover-empty',
  'manager-travel-option',
  'fabricate-select-option',
  'fabricate-select-tick',
  'fabricate-select-lines',
  'fabricate-select-label',
  'fabricate-select-hint',
  'fabricate-select-badge',
  'fabricate-select-reason',
]);

/** The classes under which a rule redraws a select of Fabricate's own; no extension target sits in one. */
const SELECT_ANCESTORS = new Set([
  'crafting-browser-filter-category',
  'crafting-browser-filter-system',
  'fab-bulk-edit-select',
  'fab-complication-condition-row',
  'fab-complication-trigger',
  'fabricate-field',
  'fabricate-interactable-browser',
  'fabricate-interactable-config',
  'fabricate-interactables-manager-body',
  'fabricate-roll-prompt',
  'fabricate-routing-overview',
  'inventory-sort',
  'journal-kind-field',
  'journal-sort',
  'manager-character-modifier-operator-select',
  'manager-checks-band-record',
  'manager-checks-preview-against',
  'manager-checks-preview-record-select',
  'manager-checks-trigger-step-operand',
  'manager-component-category-filter',
  'manager-component-category-select',
  'manager-component-essence-filter',
  'manager-component-toolbar',
  'manager-condition-current',
  'manager-condition-modifier-picker',
  'manager-condition-shortcut',
  'manager-environment-context-field',
  'manager-filter',
  'manager-gathering-task-edit-view',
  'manager-prerequisite-condition',
  'manager-recipe-award-strategy',
  'manager-recipe-category-filter',
  'manager-recipe-field',
  'manager-recipe-option-kind',
  'manager-recipe-route-select',
  'manager-rule-field',
  'manager-salvage-dc-select',
  'manager-scope-select',
  'manager-scoped-list-toolbar',
  'manager-task-node-interval-row',
  'manager-tool-actor-select',
  'manager-tools-sort-row',
  'manager-vocabulary-shell-panel',
]);

/**
 * The classes of the picker and the select that no published key draws: the labelled form, the
 * mono value, the picker's other trigger forms, its query field, footer and key hints, the
 * panel's own row content, which `Select`'s `option` snippet replaces, and other callers' rows.
 */
const SELECT_UNDRAWN = new Set([
  'fabricate-color-picker-popover',
  'fabricate-picker-key-hints',
  'fabricate-picker-key-hints-text',
  'fabricate-select-error',
  'fabricate-select-field',
  'fabricate-select-note',
  'fabricate-select-value-mono',
  'fabricate-set-picker-option',
  'manager-recipe-tag-create',
  'manager-travel-option-lines',
  'manager-travel-option-marker',
  'manager-travel-option-meta',
  'manager-travel-option-name',
  'manager-travel-picker-copy',
  'manager-travel-picker-inline',
  'manager-travel-picker-inline-close',
  'manager-travel-picker-meta',
  'manager-travel-picker-trigger',
  'manager-travel-popover-search',
  'manager-travel-portrait',
]);

/** The attribute selectors no published select matches: the grid and tile forms, and two caller hooks. */
const SELECT_UNDRAWN_HOOKS = new Set([
  '[data-picker-as=grid]',
  '[data-picker-columns=2]',
  '[data-picker-columns=3]',
  '[data-picker-columns=4]',
  '[data-picker-columns=5]',
  '[data-picker-columns=6]',
  '[data-picker-tiles=square]',
  '[data-routing-overview-tone]',
  '[data-routing-overview-tone=success]',
  '[data-routing-overview-tone=warning]',
  '[data-gathering-task-node-interval-unit]',
]);

/** The rules that draw a published select, each naming only classes it draws, as written. */
const SELECT_FAMILY_RULES = Object.freeze([
  'styles/fabricate-manager-travel.css: .fabricate-picker-popover .manager-travel-option',
  'styles/fabricate-manager-travel.css: .fabricate-picker-popover .manager-travel-option:hover',
  'styles/fabricate-manager-travel.css: .fabricate-picker-popover .manager-travel-popover-empty',
  'styles/fabricate-manager-travel.css: .fabricate-picker-popover .manager-travel-popover-group',
  'styles/fabricate-manager-travel.css: .fabricate-picker-popover .manager-travel-popover-group + .manager-travel-popover-group',
  'styles/fabricate-manager-travel.css: .fabricate-picker-popover .manager-travel-popover-group-label',
  'styles/fabricate-manager-travel.css: .fabricate-picker-popover .manager-travel-popover-options',
  "styles/fabricate-manager-travel.css: .fabricate-picker-popover.manager-travel-popover .manager-travel-option[data-active-option='true']",
  'styles/fabricate-manager-travel.css: .fabricate-picker-popover.manager-travel-popover',
  'styles/fabricate-manager-travel.css: .fabricate-picker.manager-travel-picker',
  'styles/fabricate-select.css: .fabricate-picker-popover.fabricate-select-popover',
  'styles/fabricate-select.css: .fabricate-picker-popover.fabricate-select-popover-form',
  'styles/fabricate-select.css: .fabricate-picker-popover.fabricate-select-popover-inline',
  'styles/fabricate-select.css: .fabricate-picker-popover.fabricate-select-popover-toolbar',
  'styles/fabricate-select.css: .fabricate-select .fabricate-select-trigger-form',
  'styles/fabricate-select.css: .fabricate-select .fabricate-select-trigger-inline',
  'styles/fabricate-select.css: .fabricate-select .fabricate-select-trigger-toolbar',
  'styles/fabricate-select.css: .fabricate-select .fabricate-select-trigger:focus-visible',
  'styles/fabricate-select.css: .fabricate-select-badge',
  'styles/fabricate-select.css: .fabricate-select-hint',
  'styles/fabricate-select.css: .fabricate-select-label',
  'styles/fabricate-select.css: .fabricate-select-lines',
  'styles/fabricate-select.css: .fabricate-select-lines .fabricate-select-label',
  "styles/fabricate-select.css: .fabricate-select-option[aria-disabled='true']",
  "styles/fabricate-select.css: .fabricate-select-option[aria-selected='true'] .fabricate-select-tick",
  'styles/fabricate-select.css: .fabricate-select-popover .fabricate-select-option',
  "styles/fabricate-select.css: .fabricate-select-popover .fabricate-select-option[aria-selected='true']",
  'styles/fabricate-select.css: .fabricate-select-popover [data-popover-group] > p',
  'styles/fabricate-select.css: .fabricate-select-popover-ticked [data-popover-group] > p',
  'styles/fabricate-select.css: .fabricate-select-reason',
  'styles/fabricate-select.css: .fabricate-select-tick',
  'styles/fabricate-select.css: .fabricate-select-trigger',
  'styles/fabricate-select.css: .fabricate-select-trigger > i',
  'styles/fabricate-select.css: .fabricate-select-trigger > i:last-child',
  "styles/fabricate-select.css: .fabricate-select-trigger[aria-disabled='true']",
  "styles/fabricate-select.css: .fabricate-select-trigger[aria-invalid='true']",
  'styles/fabricate-select.css: .fabricate-select-trigger:disabled',
  'styles/fabricate-select.css: .fabricate-select-value',
  'styles/fabricate-select.css: .fabricate-select-value-placeholder',
]);

const attributeText = (part) => `[${part.name}${part.matcher ?? ''}${part.value ?? ''}]`;

/**
 * One census row per selector of one sheet that names a family class, as `{ written, kept,
 * classes, hooks, within }`: `kept` lists the pinned ancestors above the last family compound, and
 * the undrawn classes and hooks anywhere in it, that keep it off a published select.
 */
function censusRows(file, css, own, pins) {
  return selectorsWithRules(css, (part) => part.type === 'ClassSelector' && FAMILY.test(part.name))
    .filter(({ complex }) => !own.has(file) || reachedByGlobal(css, complex))
    .map(({ complex, within }) => {
      const compounds = compoundsOf(complex);
      const last = compounds.findLastIndex((compound) =>
        classesOf(compound).some((name) => FAMILY.test(name))
      );
      const above = compounds.slice(0, last).flatMap((compound) => classesOf(compound));
      const classes = compounds.flatMap((compound) => classesOf(compound));
      const hooks = [...walkNodes(complex)]
        .filter((part) => part.type === 'AttributeSelector')
        .map((part) => attributeText(part));
      const kept = [
        ...above.filter((name) => pins.ancestors.has(name)),
        ...classes.filter((name) => pins.undrawn.has(name)),
        ...hooks.filter((hook) => pins.hooks.has(hook)),
      ];
      return {
        written: `${file}: ${writtenSelector(css, complex)}`,
        kept,
        classes,
        hooks,
        within,
      };
    });
}

const SHIPPED_PINS = Object.freeze({
  ancestors: SELECT_ANCESTORS,
  undrawn: SELECT_UNDRAWN,
  hooks: SELECT_UNDRAWN_HOOKS,
});

const shippedRows = (pins = SHIPPED_PINS) =>
  everyStylesheet().flatMap(([file, css]) => censusRows(file, css, ownFilesOf('Select'), pins));

const reachingOf = (rows) => rows.filter(({ kept }) => kept.length === 0);
const writtenOf = (rows) => rows.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);

/** What a reaching rule breaks: a class the select does not draw, a Fabricate root, or an at-rule. */
function reachingFaults({ written, classes, within }) {
  return [
    ...classes
      .filter((name) => !SELECT_DRAWN.has(name) && !APP_ROOTS.has(name))
      .map((name) => `${written} names ${name}, which the census neither draws nor pins`),
    ...classes
      .filter((name) => APP_ROOTS.has(name))
      .map((name) => `${written} names the Fabricate root ${name}`),
    ...within
      .filter((holder) => holder !== '@media' && holder !== '@supports')
      .map((holder) => `${written} sits inside ${holder}`),
  ];
}

describe('the module sheet and every component style against the published Select', () => {
  it('reaches a published select through its family rules alone, each drawn alike under any host', () => {
    const reaching = reachingOf(shippedRows());
    assert.deepEqual(writtenOf(reaching), [...SELECT_FAMILY_RULES].sort(byName));
    assert.deepEqual(
      reaching.flatMap((row) => reachingFaults(row)),
      []
    );
  });

  it('keeps every other selector off by a pin, and each pin keeps at least one off', () => {
    const rows = shippedRows();
    assert.ok(rows.length > 100, `the sheet and the component styles were read: ${rows.length}`);
    const used = new Set(rows.flatMap(({ kept }) => kept));
    const stale = [...SELECT_ANCESTORS, ...SELECT_UNDRAWN, ...SELECT_UNDRAWN_HOOKS].filter(
      (pin) => !used.has(pin)
    );
    assert.deepEqual(stale, [], 'a pin no selector needs is stale');
  });

  it('draws each class it pins as drawn, as its drawn closure spells it', () => {
    const { files } = drawnClosure(entryNamed('Select'), SHIPPED);
    // A class handed to a child as a `*Class` prop's text is spelled there too.
    const handed = (file) =>
      [...walkNodes(SHIPPED.component(file).fragment)]
        .filter((node) => node.type === 'Attribute' && node.name.endsWith('Class'))
        .flatMap(({ value }) => [value].flat().filter((part) => part.type === 'Text'))
        .map(({ data }) => data);
    const tokens = new Set(
      [...files]
        .flatMap((file) => [...spelledStrings(file, SHIPPED), ...handed(file)])
        .flatMap((text) => text.split(/\s+/))
    );
    const composed = (name) =>
      RUNG_PREFIXES.some(
        (prefix) => tokens.has(prefix) && RUNGS.some((rung) => name === `${prefix}${rung}`)
      );
    assert.deepEqual(
      [...SELECT_DRAWN].filter((name) => !tokens.has(name) && !composed(name)),
      [],
      'a class the census calls drawn is spelled by a file the select draws'
    );
    const sizes = [...walkNodes(SHIPPED.component(SELECT).instance)].find(
      (node) => node.type === 'VariableDeclarator' && node.id.name === 'SIZES'
    );
    const keys = sizes.init.arguments[0].properties.map(({ key }) => key.name);
    assert.deepEqual(keys, [...RUNGS], 'the rungs are the ones `Select` composes');
  });

  it('replaces the panel’s own row content with its option snippet, which keeps those classes undrawn', () => {
    const popover = [...walkNodes(SHIPPED.component(SELECT).fragment)].find(
      (node) => node.type === 'Component' && node.name === 'SearchablePopover'
    );
    assert.ok(
      popover.attributes.some(({ name }) => name === 'option'),
      'Select passes its row snippet as `option`'
    );
  });

  it('takes the four module rules a bare button takes on its trigger, and no other bare button rule', () => {
    const trigger = {
      writable: new Set([
        'fabricate-select-trigger',
        ...RUNGS.map((rung) => `fabricate-select-trigger-${rung}`),
      ]),
    };
    const census = everyStylesheet().flatMap(([file, css]) =>
      bareButtonSelectors(file, css, trigger, BARE_BUTTON_ANCESTORS)
    );
    assert.ok(census.length >= 18, `the sheets were read: ${census.length} bare button selectors`);
    assert.deepEqual(
      writtenOf(census.filter(({ safe }) => !safe)),
      [...BARE_BUTTON_RULES].sort(byName)
    );
  });

  it('publishes no key that would reopen the census', () => {
    const entry = entryNamed('Select');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry), entry.rest],
      [['options', 'value', 'onChange', 'ariaLabel', 'placeholder', 'size'], 'fabricate', false],
      'a published label, mono, readonly, disabled, class, rest or wider root reopens the census'
    );
  });
});

describe('the select census, synthetic', () => {
  const reachingIn = (css) =>
    writtenOf(
      reachingOf(
        censusRows(
          'sheet.css',
          templateOf('sheet.css', `<style>${css} { gap: 0 }</style>`).ast.css,
          new Set(),
          SHIPPED_PINS
        )
      )
    );

  for (const selector of [
    '.fabricate-manager .manager-filter .fabricate-select-trigger',
    '.fabricate-select-field .fabricate-select-trigger',
    ".fabricate-picker-popover .manager-travel-popover-options[data-picker-as='grid']",
    '.fabricate-picker-popover .manager-travel-option-name',
  ]) {
    it(`admits ${selector}, which a published select cannot take`, () => {
      assert.deepEqual(reachingIn(selector), []);
    });
  }

  for (const selector of [
    '.fabricate-select-trigger',
    '.fabricate-manager .fabricate-select-trigger',
    '.manager-unpinned-row .fabricate-select-trigger',
    ".fabricate-picker-popover .manager-travel-popover-options[data-picker-as='list']",
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published select`, () => {
      assert.deepEqual(reachingIn(selector), [`sheet.css: ${selector}`]);
    });
  }

  it('names a reaching rule that draws under a Fabricate root, or names a class it neither draws nor pins', () => {
    const rows = censusRows(
      'sheet.css',
      templateOf(
        'sheet.css',
        '<style>.fabricate-manager .fabricate-select-trigger { gap: 0 } .manager-unpinned-row .fabricate-select-trigger { gap: 0 }</style>'
      ).ast.css,
      new Set(),
      SHIPPED_PINS
    );
    assert.deepEqual(
      rows.flatMap((row) => reachingFaults(row)),
      [
        'sheet.css: .fabricate-manager .fabricate-select-trigger names the Fabricate root fabricate-manager',
        'sheet.css: .manager-unpinned-row .fabricate-select-trigger names manager-unpinned-row, which the census neither draws nor pins',
      ]
    );
  });
});
