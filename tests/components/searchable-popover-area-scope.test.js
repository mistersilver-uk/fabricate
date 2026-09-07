/**
 * A SHARED PICKER MUST PAINT WHEREVER IT IS MOUNTED (issues 1464 and 1470).
 *
 * `SearchablePopover` was the first case. The primitive is shared, but for its whole life every
 * rule it needed was written under `.fabricate-manager`. A caller outside that root —
 * `ActorSelectTopBar` in the player window — portalled its panel to a host the selectors could not
 * reach and drew entirely unstyled, which is why #1458 could not convert it. Issue 1464 moved all
 * thirty rules off the manager root.
 *
 * Issue 1470 finished the set. `IconPicker`, `EssenceSourceSelector`, `ManagerColorPicker` and
 * `ManagerColorPopover` all live in `src/ui/svelte/components/`, THE SHARED DIRECTORY WHOSE WHOLE
 * PREMISE IS THAT A COMPONENT THERE WORKS WHEREVER IT IS MOUNTED, and none of them could. Issue
 * 1466 had already given them a correctly resolved portal host, which made the remaining half of
 * the defect louder rather than quieter: the panel now landed in the right host and still drew
 * `position: static`, because the rule that positions it was rooted at an application the panel
 * was no longer inside. So this gate covered four primitives, not one — and then eight (issues
 * 1477 and 1502), and now nine (issue 1504). The table below is the population; this paragraph
 * is the history of how it grew, and neither number in it is a figure to copy.
 *
 * THE ROOT COULD NOT SIMPLY BE DROPPED, and that is the constraint this gate encodes rather
 * than the one the issue anticipated. `styles/fabricate.css` is loaded page-wide into the Foundry
 * document, so `tests/styles-namespacing.test.js` requires EVERY selector in it to begin with
 * `.fabricate` — an unnamespaced `.manager-travel-option` would bleed into other modules' sheets,
 * which has happened before. The replacement therefore has to be a `.fabricate-*` root, and the
 * only one that travels with a shared primitive is one the PRIMITIVE ITSELF emits:
 * `fabricate-picker` on its root element and `fabricate-picker-popover` on the panel it portals.
 *
 * That is the whole rule, and both halves are load-bearing:
 *
 *   - a picker rule MUST be rooted at one of the primitive's own namespace classes, so it
 *     matches in every app; and
 *   - the primitive MUST actually write those classes, or the rules root at nothing.
 *
 * A rule whose ancestor chain names a CALLER's container — `.fabricate-manager
 * .manager-recipe-or-popover .manager-travel-option-name` — is exempt and stays where it is. It
 * is the caller's override of its own markup, it can only ever match inside that caller's app,
 * and it is reachable there whatever the primitive does.
 *
 * HOW MANY NAMESPACE ROOTS A PRIMITIVE NEEDS IS A PROPERTY OF ITS PORTAL SHAPE, not a count to
 * copy. A portalled node keeps its classes and loses its ancestors, so a component that portals a
 * panel out of its own root needs one class on each — `SearchablePopover`, `IconPicker` and
 * `EssenceSourceSelector` do. `ManagerColorPicker` portals nothing itself (its panel is a separate
 * component, which it drives `anchoredPopover` against) and `ManagerColorPopover`'s root element
 * IS the panel that gets portaled, so those two carry one class each. They are listed here as ONE
 * primitive because they render one class family between them, and `.manager-color-swatch` —
 * painted by both, in two different subtrees after the portal — is why that family's rules need
 * both roots.
 *
 * WHY IT NEEDS A GATE
 * -------------------
 * Re-rooting the family back onto `.fabricate-manager` is a one-word change per rule that looks
 * like tidying, costs nothing to make, and re-breaks every caller outside the manager without
 * failing anything else in the repository: the manager keeps rendering correctly, and the player
 * window has no case that would notice.
 *
 * WHAT MAKES THIS NOT VACUOUS
 * ---------------------------
 * An absence gate over an empty selector set passes forever, and this one derives BOTH of its
 * populations, so either could silently go empty:
 *
 *   1. The class set is read out of each component's MARKUP, not hard-coded. A floor on its size
 *      and on named anchors reds if the extractor stops finding classes — which would otherwise
 *      make the sheet look clean by examining nothing.
 *   2. A floor on the number of picker selectors found, for the same reason on the other side.
 *   3. The application-root detector is proved to FIRE on a synthetic selector, and proved not to
 *      fire on a shipped one, so a predicate rewritten to match everything or nothing reds here
 *      rather than greening the assertions below.
 */
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
 *
 * `IconPicker` and `EssenceSourceSelector` no longer own the elements their family paints. The
 * picker root, the panel, the search row, the list and every option row are `SearchablePopover`'s
 * elements now, and each caller's own classes reach them by being handed to the primitive as
 * `pickerClass` / `popoverClass` / `searchClass` / `listClass` / `optionClass`, which the
 * primitive writes into the `class` attribute it emits.
 *
 * So a declared class prop is checked against the component it is PASSED TO — this one — and not
 * against the entry's own component, which merely supplies the value. A renamed primitive prop
 * then reds here rather than silently reading nothing.
 *
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
 * Eighteen shared primitives, each with the namespace roots it writes and the class family it owns.
 *
 * The first five PORTAL a panel and so need one root on each side of the portal; the rest COMPOSE
 * their family in `<script>` rather than writing it in markup, or write it inline, and carry one
 * root each — `ManagerButton`, `IconButton` and `Pagination` (issue 1502), then `Field`,
 * `ManagerSearchField`, `ManagerToolbar`, `InspectorCard`, `StatusToggle` and `ChanceSlider`
 * (issue 1508). NONE of the issue-1508 families portals anything, so one
 * root each is the whole requirement, and neither do `EditorTabs`, `EditorValidationSurface` or
 * `RadioCardGroup` (issue 1509).
 *
 * `RadioCardGroup` is the first entry whose root element is ANOTHER ENTRY'S: it renders a `Field`
 * as its fieldset, so that one element carries `fabricate-field` and `fabricate-option-cards`
 * together. Each root is an APPLICATION root by name to the other's entry — `isApplicationRoot`
 * decides by exact membership in the entry's own `roots` — so a rule naming both would be gated
 * on both. The two families are measurably disjoint and that disjointness is asserted below.
 * A `composesClasses: true` entry
 * opts into reading the `const classes = $derived([…])` array literal (`composedClassRegion`)
 * ALONGSIDE the ordinary markup region, because `class={classes}` is an identifier rather than a
 * `class="…"` string or a `` class={`…`} `` template, so the ordinary markup-only extractors find
 * nothing for either button primitive on their own — nor for `EditorValidationSurface`, whose
 * root `<section>` is written the same way and whose local was RENAMED to `classes` so this
 * reader can find it at all. A `classMaps` entry opts into a THIRD reader
 * (`classMapRegion`) for a family class the component chooses per host out of a frozen map in
 * `<script>`, which neither of the other two regions covers. TWO entries declare one, and for two
 * different reasons: `StatusToggle` picks its host's class out of `HOST_CLASSES` at render time,
 * while `EditorTabs` DEFAULTS three class PROPS to its own family and a default lives in neither
 * of the other regions — the markup writes only the binding.
 *
 * `family` is a PREFIX pattern rather than a class list because the list is derived from markup:
 * it decides which of the component's classes belong to the primitive's own family, so that
 * generic utilities it also writes (`hint`, `fas`, `fa-chevron-down`) are not mistaken for rules
 * this gate governs. Those are the manager's and Font Awesome's vocabulary, not the primitive's.
 *
 * The floors are the counts measured when each primitive was re-rooted, minus a small margin.
 * They exist to red when a reader has stopped finding the population, not to pin its size.
 */
