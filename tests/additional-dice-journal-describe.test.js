/**
 * Issue 2008 — the Journal crafting describe names a rolled pool Tool as pending on its count
 * prompt, so the player's pool line and reach judging see it; a stage with no such Tool names none.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { RUN_LIFECYCLE_VERSION } from '../src/systems/runLifecycleState.js';

import { countEvaluation } from './helpers/countFixtures.js';

const ACTOR = {
  id: 'actor',
  uuid: 'Actor.actor',
  name: 'Brenna',
  items: [],
  getRollData: () => ({}),
};
const RECIPE = Object.freeze({ id: 'recipe', name: 'Tonic', craftingSystemId: 'sys-1' });

/** The versioned describe of a base-0 count stage, its lookups stubbed and its Tools prepared. */
async function describeCountStage(contributions) {
  const system = {
    resolutionMode: 'simple',
    features: { craftingChecks: true },
    craftingCheck: {
      simple: { rollFormula: '', dc: 1, evaluation: countEvaluation({ base: '0' }) },
    },
  };
  const run = { lifecycleVersion: RUN_LIFECYCLE_VERSION, recipeId: 'recipe', currentStepIndex: 0 };
  const engine = new CraftingEngine(
    { getRecipe: () => RECIPE },
    { invalidateCache() {}, getActiveRun: () => run }
  );
  Object.assign(engine, {
    _consumeVersionedGrant: async () => ({}),
    _executionSteps: () => [{ id: 'step' }],
    _lockedStageSelection: () => ({ selectedIngredientSetId: 'set' }),
    _selectedIngredientSet: () => ({ id: 'set' }),
    _versionedStageRollable: () => true,
    _getRecipeSystem: () => system,
    _versionedStageStarted: () => true,
    _versionedStagePreparation: async () => ({ valid: true, toolValidation: { tools: [] } }),
    _prepareToolCheckBonuses: async (formula) => ({ formula, contributions }),
    _buildInteractiveModifierChoice: () => null,
    _resolveSimpleCheckDc: async (_system, _config, _recipe, _set, _actor, target) => target,
  });
  return engine.describeVersionedStageCheck({
    actor: ACTOR,
    componentSourceActors: [],
    runId: 'run',
    preparationGrant: 'grant',
  });
}

test('a rolled pool Tool is pending on the Journal count prompt, and none is named without it', async () => {
  const hammer = { source: 'tool', label: 'Hammer', form: 'expression', expression: '1d4' };
  const descriptor = await describeCountStage([hammer]);
  assert.equal(descriptor.publicPrompt.product, 'count');
  assert.deepEqual(descriptor.publicPrompt.pendingTools, ['1d4']);
  const bare = await describeCountStage([]);
  assert.equal(bare.publicPrompt.product, 'count');
  assert.ok(!('pendingTools' in bare.publicPrompt), 'no Tool, nothing pending');
});
