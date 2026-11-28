/**
 * In `iterative` a step before the last may have no result set and produces nothing when it ends;
 * the last step still needs one (`recipes-and-steps`, `resultGroupRequired`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import { forgeRecipe, iterativeCommandWorld } from './helpers/iterativeCommandWorld.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './view-lab/world/labContent.js';
import { seedIterativeRecipes, seedIterativeState } from './view-lab/world/labIterative.js';

installFoundryEnv();

const { Recipe } = await import('../src/models/Recipe.js');
const { resultGroupRequired } = await import('../src/models/iterativeStepConfig.js');
const { migrateRecipeForModeChange } = await import('../src/systems/migrateRecipeForModeChange.js');
const { isIncompleteByCounts } = await import('../src/systems/recipeValidation.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { evaluateSystemValidation, isRecipeIncomplete } =
  await import('../src/systems/systemValidation.js');
const { stripComponentsFromRecipes } = await import('../src/systems/manager/deleteCascades.js');
const { evaluateRecipeReadiness } =
  await import('../src/ui/svelte/apps/manager/recipe/recipeReadiness.js');
const { buildRecipeList } = await import('../src/ui/svelte/stores/adminRecipeRowProjection.js');
const { describeComponentDeleteImpact } = await import('../src/utils/recipeComponentReferences.js');

/** The lab's Chain Link: step 1 has no result set, step 2 has one, and a stale recipe-level group. */
function chainLink() {
  const content = buildLabContent();
  seedIterativeState(content, 'populated');
  seedIterativeRecipes(content, [], 'chain');
  const system = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.IRONWORKS);
  return { system, chain: content.recipes.find((entry) => entry.id === 'iw-r-chain') };
}

/** Chain Link with no result set on its last step either. */
function bothEmpty() {
  const json = structuredClone(chainLink().chain);
  json.steps[1].resultGroups = [];
  return json;
}

const missingSteps = (validation) =>
  validation.issues
    .filter((issue) => issue.code === 'stepMissingResultGroup')
    .map((issue) => issue.params.step);

describe('resultGroupRequired', () => {
  it('waives only a non-final step, and only in iterative', () => {
    assert.deepEqual(
      [0, 1, 2].map((index) => resultGroupRequired(index, 3, true)),
      [false, false, true]
    );
    assert.deepEqual(
      [0, 1, 2].map((index) => resultGroupRequired(index, 3, false)),
      [true, true, true]
    );
    assert.equal(resultGroupRequired(0, 1, true), true, 'a single step is the last');
  });
});

describe('the model', () => {
  it('validates step 1 without a set in iterative, and refuses it elsewhere', () => {
    const recipe = new Recipe(chainLink().chain);
    assert.deepEqual(recipe.validate({ iterative: true }).issues, []);
    assert.deepEqual(missingSteps(recipe.validate()), ['Heat the rod']);
  });

  it('still refuses a last step without a set in iterative', () => {
    const recipe = new Recipe(bothEmpty());
    assert.deepEqual(missingSteps(recipe.validate({ iterative: true })), ['Close the link']);
    assert.deepEqual(missingSteps(recipe.validate()), ['Heat the rod', 'Close the link']);
  });
});

describe('the editor check, its issue, the system report and the model agree per position', () => {
  const readinessOf = (json, iterativeMode) => {
    const { checks, issues } = evaluateRecipeReadiness(json, { iterativeMode });
    return {
      satisfied: checks.find((check) => check.id === 'hasResultGroup').satisfied,
      steps: issues.filter((issue) => issue.id === 'noResultGroup').map((issue) => issue.stepName),
    };
  };
  const reportOf = (json, resolutionMode) =>
    evaluateSystemValidation(
      { ...chainLink().system, resolutionMode },
      { recipes: [new Recipe(json)] }
    ).issues.filter((issue) => issue.code === 'noResultGroup').length;

  const CASES = [
    ['Chain Link in iterative', () => chainLink().chain, 'iterative', []],
    ['Chain Link elsewhere', () => chainLink().chain, 'routedByCheck', ['Heat the rod']],
    ['both empty in iterative', bothEmpty, 'iterative', ['Close the link']],
    ['both empty elsewhere', bothEmpty, 'simple', ['Heat the rod', 'Close the link']],
  ];
  for (const [label, build, mode, missing] of CASES) {
    it(label, () => {
      const json = build();
      const iterative = mode === 'iterative';
      assert.deepEqual(readinessOf(json, iterative), {
        satisfied: missing.length === 0,
        steps: missing,
      });
      assert.deepEqual(missingSteps(new Recipe(json).validate({ iterative })), missing);
      assert.equal(reportOf(json, mode), missing.length);
      const incomplete = missing.length > 0;
      assert.equal(isRecipeIncomplete(new Recipe(json), json, mode), incomplete, 'model path');
      assert.equal(isIncompleteByCounts(json, mode), incomplete, 'count-only path');
      const system = { ...chainLink().system, resolutionMode: mode };
      const row = (recipe) =>
        buildRecipeList(null, {}, system, '', { roster: [recipe] }).recipes[0].incomplete;
      assert.equal(row(new Recipe(json)), incomplete, 'library row');
      assert.equal(
        row({ ...json, toJSON: () => structuredClone(json) }),
        incomplete,
        'library row, count-only'
      );
    });
  }

  it('the editor reads iterative from its route input as well as the flag', () => {
    const json = chainLink().chain;
    const fromInput = evaluateRecipeReadiness(json, { iterative: { issues: [], steps: [] } });
    assert.equal(fromInput.issues.filter((issue) => issue.id === 'noResultGroup').length, 0);
  });
});