const PRIMITIVES = Object.freeze([
  Object.freeze({
    name: 'SearchablePopover',
    components: Object.freeze(['src/ui/svelte/components/SearchablePopover.svelte']),
    roots: Object.freeze(['fabricate-picker', 'fabricate-picker-popover']),
    family: 'manager-travel-[\\w-]+',
    anchors: Object.freeze([
      'manager-travel-picker',
      'manager-travel-popover',
      'manager-travel-option',
      'manager-travel-portrait',
    ]),
    // Measured today (issue 1503): 21 written, 38 family selectors, 30 owned, 8 caller overrides.
    // Thirty rules were re-rooted by issue 1464; three more selectors arrived with issue 1503 —
    // the `[data-picker-as='grid']` display rung, its `[data-picker-columns='2']` template and
    // the keyboard cursor's outline. The markup writes 19 raw `class="…"` attributes
    // and 8 `` class={`…`} `` templates — 27 values, 21 distinct `manager-travel-*` names — and
    // this entry DECLARES NO `classProps`: it reads its family entirely out of those attributes,
    // because it is the component the other two PASS class props to rather than one that passes
    // any. That is why the class-prop floor below is scoped to entries that declare a list.
    writtenFloor: 12,
    familyFloor: 25,
    ownedFloor: 25,
    // The class attribute that copies the primitive's root markup, and the namespace class that
    // must ride beside it in any hand-built fixture.
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
    // Measured today (issue 1503): 9 written, 26 family selectors, 12 owned. Fourteen are caller
    // overrides — the vocabulary tile, the two condition chips and the essence icon actions all
    // re-shape the trigger from their own markup. `written` was 10 before the picker rendered
    // through `SearchablePopover`; `essence-icon-picker-empty` retired with the caller's own
    // empty branch.
    //
    // THE FAMILY SHRANK BY THREE AND THE FLOORS FOLLOW IT DOWN, which is a population that got
    // smaller rather than a reader that stopped finding one: the caller's own panel block and
    // its own search-field block are DELETED (the shared primitive supplies both, whole), and
    // the six-member state list lost its two `:focus-visible` members — an option row never
    // takes DOM focus now — against one new caller-rooted chip override. These floors exist to
    // red when the extractor goes quiet, so they are re-set under the measured counts by the
    // same margin they carried before rather than left where a deletion would trip them.
    //
    // ONLY SIX of this component's class values are now raw `class="…"` attributes (it was 12):
    // the picker root, the panel, the search row, the list and every option row belong to the
    // PRIMITIVE's elements and arrive there through the class props below.
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
    // `written` was 12 before the picker rendered through `SearchablePopover`;
    // `essence-source-picker-empty` retired with the caller's own empty branch. The family lost
    // FIVE selectors and the floors follow it down for the reason the `IconPicker` entry states
    // above, plus one more that is this picker's alone: its two-column `grid-template-columns`
    // rule is gone, because the shared list rule's `display: flex` would have made a caller-side
    // template inert — the primitive emits `data-picker-columns` and the shared sheet paints it.
    // Nine raw
    // `class="…"` attributes are left and all nine are trigger-side; neither namespace root is in
    // one any more, so both arrive through the class props below.
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
    // Measured today: 3 written, 9 family selectors, 9 owned, 0 caller overrides. The family is
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
    // Two exact class names, not a shared prefix: `fab-manager-button` does not start with
    // `manager-button-`, and the modifier classes (`is-primary`, `is-dashed`, …) are excluded on
    // purpose — `isPrimitiveOwned` already accepts any `is-*` token as the primitive's own, so a
    // compound naming one needs no entry here to stay owned.
    family: 'manager-button|fab-manager-button',
    anchors: Object.freeze(['manager-button', 'fab-manager-button']),
    // COMPOSES its family in `const classes = $derived([…])` (`ManagerButton.svelte`) rather
    // than in markup — `classesWrittenBy` and the root-emission clause's `attributes` local both
    // read `composedClassRegion` for this entry as well as the (here, empty) markup region.
    composesClasses: true,
    // Measured today: 2 written (the array holds no other unconditional family literal), 109
    // family selectors, 30 owned — 28 exempt (27 whose ancestor chain names a caller's own
    // container, plus the one `[data-manager-view=…]` per-view override that is exempt by the
    // application-root-attribute clause alone), 51 belong to caller CLASS compounds (the twelve
    // `SearchablePopover` `triggerClass` carriers, the `managerHeaderActionClass` builder's
    // equalities and the world component catalogue's per-control compounds, each naming a caller
    // class beside the family) — 109 - 28 - 51 = 30.
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
    // Measured today: 1 written, 22 family selectors, 15 owned — 5 caller-ancestor exempt, 1
    // belongs to Pagination's own family (its ancestor is the primitive's OWN class, not a
    // caller's), 1 belongs to a caller CLASS compound
    // (`.manager-icon-button.manager-recipe-step-nav`) — 22 - 5 - 1 - 1 = 15.
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
    // Written inline on the root `<section>` (`Pagination.svelte:215`) — this component composes
    // nothing, so `composesClasses` is neither needed nor set.
    // Measured today: 5 written (root class aside), 19 family selectors, 6 owned — 6
    // caller-container exempt plus 6 caller-container-by-ATTRIBUTE exempt (the
    // `[data-manager-view=…]` per-view overrides — see the application-root-attribute clause
    // below) plus 1 belonging to IconButton's own family — 19 - 6 - 6 - 1 = 6.
    writtenFloor: 4,
    familyFloor: 15,
    ownedFloor: 5,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-pagination', root: 'fabricate-pagination' }),
    ]),
  }),
  Object.freeze({
    // ── THE NINTH ENTRY, AND THE FIRST WHOSE FAMILY IS ITSELF `fabricate-`-PREFIXED (issue 1504).
    //
    // Six mechanics a later reader would otherwise "fix" by deleting an assertion, each recorded
    // because it is the reason a line here is shaped the way it is:
    //
    // 1. `isApplicationRoot` reads a NAMESPACE root apart from an APPLICATION root BY NAME, not
    //    by shape — every class in this file's world starts with `fabricate-`, so the only thing
    //    separating `.fabricate-select-trigger` from `.fabricate-manager` is which list it is on.
    //    Every other family here is named for the manager (`manager-travel-*`, `essence-*`) and
    //    gets that separation for free. This one does not, so it declares its own membership:
    //    every class the component writes as a whole token is in `roots`, and the three per-size
    //    rungs it composes by interpolation are covered by `namespacedFamily`. Without both, the
    //    `gated` clause reds on correct code — it did, measured, on all four trigger rules and
    //    the panel's.
    // 2. `anchors[0]` MUST be a root, because the detector clause asserts
    //    `!isApplicationRoot(anchors[0])`. Note what that assertion is worth HERE: for the eight
    //    entries above, `anchors[0]` is a non-`fabricate-` class and the assertion is a real probe
    //    of an over-matching predicate. For this entry it holds by construction and proves
    //    nothing, which is why the `fabricate-manager` half of that same clause is the one doing
    //    the work.
    // 3. `mirrored` pairs each anchor with an INHERITED class rather than with itself. `Select`
    //    renders through `SearchablePopover`'s own root and panel, so a fixture writing
    //    `fabricate-select` alone measures none of the `.fabricate-picker*` paint the shipped
    //    control actually wears — the mirror defect this file's own docblock records, in the very
    //    files this change re-authors. A self-referential pair (`fabricate-select` →
    //    `fabricate-select`) would be satisfied by construction and protect nothing. Because the
    //    anchors are the ROOT and the PANEL, a fixture writes the composed root element with the
    //    trigger nested inside it; a trigger-only fixture matches no pair at all.
    // 4. `.fabricate-select .manager-travel-picker-value` — `Select` styling the primitive's own
    //    inner span — is NOT exempt here, which is where the plan's decision E was wrong as
    //    measured. Its reasoning was that the selector names a class `Select` does not write, so
    //    `isPrimitiveOwned` classes it as a caller override; but for an all-`fabricate-` family
    //    every own class is filtered out as an application root first, leaving the selector owned
    //    by `SearchablePopover` and `gated` firing on it. The shipped exemption depends on the
    //    caller's class NOT carrying the prefix. So `Select` passes `valueClass` and styles
    //    `.fabricate-select-value`, and the two heading rules address `[data-popover-group] > p`
    //    by attribute rather than by the inherited class name.
    // 5. The `rootless` clause cannot fire on a selector whose first compound names a family
    //    class, because `namespacedFamily` makes every one of them a namespace class. Its job —
    //    keeping a family rooted rather than page-global — is discharged for this family by the
    //    `fabricate-` prefix itself, and `tests/styles-namespacing.test.js` enforces that prefix
    //    independently. `gated` is the clause that carries this entry. `rootless` would still
    //    fire on a leading class-less compound such as `[data-x] .fabricate-select-trigger`.
    // 6. The ancestry half of the fixture gate is self-satisfied for a root element (an element's
    //    own classes are in its own ancestry, and `fabricate-select` is a root), so the clause
    //    that does the work on this family is the ATTRIBUTE half, through `mirrored` above.
    name: 'Select',
    components: Object.freeze(['src/ui/svelte/components/Select.svelte']),
    // The nineteen family classes `Select` writes as WHOLE tokens: the picker root, the trigger,
    // the three value states, the panel and its ticked variant, the list, the option row, the
    // row's five content elements, and the labelled form's four. The per-size rungs
    // (`fabricate-select-trigger-form|inline|toolbar`,
    // `fabricate-select-popover-form|inline|toolbar`) are deliberately absent: they are composed
    // by interpolation from the `size` prop, so no reader can see them as literals and listing
    // them here would red the root-emission clause on classes the component genuinely emits.
    // `namespacedFamily` covers them by pattern, which is also what keeps a FOURTH rung from
    // quietly falling outside this gate the day one is added.
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
    // `SearchablePopover`'s two roots, which this primitive COMPOSES rather than writes — its
    // panel rules are `.fabricate-picker-popover.fabricate-select-popover*`, two namespace
    // classes and no application. Cross-checked against that entry's own `roots` below, so
    // renaming one there reds here instead of silently exempting a class from the application
    // test.
    inheritedRoots: Object.freeze(['fabricate-picker', 'fabricate-picker-popover']),
    namespacedFamily: true,
    family: 'fabricate-select[\\w-]*',
    anchors: Object.freeze([
      'fabricate-select',
      'fabricate-select-trigger',
      'fabricate-select-popover',
      'fabricate-select-option',
    ]),
    // Measured at this head: 19 written, 35 family selectors, 32 owned. The THREE exemptions are
    // all the same shape — a caller's override of the caller's own wrapper class, reaching the
    // trigger box the API deliberately does not address:
    // `.fabricate-manager .fab-bulk-edit-select .fabricate-select-trigger`, the bulk panel's
    // full width; and the two the scoped catalogue toolbar keeps from issue 1371, its opt-in
    // `.is-size-38` lead rung and its `[data-manager-view='world-components']` secondary ink,
    // both of which named a `<select>` element until this change converted those controls. The
    // floors sit a little under those counts, as the entries above do.
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
    //
    // `Field` renders a `<label>`, `<div>` or `<fieldset>` and the CONTROL inside it is the
    // caller's, so this family owns no control of its own in markup — but the sheet's blanket
    // `.manager-field input|select|textarea` rules are the field's own chrome and travel with it.
    // That is why the family declares a font FLOOR (`.fabricate-field :is(input, select,
    // textarea)`, `font: inherit` alone, in the group below the area baseline) and a SECOND
    // element-typed chrome rule in its own block, rather than one widened floor.
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
    // Measured before this change landed: 1 written, 27 family selectors, 9 owned — 15 exempt
    // (13 whose ancestor chain names a caller's own container, 2 app-root-with-attribute) and 3
    // caller-CLASS compounds (`.span-2`, and the two that name `.fab-stepper-input` inside a
    // `:not()`). Twelve selectors are re-rooted: the 9 owned plus those 3, because two of the
    // three share a selector LIST with owned members and leaving them behind would split a
    // shipped rule in half. `writtenFloor` is near-vacuous at 1 — this primitive writes exactly
    // one family class — so the real guard for it is the exact `anchors` list above.
    writtenFloor: 1,
    familyFloor: 24,
    ownedFloor: 8,
    mirrored: Object.freeze([Object.freeze({ anchor: 'manager-field', root: 'fabricate-field' })]),
  }),
  Object.freeze({
    // ── MANAGERSEARCHFIELD (issue 1508). Owns its own `<input type="search">`, so it declares a
    // font floor (`.fabricate-search input`) and a focus PAIR on that input. It needs no
    // `appearance`/`min-height` restatement: the area's element-typed baseline matches no
    // `type="search"`, and the pill's own re-rooted rule declares its 34 height and 6 radius.
    name: 'ManagerSearchField',
    components: Object.freeze(['src/ui/svelte/components/ManagerSearchField.svelte']),
    roots: Object.freeze(['fabricate-search']),
    // One exact class name; `manager-tag-search`, `manager-scoped-roster-search` and the rest are
    // CALLER classes that do not match `\.manager-search(?![\w-])` and never enter this family.
    family: 'manager-search',
    anchors: Object.freeze(['manager-search']),
    // `SIZE_CLASSES` (`is-size-38`) needs no reader: `isPrimitiveOwned` already accepts any `is-*`
    // token as the primitive's own.
    composesClasses: true,
    // Measured before this change landed: 1 written, 31 family selectors, 10 owned, 0
    // caller-CLASS compounds. Seven are re-rooted; the other three are the Tools browser's own
    // override of a search field inside its library card, whose ancestor this change RENAMES from
    // `[data-manager-tools-search]` to the class the caller writes on that same element
    // (`manager-tools-library-card`) — identical match set, unchanged rank and position — so they
    // become caller-exempt and stay application-rooted, taking exempt to 24 and owned to 7.
    writtenFloor: 1,
    familyFloor: 27,
    ownedFloor: 6,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-search', root: 'fabricate-search' }),
    ]),
  }),
  Object.freeze({
    // ── MANAGERTOOLBAR (issue 1508). The manager's filter bar, rooted at the class it emits.
    //
    // It declares NO font floor and NO focus pair, and that is a positive decision rather than a
    // gap: the bar renders `{@render children?.()}` and owns no control of its own, and
    // `openspec/specs/design-system/spec.md` forbids a primitive displacing an area's chrome for
    // a control it does not own. One family rule nonetheless REACHES a caller's control — the
    // `select.is-size-38` rung — and travels with the family unfloored, which is a recorded
    // residue owned by issues 1510/1511.
    name: 'ManagerToolbar',
    components: Object.freeze(['src/ui/svelte/components/ManagerToolbar.svelte']),
    roots: Object.freeze(['fabricate-filter-bar']),
    // One exact class name. `manager-toolbar-pills` (`fabricate.css:5553`) and
    // `manager-toolbar-primary` are CALLER classes: `pickerSelectors` anchors on
    // `\.manager-toolbar(?![\w-])`, so neither enters this family.
    family: 'manager-toolbar',
    anchors: Object.freeze(['manager-toolbar']),
    // COMPOSES its family in `const classes = $derived([…])` rather than in markup: the host is
    // `<section class={classes}>`, an identifier the plain extractor cannot read.
    composesClasses: true,
    // Measured at this commit: 1 written, 10 family selectors, 3 owned — 4 exempt (one
    // app-root-with-attribute per-view override and three more) and 3 caller-CLASS compounds
    // (`:not(:has(.manager-toolbar-primary))` twice, once at the top level and once inside
    // `@container fabricate-manager`, and the world-vocabulary sort select). FIVE are re-rooted:
    // the 3 owned plus the two `:not(:has(…))` branches, which paint every shipped bar and would
    // leave a bare-host bar `display: grid` if they stayed behind. The SIXTH caller-class
    // compound, `fabricate.css:9852`, is the family's one NAMED RESIDUE: its family compound
    // stands third behind an attribute ancestor that is not the application root, so neither
    // re-rooting form exists for it. It is caller-owned, so neither `gated` nor `rootless`
    // below sees it, and the reason is recorded beside the rule in the sheet.
    writtenFloor: 1,
    familyFloor: 9,
    ownedFloor: 2,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-toolbar', root: 'fabricate-filter-bar' }),
    ]),
  }),
  Object.freeze({
    // ── INSPECTORCARD (issue 1508). The manager's card shell, rooted at the class it emits.
    //
    // No floor and no pair here either, and for the same reason: the card renders its caller's
    // children and owns no control at all. Unlike the toolbar it has no control-reaching rule, so
    // it carries no residue of that kind.
    name: 'InspectorCard',
    components: Object.freeze(['src/ui/svelte/components/InspectorCard.svelte']),
    roots: Object.freeze(['fabricate-card']),
    // One exact class name. `manager-checks-card`, `manager-card-title` and the rest are CALLER
    // classes and never enter this family.
    family: 'manager-inspector-card',
    anchors: Object.freeze(['manager-inspector-card']),
    composesClasses: true,
    // Measured at this commit: 1 written, 7 family selectors, 2 owned — 4 exempt (the Checks
    // rail's two ancestor chains and the essence and tool inspectors' per-view overrides) and 1
    // caller-CLASS compound, the Checks Studio's `.manager-checks-card` treatment. THREE are
    // re-rooted: the 2 owned plus that compound, which is the card's own box under a caller's
    // modifier and would be split from its family if it stayed behind.
    writtenFloor: 1,
    familyFloor: 6,
    ownedFloor: 1,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-inspector-card', root: 'fabricate-card' }),
    ]),
  }),
  Object.freeze({
    // ── STATUSTOGGLE (issue 1508). The manager's on/off switch, rooted at the class it emits.
    //
    // Its root IS its control — a `<button>`, a `<label>` or a `<span role="img">` — so the font
    // floor is written at the family root ALONE, (0,1,0), the shape `ManagerButton` and
    // `IconButton` take. The family already declared its own focus PAIR before this change
    // (`:focus` strip plus `:focus-visible` repaint, both (0,3,0)); both were re-rooted IN PLACE
    // rather than replaced, at unchanged specificity and unchanged declarations.
    name: 'StatusToggle',
    components: Object.freeze(['src/ui/svelte/components/StatusToggle.svelte']),
    roots: Object.freeze(['fabricate-toggle']),
    // TWO prefixes, because this family really is two: the switch tree (`manager-status-toggle`
    // and its `-track`/`-knob`/`-label` children) and the checkbox host's own structural pair
    // (`manager-tool-setting-toggle` and its `-input`), which the component emits per host.
    // `manager-tool-settings-*` and the rest of the Tool Studio's vocabulary are CALLER classes
    // and match neither prefix.
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
    // The two readers are not interchangeable here: `composedClassRegion` truncates at the first
    // `]` in the file after the array opener, and in this component's array that `]` is
    // `HOST_CLASSES[host]`'s own — so the composed reader sees the root and
    // `manager-status-toggle` and stops, and `manager-tool-setting-toggle` reaches the family
    // only through `classMaps`.
    composesClasses: true,
    classMaps: Object.freeze(['HOST_CLASSES']),
    // Measured at this commit: 6 written, 25 family selectors, 18 owned — 7 exempt (all ancestor
    // chains naming a caller's own row or card) and 0 caller-CLASS compounds. SEVENTEEN of the 18
    // are re-rooted shipped rules and the eighteenth is the checkbox host's new `:focus` strip,
    // which this change ADDS and which enters the family through
    // `manager-tool-setting-toggle-input`; before it landed the pair was 24 and 17.
    //
    // BOTH of the checkbox host's shipped rules are owned ONLY because of the class map above.
    // Without it `written` is 5, the family is 24 and owned is 16: `.manager-tool-setting-toggle`
    // falls outside the family altogether, and the `:has()` ring that also names it is judged
    // caller-owned. The clause below measures that difference rather than restating it.
    writtenFloor: 5,
    familyFloor: 21,
    ownedFloor: 15,
    // TWO anchors, and the second matches ZERO fixtures today — measured, and recorded here
    // rather than left out because of it. Both of the checkbox host's rules are re-rooted at
    // `fabricate-toggle` by this change, so a future fixture writing `manager-tool-setting-toggle`
    // on its own would be a root-less mirror measuring an unstyled default, and with no entry
    // here there would be no gate signal at all.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-status-toggle', root: 'fabricate-toggle' }),
      Object.freeze({ anchor: 'manager-tool-setting-toggle', root: 'fabricate-toggle' }),
    ]),
  }),
  Object.freeze({
    // ── CHANCESLIDER (issue 1508). The number-plus-range percentage control, rooted at the class
    // it emits.
    //
    // It owns TWO controls — its `<input type="number">` and its `<input type="range">` — and its
    // root is a `<span>` that is neither, so its font floor is `.fabricate-slider input` at
    // (0,1,1) in the group below the area baseline, and its focus pair is written over the same
    // bare `input`. It needs no `appearance`/`min-height` restatement: the area's element-typed
    // baseline matches neither `type="number"` nor `type="range"`, and the family's own rules
    // declare the 28px heights both halves take.
    name: 'ChanceSlider',
    components: Object.freeze(['src/ui/svelte/components/ChanceSlider.svelte']),
    roots: Object.freeze(['fabricate-slider']),
    // TWO prefixes again, and for a plainer reason: this component writes eight classes across
    // two naming generations. `manager-drop-rate-cell` and `manager-drop-rate-editor` are CALLER
    // classes — the component writes neither — so no rule naming one enters this family, which is
    // why `pickerSelectors` is anchored on the written NAMES rather than on this pattern.
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
    // NO `composesClasses`: this component writes every class it emits as a literal, its root
    // inline on the root `<span>` exactly as `Pagination` does. Two of the eight arrive through a
    // `` class={`…`} `` template, which `classAttributeValues` already reads.
    // Measured at this commit: 8 written, 35 family selectors, 22 owned — 12 exempt (the
    // gathering task editor's and the drop editor card's own overrides) and 1 caller-CLASS
    // compound, `.manager-drop-rate-control.has-continuous-gradient .manager-drop-rate-fill`.
    // TWENTY-THREE are re-rooted: the 22 owned plus that compound, whose modifier is a caller's
    // and which would be split from the fill rule it overrides if it stayed behind.
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
    //
    // ITS FAMILY LIVES IN PROP DEFAULTS, which is why this entry declares a class map. The
    // component takes `containerClass`, `buttonClass` and `badgeClass` as props and DEFAULTS them
    // to its own family; the markup writes `class={containerClass}` (a bare identifier the
    // attribute reader cannot match at all) and `` class={`${buttonClass} …`} `` (all
    // interpolated), so only the count and the dot survive as literals. Without the map `written`
    // is 2 and eleven of the family's thirteen selectors read CALLER-owned — gate-inert, left
    // application-rooted, with this gate reporting the family clean. The three defaults are frozen
    // into `DEFAULT_CLASSES` so `classMapRegion` reads them, and `written` is 5.
    //
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
    // Measured at this commit: 5 written, 12 family selectors, 7 owned — 4 exempt (the
    // environment stem's leg of the split active re-tone, the Tool Studio's badge override and the
    // component-entry column's two strip overrides) and 1 caller-CLASS compound, the badge's own
    // `.manager-chip` qualification. EIGHT are re-rooted: the 7 owned plus that compound, which is
    // the strip's own chrome under a composed primitive's class and would be split from its family
    // if it stayed behind.
    //
    // `.fabricate-manager .manager-editor-tab-panel` is NOT in these figures and is not exempt
    // either: `manager-editor-tab-panel` is a CALLER class that happens to fall inside the family
    // PREFIX, no name in `written` matches it, so the rule never enters `pickerSelectors`'
    // population at all. Three callers write it on a SIBLING of the tablist, so re-rooting it
    // would cost every editor panel its overflow, its scrollbar gutter and both `min-*: 0`.
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
    //
    // COMPOSES its family, and the local had to be RENAMED for that to be readable.
    // `composedClassRegion` locates its region by the exact opener `const classes = $derived(`, so
    // the component's own `rootClass` was invisible to it and `composesClasses: true` would have
    // red with the reader's own named error rather than reading the array. The root is the array's
    // FIRST literal because that is the position the composed reader takes as the namespace class.
    name: 'EditorValidationSurface',
    components: Object.freeze(['src/ui/svelte/components/EditorValidationSurface.svelte']),
    roots: Object.freeze(['fabricate-validation']),
    // TWO prefixes and one exact name, and the EXCLUSIONS are the load-bearing part. This
    // namespace is crowded: measured on this sheet, `.manager-recipe-*` occurs 457 times across
    // 55 distinct `manager-recipe-<word>` prefixes, and `manager-recipe[\w-]*` matches 427
    // selectors against this pattern's 46 — so a loose pattern would have swallowed
    // `ToggleCard`'s own family and some three hundred and eighty unrelated selectors.
    //
    // `manager-recipe-tab` is EXCLUDED BY NAME even though this surface writes it on its own
    // root: six other recipe tabs write it too (`recipe/RecipeAccessTab`,
    // `RecipeBooksScrollsTab`, `RecipeIngredientsTab`, `RecipeOverviewTab`, `RecipeResultsTab`,
    // `RecipeToolsTab`), so re-rooting the five `manager-recipe-tab(?!le)*` selectors would have
    // un-styled six tabs. `manager-editor-validation-surface` is excluded for the plainer reason
    // that no rule in the sheet names it.
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
    // Measured at this commit: 21 written, 46 family selectors, 37 owned — 9 exempt and 0
    // caller-CLASS compounds, so 37 re-rooted and the two counts agree for the first family in
    // this table. The 9 are the Checks Studio route's five `.manager-checks-validation-route`
    // chains and the Tool rules editor's four medallion overrides, which are exempt for two
    // DIFFERENT reasons: the first five name a caller's own container and always did, while the
    // four put the family compound THIRD behind an ancestor that is not the application root, so
    // neither re-rooting form exists for them. Those four were rewritten to name that ancestor by
    // the class its caller writes on the same element (`.manager-tool-tab-stack`) rather than by
    // its hook attribute, at unchanged rank, position and declarations — which is what moved them
    // out of `owned` and into the exempt set.
    writtenFloor: 18,
    familyFloor: 41,
    ownedFloor: 33,
    // The ROOT-ELEMENT anchor, and it matches ZERO fixture attributes today — measured, and
    // recorded rather than swapped for a populated descendant. `manager-recipe-rail-summary` has
    // one attribute in one file and is REFUSED: it is the medallion ROW, a descendant of the
    // root, so a fixture carrying it satisfies the attribute clause by stamping a root onto an
    // element no rule in the sheet roots at — which is why that file's ten offenders are repaired
    // by WRAPPING the row in the root element instead. `manager-recipe-tab` is refused for the
    // family's own reason: six other components write it, so it would report their fixtures as
    // this family's offenders.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-recipe-validation', root: 'fabricate-validation' }),
    ]),
  }),
  Object.freeze({
    // ── RADIOCARDGROUP (issue 1509). The manager's radio-card group, rooted at the class it emits.
    //
    // ITS ROOT ELEMENT IS ANOTHER PRIMITIVE'S. The component renders `<Field as="fieldset">`
    // unconditionally and hands it a `class`, so the fieldset carries `fabricate-field`,
    // `manager-field` and then this family's root together — TWO namespace roots on ONE element.
    // The root leads this component's own template, which is the position `classAttributeValues`
    // reads it from, and `Field` appends rather than replaces.
    //
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
    // `manager-tool-bonus-row` is NOT in this family and must never be: the Tool Requirements
    // bonus list was ruled OFF this primitive at issue 1373 round 4, and it is the class that
    // forced the six selector-list SPLITS this change makes.
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
    // Measured at this commit: 12 written, 47 family selectors, 31 owned — 16 exempt and 0
    // caller-CLASS compounds. The 16 are the Checks Studio card's eight overrides and the Tool
    // editor's eight `[data-manager-view]`-qualified ones, both of them a caller naming its own
    // container. THIRTY-TWO are re-rooted, one more than the gate can see: the extra is
    // `.fabricate-option-cards.manager-resolution-mode-card.is-config-cards
    // .manager-resolution-mode-options` inside an unnamed `@container (max-width: 620px)`, which
    // `selectorsIn` cannot reach because its rule opens after a `{` rather than after a `}` or a
    // `;`. It is re-rooted anyway, because leaving the narrow override at the manager root while
    // its wide twin travels would collapse the grid to one column inside the manager only. The
    // HELPER census (`censusRules`) sees all 48 selectors in 43 rules and is the figure the pull
    // request publishes beside this one.
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
    // ── TOGGLECARD (issue 1509). The manager's labelled status card — glyph, title, sub-line and
    // an on/off switch — rooted at the class it emits on its own root `<div>`.
    //
    // THE ROOT IS THE TEMPLATE'S LEADING LITERAL. `classAttributeValues` reads BOTH `class="…"`
    // and `` class={`…`} `` and returns the template's text verbatim, so the `${variant}` and
    // `${on ? …}` spans survive whitespace-splitting as tokens that match no class in the sheet
    // and the literals around them are credited.
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
    // Measured at this commit: 5 written, 22 family selectors, 10 owned — 12 exempt and 0
    // caller-CLASS compounds, so the owned and the re-rooted counts agree at 10. The 12 are three
    // CALLERS restating this card's metrics inside containers of their own: the Checks Studio's
    // `.manager-checks-flag-list` (five), its `.manager-checks-trigger-body` (four) and the Tool
    // rules editor's `.manager-tool-system-enabled` (three). They stay application-rooted, which
    // is what makes this family a capability with a stated edge rather than an unqualified one.
    writtenFloor: 4,
    familyFloor: 19,
    ownedFloor: 9,
    // The ROOT-ELEMENT anchor, and it matches ZERO fixture attributes today — measured, and
    // recorded rather than swapped for a populated descendant, because every OTHER class this
    // family writes is a descendant of the root and a fixture carrying one would satisfy the
    // attribute clause by stamping a root onto an element no rule in the sheet roots at. There is
    // no populated candidate to refuse here: the whole family's fixture population was zero in
    // BOTH clauses before this change, so this entry adds exactly the one attribute and the one
    // element that `re-rooted-controls-host-independence.test.js` writes.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-recipe-status-card', root: 'fabricate-toggle-card' }),
    ]),
  }),
  Object.freeze({
    // ── ITEMDROPZONE (issue 1509). The manager's ONE document drop target — a dashed prompt that
    // becomes a linked card — rooted at the class it emits on its own root `<div>`.
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
      // WRITTEN BUT UNRULED IN THIS SHEET: the address line is painted by the component's own
      // scoped block and by nothing here. It is an anchor anyway, because the emission clause's
      // job is to notice a class the component stops writing, and a class the global sheet does
      // not name is exactly the one a reader would delete without consequence.
      'manager-item-drop-zone-uuid',
    ]),
    // Measured at this commit: 5 written, 16 family selectors, 15 owned — 1 exempt and 0
    // caller-CLASS compounds, so the owned and the re-rooted counts agree at 15. The one exempt
    // is `.fabricate-manager .manager-component-entry-card .manager-item-drop-zone.is-compact`,
    // the world component entry card's own transparent-prompt override, which names a caller's
    // container and always did.
    writtenFloor: 4,
    familyFloor: 14,
    ownedFloor: 13,
    // The ROOT-ELEMENT anchor, measured at ZERO fixture attributes, with nothing to refuse: no
    // file under `tests/` wrote any class of this family into fixture markup before this change,
    // so both clauses' populations for it were zero and this entry adds only what
    // `re-rooted-controls-host-independence.test.js` writes.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-item-drop-zone', root: 'fabricate-link-field' }),
    ]),
  }),
]);

