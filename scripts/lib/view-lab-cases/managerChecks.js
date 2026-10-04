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

/** A second library modifier made transformed, so ranking leaves two out at once (issue 2082). */
const AUTHOR_SECOND_TRANSFORMED_MODIFIER = Object.freeze([
  { selector: '[data-world-modifier="hb-mod-tools"] [data-toggle-modifier]' },
  {
    selector: '[data-world-modifier="hb-mod-tools"] [data-world-modifier-field="label"]',
    fill: 'A second deliberately long transformed modifier name',
  },
  {
    selector: '[data-world-modifier="hb-mod-tools"] [data-world-modifier-field="expression"]',
    fill: '2d6cs>4',
  },
  { selector: '[data-world-modifier-done="hb-mod-tools"]' },
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
/** Frame 12's fixed-target outcome ladder, against a Standard Work tier at `target`. */
const underOutcomesFixed = (target) => [
  ...parityFormula('1d20'),
  ...previewAsActor('lab-actor-idrin'),
  ...PARITY_UNDER,
  ...parityTiers(0, ['Standard Work'], '[data-tier-dc]', [target]),
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
];
const UNDER_OUTCOMES_FIXED = Object.freeze(underOutcomesFixed('10'));
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
 * `checkPreviewState`, each on the prototype frame it answers.
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

/*
 * The success-counting authoring states (issue 2006), one per row of its reachable-state capture
 * matrix and on the prototype frame each answers. Each opens on one of issue 2004's seeded pools
 * or a summing check, and authors the state it claims through the Studio's own controls.
 */
const authoringCase = ({
  id,
  label,
  frame,
  state = 'dice-pool',
  nav = 'crafting',
  steps,
  ...rest
}) =>
  managerCase({
    id,
    label: `Manager — Checks count authoring, ${label} (prototype state ${frame})`,
    reaches: 'beyond',
    smokeLabels: [],
    query: state
      ? { system: 'lab-smithing', checkPreviewState: state }
      : { system: 'lab-smithing' },
    steps: ['Checks', { selector: `#manager-checks-nav-${nav}` }, ...steps],
    expectView: `checks-${nav}`,
    kinds: rest.position ? ['manager', 'checks', 'responsive'] : ['manager', 'checks'],
    sourceMatches: PARITY_SOURCES,
    ...rest,
  });
const COUNTING = '.fabricate-manager:has([data-check-product-option="count"].is-active)';

/*
 * Issue 2008's additional-dice group on issue 2004's `dice-pool-faults` crafting pool, which pays
 * one die from a stored Momentum (`tests/view-lab/world/labCheckPreviews.js`): Idrin holds 2,
 * Brenna's is set by an active effect and Vosk has none. Each state is authored by steps.
 */
const ADDITIONAL_DICE = '[data-check-additional-dice-group]';
const SHOW_ADDITIONAL_DICE = Object.freeze({ selector: ADDITIONAL_DICE, scroll: true });
const ADDITIONAL_DICE_PATH = '[data-check-additional-dice-path]';
const PATH_LINE = (tone, text) =>
  `:has([data-check-additional-dice-path-line="${tone}"]:text-is("${text}"))`;
const PREVIEW_NOTE = (kind, text) =>
  `:has([data-checks-preview-additional-dice-note="${kind}"]:text-is("${text}"))`;
const MOMENTUM_PATH = 'system.resources.momentum.value';
const additionalDiceCase = ({ steps, expectSelector, ...rest }) =>
  authoringCase({
    state: 'dice-pool-faults',
    steps: [...steps, SHOW_ADDITIONAL_DICE],
    expectSelector: `.fabricate-manager${expectSelector}`,
    ...rest,
  });
const VALIDATION_NAV = Object.freeze({ selector: '#manager-checks-nav-validation' });
const additionalDiceValidationCase = ({ steps, issue, expectSelector, ...rest }) =>
  authoringCase({
    state: 'dice-pool-faults',
    nav: 'validation',
    steps: [
      { selector: '#manager-checks-nav-crafting' },
      ...steps,
      VALIDATION_NAV,
      { selector: `[data-issue="${issue}"]`, scroll: true },
    ],
    expectSelector: `.fabricate-manager [data-checks-panel="validation"]${expectSelector}`,
    ...rest,
  });
const EXPLODE_ROW = Object.freeze({ selector: '[data-check-count-row-explode]', scroll: true });

/*
 * The rolled readout states (issue 2080): each rolled state of the prototype parity matrix, rolled
 * once. The lab's d20 shows 20 first, so each DC or target is chosen to land its named outcome.
 */
const IDRIN = Object.freeze(previewAsActor('lab-actor-idrin'));
const overFixed = (dc) => [
  ...parityFormula('1d20 + @prof'),
  ...IDRIN,
  ...parityType('[data-check-dc]', 1, dc),
];
const triggerPreset = (preset) => [
  { selector: '#checks-section-triggers' },
  { selector: `[data-rule-row-preset="${preset}"]` },
];
/** Two fixed ranges, Spoiled 1–20 and Sound 21–30, typed onto Runework's fresh fixed list. */
const FIXED_RANGES = Object.freeze([
  { selector: '#checks-section-outcomes' },
  { selector: '[data-check-type-option="fixed"]' },
  { selector: '[data-add-outcome-tier]' },
  { selector: '[data-add-outcome-tier]' },
  { selector: nthMatch('[data-outcome-name]', 1), fill: 'Spoiled' },
  { selector: nthMatch('[data-outcome-name]', 2), fill: 'Sound' },
  ...parityType('[data-outcome-end]', 1, '20'),
  ...parityType('[data-outcome-start]', 2, '21'),
  ...parityType('[data-outcome-end]', 2, '30'),
  { selector: `${nthMatch('[data-outcome-row]', 2)} [data-outcome-success-option="success"]` },
]);
/** Four fixed bands (issue 2082): Spoiled 1–10 overlaps Flawed 8–15, and Sound 16–20 leaves 21–24 before Fine. */
const FIXED_BANDS = Object.freeze([
  { selector: '#checks-section-outcomes' },
  { selector: '[data-check-type-option="fixed"]' },
  ...Array.from({ length: 4 }, () => ({ selector: '[data-add-outcome-tier]' })),
  ...['Spoiled', 'Flawed', 'Sound', 'Fine'].map((name, index) => ({
    selector: nthMatch('[data-outcome-name]', index + 1),
    fill: name,
  })),
  ...[
    ['1', '10'],
    ['8', '15'],
    ['16', '20'],
    ['25', '30'],
  ].flatMap(([start, end], index) => [
    ...parityType('[data-outcome-start]', index + 1, start),
    ...parityType('[data-outcome-end]', index + 1, end),
  ]),
  { selector: `${nthMatch('[data-outcome-row]', 3)} [data-outcome-success-option="success"]` },
]);
/*
 * The advantage rule's Studio states (issue 2007), authored through the Formula card's own
 * controls on a summing crafting check, or on issue 2004's seeded counting pool.
 */
const ADVANTAGE_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/manager\/checks\/(CheckPromptOptions\.svelte|CheckOptionGroup\.svelte|checkAdvantageCopy\.js)$/,
]);
const ADVANTAGE_VALIDATION_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/manager\/checks\/(?:ChecksValidationTab\.svelte|checksReadiness\.js|checksCopy\.js)$/,
]);
const ADVANTAGE_BLOCK = Object.freeze({ selector: '[data-check-advantage]', scroll: true });
const advantageMode = (mode) => ({ selector: `[data-check-advantage-mode-option="${mode}"]` });
const CRAFTING_PANEL = '.fabricate-manager [data-checks-panel="crafting"]';
const advantageCase = ({
  id,
  label,
  frame,
  state,
  steps,
  expectSelector,
  scope = CRAFTING_PANEL,
  ...rest
}) =>
  managerCase({
    id,
    label: `Manager — Checks advantage authoring, ${label} (prototype state ${frame})`,
    reaches: 'beyond',
    smokeLabels: [],
    query: state
      ? { system: 'lab-smithing', checkPreviewState: state }
      : { system: 'lab-smithing' },
    steps: ['Checks', { selector: '#manager-checks-nav-crafting' }, ...steps, ADVANTAGE_BLOCK],
    expectView: 'checks-crafting',
    expectSelector: `${scope} ${expectSelector}`,
    kinds: rest.position ? ['manager', 'checks', 'responsive'] : ['manager', 'checks'],
    sourceMatches: ADVANTAGE_SOURCES,
    ...rest,
  });