describe('a run of Chain Link', () => {
  /** The forge recipe with no result set on step 1, and a recipe-level group no step reads. */
  function chainForge() {
    const json = forgeRecipe({ steps: 2 }).toJSON();
    json.steps[0].resultGroups = [];
    json.resultGroups = [
      {
        id: 'stale',
        name: 'Stale',
        producedWhen: [{ end: 'success', rules: [] }],
        results: [{ id: 'stale-r', componentId: 'blade', quantity: 9 }],
      },
    ];
    return new Recipe(json);
  }

  it('starts, ends step 1 on success, advances, and awards nothing, the stale group included', async () => {
    const world = iterativeCommandWorld({ recipe: chainForge() });
    const started = await world.start();
    assert.equal(started.success, true, JSON.stringify(started));
    const replies = [];
    for (let take = 0; take < 4; take += 1) replies.push(await world.take('stoke'));
    assert.ok(
      replies.every((reply) => reply.success === true),
      JSON.stringify(replies.at(-1))
    );
    assert.deepEqual(replies.at(-1).iterative.stepEnd, {
      kind: 'success',
      attempt: 4,
      resultGroupId: null,
    });
    assert.equal(world.actor.created.length, 0, 'nothing is awarded');
    const run = world.run();
    assert.equal(run.currentStepIndex, 1);
    assert.equal(run.steps[0].status, 'succeeded');
  });
});

describe('the chain migrated out of iterative', () => {
  it('raises stepMissingResultGroup, and activation refuses it', () => {
    const { system, chain } = chainLink();
    const { recipe: migrated } = migrateRecipeForModeChange(
      new Recipe(chain).toJSON(),
      'iterative',
      'routedByCheck',
      system
    );
    const recipe = Recipe.fromJSON(migrated);
    assert.deepEqual(missingSteps(recipe.validate()), ['Heat the rod']);
    const routed = { ...system, resolutionMode: 'routedByCheck' };
    const manager = new RecipeManager({
      getCraftingSystemManager: () => ({ getSystem: () => routed, getSystems: () => [routed] }),
    });
    const activation = manager.canActivateRecipe(recipe);
    assert.equal(activation.valid, false, 'enableBlocked');
    assert.ok(activation.issues.some((issue) => issue.code === 'stepMissingResultGroup'));
  });
});

describe('a component delete that leaves step 1 with no result set', () => {
  /** Chain Link whose step 1 also accepts a steel blade, and a cascade over it under `mode`. */
  async function deleteAlternative(mode) {
    const { system, chain } = chainLink();
    chain.steps[0].ingredientSets[0].ingredientGroups[0].options.push({
      componentId: 'iw-steel-blade',
      quantity: 1,
    });
    const routed = { ...system, resolutionMode: mode };
    const stored = new Map([[chain.id, chain]]);
    const io = {
      getSystem: () => routed,
      recipeManager: () => ({
        getRecipes: () => [...stored.values()],
        updateRecipe: async (id, json) => stored.set(id, json),
        save: async () => {},
        notifyRecipesChanged: () => {},
      }),
    };
    const ids = new Set(['iw-steel-blade']);
    const impact = describeComponentDeleteImpact([...ids], [chain], mode);
    const outcome = await stripComponentsFromRecipes(io, system.id, ids);
    return { impact, outcome, enabled: stored.get(chain.id).enabled };
  }

  it('leaves Chain Link enabled in iterative', async () => {
    const { impact, outcome, enabled } = await deleteAlternative('iterative');
    assert.equal(enabled, true);
    assert.equal(outcome.recipesDisabled, 0);
    assert.equal(impact.recipesDisabled, 0, 'the impact statement agrees');
  });

  it('clamps it under routedByCheck, where step 1 needs a set', async () => {
    const { impact, outcome, enabled } = await deleteAlternative('routedByCheck');
    assert.equal(enabled, false);
    assert.equal(outcome.recipesDisabled, 1);
    assert.equal(impact.recipesDisabled, 1, 'the impact statement agrees');
  });
});
