/**
 * WHAT THIS MODE DOES: the Checks Studio's per-mode explanation, as data — a callout naming the
 * resolution mode, one paragraph on what it does with a roll, and three facts under it.
 *
 * IT IS PURE, AND IT COVERS EVERY MODE, so `tests/check-mode-callout.test.js` proves
 * exhaustiveness in BOTH directions. ALCHEMY HAS TWO ENTRIES, NOT THREE: there is no
 * `crafting:none`, alchemy at `checkMode: 'none'` being the OFF state of an optional check, so
 * `checkModeKey` returns `''` and the switched-off panel renders instead. Its SIMPLE check
 * states `check:optional` unlike its tiered sibling, a system wanting the reserved failure
 * result set having to roll one and a system that does not being served by switching it off.
 *
 * THE `MODES` TABLE IS ONE COPY-PASTE BLOCK, so keep edits inside it SMALL: thirteen entries of
 * one shape read as duplication to SonarCloud's CPD, new-code density is measured over the lines
 * a PR touches, and ANY edit there lands at 100% duplicated. That is why this rationale is in
 * the header, outside the block.
 *
 * GATHERING'S ROUTED AND PROGRESSIVE MODES ARE DORMANT, rendered disabled in the GM UI but still
 * REACHABLE, so the answer is dormancy framing in the Modifiers section's own words reused
 * VERBATIM — two sentences for one fact being the drift `checksCopy.js` prevents.
 *
 * Each entry is `{ icon, title, body, facts }` with `[key, fallback]` pairs, resolved by the
 * component's `text()` bridge.
 */

const NAMESPACE = 'FABRICATE.Admin.Manager.Checks.Mode.';

/** The shipped gathering dormancy sentence, reused rather than re-worded. */
const GATHERING_DORMANT_BODY = [
  'FABRICATE.Admin.Manager.Checks.Gathering.ModifierDormantBody',
  'Progressive and routed gathering are not available yet, so no gathering ' +
    'configuration you can choose today rolls a formula. Anything you set here is saved and ' +
    'starts applying as soon as those modes ship.',
];

/** The shipped gathering dormancy heading, used as this callout's `Check` fact value. */
const GATHERING_DORMANT_STATE = [
  'FABRICATE.Admin.Manager.Checks.Gathering.ModifierDormantHeading',
  'Not in use yet',
];

const FACT_ICONS = Object.freeze({
  check: 'fas fa-dice-d20',
  outcomes: 'fas fa-code-branch',
  results: 'fas fa-box-open',
});

const FACT_LABELS = Object.freeze({
  check: ['Check', 'Check'],
  outcomes: ['Outcomes', 'Outcomes'],
  results: ['Results', 'Results'],
});

/**
 * Resolve a `[key, fallback]` pair to a localization key. One already containing a `.` is
 * ABSOLUTE and used verbatim, which is how a sentence shipped under another namespace is reused
 * rather than re-authored under a second key that would drift from it.
 */
function copy(pair) {
  return { key: pair[0].includes('.') ? pair[0] : `${NAMESPACE}${pair[0]}`, fallback: pair[1] };
}

function fact(id, value) {
  return {
    id,
    icon: FACT_ICONS[id],
    label: copy([`Fact${FACT_LABELS[id][0]}`, FACT_LABELS[id][1]]),
    value: copy(value),
  };
}

/** `Check ·` values, shared across modes so two modes never spell one state differently. */
const REQUIRED = ['StateRequired', 'Required'];
const OPTIONAL = ['StateOptional', 'Optional'];
const FIXED_D100 = ['StateFixedD100', 'Fixed d100'];

/**
 * Every mode, keyed `<activity>:<mode>`. `crafting:alchemy` is keyed by the ALCHEMY CHECK MODE,
 * because that is the choice deciding what alchemy rolls.
 */