const read = (file) => readFileSync(join(repoRoot, file), 'utf8');

/**
 * An APPLICATION root, from one primitive's point of view: the class a Foundry app puts on its own
 * window root. Every namespace class shares the `fabricate-` prefix by necessity — the namespacing
 * gate demands it — so the two are told apart by name rather than by shape.
 *
 * @param {string} cls A class name.
 * @param {{roots: readonly string[]}} primitive The primitive whose rules are being judged.
 * @returns {boolean} True when `cls` roots the rule at an application rather than at the primitive.
 */
/**
 * A NAMESPACE class, from one primitive's point of view: a `fabricate-`-prefixed class that
 * belongs to the primitive rather than to a Foundry application window.
 *
 * Three ways to be one, and the last two arrived with issue 1504's `Select` (both optional, both
 * absent from every entry written before it, so this predicate is byte-equivalent to
 * `primitive.roots.includes(cls)` for the eight entries above `Select`):
 *
 *   - `roots` — a namespace class the component writes ITSELF, which the root-emission clause
 *     below proves it still writes;
 *   - `inheritedRoots` — a namespace class of a primitive this one COMPOSES. `Select` renders
 *     through `SearchablePopover`'s own root and panel, so `.fabricate-picker-popover
 *     .fabricate-select-popover` is rooted at two namespace classes and at no application. It is
 *     deliberately NOT in `roots`: `Select` does not write it, and the emission clause would red
 *     truthfully if it did. The guarantee is discharged by the `SearchablePopover` entry in this
 *     same array instead, and cross-checked below so a rename cannot quietly widen the exemption;
 *   - `namespacedFamily` — the entry's whole family carries the `fabricate-` prefix, so the
 *     family PATTERN is itself the namespace test. `Select`'s family is `fabricate-select*`, and
 *     three of its classes are composed per SIZE by interpolation (`…-trigger-${rung}`), so they
 *     cannot be hand-listed as roots without either duplicating the size enum here or forcing the
 *     component to write nine literals it does not need. This is the mechanical form of the
 *     plan's decision E — "a wholly `fabricate-`-prefixed family declares every member a
 *     namespace root" — stated as one pattern rather than as a list that a new rung would
 *     silently fall out of.
 */
