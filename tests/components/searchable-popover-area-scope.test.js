/** A SHARED PICKER MUST PAINT WHEREVER IT IS MOUNTED (issues 1464 and 1470). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  FIXTURE_ALLOWLIST,
  FIXTURE_ALLOWLIST_ATTRIBUTE_COUNT,
} from '../helpers/managerButtonFixtureAllowlist.js';
import { collectWorkingTreeSources, repoRoot, stripComments } from '../helpers/sourceScan.js';
import { splitSelectorList, stripCssComments } from '../helpers/styleBlockScan.js';
import { declaredPropNames } from '../helpers/sveltePropsDeclaration.js';

const STYLESHEET = 'styles/fabricate.css';

/**
 * THE COMPONENT A CLASS PROP IS PASSED TO (issue 1503).
 * `triggerClass` is deliberately absent. It is a pass-through to the primitive's OWN trigger
 * button, which is not rendered at all when a caller supplies a `trigger` snippet — so it lands
 * on no element either component owns, and reading it as emission would credit a class nothing
 * writes.
 */
const SEARCHABLE_POPOVER = 'src/ui/svelte/components/SearchablePopover.svelte';
const CLASS_PROPS = Object.freeze([
  'pickerClass',
  'popoverClass',
  'searchClass',
  'listClass',
  'optionClass',
]);

/**
 * Twenty-one shared primitives, each with the namespace roots it writes and the class family it owns.
 */
