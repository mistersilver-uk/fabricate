// Unit tests for the pure per-recipe crafting-check modifier resolver (issues 770, 1055).
import test from 'node:test';
import assert from 'node:assert/strict';

const RESOLVER_MODULE = '../src/systems/craftingModifierResolver.js';

const {
  MODIFIER_POLICIES,
  normalizeModifierPolicy,
  policyDefersSelection,
  resolveMaxModifierPicks,
  buildCraftingModifierContext,
  resolveActiveCraftingCheckFormula,
  resolveModifierPolicy,
  resolveEligibleModifierIds,
  resolveCraftingModifierScalar,
  buildCraftingModifierChoice,
  evaluateNumericExpression,
  makeRollDataExpressionEvaluator,
  applyCraftingModifier,
} = await import(RESOLVER_MODULE);

const CATALOGUE = [
  { id: 'med', label: 'Medicine', expression: '@med' },
  { id: 'alch', label: 'Alchemy', expression: '@alch' },
  { id: 'herb', label: 'Herbalism', expression: '@herb' },
];

// A deterministic expression evaluator keyed by the catalogue's expression string.
function evaluatorFor(values) {
  return (expression) => (expression in values ? values[expression] : 0);
}

// ── the four combination rules (issue 1055) ──────────────────────────────────

test('MODIFIER_POLICIES is the frozen authoring order of all FOUR combination rules', () => {
  assert.deepEqual(
    [...MODIFIER_POLICIES],
    ['addAll', 'highest', 'byRecipe', 'playerPicks'],
    'the two non-selecting rules first, then the two that defer the selection'
  );
  assert.ok(Object.isFrozen(MODIFIER_POLICIES));
});

test('normalizeModifierPolicy accepts every offerable rule and nulls everything else', () => {
  for (const policy of MODIFIER_POLICIES) assert.equal(normalizeModifierPolicy(policy), policy);
  // `byRecipe` is a FIRST-CLASS rule again ("Recipe picks"), not a retired token mapped
  // onto `addAll`: it says the recipe author selects, which is a different question from
  // how the selection combines.
  assert.equal(normalizeModifierPolicy('byRecipe'), 'byRecipe');
  for (const junk of ['bogus', '', undefined, null, 3, {}]) {
    assert.equal(normalizeModifierPolicy(junk), null, `${JSON.stringify(junk)} is not a rule`);
  }
});

// The membership test both authoring surfaces ask rather than re-deriving: the Checks
// card shows the cap input under exactly these rules, and the recipe editor offers its
// picker under `byRecipe`.
test('policyDefersSelection is true for byRecipe and playerPicks only', () => {
  for (const policy of ['byRecipe', 'playerPicks']) {
    assert.equal(policyDefersSelection(policy), true, `${policy} hands the selection to someone`);
  }
  for (const policy of ['addAll', 'highest', 'bogus', '', undefined, null]) {
    assert.equal(
      policyDefersSelection(policy),
      false,
      `${String(policy)} does not defer the selection, so a cap means nothing to it`
    );
  }
});

// ── the pick cap (issue 1055) ────────────────────────────────────────────────
//
// ABSENCE IS UNLIMITED, and every unbounded FORM reports the same `Infinity`, so no
// caller has to special-case a sentinel. A system that has never been asked the question
// must not silently acquire a bound that truncates recipe picks already on disk — the
// `1.20.0` migration, not this function, is where historical `playerPicks` worlds get
// their `1`.
test('resolveMaxModifierPicks reports every unbounded form as Infinity', () => {
  for (const maxModifierPicks of [undefined, null, 0, -1, 2.5, Infinity, NaN, '', 'three', {}]) {
    assert.equal(
      resolveMaxModifierPicks({ maxModifierPicks }),
      Infinity,
      `${String(maxModifierPicks)} is not a usable bound, so it is unlimited`
    );
  }
  assert.equal(resolveMaxModifierPicks({}), Infinity, 'an absent key is unlimited');
  assert.equal(resolveMaxModifierPicks(null), Infinity, 'and so is no context at all');
  assert.equal(resolveMaxModifierPicks(undefined), Infinity);
});

test('resolveMaxModifierPicks passes a positive integer through, including a numeric string', () => {
  for (const [input, expected] of [
    [1, 1],
    [3, 3],
    [12, 12],
    // `Number('2')` is an integer, so a setting persisted as a string still bounds.
    ['2', 2],
  ]) {
    assert.equal(resolveMaxModifierPicks({ maxModifierPicks: input }), expected);
  }
});

// ── rule resolution: the SYSTEM decides, full stop ───────────────────────────

