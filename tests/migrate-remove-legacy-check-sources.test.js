// Tests for the 1.8.0 migration that strips the deprecated check-source fields
// (root macroUuid / successMacroUuid / failureMacroUuid / checkSource / builtIn)
// from craftingCheck / salvageCraftingCheck / gatheringCraftingCheck, while
// preserving simple.macroUuid (the dynamic-DC macro) and every other field. It also
// retires the orphaned recipe resultSelection.macroUuid (a 1.6.0 macroOutcome vestige).
import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateRemoveLegacyCheckSources } = await import(
  '../src/migration/migrateRemoveLegacyCheckSources.js'
);
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');

// ---------------------------------------------------------------------------
// Pure function
// ---------------------------------------------------------------------------

function fullyLoadedSystem() {
  return {
    id: 'sys-1',
    craftingCheck: {
      enabled: true,
      mode: 'passFail',
      macroUuid: 'Macro.check',
      successMacroUuid: 'Macro.success',
      failureMacroUuid: 'Macro.failure',
      checkSource: 'builtIn',
      builtIn: { ability: 'int', skill: 'arc', dc: 18, advantage: 'advantage' },
      consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
      simple: { rollFormula: '1d20', dcMode: 'dynamic', macroUuid: 'Macro.dynamicDc' },
      routed: { rollFormula: '1d20' },
      progressive: { rollFormula: '2d6' },
    },
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: 'Macro.salvage',
      successMacroUuid: 'Macro.salvageSuccess',
      failureMacroUuid: 'Macro.salvageFailure',
      checkSource: 'macro',
      builtIn: { ability: 'str' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
      simple: { rollFormula: '', macroUuid: 'Macro.salvageDynamicDc' },
    },
    gatheringCraftingCheck: {
      enabled: false,
      macroUuid: 'Macro.gather',
      successMacroUuid: 'Macro.gatherSuccess',
      failureMacroUuid: 'Macro.gatherFailure',
      checkSource: 'builtIn',
      builtIn: { ability: 'wis' },
      progressive: { rollFormula: '1d20' },
      routed: { rollFormula: '1d20' },
    },
  };
}

const DEAD_FIELDS = ['macroUuid', 'successMacroUuid', 'failureMacroUuid', 'checkSource', 'builtIn'];

test('strips the deprecated check-source fields from all three checks', () => {
  const { systems } = migrateRemoveLegacyCheckSources({ systems: [fullyLoadedSystem()] });
  const system = systems[0];

  for (const checkKey of ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck']) {
    for (const field of DEAD_FIELDS) {
      assert.equal(
        field in system[checkKey],
        false,
        `${checkKey}.${field} should be removed`
      );
    }
  }
});

test('preserves the dynamic-DC macro on simple.macroUuid and every other field', () => {
  const { systems } = migrateRemoveLegacyCheckSources({ systems: [fullyLoadedSystem()] });
  const system = systems[0];

  assert.equal(system.craftingCheck.simple.macroUuid, 'Macro.dynamicDc');
  assert.equal(system.salvageCraftingCheck.simple.macroUuid, 'Macro.salvageDynamicDc');
  assert.equal(system.craftingCheck.enabled, true);
  assert.equal(system.craftingCheck.mode, 'passFail');
  assert.equal(system.craftingCheck.routed.rollFormula, '1d20');
  assert.equal(system.craftingCheck.progressive.rollFormula, '2d6');
  assert.equal(system.craftingCheck.consumption.consumeIngredientsOnFail, true);
  assert.equal(system.gatheringCraftingCheck.progressive.rollFormula, '1d20');
});

test('does not mutate its input (deep-clones)', () => {
  const input = fullyLoadedSystem();
  migrateRemoveLegacyCheckSources({ systems: [input] });
  assert.equal(input.craftingCheck.macroUuid, 'Macro.check', 'the source object is untouched');
});

test('is idempotent — a second pass is a no-op', () => {
  const once = migrateRemoveLegacyCheckSources({ systems: [fullyLoadedSystem()] });
  const twice = migrateRemoveLegacyCheckSources(once);
  assert.deepEqual(twice.systems, once.systems);
});

