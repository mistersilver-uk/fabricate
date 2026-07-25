// Unit tests for the pure per-recipe crafting-check modifier resolver (issue 770).
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  CRAFTING_MOD_TOKEN,
  normalizeModifierPolicy,
  resolveModifierPolicy,
  resolveEligibleModifierIds,
  resolveCraftingModifierScalar,
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

test('normalizeModifierPolicy keeps only the three known policies', () => {
  assert.equal(normalizeModifierPolicy('addAll'), 'addAll');
  assert.equal(normalizeModifierPolicy('highest'), 'highest');
  assert.equal(normalizeModifierPolicy('byRecipe'), 'byRecipe');
  assert.equal(normalizeModifierPolicy('playerPicks'), null, 'Phase 2 policy is unknown here');
  assert.equal(normalizeModifierPolicy(undefined), null);
});

test('resolveModifierPolicy: recipe override beats system default beats addAll', () => {
  assert.equal(resolveModifierPolicy({ systemPolicy: 'highest' }), 'highest');
  assert.equal(
    resolveModifierPolicy({ systemPolicy: 'highest', recipeModifier: { policy: 'byRecipe' } }),
    'byRecipe'
  );
  assert.equal(resolveModifierPolicy({}), 'addAll', 'no policy anywhere → addAll');
  assert.equal(
    resolveModifierPolicy({ systemPolicy: 'bogus', recipeModifier: { policy: 'bogus' } }),
    'addAll'
  );
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

test('resolveCraftingModifierScalar byRecipe sums the recipe-supplied set', () => {
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
  assert.equal(evaluate('@abilities.ghost.mod'), 0, 'a missing key resolves to 0 (missing sentinel)');
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
  assert.equal(applyCraftingModifier('1d20 + @prof', actor, { catalogue: [] }, Roll), '1d20 + @prof');
});

test('applyCraftingModifier substitutes 0 when the token appears without a context', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({}) };
  assert.equal(applyCraftingModifier('1d20 + @craftingmod', actor, null, Roll), '1d20 + (0)');
});