test('resolveModifierPolicy reads the system rule and NEVER a recipe override', () => {
  assert.equal(resolveModifierPolicy({ systemPolicy: 'highest' }), 'highest');
  assert.equal(resolveModifierPolicy({ systemPolicy: 'byRecipe' }), 'byRecipe');
  assert.equal(resolveModifierPolicy({}), 'addAll', 'no rule anywhere → addAll');
  assert.equal(resolveModifierPolicy(null), 'addAll', 'and no context at all → addAll');
  assert.equal(resolveModifierPolicy({ systemPolicy: 'bogus' }), 'addAll');
  // A legacy `craftingModifier.policy` left on disk by a pre-1055 world stays on disk and
  // stays UNHONOURED. The invariant lives in the resolver rather than at the authoring
  // control, so no hand-built context can smuggle a rule override back in.
  for (const stale of ['addAll', 'highest', 'byRecipe', 'playerPicks']) {
    assert.equal(
      resolveModifierPolicy({ systemPolicy: 'highest', recipeModifier: { policy: stale } }),
      'highest',
      `a stored recipe rule (${stale}) cannot override the system's`
    );
  }
});

// ── eligible id resolution ───────────────────────────────────────────────────

test('resolveEligibleModifierIds uses system defaults, drops unknown + duplicate ids', () => {
  const ids = resolveEligibleModifierIds({
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'ghost', 'alch', 'med'],
  });
  assert.deepEqual(ids, ['med', 'alch'], 'unknown "ghost" and duplicate "med" dropped, order kept');
});

test('resolveEligibleModifierIds: the recipe SET is the source under byRecipe ONLY', () => {
  const base = {
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'alch', 'herb'],
    recipeModifier: { modifierIds: ['alch'] },
  };
  assert.deepEqual(
    resolveEligibleModifierIds({ ...base, systemPolicy: 'byRecipe' }),
    ['alch'],
    'byRecipe hands the selection to the recipe author'
  );
  for (const systemPolicy of ['addAll', 'highest', 'playerPicks', undefined, 'bogus']) {
    assert.deepEqual(
      resolveEligibleModifierIds({ ...base, systemPolicy }),
      ['med', 'alch', 'herb'],
      `at ${String(systemPolicy)} the system default set is the source and the stored subset is ignored`
    );
  }
});

test('resolveEligibleModifierIds: an AUTHORED empty set resolves to no modifiers under byRecipe', () => {
  const context = {
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'alch'],
    recipeModifier: { modifierIds: [] },
  };
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, systemPolicy: 'byRecipe' }),
    [],
    'an authored empty array is an override, not an absence'
  );
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, systemPolicy: 'addAll' }),
    ['med', 'alch'],
    '…and it is ignored like any other recipe pick under a rule that does not defer'
  );
});

test('resolveEligibleModifierIds: recipe with no modifierIds array falls back to defaults', () => {
  const ids = resolveEligibleModifierIds({
    catalogue: CATALOGUE,
    systemPolicy: 'byRecipe',
    defaultModifierIds: ['med'],
    recipeModifier: {},
  });
  assert.deepEqual(ids, ['med'], 'nothing picked → the system default set');
});

// The cap is enforced HERE and not only at the picker, per "a UI control's constraint is
// never an invariant": a GM who lowers the cap below what a recipe already picked must
// not leave that recipe rolling more modifiers than the system now permits.
test('resolveEligibleModifierIds TRUNCATES a byRecipe pick to maxModifierPicks, in authored order', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'byRecipe',
    defaultModifierIds: ['med'],
    recipeModifier: { modifierIds: ['herb', 'med', 'alch'] },
  };
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, maxModifierPicks: 2 }),
    ['herb', 'med'],
    'the FIRST N in authored order survive — not the best N'
  );
  assert.deepEqual(resolveEligibleModifierIds({ ...context, maxModifierPicks: 1 }), ['herb']);
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, maxModifierPicks: 9 }),
    ['herb', 'med', 'alch'],
    'a cap above the pick truncates nothing'
  );
  for (const unbounded of [undefined, null, 0, -1, 2.5]) {
    assert.deepEqual(
      resolveEligibleModifierIds({ ...context, maxModifierPicks: unbounded }),
      ['herb', 'med', 'alch'],
      `${String(unbounded)} is unlimited, so the whole pick survives`
    );
  }
  // The truncation counts SURVIVORS, not source entries: an unknown id ahead of the cap
  // must not consume a slot a real pick was entitled to.
  assert.deepEqual(
    resolveEligibleModifierIds({
      ...context,
      maxModifierPicks: 2,
      recipeModifier: { modifierIds: ['ghost', 'herb', 'med', 'alch'] },
    }),
    ['herb', 'med'],
    'the unknown "ghost" is dropped before the cap is counted'
  );
});

// The cap bounds the SELECTION, and under `playerPicks` the eligible list is the set of
// OPTIONS OFFERED rather than a selection — so it is deliberately not truncated here.
// `buildCraftingModifierChoice` carries the bound to the prompt instead.
test('resolveEligibleModifierIds does NOT truncate the playerPicks option list', () => {
  assert.deepEqual(
    resolveEligibleModifierIds({
      catalogue: CATALOGUE,
      systemPolicy: 'playerPicks',
      defaultModifierIds: ['med', 'alch', 'herb'],
      maxModifierPicks: 1,
    }),
    ['med', 'alch', 'herb'],
    'a cap of 1 still offers all three options; it bounds what the player may pick FROM them'
  );
});

