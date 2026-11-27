import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateRecipeForModeChange,
  classifyModeChange,
  summarizeModeChange,
} from '../src/systems/migrateRecipeForModeChange.js';

Object.assign(globalThis, {
  foundry: { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } },
  game: { user: { name: 'GM' } },
});
const { Recipe } = await import('../src/models/Recipe.js');

const MODES = ['simple', 'routedByIngredients', 'routedByCheck', 'progressive', 'alchemy', 'iterative'];
const ROUTED_MODES = ['routedByIngredients', 'routedByCheck'];

// Shared fixtures (Sonar): a 1×1 recipe (single ingredient set + result group), a
// multi-set/multi-group recipe, and a multi-step recipe.
function oneByOne(overrides = {}) {
  return {
    id: 'r-1x1',
    name: '1x1 Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [{ id: 's-1' }],
    resultGroups: [{ id: 'g-1', name: 'Default' }],
    ...overrides,
  };
}

function multiGroup(overrides = {}) {
  return {
    id: 'r-multi',
    name: 'Multi Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [{ id: 's-1' }, { id: 's-2' }],
    resultGroups: [
      { id: 'g-1', name: 'Alpha' },
      { id: 'g-2', name: 'Beta' },
    ],
    ...overrides,
  };
}

function multiStep(overrides = {}) {
  return {
    id: 'r-steps',
    name: 'Stepped Recipe',
    craftingSystemId: 'sys-1',
    steps: [
      { id: 'st-1', ingredientSets: [{ id: 's-1' }], resultGroups: [{ id: 'g-1', name: 'A' }] },
      { id: 'st-2', ingredientSets: [{ id: 's-2' }], resultGroups: [{ id: 'g-2', name: 'B' }] },
    ],
    ...overrides,
  };
}

const SYSTEM_NO_CHECK = { id: 'sys-1' };

// --- Into a routed mode: never seeds a provider ------------------------------

// simple/progressive → RI/RC is `clear` (no resultSelection on the source → carry);
// → RC additionally reconciles (stale routing must be re-authored).
for (const from of ['simple', 'progressive']) {
  for (const to of ROUTED_MODES) {
    test(`${from} → ${to} carries a 1×1 recipe with no provider seeded`, () => {
      const result = migrateRecipeForModeChange(oneByOne(), from, to, SYSTEM_NO_CHECK);
      assert.notEqual(result.outcome, 'delete');
      assert.equal(result.recipe.resultSelection ?? null, null);
      assert.equal(result.reconcile === true, to === 'routedByCheck');
    });
  }
}

test('simple → routedByCheck drops a stale resultSelection and reconciles', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' } }),
    'simple',
    'routedByCheck',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
  assert.equal(result.reconcile, true);
});

// --- RI ↔ RC: carry + reconcile, never delete --------------------------------

test('routedByIngredients → routedByCheck carries and flags reconciliation', () => {
  const result = migrateRecipeForModeChange(
    multiGroup(),
    'routedByIngredients',
    'routedByCheck',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'carry');
  assert.equal(result.reconcile, true);
  assert.deepEqual(result.recipe.resultGroups, multiGroup().resultGroups);
});

test('routedByCheck → routedByIngredients carries and flags reconciliation', () => {
  const result = migrateRecipeForModeChange(
    multiGroup(),
    'routedByCheck',
    'routedByIngredients',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'carry');
  assert.equal(result.reconcile, true);
});

test('RI↔RC never deletes a multi-step recipe (carry)', () => {
  for (const [from, to] of [
    ['routedByIngredients', 'routedByCheck'],
    ['routedByCheck', 'routedByIngredients'],
  ]) {
    const result = migrateRecipeForModeChange(multiStep(), from, to, SYSTEM_NO_CHECK);
    assert.equal(result.outcome, 'carry');
    assert.ok(result.recipe);
  }
});

// --- Into a single-group mode: clear if 1×1, else delete ---------------------

for (const from of [...ROUTED_MODES, 'alchemy']) {
  for (const to of ['simple', 'progressive']) {
    test(`${from} → ${to} carries a 1×1 recipe (no provider to clear)`, () => {
      const result = migrateRecipeForModeChange(oneByOne(), from, to, SYSTEM_NO_CHECK);
      assert.notEqual(result.outcome, 'delete');
      assert.equal(result.recipe.resultSelection ?? null, null);
    });

    test(`${from} → ${to} deletes a multi-set/multi-group recipe`, () => {
      const result = migrateRecipeForModeChange(multiGroup(), from, to, SYSTEM_NO_CHECK);
      assert.equal(result.outcome, 'delete');
      assert.equal(result.recipe, null);
      assert.ok(result.reasons.length > 0);
    });
  }
}