const PRIMITIVES = Object.freeze([
  Object.freeze({
    name: 'SearchablePopover',
    // The picker and its portaled panel are ONE entry (issue 1719), because the family they write
    // between them is one family: the trigger's two rules stay in the picker and the panel's
    // twenty-one moved with the markup they root on, so `roots`, `family` and `anchors` apply to
    // the pair unchanged and every floor below is measured over their union.
    components: Object.freeze([
      'src/ui/svelte/components/SearchablePopover.svelte',
      'src/ui/svelte/components/SearchablePopoverPanel.svelte',
    ]),
    roots: Object.freeze(['fabricate-picker', 'fabricate-picker-popover']),
    family: 'manager-travel-[\\w-]+',
    anchors: Object.freeze([
      'manager-travel-picker',
      'manager-travel-popover',
      'manager-travel-option',
      'manager-travel-portrait',
    ]),
    // Measured today (issue 1503): 21 written, 38 family selectors, 30 owned, 8 caller overrides.
    writtenFloor: 12,
    familyFloor: 25,
    ownedFloor: 25,
    // The class attribute that copies the primitive's root markup.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-travel-picker', root: 'fabricate-picker' }),
      Object.freeze({ anchor: 'manager-travel-popover', root: 'fabricate-picker-popover' }),
    ]),
  }),
  Object.freeze({
    name: 'IconPicker',
    components: Object.freeze(['src/ui/svelte/components/IconPicker.svelte']),
    roots: Object.freeze(['fabricate-icon-picker', 'fabricate-icon-picker-popover']),
    family: 'essence-icon-picker[\\w-]*',
    anchors: Object.freeze([
      'essence-icon-picker',
      'essence-icon-picker-popover',
      'essence-icon-picker-trigger',
      'essence-icon-picker-option',
    ]),
    // Measured today (issue 1503): 9 written, 26 family selectors.
    writtenFloor: 8,
    familyFloor: 22,
    ownedFloor: 10,
    classProps: CLASS_PROPS,
    classPropsOwner: SEARCHABLE_POPOVER,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'essence-icon-picker', root: 'fabricate-icon-picker' }),
      Object.freeze({
        anchor: 'essence-icon-picker-popover',
        root: 'fabricate-icon-picker-popover',
      }),
    ]),
  }),
  Object.freeze({
    name: 'EssenceSourceSelector',
    components: Object.freeze(['src/ui/svelte/components/EssenceSourceSelector.svelte']),
    roots: Object.freeze(['fabricate-source-picker', 'fabricate-source-picker-popover']),
    family: 'essence-source-[\\w-]+',
    anchors: Object.freeze([
      'essence-source-selector',
      'essence-source-picker-popover',
      'essence-source-trigger',
      'essence-source-picker-option',
    ]),
    // Measured today (issue 1503): 11 written, 21 family selectors, 16 owned, 5 caller overrides.
    writtenFloor: 10,
    familyFloor: 18,
    ownedFloor: 13,
    classProps: CLASS_PROPS,
    classPropsOwner: SEARCHABLE_POPOVER,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'essence-source-selector', root: 'fabricate-source-picker' }),
      Object.freeze({
        anchor: 'essence-source-picker-popover',
        root: 'fabricate-source-picker-popover',
      }),
    ]),
  }),
  Object.freeze({
    name: 'ActionMenu',
    components: Object.freeze(['src/ui/svelte/components/ActionMenu.svelte']),
    roots: Object.freeze(['fabricate-action-menu', 'fabricate-action-menu-panel']),
    family: 'manager-action-menu[\\w-]*',
    anchors: Object.freeze([
      'manager-action-menu',
      'manager-action-menu-panel',
      'manager-action-menu-item',
    ]),
    // Measured today: 3 written, 9 family selectors, 9 owned.
    // BORN at the primitive rather than re-rooted onto it (issue 1477) — it was
    // `.manager-environment-comp-menu*` under `.fabricate-manager`, named for one of its two
    // callers — so the floors sit just under the measured counts rather than under a re-rooting
    // margin. The one caller-anchored rule the conversion leaves behind,
    // `.manager-component-identity-name-row .manager-component-overflow-trigger`, names the
    // TRIGGER class the caller passes in and is not in this family at all.
    writtenFloor: 3,
    familyFloor: 8,
    ownedFloor: 8,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-action-menu', root: 'fabricate-action-menu' }),
      Object.freeze({ anchor: 'manager-action-menu-panel', root: 'fabricate-action-menu-panel' }),
    ]),
  }),
  Object.freeze({
    name: 'ManagerColorPicker + ManagerColorPopover',
    components: Object.freeze([
      'src/ui/svelte/components/ManagerColorPicker.svelte',
      'src/ui/svelte/components/ManagerColorPopover.svelte',
    ]),
    roots: Object.freeze(['fabricate-color-picker', 'fabricate-color-picker-popover']),
    family: 'manager-color-[\\w-]+',
    anchors: Object.freeze([
      'manager-color-picker',
      'manager-color-picker-popover',
      'manager-color-picker-trigger',
      'manager-color-preset',
    ]),
    // Measured today: 12 written, 16 family selectors, 15 owned, 1 caller override.
    writtenFloor: 10,
    familyFloor: 13,
    ownedFloor: 12,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-color-picker', root: 'fabricate-color-picker' }),
      Object.freeze({
        anchor: 'manager-color-picker-popover',
        root: 'fabricate-color-picker-popover',
      }),
    ]),
  }),
  Object.freeze({
    name: 'ManagerButton',
    components: Object.freeze(['src/ui/svelte/components/ManagerButton.svelte']),
    roots: Object.freeze(['fabricate-button']),
    // Two exact class names, not a shared prefix.
    family: 'manager-button|fab-manager-button',
    anchors: Object.freeze(['manager-button', 'fab-manager-button']),
    // COMPOSES its family in `const classes = $derived([…])` (`ManagerButton.svelte`) rather
    // than in markup — `classesWrittenBy` and the root-emission clause's `attributes` local both
    // read `composedClassRegion` for this entry as well as the (here, empty) markup region.
    composesClasses: true,
    // Measured today: 2 written (the array holds no other unconditional family literal).
    writtenFloor: 2,
    familyFloor: 75,
    ownedFloor: 26,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-button', root: 'fabricate-button' }),
    ]),
  }),
  Object.freeze({
    name: 'IconButton',
    components: Object.freeze(['src/ui/svelte/components/IconButton.svelte']),
    roots: Object.freeze(['fabricate-icon-button']),
    family: 'manager-icon-button',
    anchors: Object.freeze(['manager-icon-button']),
    composesClasses: true,
    // Measured today: 1 written, 22 family selectors, 15 owned — 5 caller-ancestor exempt.
    writtenFloor: 1,
    familyFloor: 18,
    ownedFloor: 13,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-icon-button', root: 'fabricate-icon-button' }),
    ]),
  }),
  Object.freeze({
    name: 'Pagination',
    components: Object.freeze(['src/ui/svelte/components/Pagination.svelte']),
    roots: Object.freeze(['fabricate-pagination']),
    family: 'manager-pagination[\\w-]*',
    anchors: Object.freeze([
      'manager-pagination',
      'manager-pagination-summary',
      'manager-pagination-nav',
      'manager-pagination-page',
      'manager-pagination-size',
    ]),
    // Written inline on the root `<section>` (`Pagination.svelte:215`).
    writtenFloor: 4,
    familyFloor: 15,
    ownedFloor: 5,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-pagination', root: 'fabricate-pagination' }),
    ]),
  }),
  Object.freeze({
    // ── THE NINTH ENTRY, AND THE FIRST WHOSE FAMILY IS ITSELF `fabricate-`-PREFIXED (issue 1504).
    name: 'Select',
    components: Object.freeze(['src/ui/svelte/components/Select.svelte']),
    // The nineteen family classes `Select` writes as WHOLE tokens: the picker root.
    roots: Object.freeze([
      'fabricate-select',
      'fabricate-select-trigger',
      'fabricate-select-value',
      'fabricate-select-value-placeholder',
      'fabricate-select-value-mono',
      'fabricate-select-popover',
      'fabricate-select-popover-ticked',
      'fabricate-select-options',
      'fabricate-select-option',
      'fabricate-select-tick',
      'fabricate-select-lines',
      'fabricate-select-label',
      'fabricate-select-hint',
      'fabricate-select-badge',
      'fabricate-select-reason',
      'fabricate-select-field',
      'fabricate-select-caption',
      'fabricate-select-note',
      'fabricate-select-error',
    ]),
    // `SearchablePopover`'s two roots, which this primitive COMPOSES rather than writes.
    inheritedRoots: Object.freeze(['fabricate-picker', 'fabricate-picker-popover']),
    namespacedFamily: true,
    family: 'fabricate-select[\\w-]*',
    anchors: Object.freeze([
      'fabricate-select',
      'fabricate-select-trigger',
      'fabricate-select-popover',
      'fabricate-select-option',
    ]),
    // Measured at this head: 19 written, 35 family selectors.
    writtenFloor: 16,
    familyFloor: 30,
    ownedFloor: 29,
    // Six props, three of them passed by SHORTHAND (`{triggerClass}`, `{popoverClass}`,
    // `{valueClass}`) because `Select` composes them per size in `<script>`. `triggerClass` and
    // `valueClass` are on this list where the two pickers above omit them, and the difference is
    // real rather than a drift: those two hand the primitive a `trigger` SNIPPET, so its own
    // button is never rendered and the class lands on no element. `Select` supplies no snippet,
    // so both classes are on elements the primitive writes and both carry rules in the sheet.
    classProps: Object.freeze([
      'pickerClass',
      'triggerClass',
      'valueClass',
      'popoverClass',
      'listClass',
      'optionClass',
    ]),
    classPropsOwner: SEARCHABLE_POPOVER,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'fabricate-select', root: 'fabricate-picker' }),
      Object.freeze({ anchor: 'fabricate-select', root: 'manager-travel-picker' }),
      Object.freeze({ anchor: 'fabricate-select-popover', root: 'fabricate-picker-popover' }),
      Object.freeze({ anchor: 'fabricate-select-popover', root: 'manager-travel-popover' }),
    ]),
  }),
  Object.freeze({
    // ── FIELD (issue 1508). The manager's labelled form field, rooted at the class it emits.
    name: 'Field',
    components: Object.freeze(['src/ui/svelte/components/Field.svelte']),
    roots: Object.freeze(['fabricate-field']),
    // One exact class name. `manager-field-error` is a CALLER's class and is deliberately outside
    // this pattern — `pickerSelectors` anchors on `\.manager-field(?![\w-])`, so a rule naming
    // it never enters this family and stays caller-owned.
    family: 'manager-field',
    anchors: Object.freeze(['manager-field']),
    // COMPOSES its family in `const classes = $derived([…])` (`Field.svelte`) rather than in
    // markup: the host is a `<svelte:element … class={classes}>`, an identifier the plain
    // extractor cannot read.
    composesClasses: true,
    // Measured before this change landed: 1 written, 27 family selectors, 9 owned.
    writtenFloor: 1,
    familyFloor: 24,
    ownedFloor: 8,
    mirrored: Object.freeze([Object.freeze({ anchor: 'manager-field', root: 'fabricate-field' })]),
  }),
  Object.freeze({
    // ── MANAGERSEARCHFIELD (issue 1508). Owns its own `<input type="search">`.
    name: 'ManagerSearchField',
    components: Object.freeze(['src/ui/svelte/components/ManagerSearchField.svelte']),
    roots: Object.freeze(['fabricate-search']),
    // One exact class name; `manager-tag-search`.
    family: 'manager-search',
    anchors: Object.freeze(['manager-search']),
    // `SIZE_CLASSES` (`is-size-38`) needs no reader.
    composesClasses: true,
    // Measured before this change landed: 1 written, 31 family selectors, 10 owned.
    writtenFloor: 1,
    familyFloor: 27,
    ownedFloor: 6,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-search', root: 'fabricate-search' }),
    ]),
  }),
  Object.freeze({
    // ── MANAGERTOOLBAR (issue 1508). The manager's filter bar, rooted at the class it emits.
    // It declares NO font floor and NO focus pair, and that is a positive decision rather than a
    // gap: the bar renders `{@render children?.()}` and owns no control of its own, and
    // `openspec/specs/design-system/spec.md` forbids a primitive displacing an area's chrome for
    // a control it does not own. One family rule nonetheless REACHES a caller's control — the
    // `select.is-size-38` rung — and travels with the family unfloored, which is a recorded
    // residue owned by issues 1510/1511.
    name: 'ManagerToolbar',
    components: Object.freeze(['src/ui/svelte/components/ManagerToolbar.svelte']),
    roots: Object.freeze(['fabricate-filter-bar']),
    // One exact class name. `manager-toolbar-pills` (`fabricate.css:4194`) and
    // `manager-toolbar-primary` are CALLER classes: `pickerSelectors` anchors on
    // `\.manager-toolbar(?![\w-])`, so neither enters this family.
    family: 'manager-toolbar',
    anchors: Object.freeze(['manager-toolbar']),
    // COMPOSES its family in `const classes = $derived([…])` rather than in markup.
    composesClasses: true,
    // Measured at this commit: 1 written, 10 family selectors, 3 owned.
    writtenFloor: 1,
    familyFloor: 9,
    ownedFloor: 2,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-toolbar', root: 'fabricate-filter-bar' }),
    ]),
  }),
  Object.freeze({
    // ── INSPECTORCARD (issue 1508). The manager's card shell, rooted at the class it emits.
    name: 'InspectorCard',
    components: Object.freeze(['src/ui/svelte/components/InspectorCard.svelte']),
    roots: Object.freeze(['fabricate-card']),
    // One exact class name. `manager-checks-card`.
    family: 'manager-inspector-card',
    anchors: Object.freeze(['manager-inspector-card']),
    composesClasses: true,
    // Measured at this commit: 1 written, 7 family selectors, 2 owned.
    writtenFloor: 1,
    familyFloor: 6,
    ownedFloor: 1,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-inspector-card', root: 'fabricate-card' }),
    ]),
  }),
  Object.freeze({
    // ── STATUSTOGGLE (issue 1508). The manager's on/off switch, rooted at the class it emits.
    name: 'StatusToggle',
    components: Object.freeze(['src/ui/svelte/components/StatusToggle.svelte']),
    roots: Object.freeze(['fabricate-toggle']),
    // TWO prefixes, because this family really is two.
    family: 'manager-status-toggle[\\w-]*|manager-tool-setting-toggle[\\w-]*',
    anchors: Object.freeze([
      'manager-status-toggle',
      'manager-status-toggle-track',
      'manager-status-toggle-knob',
      'manager-status-toggle-label',
      'manager-tool-setting-toggle',
      'manager-tool-setting-toggle-input',
    ]),
    // COMPOSES its family in `const classes = $derived([…])`, and DECLARES A CLASS MAP besides.
    composesClasses: true,
    classMaps: Object.freeze(['HOST_CLASSES']),
    // Measured at this commit: 6 written, 25 family selectors, 18 owned.
    writtenFloor: 5,
    familyFloor: 21,
    ownedFloor: 15,
    // TWO anchors, and the second matches ZERO fixtures today — measured.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-status-toggle', root: 'fabricate-toggle' }),
      Object.freeze({ anchor: 'manager-tool-setting-toggle', root: 'fabricate-toggle' }),
    ]),
  }),
  Object.freeze({
    // ── CHANCESLIDER (issue 1508). The number-plus-range percentage control.
    name: 'ChanceSlider',
    components: Object.freeze(['src/ui/svelte/components/ChanceSlider.svelte']),
    roots: Object.freeze(['fabricate-slider']),
    // TWO prefixes again, and for a plainer reason.
    family: 'manager-chance-slider[\\w-]*|manager-drop-rate[\\w-]*',
    anchors: Object.freeze([
      'manager-chance-slider',
      'manager-chance-slider-number',
      'manager-chance-slider-control',
      'manager-drop-rate-value',
      'manager-drop-rate-percent',
      'manager-drop-rate-control',
      'manager-drop-rate-track',
      'manager-drop-rate-fill',
    ]),
    // NO `composesClasses`: this component writes every class it emits as a literal.
    writtenFloor: 7,
    familyFloor: 31,
    ownedFloor: 20,
    // The ROOT-ELEMENT anchor, which is what a fixture copying this tree has to carry. Its two
    // ancestry-only mirrors in `manager-layout.test.js` carry `manager-drop-rate-control`
    // instead — a class this component writes on a CHILD — so they are repaired by WRAPPING them
    // in the root element the mirror omitted rather than by a token, because every rule naming
    // that class re-roots to a DESCENDANT chain that a token on the element itself never matches.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-chance-slider', root: 'fabricate-slider' }),
    ]),
  }),
  Object.freeze({
    // ── EDITORTABS (issue 1509). The manager's editor tab strip, rooted at the class it emits.
    // The ROOT does NOT ride the map, deliberately: the tablist writes
    // `` class={`fabricate-tabs ${containerClass}`} ``, a literal the markup reader already sees,
    // which is what keeps the emission clause reading an element the component actually writes.
    name: 'EditorTabs',
    components: Object.freeze(['src/ui/svelte/components/EditorTabs.svelte']),
    roots: Object.freeze(['fabricate-tabs']),
    // ONE prefix, token-terminated, with a lookahead that refuses `manager-editor-table*`. The
    // sheet holds no such class today; the guard is written anyway because the FIXTURE census this
    // pattern also feeds does hit `-table-head` spellings elsewhere in `tests/`.
    family: 'manager-editor-tab(?!le)[\\w-]*',
    anchors: Object.freeze([
      'manager-editor-tabs',
      'manager-editor-tab-button',
      'manager-editor-tab-badge',
      'manager-editor-tab-count',
      'manager-editor-tab-dot',
    ]),
    classMaps: Object.freeze(['DEFAULT_CLASSES']),
    // Measured at this commit: 5 written, 12 family selectors, 7 owned.
    writtenFloor: 4,
    familyFloor: 10,
    ownedFloor: 6,
    // The ROOT-ELEMENT anchor. `manager-editor-tab-button` has the larger fixture population
    // (7 elements over 3 files against this one's 4 attributes over 3) and is REFUSED all the
    // same: it is the BUTTON, a descendant of the root, so a fixture carrying it satisfies this
    // clause by stamping a root onto an element no rule in the sheet roots at.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-editor-tabs', root: 'fabricate-tabs' }),
    ]),
  }),
  Object.freeze({
    // ── EDITORVALIDATIONSURFACE (issue 1509). The aggregate validation header over a grouped,
    // bordered, tagged row stack, rooted at the class it emits.
    name: 'EditorValidationSurface',
    components: Object.freeze(['src/ui/svelte/components/EditorValidationSurface.svelte']),
    roots: Object.freeze(['fabricate-validation']),
    // TWO prefixes and one exact name.
    family: 'manager-recipe-(val|rail)[\\w-]*',
    anchors: Object.freeze([
      'manager-recipe-validation',
      'manager-recipe-validation-summary-row',
      'manager-recipe-rail-summary',
      'manager-recipe-rail-summary-medallion',
      'manager-recipe-rail-summary-copy',
      'manager-recipe-rail-summary-title',
      'manager-recipe-rail-summary-sub',
      'manager-recipe-rail-counts',
      'manager-recipe-rail-count',
      'manager-recipe-rail-count-label',
      'manager-recipe-rail-count-value',
      'manager-recipe-val-group',
      'manager-recipe-val-group-label',
      'manager-recipe-val-rows',
      'manager-recipe-val-row',
      'manager-recipe-val-status',
      'manager-recipe-val-copy',
      'manager-recipe-val-title',
      'manager-recipe-val-detail',
      'manager-recipe-val-view',
      'manager-recipe-val-pill',
    ]),
    composesClasses: true,
    // Measured at this commit: 21 written, 46 family selectors, 37 owned.
    writtenFloor: 18,
    familyFloor: 41,
    ownedFloor: 33,
    // The ROOT-ELEMENT anchor, and it matches ZERO fixture attributes today — measured.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-recipe-validation', root: 'fabricate-validation' }),
    ]),
  }),
  Object.freeze({
    // ── RADIOCARDGROUP (issue 1509). The manager's radio-card group, rooted at the class it emits.
    // IT DECLARES NO `classProps`, AND THAT IS A DECISION WITH A MEASURED REASON. `classPropValues`
    // builds ``new RegExp(`\b${name}=(?:"([^"]*)"|\{`([^`]*)`\})`)``, so a
    // `classProps: ['class']` entry matches EVERY class attribute in this markup — measured, TWELVE
    // of them, at `RadioCardGroup.svelte:90, 95, 97, 98, 102, 105, 120, 124, 125, 127, 131, 137` —
    // and the class-prop floor above requires exactly `classProps.length * components.length`, so
    // it would red at 12 against 1. What that field would have bought — a guard on `Field` renaming
    // or dropping its `class` prop — is bought instead by the mounted root-emission assertion in
    // `tests/components/field-mounted.test.js`, which reads the RENDERED `className` off the
    // fieldset, and by that suite's own mutation control.
    name: 'RadioCardGroup',
    components: Object.freeze(['src/ui/svelte/components/RadioCardGroup.svelte']),
    roots: Object.freeze(['fabricate-option-cards']),
    // ONE prefix and one exact name. `manager-radio-card-group` is the component's own hook class
    // and owns no rule in the sheet; it is in the pattern because the component writes it and a
    // family read out of markup should not silently drop a class the component emits.
    family: 'manager-resolution[\\w-]*|manager-radio-card-group',
    anchors: Object.freeze([
      'manager-resolution-mode-card',
      'manager-resolution-mode-legend',
      'manager-resolution-mode-note',
      'manager-resolution-mode-options',
      'manager-resolution-option',
      'manager-resolution-option-icon',
      'manager-resolution-option-body',
      'manager-resolution-option-name',
      'manager-resolution-option-desc',
      'manager-resolution-option-badge',
      'manager-radio-card-group',
    ]),
    // Measured at this commit: 12 written, 47 family selectors, 31 owned.
    writtenFloor: 10,
    familyFloor: 42,
    ownedFloor: 27,
    // The ROOT-ELEMENT anchor. `manager-resolution-option` has the larger fixture population
    // (9 attributes over 3 files against this one's 4 over 2) and is REFUSED all the same: it is
    // the option ROW, a descendant of the root, so a fixture carrying it satisfies the attribute
    // clause by stamping a root onto an element no rule in the sheet roots at.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-resolution-mode-card', root: 'fabricate-option-cards' }),
    ]),
  }),
  Object.freeze({
    // ── TOGGLECARD (issue 1509). The manager's labelled status card — glyph, title.
    name: 'ToggleCard',
    components: Object.freeze(['src/ui/svelte/components/ToggleCard.svelte']),
    roots: Object.freeze(['fabricate-toggle-card']),
    // FIVE SUFFIXES, ENUMERATED, WITH BARE `manager-recipe-status` EXCLUDED BY SHAPE. This is the
    // most crowded namespace in the sheet: `.manager-recipe-*` occurs 457 times in selector
    // preludes across 55 distinct `manager-recipe-<word>` prefixes, and `manager-recipe[\w-]*`
    // matches 424 selectors against this pattern's 22. Bare `manager-recipe-status` is the recipe
    // ROW's status slot (`styles/fabricate.css` writes it under `.manager-recipe-row` and again on
    // its own), a different thing that happens to be a prefix of these five, and the alternation
    // is what keeps it out — a `manager-recipe-status[\w-]*` pattern would have taken it in.
    family: 'manager-recipe-status-(card|icon|copy|title|sub)[\\w-]*',
    anchors: Object.freeze([
      'manager-recipe-status-card',
      'manager-recipe-status-icon',
      'manager-recipe-status-copy',
      'manager-recipe-status-title',
      'manager-recipe-status-sub',
    ]),
    // Measured at this commit: 5 written, 22 family selectors, 10 owned.
    writtenFloor: 4,
    familyFloor: 19,
    ownedFloor: 9,
    // The ROOT-ELEMENT anchor, and it matches ZERO fixture attributes today — measured.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-recipe-status-card', root: 'fabricate-toggle-card' }),
    ]),
  }),
  Object.freeze({
    // ── ITEMDROPZONE (issue 1509). The manager's ONE document drop target.
    name: 'ItemDropZone',
    components: Object.freeze(['src/ui/svelte/components/ItemDropZone.svelte']),
    roots: Object.freeze(['fabricate-link-field']),
    // ONE prefix, token-terminated. Nothing else in the sheet or in `src/` shares it.
    family: 'manager-item-drop-zone[\\w-]*',
    anchors: Object.freeze([
      'manager-item-drop-zone',
      'manager-item-drop-zone-icon',
      'manager-item-drop-zone-copy',
      'manager-item-drop-zone-actions',
      // WRITTEN BUT UNRULED IN THIS SHEET.
      'manager-item-drop-zone-uuid',
    ]),
    // Measured at this commit: 5 written, 16 family selectors, 15 owned.
    writtenFloor: 4,
    familyFloor: 14,
    ownedFloor: 13,
    // The ROOT-ELEMENT anchor, measured at ZERO fixture attributes, with nothing to refuse.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-item-drop-zone', root: 'fabricate-link-field' }),
    ]),
  }),
  Object.freeze({
    // ── MODIFIERPILLSELECT (issue 1515). The dropdown-plus-removable-pills multi-select.
    name: 'ModifierPillSelect',
    components: Object.freeze(['src/ui/svelte/components/ModifierPillSelect.svelte']),
    roots: Object.freeze(['fabricate-pill-select']),
    // ONE prefix, token-terminated. The three classes the sheet still spells with it and this
    // component does NOT write — `manager-availability-menu`, `-option` and `-empty`, the
    // hand-rolled listbox `SearchablePopover` replaced — are outside the family for the reason
    // `pickerSelectors` anchors on the WRITTEN names rather than on this pattern: nothing emits
    // them, they are owned by issue 1480 through the named exemption in
    // `tests/styles-dead-classes.test.js`, and they stay application-rooted with it.
    family: 'manager-availability-[\\w-]+',
    anchors: Object.freeze([
      'manager-availability-multi',
      // WRITTEN AS A `triggerClass`, which is emission by the same reading `IconPicker`'s
      // `essence-icon-picker-trigger` gets: the value is a literal in this component's markup and
      // the class reaches `SearchablePopover`'s trigger button, which is never portaled and is
      // therefore always inside this primitive's own root.
      'manager-availability-menu-button',
      'manager-availability-pill-row',
      'manager-availability-pill',
      'manager-availability-remove',
      'manager-availability-any',
    ]),
    // Measured at this commit: 6 written, 13 family selectors, 13 owned.
    writtenFloor: 5,
    familyFloor: 11,
    ownedFloor: 11,
    // The ROOT-ELEMENT anchor. It matched ZERO fixture attributes before this change.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-availability-multi', root: 'fabricate-pill-select' }),
    ]),
  }),
]);