// ── the one shared context bag (issue 1055) ──────────────────────────────────
//
// The engine and the listing builder both build their `@craftingmod` context HERE, so a
// displayed formula can never disagree with the rolled one. The shape is fixed: the cap
// key is always present, and `undefined` is what an unbounded system reads as.

test('buildCraftingModifierContext projects the check config and the recipe pick', () => {
  const system = {
    craftingCheck: {
      checkModifiers: CATALOGUE,
      defaultModifierPolicy: 'byRecipe',
      defaultModifierIds: ['med'],
      maxModifierPicks: 2,
    },
  };
  assert.deepEqual(
    buildCraftingModifierContext(system, { craftingModifier: { modifierIds: ['alch'] } }),
    {
      catalogue: CATALOGUE,
      systemPolicy: 'byRecipe',
      defaultModifierIds: ['med'],
      recipeModifier: { modifierIds: ['alch'] },
      maxModifierPicks: 2,
    }
  );
});

test('buildCraftingModifierContext keeps the cap key present but undefined when unbounded', () => {
  const context = buildCraftingModifierContext({ craftingCheck: {} }, null);
  assert.equal(Object.hasOwn(context, 'maxModifierPicks'), true, 'the shape is fixed');
  assert.equal(context.maxModifierPicks, undefined, 'absence is preserved, not defaulted');
  assert.equal(context.recipeModifier, null, 'a recipe with no pick reads as null');
  assert.equal(
    resolveMaxModifierPicks(context),
    Infinity,
    'and the resolver — not the builder — owns what that absence means'
  );
});

test('buildCraftingModifierContext tolerates a null system and a null recipe', () => {
  assert.deepEqual(buildCraftingModifierContext(null, null), {
    catalogue: undefined,
    systemPolicy: undefined,
    defaultModifierIds: undefined,
    recipeModifier: null,
    maxModifierPicks: undefined,
  });
});

// ── scalar reduction truth table ─────────────────────────────────────────────

test('resolveCraftingModifierScalar addAll sums the eligible expression values', () => {
  const scalar = resolveCraftingModifierScalar(
    { catalogue: CATALOGUE, systemPolicy: 'addAll', defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(scalar, 9);
});

test('resolveCraftingModifierScalar highest returns the max scalar (not a dice pool)', () => {
  const scalar = resolveCraftingModifierScalar(
    { catalogue: CATALOGUE, systemPolicy: 'highest', defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(scalar, 4);
});

// THE BACK-COMPAT GUARANTEE, at the resolver. `playerPicks` sums the BEST LEGAL
// selection: at a cap of 1 that is exactly `max(...)` — the historical single-pick
// behaviour every pre-1055 world had — and unbounded it is the plain sum, because
// picking everything is then legal and optimal.
test('resolveCraftingModifierScalar playerPicks at cap 1 is byte-identical to highest', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'playerPicks',
    defaultModifierIds: ['med', 'alch', 'herb'],
    maxModifierPicks: 1,
  };
  const values = { '@med': 3, '@alch': 2, '@herb': 4 };
  const asPlayerPicks = resolveCraftingModifierScalar(context, evaluatorFor(values));
  const asHighest = resolveCraftingModifierScalar(
    { ...context, systemPolicy: 'highest' },
    evaluatorFor(values)
  );
  assert.equal(asPlayerPicks, 4, 'capped at one pick, the best legal selection is max(3,2,4)');
  assert.equal(asPlayerPicks, asHighest, 'the 1.20.0-migrated world rolls what it always rolled');
});

test('resolveCraftingModifierScalar playerPicks sums the best N as the cap widens', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'playerPicks',
    defaultModifierIds: ['med', 'alch', 'herb'],
  };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  assert.equal(
    resolveCraftingModifierScalar({ ...context, maxModifierPicks: 2 }, evaluate),
    7,
    'the two HIGHEST values (herb 4 + med 3), not the first two in eligible order'
  );
  assert.equal(
    resolveCraftingModifierScalar({ ...context, maxModifierPicks: 3 }, evaluate),
    9,
    'a cap at the option count is the plain sum'
  );
  assert.equal(
    resolveCraftingModifierScalar({ ...context, maxModifierPicks: 99 }, evaluate),
    9,
    'a cap ABOVE the option count adds nothing'
  );
  // …and unbounded is the same sum, because every value is then legal to pick. This is
  // the state the `1.20.0` migration exists to keep an upgraded world OUT of.
  assert.equal(resolveCraftingModifierScalar(context, evaluate), 9, 'unbounded playerPicks sums');
});

test('resolveCraftingModifierScalar playerPicks picks the best N even when they are negative', () => {
  // Guards the descending sort's seed: taking the FIRST two rather than the two highest
  // would reduce to -8 here.
  assert.equal(
    resolveCraftingModifierScalar(
      {
        catalogue: CATALOGUE,
        systemPolicy: 'playerPicks',
        defaultModifierIds: ['med', 'alch', 'herb'],
        maxModifierPicks: 2,
      },
      evaluatorFor({ '@med': -3, '@alch': -1, '@herb': -5 })
    ),
    -4,
    'max two of (-3,-1,-5) is -1 + -3'
  );
});

