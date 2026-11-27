/**
 * Activation refuses an iterative recipe its editor refuses, with one counted `iterativeNotReady`,
 * and an import stores such a recipe disabled (`resolution-modes` § Iterative Validation).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();
console.debug = () => {};

const { Recipe } = await import('../src/models/Recipe.js');
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { iterativeActivationIssues } =
  await import('../src/systems/iterative/iterativeCraftGate.js');
const { evaluateIterativeReadiness } =
  await import('../src/systems/iterative/iterativeReadiness.js');
const { RecipeActivationError } = await import('../src/systems/RecipeActivationError.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { iterativeRecipeIssues } =
  await import('../src/ui/svelte/apps/manager/iterative/iterativeRecipeIssues.js');
const { buildLabContent, LAB_SYSTEM_IDS } = await import('./view-lab/world/labContent.js');
const { seedIterativeRecipes, seedIterativeState } =
  await import('./view-lab/world/labIterative.js');
const { buildIterativeAuthoringFixture, ITERATIVE_MULTI_RECIPE_ID } =
  await import('./helpers/iterativeAuthoringFixture.js');
const { buildExportPayload, prepareForImport } =
  await import('../src/systems/CraftingSystemExporter.js');
const { normalizeExportEnvelope } = await import('./helpers/fullAuthoringFixture.js');

/** A real `RecipeManager` and `CraftingSystemManager` over `systems` and `recipes`, saving nowhere. */
function world({ systems = [], recipes = [] } = {}) {
  const recipeManager = new RecipeManager();
  recipeManager.initialized = true;
  recipeManager.save = async () => {};
  recipeManager._cleanupFlagsAfterRecipeMutation = async () => {};
  const manager = new CraftingSystemManager(recipeManager, {
    componentScopeStore: null,
    essenceScopeStore: null,
    toolScopeStore: null,
    characterLibrariesStore: null,
  });
  manager.initialized = true;
  manager.save = async () => {};
  for (const system of systems) manager.systems.set(system.id, manager._normalizeSystem(system));
  for (const entry of recipes) recipeManager.recipes.set(entry.id, new Recipe(entry));
  const modes = new ResolutionModeService(manager);
  globalThis.game.fabricate = {
    getCraftingSystemManager: () => manager,
    getResolutionModeService: () => modes,
  };
  return { manager, recipeManager };
}

/** The lab's Ironworks under `library` and recipe `state`, as a real pair of managers holds it. */
function labWorld(state, library = 'populated') {
  const content = buildLabContent();
  seedIterativeState(content, library);
  seedIterativeRecipes(content, [], state);
  const system = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.IRONWORKS);
  const recipes = content.recipes.filter((entry) => entry.craftingSystemId === system.id);
  const pair = world({ systems: [system], recipes });
  return { ...pair, system: pair.manager.getSystem(system.id), ids: recipes.map((r) => r.id) };
}

const recipeOf = (lab, id) => lab.recipeManager.getRecipe(id);
const notReadyOf = (activation) =>
  activation.issues.filter((issue) => issue.code === 'iterativeNotReady');

/** The editor's count: its recipe issues that carry `blocks: 'enable'`. */
function editorBlockers(system, recipe) {
  const issues = evaluateIterativeReadiness(system, [recipe]);
  return iterativeRecipeIssues(issues, recipe, system).filter((issue) => issue.blocks === 'enable')
    .length;
}

const COUNTS = {
  authoring: {
    'iw-r-blade': 0,
    'iw-r-ingot': 2,
    'iw-r-nail': 2,
    'iw-r-hinge': 0,
    'iw-r-rivet': 3,
    'iw-r-sword': 1,
  },
  multiStepOff: { 'iw-r-sword': 2 },
  chain: { 'iw-r-chain': 0 },
};