const read = (file) => readFileSync(join(repoRoot, file), 'utf8');

/**
 * An APPLICATION root, from one primitive's point of view.
 *
 * @param {string} cls A class name.
 * @param {{roots: readonly string[]}} primitive The primitive whose rules are being judged.
 * @returns {boolean} True when `cls` roots the rule at an application rather than at the primitive.
 */
/** A NAMESPACE class, from one primitive's point of view. */
const isNamespaceClass = (cls, primitive) =>
  primitive.roots.includes(cls) ||
  (primitive.inheritedRoots ?? []).includes(cls) ||
  Boolean(primitive.namespacedFamily && new RegExp(`^(?:${primitive.family})$`).test(cls));

const isApplicationRoot = (cls, primitive) =>
  cls.startsWith('fabricate-') && !isNamespaceClass(cls, primitive);

/**
 * The markup region of a component: after its `<script>`, before any scoped `<style>`.
 *
 * @param {string} file Repository-relative component path.
 * @returns {string} The markup region.
 */
function markupRegion(file) {
  const source = read(file);
  const afterScript = source.indexOf('</script>');
  assert.ok(
    afterScript !== -1,
    `${file} no longer has a <script>, so the markup region this gate reads cannot be located. ` +
      'Retarget the extractor rather than deleting the assertion.'
  );
  const beforeStyle = source.lastIndexOf('<style>');
  return beforeStyle > afterScript ? source.slice(afterScript, beforeStyle) : source.slice(afterScript);
}

/** Every class-attribute VALUE in a markup region — `class="..."` and `class={`...`}` alike. */
function classAttributeValues(markup) {
  return [...markup.matchAll(/class=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (match) => match[1] ?? match[2] ?? ''
  );
}

/**
 * The text of a `composesClasses` primitive's `const classes = $derived([…])` array literal —
 * the region `classesWrittenBy` and the root-emission clause read for a primitive that builds its
 * `class` attribute in `<script>` rather than writing it in markup. `ManagerButton` and
 * `IconButton` both render `class={classes}` — an identifier, not a `class="…"` string or a
 * `` class={`…`} `` template — so `classAttributeValues(markupRegion(file))` finds nothing for
 * either on its own; the family and the root live in this array instead.
 *
 * @param {string} file Repository-relative component path.
 * @returns {string} The array literal's text, brackets included.
 */
function composedClassRegion(file) {
  const source = read(file);
  const opener = 'const classes = $derived(';
  const at = source.indexOf(opener);
  assert.ok(
    at !== -1,
    `${file} no longer declares \`const classes = $derived(\`, so the composed-class region ` +
      'this gate reads cannot be located. Retarget the extractor rather than deleting the ' +
      'assertion.'
  );
  const open = source.indexOf('[', at);
  const close = open === -1 ? -1 : source.indexOf(']', open);
  assert.ok(
    open !== -1 && close !== -1,
    `${file}'s \`const classes = $derived(\` no longer opens an array literal, so the ` +
      'composed-class region this gate reads cannot be located. Retarget the extractor rather ' +
      'than deleting the assertion.'
  );
  return source.slice(open, close + 1);
}

/**
 * The text of a frozen class MAP a component declares in `<script>`.
 *
 * @param {string} file Repository-relative component path.
 * @param {string} constName The map's declared name.
 * @returns {string} The object literal's text, braces included.
 */
function classMapRegion(file, constName) {
  const source = read(file);
  const opener = `const ${constName} = Object.freeze({`;
  const at = source.indexOf(opener);
  assert.ok(
    at !== -1,
    `${file} no longer declares \`${opener}\`, so the class map this gate reads cannot be ` +
      'located. Retarget the extractor rather than deleting the assertion.'
  );
  const open = source.indexOf('{', at + opener.length - 1);
  let depth = 0;
  let end = -1;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  assert.ok(
    end !== -1,
    `${file}'s \`${constName}\` object literal never closes, so the class map this gate reads ` +
      'cannot be located. Retarget the extractor rather than deleting the assertion.'
  );
  return source.slice(open, end + 1);
}

/** The unconditional string literals inside a composed-class array — the tokens no caller omits. */
function composedClassLiteralValues(file) {
  return [...composedClassRegion(file).matchAll(/'([a-z][\w-]*)'/g)].map((match) => match[1]);
}

/**
 * Every DECLARED class-prop VALUE in a markup region.
 *
 * @param {{name: string, classProps?: readonly string[]}} primitive The entry being read.
 * @param {string} file Repository-relative component path, for the error message.
 * @param {string} markup That component's markup region.
 * @returns {string[]} One value per declared class prop.
 */
/**
 * The value of a class prop passed in Svelte's SHORTHAND form — `` {triggerClass} ``.
 *
 * @param {string} file Repository-relative component path.
 * @param {string} name The class prop's name, which is also the identifier's.
 * @returns {string|null} A space-joined class value, or null when there is no such declaration.
 */
function derivedClassPropValue(file, name) {
  const source = read(file);
  const at = source.indexOf(`const ${name} = $derived(`);
  if (at === -1) return null;
  const open = source.indexOf('(', at);
  let depth = 0;
  let end = -1;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  assert.ok(
    end !== -1,
    `${file}'s \`const ${name} = $derived(\` never closes, so the shorthand class-prop reader ` +
      'cannot locate its value. Retarget the extractor rather than deleting the declaration.'
  );
  const INTERPOLATED = '\u{0}';
  return [...source.slice(open, end + 1).matchAll(/`([^`]*)`|'([^']*)'/g)]
    .map((match) => (match[1] ?? match[2]).replaceAll(/\$\{[^}]*\}/g, INTERPOLATED))
    .flatMap((value) => value.split(/\s+/))
    .filter((token) => token && !token.includes(INTERPOLATED))
    .join(' ');
}

function classPropValues(primitive, file, markup) {
  const values = [];
  for (const name of primitive.classProps ?? []) {
    const found = [...markup.matchAll(new RegExp(`\\b${name}=(?:"([^"]*)"|\\{\`([^\`]*)\`\\})`, 'g'))].map(
      (match) => match[1] ?? match[2] ?? ''
    );
    // The SHORTHAND form is one value like the two literal forms.
    if (found.length === 0 && new RegExp(String.raw`\{${name}\}`).test(markup)) {
      const resolved = derivedClassPropValue(file, name);
      if (resolved) found.push(resolved);
    }
    assert.ok(
      found.length > 0,
      `${file} no longer passes \`${name}\`, which ${primitive.name} declares as a class prop, in ` +
        'a form this gate can read. Either the call site has dropped it — in which case the ' +
        'classes it carried are on no element and the rules naming them match nothing — or the ' +
        'value has moved to a shape the reader does not see, in which case retarget the extractor ' +
        'rather than deleting the declaration.'
    );
    values.push(...found);
  }
  return values;
}

