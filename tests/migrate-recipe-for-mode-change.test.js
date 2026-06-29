import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateRecipeForModeChange,
  classifyModeChange,
  chooseSeedProvider,
} from '../src/migration/migrateRecipeForModeChange.js';

const MODES = ['simple', 'routedByIngredients', 'routedByCheck', 'progressive', 'alchemy'];
const ROUTED_MODES = ['routedByIngredients', 'routedByCheck'];

// Shared fixtures (Sonar): a 1×1 recipe (single ingredient set + result group), a
// multi-set/multi-group recipe, and a multi-step recipe. Each factory returns a
// fresh JSON object so cases never share mutable state.
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
// alchemy's check provider routes by the SIMPLE check outcome, so a usable alchemy
// seed needs `simple.rollFormula` authored.
const SYSTEM_WITH_CHECK = {
  id: 'sys-1',
  features: { craftingChecks: true },
  craftingCheck: {
    enabled: true,
    routed: { rollFormula: '1d20' },
    simple: { rollFormula: '1d20' },
  },
};

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

// --- Into alchemy: seeds the provider (pinned from a routed source) ----------

test('routedByIngredients → alchemy seeds provider=ingredientSet', () => {
  const result = migrateRecipeForModeChange(
    oneByOne(),
    'routedByIngredients',
    'alchemy',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

test('routedByCheck → alchemy seeds provider=check', () => {
  const result = migrateRecipeForModeChange(oneByOne(), 'routedByCheck', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

test('simple → alchemy seeds ingredientSet without a usable simple check', () => {
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

test('progressive → alchemy seeds check when the system has a usable simple check', () => {
  const result = migrateRecipeForModeChange(
    oneByOne(),
    'progressive',
    'alchemy',
    SYSTEM_WITH_CHECK
  );
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

// --- Delete-only structural cases (into alchemy) ----------------------------

for (const from of ROUTED_MODES) {
  test(`${from} → alchemy deletes a multi-step recipe`, () => {
    const result = migrateRecipeForModeChange(multiStep(), from, 'alchemy', SYSTEM_NO_CHECK);
    assert.equal(result.outcome, 'delete');
    assert.equal(result.recipe, null);
  });

  test(`${from} → alchemy carries a single-step recipe (seeded)`, () => {
    const result = migrateRecipeForModeChange(oneByOne(), from, 'alchemy', SYSTEM_NO_CHECK);
    assert.notEqual(result.outcome, 'delete');
    assert.ok(result.recipe.resultSelection.provider);
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

test('seeding an alchemy provider does not clobber an existing valid provider', () => {
  const recipe = oneByOne({ resultSelection: { provider: 'check' } });
  const result = migrateRecipeForModeChange(recipe, 'progressive', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

// --- classifyModeChange does not mutate -------------------------------------

test('classifyModeChange reports the outcome without mutating the input', () => {
  const recipe = oneByOne();
  const snapshot = JSON.stringify(recipe);
  const result = classifyModeChange(recipe, 'simple', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'seeded');
  assert.equal(JSON.stringify(recipe), snapshot, 'input must be unchanged');
});

test('every from→to mode pair returns a valid outcome', () => {
  for (const from of MODES) {
    for (const to of MODES) {
      const result = classifyModeChange(oneByOne(), from, to, SYSTEM_NO_CHECK);
      assert.ok(
        ['lossless', 'seeded', 'cleared', 'carry', 'delete'].includes(result.outcome),
        `unexpected outcome for ${from}→${to}: ${result.outcome}`
      );
    }
  }
});

// --- chooseSeedProvider (exported for the recipe editor's alchemy Complex seed) --

test('chooseSeedProvider: alchemy keys on the simple formula', () => {
  assert.equal(chooseSeedProvider(SYSTEM_WITH_CHECK, 'alchemy'), 'check');
  assert.equal(
    chooseSeedProvider({ craftingCheck: { simple: { rollFormula: '' } } }, 'alchemy'),
    'ingredientSet'
  );
});

test('chooseSeedProvider: alchemy with a routed-only formula returns ingredientSet', () => {
  // alchemy's check provider routes by the SIMPLE outcome, so a routed-only formula
  // is NOT usable for an alchemy seed.
  const system = { craftingCheck: { routed: { rollFormula: '1d20' }, simple: { rollFormula: '' } } };
  assert.equal(chooseSeedProvider(system, 'alchemy'), 'ingredientSet');
});
