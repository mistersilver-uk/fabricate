import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateBreakToolsOnFail } from '../src/migration/migrateBreakToolsOnFail.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** A pre-1.7.0 data bundle covering every renamed + stripped surface. */
function legacyData() {
  return {
    recipes: [
      {
        id: 'r1',
        craftingSystemId: 'orphan-sys', // system missing → 0.6.0 skipped it, catalysts survived
        catalysts: [{ componentId: 'forge', degradesOnUse: false }],
        steps: [
          {
            id: 'step-1',
            catalysts: [{ componentId: 'step-cat' }],
            ingredientSets: [{ id: 'set-a', catalysts: [{ componentId: 'step-set-cat' }] }],
          },
        ],
        ingredientSets: [{ id: 'set-b', catalysts: [{ componentId: 'recipe-set-cat' }] }],
      },
    ],
    systems: [
      {
        id: 'sys-1',
        craftingCheck: {
          enabled: true,
          consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: true },
        },
        salvageCraftingCheck: {
          enabled: true,
          consumption: { consumeComponentOnFail: false, consumeCatalystsOnFail: true },
        },
        components: [
          { id: 'comp-1', salvage: { enabled: true, catalysts: [{ componentId: 'salvage-cat' }] } },
        ],
      },
    ],
    gatheringConfig: {
      systems: {
        'sys-1': { tasks: [{ id: 't1', catalysts: [{ componentId: 'dead' }] }] },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Pure function: rename consumeCatalystsOnFail → breakToolsOnFail
// ---------------------------------------------------------------------------

test('renames the consumption key on both crafting and salvage checks', () => {
  const { systems } = migrateBreakToolsOnFail(legacyData());
  const system = systems[0];

  assert.equal(system.craftingCheck.consumption.breakToolsOnFail, true);
  assert.equal('consumeCatalystsOnFail' in system.craftingCheck.consumption, false);
  assert.equal(system.craftingCheck.consumption.consumeIngredientsOnFail, true, 'sibling preserved');

  assert.equal(system.salvageCraftingCheck.consumption.breakToolsOnFail, true);
  assert.equal('consumeCatalystsOnFail' in system.salvageCraftingCheck.consumption, false);
  assert.equal(system.salvageCraftingCheck.consumption.consumeComponentOnFail, false, 'sibling preserved');
});

// ---------------------------------------------------------------------------
// Pure function: strip residual dead catalysts arrays
// ---------------------------------------------------------------------------

test('strips residual dead catalysts at every recipe level', () => {
  const { recipes } = migrateBreakToolsOnFail(legacyData());
  const recipe = recipes[0];
  assert.equal('catalysts' in recipe, false, 'recipe-level catalysts stripped');
  assert.equal('catalysts' in recipe.steps[0], false, 'step-level catalysts stripped');
  assert.equal('catalysts' in recipe.steps[0].ingredientSets[0], false, 'step-set catalysts stripped');
  assert.equal('catalysts' in recipe.ingredientSets[0], false, 'recipe-set catalysts stripped');
  // Non-catalyst data is preserved.
  assert.equal(recipe.id, 'r1');
  assert.equal(recipe.steps[0].id, 'step-1');
});

test('strips residual dead salvage catalysts and the dead gathering task.catalysts', () => {
  const { systems, gatheringConfig } = migrateBreakToolsOnFail(legacyData());
  assert.equal('catalysts' in systems[0].components[0].salvage, false, 'salvage catalysts stripped');
  assert.equal(systems[0].components[0].salvage.enabled, true, 'salvage sub-object otherwise preserved');
  assert.equal(
    'catalysts' in gatheringConfig.systems['sys-1'].tasks[0],
    false,
    'dead task.catalysts stripped'
  );
});

// ---------------------------------------------------------------------------
// Idempotency, anomalous payloads, immutability
// ---------------------------------------------------------------------------

test('is idempotent: a second run makes no further change', () => {
  const once = migrateBreakToolsOnFail(legacyData());
  const twice = migrateBreakToolsOnFail(clone(once));
  assert.deepEqual(twice, once);
});

test('does not clobber an already-present breakToolsOnFail; leaves a stale legacy key inert', () => {
  const data = legacyData();
  data.systems[0].craftingCheck.consumption = {
    consumeIngredientsOnFail: true,
    breakToolsOnFail: false, // already migrated
    consumeCatalystsOnFail: true, // stale legacy left beside it
  };
  const { systems } = migrateBreakToolsOnFail(data);
  const consumption = systems[0].craftingCheck.consumption;
  assert.equal(consumption.breakToolsOnFail, false, 'existing new key not clobbered');
  assert.equal(consumption.consumeCatalystsOnFail, true, 'stale legacy key left inert (no drop)');
});

test('handles missing checks / consumption blocks without throwing', () => {
  const data = { systems: [{ id: 's' }, null, { id: 's2', craftingCheck: {} }], recipes: [], gatheringConfig: {} };
  assert.doesNotThrow(() => migrateBreakToolsOnFail(data));
});

test('does not mutate its inputs (deep-clones)', () => {
  const input = legacyData();
  const snapshot = clone(input);
  migrateBreakToolsOnFail(input);
  assert.deepEqual(input, snapshot, 'input bundle left unchanged');
});

// ---------------------------------------------------------------------------
// Through the runner
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(
    Object.entries({
      recipes: [],
      craftingSystems: [],
      gatheringConfig: {},
      gatheringEnvironments: [],
      gatheringParties: [],
      migrationVersion: '0.0.0',
      ...initial,
    })
  );
  const calls = { set: [] };
  const getSetting = (key) => store.get(key) ?? null;
  const setSetting = async (key, value) => {
    calls.set.push({ key, value });
    store.set(key, value);
    return value;
  };
  return { store, calls, getSetting, setSetting };
}

test('runs through MigrationRunner from 1.6.0, renames the key, and lands at the highest version', async () => {
  const settings = makeSettings({
    migrationVersion: '1.6.0', // the 1.7.0 + 1.8.0 migrations are pending
    craftingSystems: [
      {
        id: 'sys-1',
        craftingCheck: { enabled: true, consumption: { consumeCatalystsOnFail: true } },
        salvageCraftingCheck: { enabled: true, consumption: { consumeCatalystsOnFail: false } },
      },
    ],
  });
  const runner = new MigrationRunner({
    getSetting: settings.getSetting,
    setSetting: settings.setSetting,
  });

  await runner.run();

  assert.equal(settings.store.get('migrationVersion'), '1.13.0', 'advances to the new highest version');
  const system = settings.store.get('craftingSystems')[0];
  assert.equal(system.craftingCheck.consumption.breakToolsOnFail, true);
  assert.equal('consumeCatalystsOnFail' in system.craftingCheck.consumption, false);
  assert.equal(system.salvageCraftingCheck.consumption.breakToolsOnFail, false);
  const setKeys = settings.calls.set.map((c) => c.key);
  assert.ok(setKeys.includes('craftingSystems'), 'rename is persisted');
});

test('runner: craftingSystems left untouched (no write) when nothing needs renaming or stripping', async () => {
  const settings = makeSettings({
    migrationVersion: '1.6.0',
    craftingSystems: [
      { id: 'sys-1', visibilityMode: 'knowledge', craftingCheck: { enabled: true, consumption: { breakToolsOnFail: true } } },
    ],
  });
  const runner = new MigrationRunner({
    getSetting: settings.getSetting,
    setSetting: settings.setSetting,
  });

  await runner.run();

  const setKeys = settings.calls.set.map((c) => c.key);
  assert.equal(setKeys.includes('craftingSystems'), false, 'no rewrite when already migrated');
  assert.equal(settings.store.get('migrationVersion'), '1.13.0');
});
