/** An iterative system survives export → import → export, and copy mode keeps every iterative id. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { makeHarness, exportCurrent } = await import('./helpers/authoringExportHarness.js');
const { validateImportData, prepareForImport } =
  await import('../src/systems/CraftingSystemExporter.js');
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { RESOLUTION_MODES } = await import('../src/systems/resolutionModeAvailability.js');
const { FIXTURE_SYSTEM_ID, normalizeExportEnvelope } =
  await import('./helpers/fullAuthoringFixture.js');
const { buildIterativeAuthoringFixture, ITERATIVE_MULTI_RECIPE_ID, ITERATIVE_SINGLE_RECIPE_ID } =
  await import('./helpers/iterativeAuthoringFixture.js');
const { emptyCopyOptions } = await import('./helpers/worldEntityIndex.js');

/**
 * Every persisted iterative key of an export or fixture, in authored order and free of record ids,
 * so a copy import that re-keys recipes, groups and components compares equal.
 */
function iterativeKeys({ system, recipes }) {
  const producedWhen = (groups) => (groups ?? []).map((group) => group.producedWhen);
  return {
    system: system.iterative,
    recipes: recipes
      .filter((recipe) => recipe.iterative !== undefined)
      .map((recipe) => ({
        iterative: recipe.iterative,
        producedWhen: producedWhen(recipe.resultGroups),
        steps: (recipe.steps ?? []).map((step) => ({
          iterative: step.iterative,
          producedWhen: producedWhen(step.resultGroups),
        })),
      })),
  };
}

function importerFor(h) {
  return new CompendiumImporter(h.systemManager, h.recipeManager, {
    environmentStore: h.environmentStore,
    getSetting: h.getSetting,
    setSetting: h.setSetting,
    isGM: () => true,
  });
}

describe('keep-mode round trip of an iterative system', () => {
  const fixture = buildIterativeAuthoringFixture();
  const authored = iterativeKeys(structuredClone(fixture));

  it('the premise: the fixture authors both recipes and the whole library', () => {
    assert.equal(authored.recipes.length, 2);
    assert.equal(authored.system.actions.length, 2);
  });

  it('exports, imports with the full mode set, and exports again unchanged', async () => {
    const h = makeHarness(fixture);
    const first = exportCurrent(h, FIXTURE_SYSTEM_ID);
    assert.equal(first.schemaVersion, 6, 'no envelope slice and no schema bump');
    const validation = validateImportData(first);
    assert.equal(validation.valid, true, validation.errors.join('; '));

    await importerFor(h).importFromPackData(prepareForImport(first, 'keep'), {
      overwriteExisting: true,
      selectableModes: RESOLUTION_MODES,
    });
    const second = exportCurrent(h, FIXTURE_SYSTEM_ID);

    assert.deepEqual(normalizeExportEnvelope(second), normalizeExportEnvelope(first));
    assert.deepEqual(iterativeKeys(first), authored, 'the first export carries every authored key');
    assert.deepEqual(
      iterativeKeys(second),
      authored,
      'the second export carries every authored key'
    );

    const persisted = new CraftingSystemManager(
      { getRecipes: () => [] },
      { componentScopeStore: null, essenceScopeStore: null, toolScopeStore: null }
    )._normalizeSystem(second.system);
    const iterativeRecipes = second.recipes.filter((recipe) =>
      [ITERATIVE_SINGLE_RECIPE_ID, ITERATIVE_MULTI_RECIPE_ID].includes(recipe.id)
    );
    const renormalized = {
      system: persisted,
      recipes: iterativeRecipes.map((recipe) => Recipe.fromJSON(structuredClone(recipe)).toJSON()),
    };
    assert.equal(persisted.resolutionMode, 'iterative');
    assert.deepEqual(iterativeKeys(renormalized), authored, 're-normalizing changes nothing');
  });

  it('refuses the same payload under the default selectable set', async () => {
    const h = makeHarness(buildIterativeAuthoringFixture());
    const packData = prepareForImport(exportCurrent(h, FIXTURE_SYSTEM_ID), 'keep');
    await assert.rejects(importerFor(h).importFromPackData(packData, { overwriteExisting: true }), {
      reason: 'resolutionModeUnavailable',
    });
  });
});

describe('copy mode', () => {
  it('preserves every iterative id, including a counter that shares a component id', () => {
    const h = makeHarness(buildIterativeAuthoringFixture());
    const first = exportCurrent(h, FIXTURE_SYSTEM_ID);
    const copy = prepareForImport(first, 'copy', emptyCopyOptions());
    const componentIds = (payload) => payload.system.components.map((component) => component.id);
    assert.ok(componentIds(first).includes('ember'), 'the premise: a component is named ember');
    assert.ok(!componentIds(copy).includes('ember'), 'the premise: copy mode re-keyed it');
    assert.deepEqual(
      copy.system.iterative.counters.map((counter) => counter.id),
      ['heat', 'ember']
    );
    assert.deepEqual(iterativeKeys(copy), iterativeKeys(first));
  });
});