const isNamespaceClass = (cls, primitive) =>
  primitive.roots.includes(cls) ||
  (primitive.inheritedRoots ?? []).includes(cls) ||
  Boolean(primitive.namespacedFamily && new RegExp(`^(?:${primitive.family})$`).test(cls));

const isApplicationRoot = (cls, primitive) =>
  cls.startsWith('fabricate-') && !isNamespaceClass(cls, primitive);

/**
 * The markup region of a component: after its `<script>`, before any scoped `<style>`.
 *
 * The `<script>` names classes as PORTAL HOST and SELECTOR strings and the `<style>` block is
 * scoped by the compiler, so neither holds a class the component writes onto its own elements.
 * Three of these components have no `<style>` at all, so its absence is not an error.
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
 * Located by the opener's exact text and its matching `]`, mirroring `markupRegion`'s own
 * opener-and-assertion shape.
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
 * The text of a frozen class MAP a component declares in `<script>` — `const <NAME> =
 * Object.freeze({…})` — located by that exact opener and its matching `}`.
 *
 * WHY A SECOND READER, AND WHY IT IS OPT-IN (issue 1508). A family class a component chooses PER
 * HOST lives in neither region the two readers above cover. `StatusToggle`'s `HOST_CLASSES`
 * is the shipped instance: `manager-tool-setting-toggle` reaches the DOM through
 * `HOST_CLASSES[host]` inside the composed array, and neither `markupRegion` (which slices after
 * `</script>`) nor `composedClassRegion` (which truncates at the FIRST `]`, which is that
 * expression's own) can see the string. Without this reader the family is short by one class and
 * TWO shipped rules are invisible to the ownership assertions below — one outside `family`
 * altogether and one inside it but judged caller-owned — while the gate reports the family clean.
 *
 * Opt-in per entry through `classMaps`, and only `StatusToggle` declares it. `ManagerSearchField`'s
 * `SIZE_CLASSES` needs nothing: an `is-*` token is already accepted by `isPrimitiveOwned`.
 *
 * NAMED-ERROR DISCIPLINE, the same as `markupRegion` and `composedClassRegion`: a declared map the
 * reader cannot find is an EXTRACTOR failure and not an empty result, because falling silent here
 * puts the family back exactly where it was before this reader existed and the gate goes on
 * reporting it clean.
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
 * Every DECLARED class-prop VALUE in a markup region — `pickerClass="…"` and
 * `` pickerClass={`…`} `` alike, the same two forms `classAttributeValues` reads for a `class`
 * attribute, because a caller writes a class prop exactly as it writes a class (issue 1503).
 *
 * Named-error discipline, matching `markupRegion` and `composedClassRegion`: a declared prop that
 * the reader cannot find is an EXTRACTOR failure, not an empty result. Falling silent there is how
 * the emission clause below would go on passing while the value it is reading had moved to a form
 * this regex does not see — an interpolated `` {`${base} ${extra}`} ``, say — and the caller's
 * namespace root stopped being credited to anything.
 *
 * @param {{name: string, classProps?: readonly string[]}} primitive The entry being read.
 * @param {string} file Repository-relative component path, for the error message.
 * @param {string} markup That component's markup region.
 * @returns {string[]} One value per declared class prop.
 */
