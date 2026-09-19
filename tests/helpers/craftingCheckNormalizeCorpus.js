/**
 * The crafting-check normalization corpus (issue 1698): the inputs the equivalence pin and the
 * delegate-forwarding proof both run over, so the two suites share one source of truth. Authored
 * directly because no repository fixture carries a legacy check block; the legacy shapes are
 * copied in as data from the sample system `scripts/foundry/create-mythwright-dnd5e.js` builds.
 */

/** The system-level library the known-basis scenarios prune `defaultModifierIds` against. */
export const CORPUS_MODIFIERS = Object.freeze([
  Object.freeze({ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }),
  Object.freeze({ id: 'ath', label: 'Athletics', expression: '@abilities.ath.mod' }),
]);

/** The non-vacuousness floors the pin suite asserts, so a gutted corpus cannot read green. */
export const CORPUS_FLOORS = Object.freeze({ scenarios: 27, modifierSelectionCases: 2 });

/** A fresh known Valid Id Basis per call, because a caller may mutate the Set it is handed. */
export function knownModifierBasis() {
  return new Set(['med', 'ath']);
}

/**
 * A formula carrying two plain dice groups and one modified pool, so a crit keyed to the pool is
 * dropped while the two plain groups resolve to group indices 0 and 1.
 */
const MIXED_FORMULA = '1d20 + 2d6 + 3d6kh2 + @abilities.str.mod';

/** Crits covering a bare `dN` key, an out-of-range raw, a modified pool, an orphan and no id. */
function diceCrits() {
  return [
    { id: 'crit-bare-die', die: 'd20', raw: 20, success: false, breakTools: true },
    { id: 'crit-out-of-range', die: '1d20', raw: 25, success: true },
    { id: 'crit-modified-pool', die: '3d6kh2', raw: 10, success: true },
    { id: 'crit-orphan-die', die: '1d12', raw: 6 },
    { die: '2d6', raw: '4', success: true },
    null,
    'not-an-object',
  ];
}

/** Every condition type, the malformed shapes, a legacy break-only trigger and a tier step. */
function triggerMatrix() {
  return {
    triggers: [
      {
        id: 'trig-roll-total',
        condition: { type: 'rollTotal', operator: '>=', value: '18' },
        outcome: 'success',
        breakTools: false,
        tierStep: { mode: 'up', steps: 2, tierId: '  tier-fine  ' },
      },
      {
        id: 'trig-progressive-value',
        condition: { type: 'progressiveValue', operator: '<', value: 4 },
        outcome: 'failure',
        breakTools: true,
      },
      {
        id: 'trig-outcome-tier',
        condition: {
          type: 'outcomeTier',
          tierIds: ['tier-fine', ''],
          outcomeKeys: [' Critical ', 'critical', ''],
        },
        outcome: 'success',
        breakTools: true,
        tierStep: { mode: 'target', steps: '0', tierId: 'tier-mythic' },
      },
      {
        id: 'trig-dice-group',
        condition: { type: 'diceGroup', groupId: '0', aggregate: 'anyDie', operator: '==', value: 20 },
        outcome: 'bogus',
        breakTools: 'yes',
      },
      { id: 'trig-legacy-break-only', condition: { type: 'rollTotal', operator: '<=', value: 3 } },
      { condition: { type: 'progressiveValue', operator: '>', value: 1 }, outcome: 'none' },
      null,
      { id: 'malformed-no-condition' },
      { id: 'malformed-operator', condition: { type: 'rollTotal', operator: '!=', value: 5 } },
      { id: 'malformed-empty-tier', condition: { type: 'outcomeTier', tierIds: [], outcomeKeys: [] } },
      { id: 'malformed-unknown-type', condition: { type: 'bogus', operator: '==', value: 1 } },
      {
        id: 'malformed-aggregate',
        condition: { type: 'diceGroup', groupId: 0, aggregate: 'sum', operator: '==', value: 2 },
      },
      {
        id: 'malformed-group-id',
        condition: { type: 'diceGroup', groupId: -1, aggregate: 'total', operator: '==', value: 2 },
      },
    ],
  };
}