/** Every class-attribute-shaped VALUE a primitive writes for itself in `file`. */
function classValuesFor(primitive, file) {
  const markup = markupRegion(file);
  const values = [...classAttributeValues(markup), ...classPropValues(primitive, file, markup)];
  return primitive.composesClasses ? [...values, ...composedClassLiteralValues(file)] : values;
}

/**
 * The class-map values a primitive declares, one value per map, whitespace-joined.
 *
 * @param {{classMaps?: readonly string[]}} primitive
 * @param {string} file Repository-relative component path.
 * @returns {string[]} One value per declared map.
 */
function classMapValues(primitive, file) {
  return (primitive.classMaps ?? []).map((name) => classMapRegion(file, name));
}

/** Every family class the primitive puts on an element of its own. */
function classesWrittenBy(primitive) {
  const written = new Set();
  for (const file of primitive.components) {
    const markup = markupRegion(file);
    const region = [
      markup,
      primitive.composesClasses ? composedClassRegion(file) : '',
      // And every DECLARED class map (issue 1508), for the reason `classMapRegion` states.
      ...(primitive.classMaps ?? []).map((name) => classMapRegion(file, name)),
      ...classPropValues(primitive, file, markup),
    ].join(' ');
    for (const cls of region.match(new RegExp(primitive.family, 'g')) ?? []) {
      written.add(cls);
    }
  }
  return written;
}

/** Selector-level view of a stylesheet, comments stripped so prose cannot match. */
function selectorsIn(css) {
  const out = [];
  const text = stripCssComments(css);
  const pattern = /(^|[};])\s*([^{};@]+?)\s*\{/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const head = match[2].trim();
    if (head.includes('.') || head.includes('[') || /^[a-zA-Z]/.test(head)) {
      for (const selector of splitSelectorList(head)) out.push(selector.replace(/\s+/g, ' ').trim());
    }
    match = pattern.exec(text);
  }
  return out;
}

const compoundsOf = (selector) => selector.split(/\s*(?:>|\+|~|\s)\s*/).filter(Boolean);
const classesOf = (compound) => [...compound.matchAll(/\.([\w-]+)/g)].map((entry) => entry[1]);

/** The stylesheet's selector list, parsed once. */
let stylesheetSelectors = null;
const allSelectors = () => (stylesheetSelectors ??= selectorsIn(read(STYLESHEET)));

/** Selectors that name at least one class the primitive writes. */
function pickerSelectors(written, primitive) {
  const patterns = [...written].map((cls) => new RegExp(`\\.${cls}(?![\\w-])`));
  if (primitive.namespacedFamily) {
    patterns.push(new RegExp(String.raw`\.(?:${primitive.family})(?![\w-])`));
  }
  return allSelectors().filter((selector) => patterns.some((pattern) => pattern.test(selector)));
}

/** A selector belongs to the PRIMITIVE when every class in it, APPLICATION ROOTS ASIDE. */
/**
 * A COMPOUND that names a caller's own container by an application root QUALIFIED BY AN
 * ATTRIBUTE — `.fabricate-manager[data-manager-view='essences']` — rather than by a caller CLASS.
 * Narrow on purpose: an attribute that qualifies the FAMILY's own compound —
 * `.fabricate-button.manager-button.fab-manager-button[data-essence-sort-direction]` — is not an
 * application root at all, and this must not fire on it; that selector stays gate-owned and
 * re-rooted like its unattributed siblings.
 *
 * @param {string} compound One compound of a selector (`compoundsOf`'s own unit).
 * @param {{roots: readonly string[]}} primitive The primitive whose rules are being judged.
 * @returns {boolean} True when `compound` names a caller's own container by attribute.
 */
function namesCallersOwnContainer(compound, primitive) {
  return (
    classesOf(compound).some((cls) => isApplicationRoot(cls, primitive)) && compound.includes('[')
  );
}

function isPrimitiveOwned(selector, written, primitive) {
  if (compoundsOf(selector).some((compound) => namesCallersOwnContainer(compound, primitive))) {
    return false;
  }
  return classesOf(selector)
    .filter((cls) => !isApplicationRoot(cls, primitive))
    .every((cls) => written.has(cls) || isNamespaceClass(cls, primitive) || cls.startsWith('is-'));
}

test('the class set this gate reads is the one each primitive actually writes', () => {
  for (const primitive of PRIMITIVES) {
    const written = classesWrittenBy(primitive);

    for (const anchor of primitive.anchors) {
      assert.ok(
        written.has(anchor),
        `\`${anchor}\` is no longer written by ${primitive.name}. Either the primitive has been ` +
          'renamed — in which case retarget this gate — or the markup extractor has stopped ' +
          'reading it, in which case every assertion below is examining a smaller set than it claims.'
      );
    }

    assert.ok(
      written.size >= primitive.writtenFloor,
      `only ${written.size} ${primitive.name} family classes were found in its markup, against a ` +
        `floor of ${primitive.writtenFloor}. A collapse to a handful means the markup region is ` +
        'being sliced wrongly and the sheet is about to be declared clean on the strength of a ' +
        'few selectors.'
    );
  }
});

test('every primitive writes the namespace roots its rules are anchored on', () => {
  for (const primitive of PRIMITIVES) {
    // Read from CLASS ATTRIBUTES (and, for a `composesClasses` primitive, the composed array's
    // own literals) rather than from the markup text, because every one of these components also
    // NAMES its roots in a comment explaining them. A prose mention would satisfy a substring
    // search while the class itself had been deleted, which is precisely the state this clause
    // exists to catch. `attributes` moves with the same widening: for `ManagerButton` and
    // `IconButton` the only markup class attribute is `class={classes}`, an identifier the plain
    // extractor cannot read, so `attributes` would otherwise be empty and the non-vacuity guard
    // below would hard-fail for both — deriving it from the composed region too is what makes it
    // non-empty for the reason the guard's own message states.
    const attributes = classValuesFor(primitive, primitive.components[0]);
    const emitted = new Set(
      primitive.components.flatMap((file) =>
        classValuesFor(primitive, file).flatMap((value) => value.split(/\s+/))
      )
    );
    assert.ok(
      attributes.length > 0,
      `no class attributes were read out of ${primitive.name}'s markup, so the assertion below ` +
        'holds over nothing'
    );

    // THE CLASS-PROP FLOOR, SCOPED TO ENTRIES THAT DECLARE A LIST (issue 1503). The control
    // below deletes a root from a class-prop VALUE, which proves the reader is consulted — but it
    // cannot tell "the reader found nothing" apart from "the value is absent", because both leave
    // the root unemitted. This floor separates them. It is scoped because the `SearchablePopover`
    // entry declares no `classProps` at all and an unscoped floor would red on a correct entry:
    if (primitive.classProps) {
      const propValues = primitive.components.flatMap((file) =>
        classPropValues(primitive, file, markupRegion(file))
      );
      assert.equal(
        propValues.length,
        primitive.classProps.length * primitive.components.length,
        `${primitive.name} declares ${primitive.classProps.length} class prop(s) and this gate ` +
          `read ${propValues.length} value(s) for them. A class prop is how this component's ` +
          'namespace roots reach the DOM now, so a value the reader cannot see is a root nothing ' +
          'emits.'
      );
    }

    for (const root of primitive.roots) {
      assert.ok(
        emitted.has(root),
        `${primitive.name} no longer writes \`${root}\` on an element of its own, so every rule ` +
          'rooted at it matches nothing. The picker would draw unstyled EVERYWHERE — including ' +
          'the manager — which is a louder failure than the one this gate was written for, and ' +
          'no CSS-only check would see it.'
      );
    }
  }
});

test('a declared class prop is a prop of the component it is passed to', () => {
  // CLAUSE (c). A `classProps` name is resolved against `classPropsOwner`.
  // value is HANDED TO — not against the entry's own component, which only supplies it. Checking
  // it against the entry would check nothing: `IconPicker` does not declare `pickerClass`,
  // `SearchablePopover` does. Rename the primitive's prop and this clause reds; without it the
  // reader above would go on matching a `pickerClass="…"` attribute that Svelte now discards.
  let checked = 0;
  for (const primitive of PRIMITIVES) {
    if (!primitive.classProps) {
      assert.ok(
        !primitive.classPropsOwner,
        `${primitive.name} names a \`classPropsOwner\` without declaring any \`classProps\`, so ` +
          'the owner is resolved against nothing'
      );
      continue;
    }
    assert.ok(
      primitive.classPropsOwner,
      `${primitive.name} declares class props without naming the component they are passed to, ` +
        'so this clause cannot tell whether the primitive still declares them'
    );
    const declared = new Set(declaredPropNames(read(primitive.classPropsOwner)));
    for (const name of primitive.classProps) {
      assert.ok(
        declared.has(name),
        `${primitive.classPropsOwner} no longer declares \`${name}\`, which ${primitive.name} ` +
          'passes as a class prop. Svelte silently discards an unknown prop, so the classes that ' +
          'value carries would reach no element and every rule naming them would match nothing — ' +
          'while the emission clause above went on reading the value out of the call site.'
      );
      checked += 1;
    }
  }
  assert.ok(
    checked >= 10,
    `only ${checked} declared class props were resolved against their owner, against a floor of ` +
      '10 — five each for the two pickers. A lower number means the entries have lost their ' +
      'declarations and this clause is holding over nothing.'
  );
});

test('the class-prop reader is what credits a caller root, and it fires', () => {
  // TWO POSITIVE CONTROLS, both run against MUTATED SOURCE TEXT rather than against a stubbed
  // reader, because a stub proves only that the assertion is wired to something.
  const iconPicker = PRIMITIVES.find((entry) => entry.name === 'IconPicker');
  const file = iconPicker.components[0];
  const markup = markupRegion(file);

  // CONTROL 1 — the emission route. Delete `fabricate-icon-picker` from the `pickerClass` VALUE
  // and the root must stop being emitted. This is the whole reason the reader exists: before it,
  // the root arrived only through that prop and `classAttributeValues` could not see it, which is
  // exactly how the re-platform red the emission clause above.
  const withoutRoot = markup.replace(
    'pickerClass="fabricate-icon-picker essence-icon-picker"',
    'pickerClass="essence-icon-picker"'
  );
  assert.notEqual(
    withoutRoot,
    markup,
    'the control did not perturb anything — `IconPicker` no longer passes its root through ' +
      '`pickerClass` in the form this control edits, so the mutation proved nothing and the ' +
      'clause below is vacuous'
  );
  const emittedWithout = new Set(
    [...classAttributeValues(withoutRoot), ...classPropValues(iconPicker, file, withoutRoot)]
      .flatMap((value) => value.split(/\s+/))
  );
  assert.ok(
    !emittedWithout.has('fabricate-icon-picker'),
    'deleting `fabricate-icon-picker` from the `pickerClass` value left the root still emitted, ' +
      'so the emission clause above would pass over a picker whose panel rules root at nothing'
  );
  const emitted = new Set(
    classValuesFor(iconPicker, file).flatMap((value) => value.split(/\s+/))
  );
  assert.ok(
    emitted.has('fabricate-icon-picker'),
    'the unmutated reading does not find the root either, so control 1 measured a reader that ' +
      'never works rather than one that stops working'
  );

  // CONTROL 2 — the ownership route. A class prop the primitive does not declare must red clause
  // (c) above, so a renamed primitive prop cannot leave this gate reading a value Svelte discards.
  const renamed = { ...iconPicker, classProps: Object.freeze(['pickerClassName']) };
  const declared = new Set(declaredPropNames(read(renamed.classPropsOwner)));
  assert.ok(
    !declared.has(renamed.classProps[0]),
    'the control name is a real prop of the primitive, so it proves nothing about a prop that is ' +
      'not'
  );
  assert.ok(
    declared.has('pickerClass'),
    'the primitive does not declare `pickerClass` either, so control 2 measured a reader that ' +
      'never resolves rather than one that stops resolving'
  );
});