// `byRecipe` needs no special case in the reduction: `resolveEligibleModifierIds` has
// already narrowed the list to the recipe's selection and truncated it to the cap, so
// SUMMING that list is the whole rule.
test('resolveCraftingModifierScalar byRecipe sums the recipe pick, truncated to the cap', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'byRecipe',
    defaultModifierIds: ['med', 'alch', 'herb'],
    recipeModifier: { modifierIds: ['alch', 'herb'] },
  };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  assert.equal(
    resolveCraftingModifierScalar(context, evaluate),
    6,
    'only the recipe set (alch 2 + herb 4) is summed — the system default med is excluded'
  );
  assert.equal(
    resolveCraftingModifierScalar({ ...context, maxModifierPicks: 1 }, evaluate),
    2,
    'the cap keeps the FIRST pick in authored order (alch 2), never the best one'
  );
});

test('resolveCraftingModifierScalar byRecipe with nothing picked sums the system default set', () => {
  assert.equal(
    resolveCraftingModifierScalar(
      {
        catalogue: CATALOGUE,
        systemPolicy: 'byRecipe',
        defaultModifierIds: ['med', 'alch'],
        recipeModifier: null,
      },
      evaluatorFor({ '@med': 3, '@alch': 2 })
    ),
    5
  );
});

test('resolveCraftingModifierScalar: an authored empty set resolves @craftingmod to 0', () => {
  assert.equal(
    resolveCraftingModifierScalar(
      {
        catalogue: CATALOGUE,
        systemPolicy: 'byRecipe',
        defaultModifierIds: ['med', 'alch', 'herb'],
        recipeModifier: { modifierIds: [] },
      },
      evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
    ),
    0
  );
});

// The cap is meaningless to the two rules that select nothing, and must not silently
// truncate what they reduce.
test('resolveCraftingModifierScalar: maxModifierPicks does not bound addAll or highest', () => {
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  for (const [systemPolicy, expected] of [
    ['addAll', 9],
    ['highest', 4],
  ]) {
    assert.equal(
      resolveCraftingModifierScalar(
        {
          catalogue: CATALOGUE,
          systemPolicy,
          defaultModifierIds: ['med', 'alch', 'herb'],
          maxModifierPicks: 1,
        },
        evaluate
      ),
      expected,
      `${systemPolicy} reduces its whole default set whatever the cap says`
    );
  }
});

test('resolveCraftingModifierScalar: a missing/failed expression contributes 0, never NaN', () => {
  const scalar = resolveCraftingModifierScalar(
    { catalogue: CATALOGUE, systemPolicy: 'addAll', defaultModifierIds: ['med', 'alch'] },
    (expression) => (expression === '@med' ? 3 : NaN)
  );
  assert.equal(scalar, 3, 'NaN from @alch coerces to 0');
});

test('resolveCraftingModifierScalar: an empty eligible set is 0', () => {
  assert.equal(
    resolveCraftingModifierScalar(
      { catalogue: CATALOGUE, systemPolicy: 'highest', defaultModifierIds: [] },
      evaluatorFor({})
    ),
    0
  );
});

// ── interactive playerPicks descriptor ───────────────────────────────────────

const ICON_CATALOGUE = [
  { id: 'med', label: 'Medicine', icon: 'fa-med', expression: '@med' },
  { id: 'alch', label: 'Alchemy', icon: 'fa-alch', expression: '@alch' },
  { id: 'herb', label: 'Herbalism', icon: 'fa-herb', expression: '@herb' },
];

test('buildCraftingModifierChoice maps eligible modifiers + pre-selects the best legal set', () => {
  const choice = buildCraftingModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'], maxModifierPicks: 1 },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(
    Object.hasOwn(choice, 'token'),
    false,
    'the descriptor carries no token field: there is no placeholder left to name (issue 1094)'
  );
  assert.deepEqual(choice.modifiers, [
    { id: 'med', label: 'Medicine', icon: 'fa-med', value: 3 },
    { id: 'alch', label: 'Alchemy', icon: 'fa-alch', value: 2 },
    { id: 'herb', label: 'Herbalism', icon: 'fa-herb', value: 4 },
  ]);
  assert.equal(choice.maxPicks, 1, 'the cap the prompt must enforce');
  assert.deepEqual(choice.defaultSelectedIds, ['herb'], 'herb (4) is the highest');
  assert.equal(choice.defaultSelectedId, 'herb', 'the singular field is the first of them');
});

// The cap rides the descriptor, and `defaultSelectedIds` is the best LEGAL selection —
// the highest-valued `maxPicks` modifiers — so the pre-selection agrees exactly with the
// deterministic scalar a non-interactive craft would have rolled.
test('buildCraftingModifierChoice carries maxPicks and pre-selects the highest N in eligible order', () => {
  const context = {
    catalogue: ICON_CATALOGUE,
    defaultModifierIds: ['med', 'alch', 'herb'],
  };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  const two = buildCraftingModifierChoice({ ...context, maxModifierPicks: 2 }, evaluate);
  assert.equal(two.maxPicks, 2);
  assert.deepEqual(
    two.defaultSelectedIds,
    ['med', 'herb'],
    'the two highest (med 3, herb 4) reported back in ELIGIBLE-SET order, not value order'
  );
  assert.equal(two.defaultSelectedId, 'med', 'the singular field stays the first of them');
});