/** A short authored trigger pair, for scenarios whose subject is not the trigger matrix. */
function shortTriggers() {
  return {
    triggers: [
      {
        id: 'trig-short-total',
        condition: { type: 'rollTotal', operator: '>=', value: 18 },
        outcome: 'success',
        breakTools: false,
      },
      { id: 'trig-short-legacy', condition: { type: 'progressiveValue', operator: '<', value: 2 } },
    ],
  };
}

/** Recipe tiers, including the two shapes the normalizer drops. */
function simpleTiers() {
  return [{ id: 'tier-fine', name: '  Fine  ', dc: 12.7 }, { name: 'Unnamed', dc: 'x' }, null, 'no'];
}

/**
 * A fully-authored modern check. BOTH routed outcome lists are populated whichever `type` is set,
 * so a dropped `kind` argument at either `.map()` call reds. The trigger matrix has its own
 * scenario; this one carries a short authored list so the golden does not repeat it eight times.
 */
function modernCheck(routedType) {
  return {
    enabled: true,
    mode: 'passFail',
    consumption: {
      consumeIngredientsOnFail: false,
      consumeComponentOnFail: false,
      breakToolsOnFail: true,
    },
    failureResultPolicy: 'always',
    outcomes: ['Fail', 'pass', 'PASS', ' fail '],
    defaultModifierPolicy: 'bySubject',
    defaultModifierIds: ['med', 'ath', 'ghost', 'med'],
    maxModifierPicks: 2,
    simple: {
      rollFormula: MIXED_FORMULA,
      dc: '17',
      thresholdMode: 'exceed',
      dcMode: 'dynamic',
      macroUuid: 'Macro.abcdef0123456789',
      tiers: simpleTiers(),
      diceCrits: diceCrits(),
      checkBreakage: shortTriggers(),
    },
    progressive: {
      awardMode: 'partial',
      rollFormula: '2d6 + 1d20',
      preview: { difficulties: [4, '6', 'nine', 9] },
      diceCrits: [{ id: 'crit-progressive', die: '2d6', raw: 12, success: true }],
      checkBreakage: shortTriggers(),
    },
    routed: {
      type: routedType,
      rollFormula: MIXED_FORMULA,
      dc: 15.9,
      thresholdMode: 'meet',
      dcMode: 'static',
      macroUuid: null,
      tiers: simpleTiers(),
      relativeOutcomes: [
        { id: 'rel-close', name: '  Close  ', dc: 3.7, success: true, breakTools: true },
        { name: 'Minted Relative' },
        null,
      ],
      fixedOutcomes: [
        { id: 'fix-band', name: 'Band', start: 1.2, end: '9', success: false, breakTools: true },
        { name: 'Minted Fixed' },
        'not-an-object',
      ],
      diceCrits: diceCrits(),
      checkBreakage: shortTriggers(),
    },
  };
}

/** A routed slot alone, for the `natStepping` and `rollExpression` read aliases. */
function routedOnly(routed) {
  return { enabled: true, routed };
}

/**
 * Every scenario the equivalence pin drives through the three activity entry points and through
 * `_normalizeSystem`. `omitValidIds` calls the entry point with the second argument absent.
 */