describe('iterativeNotReady agrees with the editor', () => {
  for (const state of ['authoring', 'noLibrary', 'multiStepOff', 'chain']) {
    it(`appears exactly when the editor counts an enable blocker, under ${state}`, () => {
      const lab = labWorld(state);
      for (const id of lab.ids) {
        const recipe = recipeOf(lab, id);
        const count = editorBlockers(lab.system, recipe);
        const activation = lab.recipeManager.canActivateRecipe(recipe);
        const expected = count > 0 ? [{ code: 'iterativeNotReady', count }] : [];
        assert.deepEqual(
          notReadyOf(activation).map((issue) => ({ code: issue.code, ...issue.params })),
          expected,
          `${state} ${id}`
        );
        assert.equal(COUNTS[state]?.[id] ?? count, count, `${state} ${id} counts as written`);
      }
    });
  }

  it('counts Blade 0, Ingot 2, Nail 2, Hinge 0, Rivet 3, Sword 1, Chain Link 0', () => {
    const lab = labWorld('chain');
    const counted = Object.fromEntries(
      lab.ids.map((id) => [
        id,
        iterativeActivationIssues(lab.system, recipeOf(lab, id))[0]?.params.count ?? 0,
      ])
    );
    assert.deepEqual(counted, { ...COUNTS.authoring, ...COUNTS.chain });
    const off = labWorld('multiStepOff');
    assert.deepEqual(iterativeActivationIssues(off.system, recipeOf(off, 'iw-r-sword')), [
      {
        code: 'iterativeNotReady',
        params: { count: 2 },
        message:
          "Its iterative setup has 2 blocking issue(s). The recipe's Validation tab lists them.",
      },
    ]);
  });

  it('a library issue never blocks: inverted temper bounds leave Blade activatable', () => {
    const lab = labWorld('authoring', 'inverted');
    const blade = recipeOf(lab, 'iw-r-blade');
    assert.ok(
      evaluateIterativeReadiness(lab.system, [blade]).some(
        (issue) => issue.kind === 'system' && issue.severity === 'critical'
      ),
      'the premise: the library raises a critical issue'
    );
    assert.deepEqual(lab.recipeManager.canActivateRecipe(blade).issues, []);
  });

  it('a warning never counts: Hinge raises one and stays at 0', () => {
    const lab = labWorld('authoring');
    const hinge = recipeOf(lab, 'iw-r-hinge');
    assert.deepEqual(
      evaluateIterativeReadiness(lab.system, [hinge]).map((issue) => issue.severity),
      ['warning']
    );
    assert.deepEqual(iterativeActivationIssues(lab.system, hinge), []);
  });

  it('adds nothing outside an iterative system', () => {
    const lab = labWorld('authoring');
    const simple = { ...lab.system, resolutionMode: 'simple' };
    assert.deepEqual(iterativeActivationIssues(simple, recipeOf(lab, 'iw-r-ingot')), []);
  });
});

describe('every activation path refuses a not-ready recipe', () => {
  it('the enable transition', async () => {
    const lab = labWorld('chain');
    await assert.rejects(
      lab.recipeManager.updateRecipe('iw-r-nail', { enabled: true }),
      (error) =>
        error instanceof RecipeActivationError &&
        error.activationIssues.some((issue) => issue.code === 'iterativeNotReady')
    );
    assert.equal(recipeOf(lab, 'iw-r-nail').enabled, false);
  });

  it('the bulk write', async () => {
    const lab = labWorld('chain');
    const result = await lab.manager.applyBulkEditToRecipes(
      LAB_SYSTEM_IDS.IRONWORKS,
      ['iw-r-nail', 'iw-r-chain'],
      { enabled: true }
    );
    assert.deepEqual(result.blockedRecipeIds, ['iw-r-nail']);
    assert.equal(recipeOf(lab, 'iw-r-nail').enabled, false);
  });

  it('a strict create, while a drafting create is born disabled', async () => {
    const lab = labWorld('chain');
    const nail = { ...recipeOf(lab, 'iw-r-nail').toJSON(), id: 'iw-r-nail-2', enabled: true };
    await assert.rejects(
      lab.recipeManager.createRecipe(nail, { notify: false }),
      RecipeActivationError
    );
    const drafted = await lab.recipeManager.createRecipe(
      { ...nail, id: 'iw-r-nail-3' },
      { notify: false, allowIncomplete: true }
    );
    assert.equal(drafted.enabled, false);
  });
});

/** The iterative authoring fixture's system and its Forged Shield, which is not ready. */
function shieldWorld({ stored = null, mode = 'iterative' } = {}) {
  const fixture = buildIterativeAuthoringFixture();
  const system = { ...fixture.system, resolutionMode: mode };
  const shield = fixture.recipes.find((entry) => entry.id === ITERATIVE_MULTI_RECIPE_ID);
  const pair = world({ systems: [system], recipes: stored ? [{ ...shield, ...stored }] : [] });
  return { ...pair, system, shield };
}

function importerOf({ manager, recipeManager }) {
  const settings = new Map();
  return new CompendiumImporter(manager, recipeManager, {
    isGM: () => true,
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => settings.set(key, value),
    reportProgress: Object.assign(() => {}, { dismiss() {} }),
  });
}

const packOf = ({ system, shield }, recipe = shield) => ({
  system: structuredClone(system),
  recipes: [structuredClone(recipe)],
});