test('alchemy → simple drops the provider when clearing a 1×1 recipe', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' } }),
    'alchemy',
    'simple',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
});

// Into alchemy: NEVER seeds a provider (the provider is retired) ---------- Migrating into alchemy
// clears any stale resultSelection and collapses a multi-ingredient-set recipe to its first set;
// the system-level alchemy.checkMode is seeded separately (defaults to none).

for (const from of ['routedByIngredients', 'routedByCheck', 'simple', 'progressive']) {
  test(`${from} → alchemy seeds NO provider on a 1×1 recipe`, () => {
    const result = migrateRecipeForModeChange(oneByOne(), from, 'alchemy', SYSTEM_NO_CHECK);
    assert.notEqual(result.outcome, 'delete');
    assert.equal(result.recipe.resultSelection ?? null, null, 'no provider is seeded for alchemy');
  });
}

test('routedByCheck → alchemy clears a stale resultSelection (no provider retained)', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' } }),
    'routedByCheck',
    'alchemy',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
});

test('simple → alchemy collapses a multi-ingredient-set recipe to its first set', () => {
  const result = migrateRecipeForModeChange(multiGroup(), 'simple', 'alchemy', SYSTEM_NO_CHECK);
  assert.notEqual(result.outcome, 'delete');
  assert.equal(result.recipe.ingredientSets.length, 1, 'alchemy requires exactly one ingredient set');
  assert.equal(result.recipe.ingredientSets[0].id, 's-1');
});

// --- Delete-only structural cases (into alchemy) ----------------------------

for (const from of ROUTED_MODES) {
  test(`${from} → alchemy deletes a multi-step recipe`, () => {
    const result = migrateRecipeForModeChange(multiStep(), from, 'alchemy', SYSTEM_NO_CHECK);
    assert.equal(result.outcome, 'delete');
    assert.equal(result.recipe, null);
  });

  test(`${from} → alchemy carries a single-step recipe without a provider`, () => {
    const result = migrateRecipeForModeChange(oneByOne(), from, 'alchemy', SYSTEM_NO_CHECK);
    assert.notEqual(result.outcome, 'delete');
    assert.equal(result.recipe.resultSelection ?? null, null);
  });
}

test('simple → alchemy deletes a multi-step recipe', () => {
  const result = migrateRecipeForModeChange(multiStep(), 'simple', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'delete');
  assert.equal(result.recipe, null);
});

// --- System-level gaps never delete -----------------------------------------

test('switching to progressive without a check never deletes a 1×1 recipe', () => {
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'progressive', SYSTEM_NO_CHECK);
  assert.notEqual(result.outcome, 'delete');
  assert.ok(result.recipe);
});

test('switching to routedByCheck without a routed formula never deletes a recipe', () => {
  const result = migrateRecipeForModeChange(multiGroup(), 'simple', 'routedByCheck', SYSTEM_NO_CHECK);
  assert.notEqual(result.outcome, 'delete');
  assert.ok(result.recipe);
});

// --- Idempotency ------------------------------------------------------------

test('re-running a from===to migration is a lossless no-op', () => {
  const recipe = oneByOne();
  const result = migrateRecipeForModeChange(recipe, 'simple', 'simple', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'lossless');
  assert.deepEqual(result.recipe, recipe);
});

test('re-running an RI↔RC carry with no reconcile pending is idempotent in shape', () => {
  const recipe = multiGroup();
  const first = migrateRecipeForModeChange(recipe, 'routedByIngredients', 'routedByCheck', SYSTEM_NO_CHECK);
  const second = migrateRecipeForModeChange(first.recipe, 'routedByCheck', 'routedByCheck', SYSTEM_NO_CHECK);
  assert.equal(second.outcome, 'lossless');
  assert.deepEqual(second.recipe, first.recipe);
});

test('migrating into alchemy clears an existing resultSelection provider (retired)', () => {
  const recipe = oneByOne({ resultSelection: { provider: 'check' } });
  const result = migrateRecipeForModeChange(recipe, 'progressive', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.recipe.resultSelection, null);
});

// --- classifyModeChange does not mutate -------------------------------------

test('classifyModeChange reports the outcome without mutating the input', () => {
  const recipe = oneByOne();
  const snapshot = JSON.stringify(recipe);
  const result = classifyModeChange(recipe, 'simple', 'alchemy', SYSTEM_NO_CHECK);
  // A 1×1 recipe with no resultSelection needs no reshaping into alchemy.
  assert.equal(result.outcome, 'lossless');
  assert.equal(JSON.stringify(recipe), snapshot, 'input must be unchanged');
});