// An unbounded system offers the whole set, so `maxPicks` is CLAMPED to the option count
// rather than reported as `Infinity` — the prompt renders a control, and "up to Infinity"
// is not a control.
test('buildCraftingModifierChoice clamps an unbounded cap to the option count', () => {
  const choice = buildCraftingModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(choice.maxPicks, 3, 'unlimited over three options is three');
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['med', 'alch', 'herb'],
    'everything is legal to pick, so everything is pre-selected'
  );
  // …and a cap ABOVE the option count clamps the same way.
  assert.equal(
    buildCraftingModifierChoice(
      {
        catalogue: ICON_CATALOGUE,
        defaultModifierIds: ['med', 'alch', 'herb'],
        maxModifierPicks: 9,
      },
      evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
    ).maxPicks,
    3
  );
});

test('buildCraftingModifierChoice tie-breaks equal-max by eligible-set order (first wins)', () => {
  const choice = buildCraftingModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'], maxModifierPicks: 1 },
    evaluatorFor({ '@med': 4, '@alch': 2, '@herb': 4 })
  );
  assert.deepEqual(choice.defaultSelectedIds, ['med'], 'med precedes herb in the eligible set');
});

// The two axes do not cross: under `playerPicks` it is the PLAYER who selects, so a set
// a recipe author stored (under some earlier rule, or in anticipation of `byRecipe`)
// neither narrows nor reorders the options the prompt offers.
test('buildCraftingModifierChoice ignores a stored recipe set under playerPicks', () => {
  const choice = buildCraftingModifierChoice(
    {
      catalogue: ICON_CATALOGUE,
      systemPolicy: 'playerPicks',
      defaultModifierIds: ['med', 'alch', 'herb'],
      recipeModifier: { modifierIds: ['herb'] },
      maxModifierPicks: 1,
    },
    evaluatorFor({ '@med': 4, '@alch': 2, '@herb': 4 })
  );
  assert.deepEqual(
    choice.modifiers.map((modifier) => modifier.id),
    ['med', 'alch', 'herb'],
    'the system default set, in the system default order, is what is offered'
  );
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['med'],
    'med precedes herb among the equal-max, so the eligible-set order tie-break stands'
  );
});

// …and under `byRecipe` the recipe's own order IS the eligible-set order, which is what
// the cap truncates against. A cap of 1 leaves one option, and one option is not a
// choice, so no descriptor is built at all.
test('buildCraftingModifierChoice sees the byRecipe pick order, capped', () => {
  const context = {
    catalogue: ICON_CATALOGUE,
    systemPolicy: 'byRecipe',
    defaultModifierIds: ['med', 'alch', 'herb'],
    recipeModifier: { modifierIds: ['herb', 'med'] },
  };
  const evaluate = evaluatorFor({ '@med': 4, '@alch': 2, '@herb': 4 });
  assert.deepEqual(
    buildCraftingModifierChoice(context, evaluate).modifiers.map((modifier) => modifier.id),
    ['herb', 'med'],
    'recipe pick order preserved'
  );
  assert.equal(
    buildCraftingModifierChoice({ ...context, maxModifierPicks: 1 }, evaluate),
    null,
    'a cap of 1 truncates the pick to one option, and one option is not a choice'
  );
});

test('buildCraftingModifierChoice coerces a missing/failed value to 0', () => {
  const choice = buildCraftingModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch'], maxModifierPicks: 1 },
    (expression) => (expression === '@med' ? NaN : 5)
  );
  assert.equal(choice.modifiers[0].value, 0, 'NaN → 0');
  assert.deepEqual(choice.defaultSelectedIds, ['alch'], 'alch (5) beats the coerced-0 med');
});

test('buildCraftingModifierChoice pre-selects the least-negative when all values are negative', () => {
  // Guards the descending sort: a comparator seeded at 0 would silently pre-select the
  // first option instead of the true (negative) max.
  const choice = buildCraftingModifierChoice(
    { catalogue: CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'], maxModifierPicks: 1 },
    evaluatorFor({ '@med': -3, '@alch': -1, '@herb': -5 })
  );
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['alch'],
    'max(-3,-1,-5) = -1 → alch, not the first option'
  );
  assert.deepEqual(
    choice.modifiers.map((modifier) => modifier.value),
    [-3, -1, -5]
  );
});

test('buildCraftingModifierChoice returns null when no modifier is eligible', () => {
  assert.equal(
    buildCraftingModifierChoice(
      { catalogue: ICON_CATALOGUE, defaultModifierIds: [] },
      evaluatorFor({})
    ),
    null
  );
});

