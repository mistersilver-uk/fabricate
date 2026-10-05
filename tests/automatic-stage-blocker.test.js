/**
 * Issue 1644: the engine's automatic-stage refusal and the Journal's "completes as time passes" bolt
 * read one predicate, so the bolt cannot promise a completion the engine would refuse.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  automaticStageBlocker,
  completesAsTimePasses,
} from '../src/systems/automaticStageBlocker.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';

const NO_CHECK = {
  id: 'sys',
  resolutionMode: 'simple',
  craftingCheck: { simple: { rollFormula: '' } },
};
const STEP = { id: 'cure', toolIds: [], ingredientSets: [{ id: 'empty', ingredients: [] }] };

/** One eligible stage, and each way the engine refuses it, as `[label, code, overrides]`. */
const CASES = [
  ['eligible', null, {}],
  ['a manual run', 'manualPreference', { run: { completionMode: 'manual' } }],
  ['an input stage', 'materials', { set: { id: 'empty', ingredients: [{ componentId: 'herb' }] } }],
  ['a stage tool', 'tools', { step: { toolIds: ['hammer'] } }],
  ['a recipe tool', 'tools', { recipe: { toolIds: ['hammer'] } }],
  [
    'a usable check',
    'playerCheck',
    { system: { craftingCheck: { simple: { rollFormula: '1d20' } } } },
  ],
  ['a mode that requires a check', 'playerCheck', { system: { resolutionMode: 'progressive' } }],
];

function fixture({ run = {}, set = null, step = {}, recipe = {}, system = {} } = {}) {
  const stage = { ...STEP, ...step, ingredientSets: [set ?? STEP.ingredientSets[0]] };
  const authored = { id: 'recipe', craftingSystemId: 'sys', toolIds: [], ...recipe };
  authored.getExecutionSteps = () => [stage];
  return {
    run: {
      id: 'run',
      recipeId: 'recipe',
      craftingSystemId: 'sys',
      status: 'waitingTime',
      completionMode: 'worldTime',
      currentStepIndex: 0,
      steps: [{ stepId: 'cure', selectionPlan: { selectedIngredientSetId: 'empty' } }],
      ...run,
    },
    recipe: authored,
    step: stage,
    selectedSet: stage.ingredientSets[0],
    system: { ...NO_CHECK, ...system },
  };
}

test('the predicate names each automatic blocker and passes only an unblocked stage', () => {
  for (const [label, code, overrides] of CASES) {
    assert.equal(automaticStageBlocker(fixture(overrides))?.code ?? null, code, label);
  }
});

test('the engine refuses an automatic execute on exactly the predicate’s answer', () => {
  for (const [label, , overrides] of CASES) {
    const stage = fixture(overrides);
    const engine = new CraftingEngine();
    engine._getRecipeSystem = () => stage.system;
    assert.deepEqual(
      engine._automaticStageBlocker(stage.run, stage.recipe, stage.step, stage.selectedSet),
      automaticStageBlocker(stage),
      label
    );
  }
});

function projected(stage) {
  const builder = new RunJournalBuilder({
    craftingRunManager: { getActiveRuns: () => [stage.run], getRunHistory: () => [] },
    recipeManager: { getRecipe: (id) => (id === stage.recipe.id ? stage.recipe : null) },
    getSystem: (id) => (id === stage.system.id ? stage.system : null),
    nowWorldTime: () => 0,
  });
  const actor = { id: 'actor', uuid: 'Actor.actor', isOwner: true };
  return builder.buildListing({ actor, viewer: { id: 'user', isGM: true } }).activeRuns[0];
}

test('the Journal projects the bolt from the same predicate, and never on a paused run', () => {
  for (const [label, code, overrides] of CASES) {
    const stage = fixture(overrides);
    assert.equal(projected(stage).completesAsTimePasses, code === null, label);
    assert.equal(completesAsTimePasses(stage), code === null, label);
  }
  const paused = fixture({ run: { pauseState: { pausedAt: 0, remainingSeconds: 60 } } });
  assert.equal(automaticStageBlocker(paused), null, 'a pause is not an automatic blocker');
  assert.equal(projected(paused).completesAsTimePasses, false, 'but a paused run serves no time');
  const unbegun = fixture({ run: { status: 'inProgress' } });
  assert.equal(projected(unbegun).completesAsTimePasses, false, 'no clock is counting it down');
});
