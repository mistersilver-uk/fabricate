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
      /^src\/ui\/model\/(?:component|entity)BrowserModel\.js$/,
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
      // Open a carrying row through its identity button: the list opens on its first drawn row, which may carry nothing.
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
    // The inheriting rules editor (issue 1371): the only state that renders the category note in its info tone.
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
    // The category control is one select, not an `InheritRow` (issue 1371): its first option inherits, with the note under it.
    expectSelector: '[data-component-edit-category]',
    expectContained: [
      // The info-tone branch: `sm-iron-ingot` inherits, while `manager-component-edit-normal` opens a row that overrides.
      {
        container: 'main.manager-component-edit-main',
        target: '[data-component-edit-category-note="inherited"]',
      },
      // And the one identity callout the two stacked cards collapsed into (D3).
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
    // The switch is a new control on this card (issue 1371), so it owns a real pointer hit rather than a DOM assertion.
    expectCenterHit: '[data-scoped-inherit-toggle="essences"]',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    // The rules editor's read-only world tag card (issue 1371, round 3), which no frame reached.
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
      // The count note is contained by the card, not by the world-tag group, which is what this pair was getting wrong.
      {
        container: '[data-component-edit-section="tags"]',
        target: '[data-component-edit-world-tags-note]',
      },
      // The chip states stay scoped to the group: `bulk` is muted in this system and `fuel` is not.
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
    // The widened membership cohort (issue 1371): the ghost rows, their Add, and the toolbar counting the widened set.
    id: 'manager-components-world-cohort',
    label: 'Manager — Components world cohort',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      // The cohort switch is a `SegmentedControl` (issue 1371): one `<label>` per option, and the track stamps `true`.
      { selector: '[data-component-membership-option="all"]' },
      // Scroll to the cohort: it sits below every member row, so an unscrolled frame photographs the wrong rows.
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
    // The `Add from catalogue` picker, open and multi-selected (issue 1371, M9).
    id: 'manager-components-add-from-catalogue',
    label: 'Manager — Components add from catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-add-from-catalogue]' },
      // Two rows ticked, by state rather than by id.
      { selector: '[data-component-add-from-catalogue-row]:not(.is-picked)' },
      { selector: '[data-component-add-from-catalogue-row]:not(.is-picked)' },
    ],
    expectView: 'components',
    expectSelector: '[data-component-add-from-catalogue-dialog]',
    kinds: ['manager', 'components'],
    // The picker's own file, and not `ManagerModal.svelte`.
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
    // The staged face. `data-component-select` sits on a hidden input, so the click target is its `<label>`; two rows, because one reads as an accident.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      { selector: '[data-component-bulk-essences] [data-stepper-increment]' },
      // The tag inset pages over the system's tags (issue 1371), so each tag is reached through its search well and the well then cleared.
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
    // The three staged axes asserted: a radio or tri-state that stopped staging would otherwise publish a green frame.
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
    // The unarmed face of the set remove (issue 1129), and the frame that photographs its consequence note.
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ingot"])' },
      { selector: '[data-component-bulk-remove]', scroll: true },
    ],
    expectView: 'components',
    // Unarmed is the state under test, and `data-armed="false"` is what separates this frame from its armed twin.
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
    // The armed half of the set remove (issue 1129), the twin of `manager-essences-bulk-delete-armed`.
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      // The button, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control it arms.
      { selector: '[data-arm-token="delete-components"]' },
    ],
    expectView: 'components',
    // Armed is a state; a frame re-photographing the idle button would be indistinguishable from the case above.
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
    // The pristine face: a selection and nothing staged, the only evidence of the leave-unchanged chips and inert Apply.
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
    // The shared rail in this frame (issue 1371): the editor renders the world entry's rail at system scope.
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
    // The three complication components are claimed by the four complication and stage-strip cases below (issue 1286).
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
    // The routed salvage authoring body: per-component result groups, a populated routing table and the DC override.
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
    // The shared subject check-modifier picker does not render here, and this list used to claim it did (issue 1095).
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

  // Five frames, all on `lab-herbalism`: the section gates on progressive resolution, which only herbalism has.
  managerCase({
    id: 'manager-component-complications-empty',
    label: 'Manager — Component complications empty',
    // The section's empty state is `EmptyState`'s `inline` variant (issue 1286), which exists on no other screen.
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
    // The empty state itself: a component that acquired a complication would publish the populated list under this name.
    expectSelector: '.fabricate-manager [data-complications-section] [data-complications-empty]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
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
    // The open row, where the section's whole authoring surface lives: identity strip, Applies-to chips, When and Then cards.
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
      // The last row of the When card, so the scroll puts the whole card and the identity strip in one frame.
      { selector: '[data-complication-roll-condition]', scroll: true },
    ],
    expectView: 'component-edit',
    // `aria-expanded`, not merely the detail: a disclosure that stopped toggling would publish the collapsed frame.
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
    // The Recipe Studio's counterpart, kept as a separate frame because the two strips are deliberately asymmetric.
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