/**
 * The value of a class prop passed in Svelte's SHORTHAND form — `` {triggerClass} `` — resolved
 * out of the `const <name> = $derived(…)` declaration the identifier names (issue 1504).
 *
 * `Select` composes its trigger, panel and value classes per SIZE, so those three props are
 * computed in `<script>` and passed by shorthand rather than written as a literal beside the
 * component. The two literal forms `classPropValues` reads cannot see them, and this gate's own
 * rule for that case is stated in its message: retarget the extractor rather than delete the
 * declaration. Falling silent instead would leave the trigger's, the panel's and the value's
 * whole class set uncredited — every rule naming one of them outside the family this gate reads.
 *
 * A token carrying an INTERPOLATION is dropped rather than half-read: `` `…-trigger-${rung}` ``
 * is not the class `…-trigger-`, and a partial name in the emitted set would satisfy the
 * root-emission clause for a class no element ever carries. The per-size rungs are covered
 * instead by `namespacedFamily`, which is what that field exists for.
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
    // The SHORTHAND form is one value like the two literal forms, so the per-entry count below
    // stays "one value per declared prop" and a reader that stops resolving still reds.
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

/**
 * Every class-attribute-shaped VALUE a primitive writes for itself in `file`: real
 * `class="…"` / `class={`…`}` markup values, plus — for a `composesClasses` primitive — each
 * unconditional literal of its composed array, treated as its own value so the existing
 * whitespace-split reduction downstream (one token in, one token out) needs no branch for it,
 * plus — for an entry declaring `classProps` — the value of each of those props.
 *
 * A class prop is EMISSION even though this component is not the one that writes it: the class
 * reaches the DOM through a class the PRIMITIVE writes, using the value declared here, so the
 * area-scope guarantee is unchanged. What moved is who holds the string, not whether it is
 * rendered.
 */
