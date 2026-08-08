// Unit tests for the pure per-recipe crafting-check modifier resolver (issues 770, 1055).
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  CRAFTING_MOD_TOKEN,
  RECIPE_MODIFIER_AUTHORITIES,
  normalizeModifierPolicy,
  resolveRecipeModifierAuthority,
  buildCraftingModifierContext,
  resolveActiveCraftingCheckFormula,
  resolveModifierPolicy,
  resolveEligibleModifierIds,
  resolveCraftingModifierScalar,
  buildCraftingModifierChoice,
  substituteCraftingModifier,
  evaluateNumericExpression,
  makeRollDataExpressionEvaluator,
  applyCraftingModifier,
} = await import('../src/systems/craftingModifierResolver.js');

const CATALOGUE = [
  { id: 'med', label: 'Medicine', expression: '@med' },
  { id: 'alch', label: 'Alchemy', expression: '@alch' },
  { id: 'herb', label: 'Herbalism', expression: '@herb' },
];

// A deterministic expression evaluator keyed by the catalogue's expression string.
function evaluatorFor(values) {
  return (expression) => (expression in values ? values[expression] : 0);
}

// ── policy normalization ─────────────────────────────────────────────────────

// Retargeted for issue 1055: `byRecipe` is no longer one of the OFFERABLE combination
// rules — it named who decides, not how modifiers combine — but it stays READABLE from
// persisted data through `LEGACY_POLICY_ALIASES`, translated at this one choke point.
test('normalizeModifierPolicy offers three rules and translates the retired byRecipe', () => {
  assert.equal(normalizeModifierPolicy('addAll'), 'addAll');
  assert.equal(normalizeModifierPolicy('highest'), 'highest');
  assert.equal(normalizeModifierPolicy('playerPicks'), 'playerPicks', 'Phase 2 policy is known');
  assert.equal(
    normalizeModifierPolicy('byRecipe'),
    'addAll',
    'the retired value reduces to what it arithmetically did: sum the eligible set'
  );
  assert.equal(normalizeModifierPolicy('bogus'), null);
  assert.equal(normalizeModifierPolicy(undefined), null);
});

// ── authority (issue 1055) ───────────────────────────────────────────────────

test('RECIPE_MODIFIER_AUTHORITIES is the frozen authoring order, least to most delegated', () => {
  assert.deepEqual([...RECIPE_MODIFIER_AUTHORITIES], ['none', 'setOnly', 'setAndRule']);
  assert.ok(Object.isFrozen(RECIPE_MODIFIER_AUTHORITIES));
});

// ABSENT is the load-bearing fourth state: an unstamped world, an imported payload and
// an internally hand-built context must all keep honouring the overrides they honoured
// before this axis existed, so absence resolves as the pre-1055 behaviour.
test('resolveRecipeModifierAuthority: absent, null and junk all resolve as setAndRule', () => {
  for (const authority of ['none', 'setOnly', 'setAndRule']) {
    assert.equal(resolveRecipeModifierAuthority({ recipeModifierAuthority: authority }), authority);
  }
  for (const context of [
    {},
    { recipeModifierAuthority: null },
    { recipeModifierAuthority: undefined },
    { recipeModifierAuthority: 'bogus' },
    { recipeModifierAuthority: 'byRecipe' },
    null,
    undefined,
  ]) {
    assert.equal(
      resolveRecipeModifierAuthority(context),
      'setAndRule',
      `${JSON.stringify(context)} → setAndRule (pre-1055 behaviour, never a silent revocation)`
    );
  }
});

test('resolveModifierPolicy: the recipe rule is consulted ONLY at setAndRule', () => {
  assert.equal(resolveModifierPolicy({ systemPolicy: 'highest' }), 'highest');
  assert.equal(resolveModifierPolicy({}), 'addAll', 'no policy anywhere → addAll');
  assert.equal(
    resolveModifierPolicy({ systemPolicy: 'bogus', recipeModifier: { policy: 'bogus' } }),
    'addAll'
  );
  // A persisted `byRecipe` on the recipe translates through the alias, then wins.
  assert.equal(
    resolveModifierPolicy({
      systemPolicy: 'highest',
      recipeModifier: { policy: 'byRecipe' },
      recipeModifierAuthority: 'setAndRule',
    }),
    'addAll',
    'a hand-built context carrying the retired value cannot flip sum→max on a highest system'
  );
  // …and the same override is NOT consulted where the system withheld the rule axis. A
  // stored override left behind by a GM lowering the level stays on disk, unhonoured.
  for (const authority of ['none', 'setOnly']) {
    assert.equal(
      resolveModifierPolicy({
        systemPolicy: 'highest',
        recipeModifier: { policy: 'addAll' },
        recipeModifierAuthority: authority,
      }),
      'highest',
      `at ${authority} the recipe's rule override is ignored`
    );
  }
  assert.equal(
    resolveModifierPolicy({ systemPolicy: 'highest', recipeModifier: { policy: 'addAll' } }),
    'addAll',
    'an UNSTAMPED system still honours it — absence is setAndRule'
  );
});