const READOUT = '.fabricate-manager [data-checks-simulator-readout]';
const rolledCase = ({
  id,
  label,
  frame,
  system = 'lab-smithing',
  state,
  nav = 'crafting',
  steps,
  ...rest
}) =>
  managerCase({
    id,
    label: `Manager — Checks rolled readout, ${label} (prototype state ${frame})`,
    reaches: 'beyond',
    smokeLabels: [],
    query: state ? { system, checkPreviewState: state } : { system },
    steps: ['Checks', { selector: `#manager-checks-nav-${nav}` }, ...steps, ...ROLL_PREVIEW],
    expectView: `checks-${nav}`,
    kinds: rest.position ? ['manager', 'checks', 'responsive'] : ['manager', 'checks'],
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
    expectSelector:
      '.fabricate-manager [data-issue="retiredPlaceholderBreaksFormula"]:has(.manager-recipe-val-detail)',
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
    expectSelector:
      '.fabricate-manager [data-issue="modifierAverageUnavailable"]:has(.manager-recipe-val-detail)',
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
    // The dot and the notice explaining it, first in the pane (issue 2082).
    expectSelector:
      '.fabricate-manager:has([role="tabpanel"] > [data-checks-section-notices="outcomes"]:first-child' +
      ' > [data-checks-section-notice="unnamedOutcome"][data-notice-tone="warning"])' +
      ' [data-checks-section-dot="outcomes"]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  // Every readiness issue opens its section as a titled amber notice, blocking first (issue 2082).
  managerCase({
    id: 'manager-checks-roll-notices',
    label: 'Manager — Checks roll section notices, blocking first',
    reaches: 'beyond',
    smokeLabels: [],
    // A refused placement raises the warning `noRollFormula` BEFORE the critical it causes, so the order is the sort's.
    // Advantage is switched off first: a keep rule cannot keep a die multiplied by a reference (issue 2007).
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      advantageMode('off'),
      { selector: '[data-check-roll-formula]', fill: '1d20 * @craftingmod' },
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [role="tabpanel"] > [data-checks-section-notices="roll"]:first-child' +
      ' > [data-checks-section-notice="retiredPlaceholderBreaksFormula"][data-notice-tone="warning"]:first-child' +
      ' + [data-checks-section-notice="noRollFormula"][data-notice-tone="warning"]:last-child',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-outcomes-range-notices',
    label: 'Manager — Checks outcomes notices for overlapping and gapped bands',
    reaches: 'beyond',
    smokeLabels: [],
    // Spoiled and Flawed overlap, and Sound and Fine leave 21 to 24 unclaimed; Sound is the Success tier.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...FIXED_BANDS,
      { selector: '[data-checks-section-notices="outcomes"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [role="tabpanel"] > [data-checks-section-notices="outcomes"]:first-child' +
      ' > [data-checks-section-notice="rangeOverlap"][data-notice-tone="warning"]:first-child' +
      ' + [data-checks-section-notice="rangeGap"][data-notice-tone="warning"]:last-child',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-triggers-notice',
    label: 'Manager — Checks triggers notices for a missing and a shared target tier',
    reaches: 'beyond',
    smokeLabels: [],
    // A new trigger set to a target tier names none yet, and Runework already has one targeting Ruined.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      { selector: '[data-add-trigger]' },
      { selector: '[data-trigger-tier-step-mode="target"]' },
      { selector: '[data-checks-section-notices="triggers"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [role="tabpanel"] > [data-checks-section-notices="triggers"]:first-child' +
      ' > [data-checks-section-notice="danglingTierStepTarget"][data-notice-tone="warning"]:first-child' +
      ' + [data-checks-section-notice="multipleTierStepTargets"][data-notice-tone="warning"]:last-child',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
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
    id: 'manager-checks-alchemy-behaviour',
    label: 'Manager — Checks alchemy behaviour',
    // Beyond the smoke: the alchemy behaviour card gained its fourth switch, "break tools on a
    // failed brew", sharing the crafting consumption policy rather than a separate flag (issue
    // 2100, maintainer ruling "add switch, keep old default").
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-on-failure' },
      { selector: '[data-recipe-section="alchemy-break-tools-on-fail"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [data-alchemy-behaviour] [data-recipe-section="alchemy-break-tools-on-fail"]',
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
      { selector: '.fabricate-icon-button[aria-label^="Edit"]' },
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
      ':has([data-checks-section-notice="modifierAverageUnavailable"][data-notice-tone="warning"])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  // A long name ellipsises beside a whole counting expression and an in-row Selectable control (issue 2044).
  managerCase({
    id: 'manager-checks-crafting-modifier-long-name',
    label: 'Manager — Checks crafting modifier long name',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      ...AUTHOR_TRANSFORMED_MODIFIER,
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="playerPicks"] input' },
      { selector: '[data-crafting-modifier-row="hb-mod-luck"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The title is the state: before issue 2044 the name had none and pushed the control out.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-row="hb-mod-luck"]' +
      ':has([data-crafting-modifier-readonly="label"][title^="Lucky find with a deliberately long"])' +
      ':has([data-crafting-modifier-eligibility="hb-mod-luck"])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  // The narrow twin: a short name beside a long expression, and both controls inside their rows (issue 2044).
  managerCase({
    id: 'manager-checks-crafting-modifier-long-expression-narrow',
    label: 'Manager — Checks crafting modifier long expression, narrow',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      ...AUTHOR_TRANSFORMED_MODIFIER,
      { selector: '[data-world-modifier="hb-mod-tools"] [data-toggle-modifier]' },
      {
        selector: '[data-world-modifier="hb-mod-tools"] [data-world-modifier-field="expression"]',
        fill: '@skills.nat.total + @abilities.wis.mod + @abilities.int.mod + @prof + 2',
      },
      { selector: '[data-world-modifier-done="hb-mod-tools"]' },
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-row="hb-mod-tools"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-row="hb-mod-tools"]' +
      ':has([data-crafting-modifier-readonly="expression"]:has-text("@abilities.int.mod + @prof"))',
    position: { width: 1180, height: 820 },
    expectContained: [
      {
        container: '[data-crafting-modifier-row="hb-mod-tools"]',
        target: '[data-crafting-modifier-eligibility="hb-mod-tools"]',
      },
      {
        container: '[data-crafting-modifier-row="hb-mod-luck"]',
        target: '[data-crafting-modifier-eligibility="hb-mod-luck"]',
      },
    ],
    kinds: ['manager', 'checks', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  // Two modifiers sharing one fault, so the notice's detail names both and must wrap (issue 2082).
  managerCase({
    id: 'manager-checks-crafting-modifiers-multi-name-notice',
    label: 'Manager — Checks modifiers notice naming two modifiers',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      ...AUTHOR_TRANSFORMED_MODIFIER,
      ...AUTHOR_SECOND_TRANSFORMED_MODIFIER,
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '1' },
      { selector: '[data-checks-section-notices="modifiers"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [role="tabpanel"] > [data-checks-section-notices="modifiers"]:first-child' +
      ' > [data-checks-section-notice="modifierAverageUnavailable"][data-notice-tone="warning"]' +
      ' .fab-notice-detail:has-text("Lucky find with a deliberately long transformed modifier name")' +
      ':has-text("A second deliberately long transformed modifier name")',
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
    // The gathering card's two unique notices are stated against real rows here rather than an empty catalogue,
    // and the section's own readiness notice sits above them, off the frame (issue 2082).
    expectSelector:
      '.fabricate-manager:has([data-checks-section-notice="modifiersInertNoModifierSupport"][data-notice-tone="warning"])' +
      ' [data-crafting-modifier-catalogue="gathering"]' +
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
          '[data-gathering-task-id="hb-task-slowbloom"] .fabricate-icon-button[aria-label^="Edit"]',
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
        target: '[data-category-id] .fabricate-icon-button',
      },
      {
        container: '[data-vocabulary-panel="componentCategories"]',
        target: '[data-component-category-id] .fabricate-icon-button',
      },
      {
        container: '[data-vocabulary-panel="componentTags"]',
        target: '[data-tag-id] .fabricate-icon-button',
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
          '[data-vocabulary-panel="componentCategories"] [data-component-category-id] .fabricate-icon-button:not(.is-danger)',
      },
    ],
    expectView: 'tags',
    expectSelector: '[data-vocabulary-confirm]',
    position: { width: 1000, height: 700 },
    expectContained: [
      {
        container: '[data-vocabulary-panel="recipeCategories"]',
        target: '[data-category-id] .fabricate-icon-button',
      },
      {
        container: '[data-vocabulary-panel="componentCategories"]',
        target: '[data-component-category-id] .fabricate-icon-button',
      },
      {
        container: '[data-vocabulary-panel="componentTags"]',
        target: '[data-tag-id] .fabricate-icon-button',
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
      '.fabricate-manager [data-checks-odds-state="enumerated"][data-checks-odds-direction="under"] [data-banded-bar-track]',
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
      ':has([data-checks-odds-state="enumerated"][data-checks-odds-direction="under"] [data-banded-bar-track])' +
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
  // The false-green regression (issue 2106 review): `progressiveHigherIsBetter` had no owning
  // issue, so the Validation tab showed both this blocker AND a pass tick for the same check.
  underCase({
    id: 'manager-checks-under-progressive-validation',
    label: 'progressive check set to lower is better, on Validation',
    frame: 20,
    query: { system: 'lab-herbalism' },
    steps: [
      ...previewAsActor('lab-actor-idrin'),
      ...PARITY_UNDER,
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="progressiveUnderUnsupported"]', scroll: true },
    ],
    expectView: 'checks-validation',
    expectSelector:
      '.fabricate-manager' +
      ':has([data-issue="progressiveUnderUnsupported"][data-issue-severity="critical"])' +
      ':not(:has([data-check="progressiveHigherIsBetter"][data-satisfied="true"]))',
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
      '.fabricate-manager:has([data-checks-odds-state="enumerated"][data-checks-odds-direction="under"] [data-banded-bar-track]):has([data-checks-odds-domain])',
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
  managerCase({
    id: 'manager-checks-under-attribute-narrow',
    label:
      'Manager — Checks roll-under preview, multiplied character value, odds, narrow (prototype state 5)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...underMultiplySteps('@skills.med.mod + 51'),
      ...SCROLL_ODDS,
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [data-checks-odds-state="enumerated"][data-checks-odds-direction="under"] [data-banded-bar-track]',
    // The 1024x640 declared floor, stacked, for the same enumerated row `manager-checks-stacked-floor`
    // proves for sum/over: the odds panel restacks under the same ladder for a roll-under record.
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'checks', 'responsive'],
    sourceMatches: PARITY_SOURCES,
  }),
  managerCase({
    id: 'manager-checks-under-progressive-salvage',
    label:
      'Manager — Checks roll-under preview, progressive salvage check set to lower is better (prototype state 20)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-salvage' },
      ...previewAsActor('lab-actor-idrin'),
      ...PARITY_UNDER,
      ...SCROLL_ODDS,
    ],
    expectView: 'checks-salvage',
    expectSelector:
      '.fabricate-manager' +
      ':has([data-checks-section-notice="progressiveUnderUnsupported"])' +
      ':has([data-checks-odds-reason="progressive-under-unsupported"])',
    kinds: ['manager', 'checks'],
    sourceMatches: PARITY_SOURCES,
  }),
  rolledCase({
    id: 'manager-checks-over-fixed-rolled',
    label: 'higher is better, fixed DC, success',
    frame: '01 + Roll',
    steps: overFixed('12'),
    expectSelector: `${READOUT}:not(:has([data-checks-simulator-note])) [data-checks-simulator-band="success"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-fixed-rolled-failure',
    label: 'higher is better, fixed DC, failure',
    frame: '01 + Roll',
    steps: overFixed('25'),
    expectSelector: `${READOUT}:has([data-checks-simulator-band="failure"]) [data-checks-simulator-fact="tools"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-fixed-rolled-narrow',
    label: 'higher is better, fixed DC, success at 1024x640',
    frame: '01 + Roll',
    steps: overFixed('12'),
    position: { width: 1024, height: 640 },
    expectSelector: `${READOUT} [data-checks-simulator-band="success"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-routed-stepped',
    label: 'routed tier stepped up by a natural 20',
    frame: '12 + trigger',
    system: 'lab-runework',
    // Runework's modifiers take the natural 20 to 29, Standard at DC 27, which the 20 steps up.
    steps: [...IDRIN, ...parityType('[data-check-dc]', 1, '27')],
    expectSelector: `${READOUT} [data-checks-simulator-band="success"] [data-checks-simulator-note="trigger"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-fixed-forced',
    label: 'fixed DC forced to success by a trigger',
    frame: '01 + trigger',
    steps: [...overFixed('25'), ...triggerPreset('high')],
    expectSelector: `${READOUT} [data-checks-simulator-band="success"] [data-checks-simulator-note="forced"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-progressive-forced',
    label: 'progressive, every result awarded by a trigger',
    frame: '09 + trigger',
    system: 'lab-herbalism',
    steps: [...IDRIN, ...triggerPreset('high')],
    expectSelector: `${READOUT} [data-checks-simulator-band="success"] [data-checks-simulator-note="forced"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-routed-forced',
    label: 'routed tier forced to the worst failing tier by a trigger',
    frame: '12 + trigger',
    system: 'lab-runework',
    steps: [...IDRIN, ...triggerPreset('high'), { selector: '[data-trigger-outcome="failure"]' }],
    expectSelector: `${READOUT} [data-checks-simulator-band="failure"] [data-checks-simulator-note="forced"]`,
  }),
  rolledCase({
    id: 'manager-checks-gathering-over-rolled-failure',
    label: 'gathering, routed failure breaking tools by trigger',
    frame: '01 gathering + Roll',
    state: 'gathering-over',
    nav: 'gathering',
    steps: IDRIN,
    expectSelector: `${READOUT}:has([data-checks-simulator-band="failure"]) [data-checks-simulator-fact="tools"]`,
  }),
  // Issue 2087: the routed gathering roll-under target, a literal character value of 14 added to
  // a -2 base, resolving to 12 for every previewed actor.
  rolledCase({
    id: 'manager-checks-under-attribute-add',
    label: 'gathering, routed, lower is better, character value added',
    frame: '04 gathering + Roll',
    state: 'gathering-under-add',
    nav: 'gathering',
    steps: IDRIN,
    expectSelector: `${READOUT}[data-checks-simulator-direction="under"] [data-checks-simulator-target="12"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-routed-fixed-rolled',
    label: 'routed fixed ranges',
    frame: 'routed fixed + Roll',
    system: 'lab-runework',
    steps: [...IDRIN, ...FIXED_RANGES],
    expectSelector: `${READOUT}:has([data-checks-simulator-margin=""]) [data-checks-simulator-band="success"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-progressive-rolled',
    label: 'progressive awards down the sandbox order',
    frame: '09 + Roll',
    system: 'lab-herbalism',
    steps: IDRIN,
    expectSelector: `${READOUT} [data-checks-simulator-fact="result-1"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-unresolved-rolled',
    label: 'unresolved roll data, no actor',
    frame: '01, no actor',
    steps: [...parityFormula('1d20 + @prof'), ...parityType('[data-check-dc]', 1, '12')],
    expectSelector: `.fabricate-manager:has([data-checks-simulator-note="unresolved"]) [data-checks-simulator-readout] [data-checks-simulator-band]`,
  }),
  rolledCase({
    id: 'manager-checks-over-dynamic-dc-rolled',
    label: 'dynamic DC against its static fallback',
    frame: '01 Dynamic',
    steps: [...overFixed('12'), { selector: '[data-dc-mode-option="dynamic"] input' }],
    expectSelector: `.fabricate-manager:has([data-checks-simulator-note="dynamic-dc"]) [data-checks-simulator-readout] [data-checks-simulator-band]`,
  }),
  rolledCase({
    id: 'manager-checks-under-fixed-rolled-success',
    label: 'lower is better, fixed target, success',
    frame: '03 + Roll',
    steps: [
      ...parityFormula('1d20'),
      ...IDRIN,
      ...PARITY_UNDER,
      ...parityType('[data-check-dc]', 1, '20'),
    ],
    expectSelector: `${READOUT}[data-checks-simulator-direction="under"]:has([data-checks-simulator-band="success"]) [data-checks-simulator-note="margin"]`,
  }),
  rolledCase({
    id: 'manager-checks-under-routed-rolled',
    label: 'lower is better, routed tiers against a fixed target',
    frame: '12 + Roll',
    system: 'lab-runework',
    steps: underOutcomesFixed('20'),
    expectSelector: `${READOUT}[data-checks-simulator-direction="under"] [data-checks-simulator-band="success"]`,
  }),
  rolledCase({
    id: 'manager-checks-over-attribute-rolled',
    label: 'higher is better, character value added',
    frame: '02 + Roll',
    steps: [
      ...parityFormula('1d20 + @prof'),
      ...IDRIN,
      ...parityAttribute('@skills.med.mod + 8'),
      ...parityType('[data-check-base-adjustment]', 1, '0'),
    ],
    expectSelector: `${READOUT}[data-checks-simulator-direction="over"] [data-checks-simulator-note="margin"]`,
  }),
  rolledCase({
    id: 'manager-checks-under-attribute-add-rolled',
    label: 'lower is better, character value added',
    frame: '04 + Roll',
    steps: [
      ...parityFormula('1d20'),
      ...IDRIN,
      ...PARITY_UNDER,
      ...parityAttribute('@skills.med.mod + 8'),
      ...parityType('[data-check-base-adjustment]', 1, '0'),
    ],
    expectSelector: `${READOUT}[data-checks-simulator-direction="under"] [data-checks-simulator-target]`,
  }),
  rolledCase({
    id: 'manager-checks-under-attribute-rolled-otherwise',
    label: 'lower is better, multiplied character value, Otherwise',
    frame: '05 + Roll',
    system: 'lab-runework',
    // The lab's first roll lands on Otherwise, which has no target to read a margin from.
    steps: underMultiplySteps('@skills.med.mod + 51'),
    expectSelector: `${READOUT}[data-checks-simulator-direction="under"]:not(:has([data-checks-simulator-target])) [data-checks-simulator-band="failure"]`,
  }),
  countCase({
    id: 'manager-checks-count-over',
    label: 'six d10s, odds',
    frame: 6,
    steps: [...COUNT_IDRIN, ...COUNT_ODDS],
    expectSelector:
      '.fabricate-manager:has([data-checks-odds-expected="1.33"]) [data-checks-odds-product="count"] [data-banded-bar-row="botch"] [data-banded-bar-track]',
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
      '.fabricate-manager [data-checks-odds-product="count"] [data-banded-bar-row="botch"]',
  }),
  countCase({
    id: 'manager-checks-count-progressive',
    label: 'progressive awards, rolled',
    frame: 9,
    state: 'dice-pool-extended',
    steps: [{ selector: '[data-checks-preview-difficulties]', fill: '1, 1, 2' }, ...COUNT_ROLL],
    expectSelector:
      '.fabricate-manager:has([data-banded-bar-row="botch"]):has([data-checks-simulator-band])',
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
      '.fabricate-manager [data-checks-simulator-readout][data-checks-simulator-botch]:has([data-checks-simulator-margin="botch"]) [data-checks-simulator-total="-3"]',
  }),
  // Issue 1782: a one-outcome chart is the single-row meter, drawn in the histogram's band row.
  countCase({
    id: 'manager-checks-count-botch-odds',
    label: 'a botch-only odds chart',
    frame: '40 semantic',
    state: 'dice-pool-extended',
    nav: 'gathering',
    steps: COUNT_ODDS,
    expectSelector:
      '.fabricate-manager [data-checks-odds-product="count"] [role="meter"] .fab-banded-bar-band[data-banded-bar-row="botch"]',
  }),
  rolledCase({
    id: 'manager-checks-count-over-rolled-failure',
    label: 'six d10s short of Masterwork, no botch',
    frame: '06 + Roll',
    state: 'dice-pool',
    steps: [...IDRIN, ...parityPreview(3)],
    expectSelector: `${READOUT}[data-checks-simulator-product="count"]:not([data-checks-simulator-botch]) [data-checks-simulator-band="failure"]`,
  }),
  rolledCase({
    id: 'manager-checks-count-routed-rolled',
    label: 'six d10s routed to a tier',
    frame: '13 + Roll',
    state: 'dice-pool',
    nav: 'gathering',
    steps: [],
    expectSelector: `${READOUT}[data-checks-simulator-product="count"] [data-checks-simulator-band-name]`,
  }),
  rolledCase({
    id: 'manager-checks-count-forced',
    label: 'six d10s forced to the worst failing tier by a trigger',
    frame: '13 + trigger',
    state: 'dice-pool-forced',
    nav: 'gathering',
    steps: [],
    expectSelector: `${READOUT}[data-checks-simulator-product="count"] [data-checks-simulator-band="failure"] [data-checks-simulator-note="forced"]`,
  }),
  rolledCase({
    id: 'manager-checks-count-botch-rescued',
    label: 'a botch rescued by a trigger',
    frame: 'ruling 3',
    state: 'dice-pool-rescued',
    nav: 'gathering',
    steps: [],
    expectSelector: `${READOUT}[data-checks-simulator-botch]:has([data-checks-simulator-margin="margin"]) [data-checks-simulator-band="success"]`,
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
      ':has([data-checks-section-notice="countRequiredExceedsBasePool"])' +
      ':has([data-checks-section-notice="countTierWithoutSuccesses"])',
  }),
  // The worst realistic roll pile-up at the declared floor, blocking notices first (issue 2082);
  // a tier with no successes needed blocks since issue 2006, so it sorts before the face warning.
  countCase({
    id: 'manager-checks-roll-notices-floor',
    label: 'four pool notices stacked at 1024x640',
    frame: '08 and 07, blocking first',
    state: 'dice-pool-pileup',
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'checks', 'responsive'],
    steps: [{ selector: '[data-checks-section-notices="roll"]', scroll: true }],
    expectSelector:
      '.fabricate-manager [data-checks-section-notices="roll"]' +
      ' > [data-checks-section-notice="countThresholdInvalid"]:nth-child(1)' +
      ' + [data-checks-section-notice="countExplodeUnbounded"]' +
      ' + [data-checks-section-notice="countTierWithoutSuccesses"]' +
      ' + [data-checks-section-notice="countFaceBeyondDie"]:last-child',
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
      ':has([data-issue="countRequiredExceedsBasePool"])' +
      ':has([data-issue="countTierWithoutSuccesses"])' +
      ':has([data-issue="countThresholdInvalid"])' +
      ':has([data-issue="countPoolInvalid"])' +
      ':not(:has([data-issue^="countAdditionalDice"]))',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-over',
    label: 'six d10s from a character value, best face exploding, worst cancelling',
    frame: '06',
    steps: [...COUNT_IDRIN, { selector: '[data-check-count-row-cancel]', scroll: true }],
    expectSelector:
      COUNTING +
      ':has([data-check-count-base-mode-option="value"].is-active)' +
      ':has([data-check-count-explode-option="extreme"].is-active)' +
      ':has([data-check-count-explode-repeat-option="keeps"].is-active)' +
      ':has([data-check-count-cancel-option="extreme"].is-active)' +
      ':has([data-check-count-destination-option="pool"].is-active)' +
      ' [data-check-count-actor-line="resolved"]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-over-modifier',
    label: 'six d10s from a character value, an applied modifier growing the pool',
    frame: '06',
    steps: [
      ...COUNT_IDRIN,
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-eligibility="hb-mod-medicine"]' },
      { selector: '#checks-section-roll' },
      { selector: '[data-check-formula-resolved]', scroll: true },
    ],
    expectSelector:
      COUNTING +
      ':has([data-check-count-composed] [data-check-formula-modifier="hb-mod-medicine"])' +
      ' [data-check-count-actor-line="resolved"]:has-text("grown by")',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-over-narrow',
    label: 'six d10s from a character value, at 1024x640',
    frame: '06',
    position: { width: 1024, height: 640 },
    steps: [...COUNT_IDRIN, { selector: '[data-check-count-row-base]', scroll: true }],
    expectSelector:
      COUNTING +
      ':has([data-check-count-base-mode-option="value"].is-active)' +
      ' [data-check-count-actor-line="resolved"]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-under',
    label: 'two d20s at or under a character value, modifiers moving the threshold',
    frame: '07',
    nav: 'salvage',
    steps: [
      ...COUNT_IDRIN,
      { selector: '[data-check-count-threshold-mode-option="value"]' },
      {
        selector: '[data-check-count-threshold-expression]',
        fill: '@abilities.int.mod + @skills.med.mod + 6',
      },
      { selector: '[data-check-count-row-threshold]', scroll: true },
    ],
    expectSelector:
      COUNTING +
      ':has([data-check-direction-option="under"].is-active)' +
      ':has([data-check-count-base-mode-option="number"].is-active)' +
      ':has([data-check-count-threshold-mode-option="value"].is-active)' +
      ':has([data-check-count-test-option="meet"].is-active)' +
      ':has([data-check-count-destination-option="threshold"].is-active)' +
      ':has([data-check-additional-dice-group] [data-check-additional-dice][aria-pressed="false"])' +
      ':not(:has([data-threshold-mode]))' +
      ' [data-check-count-actor-line="resolved"]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-explode-off',
    label: 'explode switched off',
    frame: '06 variant',
    steps: [{ selector: '[data-check-count-explode-option="off"]' }, EXPLODE_ROW],
    expectSelector:
      COUNTING +
      ':has([data-check-count-explode-option="off"].is-active)' +
      ':not(:has([data-check-count-explode-repeat]))' +
      ':not(:has([data-check-count-explode-face]))' +
      ' [data-check-count-row-explode]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-explode-from',
    label: 'explode from a chosen face',
    frame: '06 variant',
    steps: [
      { selector: '[data-check-count-explode-option="from"]' },
      ...parityType('[data-check-count-explode-face]', 1, '9'),
      EXPLODE_ROW,
    ],
    expectSelector:
      COUNTING +
      ':has([data-check-count-explode-option="from"].is-active)' +
      ':has([data-check-count-explode-repeat-option="keeps"].is-active)' +
      ':has([data-check-count-clause]:text-is("· explodes on 9 or above"))' +
      ' [data-check-count-row-explode] [data-check-count-explode-face]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-explode-once',
    label: 'the best face exploding once',
    frame: '06 variant',
    steps: [{ selector: '[data-check-count-explode-repeat-option="once"]' }, EXPLODE_ROW],
    expectSelector:
      COUNTING +
      ':has([data-check-count-explode-option="extreme"].is-active)' +
      ':has([data-check-count-explode-repeat-option="once"].is-active)' +
      ' [data-check-count-row-explode]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-zero-pool-off',
    label: 'a pool reduced to zero no longer failing',
    frame: '06',
    steps: [
      { selector: '[data-check-count-zero-pool]' },
      { selector: '[data-check-count-row-zero]', scroll: true },
    ],
    expectSelector: `${COUNTING} [data-check-count-zero-pool][aria-pressed="false"]`,
  }),
  authoringCase({
    id: 'manager-checks-v3-count-required-block',
    label: 'successes needed above the most dice that can be rolled',
    frame: '08',
    state: 'dice-pool-faults',
    steps: [{ selector: '[data-check-count-callouts]', scroll: true }],
    expectSelector:
      `${COUNTING}:not(:has([data-threshold-mode]))` +
      ' [data-check-count-callouts] [data-check-count-callout="countRequiredExceedsMaxPool"]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-switch',
    label: 'a summing check with tier DCs switched to count',
    frame: 'cntExtraOff',
    state: null,
    steps: [
      { selector: '[data-check-product-option="count"]' },
      { selector: '[data-tier-row="sm-tier-masterwork"]', scroll: true },
    ],
    expectSelector:
      `${COUNTING}:not(:has([data-tier-row]:not(.is-invalid)))` +
      ' [data-tier-row="sm-tier-masterwork"] [data-tier-successes-missing]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-routed',
    label: 'routed tiers in extra successes, over a read-only strip with a botch band',
    frame: '13',
    nav: 'gathering',
    steps: [
      { selector: '#checks-section-outcomes' },
      { selector: '[data-outcome-band-scale]', scroll: true },
    ],
    expectSelector:
      '.fabricate-manager:has([data-outcome-head]:has-text("Extra successes"))' +
      ':not(:has([data-band-strip-handle]))' +
      ' [data-band-strip-band="botch"]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-routed-light',
    label: 'routed tiers in extra successes, in the light scheme',
    frame: '13',
    nav: 'gathering',
    query: { system: 'lab-smithing', checkPreviewState: 'dice-pool', colorScheme: 'light' },
    steps: [
      { selector: '#checks-section-outcomes' },
      { selector: '[data-outcome-band-scale]', scroll: true },
    ],
    expectSelector:
      '.fabricate-manager:has([data-outcome-head]:has-text("Extra successes"))' +
      ':not(:has([data-band-strip-handle]))' +
      ' [data-band-strip-band="botch"]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-progressive',
    label: 'a progressive pool testing each die by exceed, with no difficulty card',
    frame: '09',
    state: 'dice-pool-extended',
    // A progressive pool has the same per-die test as every other slot (issue 2067).
    steps: [
      { selector: '[data-check-count-test-option="exceed"]' },
      { selector: '[data-check-count-fields]', scroll: true },
    ],
    expectSelector:
      COUNTING +
      ':not(:has([data-check-difficulty-card]))' +
      ':has([data-check-count-test-option="exceed"].is-active)' +
      ' [data-check-count-fields]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-triggers',
    label: 'the count presets, a botch added',
    frame: '15',
    steps: [
      { selector: '#checks-section-triggers' },
      { selector: '[data-rule-row-preset="botch"]' },
    ],
    expectSelector:
      '.fabricate-manager:has([data-rule-row-preset="low"])' +
      ':not(:has([data-rule-row-preset="high"]))' +
      ' [data-trigger] [data-rule-row-title]:has-text("Net successes")',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-convert',
    label: 'a summing formula that counts successes, converted from its Validation row',
    frame: '21',
    state: 'dice-pool-freetext',
    nav: 'validation',
    steps: [
      { selector: '[data-issue="freeTextCountingFormula"]', scroll: true },
      {
        selector:
          '[data-issue="freeTextCountingFormula"][data-subsystem="crafting"]' +
          ' [data-validation-row-action]',
      },
    ],
    // Convert stages the draft, then opens the crafting roll section on `Count successes`.
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager [data-checks-panel="crafting"][data-checks-evaluation-product="count"]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-convert-noaction',
    label: 'a counting formula that cannot convert, its roll-section notice offering Review only',
    frame: '21',
    state: 'dice-pool-freetext',
    nav: 'salvage',
    steps: [{ selector: '[data-checks-section-notice="freeTextCountingFormula"]', scroll: true }],
    expectSelector:
      '.fabricate-manager:has([data-check-formula-average-withheld="die-modifiers"])' +
      ' [data-checks-section-notice="freeTextCountingFormula"]' +
      ' [data-notice-action]:text-is("Review")',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-convert-callout',
    label: 'a summing formula that counts successes, with Convert in the roll section',
    frame: '21',
    state: 'dice-pool-freetext',
    steps: [],
    expectSelector:
      '.fabricate-manager:has([data-check-formula-average-withheld="die-modifiers"])' +
      ' [data-checks-section-notice="freeTextCountingFormula"]' +
      ' [data-notice-action]:text-is("Convert to count successes")',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-tier-zero-point',
    label: 'a count check with no recipe tiers, owing no tier successes',
    frame: '16',
    state: 'dice-pool-faults',
    steps: [
      ...Array.from({ length: 4 }, () => ({ selector: nthMatch('[data-remove-tier]', 1) })),
      { selector: '[data-tiers-empty]', scroll: true },
    ],
    expectSelector:
      COUNTING +
      ':not(:has([data-checks-section-notice="countTierWithoutSuccesses"]))' +
      ' [data-tiers-empty]',
  }),
  authoringCase({
    id: 'manager-checks-v3-count-readiness-faults',
    label: 'a missing explode face and a trigger the pool cannot fire, on Validation',
    frame: '16',
    state: 'dice-pool-faults',
    nav: 'validation',
    steps: [{ selector: '[data-issue="countTriggerGroupUnreachable"]', scroll: true }],
    expectSelector:
      '.fabricate-manager:has([data-issue="countFaceMissing"][data-issue-severity="critical"])' +
      ':has([data-issue="countRequiredExceedsBasePool"][data-issue-severity="warning"])' +
      ':not(:has([data-issue^="countAdditionalDice"]))' +
      ' [data-issue="countTriggerGroupUnreachable"][data-issue-severity="warning"]',
  }),
  // Frame 08 (`cntExtraOff`): the toggle off keeps the group's head and no nested fields.
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-off',
    label: 'additional dice turned off',
    frame: '08',
    steps: [{ selector: '[data-check-additional-dice][aria-pressed="true"]' }],
    expectSelector:
      ` ${ADDITIONAL_DICE}:has([data-check-additional-dice][aria-pressed="false"])` +
      ':not(:has([data-check-additional-dice-fields]))',
  }),
  // Frame 07 (`cntLo`): paid from Idrin's stored Momentum, the group after the composed-roll inset,
  // and the Preview's stepper bounded by what Idrin holds.
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-path',
    label: 'paid from a stored path, Idrin holding 2 Momentum',
    frame: '07',
    steps: [...COUNT_IDRIN],
    expectSelector:
      PREVIEW_NOTE('path', 'Up to 1 for Idrin Ashfall (Momentum 2, at most 1 per roll).') +
      ':not(:has([data-checks-simulator-readout]))' +
      ` ${ADDITIONAL_DICE}` +
      ':has([data-check-additional-dice-source-option="path"].is-active)' +
      PATH_LINE('resolved', 'Idrin Ashfall → 2') +
      ':has([data-check-additional-dice-label-field])' +
      ':has([data-check-additional-dice-max])',
  }),
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-path-narrow',
    label: 'paid from a stored path, at 1024x640',
    frame: '07',
    position: { width: 1024, height: 640 },
    steps: [...COUNT_IDRIN],
    expectSelector:
      ':not(:has([data-checks-simulator-readout]))' +
      ` ${ADDITIONAL_DICE}:has([data-check-additional-dice-source-option="path"].is-active)` +
      PATH_LINE('resolved', 'Idrin Ashfall → 2'),
  }),
  // `rdySrc` in the Studio: the path cleared, so nothing can be offered.
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-path-empty',
    label: 'with no path set',
    frame: '07, path cleared',
    steps: [...COUNT_IDRIN, { selector: ADDITIONAL_DICE_PATH, fill: '' }],
    expectSelector:
      PREVIEW_NOTE('no-source', 'This check has no source to pay for additional dice.') +
      ` ${ADDITIONAL_DICE}` +
      PATH_LINE('danger', 'No source set. Players cannot be offered additional dice until one is.'),
  }),
  // Vosk holds no Momentum: a warning line, and the Preview adds no dice for him.
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-unresolved',
    label: 'a Preview-as character with no value at the path',
    frame: '07, unresolved',
    steps: [...previewAsActor('lab-actor-vosk')],
    expectSelector:
      PREVIEW_NOTE(
        'unreadable',
        `Vosk has no stored number at ${MOMENTUM_PATH}, so no dice can be added.`
      ) +
      ` ${ADDITIONAL_DICE}` +
      PATH_LINE(
        'warning',
        `Vosk has no stored number at ${MOMENTUM_PATH}, so they could not buy additional dice.`
      ),
  }),
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-overridden',
    label: 'a Preview-as character whose value an active effect sets',
    frame: '— (overridden)',
    steps: [...previewAsActor('lab-actor-brenna')],
    expectSelector:
      PREVIEW_NOTE(
        'overridden',
        `An active effect changes Brenna Karrunsdottir's ${MOMENTUM_PATH}, so no dice can be added.`
      ) +
      ':has(input[data-checks-preview-additional-dice]:disabled)' +
      ` ${ADDITIONAL_DICE}` +
      PATH_LINE(
        'warning',
        `An active effect changes Brenna Karrunsdottir's ${MOMENTUM_PATH}, so spending it would not lower it. Use a stored value.`
      ),
  }),
  // The retained read macro shows once the source switches; the spend macro is still unset.
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-macro',
    label: 'paid by macros, the spend macro not yet linked',
    frame: '07, macros',
    steps: [{ selector: '[data-check-additional-dice-source-option="macro"]' }],
    expectSelector:
      PREVIEW_NOTE('no-source', 'This check has no source to pay for additional dice.') +
      ` ${ADDITIONAL_DICE}:not(:has(${ADDITIONAL_DICE_PATH}))` +
      ':has([data-check-additional-dice-read-macro]:has-text("Read Momentum"))' +
      ' [data-check-additional-dice-spend-macro]:has-text("Drop a macro here")',
  }),
  // Both macros linked: the Preview never runs the read macro, so the maximum bounds it.
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-macro-pair',
    label: 'paid by a linked read and spend macro',
    frame: '07, macros',
    state: 'dice-pool-faults-macro',
    steps: [],
    expectSelector:
      PREVIEW_NOTE(
        'macro',
        'The preview never runs the read macro, so up to 1 can be added here.'
      ) +
      ` ${ADDITIONAL_DICE}:has([data-check-additional-dice-read-macro]:has-text("Read Momentum"))` +
      ' [data-check-additional-dice-spend-macro]:has-text("Announce Momentum")',
    // The linked uuid wraps under its Copy button rather than running beneath it.
    expectNoHorizontalOverflow:
      '[data-check-additional-dice-read-macro] .manager-item-drop-zone-copy',
  }),
  additionalDiceCase({
    id: 'manager-checks-v3-count-additional-dice-no-actor',
    label: 'with no Preview-as character',
    frame: '10 (`noActor`)',
    steps: [],
    expectSelector:
      PREVIEW_NOTE('no-actor', 'Choose a character to see how many they can add.') +
      ` ${ADDITIONAL_DICE}` +
      PATH_LINE('muted', 'Choose a character in Preview as to see what this resolves to.'),
  }),
  // Frames 07 and 17: additional dice raise the ceiling, so Arcane Work's three successes need
  // bought dice while Impossible Work's four stay past the most that can ever be rolled.
  authoringCase({
    id: 'manager-checks-v3-count-ceiling-additional',
    label: 'successes needed above the base pool, within additional dice',
    frame: '07 and 17',
    state: 'dice-pool-faults',
    steps: [{ selector: '[data-check-count-callouts]', scroll: true }],
    expectSelector:
      `${COUNTING}:has(${ADDITIONAL_DICE} [data-check-additional-dice][aria-pressed="true"])` +
      ':has([data-check-additional-dice-path-line="muted"])' +
      ' [data-check-count-callouts]' +
      ':has([data-check-count-callout="countRequiredExceedsBasePool"]:has-text("Arcane Work"))' +
      ':not(:has([data-check-count-callout="countRequiredExceedsMaxPool"]:has-text("Arcane Work")))' +
      ' [data-check-count-callout="countRequiredExceedsMaxPool"]:has-text("Impossible Work")',
  }),
  // Frame 22 (`rdySrc`): the path cleared raises the critical row beside the base-pool warning.
  additionalDiceValidationCase({
    id: 'manager-checks-validation-additional-dice',
    issue: 'countAdditionalDiceSourceMissing',
    label: 'additional dice with no source, on Validation',
    frame: '22',
    steps: [{ selector: ADDITIONAL_DICE_PATH, fill: '' }],
    expectSelector:
      ':has([data-issue="countRequiredExceedsBasePool"][data-issue-severity="warning"])' +
      ' [data-issue="countAdditionalDiceSourceMissing"][data-issue-severity="critical"]',
  }),
  // A list entry is not a stored path the spend can write back.
  additionalDiceValidationCase({
    id: 'manager-checks-validation-additional-dice-path-invalid',
    issue: 'countAdditionalDicePathInvalid',
    label: 'an additional-dice value that is not a stored path, on Validation',
    frame: '— (path invalid)',
    steps: [{ selector: ADDITIONAL_DICE_PATH, fill: 'system.items.0.value' }],
    expectSelector:
      ':not(:has([data-issue="countAdditionalDiceSourceMissing"]))' +
      ' [data-issue="countAdditionalDicePathInvalid"][data-issue-severity="critical"]',
  }),
  // The spend macro is a chat macro, which Fabricate never runs.
  additionalDiceValidationCase({
    id: 'manager-checks-validation-additional-dice-macro-invalid',
    issue: 'countAdditionalDiceMacroInvalid',
    label: 'a spend macro that is not a script macro, on Validation',
    frame: '— (macro invalid)',
    state: 'dice-pool-faults-macro',
    steps: [],
    expectSelector:
      ':not(:has([data-issue="countAdditionalDiceSourceMissing"]))' +
      ' [data-issue="countAdditionalDiceMacroInvalid"][data-issue-severity="critical"]' +
      ':has-text("The spend macro is missing or is not a script macro")',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-keep',
    label: 'roll extra, keep one, on 1d20',
    frame: '01',
    steps: parityFormula('1d20 + @prof'),
    expectSelector:
      '[data-check-advantage]:has([data-check-advantage-mode-option="keep"].is-active)' +
      ':has([data-check-advantage-extra][aria-valuetext="2d20"])' +
      ' [data-check-advantage-note]:text-is("Advantage rolls 2d20 and keeps the highest. Applies to the first dice group, 1d20.")',
  }),
  // The same block at the 1024x640 floor: segments, stepper and switch on the narrow card.
  advantageCase({
    id: 'manager-checks-crafting-advantage-keep-narrow',
    label: 'roll extra, keep one, on 1d20, at 1024x640',
    frame: '01',
    steps: parityFormula('1d20 + @prof'),
    position: { width: 1024, height: 640 },
    expectSelector:
      '[data-check-advantage]:has([data-check-advantage-extra][aria-valuetext="2d20"])' +
      ' [data-check-advantage-disadvantage][aria-pressed="true"]',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-keep-multi',
    label: 'two extra dice on 2d6',
    frame: '01, with 2d6',
    steps: [
      ...parityFormula('2d6 + @prof'),
      { selector: '.fab-stepper:has([data-check-advantage-extra]) [data-stepper-increment]' },
    ],
    expectSelector:
      '[data-check-advantage]:has([data-check-advantage-extra][aria-valuetext="4d6"])' +
      ' [data-check-advantage-note]:has-text("keeps the 2 highest. Applies to the first dice group, 2d6.")',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-keep-under',
    label: 'roll extra, keep one, lower is better',
    frame: '05',
    steps: [...parityFormula('1d20'), ...PARITY_UNDER],
    expectSelector:
      '[data-check-advantage]:has([data-check-advantage-note]:has-text("keeps the lowest."))' +
      ' [data-check-advantage-disadvantage-hint]:has-text("keeps the highest.")',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-keep-no-group',
    label: 'a first dice group that is not a plain die',
    frame: '— (new copy)',
    steps: parityFormula('(1d20+2)*2'),
    // The ordinary average still reads, and the Roll section carries the readiness dot.
    scope:
      '.fabricate-manager:has([data-checks-section-dot="roll"])' +
      ' [data-checks-panel="crafting"]:has([data-check-formula-average="25"])',
    expectSelector:
      '[data-check-advantage]:not(:has([data-check-advantage-extra]))' +
      ':not(:has([data-check-advantage-disadvantage]))' +
      ' [data-check-advantage-note]:has-text("is not a plain die")',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-bonus',
    label: 'a bonus die of 1d8 + 1',
    frame: '— (bonus mode)',
    steps: [
      ...parityFormula('1d20 + @prof'),
      advantageMode('bonus'),
      { selector: '[data-check-advantage-bonus]', fill: '1d8 + 1' },
    ],
    expectSelector:
      '[data-check-advantage]:has([data-check-advantage-bonus][aria-invalid="false"])' +
      ' [data-check-advantage-note]:has-text("by (1d8 + 1)")',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-bonus-invalid',
    label: 'a bonus expression that is not dice',
    frame: '— (bonus mode)',
    steps: [
      ...parityFormula('1d20 + @prof'),
      advantageMode('bonus'),
      { selector: '[data-check-advantage-bonus]', fill: '1d6x' },
    ],
    expectSelector:
      '[data-check-advantage]:has([data-check-advantage-bonus][aria-invalid="true"])' +
      ' [data-check-advantage-bonus-help].is-danger',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-off',
    label: 'advantage off',
    frame: '— (off)',
    steps: [...parityFormula('1d20 + @prof'), advantageMode('off')],
    expectSelector:
      '[data-check-advantage]:not(:has([data-check-advantage-disadvantage]))' +
      ' [data-check-advantage-note]:text-is("The prompt has a single Roll button.")',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-no-disadvantage',
    label: 'advantage without disadvantage',
    frame: '— (advantage only)',
    steps: [...parityFormula('1d20 + @prof'), { selector: '[data-check-advantage-disadvantage]' }],
    expectSelector:
      '[data-check-advantage]:has([data-check-advantage-disadvantage][aria-pressed="false"])' +
      ' [data-check-advantage-disadvantage-hint]:text-is("The prompt offers advantage only.")',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-count',
    label: 'a counting pool offering a die either way',
    frame: '06',
    state: 'dice-pool',
    steps: [],
    expectSelector:
      '[data-check-advantage="count"]:has([data-check-advantage-count][aria-pressed="true"])' +
      ' [data-check-advantage-count-dice]',
  }),
  advantageCase({
    id: 'manager-checks-crafting-advantage-count-off',
    label: 'a counting pool offering no advantage',
    frame: '06, turned off',
    state: 'dice-pool',
    steps: [{ selector: '[data-check-advantage-count]' }],
    expectSelector:
      '[data-check-advantage="count"]:has([data-check-advantage-count][aria-pressed="false"])' +
      ':not(:has([data-check-advantage-count-dice]))',
  }),
  // Validation lists the advantage faults. A check raises at most one keep fault and a system has
  // two formula-bearing checks, so the three ids take two frames: Herbalism's crafting and salvage.
  managerCase({
    id: 'manager-checks-validation-advantage',
    label: 'Manager — Checks validation, advantage rules the roll cannot honour',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...parityFormula('(1d20+2)*2'),
      { selector: '#manager-checks-nav-salvage' },
      advantageMode('bonus'),
      { selector: '[data-check-advantage-bonus]', fill: '1d6x' },
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="advantageKeepNoDie"]', scroll: true },
    ],
    expectView: 'checks-validation',
    expectSelector:
      '.fabricate-manager:has([data-issue="advantageKeepNoDie"][data-issue-severity="warning"])' +
      ' [data-issue="advantageBonusInvalid"][data-issue-severity="critical"]',
    kinds: ['manager', 'checks'],
    sourceMatches: ADVANTAGE_VALIDATION_SOURCES,
  }),
  managerCase({
    id: 'manager-checks-validation-advantage-reference',
    label: 'Manager — Checks validation, advantage keeping a die after a character value',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-smithing' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...parityFormula('@abilities.int.mod + 1d20'),
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="advantageKeepAfterReference"]', scroll: true },
    ],
    expectView: 'checks-validation',
    expectSelector:
      '.fabricate-manager [data-issue="advantageKeepAfterReference"][data-issue-severity="warning"]' +
      ':has-text("advantage still applies only to 1d20")',
    kinds: ['manager', 'checks'],
    sourceMatches: ADVANTAGE_VALIDATION_SOURCES,
  }),
]);