test('the application-root detector fires', () => {
  for (const primitive of PRIMITIVES) {
    assert.ok(
      isApplicationRoot('fabricate-manager', primitive),
      `the detector no longer recognises \`fabricate-manager\` for ${primitive.name}, so this ` +
        'gate cannot see the exact regression it exists to catch'
    );
    for (const root of primitive.roots) {
      assert.ok(
        !isApplicationRoot(root, primitive),
        `the detector treats ${primitive.name}'s OWN namespace root \`${root}\` as an application ` +
          'root, so it would red on the shipped tree and be "fixed" by deleting it'
      );
    }
    assert.ok(
      !isApplicationRoot(primitive.anchors[0], primitive),
      `the detector matches the plain family class \`${primitive.anchors[0]}\`, so it is deciding ` +
        'on the wrong population'
    );
    for (const inherited of primitive.inheritedRoots ?? []) {
      assert.ok(
        !isApplicationRoot(inherited, primitive),
        `the detector treats \`${inherited}\` as an application root for ${primitive.name}, which ` +
          'composes it. Its panel rules would be reported as app-rooted and would be "fixed" by ' +
          'deleting the composed primitive’s own root from them.'
      );
    }
  }
});

test('a composed root is another primitive’s, and both new exemptions stay entry-scoped', () => {
  // CLAUSE FOR `inheritedRoots` AND `namespacedFamily` (issue 1504). Both widen the set of
  // classes that are NOT application roots, which is the one direction that can make this whole
  // file pass over the regression it exists to catch. So both are proved to be scoped to the
  // entry that declares them, and the inherited names are proved to be real roots of a real
  // sibling entry rather than a free-text exemption.
  const roots = new Map(PRIMITIVES.map((entry) => [entry.name, new Set(entry.roots)]));
  let inheritedChecked = 0;
  for (const primitive of PRIMITIVES) {
    for (const inherited of primitive.inheritedRoots ?? []) {
      const owner = PRIMITIVES.find(
        (entry) => entry !== primitive && roots.get(entry.name).has(inherited)
      );
      assert.ok(
        owner,
        `${primitive.name} names \`${inherited}\` as an inherited namespace root, but no other ` +
          'entry in this table declares it. An inherited root is exempt from the emission clause ' +
          'because a SIBLING entry proves the composed primitive still writes it — with no such ' +
          'sibling the exemption proves nothing and any class could be spelled into it.'
      );
      inheritedChecked += 1;
    }
  }
  assert.equal(
    inheritedChecked,
    2,
    `${inheritedChecked} inherited roots were resolved against their owner, against the two ` +
      '`Select` declares. A different number means an entry gained or lost a composed root ' +
      'without this clause being read.'
  );

  const select = PRIMITIVES.find((entry) => entry.name === 'Select');
  const searchablePopover = PRIMITIVES.find((entry) => entry.name === 'SearchablePopover');
  const pagination = PRIMITIVES.find((entry) => entry.name === 'Pagination');

  // `namespacedFamily` covers an interpolated per-size rung FOR ITS OWN ENTRY ONLY.
  assert.ok(
    !isApplicationRoot('fabricate-select-trigger-toolbar', select),
    'a per-size rung of `Select`’s own family is read as an application root, so the four ' +
      'trigger rules would be reported as manager-rooted and "fixed" by deleting the size'
  );
  assert.ok(
    isApplicationRoot('fabricate-select-trigger-toolbar', searchablePopover),
    '`namespacedFamily` is exempting `Select`’s classes for OTHER primitives too, so a rule ' +
      'putting one of them in front of another family would stop being gated'
  );

  // An inherited root is exempt for the composer and an application root for everyone else.
  assert.ok(
    !isApplicationRoot('fabricate-picker-popover', select),
    '`Select`’s panel rules name `SearchablePopover`’s panel root, which it composes; reading it ' +
      'as an application root reds every one of them on correct code'
  );
  assert.ok(
    isApplicationRoot('fabricate-picker-popover', pagination),
    'the inherited-root exemption has leaked past the entry that declares it, so any primitive ' +
      'could root its rules at another’s namespace and this gate would allow it'
  );
});

test('the composed-class region is read from the actual array literal, not the markup', () => {
  // A reader that stops finding the array must RED rather than fall back to treating the
  // (empty, for these two) markup region as the whole story — silence there would declare the
  // sheet clean by examining a family of zero classes instead of reporting the regression.
  const managerButton = PRIMITIVES.find((entry) => entry.name === 'ManagerButton');
  const managerButtonRegion = composedClassRegion(managerButton.components[0]);
  assert.ok(
    managerButtonRegion.includes("'manager-button'") &&
      managerButtonRegion.includes("'fab-manager-button'"),
    `${managerButton.components[0]}'s composed-class array no longer contains the literals ` +
      '`classesWrittenBy` reads for ManagerButton, so a reader that stops finding the array ' +
      'would examine an empty family instead of reporting the regression'
  );

  const iconButton = PRIMITIVES.find((entry) => entry.name === 'IconButton');
  const iconButtonRegion = composedClassRegion(iconButton.components[0]);
  assert.ok(
    iconButtonRegion.includes("'manager-icon-button'"),
    `${iconButton.components[0]}'s composed-class array no longer contains the literal ` +
      '`classesWrittenBy` reads for IconButton, so a reader that stops finding the array would ' +
      'examine an empty family instead of reporting the regression'
  );

  // The root-emission clause's OWN non-vacuity local (`attributes`, above) is derived from this
  // same region for a `composesClasses` entry, so it reads these same literals: deleting
  // `'fabricate-button'` from `ManagerButton.svelte`'s array reds `every primitive writes the
  // namespace roots its rules are anchored on` above, not this test — the two are the same
  // reading, exercised by a different assertion.
  for (const primitive of [managerButton, iconButton]) {
    const literals = composedClassLiteralValues(primitive.components[0]);
    for (const root of primitive.roots) {
      assert.ok(
        literals.includes(root),
        `${primitive.components[0]}'s composed-class array no longer contains its own root ` +
          `\`${root}\` as an unconditional literal, so the root-emission clause above would find ` +
          'nothing to check'
      );
    }
  }
});

test('the class-map reader is what puts the per-host class in the family, and it fires', () => {
  // CLAUSE (d), and the shape is the composed-region clause's above.
  const toggle = PRIMITIVES.find((entry) => entry.name === 'StatusToggle');
  assert.deepEqual(
    toggle.classMaps,
    ['HOST_CLASSES'],
    'StatusToggle declares exactly this one class map, and this clause is stated over it. It is ' +
      'no longer the only entry that declares one — `EditorTabs` declares `DEFAULT_CLASSES` for a ' +
      'different reason, and has its own controls below — so the two are proved separately.'
  );

  // POSITIVE CONTROL 1: the region really holds the string.
  const region = classMapRegion(toggle.components[0], 'HOST_CLASSES');
  assert.ok(
    region.includes("'manager-tool-setting-toggle'"),
    `${toggle.components[0]}'s HOST_CLASSES no longer contains the class this gate reads for the ` +
      'checkbox host, so a reader that stops finding the map would examine a family short by one ' +
      'class instead of reporting the regression'
  );
  // AND THE OTHER TWO REGIONS CANNOT SEE IT.
  assert.ok(
    !markupRegion(toggle.components[0]).includes('manager-tool-setting-toggle"') &&
      !composedClassRegion(toggle.components[0]).includes('manager-tool-setting-toggle'),
    'the checkbox host class has moved into the markup or into the composed array, so this ' +
      'reader is no longer the thing that credits it and the control below proves nothing'
  );

  // POSITIVE CONTROL 2: dropping the field really costs the family those two rules. Stated as a
  // measured DIFFERENCE rather than as remembered numbers, over a copy of the entry with
  // `classMaps` removed — the exact state the tree was in before this reader landed.
  const withoutMap = Object.freeze({ ...toggle, classMaps: undefined });
  const withMap = classesWrittenBy(toggle);
  const without = classesWrittenBy(withoutMap);
  assert.ok(
    withMap.has('manager-tool-setting-toggle') && !without.has('manager-tool-setting-toggle'),
    'the class map is not what credits `manager-tool-setting-toggle`, so dropping it costs the ' +
      'family nothing and this control is vacuous'
  );

  const family = (entry, written) => pickerSelectors(written, entry);
  const lost = family(toggle, withMap).filter(
    (selector) => !family(withoutMap, without).includes(selector)
  );
  assert.deepEqual(
    lost.sort(),
    ['.fabricate-toggle.manager-tool-setting-toggle'],
    'dropping the class map must take the checkbox host`s own 34px box out of the family ' +
      'altogether — that selector names no other class this primitive writes, so without the ' +
      'reader nothing in this file examines it at all'
  );

  // AND THE OWNERSHIP HALF: the `:has()` ring stays IN the family without the map (it enters
  // through `-toggle-input`) but is judged CALLER-owned there, because the host class it also
  // names is not in `written`. Two rules unexamined, by two different mechanisms, from one
  // missing reader.
  const ownedWith = family(toggle, withMap).filter((selector) =>
    isPrimitiveOwned(selector, withMap, toggle)
  );
  const ownedWithout = family(withoutMap, without).filter((selector) =>
    isPrimitiveOwned(selector, without, withoutMap)
  );
  assert.equal(
    ownedWith.length - ownedWithout.length,
    2,
    'the class map must move exactly two selectors into the owned set — the checkbox host`s box ' +
      'and the `:has()` ring on it. Neither is re-rooted without it, and the sheet reports clean.'
  );
});

test('the class-map reader is also what puts a PROP DEFAULT in the family, and it fires', () => {
  // CLAUSE (d) A SECOND TIME, over the other shape a class map hides (issue 1509). `StatusToggle`
  // chooses its host's class out of a map at render time; `EditorTabs` DEFAULTS three class PROPS
  // to its own family, and a default is in neither of the other two regions — the markup writes
  // `class={containerClass}`, a bare identifier `classAttributeValues` cannot match at all, and
  // `` class={`${buttonClass} …`} ``, whose family tokens are all interpolated. So the two entries
  // exercise the same reader against two different hiding places, and both are proved.
  const tabs = PRIMITIVES.find((entry) => entry.name === 'EditorTabs');
  assert.deepEqual(
    tabs.classMaps,
    ['DEFAULT_CLASSES'],
    'EditorTabs declares exactly this one class map, and this clause is stated over it'
  );

  // POSITIVE CONTROL 1: the region really holds the strings.
  const region = classMapRegion(tabs.components[0], 'DEFAULT_CLASSES');
  assert.ok(
    region.includes("'manager-editor-tab-button'"),
    `${tabs.components[0]}'s DEFAULT_CLASSES no longer contains the button class this gate reads, ` +
      'so a reader that stops finding the map would examine a family short by three classes ' +
      'instead of reporting the regression'
  );

  // AND THE MARKUP REGION CANNOT SEE IT, which is the whole reason the reader is consulted here.
  assert.ok(
    !markupRegion(tabs.components[0]).includes('manager-editor-tab-button'),
    'the button class has moved into the markup, so this reader is no longer the thing that ' +
      'credits it and the control below proves nothing'
  );

  // POSITIVE CONTROL 2: dropping the field really costs the family five of its seven owned rules,
  // stated as a measured DIFFERENCE over a copy of the entry with `classMaps` removed — the exact
  // state this component was in before the defaults were frozen into a map. The figure is the one
  // the GATE emits (`owned.length`), not the eight rules the change re-roots, because a control
  // publishing a number the gate never produces cannot be checked against the gate.
  const withoutMap = Object.freeze({ ...tabs, classMaps: undefined });
  const withMap = classesWrittenBy(tabs);
  const without = classesWrittenBy(withoutMap);
  assert.equal(
    withMap.size,
    5,
    'the map must credit all five family classes: the container, the button and the badge from ' +
      'the defaults, the count and the dot from the markup'
  );
  assert.equal(
    without.size,
    2,
    'without the map only the count and the dot are literals in the markup; a different number ' +
      'means the family reaches this gate some other way and the control below measures nothing'
  );

  const ownedIn = (entry, written) =>
    pickerSelectors(written, entry).filter((selector) => isPrimitiveOwned(selector, written, entry));
  assert.equal(
    ownedIn(tabs, withMap).length,
    7,
    'the strip owns seven of the twelve selectors that name a class it writes'
  );
  assert.equal(
    ownedIn(withoutMap, without).length,
    2,
    'dropping the class map must take the gate-owned count from 7 to 2 — only the count rule and ' +
      'the dot rule survive, and the strip`s own container, button, hover, active, active-count ' +
      'and badge rules all read CALLER-owned, gate-inert, and would have been left rooted at ' +
      '`.fabricate-manager` with this file reporting the family clean'
  );
});