// The two-option rule (#856): one eligible modifier renders a radio the player cannot
// change, so it is suppressed and the deterministic `highest` scalar — which, over a
// single value, is arithmetically IDENTICAL to picking it — resolves the token instead.
test('buildCraftingModifierChoice returns null for a SINGLE eligible modifier (no choice-less radio)', () => {
  const context = { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med'] };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  assert.equal(buildCraftingModifierChoice(context, evaluate), null, 'one option is not a choice');
  // …and the value the deterministic fallback substitutes is the very same modifier.
  assert.equal(
    resolveCraftingModifierScalar({ ...context, systemPolicy: 'playerPicks' }, evaluate),
    3,
    'suppressing the single-option prompt changes no arithmetic'
  );
});

test('buildCraftingModifierChoice builds a descriptor at exactly TWO eligible modifiers', () => {
  const choice = buildCraftingModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch'] },
    evaluatorFor({ '@med': 3, '@alch': 2 })
  );
  assert.ok(choice, 'two eligible modifiers is a real choice');
  assert.deepEqual(
    choice.modifiers.map((modifier) => modifier.id),
    ['med', 'alch']
  );
});

test('buildCraftingModifierChoice defaults absent label/icon to empty strings', () => {
  const choice = buildCraftingModifierChoice(
    {
      catalogue: [
        { id: 'bare', expression: '@bare' },
        { id: 'named', label: 'Named', icon: 'fa-named', expression: '@named' },
      ],
      defaultModifierIds: ['bare', 'named'],
    },
    evaluatorFor({ '@bare': 1, '@named': 0 })
  );
  assert.deepEqual(choice.modifiers[0], { id: 'bare', label: '', icon: '', value: 1 });
});

// ── the retired substitution surface ─────────────────────────────────────────

// Deleted, not weakened. `substituteCraftingModifier` and `CRAFTING_MOD_TOKEN` were the
// whole placeholder mechanism; issue 1094 retires it and the scalar APPENDS instead, so
// their absence from the module surface IS the behaviour under test. Asserted rather than
// merely un-imported, because an accidental re-export would otherwise pass unnoticed and
// hand a future caller a second, substituting path to the same arithmetic.
test('the placeholder substitution surface is GONE from the resolver (issue 1094)', async () => {
  const module = await import(RESOLVER_MODULE);
  assert.equal(module.substituteCraftingModifier, undefined);
  assert.equal(module.CRAFTING_MOD_TOKEN, undefined);
});

// ── arithmetic evaluator ─────────────────────────────────────────────────────

test('evaluateNumericExpression handles arithmetic, precedence, and math functions', () => {
  assert.equal(evaluateNumericExpression('3'), 3);
  assert.equal(evaluateNumericExpression('2 + 3'), 5);
  assert.equal(evaluateNumericExpression('2 + 3 * 4'), 14);
  assert.equal(evaluateNumericExpression('(2 + 3) * 4'), 20);
  assert.equal(evaluateNumericExpression('-5 + 2'), -3);
  assert.equal(evaluateNumericExpression('floor(7 / 2)'), 3);
  assert.equal(evaluateNumericExpression('max(1, 4, 2)'), 4);
  assert.ok(Number.isNaN(evaluateNumericExpression('')), 'blank → NaN (caller coerces to 0)');
  assert.ok(
    Number.isNaN(evaluateNumericExpression('5 / 0')),
    'divide-by-zero is NaN (never Infinity); the roll-data evaluator coerces it to 0'
  );
});

// ── roll-data evaluator (stubbed Roll) ───────────────────────────────────────

function stubReplaceRoll() {
  const Roll = class {};
  Roll.replaceFormulaData = (formula, data, { missing } = {}) =>
    String(formula).replace(/@([\w.]+)/g, (_m, path) => {
      const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
      return value === undefined || value === null ? (missing ?? `@${path}`) : String(value);
    });
  return Roll;
}

test('makeRollDataExpressionEvaluator resolves @-paths then reduces to a number', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ abilities: { med: { mod: 3 } }, prof: 2 }) };
  const evaluate = makeRollDataExpressionEvaluator(actor, Roll);
  assert.equal(evaluate('@abilities.med.mod'), 3);
  assert.equal(evaluate('@abilities.med.mod + @prof'), 5);
  assert.equal(
    evaluate('@abilities.ghost.mod'),
    0,
    'a missing key resolves to 0 (missing sentinel)'
  );
  assert.equal(evaluate(''), 0);
});

// ── applyCraftingModifier (the seam checkRoll uses) ──────────────────────────

test('applyCraftingModifier APPENDS the resolved scalar before Foundry sees it', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ med: 3, alch: 2, herb: 4 }) };
  const context = {
    catalogue: [
      { id: 'med', expression: '@med' },
      { id: 'alch', expression: '@alch' },
      { id: 'herb', expression: '@herb' },
    ],
    systemPolicy: 'highest',
    defaultModifierIds: ['med', 'alch', 'herb'],
  };
  assert.equal(
    applyCraftingModifier('1d20', actor, context, Roll),
    '1d20 + 4[Modifiers]',
    'highest of 3/2/4, appended as one flavoured term'
  );
});