test('every from→to mode pair returns a valid outcome', () => {
  for (const from of MODES) {
    for (const to of MODES) {
      const result = classifyModeChange(oneByOne(), from, to, SYSTEM_NO_CHECK);
      assert.ok(
        ['lossless', 'cleared', 'carry', 'delete'].includes(result.outcome),
        `unexpected outcome for ${from}→${to}: ${result.outcome}`
      );
    }
  }
});

// --- The reserved failure group (issue 2514) ----------------------------------

const SUCCESS = { id: 'g-ok', name: 'Default', results: [] };
const FAILURE = { id: 'g-fail', name: '', role: 'failure', results: [] };
const hasFailure = (recipe) => (recipe?.resultGroups ?? []).some((group) => group.role === 'failure');

for (const from of MODES) {
  for (const to of MODES) {
    if (to === from) continue;
    test(`${from} → ${to} never deletes a 1×1 recipe for its failure group, and drops it only into progressive`, () => {
      const recipe = oneByOne({ resultGroups: [{ ...SUCCESS }, { ...FAILURE }] });
      const result = migrateRecipeForModeChange(recipe, from, to, SYSTEM_NO_CHECK);
      assert.notEqual(result.outcome, 'delete');
      assert.equal(hasFailure(result.recipe), to !== 'progressive');
    });
  }
}

test('the progressive drop goes by role, not position', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultGroups: [{ ...FAILURE }, { ...SUCCESS }] }),
    'simple',
    'progressive',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.deepEqual(
    result.recipe.resultGroups.map((group) => group.id),
    ['g-ok']
  );
});

test('a failure-only recipe migrated into progressive keeps no result group', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultGroups: [{ ...FAILURE }] }),
    'alchemy',
    'progressive',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.deepEqual(result.recipe.resultGroups, []);
  assert.deepEqual(result.reasons, ['dropped the failure result set for progressive mode']);
});

test('into progressive, a resultSelection and a failure group are both cleared and both reported', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' }, resultGroups: [{ ...SUCCESS }, { ...FAILURE }] }),
    'alchemy',
    'progressive',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
  assert.equal(hasFailure(result.recipe), false);
  assert.deepEqual(result.reasons, [
    'cleared resultSelection for progressive mode',
    'dropped the failure result set for progressive mode',
  ]);
});

for (const from of ROUTED_MODES) {
  test(`${from} → simple keeps a recipe with one success group and a failure group`, () => {
    const result = migrateRecipeForModeChange(
      oneByOne({ resultGroups: [{ id: 'g-a', name: 'A' }, { ...FAILURE }] }),
      from,
      'simple',
      SYSTEM_NO_CHECK
    );
    assert.notEqual(result.outcome, 'delete');
    assert.equal(hasFailure(result.recipe), true);
  });

  test(`${from} → simple still deletes two success groups beside a failure group`, () => {
    const result = migrateRecipeForModeChange(
      oneByOne({ resultGroups: [{ id: 'g-a', name: 'A' }, { id: 'g-b', name: 'B' }, { ...FAILURE }] }),
      from,
      'simple',
      SYSTEM_NO_CHECK
    );
    assert.equal(result.outcome, 'delete');
  });
}

// --- summarizeModeChange ------------------------------------------------------

function recipeJSON(data) {
  return new Recipe({ craftingSystemId: 'sys-1', ...data }).toJSON();
}

const EMPTY_SUMMARY = Object.freeze({
  migrated: 0,
  deleted: [],
  droppedIngredientSets: [],
  droppedFailureSets: [],
  inertTierLinks: 0,
  needsSetup: 0,
  inertLibrary: { counters: 0, actions: 0 },
  incompleteAfter: 0,
  multiStepOff: false,
});

test('summarizeModeChange of no recipes is empty, with every field present', () => {
  for (const [from, to] of [
    ['simple', 'alchemy'],
    ['simple', 'iterative'],
    ['iterative', 'simple'],
    ['simple', 'simple'],
  ]) {
    assert.deepEqual(summarizeModeChange([], from, to), EMPTY_SUMMARY, `${from} → ${to}`);
  }
});