test('resolveEligibleModifierIds: the recipe SET is honoured at setOnly and setAndRule only', () => {
  const base = {
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'alch', 'herb'],
    recipeModifier: { modifierIds: ['alch'] },
  };
  for (const authority of ['setOnly', 'setAndRule', undefined]) {
    assert.deepEqual(
      resolveEligibleModifierIds({ ...base, recipeModifierAuthority: authority }),
      ['alch'],
      `at ${String(authority)} the recipe subset wins`
    );
  }
  assert.deepEqual(
    resolveEligibleModifierIds({ ...base, recipeModifierAuthority: 'none' }),
    ['med', 'alch', 'herb'],
    'at none the system default set is used and the stored subset is ignored'
  );
});

test('resolveEligibleModifierIds: an AUTHORED empty set resolves to no modifiers', () => {
  const context = {
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'alch'],
    recipeModifier: { modifierIds: [] },
  };
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, recipeModifierAuthority: 'setOnly' }),
    [],
    'an authored empty array is an override, not an absence'
  );
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, recipeModifierAuthority: 'none' }),
    ['med', 'alch'],
    '…and it is suppressed like any other set override when the system withholds the axis'
  );
});

// ── the one shared context bag (issue 1055) ──────────────────────────────────
//
// The engine and the listing builder both build their `@craftingmod` context HERE, so a
// displayed formula can never disagree with the rolled one. The shape is fixed: the
// authority key is always present, and `undefined` is what an unstamped system reads as.

test('buildCraftingModifierContext projects the check config and the recipe override', () => {
  const system = {
    craftingCheck: {
      checkModifiers: CATALOGUE,
      defaultModifierPolicy: 'highest',
      defaultModifierIds: ['med'],
      recipeModifierAuthority: 'setOnly',
    },
  };
  assert.deepEqual(
    buildCraftingModifierContext(system, { craftingModifier: { modifierIds: ['alch'] } }),
    {
      catalogue: CATALOGUE,
      systemPolicy: 'highest',
      defaultModifierIds: ['med'],
      recipeModifier: { modifierIds: ['alch'] },
      recipeModifierAuthority: 'setOnly',
    }
  );
});

test('buildCraftingModifierContext keeps the authority key present but undefined when unstamped', () => {
  const context = buildCraftingModifierContext({ craftingCheck: {} }, null);
  assert.equal(Object.hasOwn(context, 'recipeModifierAuthority'), true, 'the shape is fixed');
  assert.equal(context.recipeModifierAuthority, undefined, 'absence is preserved, not defaulted');
  assert.equal(context.recipeModifier, null, 'a recipe with no override reads as null');
  assert.equal(
    resolveRecipeModifierAuthority(context),
    'setAndRule',
    'and the resolver — not the builder — owns what that absence means'
  );
});

test('buildCraftingModifierContext tolerates a null system and a null recipe', () => {
  assert.deepEqual(buildCraftingModifierContext(null, null), {
    catalogue: undefined,
    systemPolicy: undefined,
    defaultModifierIds: undefined,
    recipeModifier: null,
    recipeModifierAuthority: undefined,
  });
});

// ── eligible id resolution ───────────────────────────────────────────────────

test('resolveEligibleModifierIds uses system defaults, drops unknown + duplicate ids', () => {
  const ids = resolveEligibleModifierIds({
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'ghost', 'alch', 'med'],
  });
  assert.deepEqual(ids, ['med', 'alch'], 'unknown "ghost" and duplicate "med" dropped, order kept');
});

test('resolveEligibleModifierIds: a recipe id subset overrides the system defaults', () => {
  const ids = resolveEligibleModifierIds({
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'alch', 'herb'],
    recipeModifier: { modifierIds: ['alch'] },
  });
  assert.deepEqual(ids, ['alch']);
});

