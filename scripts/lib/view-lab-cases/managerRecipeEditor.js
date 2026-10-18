/**
 * System scope: the recipe editor tabs, its crafting-modifier states and the Access route.
 */

import {
  ACCESS_ROSTER_SEARCH_MISS_TERM,
  ANCHORED_POPOVER_SOURCES,
  CHECKS_ROUTE_MODEL_PATTERN,
  PROGRESSIVE_STAGE_LIST_MATCH,
  REQUIREMENT_SUGGESTION,
  STAGE_COMPLICATION_LIST_MATCH,
  TYPEAHEAD_COMBOBOX_SOURCE,
} from './caseConstants.js';
import { managerCase } from './caseFactories.js';

/** A component row's name field: the two other kinds that share the field mark themselves. */
const COMPONENT_NAME_FIELD =
  '.manager-recipe-option-name-field:not([data-recipe-option-essence]):not([data-recipe-option-currency])';

/** A recipe ingredient tag row's catalogue, opened over the herbalism system's vocabulary. */
const TAG_PICKER_STEPS = Object.freeze([
  'Crafting',
  { selector: '[data-recipe-edit="hb-r-tincture"]' },
  { selector: '#recipe-tab-ingredients' },
  { selector: '[data-recipe-option-tags]', scroll: true },
  { selector: '[data-recipe-option-tags] [data-recipe-add-tag]' },
]);

/** The tag picker over `ve`, which no tag in the vocabulary is named (`solvent`, `vessel`, `salve`). */
const NEW_TAG_STEPS = Object.freeze([
  ...TAG_PICKER_STEPS,
  { selector: '.fabricate-picker-popover .manager-travel-popover-search input', fill: 've' },
]);

/** The first ingredient set's first requirement, a bare row, so each control matches one element. */
const FIRST_INGREDIENT_ROW =
  '.manager-recipe-ingredient-set-groups > [data-recipe-group]:first-child [data-recipe-option]';

/** The `n`th flat result row of a result set, as a child and from the page. */
const RESULT_ROW_CHILD = (n) => `[data-recipe-result-item]:nth-child(${n})`;
const RESULT_ROW = (n) => `.manager-recipe-ingredient-set-groups > ${RESULT_ROW_CHILD(n)}`;
const RESULT_ROWS = '.manager-recipe-ingredient-set-groups > [data-recipe-result-item]';

/** A flat result list's row geometry: one line per row, and every remove and toggle in a column. */
const FLAT_RESULT_GEOMETRY = Object.freeze({
  containerSelector: '.manager-recipe-ingredient-set-groups',
  oneLineRows: RESULT_ROWS,
  alignedRight: `${RESULT_ROWS} .manager-recipe-option-remove`,
  alignedLeft: `${RESULT_ROWS} [role="radiogroup"]`,
});

/** Add a component result through the `Result` adder: the empty row it appends names it by search. */
const ADD_COMPONENT_RESULT = (row, name) => [
  { selector: '[data-recipe-add="result-item"]' },
  { selector: `${RESULT_ROW(row)} [data-recipe-option-search]`, fill: name },
  { selector: `${RESULT_ROW(row)} [data-recipe-option-search]`, press: 'Enter' },
];

/** The horseshoe's results with a currency and two knowledge rewards authored (issue 1773). */
const REWARD_RESULTS_STEPS = Object.freeze([
  'Crafting',
  { selector: '[data-recipe-edit="sm-r-horseshoe"]' },
  { selector: '#recipe-tab-results' },
]);
const REWARD_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/recipe\//,
  /^src\/systems\/learnedKnowledgeObservability\.js$/,
]);
const BOUNTY_ROW = '[data-recipe-result-item]:has([data-recipe-reward-body])';

/** A result choice group's box, by its group id (issue 1773). */
const RESULT_GROUP = (id) => `[data-recipe-result-group="${id}"]`;
/** What only some cells draw: N, repeats and a member's range cell. */
const CELL_CONTROLS =
  '[data-recipe-group-count], [data-recipe-group-repeats], [data-recipe-range-cell]';
/** The `n`th member row of a result choice group, counted from 1 past its OR separators. */
const GROUP_MEMBER = (id, n) =>
  `${RESULT_GROUP(id)} .manager-recipe-result-group-members > :nth-child(${2 * n - 1})`;
/** Convert the `n`th flat row of the set matching `set` through its `or…`, adding `kind`. */
const CONVERT_ROW = (set, n, kind) => [
  { selector: `${set} ${RESULT_ROW(n)} .manager-recipe-or-trigger` },
  { selector: `.manager-recipe-or-menu [data-recipe-add="alternative-${kind}"]` },
];
const GROUP_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/recipe\//,
]);

/** The two-slot editor's failed-check set (issue 2512): both reserved slots are `is-reserved`. */
const FAILURE_SET = '[data-recipe-set-role="failure"]';

/** A routed recipe's Results tab, with the lab world seeded into `state` (issue 2512). */
const ROUTED_RESULTS = (system, recipeId, state) => ({
  query: state ? { system, resultRowState: state } : { system },
  steps: [
    'Crafting',
    { selector: `[data-recipe-edit="${recipeId}"]` },
    { selector: '#recipe-tab-results' },
  ],
});
/** The two-slot editor's failure-results toggle, its policy callout and that callout's link. */
const FAILURE_TOGGLE_CARD = '[data-recipe-section="failure-results"]';
const FAILURE_TOGGLE = '[data-recipe-field="failureResults"]';
const FAILURE_POLICY = '[data-recipe-failure-results-policy]';
const FAILURE_CHECKS = '[data-recipe-failure-results-checks]';
/** `ROUTED_RESULTS`, then each selector: scrolled to if the toggle card or callout, else clicked. */
const FAILURE_RESULTS = (system, recipeId, state, ...steps) => {
  const base = ROUTED_RESULTS(system, recipeId, state);
  return { ...base, steps: [...base.steps, ...steps] };
};
/** A step that scrolls a selector into view, and one that clicks it. */
const SCROLL_TO = (selector) => ({ selector, scroll: true });
const CLICK = (selector) => ({ selector });
/** A result set's card in the editor, by its result set id. */
const RESULT_SET = (id) => `[data-recipe-result-set-id="${id}"]`;
const SET_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/recipe\//,
]);

/** A routed recipe's Overview scrolled to its routing card (issue 2513), the lab world seeded. */
const ROUTING_CARD = '[data-recipe-section="routing"]';
const ROUTING_OVERVIEW = (system, recipeId, state, lastRow = '') => ({
  query: state ? { system, resultRowState: state } : { system },
  steps: [
    'Crafting',
    { selector: `[data-recipe-edit="${recipeId}"]` },
    { selector: '#recipe-tab-overview' },
    { selector: ROUTING_CARD, scroll: true },
    // A tall card centres on its middle, so the row a case is named for is brought in after it.
    ...(lastRow
      ? [{ selector: `${ROUTING_CARD} [data-routing-overview-row="${lastRow}"]`, scroll: true }]
      : []),
  ],
});
/** One line per row, every select at one x, and the marker column at its 84px. */
const ROUTING_GEOMETRY = (scope = ROUTING_CARD) => ({
  containerSelector: `${scope} .fabricate-routing-overview-list`,
  oneLineRows: `${scope} .fabricate-routing-overview-row`,
  alignedLeft: `${scope} .fabricate-routing-overview-target`,
  minInlineSize: { selector: `${scope} .fabricate-routing-overview-markers`, pixels: 84 },
});
const ROUTING_HITS = Object.freeze([
  `${ROUTING_CARD} .fabricate-routing-overview-select .fabricate-select-trigger`,
  `${ROUTING_CARD} [data-recipe-routing-add="resultGroup"]`,
]);
/** A routing row by key, and the same row inside the card. */
const ROW = (key) => `[data-routing-overview-row="${key}"]`;
const ROUTING_ROW = (key) => `${ROUTING_CARD} ${ROW(key)}`;