test('summarizeModeChange counts, names the deleted, and lists dropped ingredient and failure sets', () => {
  const collapsed = recipeJSON({
    id: 'r-a',
    name: 'Recipe A',
    ingredientSets: [
      { id: 'set-1', name: 'Iron route' },
      { id: 'set-2', name: 'Gold route' },
      { id: 'set-3' },
    ],
    resultGroups: [{ ...SUCCESS }],
  });
  const kept = recipeJSON({ id: 'r-b', name: 'Recipe B', ingredientSets: [{ id: 'set-1' }] });
  assert.equal('name' in collapsed.ingredientSets[2], false, 'an unnamed set has no name key');

  const summary = summarizeModeChange([collapsed, kept], 'simple', 'alchemy');

  assert.equal(summary.migrated, 2);
  assert.deepEqual(summary.deleted, []);
  assert.deepEqual(summary.droppedIngredientSets, [
    {
      recipe: 'Recipe A',
      step: null,
      sets: [
        { name: 'Gold route', index: 1 },
        { name: undefined, index: 2 },
      ],
    },
  ]);
  assert.deepEqual(summary.droppedFailureSets, []);
});

test('summarizeModeChange lists recipes losing their failure set into progressive', () => {
  const withFailure = recipeJSON({
    id: 'r-f',
    name: 'Fizzle Draught',
    ingredientSets: [{ id: 'set-1' }],
    resultGroups: [{ ...SUCCESS }, { ...FAILURE }],
  });
  const plain = recipeJSON({ id: 'r-p', name: 'Plain', ingredientSets: [{ id: 'set-1' }] });

  const summary = summarizeModeChange([withFailure, plain], 'simple', 'progressive');

  assert.equal(summary.migrated, 2);
  assert.deepEqual(summary.droppedFailureSets, ['Fizzle Draught']);
  assert.deepEqual(summarizeModeChange([withFailure], 'simple', 'alchemy').droppedFailureSets, []);
});

test('a deleted recipe adds nothing to the dropped-set lists', () => {
  const doomed = recipeJSON({
    id: 'r-x',
    name: 'Doomed',
    ingredientSets: [{ id: 'set-1', name: 'One' }, { id: 'set-2', name: 'Two' }],
    resultGroups: [{ ...SUCCESS }, { ...FAILURE }],
  });

  const summary = summarizeModeChange([doomed], 'routedByIngredients', 'progressive');

  assert.equal(summary.migrated, 0);
  assert.deepEqual(summary.deleted, ['Doomed']);
  assert.deepEqual(summary.droppedIngredientSets, []);
  assert.deepEqual(summary.droppedFailureSets, []);
});

test('summarizeModeChange reads toJSON(), falls back to the id, and never mutates its input', () => {
  const plainObject = { id: 'r-anon', ingredientSets: [{ id: 's-1' }, { id: 's-2' }], resultGroups: [] };
  const model = new Recipe({ id: 'r-m', name: 'Model', ingredientSets: [{ id: 's-1' }], resultGroups: [{ ...SUCCESS }, { ...FAILURE }] });
  const snapshot = JSON.stringify(plainObject);
  const modelSnapshot = JSON.stringify(model.toJSON());

  const summary = summarizeModeChange([plainObject, model], 'simple', 'alchemy');

  assert.deepEqual(summary.droppedIngredientSets, [
    { recipe: 'r-anon', step: null, sets: [{ name: undefined, index: 1 }] },
  ]);
  assert.equal(JSON.stringify(plainObject), snapshot);
  assert.equal(JSON.stringify(model.toJSON()), modelSnapshot);
  assert.deepEqual(summarizeModeChange([model], 'simple', 'progressive').droppedFailureSets, ['Model']);
  assert.equal(JSON.stringify(model.toJSON()), modelSnapshot);
});

// --- The 6×6 matrix (`resolution-modes` § Mode Invariant) -----------------------------------

const LINE = { end: 'failure', rules: [] };
const HEAT = [{ source: 'counter', counterId: 'heat', op: '>=', value: 3 }];

