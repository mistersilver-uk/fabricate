/**
 * Tests for the 1.6.0 migration
 * (src/migration/migrateRemoveResultSelectionProviders.js): removing the legacy
 * routed result-selection providers `macroOutcome`/`rollTableOutcome` and
 * canonicalizing routing on `check`, across recipe-level + per-step + alchemy
 * recipe-level containers, dropping `rollTableUuid`, stripping gathering-task
 * `resultSelection`, the recovery-warning payload, idempotency, purity, and the
 * chained 1.4.0 → 1.6.0 (former-tiered + upgrading-world catch-up) path.
 *
 * node:test + node:assert/strict. Pure functions; no Foundry globals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateRemoveResultSelectionProviders } from '../src/migration/migrateRemoveResultSelectionProviders.js';
import { migrateLegacyResolutionModes } from '../src/migration/migrateLegacyResolutionModes.js';

// ---------------------------------------------------------------------------
// Fixture helpers (DRY: tiny shape factories so no case re-declares a large
// literal — satisfies the Sonar new-code duplication gate the way
// migrate-legacy-resolution-modes.test.js does).
// ---------------------------------------------------------------------------

function selection(provider, extra = {}) {
  return { provider, ...extra };
}

function recipe(id, extra = {}) {
  return { id, name: extra.name ?? `Recipe ${id}`, craftingSystemId: 'sys-1', ...extra };
}

function routedRecipe(provider, extra = {}) {
  const built = recipe('recipe-routed', {
    resultSelection: selection(provider, extra.selectionExtra ?? {}),
    ...extra.recipeExtra,
  });
  if (extra.steps !== undefined) built.steps = extra.steps;
  return built;
}

function gatheringTask(id, resultSelection) {
  const task = { id, name: `Task ${id}`, resolutionMode: 'routed' };
  if (resultSelection !== undefined) task.resultSelection = resultSelection;
  return task;
}

function gatheringConfig(tasks) {
  return { systems: { 'sys-1': { tasks } } };
}

function migrate(payload) {
  return migrateRemoveResultSelectionProviders(payload);
}

function selectionOf(out, index = 0) {
  return out.recipes[index].resultSelection;
}

// ---------------------------------------------------------------------------
// Recipe-level rewrite
// ---------------------------------------------------------------------------

test('recipe-level macroOutcome → check; macroUuid kept', () => {
  const out = migrate({ recipes: [routedRecipe('macroOutcome', { selectionExtra: { macroUuid: 'Macro.x' } })] });
  const sel = selectionOf(out);
  assert.equal(sel.provider, 'check');
  assert.equal(sel.macroUuid, 'Macro.x', 'macroUuid is preserved');
});

test('recipe-level rollTableOutcome → check; rollTableUuid dropped', () => {
  const out = migrate({
    recipes: [routedRecipe('rollTableOutcome', { selectionExtra: { rollTableUuid: 'RollTable.y' } })],
  });
  const sel = selectionOf(out);
  assert.equal(sel.provider, 'check');
  assert.equal('rollTableUuid' in sel, false, 'rollTableUuid is dropped');
});

test('ingredientSet recipe is left untouched', () => {
  const out = migrate({ recipes: [routedRecipe('ingredientSet')] });
  assert.equal(selectionOf(out).provider, 'ingredientSet');
});

// ---------------------------------------------------------------------------
// Per-step rewrite
// ---------------------------------------------------------------------------

test('per-step resultSelection providers are rewritten and rollTableUuid dropped', () => {
  const out = migrate({
    recipes: [
      recipe('recipe-stepped', {
        steps: [
          { id: 'step-1', resultSelection: selection('macroOutcome', { macroUuid: 'Macro.s1' }) },
          { id: 'step-2', resultSelection: selection('rollTableOutcome', { rollTableUuid: 'RollTable.s2' }) },
        ],
      }),
    ],
  });
  const steps = out.recipes[0].steps;
  assert.equal(steps[0].resultSelection.provider, 'check');
  assert.equal(steps[0].resultSelection.macroUuid, 'Macro.s1');
  assert.equal(steps[1].resultSelection.provider, 'check');
  assert.equal('rollTableUuid' in steps[1].resultSelection, false);
});

// ---------------------------------------------------------------------------
// Alchemy recipe-level (no steps[])
// ---------------------------------------------------------------------------

test('alchemy recipe-level (no steps) macroOutcome → check', () => {
  const out = migrate({
    recipes: [recipe('alchemy-recipe', { resultSelection: selection('macroOutcome'), alchemy: true })],
  });
  const sel = selectionOf(out);
  assert.equal(sel.provider, 'check');
  assert.equal('steps' in out.recipes[0], false, 'no steps[] on the alchemy recipe');
});

// ---------------------------------------------------------------------------
// Gathering-task resultSelection stripping
// ---------------------------------------------------------------------------

test('gathering routed task resultSelection is stripped entirely', () => {
  const out = migrate({
    gatheringConfig: gatheringConfig([
      gatheringTask('task-1', selection('macroOutcome', { macroUuid: 'Macro.t1' })),
      gatheringTask('task-2', selection('rollTableOutcome', { rollTableUuid: 'RollTable.t2' })),
    ]),
  });
  const tasks = out.gatheringConfig.systems['sys-1'].tasks;
  assert.equal('resultSelection' in tasks[0], false);
  assert.equal('resultSelection' in tasks[1], false);
});

test('gathering task without resultSelection is left untouched', () => {
  const out = migrate({ gatheringConfig: gatheringConfig([gatheringTask('task-clean')]) });
  assert.deepEqual(out.gatheringConfig.systems['sys-1'].tasks[0], gatheringTask('task-clean'));
});

// ---------------------------------------------------------------------------
// Recovery-warning payload
// ---------------------------------------------------------------------------

test('recovery-warning payload collects dropped roll-table recipes/steps and stripped gathering tasks', () => {
  const out = migrate({
    recipes: [
      recipe('recipe-rt', { resultSelection: selection('rollTableOutcome', { rollTableUuid: 'RollTable.a' }) }),
      recipe('recipe-step-rt', {
        steps: [{ id: 'step-rt', resultSelection: selection('rollTableOutcome', { rollTableUuid: 'RollTable.b' }) }],
      }),
      // macroOutcome must NOT appear in the warning (lossless rewrite).
      routedRecipe('macroOutcome'),
    ],
    gatheringConfig: gatheringConfig([gatheringTask('task-strip', selection('macroOutcome'))]),
  });
  const warning = out._removedResultSelectionProviders;

  assert.deepEqual(
    warning.droppedRollTableRecipes.map((r) => ({ recipeId: r.recipeId, stepId: r.stepId })),
    [
      { recipeId: 'recipe-rt', stepId: null },
      { recipeId: 'recipe-step-rt', stepId: 'step-rt' },
    ],
    'only roll-table recipes/steps are recorded, with step context'
  );
  assert.deepEqual(warning.strippedGatheringTasks, [
    { systemId: 'sys-1', taskId: 'task-strip', taskName: 'Task task-strip' },
  ]);
});

// ---------------------------------------------------------------------------
// Idempotency + purity
// ---------------------------------------------------------------------------

test('running twice is a no-op and reports an empty warning payload on the second pass', () => {
  const first = migrate({
    recipes: [routedRecipe('rollTableOutcome', { selectionExtra: { rollTableUuid: 'RollTable.z' } })],
    gatheringConfig: gatheringConfig([gatheringTask('task-1', selection('macroOutcome'))]),
  });
  const second = migrate({ recipes: first.recipes, gatheringConfig: first.gatheringConfig });

  assert.deepEqual(second.recipes, first.recipes, 're-run does not change recipes');
  assert.deepEqual(second.gatheringConfig, first.gatheringConfig, 're-run does not change gatheringConfig');
  assert.deepEqual(second._removedResultSelectionProviders, {
    droppedRollTableRecipes: [],
    strippedGatheringTasks: [],
  });
});

test('input objects are deep-cloned (migration does not mutate the caller payload)', () => {
  const input = {
    recipes: [routedRecipe('macroOutcome', { selectionExtra: { rollTableUuid: 'RollTable.in' } })],
  };
  const snapshot = JSON.parse(JSON.stringify(input));
  migrate(input);
  assert.deepEqual(input, snapshot, 'caller input is untouched');
});

test('non-array recipes / non-object gatheringConfig pass through unchanged', () => {
  const out = migrate({ recipes: undefined, gatheringConfig: undefined });
  assert.equal(out.recipes, undefined);
  assert.equal(out.gatheringConfig, undefined);
  assert.deepEqual(out._removedResultSelectionProviders, {
    droppedRollTableRecipes: [],
    strippedGatheringTasks: [],
  });
});

// ---------------------------------------------------------------------------
// Chained 1.4.0 → 1.6.0 (former-tiered + upgrading-world catch-up)
// ---------------------------------------------------------------------------

test('a tiered system migrated by 1.4.0 to routedByCheck has no resultSelection for 1.6.0 to touch', () => {
  const systems = [{ id: 'sys-1', name: 'Tiered', resolutionMode: 'tiered' }];
  const recipes = [
    recipe('tiered-recipe', {
      resultGroups: [{ id: 'g1', name: 'Old', results: [] }],
      outcomeRouting: { success: 'g1' },
    }),
  ];
  // 1.4.0 now lands a tiered system on `routedByCheck` and carries no provider; the
  // group is reconciled (renamed to the outcome) so name-routing reproduces it.
  const after14 = migrateLegacyResolutionModes({ systems, recipes });
  assert.equal(after14.systems[0].resolutionMode, 'routedByCheck');
  assert.equal(after14.recipes[0].resultSelection, undefined);
  assert.equal(after14.recipes[0].resultGroups[0].name, 'success');

  // 1.6.0 over the 1.4.0 output has no resultSelection provider to rewrite.
  const after16 = migrate({ recipes: after14.recipes });
  assert.equal(after16.recipes[0].resultSelection, undefined);
  assert.deepEqual(after16._removedResultSelectionProviders.droppedRollTableRecipes, []);
});

test('upgrading-world catch-up: a persisted macroOutcome (legacy 1.4.0 seed) ends at check after 1.6.0', () => {
  // A world that ran the OLD 1.4.0 (which seeded the now-removed `macroOutcome`
  // alias) carries persisted `macroOutcome`; the 1.6.0 migration catches it up.
  const persisted = [routedRecipe('macroOutcome')];
  const out = migrate({ recipes: persisted });
  assert.equal(selectionOf(out).provider, 'check');
});