test('resolveEligibleModifierIds: recipe with no modifierIds array falls back to defaults', () => {
  const ids = resolveEligibleModifierIds({
    catalogue: CATALOGUE,
    defaultModifierIds: ['med'],
    recipeModifier: { policy: 'highest' },
  });
  assert.deepEqual(ids, ['med'], 'a policy-only override keeps the default id set');
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

test('resolveCraftingModifierScalar playerPicks resolves as highest (deterministic fallback)', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'playerPicks',
    defaultModifierIds: ['med', 'alch', 'herb'],
  };
  const values = { '@med': 3, '@alch': 2, '@herb': 4 };
  const asPlayerPicks = resolveCraftingModifierScalar(context, evaluatorFor(values));
  const asHighest = resolveCraftingModifierScalar(
    { ...context, systemPolicy: 'highest' },
    evaluatorFor(values)
  );
  assert.equal(asPlayerPicks, 4, 'non-interactive playerPicks == max(3,2,4)');
  assert.equal(asPlayerPicks, asHighest, 'playerPicks scalar is byte-identical to highest');
});

test('resolveCraftingModifierScalar playerPicks==highest through a narrowing recipe override', () => {
  // The eligible set differs from the system default via a recipe modifierIds subset;
  // non-interactive playerPicks must still equal highest ON THAT NARROWED SET.
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'playerPicks',
    defaultModifierIds: ['med', 'alch', 'herb'],
    recipeModifier: { policy: 'playerPicks', modifierIds: ['med', 'alch'] },
  };
  const values = { '@med': 3, '@alch': 2, '@herb': 9 };
  const asPlayerPicks = resolveCraftingModifierScalar(context, evaluatorFor(values));
  const asHighest = resolveCraftingModifierScalar(
    {
      ...context,
      systemPolicy: 'highest',
      recipeModifier: { policy: 'highest', modifierIds: ['med', 'alch'] },
    },
    evaluatorFor(values)
  );
  assert.equal(asPlayerPicks, 3, 'max over the narrowed {med:3, alch:2} set — herb:9 is excluded');
  assert.equal(asPlayerPicks, asHighest, 'equivalence holds on the recipe-narrowed set');
});

