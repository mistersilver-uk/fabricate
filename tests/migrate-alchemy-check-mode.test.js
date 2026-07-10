import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateAlchemyCheckMode } from '../src/migration/migrateAlchemyCheckMode.js';

// --- Fixtures ---------------------------------------------------------------

function alchemySystem(id, overrides = {}) {
  return { id, name: id, resolutionMode: 'alchemy', ...overrides };
}

function recipe(id, systemId, overrides = {}) {
  return {
    id,
    name: id,
    craftingSystemId: systemId,
    ingredientSets: [{ id: 's-1' }],
    resultGroups: [{ id: 'g-1', name: 'Default' }],
    ...overrides,
  };
}

// A `check`-provider recipe whose result groups carry >1 non-empty checkOutcomeIds
// (the tiered shape).
function tieredShapeRecipe(id, systemId) {
  return recipe(id, systemId, {
    resultSelection: { provider: 'check' },
    resultGroups: [
      { id: 'g-1', name: 'Fine', checkOutcomeIds: ['t1'] },
      { id: 'g-2', name: 'Superb', checkOutcomeIds: ['t2'] },
    ],
  });
}

// --- checkMode reduction ----------------------------------------------------

test('seeds checkMode=none when no alchemy recipe uses the check provider', () => {
  const data = {
    systems: [alchemySystem('sys-1')],
    recipes: [recipe('r1', 'sys-1', { resultSelection: { provider: 'ingredientSet' } })],
  };
  const { systems } = migrateAlchemyCheckMode(data);
  assert.equal(systems[0].alchemy.checkMode, 'none');
});

test('seeds checkMode=simple when a check provider exists without the tiered shape', () => {
  const data = {
    systems: [alchemySystem('sys-1')],
    recipes: [recipe('r1', 'sys-1', { resultSelection: { provider: 'check' } })],
  };
  const { systems } = migrateAlchemyCheckMode(data);
  assert.equal(systems[0].alchemy.checkMode, 'simple');
});

test('seeds checkMode=tiered when a check-provider recipe carries the tiered shape (>1 routed group)', () => {
  const data = {
    systems: [alchemySystem('sys-1')],
    recipes: [tieredShapeRecipe('r1', 'sys-1')],
  };
  const { systems } = migrateAlchemyCheckMode(data);
  assert.equal(systems[0].alchemy.checkMode, 'tiered');
});

test('reduces per system independently (mixed providers across systems)', () => {
  const data = {
    systems: [alchemySystem('sys-none'), alchemySystem('sys-simple'), alchemySystem('sys-tiered')],
    recipes: [
      recipe('r-none', 'sys-none', { resultSelection: { provider: 'ingredientSet' } }),
      recipe('r-simple', 'sys-simple', { resultSelection: { provider: 'check' } }),
      tieredShapeRecipe('r-tiered', 'sys-tiered'),
    ],
  };
  const { systems } = migrateAlchemyCheckMode(data);
  const byId = Object.fromEntries(systems.map((s) => [s.id, s.alchemy.checkMode]));
  assert.deepEqual(byId, { 'sys-none': 'none', 'sys-simple': 'simple', 'sys-tiered': 'tiered' });
});

// --- resultSelection strip + multi-set collapse -----------------------------

test('strips resultSelection from every alchemy recipe', () => {
  const data = {
    systems: [alchemySystem('sys-1')],
    recipes: [
      recipe('r1', 'sys-1', { resultSelection: { provider: 'check' } }),
      recipe('r2', 'sys-1', { resultSelection: { provider: 'ingredientSet' } }),
    ],
  };
  const { recipes } = migrateAlchemyCheckMode(data);
  assert.ok(!('resultSelection' in recipes[0]));
  assert.ok(!('resultSelection' in recipes[1]));
});