// The append is unconditional: there is no token to look for, so the only thing that can
// leave a formula unchanged is a scalar of zero.
test('applyCraftingModifier appends a NEGATIVE scalar with the sign split, not a parenthesis', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ pen: -3 }) };
  const context = {
    catalogue: [{ id: 'pen', expression: '@pen' }],
    systemPolicy: 'addAll',
    defaultModifierIds: ['pen'],
  };
  // `Constant` is unsigned in the dice grammar, so `+ -3[Modifiers]` would not parse.
  assert.equal(applyCraftingModifier('1d20', actor, context, Roll), '1d20 - 3[Modifiers]');
});

test('applyCraftingModifier appends NOTHING when the eligible set resolves to 0', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({}) };
  assert.equal(
    applyCraftingModifier('1d20 + @prof', actor, { catalogue: [] }, Roll),
    '1d20 + @prof',
    'an empty catalogue contributes nothing and the authored formula survives verbatim'
  );
});

test('applyCraftingModifier appends nothing with no context at all (salvage/gathering)', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({}) };
  assert.equal(applyCraftingModifier('1d20 + 4', actor, null, Roll), '1d20 + 4');
});

// A7, at THIS layer: a scalar that survives the roll-data evaluator as a plain decimal is
// appended verbatim, however extreme, because the dice grammar's `Constant` accepts it.
//
// The exponent-notation REFUSAL is asserted where the formatter lives
// (`tests/tool-check-bonus.test.js`), not here, and that split is deliberate rather than a
// gap: `makeRollDataExpressionEvaluator` cannot produce an exponent value at all. Foundry
// stringifies `1e-7` into the formula as the literal `1e-7`, and
// `evaluateNumericExpression`'s `parseNumber` consumes only `[0-9.]`, so it stops at the
// `e` and returns 1. The exposure is through an INJECTED evaluator and, from issue 1095,
// through summing N clamped values — both of which reach `appendCheckModifierTerm`
// directly.
test('applyCraftingModifier appends an extreme but plain-decimal scalar verbatim', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ big: 1000000000000000 }) };
  const context = {
    catalogue: [{ id: 'big', expression: '@big' }],
    systemPolicy: 'addAll',
    defaultModifierIds: ['big'],
  };
  assert.equal(
    applyCraftingModifier('1d20', actor, context, Roll),
    '1d20 + 1000000000000000[Modifiers]'
  );
});

test('applyCraftingModifier appends a FRACTIONAL scalar, which the grammar does accept', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ half: 2.5 }) };
  const context = {
    catalogue: [{ id: 'half', expression: '@half' }],
    systemPolicy: 'addAll',
    defaultModifierIds: ['half'],
  };
  assert.equal(applyCraftingModifier('1d20', actor, context, Roll), '1d20 + 2.5[Modifiers]');
});

// ── which check a resolution mode ACTUALLY rolls (issue 1055) ────────────────
//
// The five-mode table this selector owns is a hand-maintained mirror of the engine's own
// slot choices, and three surfaces (the Checks card, the recipe Overview tab, the admin
// store) read it to decide whether the check-modifier catalogue reaches a roll. Drift here
// is silent: a mode routed to the wrong slot reports a formula the engine never rolls.

const MODE_TABLE = [
  { mode: 'simple', slot: 'simple', requiresCheck: false },
  { mode: 'routedByIngredients', slot: 'simple', requiresCheck: false },
  { mode: 'routedByCheck', slot: 'routed', requiresCheck: true },
  { mode: 'progressive', slot: 'progressive', requiresCheck: true },
];

const CHECK_SLOTS = {
  simple: { rollFormula: '1d20 + 2' },
  routed: { rollFormula: '2d6 + 1' },
  progressive: { rollFormula: '1d100' },
};

test('resolveActiveCraftingCheckFormula routes each non-alchemy mode to its own slot', () => {
  for (const { mode, slot, requiresCheck } of MODE_TABLE) {
    const active = resolveActiveCraftingCheckFormula({
      resolutionMode: mode,
      craftingCheck: CHECK_SLOTS,
    });
    assert.equal(active.slot, slot, `${mode} rolls the ${slot} check`);
    assert.equal(active.rollFormula, CHECK_SLOTS[slot].rollFormula, `${mode} formula`);
    assert.equal(active.config, CHECK_SLOTS[slot]);
    assert.equal(active.checkUsable, true);
    assert.equal(active.requiresCheck, requiresCheck, `${mode} requiresCheck`);
    assert.equal(active.alchemyCheckMode, null, 'never mistaken for an authored alchemy none');
  }
  // routedByIngredients SHARES the simple slot; it does not have a routed one of its own.
  assert.equal(
    resolveActiveCraftingCheckFormula({
      resolutionMode: 'routedByIngredients',
      craftingCheck: { routed: CHECK_SLOTS.routed },
    }).rollFormula,
    '',
    'the routed slot is not read for routedByIngredients'
  );
});

