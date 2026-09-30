/** A begun crafting run keeps the terms it accepted, and an import prune does not destroy it. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Recipe } from '../src/models/Recipe.js';
import { evaluatePreparedCraftingCheck } from '../src/systems/checkRoll.js';
import { CompendiumImporter } from '../src/systems/CompendiumImporter.js';
import { createPersistedCraftingHistory } from './helpers/journal-fixtures.js';

const execute = (context, requestId) => context.engine.executeVersionedStage({
  viewer: context.gm, actor: context.actor, componentSourceActors: context.sources, runId: context.runId,
  expectedRevision: context.manager().getRun(context.actor, context.runId).runRevision,
  requestId, executionGrant: 'grant',
});

/** The world `RecipeManager` as the importer drives it: merge-and-rebuild updates, real deletes,
 * and the targeted run prune `cleanupOrphanedRecipeFlags` runs for the ids it names. */
function worldRecipes(context, provenance) {
  const store = new Map([[context.recipe.id, { ...context.recipe.toJSON(), importSource: provenance }]]);
  return {
    getRecipe: (id) => (store.has(id) ? Recipe.fromJSON(store.get(id)) : null),
    getRecipes: ({ craftingSystemId } = {}) => [...store.values()]
      .filter((data) => craftingSystemId === undefined || data.craftingSystemId === craftingSystemId)
      .map((data) => Recipe.fromJSON(data)),
    createRecipe: async (data) => store.set(data.id, structuredClone(data)),
    updateRecipe: async (id, data) => store.set(id, { ...store.get(id), ...structuredClone(data), id }),
    deleteRecipe: async (id) => store.delete(id),
    cleanupOrphanedRecipeFlags: ({ removedRecipeIds }) => context.manager().removeRunsForRecipes(removedRecipeIds),
    notifyRecipesChanged: () => {},
    save: async () => {},
  };
}

/** Reinstall the fixture's pack over the world, shipping `recipes`, wired as `composeServices` is. */
async function reinstall(context, recipes) {
  const provenance = { systemId: context.system.id, importedAt: 1 };
  const recipeManager = worldRecipes(context, provenance);
  const systems = { getSystems: () => [context.system], updateSystem: async (id, data) => ({ ...data, id }) };
  const importer = new CompendiumImporter(systems, recipeManager, {
    resolveExternalUuid: async () => null,
    activeRunRecipeIds: () => context.manager().activeRunRecipeIds(game.actors),
  });
  const summary = await importer.importFromPackData(
    { system: { id: context.system.id, name: context.system.name, components: [] }, recipes: recipes(context.recipe.toJSON()) },
    { overwriteExisting: true }
  );
  context.engine.recipeManager.getRecipe = recipeManager.getRecipe;
  return { summary, recipeManager };
}

/** A `Roll` that rolls 10 on every die and reads `@` paths from the roll data it was built with. */
function installTenRoll() {
  const saved = globalThis.Roll;
  const resolve = (formula, data) => String(formula).replace(/@([\w.]+)/g, (_match, path) =>
    String(path.split('.').reduce((value, key) => value?.[key], data) ?? 0));
  globalThis.Roll = class {
    constructor(formula, data = {}) { this.formula = formula; this.data = data; this.dice = []; }
    static replaceFormulaData(formula, data) { return resolve(formula, data); }
    static validate() { return true; }
    async evaluate() {
      this.total = resolve(this.formula, this.data).split('+')
        .reduce((sum, term) => sum + (/\d*d\d+/.test(term) ? 10 : Number(term)), 0);
      return this;
    }
  };
  return () => { globalThis.Roll = saved; };
}

test('a begun run persists its accepted terms: the recipe and the system crafting check', async () => {
  const fixture = await createPersistedCraftingHistory({ stageCount: 1, recipeModel: true, drive: async () => ({}) });

  assert.equal(fixture.armedRecord.termsSnapshot.recipe.id, 'historical-recipe');
  assert.deepEqual(fixture.armedRecord.termsSnapshot.recipe.steps[0].resultGroups[0].results.map((result) => result.quantity), [1]);
  assert.deepEqual(fixture.armedRecord.termsSnapshot.craftingCheck, { simple: { rollFormula: '1d20' } });
});

test('a begun timed run resolves with its original result groups after an import overwrites them', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    recipeModel: true,
    drive: async (context) => {
      const { summary, recipeManager } = await reinstall(context, (shipped) => {
        shipped.steps[0].resultGroups = [{ id: 'outputs-new', results: [{ id: 'result-new', componentId: 'award-stage-0', quantity: 9 }] }];
        return [shipped];
      });
      game.time.worldTime += 60;
      const resolved = await execute(context, 'finish');
      const live = recipeManager.getRecipe(context.recipe.id).getExecutionSteps()[0].resultGroups[0].id;
      return { summary, resolved, live };
    },
  });

  assert.equal(fixture.summary.recipes.imported, 1);
  assert.equal(fixture.live, 'outputs-new', 'the world now holds the overwritten recipe');
  assert.equal(fixture.resolved.success, true, JSON.stringify(fixture.resolved));
  assert.equal(fixture.record.status, 'succeeded');
  assert.deepEqual(fixture.record.steps[0].createdResults.map((result) => result.quantity), [1]);
  assert.equal(fixture.record.termsSnapshot, undefined, 'history does not keep the accepted terms');
});

