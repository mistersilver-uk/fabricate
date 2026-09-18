/**
 * System scope: the Checks rail, its modifier panels, and the tags and categories route.
 */

import { chooseSelectOption, managerCase } from './caseFactories.js';

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
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-validation',
    label: 'Manager — Checks validation',
    smokeLabels: ['manager-checks-validation'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#manager-checks-nav-validation' }],
    expectView: 'checks-validation',
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
      // A placement the shim REFUSES, so the whole formula is discarded: critical, not the
      // ignorable warning an additive placement raises.
      { selector: '[data-check-roll-formula]', fill: '1d20 * @craftingmod' },
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="retiredPlaceholderBreaksFormula"]', scroll: true },
    ],
    expectView: 'checks-validation',
    // The CRITICAL id specifically. A presence-only assertion would be satisfied by the
    // warning, which is the other half of the split and says the opposite thing.
    expectSelector: '.fabricate-manager [data-issue="retiredPlaceholderBreaksFormula"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  // Six states the old four-tab surface had no shape for, and every one of them is a claim this
  // change makes that only a photograph settles.
  managerCase({
    id: 'manager-checks-rail-group',
    label: 'Manager — Checks rail group expanded',
    reaches: 'beyond',
    smokeLabels: [],
    // Jewelry is the system whose SALVAGE is routed with no authored check, so salvage
    // carries a real readiness issue: the parent badge, the salvage child badge and the
    // Validation child badge are all visible together, which is the whole rule the frame
    // has to settle (the parent sums the ACTIVITY children only, and Validation restates
    // that total rather than adding to it).
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
    // No frame in the prototype shows a section carrying both markers, and they occupy the same
    // slot, so this is the one that proves they do not collide.
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
    // Reached by turning the check off rather than by a fixture whose check is already off: every
    // lab system authors an enabled check, and a seventh system carrying a disabled one would
    // change the system count every other manager frame is composed against.
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
    // The 1024x640 declared floor, and it is stacked there rather than a side rail: the shipped
    // `fabricate-manager` container ladder restacks `.manager-body` to one column at 1120, so at
    // the floor every panel is reached by scrolling the body.
    query: { system: 'lab-runework' },
    steps: ['Checks', { selector: '#manager-checks-nav-crafting' }],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-checks-rail="crafting"]',
    position: { width: 1024, height: 640 },
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks', 'responsive'],
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
    // The activity that renders the policy and no consumption toggles, because it has no
    // consumption block — plus the dormancy notice naming issue 683 and the read-only
    // `task.failureOutcome` cross-reference in its no-record state.
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
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-failure-tier',
    label: 'Manager — Recipe edit results failure tier',
    // Decision 7, and the only frame of it: a routed-by-check recipe's result-group card offering a
    // failure-marked outcome tier, which is reachable only because `lab-runework`'s crafting check
    // authors `failureResultPolicy: 'always'`.
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
    // The check-modifier catalogue card, which sits last in the crafting panel and is therefore
    // below the fold of `manager-checks-crafting-consumption`'s frame — hence a dedicated capture
    // that scrolls to it.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '' },
      // Re-anchored (issue 1095 review).
      { selector: '[data-crafting-modifier-max-picks]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Two things at once, on the one card — and that card is `How they combine`, which issue 1096's
    // parity round split out of the catalogue card.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-policy-card]' +
      ':has([data-crafting-modifier-policy-option="bySubject"])' +
      ':has([data-crafting-modifier-max-picks="unlimited"])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifier-max-picks',
    label: 'Manager — Checks crafting modifiers, pick cap set',
    // BEYOND the smoke: the walk never presses a rule card and never types in this field, so no
    // counterpart frame of a BOUNDED cap exists.
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
      // The cap field, which is this case's whole subject and the card's last element, so the frame
      // carries the rule grid above it.
      { selector: '[data-crafting-modifier-max-picks]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The VALUE, not the presence of a field: a fill that silently did not land leaves the field
    // rendered and blank, which is the sibling frame published under this name.
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
    // BEYOND the smoke: the walk never opens a system carrying a catalogue on this tab, and the
    // two sibling cases above frame the rule grid and the cap rather than the entries.
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
    // The whole of the rebuilt CARD, clause by clause, because each clause is a thing that shipped
    // wrong and could come back: the rule's sentence in the head's description slot, the read-only
    // expression, the bounds chip on the row, the deep link (which was a full-width button at the
    // foot), and the library note that now closes the card instead of opening it.
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
      // The entry row itself, which sits outside `checks/` since issue 1373's round 4 moved it into
      // a shared component the Tool Studio's check-bonus picker also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  // Every activity renders the library read-only now, with a bounds chip and a link to the system
  // editor, while the per-entry eligibility control and the rule grid stay fully editable.
  managerCase({
    id: 'manager-checks-salvage-modifiers',
    label: 'Manager — Checks salvage modifiers',
    // BEYOND the smoke: the walk never opens the salvage sub-tab of a system carrying a
    // library, so no counterpart frame of these rows exists.
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
    // The read-only row, asserted through the one element the retired editable branch could not
    // draw.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-catalogue="salvage"]' +
      ':has([data-crafting-modifier-readonly="expression"])' +
      ':has(.manager-modifier-bounds-chip)' +
      ':has([data-crafting-modifier-edit-link])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
      // The entry row itself, which sits outside `checks/` since issue 1373's round 4 moved it into
      // a shared component the Tool Studio's check-bonus picker also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-gathering-modifiers',
    label: 'Manager — Checks gathering modifiers',
    // BEYOND the smoke, and the only frame of the DORMANCY notice against a populated catalogue:
    // `manager-checks-gathering` runs on the default system, whose catalogue is empty, so its card
    // draws the empty state and none of the rows the notice is about.
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
    // The gathering card carries TWO notices no other activity's does — the check-vs-character
    // modifier disambiguation and the issue-683 dormancy note — and both are stated against real
    // rows here rather than against an empty catalogue.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-catalogue="gathering"]' +
      ':has([data-gathering-modifier-disambiguation])' +
      ':has([data-check-modifier-dormant])' +
      ':has([data-crafting-modifier-readonly="expression"])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
      // The entry row itself, which sits outside `checks/` since issue 1373's round 4 moved it into
      // a shared component the Tool Studio's check-bonus picker also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  // `SubjectModifierPicker` is one component with two hosts, and both gate it on the activity's
  // rule being `bySubject`.
  managerCase({
    id: 'manager-component-edit-salvage-modifier-pick',
    label: 'Manager — Component edit salvage modifier pick',
    // BEYOND the smoke: the walk never presses a rule card, so the picker is on no smoke frame.
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
    // The picker AND its inherit note.
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
    // The rail's gathering group is a SUBMENU, so reaching the task library is two clicks —
    // the same route `manager-gathering-task-editor-normal` takes, after the rule click.
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
    // The task card, the picker inside it AND the picker's inherit note: the card carries the
    // check-vs-character modifier hint, which is the disambiguation this screen is the second half
    // of, and the note is where the inherited entries are named.
    expectSelector:
      '.fabricate-manager [data-gathering-task-check-modifiers] ' +
      '[data-subject-modifier-picker="gathering-check-modifier"] ' +
      '[data-subject-modifier-inherited]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SubjectModifierPicker\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifiers-narrow',
    label: 'Manager — Checks crafting modifiers narrow',
    // BEYOND the smoke: the walk runs one geometry, and the whole subject here is the other one.
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
    // The component library's half of the grouped-continuation pair: page two of a category-major
    // list, where a category larger than the page continues across the boundary.
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
  managerCase({
    id: 'manager-tags-categories-normal',
    label: 'Manager — Tags categories normal',
    smokeLabels: ['manager-tags-categories-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tags' }, { selector: '#vocabulary-tab-recipe' }],
    expectView: 'tags',
    kinds: ['manager', 'tags'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      // `VocabularyTabs` is the strip issue 1429 extracted out of `TagsCategoriesView`, so the
      // `TagsCategories` prefix above stops reaching it.
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyTabs|VocabularyPanel|InlineVocabularyAdd)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tags-categories-tags-tab',
    label: 'Manager — Tags categories tags tab',
    smokeLabels: ['manager-tags-categories-tags-tab'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tags' }, { selector: '#vocabulary-tab-tag' }],
    expectView: 'tags',
    kinds: ['manager', 'tags'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/VocabularyTabs\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tags-categories-stacked',
    label: 'Manager — Tags categories stacked',
    smokeLabels: ['manager-tags-categories-stacked'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tags' }, { selector: '#vocabulary-tab-recipe' }],
    expectView: 'tags',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'tags', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/VocabularyTabs\.svelte$/,
    ],
  }),
]);
