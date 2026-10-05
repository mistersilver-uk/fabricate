/**
 * Issue 1644: the engine's automatic-stage refusal and the Journal's "finishes this stage as time
 * passes" bolt read one predicate, and the bolt reads the world-time scan's own eligibility, so it
 * cannot promise a completion the engine would refuse.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  automaticStageBlocker,
  completesAsTimePasses,
} from '../src/systems/automaticStageBlocker.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { worldTimeDueStep } from '../src/systems/worldTimeDueStep.js';
import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';

const NO_CHECK = {
  id: 'sys',
  resolutionMode: 'simple',
  craftingCheck: { simple: { rollFormula: '' } },
};
const STEP = { id: 'cure', toolIds: [], ingredientSets: [{ id: 'empty', ingredients: [] }] };
const HERB = { componentId: 'herb' };

/** One eligible stage, and each way the engine refuses it, as `[label, code, overrides]`. */
const CASES = [
  ['eligible', null, {}],
  ['a manual run', 'manualPreference', { run: { completionMode: 'manual' } }],
  ['an input stage', 'materials', { sets: [{ id: 'empty', ingredients: [HERB] }] }],
  ['a stage tool', 'tools', { step: { toolIds: ['hammer'] } }],
  ['a recipe tool', 'tools', { recipe: { toolIds: ['hammer'] } }],
  [
    'a usable check',
    'playerCheck',
    { system: { craftingCheck: { simple: { rollFormula: '1d20' } } } },
  ],
  ['a mode that requires a check', 'playerCheck', { system: { resolutionMode: 'progressive' } }],
  [
    'a selected input set behind an empty first set',
    'materials',
    {
      sets: [STEP.ingredientSets[0], { id: 'stocked', ingredients: [HERB] }],
      selected: 'stocked',
    },
  ],
];

function fixture({
  run = {},
  sets = STEP.ingredientSets,
  selected = 'empty',
  step = {},
  recipe = {},
  system = {},
} = {}) {
  const stage = { ...STEP, ...step, ingredientSets: sets };
  const authored = {
    id: 'recipe',
    craftingSystemId: 'sys',
    toolIds: [],
    ...recipe,
    getExecutionSteps: () => [stage],
  };
  const timeGate = { availableAt: 60 };
  return {
    run: {
      id: 'run',
      recipeId: 'recipe',
      craftingSystemId: 'sys',
      lifecycleVersion: 1,
      status: 'waitingTime',
      completionMode: 'worldTime',
      currentStepIndex: 0,
      steps: [{ stepId: 'cure', timeGate, selectionPlan: { selectedIngredientSetId: selected } }],
      ...run,
    },
    recipe: authored,
    step: stage,
    selectedSet: sets.find((set) => set.id === selected),
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

const CHECKED = { ...NO_CHECK, id: 'checked', craftingCheck: { simple: { rollFormula: '1d20' } } };
const systemsOf = (stage) => (id) => ({ [stage.system.id]: stage.system, checked: CHECKED })[id];

function projected(stage) {
  const builder = new RunJournalBuilder({
    craftingRunManager: { getActiveRuns: () => [stage.run], getRunHistory: () => [] },
    recipeManager: { getRecipe: (id) => (id === stage.recipe.id ? stage.recipe : null) },
    getSystem: systemsOf(stage),
    nowWorldTime: () => 0,
  });
  const actor = { id: 'actor', uuid: 'Actor.actor', isOwner: true };
  return builder.buildListing({ actor, viewer: { id: 'user', isGM: true } }).activeRuns[0];
}

/** Both readings of the bolt, which must agree: the listing's and the predicate's own. */
function bolts(stage) {
  const claimability = () => () => null;
  const direct = completesAsTimePasses({ ...stage, getSystem: systemsOf(stage), claimability });
  return [projected(stage).completesAsTimePasses, direct];
}

test('the Journal projects the bolt from the same predicate, and never on a paused run', () => {
  for (const [label, code, overrides] of CASES) {
    assert.deepEqual(bolts(fixture(overrides)), Array(2).fill(code === null), label);
  }
  const paused = fixture({ run: { pauseState: { pausedAt: 0, remainingSeconds: 60 } } });
  assert.equal(automaticStageBlocker(paused), null, 'a pause is not an automatic blocker');
  assert.deepEqual(bolts(paused), [false, false], 'but a paused run serves no time');
  const unbegun = fixture({ run: { status: 'inProgress' } });
  assert.deepEqual(bolts(unbegun), [false, false], 'no clock is counting it down');
});

const OWED = {
  choiceId: 'pick',
  count: 1,
  awardStrategy: 'anyOne',
  alternatives: [{ id: 'gem', kind: 'component', componentId: 'gem', quantity: 1 }],
};

test('the bolt is withheld wherever the world-time scan would skip the run', () => {
  const eligible = fixture();
  const owing = fixture();
  owing.run.steps[0].pendingAwardChoices = [OWED];
  const legacy = fixture();
  delete legacy.run.lifecycleVersion;
  const rows = [
    ['an owed claimable award pick', owing],
    ['a legacy-contract run', legacy],
    ['an uncommitted journal', fixture({ run: { executionJournal: { status: 'planned' } } })],
    ['an unsettled award settle', fixture({ run: { awardChoiceJournal: { status: 'planned' } } })],
  ];
  assert.deepEqual(bolts(eligible), [true, true], 'the control row draws the bolt');
  for (const [label, stage] of rows) {
    assert.equal(automaticStageBlocker(stage), null, `${label} is no automatic blocker`);
    assert.deepEqual(bolts(stage), [false, false], label);
  }
});

test('the bolt reads the recipe’s system, as the engine’s automatic execute does', () => {
  const runChecked = fixture({ run: { craftingSystemId: 'checked' } });
  assert.deepEqual(bolts(runChecked), [true, true], 'the run’s own system id is not consulted');
  const recipeChecked = fixture({ recipe: { craftingSystemId: 'checked' } });
  assert.deepEqual(bolts(recipeChecked), [false, false], 'the recipe’s system carries the check');
});

test('the scan’s due rule drops only its clock when asked without a world time', () => {
  const { run } = fixture();
  assert.equal(worldTimeDueStep(run, { worldTime: 59 }), null, 'the gate holds before it passes');
  assert.equal(worldTimeDueStep(run, { worldTime: 60 }), run.steps[0]);
  assert.equal(worldTimeDueStep(run), run.steps[0], 'no world time, no gate');
  const owes = { owesAwardChoice: () => true };
  assert.equal(worldTimeDueStep(run, owes), null, 'an owed pick holds it either way');
  delete run.steps[0].timeGate;
  assert.equal(worldTimeDueStep(run), null, 'a stage with no gate is never the scan’s');
});