export function craftingCheckScenarios() {
  const basis = () => ({ validIds: knownModifierBasis() });
  return [
    { name: 'empty', check: {}, ...basis() },
    { name: 'modernRelative', check: modernCheck('relative'), ...basis() },
    {
      name: 'modernRoutedFixedType',
      check: routedOnly(modernCheck('fixed').routed),
      ...basis(),
    },
    {
      name: 'legacyNamedOutcomes',
      check: {
        enabled: true,
        macroUuid: '',
        mode: 'namedOutcomes',
        outcomes: ['Flawed', 'standard', 'FINE', 'flawed', 'Mythic'],
        consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: true },
      },
      ...basis(),
    },
    {
      name: 'diceCritsOnEverySubCheck',
      check: {
        enabled: true,
        simple: { rollFormula: MIXED_FORMULA, diceCrits: diceCrits() },
        progressive: { rollFormula: MIXED_FORMULA, diceCrits: diceCrits() },
        routed: { rollFormula: MIXED_FORMULA, diceCrits: diceCrits() },
      },
      ...basis(),
    },
    {
      name: 'natSteppingWithD20Group',
      check: routedOnly({ rollFormula: '2d6 + 1d20', natStepping: true, type: 'relative' }),
      ...basis(),
    },
    {
      name: 'natSteppingWithoutD20Group',
      check: routedOnly({ rollFormula: '2d6', natStepping: true, type: 'relative' }),
      ...basis(),
    },
    {
      name: 'natSteppingOnFixedType',
      check: routedOnly({ rollFormula: '1d20', natStepping: true, type: 'fixed' }),
      ...basis(),
    },
    {
      name: 'routedRollExpressionOnly',
      check: routedOnly({ rollExpression: '1d20 + @abilities.dex.mod', dc: 14 }),
      ...basis(),
    },
    {
      name: 'consumeCatalystsOnFailAlone',
      check: { consumption: { consumeCatalystsOnFail: true } },
      ...basis(),
    },
    {
      name: 'consumeCatalystsBesideCanonicalKey',
      check: { consumption: { breakToolsOnFail: false, consumeCatalystsOnFail: true } },
      ...basis(),
    },
    {
      name: 'triggerMatrixOnEverySubCheck',
      check: {
        simple: { rollFormula: '1d20', checkBreakage: triggerMatrix() },
        progressive: { rollFormula: '1d20', checkBreakage: triggerMatrix() },
        routed: { rollFormula: '1d20', checkBreakage: triggerMatrix() },
      },
      ...basis(),
    },
    { name: 'failureResultPolicyNever', check: { failureResultPolicy: 'never' }, ...basis() },
    { name: 'failureResultPolicyPerRecord', check: { failureResultPolicy: 'perRecord' }, ...basis() },
    { name: 'failureResultPolicyAlways', check: { failureResultPolicy: 'always' }, ...basis() },
    { name: 'failureResultPolicyBogus', check: { failureResultPolicy: 'bogus' }, ...basis() },
    {
      name: 'modifierBasisKnown',
      check: { defaultModifierPolicy: 'byRecipe', defaultModifierIds: ['med', 'ghost', 'ath'] },
      ...basis(),
    },
    {
      name: 'modifierBasisEmpty',
      check: { defaultModifierPolicy: 'highest', defaultModifierIds: ['med', 'ath'] },
      validIds: new Set(),
    },
    {
      name: 'modifierBasisNullSentinel',
      check: { defaultModifierPolicy: 'playerPicks', defaultModifierIds: ['med', 'ghost', 7] },
      validIds: null,
    },
    {
      name: 'modifierBasisOmittedArgument',
      check: { defaultModifierPolicy: 'nonsense', defaultModifierIds: ['med', 'ghost'] },
      omitValidIds: true,
    },
    { name: 'maxModifierPicksNull', check: { maxModifierPicks: null }, ...basis() },
    { name: 'maxModifierPicksZero', check: { maxModifierPicks: 0 }, ...basis() },
    { name: 'maxModifierPicksNegative', check: { maxModifierPicks: -1 }, ...basis() },
    { name: 'maxModifierPicksString', check: { maxModifierPicks: '3' }, ...basis() },
    { name: 'maxModifierPicksThree', check: { maxModifierPicks: 3 }, ...basis() },
    {
      name: 'progressivePreviewAuthored',
      check: { progressive: { rollFormula: '3d6', preview: { difficulties: [3, 'x', 8.5] } } },
      ...basis(),
    },
    {
      name: 'progressivePreviewAbsent',
      check: { progressive: { rollFormula: '3d6', awardMode: 'exceed' } },
      ...basis(),
    },
  ];
}

/**
 * The two direct `_normalizeCheckModifierSelection` calls: the omitted second argument, and the
 * non-Set truthy value. They are the only inputs that kill the helper-default and truthiness
 * variants of the Valid Id Basis sentinel.
 */
export function modifierSelectionScenarios() {
  return [
    {
      name: 'omittedBasisArgument',
      check: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['med', 'ath'] },
      omitValidIds: true,
    },
    {
      name: 'nonSetTruthyBasis',
      check: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['med', 'ath'] },
      validIds: ['med'],
    },
  ];
}

/** The system wrapper the `_normalizeSystem` pass drives, carrying the legacy modifier library. */
export function corpusSystem(check) {
  return {
    id: 'sys-crafting-check-corpus',
    name: 'Crafting Check Corpus',
    modifiers: CORPUS_MODIFIERS.map((modifier) => ({ ...modifier })),
    craftingCheck: check,
    salvageCraftingCheck: check,
    gatheringCraftingCheck: check,
  };
}