/** The eight matrix fixtures, in the order every cell lists its outcomes. */
const MATRIX_FIXTURES = {
  oneByOne: () => ({
    id: 'm-1x1',
    ingredientSets: [{ id: 's-1' }],
    resultGroups: [{ id: 'g-1', name: 'Default' }],
  }),
  flatMultiSet: () => ({
    id: 'm-flat',
    ingredientSets: [{ id: 's-1' }, { id: 's-2' }],
    resultGroups: [
      { id: 'g-1', name: 'Alpha' },
      { id: 'g-2', name: 'Beta' },
    ],
  }),
  stepTwoSets: () => ({
    id: 'm-step-sets',
    steps: [
      { id: 'st-1', ingredientSets: [{ id: 's-1' }, { id: 's-2' }], resultGroups: [{ id: 'g-1', name: 'A' }] },
      { id: 'st-2', ingredientSets: [{ id: 's-3' }], resultGroups: [{ id: 'g-2', name: 'B' }] },
    ],
  }),
  stepSelection: () => ({
    id: 'm-step-selection',
    steps: [
      {
        id: 'st-1',
        ingredientSets: [{ id: 's-1' }],
        resultGroups: [{ id: 'g-1', name: 'A' }],
        resultSelection: { provider: 'check' },
      },
    ],
  }),
  flatFailure: () => ({
    id: 'm-flat-failure',
    ingredientSets: [{ id: 's-1' }],
    resultGroups: [
      { id: 'g-ok', name: 'Default' },
      { id: 'g-fail', role: 'failure' },
    ],
  }),
  stepFailure: () => ({
    id: 'm-step-failure',
    steps: [
      {
        id: 'st-1',
        ingredientSets: [{ id: 's-1' }],
        resultGroups: [
          { id: 'g-ok', name: 'A' },
          { id: 'g-fail', role: 'failure', producedWhen: [] },
        ],
      },
      { id: 'st-2', ingredientSets: [{ id: 's-2' }], resultGroups: [{ id: 'g-2', name: 'B' }] },
    ],
  }),
  authoredLines: () => ({
    id: 'm-lines',
    resultGroups: [{ id: 'g-r', role: 'failure', producedWhen: [{ end: 'failure', rules: HEAT }] }],
    steps: [
      {
        id: 'st-1',
        ingredientSets: [{ id: 's-1' }],
        resultGroups: [
          { id: 'g-s', name: 'A', producedWhen: [{ end: 'success', rules: HEAT }] },
          { id: 'g-sf', role: 'failure', producedWhen: [{ end: 'failure', rules: [] }] },
        ],
      },
    ],
  }),
  tierLinks: () => ({
    id: 'm-tiers',
    resultSelection: { provider: 'check' },
    resultGroups: [{ id: 'g-r', name: 'R', checkOutcomeIds: ['t-1'] }],
    steps: [
      {
        id: 'st-1',
        ingredientSets: [{ id: 's-1', resultGroupId: 'g-1' }],
        resultGroups: [{ id: 'g-1', name: 'A', checkOutcomeIds: ['t-1', 't-2'] }],
        outcomeRouting: { success: 'g-1' },
        resultSelection: { provider: 'check' },
      },
      { id: 'st-2', ingredientSets: [{ id: 's-2' }], resultGroups: [{ id: 'g-2', name: 'B' }] },
    ],
  }),
};

/** The reshaped fixtures a cell names after its outcome; every other survivor is verbatim. */
const RESHAPED = {
  flatMultiSet: {
    collapsed: {
      id: 'm-flat',
      ingredientSets: [{ id: 's-1' }],
      resultGroups: [
        { id: 'g-1', name: 'Alpha' },
        { id: 'g-2', name: 'Beta' },
      ],
    },
  },
  stepTwoSets: {
    iterative: {
      id: 'm-step-sets',
      steps: [
        { id: 'st-1', ingredientSets: [{ id: 's-1' }], resultGroups: [{ id: 'g-1', name: 'A' }] },
        { id: 'st-2', ingredientSets: [{ id: 's-3' }], resultGroups: [{ id: 'g-2', name: 'B' }] },
      ],
    },
  },
  stepSelection: {
    iterative: {
      id: 'm-step-selection',
      steps: [
        {
          id: 'st-1',
          ingredientSets: [{ id: 's-1' }],
          resultGroups: [{ id: 'g-1', name: 'A' }],
          resultSelection: null,
        },
      ],
    },
  },
  flatFailure: {
    iterative: {
      id: 'm-flat-failure',
      ingredientSets: [{ id: 's-1' }],
      resultGroups: [
        { id: 'g-ok', name: 'Default' },
        { id: 'g-fail', role: 'failure', producedWhen: [LINE] },
      ],
    },
    progressive: {
      id: 'm-flat-failure',
      ingredientSets: [{ id: 's-1' }],
      resultGroups: [{ id: 'g-ok', name: 'Default' }],
    },
  },
  stepFailure: {
    iterative: {
      id: 'm-step-failure',
      steps: [
        {
          id: 'st-1',
          ingredientSets: [{ id: 's-1' }],
          resultGroups: [
            { id: 'g-ok', name: 'A' },
            { id: 'g-fail', role: 'failure', producedWhen: [LINE] },
          ],
        },
        { id: 'st-2', ingredientSets: [{ id: 's-2' }], resultGroups: [{ id: 'g-2', name: 'B' }] },
      ],
    },
  },
  tierLinks: {
    iterative: {
      id: 'm-tiers',
      resultSelection: null,
      resultGroups: [{ id: 'g-r', name: 'R', checkOutcomeIds: ['t-1'] }],
      steps: [
        {
          id: 'st-1',
          ingredientSets: [{ id: 's-1', resultGroupId: 'g-1' }],
          resultGroups: [{ id: 'g-1', name: 'A', checkOutcomeIds: ['t-1', 't-2'] }],
          outcomeRouting: { success: 'g-1' },
          resultSelection: null,
        },
        { id: 'st-2', ingredientSets: [{ id: 's-2' }], resultGroups: [{ id: 'g-2', name: 'B' }] },
      ],
    },
    unselected: {
      id: 'm-tiers',
      resultSelection: null,
      resultGroups: [{ id: 'g-r', name: 'R', checkOutcomeIds: ['t-1'] }],
      steps: [
        {
          id: 'st-1',
          ingredientSets: [{ id: 's-1', resultGroupId: 'g-1' }],
          resultGroups: [{ id: 'g-1', name: 'A', checkOutcomeIds: ['t-1', 't-2'] }],
          outcomeRouting: { success: 'g-1' },
          resultSelection: { provider: 'check' },
        },
        { id: 'st-2', ingredientSets: [{ id: 's-2' }], resultGroups: [{ id: 'g-2', name: 'B' }] },
      ],
    },
  },
};

