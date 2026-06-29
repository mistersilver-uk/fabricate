import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateRecipeForModeChange,
  classifyModeChange,
  chooseSeedProvider,
} from '../src/migration/migrateRecipeForModeChange.js';

const MODES = ['simple', 'routed', 'progressive', 'alchemy'];

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
    resultSelection: { provider: 'ingredientSet' },
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
    resultSelection: { provider: 'check' },
    ...overrides,
  };
}

const SYSTEM_NO_CHECK = { id: 'sys-1', resolutionMode: 'routed' };
// A system whose check is usable for BOTH provider-routed targets: the routed
// target keys on `routed.rollFormula`, the alchemy target keys on
// `simple.rollFormula` (alchemy's check provider routes by the SIMPLE outcome).
const SYSTEM_WITH_CHECK = {
  id: 'sys-1',
  resolutionMode: 'routed',
  features: { craftingChecks: true },
  craftingCheck: {
    enabled: true,
    routed: { rollFormula: '1d20' },
    simple: { rollFormula: '1d20' },
  },
};

// --- Matrix cells -----------------------------------------------------------

test('simple → routed seeds a provider (no delete)', () => {
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'routed', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

test('simple → routed seeds check when the system has a usable check', () => {
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'routed', SYSTEM_WITH_CHECK);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

test('simple → progressive clears the routed selection', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' } }),
    'simple',
    'progressive',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
});

test('simple → alchemy seeds a provider', () => {
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

test('routed → simple clears when 1×1', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'ingredientSet' } }),
    'routed',
    'simple',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
});

test('routed → progressive clears when 1×1', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' } }),
    'routed',
    'progressive',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
});

