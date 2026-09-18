/**
 * System scope: the component browser, its bulk sets, the component editor and its complications.
 */

import { BULK_DELETE_CARD_PATTERN, BULK_EDIT_CHROME_PATTERN } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-components-normal',
    label: 'Manager — Components normal',
    smokeLabels: ['manager-components-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    // Issue 1371 r13-list — the list opens on its first drawn row (maintainer ruling M14).
    expectContained: [
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row[aria-current="true"]',
      },
      {
        container: 'aside.manager-inspector',
        target: '[data-component-inspector-kicker]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    // Issue 1371 r18-colour — the row badges in the essence's own colour (maintainer ruling M29).
    id: 'manager-components-essence-chips',
    label: 'Manager — Components essence chips',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-essence-filter]', select: '__any' },
      // OPEN A CARRYING ROW, through its identity button rather than through the chip: the list
      // opens on its first drawn row before the filter narrows it (M14), and that row may carry
      // nothing, so the inspector's run below is only drawn once a tinted row is the selection.
      { selector: '.manager-component-row:has([data-chip-tint]) .manager-component-identity' },
    ],
    expectView: 'components',
    expectSelector: '.manager-component-row [data-essence-chip][data-chip-tint]',
    expectContained: [
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row [data-essence-chip][data-chip-tint]',
      },
      {
        container: 'aside.manager-inspector',
        target: '[data-component-essence-list] [data-essence-chip][data-chip-tint]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/components\/EssenceChip\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/components\/ComponentRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/components\/ComponentBrowserInspector\.svelte$/,
    ],
  }),
  managerCase({
    // The inheriting rules editor (issue 1371, round 2), and it is the only state that renders the
    // category note in its info tone — the pixel behind E-4's `tone: 'info'`, which round 1 shipped
    // as a unit-tested constant no frame could contain.
    id: 'manager-component-edit-inheriting',
    label: 'Manager — Component edit inheriting',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-search] input', fill: 'Iron Ingot' },
      { selector: '[data-component-edit]' },
    ],
    expectView: 'component-edit',
    // The category control is one select now, not an `InheritRow` (issue 1371, parity round 4,
    // rebuild-spec D4.1 / gap-list rows 132-133): the reference draws a single full-width select
    // whose first option is `Inherit from world · {category}`, with the state note directly under
    // it — no separate toggle, no second `Category` label, no floated head control.
    expectSelector: '[data-component-edit-category]',
    expectContained: [
      // THE INFO-TONE BRANCH, which is this case's whole subject: `inherited` is the state
      // `sm-iron-ingot` is in, and `manager-component-edit-normal` opens a row that overrides, so
      // it photographs the warning branch and can never show this one.
      {
        container: 'main.manager-component-edit-main',
        target: '[data-component-edit-category-note="inherited"]',
      },
      // And the ONE identity callout the two stacked cards collapsed into (D3).
      {
        container: 'main.manager-component-edit-main',
        target: '[data-component-edit-section="identity"]',
      },
      // The essence section's inherit choice (issue 1371 r18-entry, maintainer ruling M31).
      {
        container: '[data-component-edit-section="essences"]',
        target: '[data-scoped-inherit-toggle="essences"]',
      },
      {
        container: '[data-component-edit-section="essences"]',
        target: '[data-component-edit-essence-note="inherited"]',
      },
    ],
    // THE SWITCH IS A NEW CONTROL ON THIS CARD (issue 1371 r18-entry), so it owns a real pointer
    // hit: an inherit row overlapped by the card head or the grid would be present in the DOM,
    // correct in every mounted assertion and unclickable on screen, and only `elementFromPoint`
    // at its centre can tell those apart.
    expectCenterHit: '[data-scoped-inherit-toggle="essences"]',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    // The rules editor's read-only world tag CARD (issue 1371, round 3), which no frame reached.
    id: 'manager-component-edit-world-tags',
    label: 'Manager — Component edit world tags',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-search] input', fill: 'Coal' },
      { selector: '[data-component-edit]' },
      { selector: '[data-component-edit-section="world-tags"]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector: '[data-component-edit-section="world-tags"]',
    expectContained: [
      // The count note is contained by the CARD, not by the world-tag group, and the difference is
      // what this pair was getting wrong.
      {
        container: '[data-component-edit-section="tags"]',
        target: '[data-component-edit-world-tags-note]',
      },
      // The chip states ARE the group's own subject, and stay scoped to it: `bulk` is muted in
      // this system and `fuel` is not, so a card painting one treatment for both fails here.
      {
        container: '[data-component-edit-section="world-tags"]',
        target: '[data-component-edit-world-tag="bulk"]',
      },
      {
        container: '[data-component-edit-section="world-tags"]',
        target: '[data-component-edit-world-tag="fuel"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    // The widened membership cohort (issue 1371, round 2): the ghost rows, their Add, and the
    // toolbar counting the widened set.
    id: 'manager-components-world-cohort',
    label: 'Manager — Components world cohort',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      // The cohort switch is A `SegmentedControl`, not A `<select>` (issue 1371, parity round 4,
      // rebuild-spec C6): the reference draws two inline segments and the shipped control now
      // renders one `<label>` per option carrying `data-component-membership-option="<value>"`
      // (`data-component-membership-filter` is on the track, and stamps `true`, not a value).
      { selector: '[data-component-membership-option="all"]' },
      // Scroll to the cohort, because it sits below every member row: the lab world's smithing
      // system holds a handful of components and the world corpus holds sixty-five, so the ghost
      // list starts well past the fold and an unscrolled frame photographs the member rows this
      // case is not about.
      { selector: '.manager-component-row[data-component-member="false"]', scroll: true },
    ],
    expectView: 'components',
    expectSelector: '.manager-component-row[data-component-member="false"]',
    expectContained: [
      // A row, not the whole `<ul>`.
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row[data-component-member="false"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/],
  }),
  managerCase({
    // The `Add from catalogue` picker, open AND multi-selected (issue 1371, M9).
    id: 'manager-components-add-from-catalogue',
    label: 'Manager — Components add from catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-add-from-catalogue]' },
      // Two rows ticked, by state rather than by ID.
      { selector: '[data-component-add-from-catalogue-row]:not(.is-picked)' },
      { selector: '[data-component-add-from-catalogue-row]:not(.is-picked)' },
    ],
    expectView: 'components',
    expectSelector: '[data-component-add-from-catalogue-dialog]',
    kinds: ['manager', 'components'],
    // The picker's own file, AND not `ManagerModal.svelte`.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ComponentAddFromCatalogueDialog\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit',
    label: 'Manager — Components bulk edit',
    smokeLabels: ['manager-components-bulk-edit'],
    reaches: 'exact',
    query: {},
    // The staged face. `data-component-select` sits on a visually hidden input, so the click target
    // is its wrapping `<label>`; two rows, because a one-row selection reads as an accident.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      { selector: '[data-component-bulk-essences] [data-stepper-increment]' },
      // The tag inset is a PAGED window over the system's tags (issue 1371 r16-cat converged both
      // panels on one `BulkStagingInset`), so `ore` and `ingot` sit past page one: reach each
      // through the inset's own search well, as the world bulk case reaches its rows, then clear
      // the well so the frame shows the resting inset under the staged chip run.
      { selector: '[data-bulk-inset-search="tags"]', fill: 'ore' },
      { selector: '[data-bulk-tag="ore"]' },
      { selector: '[data-bulk-inset-search="tags"]', fill: 'ingot' },
      { selector: '[data-bulk-tag="ingot"]' },
      { selector: '[data-bulk-tag="ingot"]' },
      { selector: '[data-bulk-inset-search="tags"]', fill: '' },
      { selector: '[data-component-bulk-category-option="Refined"]' },
    ],
    expectView: 'components',
    expectSelector: '[data-component-bulk-panel]',
    // The three staged axes, asserted (issue 1371 r17-b, quality N4): a category radio or tag
    // tri-state that stopped staging on this panel would otherwise still publish a green frame.
    expectContained: [
      {
        container: '[data-component-bulk-panel]',
        target:
          '[data-component-bulk-category-option="Refined"][data-component-bulk-option-state="on"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target: '[data-component-bulk-tag-chip="ore"][data-component-bulk-tag-chip-state="add"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target:
          '[data-component-bulk-tag-chip="ingot"][data-component-bulk-tag-chip-state="remove"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target: '[data-component-bulk-essences-staged="true"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      BULK_EDIT_CHROME_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-delete-idle',
    label: 'Manager — Components bulk delete idle',
    reaches: 'beyond',
    smokeLabels: [],
    // The unarmed face of the set remove (issue 1129; the reference's `Remove N components from
    // {system}…` leg in the shell's dock since issue 1371 r16-list, M23), and the frame that
    // photographs its consequence note.
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ingot"])' },
      { selector: '[data-component-bulk-remove]', scroll: true },
    ],
    expectView: 'components',
    // Unarmed is the state under test, and `data-armed="false"` is what separates this frame from
    // its armed twin below — an `expectSelector` naming only the card would pass on either.
    expectSelector: '.fabricate-manager [data-arm-token="delete-components"][data-armed="false"]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      /^src\/utils\/recipeComponentReferences\.js$/,
      BULK_EDIT_CHROME_PATTERN,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-delete-armed',
    label: 'Manager — Components bulk delete armed',
    reaches: 'beyond',
    smokeLabels: [],
    // The armed half of the set remove (issue 1129; in the dock since issue 1371 r16-list), the
    // twin of `manager-essences-bulk-delete-armed`.
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      // The BUTTON, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control
      // it arms, so this cannot drift onto a wrapper the way a class selector could.
      { selector: '[data-arm-token="delete-components"]' },
    ],
    expectView: 'components',
    // Armed is a STATE, and a frame that merely re-photographed the idle button would be
    // indistinguishable from the bulk-edit case above.
    expectSelector: '.fabricate-manager [data-arm-token="delete-components"][data-armed="true"]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      /^src\/utils\/recipeComponentReferences\.js$/,
      BULK_EDIT_CHROME_PATTERN,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit-unstaged',
    label: 'Manager — Components bulk edit unstaged',
    smokeLabels: ['manager-components-bulk-edit-unstaged'],
    reaches: 'exact',
    query: {},
    // The pristine face of the same panel: a selection and nothing staged, which is the only
    // evidence of the "leave unchanged" chips and the inert Apply.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      BULK_EDIT_CHROME_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-description-before',
    label: 'Manager — Components description before',
    smokeLabels: ['manager-components-description-before'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '.manager-component-toolbar input[type="search"]', fill: 'Ember Quenching Oil' },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-raw"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-description-repaired',
    label: 'Manager — Components description repaired',
    smokeLabels: ['manager-components-description-repaired'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-toolbar input[type="search"]',
        fill: 'Rimefrost Quenching Oil',
      },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-repaired"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-description-ingested',
    label: 'Manager — Components description ingested',
    smokeLabels: ['manager-components-description-ingested'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '.manager-component-toolbar input[type="search"]', fill: 'Ashfall Reagent Case' },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-ingested"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-component-edit-normal',
    label: 'Manager — Component edit normal',
    smokeLabels: ['manager-component-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }, { selector: '[data-component-edit]' }],
    expectView: 'component-edit',
    // THE SHARED RAIL, IN THIS FRAME (issue 1371 r18-list, maintainer ruling M27): the editor
    // renders the world entry's `How players see it` rail at the system scope, so the frame must
    // show the rail's scope sentence and its inventory tile beside the form — the two regions a
    // rail of the editor's own would draw differently, and the reason the ruling was made.
    expectContained: [
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-scope-note]',
      },
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-tile]',
      },
    ],
    kinds: ['manager', 'components'],
    // The three complication components are claimed by the four `*-complications-*` and
    // `*-salvage-stage-strip` cases below, not here (issue 1286).
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    // The other consumer of the shared frame, stacked (issue 1371 r19-entry2).
    id: 'manager-component-edit-stacked',
    label: 'Manager — Component edit stacked',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-edit]' },
      { selector: '[data-component-edit-tab="rules"]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector: 'main.manager-component-edit-main',
    expectLayout: {
      containerSelector: '.fabricate-manager',
      gridSelector: 'main.manager-component-edit-main',
      expectedTracks: 1,
    },
    expectCenterHit: '[data-component-edit-tab="rules"]',
    expectContained: [
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-tile]',
      },
    ],
    position: { width: 980, height: 860 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-component-edit-salvage',
    label: 'Manager — Component edit salvage',
    smokeLabels: ['manager-component-edit-salvage'],
    // The routed salvage authoring body: per-component result groups plus a populated
    // outcome-routing table (`[data-salvage-routing]`) and the DC override.
    reaches: 'exact',
    query: { system: 'lab-runework' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="rw-slag"] [data-component-edit]',
      },
      { selector: '[data-salvage-routing]', scroll: true },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    // The shared subject check-modifier picker does not render here, and this list used to claim it
    // did (issue 1095).
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-component-edit-salvage-off',
    label: 'Manager — Component edit salvage off',
    smokeLabels: ['manager-component-edit-salvage-off'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-chainmail"] [data-component-edit]',
      },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-component-edit-salvage-simple',
    label: 'Manager — Component edit salvage simple',
    smokeLabels: ['manager-component-edit-salvage-simple'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-longsword"] [data-component-edit]',
      },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),

  // Five frames, and every one of them is on `lab-herbalism` because no other lab system can draw
  // any of them: `ComponentComplicationsSection` gates itself on "some activity in this system
  // resolves progressively", and herbalism is the world's only progressive system on any axis.
  managerCase({
    id: 'manager-component-complications-empty',
    label: 'Manager — Component complications empty',
    // The section's empty state, which is `EmptyState`'s new `inline` variant (issue 1286) and
    // exists on no other screen: the stack flips to a row and the 46px icon tile is released into a
    // bare glyph, neither of which `is-compact` does.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="hb-empty-vial"] [data-component-edit]',
      },
      { selector: '[data-complications-section]', scroll: true },
    ],
    expectView: 'component-edit',
    // The empty state ITSELF, not merely the section: a component that silently acquired a
    // complication would still render the section and would publish the populated list under a
    // case whose whole subject is that there is nothing to list.
    expectSelector: '.fabricate-manager [data-complications-section] [data-complications-empty]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/EmptyState\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-collapsed',
    label: 'Manager — Component complications collapsed',
    // The resting list: two summary rows, both closed.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-mortar-dust"] [data-component-edit]',
      },
      { selector: '[data-complications-section]', scroll: true },
    ],
    expectView: 'component-edit',
    // A row, and specifically the authoring variant.
    expectSelector:
      '.fabricate-manager [data-complications-section] [data-complication-row="authoring"]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-expanded',
    label: 'Manager — Component complications expanded',
    // The open row, which is where the section's whole authoring surface lives: the identity strip,
    // the Applies-to chips, and the When and Then cards with six `ComplicationEffectRow` instances
    // between them.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-mortar-dust"] [data-component-edit]',
      },
      { selector: '[data-complication="hb-comp-dust-cloud"] [data-complication-disclosure]' },
      // The LAST row of the When card, so `scrollIntoViewIfNeeded` — which lands its anchor near
      // the bottom edge — puts the whole card and the identity strip above it in one frame.
      { selector: '[data-complication-roll-condition]', scroll: true },
    ],
    expectView: 'component-edit',
    // `aria-expanded`, not merely the presence of the detail: a disclosure that silently stopped
    // toggling would leave the row closed and publish the collapsed frame under this name.
    expectSelector:
      '.fabricate-manager [data-complication="hb-comp-dust-cloud"] ' +
      '[data-complication-disclosure][aria-expanded="true"]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationEffectRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-salvage-stage-strip',
    label: 'Manager — Component complications salvage stage strip',
    // The read-only strip under a progressive salvage stage row.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-cracked-alembic"] [data-component-edit]',
      },
      { selector: '[data-salvage-stage-complications]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector:
      '.fabricate-manager [data-salvage-stage-complications] [data-complication-row="readonly-gm"]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-complications-stage-strip',
    label: 'Manager — Recipe complications stage strip',
    // The Recipe Studio's counterpart, and the reason it is a separate frame rather than the same
    // one photographed twice: the two strips are deliberately asymmetric.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-grind"]' },
      { selector: '#recipe-tab-results' },
      { selector: '[data-recipe-result-complications]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager [data-recipe-result-complications] [data-complication-row="readonly-gm"]',
    kinds: ['manager', 'recipes', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeResultItemRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
    ],
  }),
]);