// One `outcome` or `outcome:shape` per fixture, in `MATRIX_FIXTURES` order; `reconcile` is the
// flag every outcome of a routed-target cell carries, absent elsewhere.
const SAME = Array.from({ length: 8 }, () => 'lossless');
const INTO_ITERATIVE = ['lossless', 'cleared:collapsed', 'cleared:iterative', 'cleared:iterative', 'cleared:iterative', 'cleared:iterative', 'lossless', 'cleared:iterative'];
const INTO_ALCHEMY = ['lossless', 'cleared:collapsed', 'delete', 'lossless', 'lossless', 'delete', 'lossless', 'delete'];
const INTO_SIMPLE = ['lossless', 'delete', 'delete', 'delete', 'lossless', 'delete', 'delete', 'delete'];
const INTO_PROGRESSIVE = ['lossless', 'delete', 'delete', 'delete', 'cleared:progressive', 'delete', 'delete', 'delete'];
const CLEARED_ROUTED = ['carry', 'carry', 'carry', 'carry', 'carry', 'carry', 'carry', 'cleared:unselected'];
const CARRIED = Array.from({ length: 8 }, () => 'carry');

const MATRIX = {
  simple: {
    simple: SAME,
    routedByIngredients: { reconcile: false, cells: CLEARED_ROUTED },
    routedByCheck: { reconcile: true, cells: CLEARED_ROUTED },
    progressive: INTO_PROGRESSIVE,
    alchemy: INTO_ALCHEMY,
    iterative: INTO_ITERATIVE,
  },
  routedByIngredients: {
    simple: INTO_SIMPLE,
    routedByIngredients: SAME,
    routedByCheck: { reconcile: true, cells: CARRIED },
    progressive: INTO_PROGRESSIVE,
    alchemy: INTO_ALCHEMY,
    iterative: INTO_ITERATIVE,
  },
  routedByCheck: {
    simple: INTO_SIMPLE,
    routedByIngredients: { reconcile: true, cells: CARRIED },
    routedByCheck: SAME,
    progressive: INTO_PROGRESSIVE,
    alchemy: INTO_ALCHEMY,
    iterative: INTO_ITERATIVE,
  },
  progressive: {
    simple: INTO_SIMPLE,
    routedByIngredients: { reconcile: false, cells: CLEARED_ROUTED },
    routedByCheck: { reconcile: true, cells: CLEARED_ROUTED },
    progressive: SAME,
    alchemy: INTO_ALCHEMY,
    iterative: INTO_ITERATIVE,
  },
  alchemy: {
    simple: INTO_SIMPLE,
    routedByIngredients: { reconcile: false, cells: CLEARED_ROUTED },
    routedByCheck: { reconcile: true, cells: CLEARED_ROUTED },
    progressive: INTO_PROGRESSIVE,
    alchemy: SAME,
    iterative: INTO_ITERATIVE,
  },
  iterative: {
    simple: INTO_SIMPLE,
    routedByIngredients: { reconcile: true, cells: CARRIED },
    routedByCheck: { reconcile: true, cells: CARRIED },
    progressive: INTO_PROGRESSIVE,
    alchemy: INTO_ALCHEMY,
    iterative: SAME,
  },
};

/** The `{ outcome, reconcile?, recipe }` a cell entry names for one fixture. */
function expectedCell(code, name, reconcile) {
  const [outcome, shape] = code.split(':');
  let recipe = MATRIX_FIXTURES[name]();
  if (outcome === 'delete') recipe = null;
  else if (shape) recipe = RESHAPED[name][shape];
  return { outcome, ...(reconcile !== undefined && { reconcile }), recipe };
}