test('tolerates missing checks and non-object systems', () => {
  const { systems } = migrateRemoveLegacyCheckSources({
    systems: [{ id: 'bare' }, null, 'not-an-object'],
  });
  assert.equal(systems.length, 3);
  assert.deepEqual(systems[0], { id: 'bare' });
});

test('strips the orphaned resultSelection.macroUuid from recipe-level and steps', () => {
  const { recipes } = migrateRemoveLegacyCheckSources({
    recipes: [
      {
        id: 'r-1',
        resultSelection: { provider: 'check', macroUuid: 'Macro.recipe' },
        steps: [
          { id: 's-1', resultSelection: { provider: 'check', macroUuid: 'Macro.step' } },
          { id: 's-2', resultSelection: { provider: 'ingredientSet' } },
          { id: 's-3' },
        ],
      },
    ],
  });
  const recipe = recipes[0];

  assert.equal('macroUuid' in recipe.resultSelection, false);
  assert.equal(recipe.resultSelection.provider, 'check', 'provider is preserved');
  assert.equal('macroUuid' in recipe.steps[0].resultSelection, false);
  assert.equal(recipe.steps[0].resultSelection.provider, 'check');
  assert.equal(recipe.steps[1].resultSelection.provider, 'ingredientSet');
});

test('does not mutate the input recipes (deep-clones)', () => {
  const input = {
    id: 'r-1',
    resultSelection: { provider: 'check', macroUuid: 'Macro.recipe' },
  };
  migrateRemoveLegacyCheckSources({ recipes: [input] });
  assert.equal(input.resultSelection.macroUuid, 'Macro.recipe', 'the source recipe is untouched');
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

test('runs through MigrationRunner from 1.7.0, strips the fields, and lands at the highest version', async () => {
  const settings = makeSettings({
    migrationVersion: '1.7.0', // the 1.8.0 + 1.9.0 migrations are pending
    craftingSystems: [fullyLoadedSystem()],
    recipes: [{ id: 'r-1', resultSelection: { provider: 'check', macroUuid: 'Macro.x' } }],
  });
  const runner = new MigrationRunner({
    getSetting: settings.getSetting,
    setSetting: settings.setSetting,
  });

  await runner.run();

  assert.equal(settings.store.get('migrationVersion'), '1.9.0', 'advances to the new highest version');
  const system = settings.store.get('craftingSystems')[0];
  assert.equal('macroUuid' in system.craftingCheck, false);
  assert.equal('builtIn' in system.salvageCraftingCheck, false);
  assert.equal('checkSource' in system.gatheringCraftingCheck, false);
  assert.equal(system.craftingCheck.simple.macroUuid, 'Macro.dynamicDc', 'dynamic DC macro kept');
  const setKeys = settings.calls.set.map((c) => c.key);
  assert.ok(setKeys.includes('craftingSystems'), 'the strip is persisted');

  const recipe = settings.store.get('recipes')[0];
  assert.equal('macroUuid' in recipe.resultSelection, false, 'orphaned recipe macroUuid stripped');
  assert.equal(recipe.resultSelection.provider, 'check', 'recipe provider preserved');
  assert.ok(setKeys.includes('recipes'), 'the recipe strip is persisted');
});

test('runner: craftingSystems left untouched (no write) when no deprecated fields are present', async () => {
  const settings = makeSettings({
    migrationVersion: '1.7.0',
    craftingSystems: [
      {
        id: 'sys-1',
        craftingCheck: { enabled: true, simple: { rollFormula: '1d20', macroUuid: 'Macro.dc' } },
      },
    ],
  });
  const runner = new MigrationRunner({
    getSetting: settings.getSetting,
    setSetting: settings.setSetting,
  });

  await runner.run();

  const setKeys = settings.calls.set.map((c) => c.key);
  assert.equal(setKeys.includes('craftingSystems'), false, 'no rewrite when already clean');
  assert.equal(settings.store.get('migrationVersion'), '1.9.0');
});
