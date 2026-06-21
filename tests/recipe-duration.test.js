/**
 * Recipe-level duration (`timeRequirement`) for the implicit (single) step.
 *
 * Covers:
 *   - normalization (clamp negatives, drop all-zero, round-trip via toJSON);
 *   - getExecutionSteps' implicit step inherits the recipe-level timeRequirement,
 *     while explicit multi-step recipes keep their own per-step time;
 *   - validation accepts well-formed unit values and rejects negative /
 *     non-finite values, mirroring the per-step time validation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let stubIdSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${(stubIdSeq++).toString(36).padStart(6, '0')}`,
    getProperty: (obj, path) =>
      String(path)
        .split('.')
        .reduce((v, k) => (v == null ? undefined : v[k]), obj),
  },
};
globalThis.game = { user: { isGM: true, name: 'GM' }, fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { Recipe } = await import('../src/models/Recipe.js');

// ---------------------------------------------------------------------------
// Normalization + serialization
// ---------------------------------------------------------------------------

test('recipe-level timeRequirement normalizes and clamps negatives', () => {
  const recipe = new Recipe({ timeRequirement: { minutes: 30, hours: 2, days: -5 } });
  assert.deepEqual(recipe.timeRequirement, {
    minutes: 30,
    hours: 2,
    days: 0,
    months: 0,
    years: 0,
  });
});

test('recipe-level all-zero timeRequirement normalizes to null', () => {
  const recipe = new Recipe({ timeRequirement: { minutes: 0, hours: 0, days: 0 } });
  assert.equal(recipe.timeRequirement, null);
});

test('recipe with no timeRequirement is null', () => {
  assert.equal(new Recipe({}).timeRequirement, null);
});

test('recipe-level timeRequirement round-trips through toJSON / fromJSON', () => {
  const recipe = new Recipe({ timeRequirement: { hours: 1, minutes: 15 } });
  const json = recipe.toJSON();
  assert.deepEqual(json.timeRequirement, {
    minutes: 15,
    hours: 1,
    days: 0,
    months: 0,
    years: 0,
  });
  const rehydrated = Recipe.fromJSON(json);
  assert.deepEqual(rehydrated.timeRequirement, recipe.timeRequirement);
});

// ---------------------------------------------------------------------------
// getExecutionSteps
// ---------------------------------------------------------------------------

test('getExecutionSteps implicit step inherits the recipe-level timeRequirement', () => {
  const recipe = new Recipe({
    timeRequirement: { hours: 2, minutes: 30 },
    ingredientSets: [{ id: 's', ingredientGroups: [] }],
    resultGroups: [{ id: 'g', name: 'G', results: [] }],
  });
  const [implicit] = recipe.getExecutionSteps();
  assert.equal(implicit.id, 'implicit-step');
  assert.deepEqual(implicit.timeRequirement, {
    minutes: 30,
    hours: 2,
    days: 0,
    months: 0,
    years: 0,
  });
});

test('getExecutionSteps implicit step timeRequirement is null when none is set', () => {
  const recipe = new Recipe({
    ingredientSets: [{ id: 's', ingredientGroups: [] }],
    resultGroups: [{ id: 'g', name: 'G', results: [] }],
  });
  assert.equal(recipe.getExecutionSteps()[0].timeRequirement, null);
});

test('multi-step recipes keep their own per-step timeRequirement', () => {
  const recipe = new Recipe({
    timeRequirement: { hours: 9 },
    steps: [
      {
        name: 'Forge',
        ingredientSets: [{ id: 's', ingredientGroups: [] }],
        resultGroups: [{ id: 'g', name: 'G', results: [] }],
        timeRequirement: { minutes: 45 },
      },
    ],
  });
  const steps = recipe.getExecutionSteps();
  assert.equal(steps.length, 1);
  // Explicit step time wins; the recipe-level value feeds only the implicit step.
  assert.deepEqual(steps[0].timeRequirement, {
    minutes: 45,
    hours: 0,
    days: 0,
    months: 0,
    years: 0,
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('validate accepts a well-formed recipe-level timeRequirement', () => {
  const recipe = new Recipe({
    timeRequirement: { days: 3 },
    ingredientSets: [
      {
        id: 's',
        ingredientGroups: [{ id: 'grp', options: [{ itemUuid: 'Item.abc', quantity: 1 }] }],
      },
    ],
    resultGroups: [
      { id: 'g', name: 'G', results: [{ id: 'r', itemUuid: 'Item.def', quantity: 1 }] },
    ],
  });
  const result = recipe.validate();
  assert.equal(
    result.errors.some((e) => /time requirement/.test(e)),
    false,
    `no time-requirement errors: ${result.errors.join('; ')}`
  );
});

test('validate rejects a negative recipe-level time value', () => {
  // Construct then bypass normalization to assert the validator (not just the
  // normalizer) guards against negatives.
  const recipe = new Recipe({});
  recipe.timeRequirement = { minutes: -1, hours: 0, days: 0, months: 0, years: 0 };
  const result = recipe.validateStructure();
  assert.ok(
    result.errors.some((e) => /invalid time requirement value for "minutes"/.test(e)),
    `expected a negative-minutes error: ${result.errors.join('; ')}`
  );
});

test('validate rejects a non-finite recipe-level time value', () => {
  const recipe = new Recipe({});
  // `NaN || 0` coalesces to 0, so the validator catches non-finite values that
  // are truthy (e.g. Infinity) rather than NaN — mirroring the step-time guard.
  recipe.timeRequirement = {
    minutes: 0,
    hours: Number.POSITIVE_INFINITY,
    days: 0,
    months: 0,
    years: 0,
  };
  const result = recipe.validateStructure();
  assert.ok(
    result.errors.some((e) => /invalid time requirement value for "hours"/.test(e)),
    `expected a non-finite-hours error: ${result.errors.join('; ')}`
  );
});