test('the matrix names all 36 cells over six modes', () => {
  assert.deepEqual(Object.keys(MATRIX), MODES);
  for (const from of MODES) assert.deepEqual(Object.keys(MATRIX[from]), MODES, from);
});

for (const from of MODES) {
  for (const to of MODES) {
    test(`matrix ${from} → ${to} deep-equals its cell for every fixture`, () => {
      const cell = MATRIX[from][to];
      const codes = Array.isArray(cell) ? cell : cell.cells;
      for (const [index, name] of Object.keys(MATRIX_FIXTURES).entries()) {
        const { outcome, reconcile, recipe } = migrateRecipeForModeChange(
          MATRIX_FIXTURES[name](),
          from,
          to,
          SYSTEM_NO_CHECK
        );
        const actual = { outcome, ...(reconcile !== undefined && { reconcile }), recipe };
        assert.deepEqual(actual, expectedCell(codes[index], name, cell.reconcile), name);
      }
    });
  }
}

test('migrating into iterative is idempotent and deletes nothing from any source', () => {
  const sources = MODES.filter((mode) => mode !== 'iterative');
  const cases = sources.flatMap((from) => Object.values(MATRIX_FIXTURES).map((make) => [from, make]));
  for (const [from, make] of cases) {
    const first = migrateRecipeForModeChange(make(), from, 'iterative', SYSTEM_NO_CHECK);
    assert.notEqual(first.outcome, 'delete');
    const again = migrateRecipeForModeChange(structuredClone(first.recipe), from, 'iterative');
    assert.equal(again.outcome, 'lossless', `${from}: ${first.recipe.id}`);
  }
});

// --- Every summary field across a change into or out of iterative ---------------------------

const { buildIterativeAuthoringFixture } = await import('./helpers/iterativeAuthoringFixture.js');
const { buildRecipeList } = await import('../src/ui/svelte/stores/adminRecipeRowProjection.js');

const set = (id) => ({
  id,
  name: id,
  ingredientGroups: [{ id: `${id}-g`, options: [{ componentId: 'comp-ore', quantity: 1 }] }],
});
const made = (id, extra = {}) => ({
  id,
  name: 'Made',
  results: [{ id: `${id}-ore`, componentId: 'comp-ore', quantity: 1 }],
  ...extra,
});

/** Chain Link: step 1 one set and a success rule but no group, step 2 a group, a stale recipe group. */
const chainLink = () => ({
  id: 'iw-r-chain',
  name: 'Chain Link',
  iterative: { counters: [{ counterId: 'heat', start: 0, visible: true }] },
  resultGroups: [made('chain-stale')],
  steps: [
    { id: 'chain-1', name: 'Forge', ingredientSets: [set('chain-1-set')], resultGroups: [], iterative: { success: HEAT } },
    {
      id: 'chain-2',
      name: 'Join',
      ingredientSets: [set('chain-2-set')],
      resultGroups: [made('chain-made', { producedWhen: [{ end: 'success', rules: [] }] })],
    },
  ],
});
const completeRecipe = () => ({ id: 'r-plain', name: 'Plain', ingredientSets: [set('plain-set')], resultGroups: [made('plain-g')] });
const emptyShell = () => ({ id: 'r-shell', name: 'Shell', ingredientSets: [], resultGroups: [] });
const twoStepShield = () =>
  structuredClone(buildIterativeAuthoringFixture().recipes.find((r) => r.id === 'recipe-forged-shield'));
const iterativeSystem = () => buildIterativeAuthoringFixture().system;

test('summarizeModeChange lists one dropped-set entry per (recipe, step) and counts inert tier links', () => {
  const summary = summarizeModeChange(
    [MATRIX_FIXTURES.flatMultiSet(), MATRIX_FIXTURES.stepTwoSets(), MATRIX_FIXTURES.tierLinks()],
    'routedByCheck',
    'iterative'
  );
  assert.deepEqual(summary.droppedIngredientSets, [
    { recipe: 'm-flat', step: null, sets: [{ name: undefined, index: 1 }] },
    { recipe: 'm-step-sets', step: 0, sets: [{ name: undefined, index: 1 }] },
  ]);
  assert.equal(summary.inertTierLinks, 3, 'one recipe-scope link and two on step 1');
  assert.equal(summary.migrated, 3);
  assert.deepEqual(summary.deleted, []);
  const out = summarizeModeChange([MATRIX_FIXTURES.tierLinks()], 'iterative', 'routedByCheck');
  assert.equal(out.inertTierLinks, 0, 'only a change into iterative counts tier links');
});