const MODES = Object.freeze({
  'crafting:routedByCheck': {
    icon: 'fas fa-dice-d20',
    title: ['RoutedByCheck', 'Routed by check'],
    body: [
      'RoutedByCheckBody',
      'One roll is rolled once and mapped onto a band. Each band is a named tier; recipes ' +
        'bind their result groups to those tiers, so one recipe can produce a ruined, an ' +
        'ordinary or a masterwork result.',
    ],
    facts: ['check:required', 'outcomes:tiers', 'results:tiers'],
  },
  'crafting:routedByIngredients': {
    icon: 'fas fa-flask',
    title: ['RoutedByIngredients', 'Routed by ingredients'],
    body: [
      'RoutedByIngredientsBody',
      'The ingredient set a crafter brings decides which result group is produced. The check ' +
        'is a pass/fail gate over that choice rather than the thing that chooses.',
    ],
    facts: ['check:optional', 'outcomes:passFail', 'results:ingredients'],
  },
  'crafting:simple': {
    icon: 'fas fa-circle-check',
    title: ['Simple', 'Simple'],
    body: [
      'SimpleBody',
      'One roll is measured against the difficulty. The recipe produces its single result ' +
        'group when the roll clears it, and nothing when it does not.',
    ],
    facts: ['check:optional', 'outcomes:passFail', 'results:single'],
  },
  'crafting:progressive': {
    icon: 'fas fa-stairs',
    title: ['Progressive', 'Progressive'],
    body: [
      'ProgressiveBody',
      'The roll produces a value rather than a verdict, and that value is spent down an ' +
        'ordered list of results until it runs out.',
    ],
    facts: ['check:required', 'outcomes:ordered', 'results:spent'],
  },
  'crafting:alchemySimple': {
    icon: 'fas fa-dice-d20',
    title: ['AlchemySimple', 'Simple check'],
    body: [
      'AlchemySimpleBody',
      'A pass/fail check you can switch off. On a pass the success result set is produced; ' +
        'on a fail the reserved failure result set is.',
    ],
    facts: ['check:optional', 'outcomes:passFail', 'results:successFailure'],
  },
  'crafting:alchemyTiered': {
    icon: 'fas fa-stairs',
    title: ['AlchemyTiered', 'Tiered check'],
    body: [
      'AlchemyTieredBody',
      'A mandatory routed check. The roll is mapped onto a named tier, and each success tier ' +
        'routes to the result set bound to it.',
    ],
    facts: ['check:required', 'outcomes:tiers', 'results:tiers'],
  },
  'salvage:routed': {
    icon: 'fas fa-dice-d20',
    title: ['RoutedByCheck', 'Routed by check'],
    body: [
      'SalvageRoutedBody',
      'One roll is rolled once and mapped onto a band. Each band is a named tier, and a ' +
        'salvageable item binds its result groups to those tiers.',
    ],
    facts: ['check:required', 'outcomes:tiers', 'results:tiers'],
  },
  'salvage:simple': {
    icon: 'fas fa-circle-check',
    title: ['Simple', 'Simple'],
    body: [
      'SalvageSimpleBody',
      'One roll is measured against the difficulty. A cleared roll returns the item’s ' +
        'salvage results, and a missed one returns nothing.',
    ],
    facts: ['check:optional', 'outcomes:passFail', 'results:single'],
  },
  'salvage:progressive': {
    icon: 'fas fa-stairs',
    title: ['Progressive', 'Progressive'],
    body: [
      'SalvageProgressiveBody',
      'The roll produces a value rather than a verdict, and that value is spent down the ' +
        'item’s ordered salvage results until it runs out.',
    ],
    facts: ['check:required', 'outcomes:ordered', 'results:spent'],
  },
  'gathering:d100': {
    icon: 'fas fa-percent',
    title: ['GatheringD100', 'd100 roll'],
    body: [
      'GatheringD100Body',
      'Each drop is rolled against its own percentage chance. There is no formula and no ' +
        'difficulty to author here — per-task tuning adjusts the chance, not the roll.',
    ],
    facts: ['check:fixedD100', 'outcomes:perDrop', 'results:perDrop'],
  },
  // DORMANT. See the module note: the framing is the Modifiers section's, verbatim.
  'gathering:routed': {
    icon: 'fas fa-clock',
    dormant: true,
    title: ['RoutedByCheck', 'Routed by check'],
    body: GATHERING_DORMANT_BODY,
    facts: ['check:dormant', 'outcomes:tiers', 'results:tiers'],
  },
  'gathering:progressive': {
    icon: 'fas fa-clock',
    dormant: true,
    title: ['Progressive', 'Progressive'],
    body: GATHERING_DORMANT_BODY,
    facts: ['check:dormant', 'outcomes:ordered', 'results:spent'],
  },
});

