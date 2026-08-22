/**
 * WHAT THIS MODE DOES: the Checks Studio's per-mode explanation, as data (issue 1096).
 *
 * The roll section opens with a callout naming the resolution mode, explaining in one
 * paragraph what that mode does with a roll, and stating three facts under it — whether the
 * check is rolled at all, what shape its outcomes take, and how results are reached. Without
 * it the studio opened straight onto a formula field, and nothing on the screen said what the
 * mode the GM had chosen elsewhere actually does.
 *
 * ## It is a pure module, and it covers EVERY mode
 *
 * No Svelte and no Foundry, so `tests/check-mode-callout.test.js` can prove exhaustiveness in
 * both directions: every (activity, mode) pair the product can render has an entry, and every
 * entry names a pair the product can reach. A mode with no entry would render its raw token to
 * a GM, and an entry for a mode nothing can select is copy nobody will ever see.
 *
 * ## Alchemy has TWO entries, not three, and its Simple check is OPTIONAL
 *
 * There is no `crafting:none`. Alchemy at `checkMode: 'none'` is the OFF state of an optional
 * check rather than a mode of its own, so its route renders the shared switched-off panel and
 * the roll section — this callout with it — never renders. An entry for it would be copy
 * nobody can reach, which is what the exhaustiveness gate exists to prevent; `checkModeKey`
 * returns `''` for it and the caller renders nothing, the safe direction documented below.
 *
 * `crafting:alchemySimple` states `check:optional`, unlike its tiered sibling. The engine can
 * only reach the reserved failure result set through this check, so a system that wants one
 * has to roll it — but a system that does not is served by switching the check off, which is
 * what the rail's Active switch writes. `Required` was the fact that sent a GM looking for an
 * off switch the studio would not show them. Tiered stays required: it routes result groups by
 * outcome tier and cannot resolve without a roll.
 *
 * ## THE `MODES` TABLE IS ONE COPY-PASTE BLOCK, so keep edits inside it SMALL
 *
 * Thirteen entries of the same `{ icon, title, body, facts }` shape read as duplication to
 * SonarCloud's CPD, and the whole table sits inside the flagged region. New-code duplication
 * density is measured over the lines a PR touches, so ANY edit here — a reworded sentence, an
 * explanatory comment — lands at 100% duplicated and can fail the quality gate on its own.
 * That is why the rationale above lives in this header rather than beside the entry it
 * explains: the header is outside the block. Restructuring the table to satisfy CPD would cost
 * the declarative shape that makes it checkable, which is a worse trade.
 *
 * ## Gathering's routed and progressive modes are DORMANT, not configurable
 *
 * They are rendered disabled in the GM UI pending issue 683, so no gathering configuration a
 * GM can choose today rolls a formula (`d100` bypasses the formula runner entirely). A callout
 * presenting either as a live configuration would be a promise the product does not keep.
 *
 * They are still REACHABLE — a world whose economy already carries one of those modes renders
 * this screen — so the answer is dormancy framing rather than absence, and the framing is the
 * one the Modifiers section already ships (`Checks.Gathering.ModifierDormant*`), reused
 * VERBATIM rather than re-worded. Two sentences for one fact on two sections of one screen is
 * exactly the drift the shared `checksCopy.js` exists to prevent.
 *
 * Each entry is `{ icon, title, body, facts }` with `[key, fallback]` pairs, resolved by the
 * component's own `text()` bridge: the localization seam belongs to the Svelte layer and this
 * module stays pure.
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
 * Resolve a `[key, fallback]` pair to a localization key.
 *
 * A key already containing a `.` is ABSOLUTE and is used verbatim: that is how a sentence the
 * product already ships under another namespace — gathering's dormancy notice — is reused
 * rather than re-authored under a second key that would then drift from it.
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
 * Every mode, keyed `<activity>:<mode>`.
 *
 * `crafting:alchemy` is keyed by the ALCHEMY CHECK MODE rather than by `alchemy`, because
 * that is the choice which decides what alchemy rolls — the same reason
 * `SUBSYSTEM_MODE_LABELS` in `ChecksView.svelte` names the alchemy check mode in its rail row.
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
 * The key for one (activity, mode) pair.
 *
 * Alchemy is folded onto its CHECK MODE here rather than at every call site, so the one place
 * that knows `alchemy` is not itself a check mode is this module.
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
    // `none` is the OFF state, whose route renders no roll section at all — so there is no
    // callout to key, and `''` makes the caller render nothing rather than a description of
    // a mode the GM did not choose.
    return '';
  }
  const key = `${activity}:${mode}`;
  return Object.hasOwn(MODES, key) ? key : '';
}

/**
 * Describe one resolution mode.
 *
 * Returns `null` for a pair this studio does not render, so a caller renders NOTHING rather
 * than a callout describing some other mode. That is the safe direction: a missing explanation
 * is a gap, and a confident wrong one is a lie.
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
      // Interpolated by the component through the same `{count}` syntax Foundry's own
      // `i18n.format` uses, so the fallback path renders a number rather than a literal
      // `{count}` in a world with no `lang/` entry for a new key.
      data: { count: String(Number(outcomeCount) || 0) },
    })),
  };
}