describe('an import stores a not-ready recipe disabled', () => {
  beforeEach(() => {
    globalThis.game.user.isGM = true;
  });

  it('the premise: Forged Shield is refused for iterativeNotReady alone', () => {
    const shieldOnly = shieldWorld({ stored: {} });
    const activation = shieldOnly.recipeManager.canActivateRecipe(ITERATIVE_MULTI_RECIPE_ID);
    assert.deepEqual(
      activation.issues.map((issue) => issue.code),
      ['iterativeNotReady']
    );
  });

  it('RecipeManager.importRecipes stores it disabled, skipping nothing', async () => {
    const shieldOnly = shieldWorld();
    const report = await shieldOnly.recipeManager.importRecipes([shieldOnly.shield]);
    assert.deepEqual([report.imported, report.skipped, report.conflicts], [1, 0, []]);
    assert.equal(shieldOnly.recipeManager.getRecipe(ITERATIVE_MULTI_RECIPE_ID).enabled, false);
  });

  it('a system import creates it disabled, not in errors', async () => {
    const fresh = shieldWorld();
    fresh.manager.systems.clear();
    const summary = await importerOf(fresh).importFromPackData(packOf(fresh));
    assert.deepEqual(summary.recipes.errors, []);
    assert.equal(summary.recipes.imported, 1);
    assert.equal(fresh.recipeManager.getRecipe(ITERATIVE_MULTI_RECIPE_ID).enabled, false);
  });

  for (const enabled of [false, true]) {
    it(`an overwrite of a stored ${enabled ? 'enabled' : 'disabled'} copy stores it disabled`, async () => {
      const overwrite = shieldWorld({ stored: { enabled } });
      const summary = await importerOf(overwrite).importFromPackData(packOf(overwrite), {
        overwriteExisting: true,
      });
      assert.deepEqual(summary.recipes.errors, []);
      assert.equal(overwrite.recipeManager.getRecipe(ITERATIVE_MULTI_RECIPE_ID).enabled, false);
    });
  }

  it('a payload with another issue too keeps today’s conflict and error', async () => {
    const both = shieldWorld();
    const broken = structuredClone(both.shield);
    broken.steps[1].ingredientSets = [];
    const report = await both.recipeManager.importRecipes([broken]);
    assert.deepEqual(
      report.conflicts.map((conflict) => conflict.reason),
      ['invalid']
    );
    assert.equal(both.recipeManager.getRecipe(ITERATIVE_MULTI_RECIPE_ID), null);

    const fresh = shieldWorld();
    fresh.manager.systems.clear();
    const summary = await importerOf(fresh).importFromPackData(packOf(fresh, broken));
    assert.equal(summary.recipes.errors.length, 1);
    assert.equal(fresh.recipeManager.getRecipe(ITERATIVE_MULTI_RECIPE_ID), null);
  });

  it('a ready recipe, and any recipe outside iterative, keeps its enabled flag', async () => {
    const lab = labWorld('chain');
    const chain = recipeOf(lab, 'iw-r-chain').toJSON();
    lab.recipeManager.recipes.delete('iw-r-chain');
    await lab.recipeManager.importRecipes([chain]);
    assert.equal(lab.recipeManager.getRecipe('iw-r-chain').enabled, true);

    const routed = shieldWorld({ mode: 'routedByCheck' });
    const flat = { ...structuredClone(routed.shield), steps: [routed.shield.steps[0]] };
    await routed.recipeManager.importRecipes([flat]);
    assert.equal(routed.recipeManager.getRecipe(ITERATIVE_MULTI_RECIPE_ID).enabled, true);
  });

  it('an overwrite moving a routedByCheck system into iterative stores it disabled', async () => {
    const moved = shieldWorld({ mode: 'routedByCheck', stored: { enabled: true } });
    const pack = packOf(moved);
    pack.system.resolutionMode = 'iterative';
    const summary = await importerOf(moved).importFromPackData(pack, { overwriteExisting: true });
    assert.equal(moved.manager.getSystem(moved.system.id).resolutionMode, 'iterative');
    assert.deepEqual(summary.recipes.errors, []);
    assert.equal(moved.recipeManager.getRecipe(ITERATIVE_MULTI_RECIPE_ID).enabled, false);
  });

  it('a keep-mode round trip is equivalent modulo that enabled flag', async () => {
    const fixture = buildIterativeAuthoringFixture();
    const shield = fixture.recipes.find((entry) => entry.id === ITERATIVE_MULTI_RECIPE_ID);
    // The shield made ready: its steps hide `ember`, which this copy carries as a Counter Instance.
    const ready = structuredClone({ ...shield, id: 'recipe-ready-shield', name: 'Ready Shield' });
    ready.iterative.counters.push({ counterId: 'ember', start: 0, visible: true });
    const recipes = [shield, ready];
    const pair = world({ systems: [fixture.system], recipes });
    const exportNow = () =>
      buildExportPayload(
        pair.manager.getSystem(fixture.system.id),
        pair.recipeManager
          .getRecipes({ craftingSystemId: fixture.system.id })
          .map((r) => r.toJSON()),
        '9.9.9',
        [],
        {},
        {},
        {},
        {},
        {},
        {},
        {}
      );
    const first = exportNow();
    assert.deepEqual(
      first.recipes.map((recipe) => recipe.enabled),
      [true, true]
    );
    assert.equal(pair.recipeManager.canActivateRecipe('recipe-ready-shield').valid, true);
    const summary = await importerOf(pair).importFromPackData(prepareForImport(first, 'keep'), {
      overwriteExisting: true,
    });
    assert.deepEqual(summary.recipes.errors, []);
    const expected = structuredClone(first);
    expected.recipes.find((recipe) => recipe.id === ITERATIVE_MULTI_RECIPE_ID).enabled = false;
    assert.deepEqual(normalizeExportEnvelope(exportNow()), normalizeExportEnvelope(expected));
  });
});