test('collapses a multi-ingredient-set alchemy recipe to its first set (and warns once)', () => {
  const original = console.warn;
  let warnings = 0;
  console.warn = () => {
    warnings += 1;
  };
  try {
    const data = {
      systems: [alchemySystem('sys-1')],
      recipes: [
        recipe('r1', 'sys-1', { ingredientSets: [{ id: 's-1' }, { id: 's-2' }] }),
        recipe('r2', 'sys-1', { ingredientSets: [{ id: 's-a' }, { id: 's-b' }, { id: 's-c' }] }),
      ],
    };
    const { recipes } = migrateAlchemyCheckMode(data);
    assert.equal(recipes[0].ingredientSets.length, 1);
    assert.equal(recipes[0].ingredientSets[0].id, 's-1');
    assert.equal(recipes[1].ingredientSets.length, 1);
    assert.equal(warnings, 1, 'a single console.warn summarizes the collapse');
  } finally {
    console.warn = original;
  }
});

test('does not collapse a multi-STEP alchemy recipe (left for the delete path)', () => {
  const data = {
    systems: [alchemySystem('sys-1')],
    recipes: [
      recipe('r1', 'sys-1', {
        steps: [{ id: 'st-1', ingredientSets: [{ id: 's-1' }] }],
        ingredientSets: [{ id: 's-1' }, { id: 's-2' }],
      }),
    ],
  };
  const { recipes } = migrateAlchemyCheckMode(data);
  assert.equal(recipes[0].ingredientSets.length, 2, 'a stepped recipe is not collapsed here');
});

// --- non-alchemy + idempotency ----------------------------------------------

test('leaves non-alchemy systems and their recipes untouched', () => {
  const data = {
    systems: [{ id: 'sys-simple', resolutionMode: 'simple' }],
    recipes: [recipe('r1', 'sys-simple', { resultSelection: { provider: 'check' } })],
  };
  const { systems, recipes } = migrateAlchemyCheckMode(data);
  assert.equal(systems[0].alchemy, undefined);
  assert.deepEqual(recipes[0].resultSelection, { provider: 'check' });
});

test('is idempotent (re-run makes no change, no duplicate warn, stable checkMode)', () => {
  const original = console.warn;
  let warnings = 0;
  console.warn = () => {
    warnings += 1;
  };
  try {
    const data = {
      systems: [alchemySystem('sys-1')],
      recipes: [
        recipe('r1', 'sys-1', {
          resultSelection: { provider: 'check' },
          ingredientSets: [{ id: 's-1' }, { id: 's-2' }],
        }),
      ],
    };
    const first = migrateAlchemyCheckMode(data);
    const firstJson = JSON.stringify(first);
    const second = migrateAlchemyCheckMode(first);
    assert.equal(JSON.stringify(second), firstJson, 'a second run is a no-op');
    assert.equal(second.systems[0].alchemy.checkMode, 'simple', 'checkMode is stable');
    assert.equal(warnings, 1, 'no duplicate warn on the idempotent re-run');
  } finally {
    console.warn = original;
  }
});

test('does not overwrite an already-set valid checkMode', () => {
  const data = {
    systems: [alchemySystem('sys-1', { alchemy: { checkMode: 'tiered' } })],
    // A recipe reduction that WOULD compute `none` must not clobber the existing tiered.
    recipes: [recipe('r1', 'sys-1', { resultSelection: { provider: 'ingredientSet' } })],
  };
  const { systems } = migrateAlchemyCheckMode(data);
  assert.equal(systems[0].alchemy.checkMode, 'tiered');
});

test('accepts the legacy cauldron resolutionMode alias', () => {
  const data = {
    systems: [{ id: 'sys-1', resolutionMode: 'cauldron' }],
    recipes: [recipe('r1', 'sys-1', { resultSelection: { provider: 'check' } })],
  };
  const { systems, recipes } = migrateAlchemyCheckMode(data);
  assert.equal(systems[0].alchemy.checkMode, 'simple');
  assert.ok(!('resultSelection' in recipes[0]));
});
