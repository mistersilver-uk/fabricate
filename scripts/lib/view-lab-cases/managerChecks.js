/**
 * System scope: the Checks rail, its modifier panels, and the tags and categories route.
 */

import { ANCHORED_POPOVER_SOURCES, GATHERING_ROUTE_MODEL_PATTERN } from './caseConstants.js';
import { chooseSelectOption, managerCase } from './caseFactories.js';

const AUTHOR_TRANSFORMED_MODIFIER = Object.freeze([
  { selector: '#manager-world-nav-rules', press: 'Enter' },
  { selector: '#manager-rules-nav-modifiers', press: 'Enter' },
  { selector: '[data-world-modifier="hb-mod-luck"] [data-toggle-modifier]' },
  {
    selector: '[data-world-modifier="hb-mod-luck"] [data-world-modifier-field="label"]',
    fill: 'Lucky find with a deliberately long transformed modifier name',
  },
  {
    selector: '[data-world-modifier="hb-mod-luck"] [data-world-modifier-field="expression"]',
    fill: '1d20cs>15',
  },
  { selector: '[data-world-modifier-done="hb-mod-luck"]' },
]);

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-checks-gathering',
    label: 'Manager — Checks gathering',
    smokeLabels: ['manager-checks-gathering'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#manager-checks-nav-gathering' }],
    expectView: 'checks-gathering',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-validation',
    label: 'Manager — Checks validation',
    smokeLabels: ['manager-checks-validation'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      ...AUTHOR_TRANSFORMED_MODIFIER,
      'Checks',
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="modifierAverageUnavailable"]', scroll: true },
    ],
    expectView: 'checks-validation',
    expectSelector: '.fabricate-manager [data-issue="modifierAverageUnavailable"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  // The retired-placeholder readiness split (issue 1094).
  managerCase({
    id: 'manager-checks-validation-retired-placeholder',
    label: 'Manager — Checks validation retired placeholder',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      // A placement the shim refuses, so the whole formula is discarded: critical, not an ignorable warning.
      { selector: '[data-check-roll-formula]', fill: '1d20 * @craftingmod' },
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="retiredPlaceholderBreaksFormula"]', scroll: true },
    ],
    expectView: 'checks-validation',
    // The critical id specifically: a presence-only assertion is satisfied by the warning, which says the opposite.
    expectSelector: '.fabricate-manager [data-issue="retiredPlaceholderBreaksFormula"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  // Six states the old four-tab surface had no shape for, each a claim only a photograph settles.
  managerCase({
    id: 'manager-checks-rail-group',
    label: 'Manager — Checks rail group expanded',
    reaches: 'beyond',
    smokeLabels: [],
    // Jewelry's salvage is routed with no authored check, so parent, salvage and Validation badges show together.
    query: { system: 'lab-jewelry' },
    steps: ['Checks'],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-checks-nav-issues="checks"]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  managerCase({
    id: 'manager-checks-rail-dirty',
    label: 'Manager — Checks rail dirty marker beside an issue badge',
    reaches: 'beyond',
    smokeLabels: [],
    // The three-marker column.
    query: { system: 'lab-jewelry' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-check-roll-formula]', fill: '1d20 + @prof + 2' },
      { selector: '#manager-checks-nav-salvage' },
    ],
    expectView: 'checks-salvage',
    expectSelector: '.fabricate-manager [data-checks-nav-dirty="crafting"]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  managerCase({
    id: 'manager-checks-section-badged-and-dotted',
    label: 'Manager — Checks section with a count AND a warning dot',
    reaches: 'beyond',
    smokeLabels: [],
    // No prototype frame shows a section carrying both markers, and they share a slot, so this proves they do not collide.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-outcomes' },
      { selector: '[data-outcome-name]', fill: '' },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-checks-section-dot="outcomes"]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  managerCase({
    id: 'manager-checks-off',
    label: 'Manager — Checks crafting switched off',
    reaches: 'beyond',
    smokeLabels: [],
    // Reached by turning the check off: a seventh system carrying a disabled one would move the system count.
    query: { system: 'lab-jewelry' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-checks-active-toggle]' },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-checks-off-empty]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  managerCase({
    id: 'manager-checks-stacked-floor',
    label: 'Manager — Checks stacked at the declared floor',
    reaches: 'beyond',
    smokeLabels: [],
    // The 1024x640 declared floor, stacked: the container ladder restacks `.manager-body` to one column at 1120.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-check-roll-formula]', fill: '1d20cs>15' },
      { selector: '.manager-checks-formula', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-check-formula-average-withheld="die-modifiers"]',
    position: { width: 1024, height: 640 },
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks', 'responsive'],
  }),
  // The first open-panel frame in the checks studio (issue 1510), and the only way to photograph a
  // converted control's own subject: the list exists only while the panel is open, and an open panel
  // cannot double as this route's closed-state frame. Its list is ticked and it opens from inside a
  // trigger card the walk has to author first, which no other panel frame draws.
  managerCase({
    id: 'manager-checks-trigger-operator-list',
    label: 'Manager — Checks trigger comparison list',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    // The walk stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      { selector: '[data-add-trigger]' },
      { selector: '[data-trigger-operator]' },
    ],
    expectView: 'checks-crafting',
    // Three claims a closed-state frame fails: the panel exists, it is the ticked list, and it draws the comparison a GM says out loud rather than the operator symbol the model stores.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover.fabricate-select-popover-ticked' +
      ' [data-popover-option=">="] .fabricate-select-label',
    // The panel sits inside the application root rather than clipped by the card it opened from.
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\//, ...ANCHORED_POPOVER_SOURCES],
  }),
  managerCase({
    id: 'manager-checks-crafting-consumption',
    label: 'Manager — Checks crafting consumption',
    smokeLabels: ['manager-checks-crafting-consumption'],
    reaches: 'exact',
    query: {},
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-on-failure' },
    ],
    expectView: 'checks-crafting',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-salvage-on-failure',
    label: 'Manager — Checks salvage on failure',
    // Beyond the smoke, and beyond every previous build: this section has never existed.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-salvage' },
      { selector: '#checks-section-on-failure' },
    ],
    expectView: 'checks-salvage',
    expectSelector:
      '.fabricate-manager [data-failure-result-policy="salvage"]' +
      ' ~ [data-salvage-failure-consumption]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-gathering-on-failure',
    label: 'Manager — Checks gathering on failure',
    // The activity with no consumption block, plus the dormancy notice and the read-only `task.failureOutcome` reference.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-gathering' },
      { selector: '#checks-section-on-failure' },
    ],
    expectView: 'checks-gathering',
    expectSelector:
      '.fabricate-manager [data-checks-panel="gathering"]' +
      ':has([data-failure-result-policy="gathering"])' +
      ':has([data-gathering-failure-dormant])' +
      ':has([data-gathering-failure-outcome-empty])' +
      ':not(:has([data-salvage-failure-consumption]))' +
      ':not(:has([data-failure-consumption]))',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-failure-tier',
    label: 'Manager — Recipe edit results failure tier',
    // Decision 7's only frame: reachable because `lab-runework`'s crafting check authors `failureResultPolicy: 'always'`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
      { selector: '[data-recipe-add="routing-option"]' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      /^src\/systems\/ResolutionModeService\.js$/,
      /^src\/utils\/routedOutcomeKeywords\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifiers',
    label: 'Manager — Checks crafting modifiers',
    smokeLabels: ['manager-checks-crafting-modifiers'],
    // The catalogue card sits last in the crafting panel, below the consumption frame's fold, so this capture scrolls to it.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      ...AUTHOR_TRANSFORMED_MODIFIER,
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="highest"] input' },
      { selector: '[data-crafting-modifier-policy-option="playerPicks"] input' },
      { selector: '[data-crafting-modifier-eligibility-input="hb-mod-luck"]' },
      { selector: '[data-crafting-modifier-eligibility-input="hb-mod-luck"]' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '' },
      { selector: '[data-checks-section-callout="modifierAverageUnavailable"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Two things at once on the `How they combine` card, which issue 1096's parity round split out of the catalogue card.
    expectSelector:
      '.fabricate-manager' +
      ':has([data-crafting-modifier-policy-card])' +
      ':has([data-crafting-modifier-policy-card] [data-crafting-modifier-policy-option="bySubject"])' +
      ':has([data-crafting-modifier-policy-card] [data-crafting-modifier-max-picks="unlimited"])' +
      ':has([data-checks-section-callout="modifierAverageUnavailable"])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifier-max-picks',
    label: 'Manager — Checks crafting modifiers, pick cap set',
    // Beyond the smoke: the walk never presses a rule card or types here, so no bounded-cap counterpart exists.
    reaches: 'beyond',
    smokeLabels: [],
    // The other half of the cap's two readings.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '1' },
      // The cap field, this case's whole subject and the card's last element, so the rule grid sits above it.
      { selector: '[data-crafting-modifier-max-picks]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The value, not the presence of a field: a fill that did not land leaves it rendered and blank.
    expectSelector: '.fabricate-manager [data-crafting-modifier-max-picks="1"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifier-entries',
    label: 'Manager — Checks crafting modifier entries',
    // Beyond the smoke: the walk never opens a system carrying a catalogue on this tab.
    reaches: 'beyond',
    smokeLabels: [],
    // The crafting rows, and since issue 1117 what they show is the absence of an editor.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      {
        selector: '[data-crafting-modifier-catalogue="crafting"] .manager-checks-card-title',
        scroll: true,
      },
    ],
    expectView: 'checks-crafting',
    // The rebuilt card clause by clause, because each clause is a thing that shipped wrong and could come back.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-catalogue="crafting"]' +
      ':has(.manager-checks-card-head [data-crafting-modifier-defaults])' +
      ':has([data-crafting-modifier-readonly="expression"])' +
      ':has(.manager-modifier-readonly-row .manager-modifier-bounds-chip)' +
      ':has(.manager-checks-card-head [data-crafting-modifier-edit-link])' +
      ':has([data-crafting-modifier-library-note])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
      // The entry row sits outside `checks/` since issue 1373 moved it into a component the Tool Studio also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  // Every activity renders the library read-only now, while eligibility and the rule grid stay editable.
  managerCase({
    id: 'manager-checks-salvage-modifiers',
    label: 'Manager — Checks salvage modifiers',
    // Beyond the smoke: the walk never opens the salvage sub-tab of a system carrying a library.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-salvage' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-rows]', scroll: true },
    ],
    expectView: 'checks-salvage',
    // The read-only row, asserted through the one element the retired editable branch could not draw.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-catalogue="salvage"]' +
      ':has([data-crafting-modifier-readonly="expression"])' +
      ':has(.manager-modifier-bounds-chip)' +
      ':has([data-crafting-modifier-edit-link])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
      // The entry row sits outside `checks/` since issue 1373 moved it into a component the Tool Studio also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-gathering-modifiers',
    label: 'Manager — Checks gathering modifiers',
    // Beyond the smoke, and the only frame of the dormancy notice against a populated catalogue.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-gathering' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-rows]', scroll: true },
    ],
    expectView: 'checks-gathering',
    // The gathering card's two unique notices are stated against real rows here rather than an empty catalogue.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-catalogue="gathering"]' +
      ':has([data-gathering-modifier-disambiguation])' +
      ':has([data-check-modifier-dormant])' +
      ':has([data-crafting-modifier-readonly="expression"])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
      // The entry row sits outside `checks/` since issue 1373 moved it into a component the Tool Studio also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  // `SubjectModifierPicker` is one component with two hosts, and both gate it on the rule being `bySubject`.
  managerCase({
    id: 'manager-component-edit-salvage-modifier-pick',
    label: 'Manager — Component edit salvage modifier pick',
    // Beyond the smoke: the walk never presses a rule card, so the picker is on no smoke frame.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-salvage' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-cracked-alembic"] ' +
          '[data-component-edit]',
      },
      { selector: '[data-subject-modifier-picker="salvage-check-modifier"]', scroll: true },
    ],
    expectView: 'component-edit',
    // The picker and its inherit note.
    expectSelector:
      '.fabricate-manager [data-subject-modifier-picker="salvage-check-modifier"] ' +
      '[data-subject-modifier-inherited]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SubjectModifierPicker\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-edit-modifier-pick',
    label: 'Manager — Gathering task edit modifier pick',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // The rail's gathering group is a submenu, so reaching the task library is two clicks, then the rule click.
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-gathering' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-check-modifiers]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // The task card, the picker inside it and the picker's inherit note, where the inherited entries are named.
    expectSelector:
      '.fabricate-manager [data-gathering-task-check-modifiers] ' +
      '[data-subject-modifier-picker="gathering-check-modifier"] ' +
      '[data-subject-modifier-inherited]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      GATHERING_ROUTE_MODEL_PATTERN,
      /^src\/ui\/svelte\/apps\/manager\/SubjectModifierPicker\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifiers-narrow',
    label: 'Manager — Checks crafting modifiers narrow',
    // Beyond the smoke: the walk runs one geometry, and the whole subject here is the other one.
    reaches: 'beyond',
    smokeLabels: [],
    // The 1x4 reflow, which is only judgeable from a photograph.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Re-pointed at the rule card (issue 1096's parity round).
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-policy-card] [data-crafting-modifier-policy]',
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'checks', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-components-stacked',
    label: 'Manager — Components stacked',
    smokeLabels: ['manager-components-stacked'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-grouped-continuation',
    label: 'Manager — Components grouped continuation',
    smokeLabels: ['manager-components-grouped-continuation'],
    // The component library's grouped-continuation half: page two of a category-major list crossing the boundary.
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      ...chooseSelectOption('.manager-main [data-pagination-size]', '10'),
      { selector: '.manager-main [data-pagination-next]' },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  // THE THREE VOCABULARY FRAMES, all three kept through issue 1915's convergence. `-tags-tab` is
  // retained under its old id for golden and evidence-map stability; there is no tab to open any
  // more, so it now selects the TAG panel's sort control instead.
  managerCase({
    id: 'manager-tags-categories-normal',
    label: 'Manager — Tags categories normal',
    smokeLabels: ['manager-tags-categories-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tags' }],
    expectView: 'tags',
    // Like-for-like with `world-vocabulary`: one shell, two frames, the same frame.
    position: { width: 1280, height: 1000 },
    // Each panel's trailing delete control, measured inside ITS OWN panel (issue 1915).
    expectContained: [
      {
        container: '[data-vocabulary-panel="recipeCategories"]',
        target: '[data-category-id] .manager-icon-button',
      },
      {
        container: '[data-vocabulary-panel="componentCategories"]',
        target: '[data-component-category-id] .manager-icon-button',
      },
      {
        container: '[data-vocabulary-panel="componentTags"]',
        target: '[data-tag-id] .manager-icon-button',
      },
    ],
    kinds: ['manager', 'tags'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyShell|VocabularyShellPanel|VocabularyPanel|InlineVocabularyAdd)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/(vocabularyShell|systemVocabularyStudio)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-tags-categories-tags-tab',
    label: 'Manager — Tags categories tags tab',
    smokeLabels: ['manager-tags-categories-tags-tab'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tags' },
      // The tag band's own direction toggle, which leaves it sorted DESCENDING in the frame.
      { selector: '[data-vocabulary-panel="componentTags"] [data-vocabulary-direction]' },
      // And the band itself, scrolled into frame: it sits beneath the 2-up category grid, so a
      // frame taken where the click left the page depicts the categories rather than the tags.
      { selector: '[data-vocabulary-panel="componentTags"]', scroll: true },
    ],
    expectView: 'tags',
    expectSelector: '[data-vocabulary-panel="componentTags"] [data-vocabulary-direction="desc"]',
    position: { width: 1280, height: 1000 },
    kinds: ['manager', 'tags'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyShell|VocabularyShellPanel|VocabularyPanel|InlineVocabularyAdd)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/(vocabularyShell|systemVocabularyStudio)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-tags-categories-stacked',
    label: 'Manager — Tags categories stacked',
    smokeLabels: ['manager-tags-categories-stacked'],
    reaches: 'exact',
    query: {},
    // ONE COLUMN, with a confirm strip ARMED on a referenced row: the state where a 354px card
    // has to hold the two confirm buttons without wrapping them out of it.
    steps: [
      { selector: '#manager-nav-tags' },
      {
        // `:not(.is-danger)` is load-bearing: an unreferenced row's delete wears `is-danger` and
        // fires in one click with no confirm, which would mutate the fixture mid-capture.
        selector:
          '[data-vocabulary-panel="componentCategories"] [data-component-category-id] .manager-icon-button:not(.is-danger)',
      },
    ],
    expectView: 'tags',
    expectSelector: '[data-vocabulary-confirm]',
    position: { width: 1000, height: 700 },
    expectContained: [
      {
        container: '[data-vocabulary-panel="recipeCategories"]',
        target: '[data-category-id] .manager-icon-button',
      },
      {
        container: '[data-vocabulary-panel="componentCategories"]',
        target: '[data-component-category-id] .manager-icon-button',
      },
      {
        container: '[data-vocabulary-panel="componentTags"]',
        target: '[data-tag-id] .manager-icon-button',
      },
    ],
    kinds: ['manager', 'tags', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyShell|VocabularyShellPanel|VocabularyPanel|InlineVocabularyAdd)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/(vocabularyShell|systemVocabularyStudio)\.js$/,
    ],
  }),
]);
