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
 * Eight shared primitives, each with the namespace roots it writes and the class family it owns.
 *
 * The first five PORTAL a panel and so need one root on each side of the portal; the last three
 * (issue 1502) COMPOSE their family in `<script>` rather than writing it in markup and carry one
 * root each — `ManagerButton`, `IconButton` and `Pagination`. A `composesClasses: true` entry
 * opts into reading the `const classes = $derived([…])` array literal (`composedClassRegion`)
 * ALONGSIDE the ordinary markup region, because `class={classes}` is an identifier rather than a
 * `class="…"` string or a `` class={`…`} `` template, so the ordinary markup-only extractors find
 * nothing for either button primitive on their own.
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
    // Measured today: 2 written (the array holds no other unconditional family literal), 84
    // family selectors, 29 owned — 17 caller-ancestor exempt, 38 belong to caller CLASS
    // compounds (the twelve `SearchablePopover` `triggerClass` carriers and the
    // `managerHeaderActionClass` builder's seven equalities, each naming a caller trigger class
    // beside the family — issue 1502's Phase 1b) — 84 - 17 - 38 = 29.
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
    // Measured today: 1 written, 21 family selectors, 15 owned — 4 caller-ancestor exempt, 1
    // belongs to Pagination's own family (`:13792`, its ancestor is the primitive's OWN class,
    // not a caller's), 1 belongs to a caller CLASS compound
    // (`.manager-icon-button.manager-recipe-step-nav`) — 21 - 4 - 1 - 1 = 15.
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
    // Written inline on the root `<section>` (`Pagination.svelte:177`) — this component composes
    // nothing, so `composesClasses` is neither needed nor set.
    // Measured today: 5 written (root class aside), 17 family selectors, 6 owned — 6
    // caller-container exempt plus 4 caller-container-by-ATTRIBUTE exempt (the
    // `[data-manager-view=…]` per-view overrides — see the application-root-attribute clause
    // below) plus 1 belonging to IconButton's own family (`:13792`) — 17 - 6 - 4 - 1 = 6.
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
    // Measured at this head: 19 written, 33 family selectors, 32 owned. The one exemption is
    // `.fabricate-manager .fab-bulk-edit-select .fabricate-select-trigger`, the bulk panel's own
    // full-width rule — a caller's override of the caller's own wrapper class, which is what the
    // exemption is for. The floors sit a little under those counts, as the entries above do.
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

  // NON-VACUITY: the clause actually reaches Pagination's four shipped per-view overrides in
  // `styles/fabricate.css`, not just the synthetic control above.
  const written = classesWrittenBy(pagination);
  const family = pickerSelectors(written, pagination);
  const callerContainerSelectors = family.filter((selector) =>
    compoundsOf(selector).some((compound) => namesCallersOwnContainer(compound, pagination))
  );
  assert.ok(
    callerContainerSelectors.length >= 4,
    `only ${callerContainerSelectors.length} Pagination selectors were recognised by the ` +
      'application-root-attribute clause, against a floor of 4 — the four `[data-manager-view=…] ' +
      '.manager-pagination` overrides. A lower number means the clause has stopped recognising ' +
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
    attributes >= 54,
    `only ${attributes} fixture class attributes copy a primitive's root markup, against a floor ` +
      'of 54. A lower number means the scan is not reading the fixtures and the assertion below ' +
      'holds over nothing.'
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
    elements >= 83,
    `only ${elements} fixture elements copy a shared picker's markup, against a floor of 83. A ` +
      'lower number means the tag scanner has stopped reading the fixtures and the assertion ' +
      'below holds over nothing.'
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
  // blanking. POST is EXPECTED to be somewhat lower than PRE here — this file's docblocks
  // illustrate the very markup they describe (`<style>`, a probe's own `<button class="…">`), and
  // blanking correctly removes those phantom elements from the count. What must NOT happen is a
  // MATERIAL drop beyond that: `stripComments` blanks a comment's characters to spaces rather
  // than deleting them, which is what keeps a quote character OUTSIDE a comment exactly where it
  // was; a stripper that instead deletes a comment's own stray apostrophe ("it's", "primitive's")
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
      const styleAt = source.lastIndexOf('<style>');
      if (styleAt === -1) continue;
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
    blocks >= 2,
    `only ${blocks} of the nine component files carry a scoped <style> block. Two do today ` +
      '(`SearchablePopover` and `ManagerColorPopover`); a lower number means the reader has ' +
      'stopped finding them and this clause examined nothing.'
  );
});