// Retargeted (issue 1055): a persisted `byRecipe` still reduces here, now through
// `LEGACY_POLICY_ALIASES` → `addAll` over the recipe's own eligible set, which is
// exactly the arithmetic it always had.
test('resolveCraftingModifierScalar: a persisted byRecipe still sums the recipe-supplied set', () => {
  const scalar = resolveCraftingModifierScalar(
    {
      catalogue: CATALOGUE,
      systemPolicy: 'addAll',
      defaultModifierIds: ['med', 'alch', 'herb'],
      recipeModifier: { policy: 'byRecipe', modifierIds: ['alch', 'herb'] },
    },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(scalar, 6, 'only the recipe set (alch 2 + herb 4) is summed');
  // The system-level retired value translates identically, which is what makes the
  // 1.20.0 system-level rewrite observationally inert (acceptance criterion 5).
  assert.equal(
    resolveCraftingModifierScalar(
      {
        catalogue: CATALOGUE,
        systemPolicy: 'byRecipe',
        defaultModifierIds: ['alch', 'herb'],
      },
      evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
    ),
    6,
    'an un-migrated system-level byRecipe reduces exactly as the migrated addAll does'
  );
});

test('resolveCraftingModifierScalar: an authored empty set resolves @craftingmod to 0', () => {
  assert.equal(
    resolveCraftingModifierScalar(
      {
        catalogue: CATALOGUE,
        systemPolicy: 'addAll',
        defaultModifierIds: ['med', 'alch', 'herb'],
        recipeModifier: { modifierIds: [] },
        recipeModifierAuthority: 'setOnly',
      },
      evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
    ),
    0
  );
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

test('buildCraftingModifierChoice maps eligible modifiers + default-selects the highest', () => {
  const choice = buildCraftingModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(choice.token, CRAFTING_MOD_TOKEN);
  assert.deepEqual(choice.modifiers, [
    { id: 'med', label: 'Medicine', icon: 'fa-med', value: 3 },
    { id: 'alch', label: 'Alchemy', icon: 'fa-alch', value: 2 },
    { id: 'herb', label: 'Herbalism', icon: 'fa-herb', value: 4 },
  ]);
  assert.equal(choice.defaultSelectedId, 'herb', 'herb (4) is the highest');
});

test('buildCraftingModifierChoice tie-breaks equal-max by eligible-set order (first wins)', () => {
  const choice = buildCraftingModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': 4, '@alch': 2, '@herb': 4 })
  );
  assert.equal(choice.defaultSelectedId, 'med', 'med precedes herb in the eligible set');
});

test('buildCraftingModifierChoice honours the recipe eligible-set order for the tie-break', () => {
  const choice = buildCraftingModifierChoice(
    {
      catalogue: ICON_CATALOGUE,
      defaultModifierIds: ['med', 'alch', 'herb'],
      recipeModifier: { policy: 'playerPicks', modifierIds: ['herb', 'med'] },
    },
    evaluatorFor({ '@med': 4, '@alch': 2, '@herb': 4 })
  );
  assert.deepEqual(
    choice.modifiers.map((modifier) => modifier.id),
    ['herb', 'med'],
    'recipe subset order preserved'
  );
  assert.equal(choice.defaultSelectedId, 'herb', 'herb is first in the recipe set among equal-max');
});

test('buildCraftingModifierChoice coerces a missing/failed value to 0', () => {
  const choice = buildCraftingModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch'] },
    (expression) => (expression === '@med' ? NaN : 5)
  );
  assert.equal(choice.modifiers[0].value, 0, 'NaN → 0');
  assert.equal(choice.defaultSelectedId, 'alch', 'alch (5) beats the coerced-0 med');
});

test('buildCraftingModifierChoice default-selects the least-negative when all values are negative', () => {
  // Guards the `bestValue = modifiers[0].value` seed: a refactor to `let bestValue = 0`
  // would silently default to the first option instead of the true (negative) max.
  const choice = buildCraftingModifierChoice(
    { catalogue: CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': -3, '@alch': -1, '@herb': -5 })
  );
  assert.equal(choice.defaultSelectedId, 'alch', 'max(-3,-1,-5) = -1 → alch, not the first option');
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

// ── token substitution ───────────────────────────────────────────────────────

test('substituteCraftingModifier wraps the scalar in parens (negative stays valid)', () => {
  assert.equal(substituteCraftingModifier('1d20 + @craftingmod', 3), '1d20 + (3)');
  assert.equal(substituteCraftingModifier('1d20 + @craftingmod', -2), '1d20 + (-2)');
  assert.equal(substituteCraftingModifier('1d20', 5), '1d20', 'no token → unchanged');
  assert.equal(substituteCraftingModifier('@craftingmod + @craftingmod', 4), '(4) + (4)');
});

test('CRAFTING_MOD_TOKEN is the documented placeholder', () => {
  assert.equal(CRAFTING_MOD_TOKEN, '@craftingmod');
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

test('applyCraftingModifier substitutes the resolved scalar before Foundry sees it', () => {
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
    applyCraftingModifier('1d20 + @craftingmod', actor, context, Roll),
    '1d20 + (4)',
    'highest of 3/2/4'
  );
});

test('applyCraftingModifier leaves a formula without the token unchanged', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({}) };
  assert.equal(
    applyCraftingModifier('1d20 + @prof', actor, { catalogue: [] }, Roll),
    '1d20 + @prof'
  );
});

test('applyCraftingModifier substitutes 0 when the token appears without a context', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({}) };
  assert.equal(applyCraftingModifier('1d20 + @craftingmod', actor, null, Roll), '1d20 + (0)');
});

// ── which check a resolution mode ACTUALLY rolls (issue 1055) ────────────────
//
// The five-mode table this selector owns is a hand-maintained mirror of the engine's own
// slot choices, and three surfaces (the Checks card, the recipe Overview tab, the admin
// store) now read it to decide whether a `@craftingmod` reference is live. Drift here is
// silent: a mode routed to the wrong slot reports a formula the engine never rolls.

const MODE_TABLE = [
  { mode: 'simple', slot: 'simple', requiresCheck: false },
  { mode: 'routedByIngredients', slot: 'simple', requiresCheck: false },
  { mode: 'routedByCheck', slot: 'routed', requiresCheck: true },
  { mode: 'progressive', slot: 'progressive', requiresCheck: true },
];

const CHECK_SLOTS = {
  simple: { rollFormula: '1d20 + @craftingmod' },
  routed: { rollFormula: '2d6 + @craftingmod' },
  progressive: { rollFormula: '1d100 + @craftingmod' },
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
    assert.equal(active.referencesModifier, true);
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
    assert.equal(active.referencesModifier, slot !== null);
  }
  // An absent alchemy block is `none`, not a coerced simple.
  assert.equal(
    resolveActiveCraftingCheckFormula({ resolutionMode: 'alchemy', craftingCheck: CHECK_SLOTS })
      .slot,
    null
  );
});

test('resolveActiveCraftingCheckFormula distinguishes the three inert causes', () => {
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

  // 3. A formula is authored but never spends the placeholder.
  const noPlaceholder = resolveActiveCraftingCheckFormula({
    resolutionMode: 'simple',
    craftingCheck: { simple: { rollFormula: '1d20 + 4' } },
  });
  assert.equal(noPlaceholder.checkUsable, true);
  assert.equal(noPlaceholder.referencesModifier, false);
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
  assert.equal(active.referencesModifier, false);
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
