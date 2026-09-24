/**
 * System scope: the recipe editor tabs, its crafting-modifier states and the Access route.
 */

import {
  ACCESS_ROSTER_SEARCH_MISS_TERM,
  ANCHORED_POPOVER_SOURCES,
  CHECKS_ROUTE_MODEL_PATTERN,
} from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-recipe-edit-normal',
    label: 'Manager — Recipe edit normal',
    smokeLabels: ['manager-recipe-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
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
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
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
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-ingredients' },
    ],
    expectView: 'recipe-edit',
    // The converged row, named (issue 1373).
    expectSelector: '[data-recipe-option] [data-recipe-option-kind]',
    expectContained: [
      {
        container: '[data-recipe-option]',
        target: '[data-recipe-option-kind]',
      },
      // And the adders, which are three controls in one row rather than three stacked buttons: the set card draws them.
      {
        container: '[data-recipe-set]',
        target: '[data-recipe-add="tag-requirement"]',
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
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
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
  managerCase({
    id: 'manager-recipe-edit-tag-picker',
    label: 'Manager — Recipe edit, the tag picker open over a system vocabulary',
    smokeLabels: [],
    // No case in the registry opened this popover (issue 1373), which is why it went on drawing a panel that is not the design's.
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-option-tags]', scroll: true },
      { selector: '[data-recipe-option-tags] [data-recipe-add-tag]' },
    ],
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
    expectSelector: '.manager-recipe-or-popover [data-recipe-add="alternative-currency"]',
    // The panel is portaled to the manager root, so containment against the scrolling editor pane would be a false claim.
    expectContained: [{ container: '.fabricate-manager', target: '.manager-recipe-or-popover' }],
    // …and it is actually on top: a menu drawn under its row is contained, visible and useless.
    expectCenterHit: '.manager-recipe-or-popover [data-recipe-add="alternative-component"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
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
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
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
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
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
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
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
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-alchemy',
    label: 'Manager — Recipe edit results alchemy',
    smokeLabels: ['manager-recipe-edit-results-alchemy'],
    // Alchemy Results: an authored success set plus the reserved, undeletable failed-check set the editor draws itself.
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
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