/** A progressive stage list's row geometry, its name field held at the row's stated minimum. */
const STAGE_ROWS = '[data-recipe-result-row] [data-recipe-result-item]';
const STAGE_RESULT_GEOMETRY = Object.freeze({
  containerSelector: '[data-recipe-set]:has([data-recipe-result-row])',
  oneLineRows: STAGE_ROWS,
  alignedRight: '[data-recipe-result-row] [data-recipe-remove="result-item"]',
  minInlineSize: { selector: `${STAGE_ROWS} .manager-recipe-option-name-field`, pixels: 180 },
});

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-recipe-edit-normal',
    label: 'Manager — Recipe edit normal',
    smokeLabels: ['manager-recipe-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  // Issue 1522: the refused save's blocking notice, in the page position above the scrolling panel.
  managerCase({
    id: 'manager-recipe-edit-save-failed',
    label: 'Manager — Recipe edit save failed',
    smokeLabels: [],
    reaches: 'beyond',
    query: { saveFails: '1' },
    steps: [
      'Crafting',
      { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-field="name"]', fill: 'Moonlit Draught' },
      { selector: '.manager-header-actions .fabricate-button.is-primary' },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager [data-recipe-editor] > [data-notice-position] > [role="alert"]',
    expectCenterHit: '[data-recipe-editor] > [data-notice-position] > [role="alert"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/],
  }),
  // Issue 2005 (T6): the Check tier select names a roll-under Target, or a character value's adjustment.
  ...[
    [
      'manager-recipe-edit-check-tier-under',
      'roll-under-fixed',
      'Masterwork (Target 8)',
      'Target 12',
    ],
    [
      'manager-recipe-edit-check-tier-under-attribute',
      'roll-under-add',
      'Masterwork (−2)',
      'Character value',
    ],
  ].map(([id, state, text, subline]) =>
    managerCase({
      id,
      label: `Manager — Recipe edit check tier list, ${state.replaceAll('-', ' ')}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { system: 'lab-smithing', checkPreviewState: state },
      steps: [
        'Crafting',
        { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
        { selector: '#recipe-tab-overview' },
        { selector: '[data-recipe-field="checkTierId"]' },
      ],
      expectView: 'recipe-edit',
      // The header subline names the check as the browser pill does, never a DC.
      expectSelector:
        `.fabricate-manager:has([data-recipe-edit-subline]:has-text("· ${subline}")) ` +
        `.fabricate-select-popover [data-popover-option="sm-tier-masterwork"]:has-text("${text}")`,
      kinds: ['manager', 'recipes'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/manager\/recipe\/(?:RecipeOverviewTab\.svelte|recipeOverviewSelectOptions\.js)$/,
        /^src\/ui\/model\/recipeBrowserModel\.js$/,
        /^src\/ui\/svelte\/apps\/manager\/(?:(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte|headerBreadcrumbs\.js)$/,
      ],
    })
  ),
  // Issue 2006: a counting check's tier options name each tier's successes needed, and the default's.
  managerCase({
    id: 'manager-recipe-edit-check-tier-count',
    label: 'Manager — Recipe edit check tier list, success-counting check',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', checkPreviewState: 'dice-pool-recipes' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-horseshoe"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-field="checkTierId"]' },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager:has([data-recipe-edit-subline]:has-text("· 1 success")) ' +
      '.fabricate-select-popover:has-text("Default · 3 successes")' +
      ':has([data-popover-option="sm-tier-apprentice"]:has-text("Apprentice work · 1 success"))' +
      ' [data-popover-option="sm-tier-masterwork"]:has-text("Masterwork · 5 successes")',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\/(?:RecipeOverviewTab\.svelte|recipeOverviewSelectOptions\.js)$/,
      /^src\/ui\/model\/recipeBrowserModel\.js$/,
    ],
  }),
  // Every frame below reaches its state by clicking the rule group rather than by authoring a second catalogued system.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-inherit',
    label: 'Manager — Recipe edit crafting modifier inherit',
    // Beyond the smoke.
    reaches: 'beyond',
    smokeLabels: [],
    // The per-recipe check-modifier picker at rest.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-kiln"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The picker cell and the inherited-names paragraph.
    expectSelector:
      '.fabricate-manager [data-recipe-editor] ' +
      '[data-recipe-crafting-modifier-picker] [data-recipe-crafting-modifier-inherited]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-custom-set',
    label: 'Manager — Recipe edit crafting modifier custom set',
    // Beyond the smoke: the walk never presses a rule card, so the picker's custom-set state has no counterpart.
    reaches: 'beyond',
    smokeLabels: [],
    // `hb-r-stillroom` authors three modifier ids, so the tri-state reads `Custom set` above a three-pill row.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The pill row is what `Custom set` adds over `Inherit`, and the absent cap sentence separates it from both capped neighbours.
    expectSelector:
      '.fabricate-manager [data-recipe-editor] ' +
      '[data-recipe-crafting-modifier-picker]:has([data-modifier-pill-select])' +
      ':not(:has([data-recipe-crafting-modifier-cap]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // The suppressed-pick state (issue 1608): the same custom set, after one pick is un-marked on the Checks tab.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-suppressed',
    label: 'Manager — Recipe edit crafting modifier suppressed pick',
    // Beyond the smoke: the smoke's system authors no modifier picks under this rule, let alone an un-marked one.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      // Un-marks `hb-mod-medicine` selectable.
      { selector: '[data-crafting-modifier-eligibility-input="hb-mod-medicine"]' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The count, not merely the note: a click that toggled nothing leaves all three picks eligible and no note at all.
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-suppressed="1"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Two frames, because below the bound the Add menu is live and at the bound it goes dead.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-cap-available',
    label: 'Manager — Recipe edit crafting modifier below the pick cap',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '5' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The reading, not merely a sentence: both frames render the same element, so a fill that did not land publishes the wrong one.
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-cap="available"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-cap-reached',
    label: 'Manager — Recipe edit crafting modifier at the pick cap',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '3' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-cap="reached"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-absent',
    label: 'Manager — Recipe edit crafting modifier absent',
    // Beyond the smoke: the walk photographs a system whose recipes do author picks, so absence has no counterpart.
    reaches: 'beyond',
    smokeLabels: [],
    // The negative frame the redesign turns on: under any rule but `bySubject` this tab renders nothing about check modifiers.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="identity"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // Absence in three directions, because each retired hook is a different way the surface could come back.
    expectSelector:
      '.fabricate-manager [data-recipe-editor]' +
      ':not(:has([data-recipe-crafting-modifier-picker]))' +
      ':not(:has([data-recipe-crafting-modifier]))' +
      ':not(:has([data-recipe-modifier-banner]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Both cases used to photograph the `noPlaceholder` inert cause, which retires with the placeholder.
  managerCase({
    id: 'manager-checks-crafting-modifier-inert',
    label: 'Manager — Checks crafting modifiers inert',
    // Beyond the smoke: the walk never empties a check formula, so no counterpart frame of the notice exists.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      // Clearing the field reaches `noFormula`: a check slot that exists and rolls nothing.
      { selector: '[data-check-roll-formula]', fill: '' },
      { selector: '[data-checks-save]' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-inert]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The cause, not just the notice: both causes render through the same element with the same chrome.
    expectSelector: '.fabricate-manager [data-crafting-modifier-inert="noFormula"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-inert',
    label: 'Manager — Recipe edit crafting modifier inert',
    // Beyond the smoke, for the same reason as the sibling above.
    reaches: 'beyond',
    smokeLabels: [],
    // The recipe end of the same fact, and the only check-modifier banner this tab has left.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      // Back to The roll to clear the formula: the field and the catalogue it makes inert are two sections apart (issue 1096).
      { selector: '#checks-section-roll' },
      { selector: '[data-check-roll-formula]', fill: '' },
      { selector: '[data-checks-save]' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-kiln"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-modifier-inert]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The cause, and the withdrawal.
    expectSelector:
      '.fabricate-manager [data-recipe-editor]:has([data-recipe-modifier-inert="noFormula"])' +
      ':not(:has([data-recipe-crafting-modifier-picker]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-books-scrolls',
    label: 'Manager — Recipe edit books scrolls',
    smokeLabels: ['manager-recipe-edit-books-scrolls'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Pinned by row id rather than left on "whichever row is first".
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-greater-healing"]' },
      { selector: '#recipe-tab-books-scrolls' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-tools',
    label: 'Manager — Recipe edit tools',
    smokeLabels: ['manager-recipe-edit-tools'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-tools' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients',
    label: 'Manager — Recipe edit ingredients',
    smokeLabels: ['manager-recipe-edit-ingredients'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-ingredients' },
    ],
    expectView: 'recipe-edit',
    // The converged row, named (issue 1373), at the library specimen's figures (issue 2515).
    expectSelector: '[data-recipe-option] [data-recipe-option-kind]',
    expectLayout: {
      controls: [
        {
          selector: `${FIRST_INGREDIENT_ROW} .manager-recipe-option-plate`,
          styles: 'width: 26px; height: 26px; border-top-left-radius: 6px',
        },
        {
          selector: `${FIRST_INGREDIENT_ROW} [data-recipe-option-chosen]`,
          styles: 'height: 34px; border-top-left-radius: 7px',
        },
        { selector: `${FIRST_INGREDIENT_ROW} .manager-recipe-or-trigger`, styles: 'height: 28px' },
      ],
    },
    expectContained: [
      {
        container: '[data-recipe-option]',
        target: '[data-recipe-option-kind]',
      },
      // And the set's one adder over the kind menu, the only child of its foot.
      {
        container: '[data-recipe-set]',
        target:
          '[data-recipe-set] .fabricate-set-card-adder:has(> :only-child [data-recipe-add="ingredient"][aria-haspopup="menu"])',
      },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Only reachable frame for the open kind panel (issue 1510): the option list renders only while
  // open, and the portal occludes the closed-state frame behind it. The kind trigger is this
  // phase's narrowest at 132px, so a panel wider than its trigger shows here.
  managerCase({
    id: 'manager-recipe-edit-ingredients-kind-list',
    label: 'Manager — Recipe edit ingredient kind list',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    // The walk stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Crafting',
      { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-option-kind]' },
    ],
    expectView: 'recipe-edit',
    // Three claims a closed-state frame fails: the panel exists, it is portaled to the application root, and its ticked column reaches the chosen row. The `inline` rung is read off the frame rather than asserted, because that class is built from the `size` prop and no literal of it exists in `src`.
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="component"] .fabricate-select-tick',
    // The panel sits inside the application root rather than clipped by it, and its rows carry the kind words.
    expectContained: [
      { container: '.fabricate-manager', target: '.fabricate-select-popover' },
      { container: '.fabricate-select-popover', target: '.fabricate-select-label' },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/recipe\//, ...ANCHORED_POPOVER_SOURCES],
  }),
  // The name field's suggestion list, open over the tab panel that used to clip it (issue 2157).
  // The walk clicks the last suggestion first, which a clipped row cannot receive, then reopens the
  // list for the frame; clearing the row also lights the header's dirty chip.
  managerCase({
    id: 'manager-recipe-edit-ingredients-suggestions',
    label: 'Manager — Recipe edit ingredients, a name field suggestion list open',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    steps: [
      'Crafting',
      { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: `${COMPONENT_NAME_FIELD} [data-recipe-option-clear]` },
      { selector: `${COMPONENT_NAME_FIELD} [data-recipe-option-search]`, fill: 'ingot' },
      { selector: `${REQUIREMENT_SUGGESTION}:last-child` },
      { selector: `${COMPONENT_NAME_FIELD} [data-recipe-option-clear]` },
      { selector: `${COMPONENT_NAME_FIELD} [data-recipe-option-search]`, fill: 'ingot' },
    ],
    expectView: 'recipe-edit',
    expectSelector: REQUIREMENT_SUGGESTION,
    expectContained: [
      { container: '.fabricate-manager', target: '.manager-recipe-option-suggestions' },
    ],
    // Focused in this frame, so the search measures its full-accent focus face (issue 2515).
    expectLayout: {
      controls: [
        {
          selector: '.manager-recipe-option-search',
          styles: 'height: 34px; border-top-color: var(--fab-accent)',
        },
      ],
    },
    expectCenterHit: `${REQUIREMENT_SUGGESTION}:last-child`,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      TYPEAHEAD_COMBOBOX_SOURCE,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients-cost',
    label: 'Manager — Recipe edit ingredients cost',
    smokeLabels: ['manager-recipe-edit-ingredients-cost'],
    // The essence and currency-cost rows sit below the plain ingredients fold, so the currency row is scrolled into view.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-option-currency]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // The `Any one of` box: a requirement with two alternatives, its pill, its hint and its one adder.
  managerCase({
    id: 'manager-recipe-edit-ingredients-choice-group',
    label: 'Manager — Recipe edit ingredients, a choice group of two alternatives',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      {
        selector: '[data-recipe-group].has-alternatives [data-recipe-add="alternative"]',
        scroll: true,
      },
    ],
    expectView: 'recipe-edit',
    // Two member rows inside the box, neither drawing a convert control, and one menu adder at its foot.
    expectSelector:
      '[data-recipe-group].has-alternatives:has([data-recipe-any-one-of])' +
      ':has([data-recipe-option] ~ [data-recipe-option])' +
      ':not(:has(.manager-recipe-or-trigger, [data-recipe-add^="alternative-"])) ' +
      '.manager-recipe-requirement-adds:has(> :only-child) [data-recipe-add="alternative"][aria-haspopup="menu"]',
    expectContained: [
      {
        container: '[data-recipe-group].has-alternatives',
        target: '[data-recipe-group].has-alternatives [data-recipe-option]',
      },
    ],
    // The dashed `Button`'s pinned 34px, as the set's own adder below it.
    expectLayout: {
      controls: [
        {
          selector: '[data-recipe-group].has-alternatives [data-recipe-add="alternative"]',
          styles: 'height: 34px; border-top-style: dashed',
        },
      ],
    },
    expectCenterHit: '[data-recipe-group].has-alternatives [data-recipe-add="alternative"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // The read-only face: the system's currency feature is switched off first, so the authored cost
  // stays visible with a static unit, a `Currency off` tag and a static amount.
  managerCase({
    id: 'manager-recipe-edit-ingredients-currency-off',
    label: 'Manager — Recipe edit ingredients, a currency cost with the currency feature off',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '.manager-feature-tile[data-feature-key="currency"] button' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-currency-readonly]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The static unit, the tag and the static amount on one row: a toggle that did not land leaves a stepper.
    expectSelector:
      '[data-recipe-option]:has([data-recipe-currency-readonly])' +
      ':has([data-recipe-currency-disabled]) [data-recipe-currency-readonly-amount]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-tag-picker',
    label: 'Manager — Recipe edit, the tag picker open over a system vocabulary',
    smokeLabels: [],
    // No case in the registry opened this popover (issue 1373), which is why it went on drawing a panel that is not the design's.
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: TAG_PICKER_STEPS,
    expectView: 'recipe-edit',
    // The panel and A row in it.
    expectSelector:
      '.fabricate-manager .fabricate-picker-popover.manager-travel-popover ' +
      '.manager-travel-popover-options .manager-travel-option',
    // Portaled, so containment is asserted against the application root: the panel escapes the editor's clipping on purpose.
    expectContained: [
      {
        container: '.fabricate-manager',
        target: '.fabricate-picker-popover .manager-travel-popover-search input',
      },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  // The panel's footer offers the absent query as a new tag (issue 2515).
  managerCase({
    id: 'manager-recipe-edit-tag-picker-new-tag',
    label: 'Manager — Recipe edit, the tag picker offering a new tag',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: NEW_TAG_STEPS,
    expectView: 'recipe-edit',
    expectSelector: '.fabricate-picker-popover [data-recipe-tag-create]',
    expectContained: [{ container: '.fabricate-manager', target: '[data-recipe-tag-create]' }],
    expectCenterHit: '[data-recipe-tag-create]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  // …and its press, through the root's `addTag` to the store: the refreshed vocabulary lists `ve`,
  // and the row holds it.
  managerCase({
    id: 'manager-recipe-edit-tag-picker-new-tag-created',
    label: 'Manager — Recipe edit, a new tag created from the tag picker',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: [...NEW_TAG_STEPS, { selector: '.fabricate-picker-popover [data-recipe-tag-create]' }],
    expectView: 'recipe-edit',
    expectSelector: '.fabricate-picker-popover [role="option"][title="ve"][aria-selected="true"]',
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-picker-popover' }],
    expectCenterHit: '.fabricate-picker-popover [role="option"][title="ve"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients-or-menu',
    label: 'Manager — Recipe edit ingredients, the "or…" menu open',
    reaches: 'beyond',
    smokeLabels: [],
    // No case had opened this menu (issue 1373), which is why it shipped as four full sentences with no header and no colour.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '.manager-recipe-or-trigger' },
    ],
    expectView: 'recipe-edit',
    // Named on the last kind, not on the panel.
    expectSelector:
      '.fabricate-action-menu-panel.manager-recipe-or-menu [data-recipe-add="alternative-currency"]',
    // The panel is portaled to the manager root, so containment against the scrolling editor pane would be a false claim.
    expectContained: [{ container: '.fabricate-manager', target: '.manager-recipe-or-menu' }],
    // …and it is actually on top: a menu drawn under its row is contained, visible and useless.
    expectCenterHit: '.manager-recipe-or-menu [data-recipe-add="alternative-component"]',
    // The shared panel's 11 and items' 7, which the kind menu inherits (issue 2257).
    expectLayout: {
      controls: [
        { selector: '.manager-recipe-or-menu', styles: 'border-radius: 11px' },
        {
          selector: '.manager-recipe-or-menu [data-recipe-add="alternative-component"]',
          styles: 'border-radius: 7px',
        },
      ],
    },
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  // The kind menu opened from a choice group's Alternative adder: the menu the bare row's `or…`
  // opens, from the adder's start edge.
  managerCase({
    id: 'manager-recipe-edit-choice-group-menu',
    label:
      'Manager — Recipe edit ingredients, the kind menu opened from a choice group’s Alternative adder',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      {
        selector: '[data-recipe-group].has-alternatives [data-recipe-add="alternative"]',
        scroll: true,
      },
      { selector: '[data-recipe-group].has-alternatives [data-recipe-add="alternative"]' },
    ],
    expectView: 'recipe-edit',
    // The open menu, headed and named by its heading, opened from the box's adder.
    expectSelector:
      '.fabricate-manager:has([data-recipe-group].has-alternatives [data-recipe-add="alternative"][aria-expanded="true"]) ' +
      '.fabricate-action-menu-panel.manager-recipe-or-menu:has(.manager-action-menu-heading) ' +
      '[role="menu"][aria-labelledby] [data-recipe-add="alternative-currency"]',
    expectContained: [{ container: '.fabricate-manager', target: '.manager-recipe-or-menu' }],
    expectCenterHit: '.manager-recipe-or-menu [data-recipe-add="alternative-tag"]',
    expectLayout: {
      containerSelector: '.manager-recipe-ingredients-section',
      alignedLeft: '[data-recipe-add="alternative"][aria-expanded="true"], .manager-recipe-or-menu',
      // The shared panel's 11 and items' 7, which the kind menu inherits (issue 2257).
      controls: [
        { selector: '.manager-recipe-or-menu', styles: 'border-radius: 11px' },
        {
          selector: '.manager-recipe-or-menu [data-recipe-add="alternative-tag"]',
          styles: 'border-radius: 7px',
        },
      ],
    },
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  // An ingredient set's Ingredient adder open: the kind menu headed "Add an ingredient".
  managerCase({
    id: 'manager-recipe-edit-ingredients-adder-menu',
    label: 'Manager — Recipe edit ingredients, the Ingredient adder’s kind menu open',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-add="ingredient"]', scroll: true },
      { selector: '[data-recipe-add="ingredient"]' },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-action-menu-panel.manager-recipe-ingredient-menu:has(.manager-action-menu-heading) ' +
      '[role="menu"][aria-labelledby] [data-recipe-add="ingredient-tag"]',
    expectContained: [
      { container: '.fabricate-manager', target: '.manager-recipe-ingredient-menu' },
    ],
    expectCenterHit: '.manager-recipe-ingredient-menu [data-recipe-add="ingredient-tag"]',
    // The menu opens from the adder's start edge, at the shared panel's 11 and items' 7.
    expectLayout: {
      containerSelector: '.manager-recipe-ingredients-section',
      alignedLeft:
        '[data-recipe-add="ingredient"][aria-expanded="true"], .manager-recipe-ingredient-menu',
      controls: [
        { selector: '.manager-recipe-ingredient-menu', styles: 'border-radius: 11px' },
        {
          selector: '.manager-recipe-ingredient-menu [data-recipe-add="ingredient-tag"]',
          styles: 'border-radius: 7px',
        },
      ],
    },
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  // A recipe routed by ingredients: each set's `Ingredient` adder above the full-width `Add ingredient set`.
  managerCase({
    id: 'manager-recipe-edit-ingredients-sets',
    label: 'Manager — Recipe edit ingredients, the Ingredient adder on each of several sets',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="jw-r-cast"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-add="ingredient-set"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.manager-recipe-ingredient-sets .fabricate-set-card-adder:has(> :only-child [data-recipe-add="ingredient"][aria-haspopup="menu"])',
    expectCenterHit:
      '.manager-recipe-ingredient-set-item:last-child [data-recipe-add="ingredient"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Routed by check (issue 2512): every ingredient set is named in its card, the unnamed one "Set 2".
  managerCase({
    id: 'manager-recipe-edit-ingredients-check-rename',
    label: 'Manager — Recipe edit ingredients, two sets named in a recipe routed by check',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework', resultRowState: 'check-two-sets' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="rw-r-blade"]' },
      { selector: '#recipe-tab-ingredients' },
    ],
    expectView: 'recipe-edit',
    expectSelector: '[data-recipe-set-id="rw-set-salvaged"] input[data-recipe-set-field="name"]',
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  // The Tools tab's per-set cards: each named route is a set card renamed in place.
  managerCase({
    id: 'manager-recipe-edit-tools-ingredient-sets',
    label: 'Manager — Recipe edit tools, a set card per routed ingredient set',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="jw-r-cast"]' },
      { selector: '#recipe-tab-tools' },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '[data-recipe-tools-ingredient-set="jw-set-gold"] input[data-recipe-tools-set-field="name"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [...SET_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-validation',
    label: 'Manager — Recipe edit validation',
    smokeLabels: ['manager-recipe-edit-validation'],
    reaches: 'exact',
    query: {},
    // The recipe is named, and that is the whole difference between this frame and the one it replaces.
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-runeplate-draft"]' },
      { selector: '#recipe-tab-validation' },
    ],
    expectView: 'recipe-edit',
    // A representative frame for `EditorValidationSurface` since issue 1517, which had no assertion at all until then.
    expectSelector: '[data-recipe-tab="validation"] [data-recipe-issue-view]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-multistep',
    label: 'Manager — Recipe edit multistep',
    smokeLabels: ['manager-recipe-edit-multistep'],
    // The Overview tab's editable steps accordion, with a per-step duration control on each header.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="steps"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-step-open',
    label: 'Manager — Recipe edit step open',
    // The AFTER frame for the step row's moved geometry (issue 1512): the chevron is the sole opener
    // now, so this is the only case that reaches an OPEN step row and the only one that proves the
    // disclosure leads while the rocker trails.
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="steps"]', scroll: true },
      { selector: ':nth-match([data-sortable-disclosure], 1)' },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager .fabricate-sortable-list-row.is-expanded [data-sortable-disclosure][aria-expanded="true"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-step-narrow',
    label: 'Manager — Recipe edit steps at the declared floor',
    // The step rows at 1024x640: the row never wraps, so the grip, the badge and the trailing
    // cluster have to stay on one line at the narrow container.
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="steps"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager .fabricate-sortable-list-row[data-recipe-step-id] [data-sortable-grip]',
    // The editor's own main, not the body, scrolls below the 1120px rung (issue 1976).
    expectScrollable: 'main.manager-recipe-edit-main',
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-narrow',
    label: 'Manager — Recipe edit progressive results at the declared floor',
    // Anchored to `hb-r-grind`, the one progressive recipe in the fixture world: the ordered stage
    // list is a system-mode fact, and this selector is satisfied only by the converted state.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-grind"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager .fabricate-sortable-list-row[data-recipe-result-row] [data-sortable-move="down"]',
    expectLayout: STAGE_RESULT_GEOMETRY,
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      STAGE_COMPLICATION_LIST_MATCH,
      PROGRESSIVE_STAGE_LIST_MATCH,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results',
    label: 'Manager — Recipe edit results',
    smokeLabels: ['manager-recipe-edit-results'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-multistep',
    label: 'Manager — Recipe edit results multistep',
    smokeLabels: ['manager-recipe-edit-results-multistep'],
    // The Results tab's per-step sections: the frame that proves a multi-step recipe's Results is not an empty tab.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-empty-step',
    label: 'Manager — Recipe edit results, empty intermediate step',
    // Issue 1907: `sm-r-pattern-blade` steps 1 and 2 carry authored empty result groups, and the
    // card explains them instead of flagging a gap. The terminal step keeps the danger panel.
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-results' },
      { selector: '[data-recipe-section="step-sm-step-draw-results"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager [data-recipe-section="step-sm-step-draw-results"]' +
      ' p[data-recipe-result-empty].manager-muted',
    expectContained: [
      {
        container: '.fabricate-manager',
        target: '[data-recipe-section="step-sm-step-draw-results"] p[data-recipe-result-empty]',
      },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // The fixed-or-rolled amount on recipe results (issue 1516): the horseshoe's own row Fixed, a
  // second rolled, a third opened on Rolled with nothing typed, and a fourth holding an unrollable
  // expression, captured after the field loses focus so its invalid paint is the resting one.
  ...[
    {
      suffix: '',
      position: null,
      themeVariants: ['hearth-herb'],
      hit: `${RESULT_ROW(4)} [data-recipe-option-amount-mode="rolled"]`,
    },
    {
      suffix: '-narrow',
      position: { width: 1024, height: 640 },
      themeVariants: [],
      hit: `${RESULT_ROW(4)} .manager-recipe-option-remove`,
    },
  ].map(({ suffix, position, themeVariants, hit }) =>
    managerCase({
      id: `manager-recipe-edit-results-rolled${suffix}`,
      label: `Manager — Recipe edit results, rolled, opened and invalid amounts${suffix ? ', at the declared floor' : ''}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { system: 'lab-smithing' },
      steps: [
        'Crafting',
        { selector: '[data-recipe-edit="sm-r-horseshoe"]' },
        { selector: '#recipe-tab-results' },
        ...ADD_COMPONENT_RESULT(2, 'Iron Ingot'),
        ...ADD_COMPONENT_RESULT(3, 'Steel Ingot'),
        ...ADD_COMPONENT_RESULT(4, 'Silver Ingot'),
        { selector: `${RESULT_ROW(2)} [data-recipe-option-amount-mode="rolled"]` },
        { selector: `${RESULT_ROW(2)} [data-recipe-option-formula]`, fill: '1d4+1' },
        { selector: `${RESULT_ROW(3)} [data-recipe-option-amount-mode="rolled"]` },
        { selector: `${RESULT_ROW(4)} [data-recipe-option-amount-mode="rolled"]` },
        { selector: `${RESULT_ROW(4)} [data-recipe-option-formula]`, fill: 'max(, 2)' },
        // A click on the selected tab moves focus off the field without changing the screen.
        { selector: '#recipe-tab-results' },
        // The reserved success set's routing line pushes the fourth row to the floor's fold.
        { selector: hit, scroll: true },
      ],
      expectView: 'recipe-edit',
      // The first row Fixed, the next three on Rolled, and only the fourth marked invalid.
      expectSelector:
        `.manager-recipe-ingredient-set-groups:not(:has(> ${RESULT_ROW_CHILD(1)} [data-recipe-option-formula]))` +
        `:has(> ${RESULT_ROW_CHILD(2)} [data-recipe-option-formula])` +
        `:has(> ${RESULT_ROW_CHILD(3)} [data-recipe-option-formula])` +
        `:not(:has(> ${RESULT_ROW_CHILD(3)} [data-recipe-option-invalid]))` +
        ` > ${RESULT_ROW_CHILD(4)} [data-recipe-option-invalid]`,
      expectAttributes: [
        {
          selector: `${RESULT_ROW(2)} [data-recipe-option-formula]`,
          name: 'aria-invalid',
          value: null,
        },
        {
          selector: `${RESULT_ROW(4)} [data-recipe-option-formula]`,
          name: 'aria-invalid',
          value: 'true',
        },
      ],
      expectLayout: FLAT_RESULT_GEOMETRY,
      expectContained: [1, 2, 3, 4].map((row) => ({
        container: RESULT_ROW(row),
        target: `${RESULT_ROW(row)} .manager-recipe-option-remove`,
      })),
      expectCenterHit: hit,
      expectNoHorizontalOverflow: '.manager-recipe-ingredient-set-groups',
      ...(position && { position }),
      ...(themeVariants.length > 0 && { themeVariants }),
      kinds: ['manager', 'recipes', ...(position ? ['responsive'] : [])],
      sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/recipe\//],
    })
  ),
  // A result naming no component (an item-only one, the one way a result row is unnamed) opens the
  // row's suggestion list beneath it, whose last suggestion must own its pointer target.
  managerCase({
    id: 'manager-recipe-edit-results-suggestions',
    label: 'Manager — Recipe edit results, an unnamed result row’s suggestion list open',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'unnamed' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-horseshoe"]' },
      { selector: '#recipe-tab-results' },
      { selector: `${RESULT_ROW(1)} [data-recipe-option-search]`, fill: 'ingot' },
    ],
    expectView: 'recipe-edit',
    expectSelector: REQUIREMENT_SUGGESTION,
    expectContained: [
      { container: '.fabricate-manager', target: '.manager-recipe-option-suggestions' },
    ],
    expectCenterHit: `${REQUIREMENT_SUGGESTION}:last-child`,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      TYPEAHEAD_COMBOBOX_SOURCE,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  // Result kinds (issue 1773): a component, a labelled rolled bounty and two taught recipes, under a
  // Smithing that takes part in currency and observes learning, so every kind is offered.
  ...[
    { suffix: '', position: null },
    { suffix: '-narrow', position: { width: 1024, height: 640 } },
  ].map(({ suffix, position }) =>
    managerCase({
      id: `manager-recipe-edit-results-kinds${suffix}`,
      label: `Manager — Recipe edit results, a component, a currency and a recipe’s knowledge${suffix ? ', at the declared floor' : ''}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { system: 'lab-smithing', resultRowState: 'reward-craft' },
      // At the floor, the help line's wrap is what the frame is for.
      steps: [
        ...REWARD_RESULTS_STEPS,
        ...(position ? [{ selector: '[data-recipe-knowledge-hint]', scroll: true }] : []),
      ],
      expectView: 'recipe-edit',
      // A knowledge row draws its help line, and the bounty rolls and opens its body.
      expectSelector:
        '.manager-recipe-ingredient-set-groups:has(> [data-recipe-result-item] [data-recipe-knowledge-hint])' +
        ` > ${BOUNTY_ROW} [data-recipe-option-formula]`,
      expectLayout: {
        containerSelector: '.manager-recipe-ingredient-set-groups',
        // The component row, the one with nothing beneath it, stays on one line.
        oneLineRows: `${RESULT_ROWS}:not(:has([data-recipe-reward-body], [data-recipe-knowledge-hint]))`,
        // A kind slot grown past the others by a longer kind word pushes its name field out.
        alignedLeft: `${RESULT_ROWS} .manager-recipe-option-name-field`,
        // "Recipe knowledge" reads whole in its kind slot, never cut to an ellipsis.
        unclipped: `${RESULT_ROWS} [data-recipe-option-kind] .fabricate-select-value`,
      },
      expectNoHorizontalOverflow: '.manager-recipe-ingredient-set-groups',
      ...(position && { position }),
      kinds: ['manager', 'recipes', ...(position ? ['responsive'] : [])],
      sourceMatches: [...REWARD_SOURCES],
    })
  ),
  // The currency naming body, both fields cleared: the closing line says so, and the row stays whole.
  managerCase({
    id: 'manager-recipe-edit-results-currency-body-empty',
    label: 'Manager — Recipe edit results, a currency reward with no description',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-craft' },
    steps: [
      ...REWARD_RESULTS_STEPS,
      { selector: '[data-recipe-reward-label]', fill: '' },
      { selector: '[data-recipe-reward-reason]', fill: '' },
      // A click on the selected tab moves focus off the field without changing the screen.
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    expectSelector: `${BOUNTY_ROW} [data-recipe-reward-closing]:has-text("No description — the player just sees")`,
    expectContained: [
      { container: BOUNTY_ROW, target: `${BOUNTY_ROW} [data-recipe-reward-closing]` },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [...REWARD_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-currency-body-filled',
    label: 'Manager — Recipe edit results, a currency reward with what it is called and why',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-craft' },
    steps: [...REWARD_RESULTS_STEPS, { selector: '[data-recipe-reward-body]', scroll: true }],
    expectView: 'recipe-edit',
    expectSelector: `${BOUNTY_ROW} [data-recipe-reward-closing]:has-text("The player sees: Guild bounty · ")`,
    expectCenterHit: `${BOUNTY_ROW} [data-recipe-reward-reason]`,
    kinds: ['manager', 'recipes'],
    sourceMatches: [...REWARD_SOURCES],
  }),
  // The `Result` adder's kind menu, headed "Add a result" over the three kinds this set offers.
  managerCase({
    id: 'manager-recipe-edit-results-adder-menu',
    label: 'Manager — Recipe edit results, the Result adder’s kind menu open',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-craft' },
    steps: [...REWARD_RESULTS_STEPS, { selector: '[data-recipe-add="result-item"]' }],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-action-menu-panel.manager-recipe-result-menu:has(.manager-action-menu-heading) ' +
      '[role="menu"][aria-labelledby] [data-recipe-add="result-knowledge"]',
    // The menu opens from the adder's start edge, over the list it adds to and never the nav rail.
    expectLayout: {
      containerSelector: '.manager-recipe-results-section',
      oneLineRows: `${RESULT_ROWS}:not(:has([data-recipe-reward-body], [data-recipe-knowledge-hint]))`,
      alignedLeft: '[data-recipe-add="result-item"], .manager-recipe-result-menu',
      // The shared panel's 11 and items' 7, which the result menu inherits (issue 2257).
      controls: [
        { selector: '.manager-recipe-result-menu', styles: 'border-radius: 11px' },
        {
          selector: '.manager-recipe-result-menu [data-recipe-add="result-currency"]',
          styles: 'border-radius: 7px',
        },
      ],
    },
    expectContained: [
      { container: '.manager-recipe-results-section', target: '.manager-recipe-result-menu' },
    ],
    expectCenterHit: '.manager-recipe-result-menu [data-recipe-add="result-currency"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [...REWARD_SOURCES, ...ANCHORED_POPOVER_SOURCES],
  }),
  // Result choice groups (issue 1773): a reward row converted through its `or…` opens on any one
  // of with the player choosing, and draws no N, no repeats and no range cell.
  managerCase({
    id: 'manager-recipe-edit-results-group-player-anyone',
    label: 'Manager — Recipe edit results, a reward row converted into a choice the player makes',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-craft' },
    steps: [...REWARD_RESULTS_STEPS, ...CONVERT_ROW('[data-recipe-set]', 1, 'currency')],
    expectView: 'recipe-edit',
    expectSelector:
      `[data-recipe-result-group]:not(:has(${CELL_CONTROLS})) ` +
      '[data-recipe-group-chooser="playerChooses"] input:checked',
    expectCenterHit: '[data-recipe-result-group] [data-recipe-group-chooser="rolled"]',
    expectNoHorizontalOverflow: '[data-recipe-result-group]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [...GROUP_SOURCES],
  }),
  // Up to two, the player choosing among an ingot, a bounty and a recipe: N, and no repeats.
  managerCase({
    id: 'manager-recipe-edit-results-group-player-upto',
    label: 'Manager — Recipe edit results, a choice of up to two rewards the player makes',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-group' },
    steps: [
      ...REWARD_RESULTS_STEPS,
      { selector: RESULT_GROUP('sm-r-horseshoe-reward'), scroll: true },
      {
        selector:
          '[data-recipe-result-group="sm-r-horseshoe-reward"] [data-recipe-add="alternative"]',
        scroll: true,
      },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      `${RESULT_GROUP('sm-r-horseshoe-reward')}:not(:has([data-recipe-group-repeats], ` +
      '[data-recipe-range-cell])) [data-recipe-group-count]',
    expectCenterHit:
      '[data-recipe-result-group="sm-r-horseshoe-reward"] [data-recipe-add="alternative"]',
    expectNoHorizontalOverflow: RESULT_GROUP('sm-r-horseshoe-reward'),
    kinds: ['manager', 'recipes'],
    sourceMatches: [...GROUP_SOURCES],
  }),
  // One of two by a d6 ladder: the selection line and a range cell per member, and no N.
  managerCase({
    id: 'manager-recipe-edit-results-group-rolled-anyone',
    label: 'Manager — Recipe edit results, one reward of two decided by a roll',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-group-rolled' },
    steps: [
      ...REWARD_RESULTS_STEPS,
      { selector: RESULT_GROUP('sm-r-horseshoe-draw'), scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      `${RESULT_GROUP('sm-r-horseshoe-draw')}:not(:has([data-recipe-group-count])) ` +
      '[data-recipe-result-member] [data-recipe-range="to"]',
    expectCenterHit: `${RESULT_GROUP('sm-r-horseshoe-draw')} [data-recipe-range="from"]`,
    expectNoHorizontalOverflow: RESULT_GROUP('sm-r-horseshoe-draw'),
    kinds: ['manager', 'recipes'],
    sourceMatches: [...GROUP_SOURCES],
  }),
  // Up to two of three by roll, repeats allowed: the one cell drawing every control, and at the
  // declared floor, where each member's range cell follows its amount on a second line.
  ...[
    { suffix: '', position: null },
    { suffix: '-narrow', position: { width: 1024, height: 640 } },
  ].map(({ suffix, position }) =>
    managerCase({
      id: `manager-recipe-edit-results-group-rolled-upto-repeats${suffix}`,
      label: `Manager — Recipe edit results, up to two rewards by roll with repeats${suffix ? ', at the declared floor' : ''}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { system: 'lab-smithing', resultRowState: 'reward-group-rolled' },
      steps: [
        ...REWARD_RESULTS_STEPS,
        { selector: `${RESULT_GROUP('sm-r-horseshoe-draws')} [data-recipe-group-repeats]` },
        { selector: RESULT_GROUP('sm-r-horseshoe-draws'), scroll: true },
      ],
      expectView: 'recipe-edit',
      expectSelector:
        `${RESULT_GROUP('sm-r-horseshoe-draws')}:has([data-recipe-group-selection]) ` +
        '[data-recipe-group-repeats="repeats"]',
      expectCenterHit: `${RESULT_GROUP('sm-r-horseshoe-draws')} [data-recipe-group-repeats]`,
      expectNoHorizontalOverflow: RESULT_GROUP('sm-r-horseshoe-draws'),
      ...(position && { position }),
      kinds: ['manager', 'recipes', ...(position ? ['responsive'] : [])],
      sourceMatches: [...GROUP_SOURCES],
    })
  ),
  // A ladder the GM has broken, typed through the cells: an overlap in the one-of-two draw and a
  // backwards range in the up-to-two draw, each reason across its member's row, at full width and
  // at the declared floor. The last step leaves the field, which is when a reason is stated.
  ...[
    { suffix: '', position: null },
    { suffix: '-narrow', position: { width: 1024, height: 640 } },
  ].map(({ suffix, position }) =>
    managerCase({
      id: `manager-recipe-edit-results-group-rolled-overlap${suffix}`,
      label: `Manager — Recipe edit results, an overlapping and a backwards selection range${suffix ? ', at the declared floor' : ''}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { system: 'lab-smithing', resultRowState: 'reward-group-rolled' },
      steps: [
        ...REWARD_RESULTS_STEPS,
        {
          selector: `${GROUP_MEMBER('sm-r-horseshoe-draw', 2)} [data-recipe-range="from"]`,
          fill: '2',
        },
        {
          selector: `${GROUP_MEMBER('sm-r-horseshoe-draws', 3)} [data-recipe-range="from"]`,
          fill: '9',
        },
        { selector: `${RESULT_GROUP('sm-r-horseshoe-draws')} [data-recipe-group-help]` },
        { selector: RESULT_GROUP('sm-r-horseshoe-draw'), scroll: true },
      ],
      expectView: 'recipe-edit',
      expectSelector:
        `.manager-recipe-ingredient-set-groups:has(${RESULT_GROUP('sm-r-horseshoe-draw')} ` +
        '[data-recipe-range-problem]) ' +
        `${RESULT_GROUP('sm-r-horseshoe-draws')} [data-recipe-range][aria-invalid="true"]`,
      expectNoHorizontalOverflow: RESULT_GROUP('sm-r-horseshoe-draw'),
      ...(position && { position }),
      kinds: ['manager', 'recipes', ...(position ? ['responsive'] : [])],
      sourceMatches: [...GROUP_SOURCES],
    })
  ),
  // A rolled group with no selection roll and no ranges, reached by steps alone: the Validation
  // tab lists the selection and the ranges as their own problems.
  managerCase({
    id: 'manager-recipe-edit-validation-choice-group',
    label: 'Manager — Recipe edit validation, a rolled choice of rewards left incomplete',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-craft' },
    steps: [
      ...REWARD_RESULTS_STEPS,
      ...CONVERT_ROW('[data-recipe-set]', 1, 'component'),
      { selector: '[data-recipe-result-group] [data-recipe-group-chooser="rolled"]' },
      { selector: '#recipe-tab-validation' },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '[data-recipe-tab="validation"]:has([data-issue="choiceGroupSelection"]) ' +
      '[data-issue="choiceGroupRanges"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [...GROUP_SOURCES],
  }),
  // A failed check's reserved set holds a choice group on the same terms as any other set.
  managerCase({
    id: 'manager-recipe-edit-results-group-failure-role',
    label: 'Manager — Recipe edit results, a choice group in the failed-check set',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="al-r-elixir"]' },
      { selector: '#recipe-tab-results' },
      ...CONVERT_ROW(FAILURE_SET, 1, 'component'),
      { selector: `${FAILURE_SET} [data-recipe-group-chooser="rolled"]` },
    ],
    expectView: 'recipe-edit',
    expectSelector: `${FAILURE_SET} [data-recipe-result-group] [data-recipe-range-cell]`,
    expectNoHorizontalOverflow: FAILURE_SET,
    kinds: ['manager', 'recipes'],
    sourceMatches: [...GROUP_SOURCES],
  }),
  // A knowledge result on a Smithing whose learned recipes no player sees: drawn read-only, saying why.
  managerCase({
    id: 'manager-recipe-edit-results-learning-off',
    label: 'Manager — Recipe edit results, a knowledge reward where learning is not observable',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-kinds' },
    steps: [
      ...REWARD_RESULTS_STEPS,
      { selector: '[data-recipe-knowledge-hint="learning-off"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '[data-recipe-result-item]:has([data-recipe-knowledge-disabled]) ' +
      '[data-recipe-knowledge-hint="learning-off"]',
    expectNoHorizontalOverflow: '.manager-recipe-ingredient-set-groups',
    kinds: ['manager', 'recipes'],
    sourceMatches: [...REWARD_SOURCES],
  }),
  // A knowledge result teaching a recipe Smithing no longer holds: named missing, with its remove.
  managerCase({
    id: 'manager-recipe-edit-results-missing-recipe',
    label: 'Manager — Recipe edit results, a knowledge reward whose recipe is gone',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', resultRowState: 'reward-missing' },
    steps: [
      ...REWARD_RESULTS_STEPS,
      {
        selector:
          '[data-recipe-result-item]:has([data-recipe-option-missing]) [data-recipe-knowledge-hint]',
        scroll: true,
      },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '[data-recipe-result-item]:has([data-recipe-option-missing="sm-r-retired-lore"]) ' +
      '[data-recipe-remove="result-item"]',
    expectCenterHit:
      '[data-recipe-result-item]:has([data-recipe-option-missing]) [data-recipe-remove="result-item"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [...REWARD_SOURCES],
  }),
  managerCase({
    id: 'manager-multistep-disable-confirm',
    label: 'Manager — Multistep disable confirm',
    smokeLabels: ['manager-multistep-disable-confirm'],
    reaches: 'exact',
    // `dialog: 'open'` leaves DialogV2 standing and unresolved: the confirmation is the state, not what follows it.
    query: { dialog: 'open' },
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '.manager-feature-tile[data-feature-key="multiStepRecipes"] button' },
    ],
    expectView: 'system-edit',
    // The dialog is the state, so `expectView` alone would be satisfied by a silently no-oping toggle's screen.
    expectSelector: '.application.dialog',
    kinds: ['manager', 'recipes'],
    // Matches the screen it renders.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/(?:(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte|headerBreadcrumbs\.js)$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-collapsed',
    label: 'Manager — Recipe edit collapsed',
    smokeLabels: ['manager-recipe-edit-collapsed'],
    // The collapsed editor: a read-only steps card and its note whenever `!multiStepEnabled && steps.length > 1`.
    reaches: 'exact',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="jw-r-circlet"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="collapsed-steps"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The routing card draws the final step alone (issue 2513).
    expectSelector: '[data-recipe-section="routing"] [data-recipe-routing-scope="jw-step-chase"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Issue 1522: on the tabs a collapsed chain empties, its note is lede text in the heading block.
  ...[
    ['manager-recipe-edit-ingredients-collapsed', 'ingredients', 'data-recipe-collapsed-note'],
    ['manager-recipe-edit-results-collapsed', 'results', 'data-recipe-collapsed-results-note'],
  ].map(([id, tab, note]) =>
    managerCase({
      id,
      label: `Manager — Recipe edit ${tab} collapsed`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { system: 'lab-jewelry' },
      steps: [
        'Crafting',
        { selector: '[data-recipe-edit="jw-r-circlet"]' },
        { selector: `#recipe-tab-${tab}` },
      ],
      expectView: 'recipe-edit',
      expectSelector: `[data-recipe-tab="${tab}"] [data-tab-heading] [${note}]`,
      kinds: ['manager', 'recipes'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
        /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ],
    })
  ),
  managerCase({
    id: 'manager-recipe-edit-results-progressive',
    label: 'Manager — Recipe edit results progressive',
    smokeLabels: ['manager-recipe-edit-results-progressive'],
    // Progressive Results is a system-mode fact, so its ordered stage list can only be photographed on that system.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-grind"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    // The roll-budget strip states that no stage offers a choice, and no stage converts (issue 1773).
    expectSelector:
      '[data-recipe-tab="results"]:has([data-recipe-info-strip]):not(:has(.manager-recipe-or-trigger))',
    // The stage row's Edit link sits in the requirement row's trailing controls (issue 1516).
    expectCenterHit: '[data-recipe-result-row] [data-recipe-result-edit]',
    expectLayout: STAGE_RESULT_GEOMETRY,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      STAGE_COMPLICATION_LIST_MATCH,
      PROGRESSIVE_STAGE_LIST_MATCH,
    ],
  }),
  // A progressive set's adder appends an unnamed stage, whose name field takes focus (issue 1773).
  managerCase({
    id: 'manager-recipe-edit-results-progressive-adder',
    label: 'Manager — Recipe edit results progressive, a stage added',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-grind"]' },
      { selector: '#recipe-tab-results' },
      { selector: '[data-recipe-set] [data-recipe-add="result-item"]' },
    ],
    expectView: 'recipe-edit',
    expectSelector: `${STAGE_ROWS} [data-recipe-option-search]:focus`,
    expectLayout: STAGE_RESULT_GEOMETRY,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      PROGRESSIVE_STAGE_LIST_MATCH,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-alchemy',
    label: 'Manager — Recipe edit results alchemy',
    smokeLabels: ['manager-recipe-edit-results-alchemy'],
    // Alchemy Results: an authored success set plus the reserved failed-check set the recipe opted into.
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="al-r-elixir"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // The two-slot editor at the declared floor (issue 2512): both reserved slots, neither overflowing.
  managerCase({
    id: 'manager-recipe-edit-results-alchemy-narrow',
    label: 'Manager — Recipe edit results alchemy, the reserved pair at the declared floor',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTED_RESULTS('lab-alchemy', 'al-r-elixir', null),
    expectView: 'recipe-edit',
    expectSelector: `${FAILURE_SET}.is-danger [data-set-card-reserved]`,
    expectNoHorizontalOverflow: '[data-recipe-result-alchemy-simple]',
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [...SET_SOURCES],
  }),
  // The failure-results opt-in (issue 2514), off on a recipe with no failure set.
  managerCase({
    id: 'manager-recipe-edit-results-failure-optin',
    label: 'Manager — Recipe edit results, the failure-results toggle off',
    smokeLabels: [],
    reaches: 'beyond',
    ...FAILURE_RESULTS('lab-alchemy', 'al-r-smokestick', null, SCROLL_TO(FAILURE_TOGGLE_CARD)),
    expectView: 'recipe-edit',
    expectSelector: `[data-recipe-result-alchemy-simple]:not(:has(${FAILURE_POLICY})):not(:has(${FAILURE_SET})) ${FAILURE_TOGGLE_CARD}.is-off ${FAILURE_TOGGLE}:not(:disabled)`,
    expectCenterHit: FAILURE_TOGGLE,
    kinds: ['manager', 'recipes'],
    sourceMatches: [...SET_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-failure-optin-on',
    label: 'Manager — Recipe edit results, the failure-results toggle on and its empty set',
    smokeLabels: [],
    reaches: 'beyond',
    ...FAILURE_RESULTS(
      'lab-alchemy',
      'al-r-smokestick',
      null,
      SCROLL_TO(FAILURE_TOGGLE_CARD),
      CLICK(FAILURE_TOGGLE),
      SCROLL_TO(FAILURE_TOGGLE_CARD)
    ),
    expectView: 'recipe-edit',
    expectSelector: `[data-recipe-result-alchemy-simple]:has(${FAILURE_TOGGLE_CARD}.is-on) ${FAILURE_SET}.is-reserved:not(:has([data-recipe-result-empty])):not(:has(.fabricate-set-card-body)) [data-recipe-failure-set-note="optional"]`,
    expectCenterHit: [FAILURE_TOGGLE, '[data-recipe-failure-set-note="optional"]'],
    kinds: ['manager', 'recipes'],
    sourceMatches: [...SET_SOURCES],
  }),
  // Karrun Forgecraft produces nothing on a failed check, so the toggle cannot add the set.
  managerCase({
    id: 'manager-recipe-edit-results-failure-policy-never',
    label: 'Manager — Recipe edit results, the failure-results toggle a never policy disables',
    smokeLabels: [],
    reaches: 'beyond',
    ...FAILURE_RESULTS('lab-smithing', 'sm-r-shield', null, SCROLL_TO(FAILURE_POLICY)),
    expectView: 'recipe-edit',
    expectSelector: `[data-recipe-result-alchemy-simple]:has(${FAILURE_POLICY}) ${FAILURE_TOGGLE_CARD}.is-off ${FAILURE_TOGGLE}:disabled`,
    expectCenterHit: [FAILURE_TOGGLE, FAILURE_CHECKS],
    kinds: ['manager', 'recipes'],
    sourceMatches: [...SET_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-failure-policy-never-checks',
    label: 'Manager — Recipe edit results, the failure-results callout opening the crafting check',
    smokeLabels: [],
    reaches: 'beyond',
    ...FAILURE_RESULTS(
      'lab-smithing',
      'sm-r-shield',
      null,
      SCROLL_TO(FAILURE_POLICY),
      CLICK(FAILURE_CHECKS)
    ),
    expectView: 'checks-crafting',
    kinds: ['manager', 'recipes', 'checks'],
    sourceMatches: [...SET_SOURCES],
  }),
  // A failure set kept under a never policy: the note above the toggle, the callout below it.
  managerCase({
    id: 'manager-recipe-edit-results-failure-policy-never-present',
    label:
      'Manager — Recipe edit results, a failure set a never policy keeps, at the declared floor',
    smokeLabels: [],
    reaches: 'beyond',
    ...FAILURE_RESULTS(
      'lab-alchemy',
      'al-r-elixir',
      'failure-policy-never',
      SCROLL_TO(FAILURE_TOGGLE_CARD)
    ),
    expectView: 'recipe-edit',
    expectSelector: `[data-recipe-result-alchemy-simple]:has(${FAILURE_SET} [data-recipe-failure-set-note="policy"]):has(${FAILURE_POLICY} ${FAILURE_CHECKS}) ${FAILURE_TOGGLE_CARD}.is-on ${FAILURE_TOGGLE}:not(:disabled)`,
    expectCenterHit: [FAILURE_TOGGLE, FAILURE_CHECKS, '[data-recipe-failure-set-note="policy"]'],
    expectNoHorizontalOverflow: '[data-recipe-result-alchemy-simple]',
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [...SET_SOURCES],
  }),
  // Routed by ingredients (issue 2512): the gold route also reaches the Ring, so the Ring names two
  // sources and says it is shared, and nothing reaches the Amulet.
  managerCase({
    id: 'manager-recipe-edit-results-routed-shared',
    label: 'Manager — Recipe edit results, a result set two ingredient sets share',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTED_RESULTS('lab-jewelry', 'jw-r-cast', 'routed-shared'),
    expectView: 'recipe-edit',
    expectSelector: `${RESULT_SET('jw-grp-ring')}:has([data-route-sources-chip="jw-set-gold"]) .fabricate-set-card-note`,
    expectContained: [
      {
        container: RESULT_SET('jw-grp-amulet'),
        target: `${RESULT_SET('jw-grp-amulet')} [data-route-sources-unreachable]`,
      },
    ],
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-routed-shared-narrow',
    label:
      'Manager — Recipe edit results, a shared result set at the declared floor with a long source',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTED_RESULTS('lab-jewelry', 'jw-r-cast', 'routed-shared-long'),
    expectView: 'recipe-edit',
    expectSelector: `${RESULT_SET('jw-grp-ring')} [data-route-sources-chip="jw-set-silver"][title]`,
    expectNoHorizontalOverflow: '[data-recipe-tab="results"]',
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [...SET_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-routed-unreachable',
    label: 'Manager — Recipe edit results, a result set nothing routes to',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTED_RESULTS('lab-jewelry', 'jw-r-cast', 'routed-unreachable'),
    expectView: 'recipe-edit',
    expectSelector: `${RESULT_SET('jw-grp-brooch')}.is-warning [data-route-sources-unreachable]`,
    expectCenterHit: `${RESULT_SET('jw-grp-brooch')} [data-route-sources-assign]`,
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-routed-default',
    label: 'Manager — Recipe edit results, two ingredient sets reaching a result set by default',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTED_RESULTS('lab-jewelry', 'jw-r-cast', 'routed-default'),
    expectView: 'recipe-edit',
    expectSelector: `${RESULT_SET('jw-grp-ring')} [data-route-sources-chip="jw-set-gold"] .fabricate-route-sources-hint`,
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  // Assign open over every ingredient set, each saying where it routes today.
  managerCase({
    id: 'manager-recipe-edit-results-routed-assign',
    label: 'Manager — Recipe edit results, Assign open on a result set nothing routes to',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-jewelry', resultRowState: 'routed-unreachable' },
    steps: [
      ...ROUTED_RESULTS('lab-jewelry', 'jw-r-cast', null).steps,
      // The seed puts the unreachable Brooch first, so the portaled panel opens inside the frame.
      { selector: `${RESULT_SET('jw-grp-brooch')} [data-route-sources-assign]` },
    ],
    expectView: 'recipe-edit',
    // Two claims a closed-state frame fails: the panel is portaled onto the manager frame, and its
    // rows say where each set routes today.
    expectSelector:
      '.fabricate-manager > .fabricate-route-sources-popover [role="option"] .manager-travel-option-meta',
    expectContained: [
      { container: '.fabricate-manager', target: '.fabricate-route-sources-popover' },
    ],
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES, ...ANCHORED_POPOVER_SOURCES],
  }),
  // Routed by check: a set still lists a tier the policy no longer offers and one no longer defined.
  managerCase({
    id: 'manager-recipe-edit-results-routed-check-stale',
    label: 'Manager — Recipe edit results, listed tiers that do not route, struck',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTED_RESULTS('lab-runework', 'rw-r-blade', 'routed-check-stale'),
    expectView: 'recipe-edit',
    expectSelector: `${RESULT_SET('rw-grp-standard')}:has([data-route-sources-chip="rw-retired"][data-route-sources-struck]) [data-route-sources-chip="rw-ruined"][data-route-sources-struck][title="Ruined, does not route"]`,
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  // No tier is a Success and failed checks produce nothing: the longest hint wraps inside its line.
  managerCase({
    id: 'manager-recipe-edit-results-routed-check-policy-hint-narrow',
    label: 'Manager — Recipe edit results, the failure-policy hint at the declared floor',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTED_RESULTS('lab-runework', 'rw-r-blade', 'routed-check-no-success'),
    expectView: 'recipe-edit',
    expectSelector: `${RESULT_SET('rw-grp-standard')} [data-route-sources-hint]`,
    expectNoHorizontalOverflow: `${RESULT_SET('rw-grp-standard')} [data-route-sources-line]`,
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [...SET_SOURCES],
  }),
  // A result set's kebab open: its Remove, portaled onto the manager frame and on top.
  ...[
    ['manager-recipe-edit-results-set-menu', 'a result set’s menu open', undefined],
    [
      'manager-recipe-edit-results-set-menu-narrow',
      'a result set’s menu open at the declared floor',
      { width: 1024, height: 640 },
    ],
  ].map(([id, what, position]) =>
    managerCase({
      id,
      label: `Manager — Recipe edit results, ${what}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { system: 'lab-jewelry' },
      steps: [
        ...ROUTED_RESULTS('lab-jewelry', 'jw-r-cast', null).steps,
        // The first card, so the portaled menu opens inside the frame rather than off a card below the fold.
        { selector: `${RESULT_SET('jw-grp-ring')} [data-set-card-actions]` },
      ],
      expectView: 'recipe-edit',
      expectSelector:
        '.fabricate-manager > .fabricate-action-menu-panel [data-recipe-remove="result-set"]',
      expectCenterHit: '.fabricate-action-menu-panel [data-recipe-remove="result-set"]',
      ...(position && { position }),
      kinds: position ? ['manager', 'recipes', 'responsive'] : ['manager', 'recipes'],
      sourceMatches: [...SET_SOURCES, ...ANCHORED_POPOVER_SOURCES],
    })
  ),
  // The Overview's routing card (issue 2513), routed by ingredients: the gold route shares the
  // Ring with the silver one, and both adders close the list.
  managerCase({
    id: 'manager-recipe-edit-overview-routing-ingredients',
    label: 'Manager — Recipe edit overview, routing by ingredient set with a shared result set',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTING_OVERVIEW('lab-jewelry', 'jw-r-cast', 'routed-shared'),
    expectView: 'recipe-edit',
    expectSelector:
      `${ROUTING_CARD}:has([data-recipe-routing-add="ingredientSet"]):has(${ROW('set:jw-set-silver')}:has-text("shared · 2")) ` +
      `${ROW('set:jw-set-gold')}:has-text("shared · 2")`,
    expectLayout: ROUTING_GEOMETRY(),
    expectCenterHit: [...ROUTING_HITS],
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-overview-routing-default',
    label: 'Manager — Recipe edit overview, two ingredient sets routed by default',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTING_OVERVIEW('lab-jewelry', 'jw-r-cast', 'routed-default'),
    expectView: 'recipe-edit',
    expectSelector:
      `${ROUTING_CARD}:has(${ROW('set:jw-set-silver')} .fabricate-routing-overview-marker:has-text("default")) ` +
      `${ROW('set:jw-set-gold')} .fabricate-routing-overview-marker:has-text("default")`,
    expectLayout: ROUTING_GEOMETRY(),
    expectCenterHit: [...ROUTING_HITS],
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  // Routed by check on fixed tiers: a shared pair, the gap at 15, Rough below the Standard minimum
  // and the failure tier the policy forbids, at full size and at the declared floor.
  ...[
    ['manager-recipe-edit-overview-routing-check', 'routing by check on fixed tiers', undefined],
    [
      'manager-recipe-edit-overview-routing-check-narrow',
      'routing by check at the declared floor',
      { width: 1024, height: 640 },
    ],
  ].map(([id, what, position]) =>
    managerCase({
      id,
      label: `Manager — Recipe edit overview, ${what}`,
      smokeLabels: [],
      reaches: 'beyond',
      ...ROUTING_OVERVIEW('lab-runework', 'rw-r-blade', 'routing-fixed', 'tier:rw-ruined'),
      expectView: 'recipe-edit',
      expectSelector:
        `${ROUTING_CARD}:has(${ROW('tier:rw-fine')}:has-text("shared · 2"))` +
        `:has(${ROW('tier:rw-rough')}[data-routing-overview-blocked="below-minimum"])` +
        `:has(${ROW('tier:rw-ruined')}[data-routing-overview-blocked="policy"]) ` +
        `${ROW('gap:15')} [data-routing-gap-action]`,
      expectLayout: ROUTING_GEOMETRY(),
      expectCenterHit: [...ROUTING_HITS, `${ROUTING_CARD} [data-routing-gap-action]`],
      ...(position && { position, expectNoHorizontalOverflow: ROUTING_CARD }),
      kinds: position
        ? ['manager', 'recipes', 'responsive']
        : ['manager', 'recipes', 'resolution-mode'],
      sourceMatches: [...SET_SOURCES],
    })
  ),
  managerCase({
    id: 'manager-recipe-edit-overview-routing-check-permitted',
    label: 'Manager — Recipe edit overview, a failure tier routed only on a forced failure',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTING_OVERVIEW('lab-runework', 'rw-r-blade', 'routing-fixed-permitted', 'tier:rw-ruined'),
    expectView: 'recipe-edit',
    expectSelector:
      `${ROUTING_ROW('tier:rw-ruined')}[data-routing-overview-kind="source"]:has-text("Awards nothing") ` +
      '.fabricate-routing-overview-marker:has-text("only on a forced failure")',
    expectLayout: ROUTING_GEOMETRY(),
    expectCenterHit: [...ROUTING_HITS],
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  // Multi-step: the first step routes by default under the fallback note, and the second borrows
  // the recipe's result sets read-only beneath its own note.
  managerCase({
    id: 'manager-recipe-edit-overview-routing-multistep',
    label: 'Manager — Recipe edit overview, a routed step and a borrowing step',
    smokeLabels: [],
    reaches: 'beyond',
    ...ROUTING_OVERVIEW('lab-runework', 'rw-r-blade', 'routing-multistep'),
    expectView: 'recipe-edit',
    expectSelector:
      `${ROUTING_CARD}:has([data-recipe-routing-scope="rw-step-forge"] > h4 + .fabricate-routing-overview [data-recipe-routing-fallback-note])` +
      ' [data-recipe-routing-scope="rw-step-etch"] > h4 + .fabricate-routing-overview [data-recipe-routing-borrowed-note]',
    expectLayout: ROUTING_GEOMETRY('[data-recipe-routing-scope="rw-step-forge"]'),
    expectCenterHit: [...ROUTING_HITS],
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [...SET_SOURCES],
  }),
  managerCase({
    id: 'manager-recipe-edit-access-rail',
    label: 'Manager — Recipe edit access rail',
    smokeLabels: ['manager-recipe-edit-access-rail'],
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-access' }],
    expectView: 'access',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      // The manager router and the Crafting entry model (issue 1151), as `manager-books-scrolls-normal` records.
      /^src\/ui\/svelte\/apps\/manager\/(?:(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte|headerBreadcrumbs\.js)$/,
      /^src\/ui\/svelte\/apps\/manager\/crafting\/craftingNav\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-access-inspector',
    label: 'Manager — Recipe access inspector, a recipe selected',
    // The inspector no frame filled (issue 1513).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // The inspector's characters roster, not its root: the root renders in both branches and would pass over the empty state.
    expectSelector: '[data-access-inspector] [data-access-roster="characters"]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-selected',
    label: 'Manager — Recipe access rosters for a selected recipe',
    // The populated half of the access inspector (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    // `lab-alchemy` is `restricted`, which is what renders the Access rail entry, and `al-r-elixir` is on the resting page.
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // The populated branch, proved by an element only it has: the empty branch draws an `EmptyState` and nothing else.
    expectSelector:
      '.fabricate-manager [data-access-inspector]:has([data-access-summary])' +
      ' [data-access-roster="characters"] [data-access-character-row]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RosterRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-roster-paged',
    label: 'Manager — Recipe access players roster paged',
    // The roster's pager, which no case could reach (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy', manyPlayers: '1' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // A full page of six, which is the paged state stated as something the DOM can answer.
    expectSelector:
      '.fabricate-manager [data-access-inspector] [data-access-roster="players"]' +
      ' .manager-access-roster-rows [data-access-player-row]:nth-child(6)',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RosterRow\.svelte$/,
      // No `Pagination.svelte` pattern, though this frame is the registry's only paged roster.
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-roster-no-match',
    label: 'Manager — Recipe access players roster no match',
    // The per-roster no-match line (issue 1515): a roster of one has nothing a query can miss that the screen does not show.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy', manyPlayers: '1' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
      { selector: '[data-access-roster-search="players"]', fill: ACCESS_ROSTER_SEARCH_MISS_TERM },
    ],
    expectView: 'access',
    // Both rosters, because the claim is that one of them missed.
    expectSelector:
      '.fabricate-manager [data-access-inspector]' +
      ':has([data-access-roster="characters"] [data-access-character-row])' +
      ' [data-access-roster="players"] [data-access-roster-empty="players"]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      // No `EmptyState.svelte` pattern: it is a broad signal, so the pattern could never be consulted.
    ],
  }),
]);