function classValuesFor(primitive, file) {
  const markup = markupRegion(file);
  const values = [...classAttributeValues(markup), ...classPropValues(primitive, file, markup)];
  return primitive.composesClasses ? [...values, ...composedClassLiteralValues(file)] : values;
}

/**
 * The class-map values a primitive declares, one value per map, whitespace-joined.
 *
 * Kept OUT of `classValuesFor` on purpose. That function feeds the root-emission clause, and a
 * namespace root belongs on an element the primitive writes rather than in a per-host map — so
 * folding a map into it would let a future entry satisfy the emission clause with a root that
 * only some hosts render. The family reader (`classesWrittenBy`) is the one that needs the map,
 * and it reads it directly.
 *
 * @param {{classMaps?: readonly string[]}} primitive
 * @param {string} file Repository-relative component path.
 * @returns {string[]} One value per declared map.
 */
function classMapValues(primitive, file) {
  return (primitive.classMaps ?? []).map((name) => classMapRegion(file, name));
}

/**
 * Every family class the primitive puts on an element of its own.
 *
 * The class-prop VALUES join the region (issue 1504) for the same reason `classValuesFor` counts
 * them as emission: a class that reaches the DOM through a prop is on an element of the
 * primitive's just as surely as one written beside it. For the two literal forms this is a no-op,
 * because the value is already text inside the markup region — it matters only for a prop passed
 * by SHORTHAND, whose value lives in `<script>` and would otherwise leave the whole trigger,
 * panel and value class set out of the family this gate reads.
 */