test('routed → alchemy carries a single-step recipe verbatim', () => {
  const recipe = oneByOne({ resultSelection: { provider: 'check' } });
  const result = migrateRecipeForModeChange(recipe, 'routed', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'carry');
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

test('progressive → simple clears the routed selection', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' } }),
    'progressive',
    'simple',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
});

test('progressive → routed seeds a provider', () => {
  const result = migrateRecipeForModeChange(oneByOne(), 'progressive', 'routed', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

test('progressive → alchemy seeds a provider', () => {
  const result = migrateRecipeForModeChange(oneByOne(), 'progressive', 'alchemy', SYSTEM_WITH_CHECK);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

test('alchemy → simple clears when 1×1', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' } }),
    'alchemy',
    'simple',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
});

test('alchemy → routed carries the recipe verbatim', () => {
  const recipe = oneByOne({ resultSelection: { provider: 'ingredientSet' } });
  const result = migrateRecipeForModeChange(recipe, 'alchemy', 'routed', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'carry');
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

test('alchemy → progressive clears when 1×1', () => {
  const result = migrateRecipeForModeChange(
    oneByOne({ resultSelection: { provider: 'check' } }),
    'alchemy',
    'progressive',
    SYSTEM_NO_CHECK
  );
  assert.equal(result.outcome, 'cleared');
  assert.equal(result.recipe.resultSelection, null);
});

// --- Delete-only structural cases -------------------------------------------

test('routed → simple deletes a multi-set/multi-group recipe', () => {
  const result = migrateRecipeForModeChange(multiGroup(), 'routed', 'simple', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'delete');
  assert.equal(result.recipe, null);
  assert.ok(result.reasons.length > 0);
});

test('routed → progressive deletes a multi-set/multi-group recipe', () => {
  const result = migrateRecipeForModeChange(multiGroup(), 'routed', 'progressive', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'delete');
  assert.equal(result.recipe, null);
});

test('alchemy → simple deletes a multi-set/multi-group recipe', () => {
  const result = migrateRecipeForModeChange(multiGroup(), 'alchemy', 'simple', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'delete');
  assert.equal(result.recipe, null);
});

test('routed → alchemy deletes a multi-step recipe', () => {
  const result = migrateRecipeForModeChange(multiStep(), 'routed', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'delete');
  assert.equal(result.recipe, null);
});

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

// --- Idempotency ------------------------------------------------------------

test('re-running a carry migration is a no-op', () => {
  const recipe = oneByOne({ resultSelection: { provider: 'check' } });
  const first = migrateRecipeForModeChange(recipe, 'routed', 'alchemy', SYSTEM_NO_CHECK);
  // Re-running with from===to is a lossless no-op (the canonical idempotent re-run).
  const second = migrateRecipeForModeChange(first.recipe, 'alchemy', 'alchemy', SYSTEM_NO_CHECK);
  assert.equal(second.outcome, 'lossless');
  assert.deepEqual(second.recipe, first.recipe);
});

test('re-running a lossless (unchanged) migration is a no-op', () => {
  const recipe = oneByOne();
  const result = migrateRecipeForModeChange(recipe, 'simple', 'simple', SYSTEM_NO_CHECK);
  assert.equal(result.outcome, 'lossless');
  assert.deepEqual(result.recipe, recipe);
});

test('seeding does not clobber an existing valid provider', () => {
  const recipe = oneByOne({ resultSelection: { provider: 'check' } });
  const result = migrateRecipeForModeChange(recipe, 'progressive', 'routed', SYSTEM_NO_CHECK);
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

// --- Seed provider keys on the target mode's roll formula, not enabled -------

// A check is usable IFF the TARGET mode's roll formula is authored. The legacy
// `enabled` / `features.craftingChecks` toggles must not seed `check` when the
// keyed formula is empty (that would manufacture an avoidable system-level gap).

test('routed target: enabled:true but empty routed.rollFormula seeds ingredientSet', () => {
  const system = {
    id: 'sys-1',
    resolutionMode: 'routed',
    features: { craftingChecks: true },
    craftingCheck: { enabled: true, routed: { rollFormula: '' } },
  };
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'routed', system);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

test('routed target: an authored routed.rollFormula seeds check', () => {
  const system = {
    id: 'sys-1',
    resolutionMode: 'routed',
    craftingCheck: { routed: { rollFormula: '1d20' } },
  };
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'routed', system);
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

test('alchemy target: enabled:true but empty simple.rollFormula seeds ingredientSet', () => {
  const system = {
    id: 'sys-1',
    resolutionMode: 'alchemy',
    features: { craftingChecks: true },
    craftingCheck: { enabled: true, simple: { rollFormula: '' } },
  };
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'alchemy', system);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

test('alchemy target: an authored simple.rollFormula seeds check', () => {
  const system = {
    id: 'sys-1',
    resolutionMode: 'alchemy',
    craftingCheck: { simple: { rollFormula: '1d20' } },
  };
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'alchemy', system);
  assert.equal(result.recipe.resultSelection.provider, 'check');
});

test('alchemy target keys on simple, not routed: a routed-only formula seeds ingredientSet', () => {
  // alchemy's check provider routes by the SIMPLE check outcome, so a system with
  // only a routed formula is NOT usable for an alchemy target.
  const system = {
    id: 'sys-1',
    resolutionMode: 'alchemy',
    craftingCheck: { routed: { rollFormula: '1d20' }, simple: { rollFormula: '' } },
  };
  const result = migrateRecipeForModeChange(oneByOne(), 'simple', 'alchemy', system);
  assert.equal(result.recipe.resultSelection.provider, 'ingredientSet');
});

// --- classifyModeChange does not mutate -------------------------------------

test('classifyModeChange reports the outcome without mutating the input', () => {
  const recipe = oneByOne();
  const snapshot = JSON.stringify(recipe);
  const result = classifyModeChange(recipe, 'simple', 'routed', SYSTEM_NO_CHECK);
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

// --- chooseSeedProvider (exported for the recipe editor's Complex-mode seed) --

// The recipe editor seeds a routing provider when a recipe is switched to Complex
// in a provider-routed system, reusing this exact contract so the editor default
// and the migration never drift.

test('chooseSeedProvider: routed mode with a usable routed formula returns check', () => {
  assert.equal(chooseSeedProvider(SYSTEM_WITH_CHECK, 'routed'), 'check');
});

test('chooseSeedProvider: routed mode without a usable formula returns ingredientSet', () => {
  assert.equal(chooseSeedProvider(SYSTEM_NO_CHECK, 'routed'), 'ingredientSet');
});

test('chooseSeedProvider: alchemy mode keys on the simple formula', () => {
  assert.equal(chooseSeedProvider(SYSTEM_WITH_CHECK, 'alchemy'), 'check');
  assert.equal(
    chooseSeedProvider({ craftingCheck: { routed: { rollFormula: '1d20' } } }, 'alchemy'),
    'ingredientSet'
  );
});