test('a begun run survives an import of a pack that no longer ships its recipe', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    recipeModel: true,
    drive: async (context) => {
      const { summary, recipeManager } = await reinstall(context, () => []);
      const survived = Boolean(context.manager().getActiveRun(context.actor, context.runId));
      game.time.worldTime += 60;
      const resolved = survived ? await execute(context, 'finish') : null;
      return { summary, survived, kept: Boolean(recipeManager.getRecipe(context.recipe.id)), resolved };
    },
  });

  assert.deepEqual(fixture.summary.orphans, [
    { recipeId: 'historical-recipe', recipeName: 'Recorded tonic', disposition: 'reported', reason: 'activeRuns' },
  ]);
  assert.equal(fixture.summary.recipes.pruned, 0);
  assert.equal(fixture.kept, true, 'the prune is deferred while the run is active');
  assert.equal(fixture.survived, true, 'the run and its consumed inputs are not discarded');
  assert.equal(fixture.resolved.success, true, JSON.stringify(fixture.resolved));
  assert.equal(fixture.record.status, 'succeeded');
});

test('the accepted check config is rolled with the live actor\'s ability modifier', async () => {
  let mod = 1;
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    recipeModel: true,
    prepare: ({ system, actor }) => {
      system.craftingCheck = { simple: { rollFormula: '1d20 + @abilities.str.mod', dc: 12 } };
      actor.getRollData = () => ({ abilities: { str: { mod } } });
    },
    drive: async (context) => {
      context.system.craftingCheck = { simple: { rollFormula: '1d4', dc: 30 } };
      mod = 4;
      game.time.worldTime += 60;
      const restore = installTenRoll();
      try {
        const descriptor = await context.engine.describeVersionedStageCheck({
          actor: context.actor, componentSourceActors: context.sources, runId: context.runId,
          preparationGrant: 'grant', requestId: 'describe',
        });
        const evaluated = await evaluatePreparedCraftingCheck(descriptor.privateEvaluation, context.actor, {});
        return { descriptor, evaluated };
      } finally {
        restore();
      }
    },
  });

  assert.equal(fixture.descriptor.privateEvaluation.rollFormula, '1d20 + @abilities.str.mod', 'the accepted formula, not the live one');
  assert.equal(fixture.evaluated.data.total, 14, 'the die plus the modifier the actor has at roll time');
  assert.equal(fixture.evaluated.success, true, 'graded against the accepted DC');
});

test('a run begun before accepted terms existed still resolves against the live recipe', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => {
      context.steps[0].resultGroups = [{ id: 'outputs-live', results: [{ id: 'result-live', componentId: 'award-stage-0', quantity: 2 }] }];
      game.time.worldTime += 60;
      return { resolved: await execute(context, 'finish') };
    },
  });

  assert.equal(fixture.armedRecord.termsSnapshot, undefined, 'a recipe that cannot serialize itself snapshots nothing');
  assert.equal(fixture.resolved.success, true, JSON.stringify(fixture.resolved));
  assert.deepEqual(fixture.record.steps[0].createdResults.map((result) => result.quantity), [2]);
});

const stageCall = (context, operation, extra) => context.engine[operation]({
  viewer: context.gm, actor: context.actor, componentSourceActors: context.sources, runId: context.runId,
  expectedRevision: context.manager().getRun(context.actor, context.runId).runRevision,
  executionGrant: 'grant', ...extra,
});

test('the journal offers a begun run only the routes it accepted after an import re-ids them', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    recipeModel: true,
    drive: async (context) => {
      await reinstall(context, (shipped) => {
        shipped.steps[1].ingredientSets = [{ id: 'live-route', name: 'Live route', ingredientGroups: [] }];
        return [shipped];
      });
      game.time.worldTime += 60;
      const first = await execute(context, 'stage-0');
      const offered = context.project().activeRuns[0].currentStep.selectionAvailability.routes.map((route) => route.id);
      const begun = await stageCall(context, 'beginVersionedStage', {
        selectionPlan: { selectedIngredientSetId: offered[0] ?? null }, requestId: 'begin-1',
      });
      game.time.worldTime += 60;
      const second = begun.success ? await execute(context, 'stage-1') : null;
      return { first, offered, begun, second };
    },
  });

  assert.equal(fixture.first.success, true, JSON.stringify(fixture.first));
  assert.deepEqual(fixture.offered, ['next-route'], 'the card offers the accepted route, not the live one');
  assert.equal(fixture.begun.success, true, JSON.stringify(fixture.begun));
  assert.equal(fixture.second?.success, true, JSON.stringify(fixture.second));
  assert.equal(fixture.record.status, 'succeeded');
});

test('cancelling a started run after an overwrite refunds through the accepted recipe', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    recipeModel: true,
    stubCurrencySettlement: true,
    drive: async (context) => {
      await reinstall(context, (shipped) => [{ ...shipped, name: 'Renamed tonic' }]);
      const refunds = [];
      context.engine._refundCraftCurrency = async (_actor, recipe, spends) => {
        refunds.push({ name: recipe.name, spends });
        return { valid: true, groups: spends.map(() => ({ refunded: true })) };
      };
      const cancelled = await stageCall(context, 'cancelVersionedRun', { requestId: 'cancel' });
      return { cancelled, refunds };
    },
  });

  assert.equal(fixture.cancelled.success, true, JSON.stringify(fixture.cancelled));
  assert.deepEqual(fixture.refunds, [{ name: 'Recorded tonic', spends: [{ unit: 'gp', amount: 2 }] }]);
});