function classesWrittenBy(primitive) {
  const written = new Set();
  for (const file of primitive.components) {
    const markup = markupRegion(file);
    const region = [
      markup,
      primitive.composesClasses ? composedClassRegion(file) : '',
      // And every DECLARED class map (issue 1508), for the reason `classMapRegion` states: a
      // family class chosen per host lives in `<script>` in neither of the two regions above.
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

/**
 * The stylesheet's selector list, parsed once.
 *
 * Four primitives times a dozen classes times nine thousand selectors is a hundred thousand regex
 * constructions per run if this is re-derived per lookup, which turned one assertion into eighteen
 * seconds. Nothing mutates the sheet mid-run.
 */
let stylesheetSelectors = null;
const allSelectors = () => (stylesheetSelectors ??= selectorsIn(read(STYLESHEET)));

/**
 * Selectors that name at least one class the primitive writes.
 *
 * A `namespacedFamily` entry adds its family PATTERN as a second reader (issue 1504), because the
 * per-size rungs it composes by interpolation are real family classes that no `written` name
 * matches: without it `.fabricate-picker-popover.fabricate-select-popover-form` would fall
 * outside the population entirely and could be re-rooted at an application with nothing noticing.
 */
function pickerSelectors(written, primitive) {
  const patterns = [...written].map((cls) => new RegExp(`\\.${cls}(?![\\w-])`));
  if (primitive.namespacedFamily) {
    patterns.push(new RegExp(String.raw`\.(?:${primitive.family})(?![\w-])`));
  }
  return allSelectors().filter((selector) => patterns.some((pattern) => pattern.test(selector)));
}

/**
 * A selector belongs to the PRIMITIVE when every class in it, APPLICATION ROOTS ASIDE, is one the
 * primitive writes or one of its own namespace roots. A selector naming anything else is a
 * CALLER's override of the caller's own markup and is exempt.
 *
 * Excluding application roots from the ownership question rather than letting one disqualify a
 * selector is the whole point: the regression this gate exists for ADDS an application root, so
 * an ownership test that counted it would hand the offending selector straight to the exemption.
 * That version of this function passed a control that re-rooted `.manager-travel-option` onto
 * `.fabricate-manager`, which is the exact defect, so the ordering here is load-bearing.
 */
/**
 * A COMPOUND that names a caller's own container by an application root QUALIFIED BY AN
 * ATTRIBUTE — `.fabricate-manager[data-manager-view='essences']` — rather than by a caller CLASS.
 *
 * Without this, `isPrimitiveOwned`'s blanket exclusion of application-root classes leaves
 * NOTHING ELSE in a compound like that one to disqualify the selector once the family class
 * alone remains, so a per-view override would wrongly enter the `owned` set — and then `gated`
 * (which inspects the WHOLE selector, not the ownership-filtered one) DOES see the
 * `fabricate-manager` class the ownership check discarded, and reds on a selector that was never
 * meant to be gate-owned in the first place.
 *
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
    // that component is the one the props are passed TO, and it reads its family entirely out of
    // its own 27 class attributes.
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
  // CLAUSE (c). A `classProps` name is resolved against `classPropsOwner` — the component the
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
  // CLAUSE (d), and the shape is the composed-region clause's above: a reader that stopped
  // finding the map must RED rather than fall back to the two regions that cannot see it,
  // because falling back puts the family exactly where it was before this reader existed —
  // short by one class, with two shipped rules unexamined — while every assertion below goes on
  // reporting the family clean.
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
  // AND THE OTHER TWO REGIONS CANNOT SEE IT, which is the whole reason the reader exists. The
  // composed region truncates at the first `]` in the file after the array opener, and in this
  // component that `]` is `HOST_CLASSES[host]`'s own.
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
  // The button class reaches the DOM through an interpolated binding, so the text
  // `manager-editor-tab-button` appears nowhere after `</script>` except inside the scoped
  // `<style>` block, which `markupRegion` excludes.
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

test('two namespace roots on one element stay disjoint families', () => {
  // CLAUSE (e), NEW AT ISSUE 1509 PHASE 3, and it exists because `RadioCardGroup` is the first
  // entry whose ROOT ELEMENT is another entry's. It renders `<Field as="fieldset">`
  // unconditionally, so one element carries `fabricate-field` and `fabricate-option-cards`
  // together.
  //
  // WHY THAT NEEDS AN INVARIANT RATHER THAN A NOTE. `isApplicationRoot` decides by NAME and by
  // EXACT membership in the entry's own `roots`, so to the `Field` entry `fabricate-option-cards`
  // is an application root and to this entry `fabricate-field` is one. A single selector naming
  // BOTH would therefore be `gated` on both entries at once, and there is no form of it that
  // satisfies either: dropping one root un-roots that family, keeping both gates it.
  //
  // The invariant that makes the pair safe is that no such selector exists, and it holds for a
  // structural reason rather than by luck — the two family patterns cannot match the same class,
  // so neither family's selectors can enter the other's population at all. Both halves are
  // asserted: the measured ZERO, and the pattern disjointness that keeps it zero.
  const field = PRIMITIVES.find((entry) => entry.name === 'Field');
  const optionCards = PRIMITIVES.find((entry) => entry.name === 'RadioCardGroup');
  assert.ok(field && optionCards, 'both entries must exist for this clause to mean anything');

  const namesAny = (selector, entry) => {
    const classes = classesOf(selector);
    const family = new RegExp(`^(?:${entry.family})$`);
    return classes.some((cls) => entry.roots.includes(cls) || family.test(cls));
  };

  // NON-VACUITY FIRST: each family must have a real population in the sheet, or the intersection
  // below is empty because both sides are.
  const fieldSelectors = allSelectors().filter((selector) => namesAny(selector, field));
  const optionSelectors = allSelectors().filter((selector) => namesAny(selector, optionCards));
  assert.ok(
    fieldSelectors.length >= 20,
    `only ${fieldSelectors.length} selectors name the field family, so the intersection below is ` +
      'empty for the wrong reason'
  );
  assert.ok(
    optionSelectors.length >= 40,
    `only ${optionSelectors.length} selectors name the option-cards family, so the intersection ` +
      'below is empty for the wrong reason'
  );

  assert.deepEqual(
    allSelectors().filter(
      (selector) => namesAny(selector, field) && namesAny(selector, optionCards)
    ),
    [],
    'a selector names both `Field`s family and `RadioCardGroup`s. The two are co-rooted on ONE ' +
      'element — the fieldset — and each root is an APPLICATION root by name to the other entry, ' +
      'so this selector is `gated` on both of them and no re-rooting form of it exists. Write it ' +
      'against whichever family actually owns the declaration.'
  );

  // AND THE PATTERNS THEMSELVES CANNOT OVERLAP, which is what keeps the zero above a property of
  // the entries rather than of today's sheet.
  const fieldFamily = new RegExp(`^(?:${field.family})$`);
  const optionFamily = new RegExp(`^(?:${optionCards.family})$`);
  for (const anchor of optionCards.anchors) {
    assert.ok(
      !fieldFamily.test(anchor),
      `\`${anchor}\` matches the field family pattern, so an option-cards rule can enter the ` +
        'field entry`s population and be judged by it'
    );
  }
  for (const anchor of field.anchors) {
    assert.ok(
      !optionFamily.test(anchor),
      `\`${anchor}\` matches the option-cards family pattern, so a field rule can enter this ` +
        'entry`s population and be judged by it'
    );
  }
});

test('the status card`s root stays off every rule the switch owns', () => {
  // CLAUSE (f), NEW AT ISSUE 1509 PHASE 4, and it is the pre-agreement issue 1508 recorded when
  // it rooted `StatusToggle` at `fabricate-toggle`.
  //
  // `ToggleCard` COMPOSES that switch: the card owns its glyph, its title, its sub-line and its
  // own state classes, and the switch owns the track, the knob and the reading. So the two
  // families sit on NESTED elements rather than on one — which is the opposite of `Field` and
  // `RadioCardGroup` above — and the hazard is the same one from the other direction.
  // `isApplicationRoot` decides by NAME and by EXACT membership in the entry's own `roots`, so
  // `.fabricate-toggle-card .manager-status-toggle-track` would be GATED on the `StatusToggle`
  // entry: a rule about that primitive's chrome, rooted at a class that is an application root to
  // it, with no re-rooting form that satisfies both entries.
  //
  // The invariant is that no such selector exists, and it is asserted in BOTH halves — the
  // measured zero, and the pattern disjointness that keeps it zero. Deepening an override at the
  // CARD's own root is the corollary `openspec/specs/design-system/spec.md` states for this case,
  // and it is what the sheet does: the card's `.is-info.is-on .manager-recipe-status-icon` tone
  // reaches the GLYPH, which is the card's own element, and never the switch.
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

  // AND THE PATTERNS THEMSELVES CANNOT OVERLAP, which is what makes the zero above a property of
  // the entries rather than of today's sheet. Stated over the anchors of both, in both
  // directions, exactly as the co-rooting clause above states it for `Field`.
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

  // DOES NOT FIRE: a bare application root with no attribute is the ORDINARY case, and stays
  // excluded from ownership consideration by `isApplicationRoot` alone.
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

/**
 * The fixture half, and it is not hypothetical: re-rooting the travel family broke
 * `recipe-studio-font-size.test.js`, whose Playwright page hand-writes a copy of the popover and
 * measured a 14px option meta against the 9.92px the real one renders. A fixture that copies the
 * primitive's markup is a hand-maintained mirror, and a mirror missing the root MEASURES SOMETHING
 * ELSE while still reporting on the primitive by name. Issue 1470 hit it twice more, in
 * `manager-layout.test.js`, where two hand-written copies of the icon picker's trigger omitted the
 * picker's own root element entirely.
 *
 * ── THE ONE EXEMPTION, AND WHY IT IS NOT A LOOPHOLE ─────────────────────────────────────────────
 * The premise above is about a mirror that gets RENDERED and MEASURED. A source-contract detector
 * fixture is the opposite: it is a string handed to a regex to prove the detector finds a RAW,
 * unconverted site, and it is deliberately non-conforming because depicting the defect is its
 * entire job. Namespacing one would make it depict a CONVERTED site, and the clause it feeds would
 * stop discriminating — a guard weakened to satisfy another guard.
 *
 * So the exemption is by FILE and pinned by EXACT COUNT: it cannot grow silently, and a file that
 * starts rendering its fixtures rather than pattern-matching them fails here until someone says so.
 *
 * TWO counts, because the two clauses below count different things over the same fixture. The
 * attribute clause sees the three `class="…"` attributes that name a ROOT anchor; the ancestry
 * clause sees four ELEMENTS, because one of the fixture's descendants (`manager-travel-picker-value`)
 * carries a family class without being a root itself. Generalising the gate moved the second number,
 * so it is recorded rather than reconciled away.
 *
 * `FIXTURE_ALLOWLIST` (issue 1502, `tests/helpers/managerButtonFixtureAllowlist.js`) is a SECOND,
 * separate exemption ledger both clauses below also check, for the SAME reason but a different
 * shape of fixture: a `<ManagerButton>` call site the product deliberately renders unconverted (a
 * negative control, or a still-independent `ArmedDangerButton` consumer) rather than a detector
 * string. It is keyed by the fixture's EXACT `class` attribute rather than by primitive name, so
 * it is imported and cross-checked rather than folded into this array.
 */
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
 * The subset of `FIXTURE_ALLOWLIST` that is ROOT-LESS, which is the only subset these two clauses
 * can be asked about.
 *
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
 * A fixture is a STRING, so this is a tag scanner rather than a parser: it walks `<tag …>` and
 * `</tag>` in order and keeps a stack. It is deliberately forgiving — an unmatched close tag pops
 * to the nearest open one of that name and is otherwise ignored — because these strings are HTML
 * FRAGMENTS spliced together through template placeholders, not documents.
 *
 * @param {string} text A JavaScript source file that contains fixture markup.
 * @returns {Array<{name: string, classes: string[], ancestry: string[]}>} One entry per open tag.
 */
/**
 * Every `class="…"` value that is actually ON AN ELEMENT TAG in fixture text.
 *
 * Bounded to a single `<tag …>` span — `[^<>]*`, which cannot cross a `<` or `>` — rather than
 * to the raw `[^"]*` the attribute clause used to run unbounded: an UNTERMINATED prefix such as
 * a message literal's `class="fabricate-manager` swallows every character up to the NEXT `"`
 * anywhere later in the file (742 of them, in one measured case) once nothing stops it at the
 * tag boundary. Bounding the outer match to one tag first makes that impossible: whatever
 * happens to the inner `[^"]*` inside it, it cannot reach past the `>` that ends the tag it
 * started in.
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
      const classes = (attributes.match(/class="([^"]*)"/) ?? [, ''])[1].split(/\s+/).filter(Boolean);
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
  // A detector fixture that gains an attribute, loses one, or gets namespaced silently is a
  // permission nobody is exercising — which is how an allowlist entry outlives its reason.
  for (const entry of DETECTOR_FIXTURE_EXEMPTIONS) {
    const hits = exemptHits.get(`${entry.file}|${entry.primitive}`) ?? 0;
    assert.equal(
      hits,
      entry.attributeCount,
      `${entry.file} is exempted for ${entry.attributeCount} non-namespaced fixture attribute(s) ` +
        `against ${entry.primitive} and has ${hits}. Reason on record: ${entry.why}`
    );
  }

  // The ManagerButton unconverted-probe exemptions are a SEPARATE, larger ledger, imported from
  // `managerButtonFixtureAllowlist.js` rather than hand-listed a second time here (issue 1502),
  // and narrowed by `ROOT_LESS_FIXTURE_EXEMPTIONS` to the entries that can actually register a
  // hit — the rest carry a family root and are never offenders. Cross-checked by both TOTAL and
  // per-entry count, so a fixture that drifts from its recorded `classes` string is as loud as
  // one removed outright.
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
  // THE ATTRIBUTE CLAUSE ABOVE ONLY SEES A COPY OF THE ROOT ELEMENT, and the mirrors issue 1470
  // had to repair did not copy one. Two in `manager-layout.test.js` wrote the picker's TRIGGER
  // straight into a caller's container, omitting the picker's own root element altogether, and one
  // in `recipe-studio-font-size.test.js` — left behind by issue 1464 — dropped the primitive's
  // classes from the progressive stage row's picker while keeping the portrait inside it. Each
  // rendered a copy no rule could reach and measured its intrinsic size, while still reporting on
  // the primitive by name.
  //
  // So the question is ANCESTRY, not co-location: every element carrying a class the primitive
  // writes must have one of the primitive's namespace roots on itself or on an ancestor. That is
  // what the browser asks, and it is the only form of the question a file-wide substring search
  // cannot be talked out of — one conforming fixture elsewhere in the same file would satisfy that
  // one while the broken copy went on measuring a default.
  const sources = collectWorkingTreeSources(['tests'], ['.js']);
  // Comment-blanked for the same reason as the attribute clause above, and by the SAME function,
  // so the two clauses cannot disagree about what counts as fixture markup versus prose.
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
  // The SPLIT ITSELF, guarded rather than narrated: most of `FIXTURE_ALLOWLIST` carries a family
  // root since issue 1502 and only the root-less remainder can be an offender here, so this gate
  // is expected to hold over a STRICT subset, by entry and by attribute alike. A filter that
  // stopped narrowing — a renamed root, a rewritten predicate — would make the two counts equal
  // and silently re-widen the ledger back to the whole allowlist, with every clause below still
  // green, which is why both totals are imported and compared rather than assumed.
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

  // A PRE/POST element total for one file, so a lossy stripper reds instead of passing quietly
  // (`manager-layout.test.js` is the file issue 1470 already caught this on once). PRE is the
  // family-relevant population a RAW, unblanked scan finds; POST is the same population after
  // blanking. The two need not agree in either direction, and today POST is the HIGHER of the
  // pair (53 against 49): this file's docblocks illustrate the very markup they describe
  // (`<style>`, a probe's own `<button class="…">`), which blanking correctly removes, while a
  // comment's own stray apostrophe can break the RAW scan's quote pairing and hide real markup
  // that blanking then restores. What must NOT happen is a MATERIAL drop: `stripComments` blanks
  // a comment's characters to spaces rather than deleting them, which is what keeps a quote
  // character OUTSIDE a comment exactly where it was; a stripper that instead deletes a comment's
  // own stray apostrophe ("it's", "primitive's")
  // shifts the text after it and can corrupt this scanner's own `"[^"]*"|'[^']*'` quote pairing
  // well past the comment, dropping real markup along with the prose.
  const layoutFile = 'tests/components/manager-layout.test.js';
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
  const rawLayoutElements = familyRelevant(sources[layoutFile]);
  const blankedLayoutElements = familyRelevant(blanked.get(layoutFile));
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
      // GUARDED BY `</script>`, exactly as `markupRegion` guards its own reader, and the guard
      // is not cosmetic: without it this clause reads a `<style>` NAMED IN DOCBLOCK PROSE as a
      // scoped block. It held only while no such docblock also quoted a selector — issue 1508's
      // `Field` docblock quotes `.fabricate-manager .manager-field > span` while explaining that
      // the component deliberately has NO scoped block, and the clause reported the prose as an
      // application-rooted scoped selector. A real scoped block always follows `</script>`, so
      // the guard can never hide one.
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
    `only ${blocks} of the twenty component files hold a REAL scoped \`<style>\` block — one ` +
      'opened after `</script>`. FIVE do today: `SearchablePopover`, `ManagerColorPopover` and ' +
      '— since issue 1509 put entries on them — `EditorTabs`, whose block is the two ' +
      '`:global(.manager-editor-tab-button.is-danger)` rules that tint a failing validation ' +
      'tab, `RadioCardGroup`, whose block is the one `.manager-resolution-option-meta` ' +
      'rule that types the inline second datum on an option`s name line, and `ItemDropZone`, ' +
      'whose block is the two-rule MISSING treatment for a link whose document has been deleted ' +
      'and the mono address line under the name. All three blocks STAY ' +
      'where they are: a scoped block is injected unlayered and this sheet is ' +
      'loaded into `layer(modules)`, so moving those rules into the sheet would be a layer ' +
      'change and would move a frame. The rest name a `<style>` only in DOCBLOCK PROSE, ' +
      'usually to say they deliberately have none, and the `</script>` guard above is what ' +
      'keeps that prose out of this clause. A lower number means the reader has stopped ' +
      'finding the real blocks and this clause examined nothing.'
  );
});