test('resolveActiveCraftingCheckFormula selects the alchemy slot from alchemy.checkMode', () => {
  for (const [checkMode, slot] of [
    ['none', null],
    ['simple', 'simple'],
    ['tiered', 'routed'],
  ]) {
    const active = resolveActiveCraftingCheckFormula({
      resolutionMode: 'alchemy',
      alchemy: { checkMode },
      craftingCheck: CHECK_SLOTS,
    });
    assert.equal(active.slot, slot, `alchemy/${checkMode} → ${slot}`);
    assert.equal(active.alchemyCheckMode, checkMode);
    assert.equal(active.requiresCheck, slot !== null, `alchemy/${checkMode} requiresCheck`);
    assert.equal(active.checkUsable, slot !== null);
  }
  // An absent alchemy block is `none`, not a coerced simple.
  assert.equal(
    resolveActiveCraftingCheckFormula({ resolutionMode: 'alchemy', craftingCheck: CHECK_SLOTS })
      .slot,
    null
  );
});

test('resolveActiveCraftingCheckFormula distinguishes the two inert causes', () => {
  // 1. No check at all.
  const noCheck = resolveActiveCraftingCheckFormula({
    resolutionMode: 'alchemy',
    alchemy: { checkMode: 'none' },
    craftingCheck: CHECK_SLOTS,
  });
  assert.equal(noCheck.slot, null);

  // 2. A slot exists but carries no authored formula — whitespace is not a formula.
  const noFormula = resolveActiveCraftingCheckFormula({
    resolutionMode: 'simple',
    craftingCheck: { simple: { rollFormula: '   ' } },
  });
  assert.equal(noFormula.slot, 'simple');
  assert.equal(noFormula.rollFormula, '', 'the formula is TRIMMED');
  assert.equal(noFormula.checkUsable, false);

  // There is no third cause. A formula that never spent the retired placeholder is now an
  // ordinary live check — the scalar appends to it — so this reports LIVE, and the
  // `noPlaceholder` value the two notice surfaces rendered has nowhere left to come from.
  const live = resolveActiveCraftingCheckFormula({
    resolutionMode: 'simple',
    craftingCheck: { simple: { rollFormula: '1d20 + 4' } },
  });
  assert.equal(live.checkUsable, true);
  assert.equal(
    Object.hasOwn(live, 'referencesModifier'),
    false,
    'the retired fact is not merely false, it is gone from the shape (issue 1094)'
  );
});

// THE SHIM RUNS BEFORE THE EMPTINESS TEST, asserted with a real `Roll.validate` double.
// A formula whose only content was the retired placeholder must NOT report usable, reach
// `evaluateCheckRoll` and throw inside `new Roll('')` as a rolled — consuming — failure.
//
// This assertion FAILS against the pre-change reader, which read the raw stored field and
// reported `checkUsable: true` for exactly this input.
test('resolveActiveCraftingCheckFormula reports noFormula for a placeholder-only formula', () => {
  const previous = globalThis.Roll;
  globalThis.Roll = class {
    static validate(formula) {
      const text = String(formula);
      return text.trim() !== '' && !/@/.test(text) && !/[*/+-]\s*$/.test(text);
    }
  };
  try {
    const active = resolveActiveCraftingCheckFormula({
      resolutionMode: 'simple',
      craftingCheck: { simple: { rollFormula: '@craftingmod' } },
    });
    assert.equal(active.slot, 'simple', 'the mode still rolls the simple slot');
    assert.equal(active.rollFormula, '');
    assert.equal(active.checkUsable, false, 'reported as noFormula, never as a usable check');

    // A non-additive placement is covered by the same residue check.
    const multiplicative = resolveActiveCraftingCheckFormula({
      resolutionMode: 'simple',
      craftingCheck: { simple: { rollFormula: '1d20 * @craftingmod' } },
    });
    assert.equal(multiplicative.checkUsable, false);

    // …and a token in an ADDITIVE position leaves a real formula standing.
    const additive = resolveActiveCraftingCheckFormula({
      resolutionMode: 'simple',
      craftingCheck: { simple: { rollFormula: '1d20 + @craftingmod' } },
    });
    assert.equal(additive.rollFormula, '1d20');
    assert.equal(additive.checkUsable, true);
  } finally {
    globalThis.Roll = previous;
  }
});

test('resolveActiveCraftingCheckFormula reports no check for an unrecognized mode', () => {
  // Deliberately NOT coerced to `simple`: surfacing "no check" is the answer that cannot
  // mislead a caller into validating a check the engine will not roll.
  const active = resolveActiveCraftingCheckFormula({
    resolutionMode: 'notAMode',
    craftingCheck: CHECK_SLOTS,
  });
  assert.equal(active.slot, null);
  assert.equal(active.config, null);
  assert.equal(active.checkUsable, false);
});

test('resolveActiveCraftingCheckFormula defaults an absent mode to simple and tolerates no system', () => {
  assert.equal(
    resolveActiveCraftingCheckFormula({ craftingCheck: CHECK_SLOTS }).slot,
    'simple',
    'an absent resolutionMode is the simple default'
  );
  const empty = resolveActiveCraftingCheckFormula(null);
  assert.equal(empty.mode, 'simple');
  assert.equal(empty.config, null);
  assert.equal(empty.rollFormula, '');
});
