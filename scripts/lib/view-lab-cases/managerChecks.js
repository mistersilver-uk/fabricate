/**
 * System scope: the Checks rail, its modifier panels, and the tags and categories route.
 */

import { ANCHORED_POPOVER_SOURCES, GATHERING_ROUTE_MODEL_PATTERN } from './caseConstants.js';
import { chooseSelectOption, managerCase, previewAsActor } from './caseFactories.js';

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

/*
 * The roll-under Studio parity states (issue 2005), one per approved-prototype frame that depicts
 * a surface the roll-under authoring changes. Each fixture reproduces its frame's content where the
 * lab can: the same tier names and numbers, and a formula with the frame's range where the frame's
 * own dice cannot be authored (a roll-under refuses 3d6, so `1d20` stands in at the same average).
 */
const PARITY_NAV = Object.freeze(['Checks', { selector: '#manager-checks-nav-crafting' }]);
const PARITY_SOURCES = Object.freeze([/^src\/ui\/svelte\/apps\/manager\/checks\//]);
const nthMatch = (selector, index) => `:nth-match(${selector}, ${index})`;
const parityFormula = (formula) => [{ selector: '[data-check-roll-formula]', fill: formula }];
const parityType = (selector, index, value) => [
  { selector: nthMatch(selector, index), fill: value },
  { selector: nthMatch(selector, index), press: 'Enter' },
];
const PARITY_UNDER = Object.freeze([{ selector: '[data-check-direction-option="under"]' }]);
const parityAttribute = (expression) => [
  { selector: '[data-check-target-source-option="attribute"] input' },
  { selector: '[data-check-target-expression]', fill: expression },
];
const PARITY_MULTIPLY = Object.freeze([
  { selector: '[data-check-adjustment-kind-option="multiply"]' },
]);
/** Grow the recipe tier list from `existing` rows to `names`, naming each and typing its value. */
const parityTiers = (existing, names, field, values) => [
  ...Array.from({ length: names.length - existing }, () => ({ selector: '[data-add-tier]' })),
  ...names.map((name, index) => ({
    selector: nthMatch('[data-tier-name]', index + 1),
    fill: name,
  })),
  ...values.flatMap((value, index) => parityType(field, index + 1, value)),
];
/** Preview the record at `position` in the Studio's own `Preview against` list. */
const parityPreview = (position) => [
  { selector: '[data-checks-preview-record]' },
  { selector: nthMatch('.fabricate-select-popover [data-popover-option]', position + 1) },
];
const PARITY_WORK_TIERS = Object.freeze([
  'Simple Work',
  'Standard Work',
  'Hard Work',
  'Heroic Work',
]);
/** The frame-11 and frame-12 outcome ladders, typed onto a fresh routed list. */
const parityOutcomes = (names, field, values, counts) => [
  { selector: '#checks-section-outcomes' },
  { selector: '[data-add-outcome-tier]' },
  ...names.map((name, index) => ({
    selector: nthMatch('[data-outcome-name]', index + 1),
    fill: name,
  })),
  ...values.flatMap(([index, value]) => parityType(field, index, value)),
  ...counts.map((flag, index) => ({
    selector: `${nthMatch('[data-outcome-row]', index + 1)} [data-outcome-success-option="${flag}"]`,
  })),
];
const parityCase = ({ id, label, frame, query = {}, steps, expectSelector }) =>
  managerCase({
    id,
    label: `Manager — Checks roll-under parity, ${label} (prototype state ${frame})`,
    reaches: 'beyond',
    smokeLabels: [],
    query,
    steps: [...PARITY_NAV, ...steps],
    expectView: 'checks-crafting',
    expectSelector,
    kinds: ['manager', 'checks'],
    sourceMatches: PARITY_SOURCES,
  });

/*
 * The roll-under preview states (issue 2003): the Studio's odds panel, simulator readout,
 * abstention and readiness for roll-under and character-value checks, each on the frame it answers.
 */
const UNDER_FIXED_STEPS = Object.freeze([
  ...parityFormula('1d20'),
  ...previewAsActor('lab-actor-idrin'),
  ...PARITY_UNDER,
  ...parityType('[data-check-dc]', 1, '10'),
  ...parityTiers(2, PARITY_WORK_TIERS, '[data-tier-dc]', ['12', '10', '8', '6']),
  ...parityPreview(2),
]);
/** Runework's multiplied character value (Idrin's 55) routed across Failure to Extreme. */
const underMultiplySteps = (expression, actor = 'lab-actor-idrin') => [
  ...parityFormula('1d100'),
  ...(actor ? previewAsActor(actor) : []),
  ...PARITY_UNDER,
  ...parityAttribute(expression),
  ...PARITY_MULTIPLY,
  ...parityType('[data-check-base-adjustment]', 1, '1'),
  ...parityTiers(0, ['Standard', 'Demanding'], '[data-tier-adjustment]', ['1', '1/2']),
  ...parityPreview(1),
  ...parityOutcomes(
    ['Failure', 'Regular', 'Hard', 'Extreme'],
    '[data-outcome-adjustment]',
    [
      [2, '1'],
      [3, '1/2'],
      [4, '1/5'],
    ],
    ['failure', 'success', 'success', 'success']
  ),
];
const SCROLL_ODDS = Object.freeze([{ selector: '[data-checks-odds]', scroll: true }]);
const ROLL_PREVIEW = Object.freeze([
  { selector: '[data-checks-simulator-roll]' },
  { selector: '[data-checks-simulator-panel]', scroll: true },
]);
/** Rewrite one of Runework's library modifiers to roll `expression`, before opening Checks. */
const runeworkRollingModifier = (expression) => [
  { selector: '#manager-world-nav-rules', press: 'Enter' },
  { selector: '#manager-rules-nav-modifiers', press: 'Enter' },
  { selector: '[data-world-modifier="rw-mod-chisel"] [data-toggle-modifier]' },
  {
    selector: '[data-world-modifier="rw-mod-chisel"] [data-world-modifier-field="expression"]',
    fill: expression,
  },
  { selector: '[data-world-modifier-done="rw-mod-chisel"]' },
];
const UNDER_OUTCOMES_FIXED = Object.freeze([
  ...parityFormula('1d20'),
  ...previewAsActor('lab-actor-idrin'),
  ...PARITY_UNDER,
  ...parityTiers(0, ['Standard Work'], '[data-tier-dc]', ['10']),
  ...parityPreview(1),
  ...parityOutcomes(
    ['Botched', 'Flawed', 'Success', 'Fine'],
    '[data-outcome-dc]',
    [
      [1, '-4'],
      [2, '-1'],
      [3, '0'],
      [4, '+3'],
    ],
    ['failure', 'failure', 'success', 'success']
  ),
]);
const underCase = ({ id, label, frame, query = {}, steps, expectView, expectSelector, nav }) =>
  managerCase({
    id,
    label: `Manager — Checks roll-under preview, ${label} (prototype state ${frame})`,
    reaches: 'beyond',
    smokeLabels: [],
    query,
    steps: ['Checks', { selector: nav ?? '#manager-checks-nav-crafting' }, ...steps],
    expectView: expectView ?? 'checks-crafting',
    expectSelector,
    kinds: ['manager', 'checks'],
    sourceMatches: PARITY_SOURCES,
  });

/*
 * The success-counting preview states (issue 2004): the odds panel, simulator readout, abstention,
 * readiness and Validation rows for a count check, seeded onto Karrun Forgecraft through the lab's
 * `checkPreviewState` (count authoring is issue 2006's), each on the prototype frame it answers.
 */
const COUNT_ODDS = Object.freeze([{ selector: '[data-checks-odds]', scroll: true }]);
const COUNT_IDRIN = Object.freeze(previewAsActor('lab-actor-idrin'));
const COUNT_ROLL = Object.freeze([
  { selector: '[data-checks-simulator-roll]' },
  { selector: '[data-checks-simulator-panel]', scroll: true },
]);
const countCase = ({ id, label, frame, state = 'dice-pool', nav = 'crafting', steps, ...rest }) =>
  managerCase({
    id,
    label: `Manager — Checks count preview, ${label} (prototype state ${frame})`,
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-smithing', checkPreviewState: state },
    steps: ['Checks', { selector: `#manager-checks-nav-${nav}` }, ...steps],
    expectView: `checks-${nav}`,
    kinds: ['manager', 'checks'],
    sourceMatches: PARITY_SOURCES,
    ...rest,
  });

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
  // The transformed-modifier average warning (issue 2000).
  managerCase({
    id: 'manager-checks-validation-average-unavailable',
    label: 'Manager — Checks validation modifier average unavailable',
    reaches: 'beyond',
    smokeLabels: [],
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
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '' },
      // Re-anchored (issue 1095 review).
      { selector: '[data-crafting-modifier-max-picks]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Two things at once on the `How they combine` card, which issue 1096's parity round split out of the catalogue card.
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
    // Beyond the smoke: the walk never presses a rule card or types here, so no bounded-cap counterpart exists.
    reaches: 'beyond',
    smokeLabels: [],
    // The other half of the cap's two readings.
    query: { system: 'lab-herbalism' },
    steps: [
      ...AUTHOR_TRANSFORMED_MODIFIER,
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="playerPicks"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '1' },
      // The cap field, this case's whole subject and the card's last element, so the rule grid sits above it.
      { selector: '[data-crafting-modifier-max-picks]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The value, not the presence of a field: a fill that did not land leaves it rendered and blank.
    // A cap of 1 over four eligible entries ranks the transformed one out, so it warns.
    expectSelector:
      '.fabricate-manager' +
      ':has([data-crafting-modifier-max-picks="1"])' +
      ':has([data-checks-section-callout="modifierAverageUnavailable"])',
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
  parityCase({
    id: 'manager-checks-parity-over-fixed',
    label: 'higher is better, fixed difficulty',
    frame: 1,
    steps: [
      ...parityFormula('1d20 + @prof'),
      ...previewAsActor('lab-actor-idrin'),
      ...parityType('[data-check-dc]', 1, '12'),
      ...parityTiers(
        2,
        ['Common Craft', 'Uncommon Craft', 'Rare Craft', 'Very Rare Craft', 'Legendary Craft'],
        '[data-tier-dc]',
        ['8', '12', '15', '19', '23']
      ),
      ...parityPreview(2),
    ],
    expectSelector: '.fabricate-manager [data-check-direction-field]',
  }),
  parityCase({
    id: 'manager-checks-parity-over-attribute',
    label: 'higher is better, character value added',
    frame: 2,
    steps: [
      ...parityFormula('1d20 + @prof'),
      ...previewAsActor('lab-actor-idrin'),
      ...parityAttribute('@skills.med.mod + 8'),
      ...parityType('[data-check-base-adjustment]', 1, '0'),
      ...parityTiers(2, PARITY_WORK_TIERS, '[data-tier-adjustment]', ['-2', '0', '+3', '+6']),
      ...parityPreview(2),
    ],
    expectSelector: '.fabricate-manager [data-check-attribute-fields]',
  }),
  parityCase({
    id: 'manager-checks-parity-under-fixed',
    label: 'lower is better, fixed difficulty',
    frame: 3,
    steps: [
      ...parityFormula('1d20'),
      ...previewAsActor('lab-actor-idrin'),
      ...PARITY_UNDER,
      ...parityType('[data-check-dc]', 1, '10'),
      ...parityTiers(2, PARITY_WORK_TIERS, '[data-tier-dc]', ['12', '10', '8', '6']),
      ...parityPreview(2),
    ],
    expectSelector: '.fabricate-manager [data-check-formula-target]',
  }),
  parityCase({
    id: 'manager-checks-parity-under-attribute',
    label: 'lower is better, character value added',
    frame: 4,
    steps: [
      ...parityFormula('1d20'),
      ...previewAsActor('lab-actor-idrin'),
      ...PARITY_UNDER,
      ...parityAttribute('@skills.med.mod + 8'),
      ...parityType('[data-check-base-adjustment]', 1, '0'),
      ...parityTiers(2, PARITY_WORK_TIERS, '[data-tier-adjustment]', ['+2', '0', '-2', '-4']),
      ...parityPreview(3),
    ],
    expectSelector: '.fabricate-manager [data-check-target-resolution="resolved"]',
  }),
  parityCase({
    id: 'manager-checks-parity-under-multiply',
    label: 'lower is better, character value multiplied',
    frame: 5,
    query: { system: 'lab-runework' },
    steps: [
      ...parityFormula('1d100'),
      ...previewAsActor('lab-actor-idrin'),
      ...PARITY_UNDER,
      ...parityAttribute('@skills.med.mod + 51'),
      ...PARITY_MULTIPLY,
      ...parityType('[data-check-base-adjustment]', 1, '1'),
      ...parityTiers(0, ['Standard', 'Demanding'], '[data-tier-adjustment]', ['1', '1/2']),
      ...parityPreview(1),
    ],
    expectSelector: '.fabricate-manager [data-check-formula-target]',
  }),
  parityCase({
    id: 'manager-checks-parity-progressive',
    label: 'progressive',
    frame: 9,
    query: { system: 'lab-herbalism' },
    steps: [],
    expectSelector: '.fabricate-manager [data-check-direction-field]',
  }),
  parityCase({
    id: 'manager-checks-parity-under-attribute-no-actor',
    label: 'lower is better, character value, no character chosen',
    frame: 10,
    steps: [
      ...parityFormula('1d20'),
      ...PARITY_UNDER,
      ...parityAttribute('@skills.med.mod + 8'),
      ...parityType('[data-check-base-adjustment]', 1, '0'),
      ...parityTiers(2, PARITY_WORK_TIERS, '[data-tier-adjustment]', ['+2', '0', '-2', '-4']),
      ...parityPreview(2),
    ],
    expectSelector: '.fabricate-manager [data-check-attribute-fields]',
  }),
  parityCase({
    id: 'manager-checks-parity-outcomes-multiply',
    label: 'outcome tiers against a multiplied character value',
    frame: 11,
    query: { system: 'lab-runework' },
    steps: [
      ...parityFormula('1d100'),
      ...previewAsActor('lab-actor-idrin'),
      ...PARITY_UNDER,
      ...parityAttribute('@skills.med.mod + 51'),
      ...PARITY_MULTIPLY,
      ...parityType('[data-check-base-adjustment]', 1, '1'),
      ...parityTiers(0, ['Standard', 'Demanding'], '[data-tier-adjustment]', ['1', '1/2']),
      ...parityPreview(1),
      ...parityOutcomes(
        ['Failure', 'Regular', 'Hard', 'Extreme'],
        '[data-outcome-adjustment]',
        [
          [2, '1'],
          [3, '1/2'],
          [4, '1/5'],
        ],
        ['failure', 'success', 'success', 'success']
      ),
    ],
    expectSelector: '.fabricate-manager [data-outcome-head]',
  }),
  parityCase({
    id: 'manager-checks-parity-outcomes-under-fixed',
    label: 'outcome tiers against a fixed target',
    frame: 12,
    query: { system: 'lab-runework' },
    steps: [
      ...parityFormula('1d20'),
      ...previewAsActor('lab-actor-idrin'),
      ...PARITY_UNDER,
      ...parityTiers(0, ['Standard Work'], '[data-tier-dc]', ['10']),
      ...parityPreview(1),
      ...parityOutcomes(
        ['Botched', 'Flawed', 'Success', 'Fine'],
        '[data-outcome-dc]',
        [
          [1, '-4'],
          [2, '-1'],
          [3, '0'],
          [4, '+3'],
        ],
        ['failure', 'failure', 'success', 'success']
      ),
    ],
    expectSelector: '.fabricate-manager [data-outcome-head]',
  }),
  underCase({
    id: 'manager-checks-under-fixed-rolled',
    label: 'fixed target, rolled',
    frame: 3,
    steps: [...UNDER_FIXED_STEPS, ...ROLL_PREVIEW],
    expectSelector:
      '.fabricate-manager [data-checks-simulator-readout][data-checks-simulator-direction="under"] [data-checks-simulator-target]',
  }),
  underCase({
    id: 'manager-checks-under-attribute-odds',
    label: 'multiplied character value, odds',
    frame: 5,
    query: { system: 'lab-runework' },
    steps: [...underMultiplySteps('@skills.med.mod + 51'), ...SCROLL_ODDS],
    expectSelector:
      '.fabricate-manager [data-checks-odds-state="enumerated"][data-checks-odds-direction="under"] [data-checks-odds-bar]',
  }),
  underCase({
    id: 'manager-checks-under-attribute-rolled',
    label: 'multiplied character value, rolled',
    frame: 5,
    query: { system: 'lab-runework' },
    // The lab's first roll lands on Otherwise, which has no target; the second lands on Hard.
    steps: [
      ...underMultiplySteps('@skills.med.mod + 51'),
      { selector: '[data-checks-simulator-roll]' },
      ...ROLL_PREVIEW,
    ],
    expectSelector:
      '.fabricate-manager [data-checks-simulator-readout][data-checks-simulator-direction="under"] [data-checks-simulator-target]',
  }),
  underCase({
    id: 'manager-checks-under-no-actor',
    label: 'character value, no character chosen',
    frame: 10,
    query: { system: 'lab-runework' },
    steps: [...underMultiplySteps('@skills.med.mod + 51', null), ...SCROLL_ODDS],
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-odds-reason="needs-preview-actor"])' +
      ':has([data-checks-simulator-state="needs-preview-actor"])',
  }),
  underCase({
    id: 'manager-checks-under-actorless-literal',
    label: 'literal character value, no character chosen',
    frame: 10,
    query: { system: 'lab-runework' },
    steps: [
      ...parityFormula('1d20'),
      ...PARITY_UNDER,
      ...parityAttribute('12'),
      { selector: '[data-check-adjustment-kind-option="add"]' },
      ...SCROLL_ODDS,
    ],
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-odds-state="enumerated"][data-checks-odds-direction="under"] [data-checks-odds-bar])' +
      ':not(:has([data-checks-simulator-state="needs-preview-actor"]))',
  }),
  underCase({
    id: 'manager-checks-under-missing-path',
    label: 'character value the character lacks',
    frame: 19,
    query: { system: 'lab-runework' },
    steps: [
      ...underMultiplySteps('@skills.craft.value'),
      { selector: '#checks-section-roll' },
      ...SCROLL_ODDS,
    ],
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-odds-reason="attribute-path-unresolved"])' +
      ':has([data-checks-section-notice="attributePathUnresolvedForPreview"])',
  }),
  underCase({
    id: 'manager-checks-under-missing-path-validation',
    label: 'character value the character lacks, Validation',
    frame: 19,
    query: { system: 'lab-runework' },
    steps: [
      ...underMultiplySteps('@skills.craft.value'),
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="attributePathUnresolvedForPreview"]', scroll: true },
    ],
    expectView: 'checks-validation',
    // A transient warning puts no badge on the nav.
    expectSelector:
      '.fabricate-manager' +
      ':has([data-issue="attributePathUnresolvedForPreview"][data-issue-transient])' +
      ':not(:has([data-checks-nav-issues]))',
  }),
  underCase({
    id: 'manager-checks-under-readiness',
    label: 'readiness faults, Validation',
    frame: 18,
    query: { system: 'lab-runework' },
    steps: [
      ...parityFormula('1d100'),
      ...PARITY_UNDER,
      ...parityAttribute('@skills.med.mod + 1d6'),
      ...parityType('[data-check-base-adjustment]', 1, '-2'),
      ...PARITY_MULTIPLY,
      ...parityTiers(0, ['Standard', 'Demanding', 'Heroic'], '[data-tier-adjustment]', [
        '1',
        '1/2',
      ]),
      ...parityOutcomes(
        ['Failure', 'Botch', 'Hard', 'Extreme'],
        '[data-outcome-adjustment]',
        [
          [3, '1/2'],
          [4, '1/5'],
        ],
        ['failure', 'failure', 'success', 'success']
      ),
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="attributeTargetInvalid"]', scroll: true },
    ],
    expectView: 'checks-validation',
    expectSelector:
      '.fabricate-manager' +
      ':has([data-issue="attributeTargetInvalid"])' +
      ':has([data-issue="attributeTierWithoutAdjustment"])' +
      ':has([data-issue="adjustmentInvalidForKind"])' +
      ':has([data-issue="multipleOtherwiseTiers"])',
  }),
  underCase({
    id: 'manager-checks-under-progressive',
    label: 'progressive check set to lower is better',
    frame: 20,
    query: { system: 'lab-herbalism' },
    steps: [...previewAsActor('lab-actor-idrin'), ...PARITY_UNDER, ...SCROLL_ODDS],
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-section-notice="progressiveUnderUnsupported"])' +
      ':has([data-checks-odds-reason="progressive-under-unsupported"])',
  }),
  managerCase({
    id: 'manager-checks-under-preroll-joint',
    label:
      'Manager — Checks roll-under preview, a rolled 1d4 bonus charted jointly (prototype state 11)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      ...runeworkRollingModifier('1d4'),
      ...PARITY_NAV,
      ...UNDER_OUTCOMES_FIXED,
      ...SCROLL_ODDS,
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager:has([data-checks-odds-state="enumerated"][data-checks-odds-direction="under"] [data-checks-odds-bar]):has([data-checks-odds-domain])',
    kinds: ['manager', 'checks'],
    sourceMatches: PARITY_SOURCES,
  }),
  managerCase({
    id: 'manager-checks-under-preroll-abstain',
    label:
      'Manager — Checks roll-under preview, a rolled 2d4 bonus not charted (prototype state 11)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      ...runeworkRollingModifier('2d4'),
      ...PARITY_NAV,
      ...UNDER_OUTCOMES_FIXED,
      ...SCROLL_ODDS,
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [data-checks-odds-reason="modifier-preroll-not-enumerable"]',
    kinds: ['manager', 'checks'],
    sourceMatches: PARITY_SOURCES,
  }),
  countCase({
    id: 'manager-checks-count-over',
    label: 'six d10s, odds',
    frame: 6,
    steps: [...COUNT_IDRIN, ...COUNT_ODDS],
    expectSelector:
      '.fabricate-manager:has([data-checks-odds-expected="1.33"]) [data-checks-odds-product="count"] [data-checks-odds-row="botch"] [data-checks-odds-bar]',
  }),
  countCase({
    id: 'manager-checks-count-over-rolled',
    label: 'six d10s, rolled',
    frame: '06, with the 39 readout',
    steps: [...COUNT_IDRIN, ...COUNT_ROLL],
    expectSelector:
      '.fabricate-manager [data-checks-simulator-readout][data-checks-simulator-product="count"] [data-checks-simulator-face]',
  }),
  countCase({
    id: 'manager-checks-count-over-narrow',
    label: 'six d10s, rolled at 1024x640',
    frame: '06, with the 39 readout',
    position: { width: 1024, height: 640 },
    steps: [...COUNT_IDRIN, ...COUNT_ROLL],
    expectSelector:
      '.fabricate-manager [data-checks-simulator-readout][data-checks-simulator-product="count"] [data-checks-simulator-face]',
  }),
  countCase({
    id: 'manager-checks-count-literal',
    label: 'a literal pool with no character',
    frame: 7,
    nav: 'salvage',
    steps: COUNT_ODDS,
    expectSelector:
      '.fabricate-manager [data-checks-odds-state="enumerated"][data-checks-odds-product="count"]',
  }),
  countCase({
    id: 'manager-checks-count-no-actor',
    label: 'a pool reading the character, none chosen',
    frame: 10,
    steps: COUNT_ODDS,
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-odds-reason="needs-preview-actor"])' +
      ':has([data-checks-simulator-state="needs-preview-actor"])',
  }),
  countCase({
    id: 'manager-checks-count-missing-path',
    label: 'a character lacking the pool path',
    frame: 19,
    steps: [...previewAsActor('lab-actor-vosk'), ...COUNT_ODDS],
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-odds-reason="count-path-unresolved"])' +
      ':has([data-checks-section-notice="countPathUnresolvedForPreview"])',
  }),
  countCase({
    id: 'manager-checks-count-missing-path-validation',
    label: 'a character lacking the pool path, on Validation',
    frame: 19,
    nav: 'validation',
    steps: [
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-vosk'),
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="countPathUnresolvedForPreview"]', scroll: true },
    ],
    expectSelector:
      '.fabricate-manager:has([data-issue="countPathUnresolvedForPreview"]):not(:has([data-checks-nav-issues]))',
  }),
  countCase({
    id: 'manager-checks-count-routed',
    label: 'routed tiers worst to best',
    frame: 13,
    nav: 'gathering',
    steps: COUNT_ODDS,
    expectSelector:
      '.fabricate-manager [data-checks-odds-product="count"] [data-checks-odds-row="botch"]',
  }),
  countCase({
    id: 'manager-checks-count-progressive',
    label: 'progressive awards, rolled',
    frame: 9,
    state: 'dice-pool-extended',
    steps: [{ selector: '[data-checks-preview-difficulties]', fill: '1, 1, 2' }, ...COUNT_ROLL],
    expectSelector:
      '.fabricate-manager:has([data-checks-odds-row="botch"]):has([data-checks-simulator-band])',
  }),
  countCase({
    id: 'manager-checks-count-zero',
    label: 'a pool of no dice, rolled',
    frame: '41 semantic',
    state: 'dice-pool-extended',
    nav: 'salvage',
    steps: COUNT_ROLL,
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-simulator-note="zero-pool"])' +
      ':has([data-checks-simulator-band="failure"])' +
      ':not(:has([data-checks-simulator-face]))',
  }),
  countCase({
    id: 'manager-checks-count-botch',
    label: 'a botch, rolled',
    frame: '40 semantic',
    state: 'dice-pool-extended',
    nav: 'gathering',
    steps: COUNT_ROLL,
    expectSelector:
      '.fabricate-manager [data-checks-simulator-readout][data-checks-simulator-botch] [data-checks-simulator-total="-3"]',
  }),
  countCase({
    id: 'manager-checks-count-odds-refused',
    label: 'a separately rolled bonus that cannot be charted',
    frame: 11,
    steps: [
      ...COUNT_IDRIN,
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-eligibility="lab-mod-knack"]' },
      ...COUNT_ODDS,
    ],
    expectSelector:
      '.fabricate-manager [data-checks-odds-reason="modifier-preroll-not-enumerable"]',
  }),
  countCase({
    id: 'manager-checks-count-callouts',
    label: 'pool readiness in the roll section',
    frame: '08 and 07, amended copy',
    state: 'dice-pool-faults',
    steps: [],
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-section-notice="countRequiredExceedsMaxPool"])' +
      ':has([data-checks-section-notice="countTierWithoutSuccesses"])',
  }),
  countCase({
    id: 'manager-checks-count-readiness',
    label: 'pool readiness on Validation',
    frame: '16 and 17',
    state: 'dice-pool-faults',
    nav: 'validation',
    steps: [],
    expectSelector:
      '.fabricate-manager' +
      ':has([data-issue="countRequiredExceedsMaxPool"])' +
      ':has([data-issue="countTierWithoutSuccesses"])' +
      ':has([data-issue="countThresholdInvalid"])' +
      ':has([data-issue="countPoolInvalid"])',
  }),
]);