const FACT_VALUES = Object.freeze({
  'check:required': REQUIRED,
  'check:optional': OPTIONAL,
  'check:fixedD100': FIXED_D100,
  'check:dormant': GATHERING_DORMANT_STATE,
  'outcomes:tiers': ['OutcomesTiers', '{count} tiers'],
  'outcomes:passFail': ['OutcomesPassFail', 'Pass or fail'],
  'outcomes:ordered': ['OutcomesOrdered', 'An ordered list'],
  'outcomes:perDrop': ['OutcomesPerDrop', 'One per drop'],
  'results:tiers': ['ResultsTiers', 'Bound to tiers'],
  'results:ingredients': ['ResultsIngredients', 'Chosen by ingredients'],
  'results:single': ['ResultsSingle', 'One result group'],
  'results:spent': ['ResultsSpent', 'Spent down the list'],
  'results:successFailure': ['ResultsSuccessFailure', 'Success or failure set'],
  'results:perDrop': ['ResultsPerDrop', 'Rolled per drop'],
});

/** Every key this module can describe, for the exhaustiveness gate. */
export const CHECK_MODE_KEYS = Object.freeze(Object.keys(MODES));

/**
 * The key for one (activity, mode) pair. Alchemy is folded onto its CHECK MODE here rather than
 * at every call site, so the one place knowing `alchemy` is not itself a check mode is this one.
 *
 * @param {object} args
 * @param {string} args.activity `crafting` | `salvage` | `gathering`.
 * @param {string} args.mode The authored resolution mode for that activity.
 * @param {string} [args.alchemyCheckMode] `none` | `simple` | `tiered`, for `crafting:alchemy`.
 * @returns {string} The `MODES` key, or `''` when the pair is not one this studio renders.
 */
export function checkModeKey({ activity, mode, alchemyCheckMode = '' } = {}) {
  if (activity === 'crafting' && mode === 'alchemy') {
    if (alchemyCheckMode === 'simple') return 'crafting:alchemySimple';
    if (alchemyCheckMode === 'tiered') return 'crafting:alchemyTiered';
    // `none` is the OFF state, whose route renders no roll section, so `''` makes the caller
    // render nothing rather than a description of a mode the GM did not choose.
    return '';
  }
  const key = `${activity}:${mode}`;
  return Object.hasOwn(MODES, key) ? key : '';
}

/**
 * Describe one resolution mode. Returns `null` for a pair this studio does not render, so a
 * caller renders NOTHING rather than a callout about some other mode: a missing explanation is
 * a gap, and a confident wrong one is a lie.
 *
 * @param {object} args
 * @param {string} args.activity `crafting` | `salvage` | `gathering`.
 * @param {string} args.mode The authored resolution mode.
 * @param {string} [args.alchemyCheckMode] The alchemy check mode, when `mode` is `alchemy`.
 * @param {number} [args.outcomeCount] Authored outcome tiers, for the `{count} tiers` fact.
 * @returns {{key: string, icon: string, dormant: boolean, title: object, body: object,
 *   facts: object[]}|null}
 */
export function describeCheckMode({
  activity,
  mode,
  alchemyCheckMode = '',
  outcomeCount = 0,
} = {}) {
  const key = checkModeKey({ activity, mode, alchemyCheckMode });
  if (!key) return null;
  const entry = MODES[key];
  return {
    key,
    icon: entry.icon,
    dormant: entry.dormant === true,
    title: copy(entry.title),
    body: copy(entry.body),
    facts: entry.facts.map((token) => ({
      ...fact(token.slice(0, token.indexOf(':')), FACT_VALUES[token]),
      // Interpolated through the same `{count}` syntax Foundry's `i18n.format` uses, so the
      // fallback path renders a number rather than a literal `{count}`.
      data: { count: String(Number(outcomeCount) || 0) },
    })),
  };
}