test('summarizeModeChange counts needsSetup into iterative only, and not for a two-set step', () => {
  const system = { ...iterativeSystem(), resolutionMode: 'routedByCheck' };
  const blade = buildIterativeAuthoringFixture().recipes.find((r) => r.id === 'recipe-tempered-blade');
  const twoSets = { ...structuredClone(blade), ingredientSets: [set('a'), set('b')] };
  assert.equal(summarizeModeChange([twoSets], 'routedByCheck', 'iterative', system).needsSetup, 0);
  const unready = summarizeModeChange([completeRecipe(), twoSets], 'routedByCheck', 'iterative', system);
  assert.equal(unready.needsSetup, 1, 'a recipe with no counter instances needs setup');
  assert.equal(unready.incompleteAfter, 0, 'the into direction never counts incompleteAfter');
  const out = summarizeModeChange([completeRecipe()], 'iterative', 'routedByCheck', iterativeSystem());
  assert.equal(out.needsSetup, 0, 'the out direction never counts needsSetup');
});

test('summarizeModeChange reports the inert library leaving iterative, and zeros otherwise', () => {
  const system = iterativeSystem();
  assert.deepEqual(summarizeModeChange([], 'iterative', 'simple', system).inertLibrary, {
    counters: 2,
    actions: 2,
  });
  for (const [from, to] of [
    ['simple', 'iterative'],
    ['simple', 'alchemy'],
    ['iterative', 'iterative'],
  ]) {
    assert.deepEqual(summarizeModeChange([], from, to, system).inertLibrary, { counters: 0, actions: 0 });
  }
});

test('summarizeModeChange flags multiStepOff only into alchemy with Multi-step on', () => {
  const on = { features: { multiStepRecipes: true } };
  const off = { features: { multiStepRecipes: false } };
  assert.equal(summarizeModeChange([], 'simple', 'alchemy', on).multiStepOff, true);
  assert.equal(summarizeModeChange([], 'iterative', 'alchemy', on).multiStepOff, true);
  assert.equal(summarizeModeChange([], 'simple', 'alchemy', off).multiStepOff, false);
  assert.equal(summarizeModeChange([], 'simple', 'routedByCheck', on).multiStepOff, false);
  assert.equal(summarizeModeChange([], 'simple', 'iterative', on).multiStepOff, false);
});

const OUT_TARGETS = ['simple', 'routedByIngredients', 'routedByCheck', 'progressive', 'alchemy'];

test('incompleteAfter counts the survivors the target mode leaves incomplete', () => {
  const system = iterativeSystem();
  const count = (recipe, to) => summarizeModeChange([recipe], 'iterative', to, system).incompleteAfter;
  const deleted = (recipe, to) => summarizeModeChange([recipe], 'iterative', to, system).deleted.length;
  const counted = Object.fromEntries(OUT_TARGETS.map((to) => [to, count(chainLink(), to)]));
  assert.deepEqual(counted, {
    simple: 0,
    routedByIngredients: 1,
    routedByCheck: 1,
    progressive: 0,
    alchemy: 0,
  });
  for (const to of ['simple', 'progressive', 'alchemy']) {
    assert.equal(deleted(chainLink(), to), 1, `the multi-step Chain Link is deleted out to ${to}`);
  }
  assert.equal(deleted(twoStepShield(), 'alchemy'), 1);
  assert.equal(count(twoStepShield(), 'alchemy'), 0, 'a recipe the target deletes is not counted');
  for (const to of OUT_TARGETS) {
    assert.equal(count(completeRecipe(), to), 0, `a complete recipe out to ${to}`);
    assert.equal(count(emptyShell(), to), 1, `the empty shell is counted out to ${to}`);
  }
  assert.equal(summarizeModeChange([chainLink()], 'routedByCheck', 'simple', system).incompleteAfter, 0);
});

test("incompleteAfter equals the row projection's incomplete over the same migrated recipes", () => {
  const system = iterativeSystem();
  for (const to of OUT_TARGETS) {
    const recipes = [chainLink(), completeRecipe(), emptyShell(), twoStepShield()];
    const migrated = recipes
      .map((recipe) => migrateRecipeForModeChange(structuredClone(recipe), 'iterative', to).recipe)
      .filter(Boolean)
      .map((json) => Recipe.fromJSON(structuredClone(json)));
    const { recipes: rows } = buildRecipeList(null, {}, { ...system, resolutionMode: to }, '', {
      roster: migrated,
    });
    assert.equal(
      summarizeModeChange(recipes, 'iterative', to, system).incompleteAfter,
      rows.filter((row) => row.incomplete).length,
      to
    );
  }
});