/**
 * The entries whose ROOT ELEMENT is another entry's, so TWO namespace roots land on ONE element.
 */
const CO_ROOTED_PAIRS = Object.freeze([
  Object.freeze({ host: 'Field', guest: 'RadioCardGroup', hostFloor: 20, guestFloor: 40 }),
  Object.freeze({ host: 'Field', guest: 'ModifierPillSelect', hostFloor: 20, guestFloor: 11 }),
]);

test('two namespace roots on one element stay disjoint families', () => {
  // CLAUSE (e), NEW AT ISSUE 1509 PHASE 3.
  const namesAny = (selector, entry) => {
    const classes = classesOf(selector);
    const family = new RegExp(`^(?:${entry.family})$`);
    return classes.some((cls) => entry.roots.includes(cls) || family.test(cls));
  };

  for (const pair of CO_ROOTED_PAIRS) {
    const host = PRIMITIVES.find((entry) => entry.name === pair.host);
    const guest = PRIMITIVES.find((entry) => entry.name === pair.guest);
    assert.ok(host && guest, `both ${pair.host} and ${pair.guest} must exist for this clause`);

    // NON-VACUITY FIRST: each family must have a real population in the sheet.
    const hostSelectors = allSelectors().filter((selector) => namesAny(selector, host));
    const guestSelectors = allSelectors().filter((selector) => namesAny(selector, guest));
    assert.ok(
      hostSelectors.length >= pair.hostFloor,
      `only ${hostSelectors.length} selectors name the ${pair.host} family, so the intersection ` +
        'below is empty for the wrong reason'
    );
    assert.ok(
      guestSelectors.length >= pair.guestFloor,
      `only ${guestSelectors.length} selectors name the ${pair.guest} family, so the ` +
        'intersection below is empty for the wrong reason'
    );

    assert.deepEqual(
      allSelectors().filter(
        (selector) => namesAny(selector, host) && namesAny(selector, guest)
      ),
      [],
      `a selector names both \`${pair.host}\`s family and \`${pair.guest}\`s. The two are ` +
        'co-rooted on ONE element, and each root is an APPLICATION root by name to the other ' +
        'entry, so this selector is `gated` on both of them and no re-rooting form of it exists. ' +
        'Write it against whichever family actually owns the declaration.'
    );

    // AND THE PATTERNS THEMSELVES CANNOT OVERLAP.
    const hostFamily = new RegExp(`^(?:${host.family})$`);
    const guestFamily = new RegExp(`^(?:${guest.family})$`);
    for (const anchor of guest.anchors) {
      assert.ok(
        !hostFamily.test(anchor),
        `\`${anchor}\` matches the ${pair.host} family pattern, so a ${pair.guest} rule can ` +
          `enter the ${pair.host} entry\`s population and be judged by it`
      );
    }
    for (const anchor of host.anchors) {
      assert.ok(
        !guestFamily.test(anchor),
        `\`${anchor}\` matches the ${pair.guest} family pattern, so a ${pair.host} rule can ` +
          `enter the ${pair.guest} entry\`s population and be judged by it`
      );
    }
  }
});

test('the status card`s root stays off every rule the switch owns', () => {
  // CLAUSE (f), NEW AT ISSUE 1509 PHASE 4.
  const toggleCard = PRIMITIVES.find((entry) => entry.name === 'ToggleCard');
  const statusToggle = PRIMITIVES.find((entry) => entry.name === 'StatusToggle');
  assert.ok(toggleCard && statusToggle, 'both entries must exist for this clause to mean anything');

  const namesAny = (selector, entry) => {
    const classes = classesOf(selector);
    const family = new RegExp(`^(?:${entry.family})$`);
    return classes.some((cls) => entry.roots.includes(cls) || family.test(cls));
  };

  // NON-VACUITY FIRST, on both sides, or the intersection below is empty for the wrong reason.
  const cardSelectors = allSelectors().filter((selector) => namesAny(selector, toggleCard));
  const switchSelectors = allSelectors().filter((selector) => namesAny(selector, statusToggle));
  assert.ok(
    cardSelectors.length >= 20,
    `only ${cardSelectors.length} selectors name the status-card family, so the intersection ` +
      'below is empty for the wrong reason'
  );
  assert.ok(
    switchSelectors.length >= 18,
    `only ${switchSelectors.length} selectors name the switch family, so the intersection below ` +
      'is empty for the wrong reason'
  );

  assert.deepEqual(
    allSelectors().filter(
      (selector) => namesAny(selector, toggleCard) && namesAny(selector, statusToggle)
    ),
    [],
    'a selector names both `ToggleCard`s family and `StatusToggle`s. The switch is COMPOSED, so ' +
      'its chrome is its own primitive`s: a rule rooted at `.fabricate-toggle-card` that reaches ' +
      'a `manager-status-toggle*` class is gated on the Toggle entry, because that root is an ' +
      'APPLICATION root by name to it. Deepen the override at the card`s own root instead.'
  );

  // AND THE PATTERNS THEMSELVES CANNOT OVERLAP.
  const cardFamily = new RegExp(`^(?:${toggleCard.family})$`);
  const switchFamily = new RegExp(`^(?:${statusToggle.family})$`);
  for (const anchor of statusToggle.anchors) {
    assert.ok(
      !cardFamily.test(anchor),
      `\`${anchor}\` matches the status-card family pattern, so a switch rule can enter this ` +
        'entry`s population and be judged by it'
    );
  }
  for (const anchor of toggleCard.anchors) {
    assert.ok(
      !switchFamily.test(anchor),
      `\`${anchor}\` matches the switch family pattern, so a card rule can enter the Toggle ` +
        'entry`s population and be judged by it'
    );
  }

  // AND THE PATTERN REFUSES THE ROW SLOT IT IS A PREFIX OF. `manager-recipe-status` is the recipe
  // ROW's own class and is written by no component in this family; the alternation of five
  // suffixes is what excludes it, and a `manager-recipe-status[\w-]*` pattern would not.
  assert.ok(
    !cardFamily.test('manager-recipe-status'),
    'the status-card family pattern matches bare `manager-recipe-status`, the recipe row`s slot, ' +
      'which this primitive does not write and whose two rules must not be re-rooted at it'
  );
});

test('the application-root-attribute clause names a caller’s own container', () => {
  const managerButton = PRIMITIVES.find((entry) => entry.name === 'ManagerButton');
  const pagination = PRIMITIVES.find((entry) => entry.name === 'Pagination');

  // FIRES: an application root qualified by a per-view attribute is a caller's own container,
  // exactly like the four shipped `[data-manager-view=…] .manager-pagination` overrides.
  assert.ok(
    namesCallersOwnContainer(".fabricate-manager[data-manager-view='world-essences']", pagination),
    'the clause no longer fires on an application root qualified by a per-view attribute, so the ' +
      'four shipped Pagination overrides would stay gate-owned and red the ownership assertion below'
  );

  // DOES NOT FIRE: an attribute that qualifies the FAMILY's own compound is not an application
  // root at all — `fabricate.css`'s `data-essence-sort-direction` control on ManagerButton's own
  // family compound, which must stay gate-owned and re-rooted like its unattributed siblings.
  assert.ok(
    !namesCallersOwnContainer(
      '.fabricate-button.manager-button.fab-manager-button[data-essence-sort-direction]',
      managerButton
    ),
    'the clause fires on an attribute that qualifies the family’s own compound rather than an ' +
      'application root, so that selector would wrongly leave the owned set and stop being re-rooted'
  );

  // DOES NOT FIRE: a bare application root with no attribute is the ORDINARY case.
  assert.ok(
    !namesCallersOwnContainer('.fabricate-manager', pagination),
    'the clause fires on a bare application root with no attribute, which would exempt every ' +
      'plain .fabricate-manager compound from ownership'
  );

  // NON-VACUITY: the clause actually reaches Pagination's shipped per-view overrides in
  // `styles/fabricate.css` — six of them today — not just the synthetic control above.
  const written = classesWrittenBy(pagination);
  const family = pickerSelectors(written, pagination);
  const callerContainerSelectors = family.filter((selector) =>
    compoundsOf(selector).some((compound) => namesCallersOwnContainer(compound, pagination))
  );
  assert.ok(
    callerContainerSelectors.length >= 4,
    `only ${callerContainerSelectors.length} Pagination selectors were recognised by the ` +
      'application-root-attribute clause, against a floor of 4 — the `[data-manager-view=…] ' +
      '.manager-pagination` overrides, of which the sheet holds six today. A lower number means ' +
      'the clause has stopped recognising ' +
      'them and they would wrongly enter the owned set below.'
  );
});

test('every rule a primitive owns is rooted at the primitive, not at an application', () => {
  for (const primitive of PRIMITIVES) {
    const written = classesWrittenBy(primitive);
    const family = pickerSelectors(written, primitive);

    assert.ok(
      family.length >= primitive.familyFloor,
      `only ${family.length} selectors in ${STYLESHEET} name a class ${primitive.name} writes, ` +
        `against a floor of ${primitive.familyFloor}. A number this low means the family has been ` +
        'renamed or the reader has stopped finding it, and the assertions below guard an empty set.'
    );

    const owned = family.filter((selector) => isPrimitiveOwned(selector, written, primitive));

    assert.ok(
      owned.length >= primitive.ownedFloor,
      `only ${owned.length} of ${family.length} ${primitive.name} selectors are owned by the ` +
        `primitive, against a floor of ${primitive.ownedFloor}. The exemption is for a CALLER's ` +
        'override of the caller’s own markup; a number this low means the ownership test has ' +
        'widened into an escape hatch.'
    );

    const gated = owned.filter((selector) =>
      classesOf(selector).some((cls) => isApplicationRoot(cls, primitive))
    );
    assert.deepEqual(
      gated,
      [],
      `these selectors put an application root in front of a class ${primitive.name} renders, so ` +
        'the primitive paints only inside that one app and every caller elsewhere draws unstyled ' +
        '— the blocker issue 1464 removed and #1458 hit first:\n  ' +
        gated.join('\n  ') +
        '\n\nThe sheet is page-global, so the root cannot just be deleted: use the primitive’s own ' +
        `namespace class instead (${primitive.roots.map((root) => `.${root}`).join(' / ')}), which ` +
        'is the same specificity and travels with the component.'
    );

    const rootless = owned.filter(
      (selector) =>
        !classesOf(compoundsOf(selector)[0]).some((cls) => isNamespaceClass(cls, primitive))
    );
    assert.deepEqual(
      rootless,
      [],
      `these selectors are ${primitive.name}'s own but are not rooted at one of its namespace ` +
        'classes, so they either bleed page-wide or match nothing:\n  ' + rootless.join('\n  ')
    );
  }
});

/** The fixture half, and it is not hypothetical. */
const DETECTOR_FIXTURE_EXEMPTIONS = Object.freeze([
  Object.freeze({
    file: 'tests/components/searchable-popover-source-contract.test.js',
    primitive: 'SearchablePopover',
    attributeCount: 3,
    elementCount: 4,
    why:
      'the `DETECTOR_FIXTURE` source string, which exists to prove the raw-site detector fires. ' +
      'Its attributes depict UNCONVERTED markup on purpose; namespacing them would make the ' +
      'fixture depict a converted site and the discrimination clause would pass vacuously.',
  }),
  Object.freeze({
    file: 'tests/components/field-source-contract.test.js',
    primitive: 'Field',
    attributeCount: 2,
    elementCount: 2,
    why:
      'the raw-site detector fixtures, which exist to prove the contract finds a hand-written ' +
      '`class="manager-field"` that never went through `<Field>`. Namespacing them would make ' +
      'them depict a CONVERTED site and the detector clause would pass vacuously.',
  }),
  Object.freeze({
    file: 'tests/components/manager-filter-bar-source-contract.test.js',
    primitive: 'ManagerSearchField',
    attributeCount: 1,
    elementCount: 1,
    why:
      'the raw-site detector fixture for the search half of the filter-bar contract, for the same ' +
      'reason: it depicts an unconverted `class="manager-search"` on purpose. Keyed by ' +
      '`file|primitive` because this one file holds a second family\'s detector too.',
  }),
  Object.freeze({
    file: 'tests/components/editor-tabs-adoption-contract.test.js',
    primitive: 'EditorTabs',
    attributeCount: 1,
    elementCount: 4,
    why:
      'the `DETECTOR_FIXTURE` and `detectorFixture.lowered` source strings, which exist to prove ' +
      'the raw-site detector fires and to prove it counts a LOWERED corpus differently. Four of ' +
      'their elements carry a family class on purpose — two raw tab buttons, the container the ' +
      'token is deliberately NOT, and the lowered probe — and namespacing any of them would make ' +
      'the fixture depict a CONVERTED site, at which point the contract counts 0 raw sites and ' +
      'passes over a tree that could have any number.',
  }),
  Object.freeze({
    file: 'tests/components/manager-filter-bar-source-contract.test.js',
    primitive: 'ManagerToolbar',
    attributeCount: 1,
    elementCount: 1,
    why:
      'the raw-site detector fixture for the BAR half of the same file, which depicts an ' +
      'unconverted `class="manager-toolbar"` on purpose. This is the second of the two entries ' +
      'that made the ledger `file|primitive` rather than `file`: one file, two families, two ' +
      'independently counted detector fixtures.',
  }),
]);

/**
 * The subset of `FIXTURE_ALLOWLIST` that is ROOT-LESS.
 * `FIXTURE_ALLOWLIST` is the ledger of fixtures that model a deliberately UNCONVERTED control, and
 * since issue 1502 most of those fixtures DO carry their family root: a population-B trigger
 * without `fabricate-button` matches no rule in the sheet, so the fixtures that measure geometry
 * gained it. Those entries are irrelevant here — they are never offenders — and only the entries
 * still writing a family class with no root of any primitive can register a hit. Derived once at
 * module level because both clauses need the same subset, and two copies of one filter is the
 * duplication `tests/helpers/primitiveSourceContract.js` exists to have stopped repeating.
 *
 * @type {ReadonlyArray<import('../helpers/managerButtonFixtureAllowlist.js').ManagerButtonFixtureExemption>}
 */
const ROOT_LESS_FIXTURE_EXEMPTIONS = Object.freeze(
  FIXTURE_ALLOWLIST.filter((entry) =>
    PRIMITIVES.every((primitive) =>
      primitive.roots.every((root) => !entry.classes.split(/\s+/).includes(root))
    )
  )
);

/**
 * Every element in a hand-written markup string, with the class names of its ancestors.
 *
 * @param {string} text A JavaScript source file that contains fixture markup.
 * @returns {Array<{name: string, classes: string[], ancestry: string[]}>} One entry per open tag.
 */
/**
 * Every `class="…"` value that is actually ON AN ELEMENT TAG in fixture text.
 *
 * @param {string} text A JavaScript source file that contains fixture markup.
 * @returns {Array<string>} The value of every `class` attribute inside an element tag.
 */
function classAttributesInFixture(text) {
  return [...text.matchAll(/<[a-zA-Z][\w-]*\b[^<>]*>/g)].flatMap((tag) =>
    [...tag[0].matchAll(/class="([^"]*)"/g)].map((match) => match[1])
  );
}

function elementsWithAncestry(text) {
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track',
    'wbr',
  ]);
  const out = [];
  const stack = [];
  const pattern = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const [, closing, rawName, attributes, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (closing) {
      const open = stack.map((entry) => entry.name).lastIndexOf(name);
      if (open !== -1) stack.length = open;
    } else {
      const classes = (attributes.match(/class="([^"]*)"/) ?? ['', ''])[1].split(/\s+/).filter(Boolean);
      out.push({ name, classes, ancestry: [...stack.flatMap((entry) => entry.classes), ...classes] });
      if (!selfClosing && !VOID_ELEMENTS.has(name)) stack.push({ name, classes });
    }
    match = pattern.exec(text);
  }
  return out;
}

test('hand-built fixture markup carries the namespace roots the primitive writes', () => {
  const sources = collectWorkingTreeSources(['tests'], ['.js']);
  // COMMENT-BLANKED first, offsets preserved (`stripComments` replaces comment characters with
  // spaces rather than deleting them), so a PROSE mention of a mirrored anchor — a docblock, an
  // assertion message quoting the literal — cannot pose as a fixture attribute. Without this,
  // adding `mirrored` for three families whose classes are discussed in prose throughout `tests/`
  // turns every such mention into an unrepairable offender.
  const blanked = new Map(
    Object.entries(sources).map(([file, text]) => [file, stripComments(text)])
  );
  const exempt = new Set(DETECTOR_FIXTURE_EXEMPTIONS.map((entry) => `${entry.file}|${entry.primitive}`));
  const exemptHits = new Map();
  const allowlistHits = new Map();
  const offenders = [];
  let attributes = 0;

  for (const primitive of PRIMITIVES) {
    for (const [file, text] of blanked) {
      for (const value of classAttributesInFixture(text)) {
        const classes = value.split(/\s+/);
        for (const { anchor, root } of primitive.mirrored) {
          if (!classes.includes(anchor)) continue;
          attributes += 1;
          if (classes.includes(root)) continue;
          const allowlisted = ROOT_LESS_FIXTURE_EXEMPTIONS.find(
            (entry) => entry.file === file && entry.classes === value
          );
          if (allowlisted) {
            allowlistHits.set(allowlisted, (allowlistHits.get(allowlisted) ?? 0) + 1);
            continue;
          }
          const key = `${file}|${primitive.name}`;
          if (exempt.has(key)) {
            exemptHits.set(key, (exemptHits.get(key) ?? 0) + 1);
            continue;
          }
          offenders.push(`${file}: class="${value}" (needs \`${root}\`)`);
        }
      }
    }
  }

  assert.ok(
    attributes >= 182,
    `only ${attributes} fixture class attributes copy a primitive's root markup, against a floor ` +
      'of 182. A lower number means the scan is not reading the fixtures and the assertion below ' +
      'holds over nothing. RE-MEASURED at issue 1509 phase 4: 203 today, against the 195 before ' +
      '`ToggleCard` and `ItemDropZone` joined the array. EIGHT arrived and NOT ONE of them was ' +
      'already in the tree: both families had a fixture population of ZERO in this clause and in ' +
      'the ancestry clause alike before this change — measured, and published as the answer ' +
      'rather than left as a repair task — so no shipped fixture needed repairing for either. ' +
      'The eight are all in `re-rooted-controls-host-independence.test.js`: three status cards ' +
      '(the enabled, locked and info variants, because the family`s ten rules are three variants ' +
      'over a shared base), two link fields (the linked card and the compact prompt, which share ' +
      'only their root class), the switch the card COMPOSES and the two `IconButton`s the link ' +
      'field composes — and those last three count against `StatusToggle`s and `IconButton`s own ' +
      'anchors rather than these two, because the fixtures render what the components render. ' +
      'Before that: 195, against the 189 before ' +
      '`RadioCardGroup` joined the array. SIX arrived, all of them copies of the card’s ROOT ' +
      'element: three were already in `manager-layout.test.js` and two in ' +
      '`resolution-mode-card-layout.test.js` and this change gave each of them the namespace ' +
      'root the re-root put on the product, and the sixth is the card this change adds to ' +
      '`re-rooted-controls-host-independence.test.js`. Before that: 189 against the 187 before ' +
      '`EditorValidationSurface` joined the array. Exactly TWO arrived, and that thinness is the ' +
      'entry’s own measurement rather than an oversight: the surface’s root anchor matched ZERO ' +
      'fixture attributes before this change. The two are both root ELEMENTS — the one ' +
      '`recipe-studio-font-size.test.js` gained so its five rail measurements keep reaching the ' +
      'sheet, and the one this change’s host-independence fixture writes. ' +
      'Before that: 187 against the 181 before ' +
      '`EditorTabs` joined the array. SIX arrived there: four are the shipped fixtures that copy ' +
      'the tab strip’s own root element, in three files, and two are the strip and the negative ' +
      'control that change added to `re-rooted-controls-host-independence.test.js`. Before that: ' +
      '181 against 169 before ' +
      '`StatusToggle` and `ChanceSlider` joined the array, 143 before `ManagerToolbar` and ' +
      '`InspectorCard` did and 113 before `Field` and ' +
      '`ManagerSearchField` did. The floor stood at 54 against a population that had already ' +
      'grown to 113 — issue 1504 added `Select` without re-measuring — so the phase-1 raise was ' +
      'both a raise for two new families and the repair of a margin that had drifted to half ' +
      'the population, and each raise since keeps it at the ten per cent this file states as its ' +
      'convention.'
  );

  assert.deepEqual(
    offenders,
    [],
    'these fixtures write a primitive’s root class without the namespace class beside it, so ' +
      'they render a copy no rule in the sheet reaches and measure a default rather than the ' +
      'product:\n  ' + offenders.join('\n  ')
  );

  // The exemption is only earned while it is still USED, and at the count it was recorded with.
  for (const entry of DETECTOR_FIXTURE_EXEMPTIONS) {
    const hits = exemptHits.get(`${entry.file}|${entry.primitive}`) ?? 0;
    assert.equal(
      hits,
      entry.attributeCount,
      `${entry.file} is exempted for ${entry.attributeCount} non-namespaced fixture attribute(s) ` +
        `against ${entry.primitive} and has ${hits}. Reason on record: ${entry.why}`
    );
  }

  // The ManagerButton unconverted-probe exemptions are a SEPARATE, larger ledger.
  const expectedAllowlistAttributeCount = ROOT_LESS_FIXTURE_EXEMPTIONS.reduce((total, entry) => total + entry.count, 0);
  const totalAllowlistHits = [...allowlistHits.values()].reduce((total, hits) => total + hits, 0);
  assert.equal(
    totalAllowlistHits,
    expectedAllowlistAttributeCount,
    `this gate matched ${totalAllowlistHits} of the ${expectedAllowlistAttributeCount} ` +
      '`FIXTURE_ALLOWLIST` attributes recorded in `managerButtonFixtureAllowlist.js`. Either an ' +
      'entry has drifted from its fixture’s exact `class` string or a fixture was removed ' +
      'without updating the ledger.'
  );
  for (const entry of ROOT_LESS_FIXTURE_EXEMPTIONS) {
    const hits = allowlistHits.get(entry) ?? 0;
    assert.equal(
      hits,
      entry.count,
      `${entry.file} is allowlisted for ${entry.count} occurrence(s) of ` +
        `class="${entry.classes}" and this gate found ${hits}. Reason on record: ${entry.why}`
    );
  }
});

test('every fixture element in a picker’s family sits under one of its namespace roots', () => {
  // THE ATTRIBUTE CLAUSE ABOVE ONLY SEES A COPY OF THE ROOT ELEMENT.
  const sources = collectWorkingTreeSources(['tests'], ['.js']);
  // Comment-blanked for the same reason as the attribute clause above.
  const blanked = new Map(
    Object.entries(sources).map(([file, text]) => [file, stripComments(text)])
  );
  const exempt = new Set(
    DETECTOR_FIXTURE_EXEMPTIONS.map((entry) => `${entry.file}|${entry.primitive}`)
  );
  const exemptHits = new Map();
  const allowlistHits = new Map();
  const offenders = [];
  let elements = 0;

  for (const primitive of PRIMITIVES) {
    const written = classesWrittenBy(primitive);
    for (const [file, text] of blanked) {
      for (const element of elementsWithAncestry(text)) {
        const copied = element.classes.filter((cls) => written.has(cls));
        if (copied.length === 0) continue;
        elements += 1;
        if (element.ancestry.some((cls) => primitive.roots.includes(cls))) continue;
        const allowlisted = ROOT_LESS_FIXTURE_EXEMPTIONS.find(
          (entry) => entry.file === file && entry.classes === element.classes.join(' ')
        );
        if (allowlisted) {
          allowlistHits.set(allowlisted, (allowlistHits.get(allowlisted) ?? 0) + 1);
          continue;
        }
        const key = `${file}|${primitive.name}`;
        if (exempt.has(key)) {
          exemptHits.set(key, (exemptHits.get(key) ?? 0) + 1);
          continue;
        }
        offenders.push(
          `${file}: <${element.name} class="${element.classes.join(' ')}"> copies ` +
            `${primitive.name}'s ${copied.join(', ')} with no ` +
            `${primitive.roots.map((root) => `\`${root}\``).join(' or ')} above it`
        );
      }
    }
  }

  assert.ok(
    elements >= 413,
    `only ${elements} fixture elements copy a shared picker's markup, against a floor of 413. A ` +
      'lower number means the tag scanner has stopped reading the fixtures and the assertion ' +
      'below holds over nothing. RE-MEASURED at issue 1509 phase 4: 459 today, against the 431 ' +
      'before `ToggleCard` and `ItemDropZone` joined the array. TWENTY-EIGHT arrived against the ' +
      'attribute clause’s EIGHT, and every one of them is NEW markup rather than a repair: both ' +
      'families’ fixture population was ZERO in both clauses before this change. The gap is the ' +
      'usual one — a status card brings a glyph column, a copy column and two lines with it and ' +
      'only the card is an anchor; a link field brings an art tile, an address line, a name, a ' +
      'note and an action cluster and only the zone is. Before that: 431, against the 368 ' +
      'before `RadioCardGroup` joined the array. SIXTY-THREE arrived against the attribute ' +
      'clause’s SIX, which is a wider gap again than the validation surface’s 29-to-2 and for ' +
      'the same reason twice over: an option-card fixture brings a legend, a grid, two rows, two ' +
      'tiles, two bodies and their names and descriptions with it, and only the FIELDSET is an ' +
      'anchor. Forty-five were already in the tree and are repaired rather than added — 36 in ' +
      '`manager-layout.test.js` under three fieldsets, eight in ' +
      '`resolution-mode-card-layout.test.js` (written out where they render, because a helper’s ' +
      '`<label>` sits lexically outside the fieldset the runtime nests it under) and one negative ' +
      'control in `re-rooted-controls-host-independence.test.js` — and the rest are the ' +
      'thirteen-element card this change adds to that same file and the five extra rows the ' +
      'layout gate gained by being written out. Before that: 368 against the 339 ' +
      'before `EditorValidationSurface` joined the array. TWENTY-NINE arrived against the ' +
      'attribute clause’s TWO, and that 29-to-2 is the widest gap either clause has recorded: a ' +
      'validation fixture brings a whole surface with it and only its ROOT is an anchor. Eleven ' +
      'are `recipe-studio-font-size.test.js`’s — the summary row, its card, its medallion, its ' +
      'copy, its two lines, its count list, its one count and that count’s two spans, under the ' +
      'root element that file gained to put them beneath a rule — and eighteen are the ' +
      'three-host fixture in `re-rooted-controls-host-independence.test.js`, which adds a row ' +
      'stack and a group label to that set. Before that: 339 ' +
      'against the 321 before ' +
      '`EditorTabs` joined the array. THIRTEEN of the eighteen are the shipped fixtures’ own, ' +
      'over three files, and five are that change’s two new host-independence fixtures. That ' +
      'thirteen against the attribute clause’s four is the gap the two clauses exist to keep ' +
      'apart: a strip fixture brings its buttons, its counts and its badges with it. Before ' +
      'that: 321 against 270 ' +
      'before `StatusToggle` and `ChanceSlider` joined the array, 244 before `ManagerToolbar` and ' +
      '`InspectorCard` did and 214 before `Field` and ' +
      '`ManagerSearchField` did — the same drifted margin the attribute floor above records, ' +
      'kept at the ten per cent this file states as its convention. This clause grows faster ' +
      'than the attribute one for both new families, and that is the difference the two clauses ' +
      'exist to keep apart: it counts every fixture ELEMENT in a family, so a switch fixture ' +
      'brings its track, its knob and its label with it and a slider fixture brings five.'
  );

  assert.deepEqual(
    offenders,
    [],
    'these fixture elements render part of a shared picker outside the namespace root that makes ' +
      'the sheet reach them, so they measure an unstyled default while naming the primitive:\n  ' +
      offenders.join('\n  ')
  );

  for (const entry of DETECTOR_FIXTURE_EXEMPTIONS) {
    const hits = exemptHits.get(`${entry.file}|${entry.primitive}`) ?? 0;
    assert.equal(
      hits,
      entry.elementCount,
      `${entry.file} is exempted for ${entry.elementCount} rootless fixture element(s) against ` +
        `${entry.primitive} and has ${hits}. Reason on record: ${entry.why}`
    );
  }

  const expectedAllowlistElementCount = ROOT_LESS_FIXTURE_EXEMPTIONS.reduce((total, entry) => total + entry.count, 0);
  // The SPLIT ITSELF, guarded rather than narrated.
  assert.ok(
    ROOT_LESS_FIXTURE_EXEMPTIONS.length < FIXTURE_ALLOWLIST.length &&
      expectedAllowlistElementCount < FIXTURE_ALLOWLIST_ATTRIBUTE_COUNT,
    `the root-less subset is ${ROOT_LESS_FIXTURE_EXEMPTIONS.length} of ` +
      `${FIXTURE_ALLOWLIST.length} entries and ${expectedAllowlistElementCount} of ` +
      `${FIXTURE_ALLOWLIST_ATTRIBUTE_COUNT} attributes, which is not a strict subset: the ` +
      'root-carrying population-B entries issue 1502 introduced have stopped being filtered ' +
      'out, so this clause is holding over the whole allowlist rather than the part of it that ' +
      'can register a hit'
  );
  const totalAllowlistHits = [...allowlistHits.values()].reduce((total, hits) => total + hits, 0);
  assert.equal(
    totalAllowlistHits,
    expectedAllowlistElementCount,
    `this gate matched ${totalAllowlistHits} of the ${expectedAllowlistElementCount} ` +
      '`FIXTURE_ALLOWLIST` elements recorded in `managerButtonFixtureAllowlist.js`. Either an ' +
      'entry has drifted from its fixture’s exact `class` string or a fixture was removed ' +
      'without updating the ledger.'
  );
  for (const entry of ROOT_LESS_FIXTURE_EXEMPTIONS) {
    const hits = allowlistHits.get(entry) ?? 0;
    assert.equal(
      hits,
      entry.count,
      `${entry.file} is allowlisted for ${entry.count} occurrence(s) of ` +
        `class="${entry.classes}" and this gate found ${hits}. Reason on record: ${entry.why}`
    );
  }

  // A PRE/POST element total for one SUITE.
  const layoutFile = 'tests/components/manager-layout*.js';
  const layoutSources = Object.keys(sources).filter((file) =>
    file.startsWith('tests/components/manager-layout')
  );
  assert.ok(
    layoutSources.length >= 7,
    `the manager-layout suite scanned as ${layoutSources.length} modules, which is fewer than ` +
      'the seven surfaces it is split across — the prefix has stopped reaching it'
  );
  const familyRelevant = (text) =>
    PRIMITIVES.reduce((total, primitive) => {
      const written = classesWrittenBy(primitive);
      return (
        total +
        elementsWithAncestry(text).filter((element) =>
          element.classes.some((cls) => written.has(cls))
        ).length
      );
    }, 0);
  const totalAcross = (read) => layoutSources.reduce((total, file) => total + familyRelevant(read(file)), 0);
  const rawLayoutElements = totalAcross((file) => sources[file]);
  const blankedLayoutElements = totalAcross((file) => blanked.get(file));
  assert.ok(
    blankedLayoutElements >= rawLayoutElements - 10,
    `blanking ${layoutFile}'s comments found ${blankedLayoutElements} family-relevant elements ` +
      `against ${rawLayoutElements} on the raw, unblanked text — a drop of more than 10 means ` +
      'the blanker is corrupting this scanner’s quote pairing and dropping real markup along ' +
      'with the comment prose it is meant to remove, rather than only removing the phantom ' +
      'elements this file’s docblocks illustrate inline.'
  );
  assert.ok(
    blankedLayoutElements >= 40,
    `only ${blankedLayoutElements} family-relevant elements were found in ${layoutFile} after ` +
      'blanking, against a floor of 40. A lossy stripper’s signature is a materially lower ' +
      'blanked total than a lossless one measures for this one file.'
  );
});

test('each primitive’s own scoped styles name no application root either', () => {
  let blocks = 0;
  for (const primitive of PRIMITIVES) {
    for (const file of primitive.components) {
      const source = read(file);
      // GUARDED BY `</script>`, exactly as `markupRegion` guards its own reader.
      const afterScript = source.indexOf('</script>');
      const styleAt = source.lastIndexOf('<style>');
      if (styleAt === -1 || styleAt < afterScript) continue;
      blocks += 1;
      const gated = selectorsIn(source.slice(styleAt)).filter((selector) =>
        classesOf(selector).some((cls) => isApplicationRoot(cls, primitive))
      );

      assert.deepEqual(
        gated,
        [],
        `${file}'s scoped block reaches for an application root, which pins the primitive to one ` +
          'app from the inside — the same defect as the global sheet’s, one file further in:\n  ' +
          gated.join('\n  ')
      );
    }
  }

  assert.ok(
    blocks >= 5,
    `only ${blocks} of the twenty-three component files hold a REAL scoped \`<style>\` block — one ` +
      'opened after `</script>`. SIX do today: `SearchablePopover` and the ' +
      '`SearchablePopoverPanel` its compact presentation moved to (issue 1719), ' +
      '`ManagerColorPopover` and ' +
      '— since issue 1509 put entries on them — `EditorTabs`, whose block is the two ' +
      '`:global(.manager-editor-tab-button.is-danger)` rules that tint a failing validation ' +
      'tab, `RadioCardGroup`, whose block is the one `.manager-resolution-option-meta` ' +
      'rule that types the inline second datum on an option`s name line, and `ItemDropZone`, ' +
      'whose block is the two-rule MISSING treatment for a link whose document has been deleted ' +
      'and the mono address line under the name. All six blocks STAY ' +
      'where they are: a scoped block is injected unlayered and this sheet is ' +
      'loaded into `layer(modules)`, so moving those rules into the sheet would be a layer ' +
      'change and would move a frame. The rest name a `<style>` only in DOCBLOCK PROSE, ' +
      'usually to say they deliberately have none, and the `</script>` guard above is what ' +
      'keeps that prose out of this clause. A lower number means the reader has stopped ' +
      'finding the real blocks and this clause examined nothing.'
  );
});
