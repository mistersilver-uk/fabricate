import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CraftingLifecycleExecutionError,
  CraftingLifecycleExecutor,
} from '../src/systems/CraftingLifecycleExecutor.js';
import { CraftingFizzleExecutor } from '../src/systems/CraftingFizzleExecutor.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { craftingStepHistoryEvidence } from '../src/systems/CraftingRunManager.js';
import { historyEvidenceFields } from '../src/systems/runHistoryEvidence.js';
import { IngredientSet } from '../src/models/IngredientSet.js';
import { Recipe } from '../src/models/Recipe.js';
import {
  evaluatePreparedRunCheck,
  postCheckRollHandoff,
} from '../src/systems/checkRoll.js';
import { transitionExecutionJournal } from '../src/systems/runExecutionJournal.js';
import { createPersistedCraftingHistory, mergeHistoryFlag } from './helpers/journal-fixtures.js';

test('both history allowlists retain only executed check evaluation metadata', () => {
  const executed = {
    resolutionSnapshot: { kind: 'check', mode: 'simple', product: 'sum', direction: 'over' },
    lastCheckResult: { data: { total: 17, product: 'sum', direction: 'over' } },
  };
  for (const allow of [craftingStepHistoryEvidence, historyEvidenceFields]) {
    assert.deepEqual(allow(executed, { executed: true }).resolutionSnapshot, executed.resolutionSnapshot);
    assert.deepEqual(allow(executed).resolutionSnapshot, { kind: 'check', mode: 'simple' });
    for (const invalid of [
      { ...executed, lastCheckResult: undefined },
      { ...executed, lastCheckResult: { data: { product: 'sum', direction: 'over' } } },
      { ...executed, resolutionSnapshot: { ...executed.resolutionSnapshot, product: 'count' } },
      { ...executed, resolutionSnapshot: { ...executed.resolutionSnapshot, kind: 'ingredients' } },
    ]) {
      assert.deepEqual(allow(invalid, { executed: true }).resolutionSnapshot, {
        kind: invalid.resolutionSnapshot.kind, mode: 'simple',
      });
    }
  }
});

/** Completes a one-stage versioned check with `data` as the validated result and reloads it. */
function completeVersionedCheck(data) {
  return createPersistedCraftingHistory({
    stageCount: 1,
    drive: async ({ engine, actor, sources, gm, runId, manager }) => {
      engine.installVersionedRunAuthority({
        consumeExecutionGrant: async (_grant, context) => ({
          operationId: `evaluation-${context.requestId}`,
          resolvedCheckResult: { success: true, outcome: 'pass', value: 17, data },
        }),
      });
      game.time.worldTime += 60;
      const result = await engine.executeVersionedStage({
        viewer: gm, actor, componentSourceActors: sources, runId,
        expectedRevision: manager().getRun(actor, runId).runRevision,
        requestId: 'check-evaluation', executionGrant: 'grant',
      });
      assert.equal(result.success, true);
      return { reloaded: new CraftingRunManager().getRunHistory(actor)[0] };
    },
  });
}

test('a completed versioned check retains executed evaluation after actor-flag reload', async () => {
  const fixture = await completeVersionedCheck({ dc: 12, total: 17, product: 'sum',
    direction: 'over', comparison: 'meet', target: 12, margin: 5, successes: null, cancelled: null });
  assert.deepEqual(fixture.record.steps[0].resolutionSnapshot, {
    kind: 'check', mode: 'simple', product: 'sum', direction: 'over',
  });
  assert.deepEqual(fixture.reloaded.steps[0].resolutionSnapshot, fixture.record.steps[0].resolutionSnapshot);
  assert.equal(fixture.reloaded.steps[0].lastCheckResult.data.margin, 5);
});

test('a versioned check result without evaluation metadata records none in its snapshot', async () => {
  const fixture = await completeVersionedCheck({ dc: 12, total: 17 });
  for (const record of [fixture.record, fixture.reloaded]) {
    assert.deepEqual(record.steps[0].resolutionSnapshot, { kind: 'check', mode: 'simple' });
  }
});

for (const failLast of [false, true]) {
  test(`writer/reload/projection retains distinct stage awards, source-qualified essence and settled currency (failure=${failLast})`, async () => {
    const fixture = await createPersistedCraftingHistory({ failLast });
    const { record, model } = fixture;
    assert.equal(record.status, failLast ? 'failed' : 'succeeded');
    assert.equal(record.steps[0].presentationSnapshot.description, 'Purpose 1');
    assert.deepEqual(record.steps[0].resolutionSnapshot, { kind: 'check', mode: 'simple' });
    assert.deepEqual(model.steps.map((step) => step.createdResults[0].name), ['Award stage-0', 'Award stage-1']);
    assert.deepEqual(model.steps.map((step) => step.createdResults[0].quantity), [1, 3]);
    assert.deepEqual(model.steps[0].currencySpends, [{ unit: 'gp', amount: 2 }]);
    const carriers = record.steps[0].essenceSpend.carriers;
    assert.equal(carriers.length, 2);
    assert.notEqual(carriers[0].actorUuid, carriers[1].actorUuid);
    assert.notEqual(carriers[0].itemUuid, carriers[1].itemUuid);
    for (const carrier of carriers) {
      assert.equal(carrier.quantity, 1);
      assert.deepEqual(carrier.contributions, [{ essenceId: 'sun', amount: 2 }, { essenceId: 'moon', amount: 3 }]);
    }
    assert.deepEqual(fixture.sourceItemsRemaining, [0, 0]);
    assert.equal(model.steps[0].consumedIngredients[0].name, 'Carrier 1');
    assert.equal(fixture.deletedRecipeModel.steps[0].presentationSnapshot.description, 'Purpose 1');
    assert.equal(JSON.stringify(model).includes('CHANGED_PRIVATE_FORMULA'), false);
  });
}

test('the start consumption receipt restores essence spending after the source documents disappear', async () => {
  const { armedRecord, record } = await createPersistedCraftingHistory({ resumePrefix: true });
  const receipt = armedRecord.executionJournal.effects.find((effect) => effect.effectId === 'consume-ingredients').receipt;
  assert.equal(receipt.essenceSpend.carriers.length, 2);
  // The same spending survives the execute journal that REPLACES the start journal,
  // because the start also persisted it on the stage.
  assert.deepEqual(armedRecord.steps[0].preparedConsumption.essenceSpend, receipt.essenceSpend);
  assert.deepEqual(record.steps[0].essenceSpend, receipt.essenceSpend);
});

for (const cancelAfter of [0, 1, 2]) {
  for (const armNext of [false, true]) {
    test(`cancel after ${cancelAfter} attempts (next armed=${armNext}) does not invent an attempted stage`, async () => {
      const { model } = await createPersistedCraftingHistory({ cancelAfter, armNext, stageCount: 3 });
      assert.equal(model.status, 'cancelled');
      assert.equal(model.steps.filter((step) => step.attempted).length, cancelAfter);
      assert.equal(model.steps[cancelAfter].createdResults.length, 0);
      assert.equal(model.steps[cancelAfter].completedAt, null);
    });
  }
}

test('executing GM never captures opaque initiator stage metadata or contribution labels', async () => {
  const { armedRecord, record, model } = await createPersistedCraftingHistory({ opaque: true, stageCount: 1 });
  for (const run of [armedRecord, record]) {
    for (const step of run.steps) {
      for (const field of ['presentationSnapshot', 'resolutionSnapshot', 'essenceSpend', 'currencySpends']) {
        assert.equal(Object.hasOwn(step, field), false, field);
      }
    }
  }
  assert.deepEqual(model.steps, []);
  assert.equal(JSON.stringify(model).includes('Carrier'), false);
  assert.equal(JSON.stringify(model).includes('Purpose'), false);
  for (const effect of record.executionJournal.effects) {
    assert.equal(effect.receipt?.essenceSpend, undefined);
  }
});

for (const mode of ['simple', 'routedByIngredients']) {
  test(`no-check history captures effective ${mode} resolution rather than inferring from an empty roll`, async () => {
    const { model } = await createPersistedCraftingHistory({ stageCount: 1, mode, checked: false });
    assert.deepEqual(model.steps[0].resolutionSnapshot, {
      kind: mode === 'simple' ? 'none' : 'ingredients', mode,
    });
    assert.equal(model.steps[0].lastCheckResult.total, null);
    assert.equal(model.steps[0].lastCheckResult.dc, null);
  });
}

function fakeRunManager(run, events) {
  return {
    invalidateCache() {},
    getActiveRun() {
      return structuredClone(run);
    },
    getRun() {
      return structuredClone(run);
    },
    async setStepSelectionPlan(_actor, _runId, _stepIndex, selection, { expectedRevision }) {
      assert.equal(expectedRevision, run.runRevision);
      events.push('selection');
      run.steps[0].selectionPlan = structuredClone(selection);
      run.runRevision += 1;
      return structuredClone(run);
    },
    async updateExecutionJournal(_actor, _runId, transition, { expectedRevision }) {
      assert.equal(expectedRevision, run.runRevision);
      events.push(`journal:${transition.type}${transition.effectId ? `:${transition.effectId}` : ''}`);
      run.executionJournal = transitionExecutionJournal(run.executionJournal, transition);
      run.runRevision += 1;
      return structuredClone(run);
    },
  };
}

function versionedRun(overrides = {}) {
  return {
    id: 'run-1',
    lifecycleVersion: 1,
    runRevision: 0,
    completionMode: 'manual',
    status: 'inProgress',
    currentStepIndex: 0,
    steps: [{ stepId: 'step-1', status: 'inProgress' }],
    ...overrides,
  };
}

test('CraftingLifecycleExecutor persists each journal phase around its effect seam', async () => {
  const events = [];
  const run = versionedRun();
  const executor = new CraftingLifecycleExecutor({
    runManager: fakeRunManager(run, events),
    consumeExecutionGrant: async (grant) =>
      grant === 'private-grant'
        ? { operationId: 'operation-1', resolvedCheckResult: { success: true, total: 19 } }
        : null,
  });

  const result = await executor.execute({
    actor: { id: 'actor-1' },
    runId: 'run-1',
    expectedRevision: 0,
    requestId: 'request-1',
    executionGrant: 'private-grant',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    operation: {
      intent: { stepIndex: 0 },
      effects: [
        {
          effectId: 'consume',
          kind: 'consumeIngredients',
          planned: { quantities: [2] },
          apply: async ({ trusted }) => {
            events.push(`effect:${trusted.resolvedCheckResult.total}`);
            return { consumed: 2 };
          },
        },
      ],
      outcome: ({ receipts }) => ({ success: true, consumed: receipts.consume.consumed }),
    },
  });

  assert.deepEqual(events, [
    'selection',
    'journal:plan',
    'journal:effectApplying:consume',
    'effect:19',
    'journal:effectApplied:consume',
    'journal:commit',
  ]);
  assert.deepEqual(result.outcome, { success: true, consumed: 2 });
  assert.equal(run.executionJournal.status, 'committed');
  assert.equal(run.runRevision, 5);
});

test('CraftingLifecycleExecutor resumes an applied prefix without invoking it twice', async () => {
  const events = [];
  const plan = {
    operationId: 'operation-resume',
    requestId: 'request-resume',
    baseRunRevision: 0,
    intent: { stepIndex: 0 },
    effects: [
      { effectId: 'consume', kind: 'consumeIngredients', planned: { quantity: 2 } },
      { effectId: 'award', kind: 'awardResults', planned: { quantity: 1 } },
    ],
  };
  let journal = transitionExecutionJournal(null, { type: 'plan', plan });
  journal = transitionExecutionJournal(journal, {
    type: 'effectApplying',
    effectId: 'consume',
  });
  journal = transitionExecutionJournal(journal, {
    type: 'effectApplied',
    effectId: 'consume',
    receipt: { consumed: 2 },
  });
  const run = versionedRun({ runRevision: 3, executionJournal: journal });
  const executor = new CraftingLifecycleExecutor({
    runManager: fakeRunManager(run, events),
    consumeExecutionGrant: async () => ({ operationId: 'operation-resume' }),
  });

  const result = await executor.execute({
    actor: { id: 'actor-1' },
    runId: run.id,
    expectedRevision: 3,
    requestId: 'request-resume',
    executionGrant: 'private-grant',
    operation: {
      intent: plan.intent,
      effects: [
        {
          ...plan.effects[0],
          apply: async () => {
            events.push('effect:consume-must-not-repeat');
          },
        },
        {
          ...plan.effects[1],
          apply: async ({ receipts }) => {
            assert.deepEqual(receipts.consume, { consumed: 2 });
            events.push('effect:award');
            return { created: 1 };
          },
        },
      ],
      outcome: ({ receipts }) => ({ success: true, created: receipts.award.created }),
    },
  });

  assert.deepEqual(events, [
    'journal:effectApplying:award',
    'effect:award',
    'journal:effectApplied:award',
    'journal:commit',
  ]);
  assert.deepEqual(result.outcome, { success: true, created: 1 });
  assert.equal(run.executionJournal.status, 'committed');
});

test('CraftingLifecycleExecutor marks an invoked ambiguous effect for recovery and never advances', async () => {
  const events = [];
  const run = versionedRun();
  const executor = new CraftingLifecycleExecutor({
    runManager: fakeRunManager(run, events),
    consumeExecutionGrant: async () => ({ operationId: 'operation-2' }),
  });

  await assert.rejects(
    () =>
      executor.execute({
        actor: { id: 'actor-1' },
        runId: 'run-1',
        expectedRevision: 0,
        requestId: 'request-2',
        executionGrant: 'private-grant',
        operation: {
          intent: { stepIndex: 0 },
          effects: [
            {
              effectId: 'consume',
              kind: 'consumeIngredients',
              planned: null,
              apply: async () => {
                events.push('effect:invoked');
                throw new Error('connection lost');
              },
            },
            {
              effectId: 'award',
              kind: 'awardResults',
              planned: null,
              apply: async () => events.push('effect:must-not-run'),
            },
          ],
          outcome: { success: true },
        },
      }),
    (error) => error instanceof CraftingLifecycleExecutionError && error.code === 'RECOVERY_REQUIRED'
  );

  assert.equal(events.includes('effect:must-not-run'), false);
  assert.equal(run.executionJournal.status, 'recoveryRequired');
  assert.equal(run.executionJournal.effects[0].phase, 'applying');
});

test('CraftingLifecycleExecutor preserves prior receipts and refreshes before recovery after inner persistence', async () => {
  const events = [];
  const run = versionedRun();
  const manager = fakeRunManager(run, events);
  const executor = new CraftingLifecycleExecutor({
    runManager: manager,
    consumeExecutionGrant: async () => ({ operationId: 'operation-recovery' }),
  });

  await assert.rejects(
    () =>
      executor.execute({
        actor: { id: 'actor-1' },
        runId: run.id,
        expectedRevision: 0,
        requestId: 'request-recovery',
        executionGrant: 'private-grant',
        operation: {
          intent: { stepIndex: 0 },
          effects: [
            {
              effectId: 'consume',
              kind: 'consumeIngredients',
              planned: { quantity: 2 },
              apply: async () => ({ consumed: 2 }),
            },
            {
              effectId: 'award',
              kind: 'awardResults',
              planned: { quantity: 1 },
              apply: async () => {
                run.runRevision += 1;
                throw new Error('award acknowledgement lost');
              },
            },
          ],
          outcome: { success: true },
        },
      }),
    (error) => error.code === 'RECOVERY_REQUIRED'
  );

  assert.equal(run.executionJournal.status, 'recoveryRequired');
  assert.deepEqual(run.executionJournal.effects[0].receipt, { consumed: 2 });
  assert.equal(run.executionJournal.effects[1].phase, 'applying');
});

test('CraftingLifecycleExecutor refuses missing grants and paused or stale runs before effects', async () => {
  for (const scenario of [
    { run: versionedRun(), grant: null, code: 'AUTHORITY_UNAVAILABLE' },
    {
      run: versionedRun({ pauseState: { pausedAt: 10, remainingSeconds: 20 } }),
      grant: 'private-grant',
      code: 'RUN_PAUSED',
    },
    { run: versionedRun({ runRevision: 2 }), grant: 'private-grant', code: 'STALE_RUN_REVISION' },
    { run: versionedRun({ lifecycleVersion: 2 }), grant: 'private-grant', code: 'UNSUPPORTED_RUN' },
  ]) {
    const events = [];
    const executor = new CraftingLifecycleExecutor({
      runManager: fakeRunManager(scenario.run, events),
      consumeExecutionGrant: async (grant) => (grant ? { operationId: 'operation-3' } : null),
    });
    await assert.rejects(
      () =>
        executor.execute({
          actor: { id: 'actor-1' },
          runId: scenario.run.id,
          expectedRevision: 0,
          requestId: 'request-3',
          executionGrant: scenario.grant,
          operation: {
            intent: { stepIndex: 0 },
            effects: [{ effectId: 'effect', kind: 'test', apply: async () => events.push('effect') }],
            outcome: { success: true },
          },
        }),
      (error) => error.code === scenario.code
    );
    assert.deepEqual(events, []);
  }
});

test('CraftingFizzleExecutor plans history before consumption and retains receipts on later ambiguity', async () => {
  setupEngineFixture();
  const actor = new FakeActor('fizzle-crafter');
  const manager = new CraftingRunManager();
  const events = [];
  const executor = new CraftingFizzleExecutor({
    runManager: manager,
    consumeExecutionGrant: async () => ({ operationId: 'fizzle-operation' }),
  });

  await assert.rejects(
    () =>
      executor.execute({
        actor,
        requestId: 'fizzle-request',
        executionGrant: 'fizzle-grant',
        details: { craftingSystemId: 'alchemy', componentSourceActorUuids: ['Actor.source'] },
        effects: [
          {
            effectId: 'consume',
            kind: 'consumeAlchemyItem',
            planned: { itemUuid: 'Actor.source.Item.herb', quantity: 1 },
            apply: async () => {
              events.push('consume');
              return { itemUuid: 'Actor.source.Item.herb', consumedQuantity: 1 };
            },
          },
          {
            effectId: 'dead-end',
            kind: 'recordAlchemyDeadEnd',
            planned: { key: 'herb:1' },
            apply: async () => {
              events.push('dead-end');
              throw new Error('flag write acknowledgement lost');
            },
          },
        ],
        outcome: { success: false, disposition: 'no-match', consumed: true },
      }),
    (error) => error.code === 'RECOVERY_REQUIRED'
  );

  manager.invalidateCache(actor.id);
  const history = manager.getRunHistory(actor);
  assert.deepEqual(events, ['consume', 'dead-end']);
  assert.equal(history[0].executionJournal.status, 'recoveryRequired');
  assert.deepEqual(history[0].executionJournal.effects[0].receipt, {
    itemUuid: 'Actor.source.Item.herb',
    consumedQuantity: 1,
  });
});

class FakeActor {
  constructor(id) {
    this.id = id;
    this.uuid = `Actor.${id}`;
    this.isOwner = true;
    this.items = [];
    this.flags = {};
  }

  getFlag(namespace, key) {
    return this.flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.flags[namespace] ||= {};
    this.flags[namespace][key] = mergeHistoryFlag(this.flags[namespace][key], value);
    return this;
  }
}

function setupEngineFixture() {
  let id = 0;
  globalThis.foundry = { utils: { randomID: () => `run-${++id}` } };
  globalThis.game = {
    user: { id: 'user-1' },
    time: { worldTime: 1000 },
    actors: [],
    fabricate: {
      getRecipeVisibilityService: () => ({
        guardCraftStart: ({ viewer }) => ({ craftable: Boolean(viewer) }),
        applyRecipeItemUseOnCraft: async () => {},
        learnRecipeOnCraft: async () => {},
      }),
    },
  };
  const ingredientSet = {
    id: 'set-1',
    ingredients: [
      { componentId: 'herb', quantity: 2 },
      { tagId: 'fresh', quantity: 1 },
      { essenceId: 'solar', quantity: 3 },
      { currency: { unit: 'gp', amount: 5 } },
    ],
    toJSON() {
      return { id: this.id, ingredients: this.ingredients };
    },
  };
  const recipe = {
    id: 'recipe-1',
    name: 'Sun Tea',
    craftingSystemId: 'system-1',
    validate: () => ({ valid: true, errors: [] }),
    getExecutionSteps: () => [
      {
        id: 'step-1',
        name: 'Steep',
        ingredientSets: [ingredientSet],
        resultGroups: [],
        toolIds: [],
        timeRequirement: { minutes: 2 },
      },
    ],
  };
  const recipeManager = {
    getRecipe: (recipeId) => (recipeId === recipe.id ? recipe : null),
    canCraft: () => ({ canCraft: true, satisfiableSet: ingredientSet }),
    getToolsForSet: () => [],
    ingredientMatchesItem: () => false,
  };
  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(recipeManager, runManager);
  return { engine, ingredientSet, recipe, recipeManager, runManager };
}

function installActualRunOutput(actor, recipe, id, name, img) {
  const sourceUuid = `Item.${id}`;
  globalThis.fromUuid = async (uuid) => uuid === sourceUuid ? { uuid: sourceUuid,
    toObject: () => ({ name, img, type: 'loot', system: { quantity: 1 } }),
  } : null;
  const step = recipe.getExecutionSteps()[0];
  recipe.getExecutionSteps = () => [{ ...step, resultGroups: [{ id: 'output', results: [{ id, itemUuid: sourceUuid, quantity: 1 }] }] }];
  actor.createEmbeddedDocuments = async (type, data) => data.map((entry) => {
    assert.equal(type, 'Item');
    const item = { ...structuredClone(entry), id, uuid: `${actor.uuid}.Item.${id}`, parent: actor, _source: structuredClone(entry) };
    actor.items.push(item);
    return item;
  });
}

function makeCurrentStageImmediate(recipe) {
  const step = recipe.getExecutionSteps()[0];
  recipe.getExecutionSteps = () => [{ ...step, timeRequirement: null }];
}

async function startReadyVersionedRun({ engine, recipe, actor, source, selectionPlan = {} }) {
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: `start-${actor.id}` }),
  });
  return engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: recipe.id,
    selectionPlan: {
      selectedIngredientSetId: 'set-1',
      ...selectionPlan,
    },
    requestId: `request-${actor.id}`,
    executionGrant: `grant-${actor.id}`,
  });
}

test('implicit execution step captures permitted recipe purpose once at arm', async () => {
  const { engine, recipe, runManager, ingredientSet } = setupEngineFixture();
  recipe.description = 'Captured implicit purpose';
  recipe.steps = [];
  recipe.ingredientSets = [ingredientSet];
  recipe.resultGroups = [];
  recipe.getExecutionSteps = Recipe.prototype.getExecutionSteps;
  assert.equal(recipe.getExecutionSteps()[0].description, '', 'actual implicit wrapper omits purpose');
  const visibility = game.fabricate.getRecipeVisibilityService();
  game.fabricate.getRecipeVisibilityService = () => ({ ...visibility, evaluateRecipeAccess: () => ({ visible: true }) });
  const actor = new FakeActor('implicit-purpose');
  const started = await startReadyVersionedRun({ engine, recipe, actor, source: new FakeActor('source') });
  const armed = runManager.getActiveRun(actor, started.runId);
  assert.equal(armed.steps[0].presentationSnapshot.description, 'Captured implicit purpose');
  recipe.description = 'Later live narrative';
  assert.equal(new CraftingRunManager().getActiveRun(actor, started.runId).steps[0].presentationSnapshot.description, 'Captured implicit purpose');
  const explicit = engine._stageHistorySnapshots({ recipe, step: { id: 'explicit', name: 'Named step', description: '' }, actor, viewer: game.user, sourceActors: [] });
  assert.equal(explicit.presentationSnapshot.description, '', 'an explicit empty stage does not borrow recipe narrative');
  game.fabricate.getRecipeVisibilityService = () => ({ ...visibility, evaluateRecipeAccess: () => ({ visible: false }) });
  assert.deepEqual(engine._stageHistorySnapshots({ recipe, step: recipe.getExecutionSteps()[0], actor, viewer: game.user, sourceActors: [] }), {});
});

test('an unavailable history visibility read omits optional snapshots without stranding a valid start', async () => {
  const { engine, recipe, runManager } = setupEngineFixture();
  makeCurrentStageImmediate(recipe);
  const visibility = game.fabricate.getRecipeVisibilityService();
  game.fabricate.getRecipeVisibilityService = () => ({ ...visibility,
    evaluateRecipeAccess: () => { throw new Error('optional history visibility unavailable'); },
  });
  const actor = new FakeActor('history-read-failure');
  const started = await startReadyVersionedRun({ engine, recipe, actor, source: new FakeActor('source') });
  assert.equal(started.canExecuteImmediately, true);
  assert.equal(runManager.getActiveRun(actor, started.runId).steps[0].presentationSnapshot, undefined);
});

test('CraftingEngine versioned start commits the stage: locked plan, spent inputs, armed gate', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  let deletes = 0;
  source.items = [{ id: 'herb', delete: async () => (deletes += 1) }];
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'start-operation' }),
  });

  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    completionMode: 'worldTime',
    selectionPlan: {
      selectedIngredientSetId: 'set-1',
      ingredientOptionOverrides: { choice: { optionIndex: 1 } },
      ingredientEssenceAllocation: {
        stepId: 'step-1',
        ingredientSetId: 'set-1',
        allocation: { 'Item.herb': 2 },
      },
    },
    requestId: 'request-start',
    executionGrant: 'private-start-grant',
  });

  assert.equal(started.success, true);
  assert.equal(started.waiting, true);
  assert.equal(started.canExecuteImmediately, false);
  assert.equal(deletes, 0);
  runManager.invalidateCache();
  const persisted = runManager.getActiveRun(actor, started.runId);
  assert.equal(persisted.lifecycleVersion, 1);
  assert.equal(persisted.completionMode, 'worldTime');
  // D-026/D-028: the start IS the stage start, so it spends and locks rather than deferring.
  assert.equal(persisted.steps[0].preparedConsumption.selectedIngredientSetId, 'set-1');
  assert.equal(persisted.executionJournal.status, 'committed');
  assert.deepEqual(
    persisted.executionJournal.effects.map((effect) => effect.effectId),
    ['consume-ingredients', 'start-stage']
  );
  assert.equal(persisted.steps[0].selectionPlan.selectedIngredientSetId, 'set-1');
  assert.deepEqual(persisted.steps[0].selectedRequirementSnapshot.ingredients[3], {
    currency: { unit: 'gp', amount: 5 },
  });
});

// An untimed first stage COMMITS at run start like every other first stage (issue 1648, M24): the
// carve-out that returned success without spending is what left the maintainer seven active runs
// that had taken nothing.
test('CraftingEngine commits an immediate stage at start and reads readiness from the commit', async () => {
  const { engine, recipe, runManager } = setupEngineFixture();
  makeCurrentStageImmediate(recipe);
  const actor = new FakeActor('ready-crafter');
  const source = new FakeActor('ready-source');
  const prepare = engine._prepareVersionedStage.bind(engine);
  let preparations = 0;
  engine._prepareVersionedStage = async (args) => {
    preparations += 1;
    return prepare(args);
  };
  let consumptions = 0;
  const consume = engine._consumeIngredients.bind(engine);
  engine._consumeIngredients = async (plan) => {
    consumptions += 1;
    return consume(plan);
  };

  const started = await startReadyVersionedRun({ engine, recipe, actor, source });

  assert.equal(started.success, true);
  assert.equal(started.waiting, false);
  assert.equal(started.canExecuteImmediately, true);
  assert.equal(consumptions, 1, 'the stage is spent ONCE, at its start');
  assert.equal(preparations, 1, 'readiness reconstructs the started stage instead of re-probing');
  assert.equal(runManager.getActiveRuns(actor).length, 1);
  const persisted = runManager.getActiveRun(actor, started.runId);
  assert.equal(persisted.executionJournal.status, 'committed');
  assert.equal(persisted.steps[0].preparedConsumption.selectedIngredientSetId, 'set-1');
  assert.equal(persisted.steps[0].timeGate, undefined, 'an untimed stage arms no gate');
  assert.notEqual(persisted.status, 'waitingTime');
});

// M24: an unresolved stage input must not produce an ACTIVE run that has taken nothing (issue
// 1648).
test('CraftingEngine refuses a second start against stock only one craft can have', async () => {
  const { engine, recipe, recipeManager, runManager } = setupEngineFixture();
  const set = new IngredientSet({ id: 'set-1', ingredientGroups: [
    { id: 'ore', options: [{ quantity: 1, match: { type: 'component', componentId: 'ore' } }] },
  ] });
  // Single step, NO time requirement: the shape the removed carve-out short-circuited on.
  recipe.getExecutionSteps = () => [
    { id: 'step-1', name: 'Smelt', ingredientSets: [set], resultGroups: [], toolIds: [] },
  ];
  recipeManager.ingredientMatchesItem = (_recipe, option, item) => option.match.componentId === item.id;
  const actor = new FakeActor('smelter');
  const source = new FakeActor('ore-stock');
  source.items = [{
    id: 'ore', uuid: `${source.uuid}.Item.ore`, parent: source, system: { quantity: 1 },
    async delete() { source.items = source.items.filter((item) => item !== this); return this; },
  }];
  const start = () => startReadyVersionedRun({ engine, recipe, actor, source,
    selectionPlan: { selectedIngredientSetId: set.id } });

  const first = await start();
  assert.equal(first.success, true);
  assert.equal(source.items.length, 0, 'the first start TOOK the ore');
  assert.equal(
    first.canExecuteImmediately,
    true,
    'and stays resolvable on what it holds, rather than re-probing the stock it just spent'
  );

  const second = await start();

  assert.equal(second.success, false, 'the second start is refused');
  assert.equal(second.runId, undefined);
  runManager.invalidateCache(actor.id);
  const active = runManager.getActiveRuns(actor);
  assert.equal(active.length, 1, 'the refused start leaves no run record behind');
  assert.equal(active[0].id, first.runId);
  assert.ok(active[0].steps[0].preparedConsumption, 'and the one run that exists has paid');
});

test('CraftingEngine never leaves an uncommitted active run for an unresolved stage input', async () => {
  const blockers = [
    {
      name: 'materials',
      refuses: true,
      configure({ recipeManager }) {
        recipeManager.canCraft = () => ({
          canCraft: false,
          missing: { ingredients: [], essences: [], tools: [] },
        });
      },
    },
    {
      name: 'choice',
      refuses: true,
      configure({ ingredientSet }) {
        ingredientSet.ingredientGroups = [
          { id: 'brew-base', options: [{ match: { type: 'component' } }, { match: { type: 'tag' } }] },
        ];
      },
    },
    {
      name: 'essence',
      refuses: true,
      configure({ ingredientSet }) {
        ingredientSet.ingredientGroups = [
          { id: 'solar-carrier', options: [{ match: { type: 'essence', essenceId: 'solar' } }] },
        ];
      },
    },
    {
      name: 'currency',
      refuses: true,
      configure({ engine, recipe }) {
        recipe.currencyCost = { currencies: [{ name: 'gp', cost: 5 }] };
        engine.itemPilesIntegration = {
          isEnabled: () => true,
          canAfford: async () => false,
          deductCurrency: async () => {
            throw new Error('readiness must not spend currency');
          },
        };
        game.fabricate.getCraftingSystemManager = () => ({
          getSystem: () => ({ resolutionMode: 'simple' }),
        });
      },
    },
    {
      name: 'tool',
      refuses: true,
      configure({ recipeManager }) {
        recipeManager.getToolsForSet = () => [{ id: 'mortar', componentId: 'mortar' }];
        recipeManager.toolMatchesItem = () => false;
      },
    },
    {
      // A GM misconfiguration, not a shortfall the actor can answer: the craft starts and
      // spends, and the stage waits for a usable check exactly as a timed stage would.
      name: 'required check configuration',
      refuses: false,
      configure() {
        game.fabricate.getCraftingSystemManager = () => ({
          getSystem: () => ({
            resolutionMode: 'progressive',
            craftingCheck: { progressive: { rollFormula: '' } },
          }),
        });
      },
    },
  ];

  for (const blocker of blockers) {
    const fixture = setupEngineFixture();
    makeCurrentStageImmediate(fixture.recipe);
    blocker.configure(fixture);
    const actor = new FakeActor(`${blocker.name}-crafter`);
    const source = new FakeActor(`${blocker.name}-source`);

    const started = await startReadyVersionedRun({
      engine: fixture.engine,
      recipe: fixture.recipe,
      actor,
      source,
    });

    const runs = fixture.runManager.getActiveRuns(actor);
    assert.notEqual(started.canExecuteImmediately, true, blocker.name);
    assert.equal(started.success, !blocker.refuses, blocker.name);
    assert.equal(runs.length, blocker.refuses ? 0 : 1, blocker.name);
    for (const run of runs) {
      assert.ok(
        run.steps?.[0]?.preparedConsumption,
        `${blocker.name}: an active run has always taken its materials`
      );
    }
  }
});

test('CraftingEngine allows supplied choices to continue into a manual check prompt', async () => {
  const fixture = setupEngineFixture();
  makeCurrentStageImmediate(fixture.recipe);
  fixture.ingredientSet.ingredientGroups = [
    { id: 'brew-base', options: [{ match: { type: 'component' } }, { match: { type: 'tag' } }] },
  ];
  game.fabricate.getCraftingSystemManager = () => ({
    getSystem: () => ({
      resolutionMode: 'simple',
      craftingCheck: { simple: { rollFormula: '1d20' } },
    }),
  });
  const actor = new FakeActor('prompt-crafter');
  const source = new FakeActor('prompt-source');
  const originalRoll = globalThis.Roll;
  let rolls = 0;
  globalThis.Roll = class {
    constructor() {
      rolls += 1;
    }
  };

  let started;
  try {
    started = await startReadyVersionedRun({
      engine: fixture.engine,
      recipe: fixture.recipe,
      actor,
      source,
      selectionPlan: { ingredientOptionOverrides: { 'brew-base': { optionIndex: 1 } } },
    });
  } finally {
    if (originalRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = originalRoll;
  }

  assert.equal(started.success, true);
  assert.equal(started.canExecuteImmediately, true);
  assert.equal(rolls, 0);
});

test('CraftingEngine refuses inaccessible normal starts before persistence without revealing why', async () => {
  for (const reason of ['visibility', 'knowledge', 'locked']) {
    const { engine, recipe, runManager } = setupEngineFixture();
    const actor = new FakeActor(`guarded-${reason}`);
    const source = new FakeActor(`source-${reason}`);
    const viewer = { id: `viewer-${reason}` };
    let guardedViewer = null;
    let writes = 0;
    actor.setFlag = async (...args) => {
      writes += 1;
      return FakeActor.prototype.setFlag.call(actor, ...args);
    };
    game.fabricate.getRecipeVisibilityService = () => ({
      guardCraftStart(args) {
        guardedViewer = args.viewer;
        return { craftable: false, reason };
      },
    });
    engine.installVersionedRunAuthority({
      consumeExecutionGrant: async () => ({ operationId: `guard-${reason}` }),
    });

    const result = await engine.startVersionedRun({
      viewer,
      actor,
      sourceActors: [source],
      recipeId: recipe.id,
      selectionPlan: { selectedIngredientSetId: 'set-1' },
      executionGrant: 'start-grant',
      requestId: `request-${reason}`,
    });

    assert.equal(guardedViewer, viewer);
    assert.deepEqual(result, {
      success: false,
      results: null,
      message: 'Crafting is unavailable.',
    });
    assert.equal(Object.hasOwn(result, 'reason'), false);
    assert.equal(writes, 0);
    assert.deepEqual(runManager.getActiveRuns(actor), []);
    assert.deepEqual(runManager.getRunHistory(actor), []);
  }
});

test('CraftingEngine preserves blind alchemy starts only for the grant-bound matched recipe', async () => {
  const { engine, recipe, runManager } = setupEngineFixture();
  const actor = new FakeActor('blind-alchemist');
  const source = new FakeActor('blind-source');
  let guardCalls = 0;
  game.fabricate.getRecipeVisibilityService = () => ({
    guardCraftStart: () => {
      guardCalls += 1;
      return { craftable: false, reason: 'visibility' };
    },
  });
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({
      operationId: 'blind-match-operation',
      matched: true,
      activityKind: 'alchemy',
      recipeId: recipe.id,
    }),
  });

  const result = await engine.startVersionedRun({
    actor,
    sourceActors: [source],
    recipeId: recipe.id,
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'matched-alchemy-grant',
    requestId: 'blind-match-request',
  });

  assert.equal(result.success, true);
  assert.equal(guardCalls, 0);
  assert.equal(runManager.getActiveRuns(actor).length, 1);
});

test('CraftingEngine routes ordinary versioned entry and cancellation through authority adapters', async () => {
  const { engine, recipe, runManager } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');

  const unavailable = await engine.craft(actor, [source], recipe, 'set-1', {
    lifecycleVersion: 1,
  });
  assert.equal(unavailable.authorityUnavailable, true);
  assert.deepEqual(runManager.getActiveRuns(actor), []);

  const calls = [];
  engine.installVersionedRunAuthority({
    requestStart: async (request) => {
      calls.push(['start', request.recipeId]);
      return { success: true, requested: true };
    },
    requestCancel: async (request) => {
      calls.push(['cancel', request.runId, request.expectedRevision]);
      return { success: true, requested: true };
    },
    consumeExecutionGrant: async () => ({ operationId: 'start-operation' }),
  });
  assert.equal(
    (await engine.craft(actor, [source], recipe, 'set-1', { lifecycleVersion: 1 })).requested,
    true
  );
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: recipe.id,
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'grant',
  });
  const cancelled = await engine.cancelCraft(actor, [source], started.runId);
  assert.equal(cancelled.requested, true);
  assert.deepEqual(calls, [
    ['start', 'recipe-1'],
    ['cancel', started.runId, started.runRevision],
  ]);
});

test('CraftingEngine routes versioned alchemy before local matching or consumption', async () => {
  const { engine } = setupEngineFixture();
  const actor = new FakeActor('alchemist');
  const source = new FakeActor('source');
  const calls = [];
  engine.installVersionedRunAuthority({
    requestStart: async (request) => {
      calls.push(request);
      return { success: true, requested: true };
    },
  });

  const result = await engine.craftAlchemy(
    actor,
    [source],
    [{ item: { uuid: 'Item.herb' }, componentId: 'herb' }],
    { lifecycleVersion: 1, craftingSystemId: 'system-1' }
  );

  assert.equal(result.requested, true);
  assert.equal(calls[0].activityKind, 'alchemy');
  assert.deepEqual(calls[0].submittedItems, [{ itemUuid: 'Item.herb', componentId: 'herb' }]);
});

test('CraftingEngine prepares a versioned alchemy match from GM-resolved documents without writes', async () => {
  const { engine } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  const contexts = [];
  game.fabricate.getCraftingSystemManager = () => ({
    getSystem: () => ({
      id: 'alchemy-system',
      resolutionMode: 'alchemy',
      alchemy: { consumeOnFail: true },
      components: [],
    }),
  });
  engine._matchAlchemySignature = () => ({
    matched: true,
    recipe: { id: 'secret-recipe' },
    ingredientSetId: 'set-secret',
  });
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => {
      contexts.push(context);
      return { operationId: 'prepare-operation' };
    },
  });

  const prepared = await engine.prepareVersionedAlchemyStart({
    actor,
    sourceActors: [source],
    craftingSystemId: 'alchemy-system',
    submittedItems: [
      {
        item: { uuid: 'Actor.source.Item.herb', parent: source },
        componentId: 'herb',
      },
    ],
    executionGrant: 'prepare-grant',
    requestId: 'request-prepare',
  });

  assert.deepEqual(prepared, {
    success: true,
    matched: true,
    activityKind: 'alchemy',
    recipeId: 'secret-recipe',
    selectionPlan: { selectedIngredientSetId: 'set-secret' },
    submittedItemUuids: ['Actor.source.Item.herb'],
  });
  assert.equal(contexts[0].operation, 'prepareAlchemyStart');
  assert.deepEqual(actor.flags, {});
  assert.deepEqual(source.flags, {});
});

test('CraftingEngine v1 cancellation reverses the start spend and writes nothing when it spent nothing', async () => {
  const { engine } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  let itemWrites = 0;
  source.createEmbeddedDocuments = async () => (itemWrites += 1);
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'cancel-operation' }),
  });
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });

  const cancelled = await engine.cancelVersionedRun({
    actor,
    componentSourceActors: [source],
    runId: started.runId,
    expectedRevision: started.runRevision,
    executionGrant: 'cancel-grant',
  });

  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.refunded, true);
  assert.equal(cancelled.restoredCount, 0);
  assert.equal(itemWrites, 0);
});

test('CraftingEngine refuses stale route and singleton intent until both material repairs are persisted', async () => {
  const { engine, recipe, recipeManager, runManager } = setupEngineFixture();
  const set = new IngredientSet({ id: 'set-1', ingredientGroups: ['a', 'b'].map((id) => ({
    id, options: [{ quantity: 1, match: { type: 'component', componentId: id } }],
  })) });
  // A run's FIRST stage commits at start (M24), so an unstarted stage whose selections can still be
  // repaired is a LATER stage of a multi-step recipe.
  const opener = new IngredientSet({ id: 'set-0', ingredientGroups: [] });
  recipe.getExecutionSteps = () => [
    { id: 'step-0', ingredientSets: [opener], resultGroups: [], toolIds: [] },
    { id: 'step-1', ingredientSets: [set], resultGroups: [], toolIds: [] },
  ];
  recipeManager.ingredientMatchesItem = (_recipe, option, item) => option.match.componentId === item.id;
  const actor = new FakeActor('repair-crafter');
  const source = new FakeActor('repair-stock');
  source.items = ['a', 'b'].map((id) => ({ id, uuid: `${source.uuid}.Item.${id}`, system: { quantity: 1 } }));
  let spends = 0;
  engine._consumeIngredients = async () => { spends += 1; return []; };
  engine._createResultItems = async () => ({ items: [], resolutionMeta: null });
  const plan = { selectedIngredientSetId: set.id, ingredientOptionOverrides: {
    a: { optionIndex: 1 }, b: { optionIndex: 1 },
  } };
  const started = await startReadyVersionedRun({ engine, recipe, actor, source,
    selectionPlan: { selectedIngredientSetId: opener.id } });
  assert.equal(started.success, true);
  engine.installVersionedRunAuthority({ consumeExecutionGrant: async () => ({
    operationId: 'repaired-execution',
    resolvedCheckResult: { success: true, outcome: null, value: null, data: {} },
  }) });
  await engine.executeVersionedStage({
    actor, componentSourceActors: [source], runId: started.runId,
    expectedRevision: runManager.getActiveRun(actor, started.runId).runRevision,
    executionGrant: 'grant', requestId: 'open-execute',
  });
  const stageIndex = runManager.getActiveRun(actor, started.runId).currentStepIndex;
  assert.equal(stageIndex, 1, 'the stale-route stage is current');
  const routeSnapshot = () => structuredClone(set.toJSON?.() ?? set);
  await runManager.setStepSelectionPlan(actor, started.runId, stageIndex,
    { ...plan, selectedRequirementSnapshot: routeSnapshot() },
    { expectedRevision: runManager.getActiveRun(actor, started.runId).runRevision });
  spends = 0;
  const execute = (selectionPlan) => engine.executeVersionedStage({
    actor, componentSourceActors: [source], runId: started.runId,
    expectedRevision: runManager.getActiveRun(actor, started.runId).runRevision,
    executionGrant: 'grant', requestId: 'repair-execute', selectionPlan,
  });
  const assertRefused = async (selectionPlan) => {
    const before = structuredClone(actor.flags);
    const result = await execute(selectionPlan);
    assert.equal(result.success, false);
    assert.equal(spends, 0);
    assert.deepEqual(actor.flags, before, 'refusal leaves persisted intent, revision and evidence alone');
  };
  await assertRefused();
  const repair = async (groupId) => {
    plan.ingredientOptionOverrides[groupId] = { optionIndex: 0 };
    const current = runManager.getActiveRun(actor, started.runId);
    await runManager.setStepSelectionPlan(actor, started.runId, stageIndex,
      { ...plan, selectedRequirementSnapshot: routeSnapshot() }, { expectedRevision: current.runRevision });
  };
  await repair('a');
  await assertRefused();
  assert.deepEqual(runManager.getActiveRun(actor, started.runId).steps[stageIndex].selectionPlan.ingredientOptionOverrides.b, { optionIndex: 1 });
  await repair('b');
  await assertRefused({ ...plan, selectedIngredientSetId: 'removed' });
  for (const optionIndex of [null, false, '', ' ', -1, 0.5, 2]) {
    await assertRefused({ ...plan, ingredientOptionOverrides: {
      ...plan.ingredientOptionOverrides, b: { optionIndex },
    } });
  }
  await assertRefused({ ...plan, ingredientOptionOverrides: {
    ...plan.ingredientOptionOverrides, b: { optionIndex: 0, heldItemId: 'Item.missing' },
  } });
  const removedStock = source.items.pop();
  await assertRefused();
  source.items.push(removedStock);
  const result = await execute();
  assert.equal(result.success, true);
  assert.equal(spends, 1);
  assert.equal(runManager.getRunHistory(actor)[0].executionJournal.status, 'committed');
});

for (const scenario of ['delete-veto', 'update-refusal', 'prefix-then-veto', 'document-return', 'update-document-return']) {
  test(`versioned consumption confirms document writes: ${scenario}`, async () => {
    const { engine, recipe, recipeManager, runManager } = setupEngineFixture();
    const actor = new FakeActor('confirmation');
    const source = new FakeActor('stock');
    const ids = scenario === 'prefix-then-veto' ? ['first', 'last'] : ['last'];
    const set = new IngredientSet({ id: 'set-1', ingredientGroups: ids.map((id) => ({
      id, options: [{ quantity: 1, match: { type: 'component', componentId: id } }],
    })) });
    recipe.getExecutionSteps = () => [{ id: 'step-1', ingredientSets: [set], resultGroups: [], toolIds: [] }];
    recipeManager.ingredientMatchesItem = (_recipe, option, item) => option.match.componentId === item.id;
    const writes = [];
    source.items = ids.map((id) => ({ id, uuid: `${source.uuid}.Item.${id}`, parent: source,
      system: { quantity: scenario.startsWith('update-') ? 2 : 1 },
      async delete() {
        writes.push(id);
        if (id === 'last' && scenario !== 'document-return') return undefined;
        source.items = source.items.filter((item) => item !== this);
        return this;
      },
      async update() {
        writes.push(id);
        if (scenario !== 'update-document-return') return undefined;
        this.system.quantity = 1;
        return this;
      },
    }));
    let awards = 0;
    engine._createResultItems = async () => { awards += 1; return { items: [], resolutionMeta: null }; };
    // The stage is UNTIMED and consumption now happens at its START (D-026/D-028, M24), so the
    // vetoed write is reached by the start call rather than by a later execute.
    const start = () => startReadyVersionedRun({ engine, recipe, actor, source,
      selectionPlan: { selectedIngredientSetId: set.id } });
    const resolvingAuthority = () => engine.installVersionedRunAuthority({
      consumeExecutionGrant: async () => ({
        operationId: 'confirmed-execution', resolvedCheckResult: { success: true, data: {} },
      }),
    });
    const executeRun = (runId) => engine.executeVersionedStage({ actor, componentSourceActors: [source],
      runId, expectedRevision: runManager.getRun(actor, runId).runRevision,
      executionGrant: 'grant', requestId: 'confirm-execute' });
    if (scenario.endsWith('document-return')) {
      const started = await start();
      assert.equal(started.success, true);
      assert.equal(source.items.length, scenario.startsWith('update-') ? 1 : 0, 'spent at start');
      resolvingAuthority();
      assert.equal((await executeRun(started.runId)).success, true);
      assert.equal(awards, 1);
      assert.equal(source.items.length, scenario.startsWith('update-') ? 1 : 0);
      assert.equal(runManager.getRunHistory(actor)[0].steps[0].consumedIngredients[0].quantity, 1);
    } else if (scenario === 'prefix-then-veto') {
      // A REAL spend happened before the veto, so the run is the only record of it and MUST
      // survive for a GM to reconcile. The start rethrows rather than discarding.
      await assert.rejects(start, (error) => error.code === 'RECOVERY_REQUIRED');
      const reloaded = new CraftingRunManager().getActiveRuns(actor)[0];
      assert.equal(reloaded.executionJournal.status, 'recoveryRequired');
      const consumption = reloaded.executionJournal.effects.find((effect) => effect.effectId === 'consume-ingredients');
      assert.notEqual(consumption.phase, 'applied');
      assert.equal(consumption.receipt.confirmed[0].quantity, 1);
      assert.equal(awards, 0);
      assert.equal(source.items.length, 1, 'a successful prefix stays spent, the vetoed item remains');
      assert.equal(reloaded.steps[0].preparedConsumption, undefined, 'an ambiguous start locks nothing');
      resolvingAuthority();
      try { assert.equal((await executeRun(reloaded.id)).success, false); }
      catch (error) { assert.equal(error.code, 'RECOVERY_REQUIRED'); }
      assert.deepEqual(writes, ids, 'ambiguous batches never replay');
      assert.equal(awards, 0);
    } else {
      // NOTHING was written — the veto/refusal reached no document and no receipt was retained — so
      // the run this start created goes with the refusal (issue 1648).
      const refused = await start();
      assert.equal(refused.success, false, 'a throw during the start commit is a refusal');
      assert.ok(refused.message, 'and it says something');
      assert.deepEqual(new CraftingRunManager().getActiveRuns(actor), [], 'no run is left behind');
      assert.deepEqual(new CraftingRunManager().getRunHistory(actor), [], 'and none is archived');
      assert.equal(awards, 0);
      assert.equal(source.items.length, 1, 'the refused item is still held');
      assert.deepEqual(writes, ids, 'the vetoed batch is attempted once and never replayed');
    }
  });
}

/**
 * A stack-path guard refusal reaches no database at all, so it is the one failure the engine KNOWS
 * wrote nothing (issue 1648).
 */
test('a definite write refusal abandons its plan instead of demanding recovery', async () => {
  const { engine, recipe, recipeManager, runManager } = setupEngineFixture();
  const actor = new FakeActor('definite');
  const source = new FakeActor('definite-stock');
  const set = new IngredientSet({ id: 'set-1', ingredientGroups: [
    { id: 'only', options: [{ quantity: 1, match: { type: 'component', componentId: 'only' } }] },
  ] });
  recipe.getExecutionSteps = () => [{ id: 'step-1', ingredientSets: [set], resultGroups: [], toolIds: [] }];
  recipeManager.ingredientMatchesItem = (_recipe, option, item) => option.match.componentId === item.id;
  let writes = 0;
  source.items = [{ id: 'only', uuid: `${source.uuid}.Item.only`, parent: source,
    system: { quantity: 2 },
    async delete() { writes += 1; return this; },
    async update() {
      writes += 1;
      const refusal = new Error('the configured stack-quantity path resolves an object');
      refusal.code = 'STACK_QUANTITY_PATH_REFUSED';
      throw refusal;
    },
  }];

  const refused = await startReadyVersionedRun({ engine, recipe, actor, source,
    selectionPlan: { selectedIngredientSetId: set.id } });

  assert.equal(refused.success, false, 'the start refuses rather than throwing recovery');
  assert.equal(writes, 1, 'the refused write was attempted exactly once');
  assert.deepEqual(new CraftingRunManager().getActiveRuns(actor), [], 'and left no run behind');
  assert.equal(source.items[0].system.quantity, 2, 'the stock is untouched');
  assert.equal(runManager.getRunHistory(actor).length, 0);
});

test('abandoning a plan is refused once an effect has applied', () => {
  const planned = transitionExecutionJournal(null, { type: 'plan', plan: {
    operationId: 'op-1', requestId: 'req-1', baseRunRevision: 0, intent: null,
    effects: [{ effectId: 'a', kind: 'consumeIngredients', planned: null },
      { effectId: 'b', kind: 'awardResults', planned: null }],
  } });
  assert.equal(transitionExecutionJournal(planned, { type: 'abandonPlan' }), null);
  const applying = transitionExecutionJournal(planned, { type: 'effectApplying', effectId: 'a' });
  assert.equal(transitionExecutionJournal(applying, { type: 'abandonPlan' }), null,
    'an APPLYING effect that wrote nothing is still abandonable');
  const applied = transitionExecutionJournal(applying, { type: 'effectApplied', effectId: 'a', receipt: null });
  assert.throws(() => transitionExecutionJournal(applied, { type: 'abandonPlan' }),
    (error) => error.code === 'INVALID_EFFECT_TRANSITION');
});

/**
 * D-026 moved the SPEND to stage start; it did not repeal the GM's `consumeIngredientsOnFail`
 * (issue 1648).
 */
for (const consumeIngredientsOnFail of [false, true]) {
  test(`a failed versioned check returns its start-time spend when the policy forbids consumption (policy=${consumeIngredientsOnFail})`, async () => {
    const { engine, recipe, recipeManager, runManager } = setupEngineFixture();
    const actor = new FakeActor('refunded');
    const source = new FakeActor('refund-stock');
    const set = new IngredientSet({ id: 'set-1', ingredientGroups: [
      { id: 'only', options: [{ quantity: 1, match: { type: 'component', componentId: 'ore' } }] },
    ] });
    recipe.getExecutionSteps = () => [{ id: 'step-1', ingredientSets: [set], resultGroups: [], toolIds: [],
      timeRequirement: { minutes: 2 } }];
    recipeManager.ingredientMatchesItem = (_recipe, option, item) => option.match.componentId === item.id;
    source.items = [{ id: 'ore', uuid: `${source.uuid}.Item.ore`, parent: source, name: 'Sun Ore',
      img: 'icons/svg/item-bag.svg', system: { quantity: 1 },
      async delete() { source.items = []; return this; },
    }];
    game.fabricate.getCraftingSystemManager = () => ({ getSystem: () => ({
      id: 'system-1', name: 'Refunds', resolutionMode: 'simple',
      craftingCheck: { consumption: { consumeIngredientsOnFail, breakToolsOnFail: false } },
      components: [{ id: 'ore', name: 'Sun Ore', img: 'icons/svg/item-bag.svg' }],
    }) });
    const restored = [];
    actor.createEmbeddedDocuments = async (_type, data) => {
      restored.push(...data.map((entry) => entry.name));
      return data.map((entry) => ({ ...entry, id: 'restored', parent: actor }));
    };

    const started = await startReadyVersionedRun({ engine, recipe, actor, source,
      selectionPlan: { selectedIngredientSetId: set.id } });
    assert.equal(started.success, true);
    assert.deepEqual(source.items, [], 'the stage spent at start, whatever the failure policy is');

    engine.installVersionedRunAuthority({ consumeExecutionGrant: async () => ({
      operationId: 'fail-execution',
      resolvedCheckResult: { success: false, message: 'Check failed', data: {} },
    }) });
    game.time.worldTime += 600;
    const resolved = await engine.executeVersionedStage({ actor, componentSourceActors: [source],
      runId: started.runId, expectedRevision: runManager.getRun(actor, started.runId).runRevision,
      executionGrant: 'grant', requestId: 'fail-execute' });

    assert.equal(resolved.success, false, 'the check still failed');
    const history = new CraftingRunManager().getRunHistory(actor)[0];
    const refund = history.executionJournal.effects.find(
      (effect) => effect.effectId === 'refund-start-consumption'
    );
    if (consumeIngredientsOnFail) {
      assert.equal(refund, undefined, 'a policy that consumes on failure refunds nothing');
      assert.deepEqual(restored, [], 'and returns nothing to the actor');
      assert.equal(history.steps[0].consumedIngredients.length, 1, 'the spend stays recorded');
    } else {
      assert.equal(refund?.phase, 'applied', 'the refund is a journalled effect of the failure');
      assert.equal(refund.receipt.restoredCount, 1);
      assert.deepEqual(restored, ['Sun Ore'], 'the item is back on the actor');
      assert.deepEqual(history.steps[0].consumedIngredients, [],
        'and the failed stage records no consumption, as the legacy path records none');
    }
  });
}

test('CraftingEngine executes a matured v1 stage with only its trusted check result and commits history evidence', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: context.operation === 'start' ? 'start-operation' : 'execute-operation',
      resolvedCheckResult: {
        success: false,
        message: 'Trusted check failed',
        outcome: 'fail',
        value: 7,
        data: {},
      },
    }),
  });
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });
  game.time.worldTime = 1120;

  const result = await engine.executeVersionedStage({
    actor,
    componentSourceActors: [source],
    runId: started.runId,
    expectedRevision: started.runRevision,
    requestId: 'request-execute',
    executionGrant: 'execute-grant',
  });

  assert.equal(result.success, false);
  assert.equal('message' in result, false);
  assert.equal('results' in result, false);
  assert.equal(result.disposition, 'failed');
  runManager.invalidateCache();
  const history = runManager.getRunHistory(actor);
  assert.equal(history[0].lastCheckResult, undefined);
  assert.equal(history[0].steps[0].lastCheckResult.value, 7);
  assert.equal(history[0].executionJournal.status, 'committed');
  assert.equal(history[0].executionJournal.operationId, 'execute-operation');
  const committedRevision = history[0].runRevision;
  const duplicate = await engine.executeVersionedStage({
    actor,
    componentSourceActors: [source],
    runId: started.runId,
    expectedRevision: started.runRevision,
    requestId: 'request-execute',
    executionGrant: 'duplicate-grant',
  });
  assert.equal(duplicate.runId, started.runId);
  assert.equal(duplicate.runRevision, committedRevision);
  runManager.invalidateCache();
  assert.equal(runManager.getRunHistory(actor)[0].runRevision, committedRevision);
});

test('CraftingEngine persists successful spend receipts before a later award ambiguity', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  let spends = 0;
  const originalPrepare = engine._prepareVersionedStage.bind(engine);
  engine._prepareVersionedStage = async (args) => {
    const prepared = await originalPrepare(args);
    prepared.currencySpends = [{ unit: 'gp', amount: 5 }];
    prepared.plan.currencySpends = prepared.currencySpends;
    return prepared;
  };
  engine._spendCraftCurrencyVersioned = async () => {
    spends += 1;
    return {
      valid: true,
      groups: [{ unit: 'gp', spent: 5 }],
      settledSpends: [{ unit: 'gp', amount: 5 }],
    };
  };
  engine._createResultItems = async () => {
    throw new Error('award acknowledgement lost');
  };
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: context.operation === 'start' ? 'start-operation' : 'execute-operation',
      resolvedCheckResult: { success: true, outcome: null, value: null, data: {} },
    }),
  });
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });
  game.time.worldTime = 1120;

  await assert.rejects(
    () =>
      engine.executeVersionedStage({
        actor,
        componentSourceActors: [source],
        runId: started.runId,
        expectedRevision: started.runRevision,
        requestId: 'request-spend',
        executionGrant: 'execute-grant',
      }),
    (error) => error.code === 'RECOVERY_REQUIRED'
  );

  runManager.invalidateCache(actor.id);
  const run = runManager.getActiveRun(actor, started.runId);
  const award = run.executionJournal.effects.find((effect) => effect.effectId === 'award-results');
  assert.equal(spends, 1);
  // The currency settled at START, so the record the cancel reversal reads is the stage's,
  // not the execute journal's — and the award ambiguity below cannot disturb it.
  assert.deepEqual(run.steps[0].preparedConsumption.currencySpends, [{ unit: 'gp', amount: 5 }]);
  assert.equal(award.phase, 'applying');
  assert.equal(run.executionJournal.status, 'recoveryRequired');

  await assert.rejects(
    () =>
      engine.executeVersionedStage({
        actor,
        componentSourceActors: [source],
        runId: started.runId,
        expectedRevision: run.runRevision,
        requestId: 'request-spend',
        executionGrant: 'retry-grant',
      }),
    (error) => error.code === 'RECOVERY_REQUIRED'
  );
  assert.equal(spends, 1);
});

test('CraftingEngine resumes a real persisted consumption prefix with hydrated production state', async (t) => {
  const previous = globalThis.fromUuid;
  t.after(() => { if (previous === undefined) delete globalThis.fromUuid; else globalThis.fromUuid = previous; });
  const { engine, recipe, runManager } = setupEngineFixture();
  const actor = new FakeActor('resume-crafter');
  installActualRunOutput(actor, recipe, 'tea-result', 'Sun Tea', 'sun-tea.webp');
  const source = new FakeActor('resume-source');
  const consumedItem = {
    id: 'herb-stack',
    uuid: 'Actor.resume-source.Item.herb-stack',
    name: 'Sun Herb',
    img: 'sun-herb.webp',
    type: 'loot',
    system: { quantity: 2 },
    flags: { fabricate: { source: 'test' } },
    parent: source,
    toObject() {
      return {
        _id: this.id,
        name: this.name,
        img: this.img,
        type: this.type,
        system: this.system,
        flags: this.flags,
      };
    },
  };
  source.items = [consumedItem];
  let consumeCalls = 0;
  engine._consumeIngredients = async () => {
    consumeCalls += 1;
    return [
      {
        item: consumedItem,
        quantity: 2,
        ingredient: { componentId: 'herb', quantity: 2 },
      },
    ];
  };
  const selectedSet = recipe.getExecutionSteps()[0].ingredientSets[0];
  const originalPrepare = engine._prepareVersionedStage.bind(engine);
  engine._prepareVersionedStage = async (args) => {
    const prepared = await originalPrepare(args);
    prepared.craftSelection = {
      plan: [
        {
          item: consumedItem,
          quantity: 2,
          ingredient: { componentId: 'herb', quantity: 2 },
        },
      ],
    };
    prepared.plan.items = [
      {
        actorUuid: source.uuid,
        itemUuid: consumedItem.uuid,
        quantity: 2,
        ingredient: { componentId: 'herb', quantity: 2 },
      },
    ];
    return prepared;
  };
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: context.operation === 'start' ? 'start-resume' : 'execute-resume',
      resolvedCheckResult: { success: true, outcome: null, value: null, data: {} },
    }),
  });
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: recipe.id,
    selectionPlan: { selectedIngredientSetId: selectedSet.id },
    executionGrant: 'start-grant',
    requestId: 'start-resume-request',
  });
  game.time.worldTime = 1120;
  const updateJournal = runManager.updateExecutionJournal.bind(runManager);
  let interrupted = false;
  runManager.updateExecutionJournal = async (...args) => {
    const transition = args[2];
    if (
      !interrupted &&
      transition?.type === 'effectApplying' &&
      transition.effectId === 'award-results'
    ) {
      interrupted = true;
      throw new Error('simulated process stop between effects');
    }
    return updateJournal(...args);
  };

  await assert.rejects(
    () =>
      engine.executeVersionedStage({
        actor,
        componentSourceActors: [source],
        runId: started.runId,
        expectedRevision: started.runRevision,
        requestId: 'execute-resume-request',
        executionGrant: 'execute-grant',
      }),
    /simulated process stop/
  );
  runManager.invalidateCache(actor.id);
  const interruptedRun = runManager.getActiveRun(actor, started.runId);
  const consumedSnapshots = interruptedRun.steps[0].preparedConsumption.consumedSnapshots;
  assert.equal(consumedSnapshots[0].data.name, 'Sun Herb');
  assert.deepEqual(consumedSnapshots[0].ingredient, { componentId: 'herb', quantity: 2 });

  source.items = [];
  const freshManager = new CraftingRunManager();
  const resumedEngine = new CraftingEngine(engine.recipeManager, freshManager);
  let hydratedConsumed = null;
  resumedEngine._consumeIngredients = async () => {
    throw new Error('applied consumption must not repeat');
  };
  const createResults = resumedEngine._createResultItems.bind(resumedEngine);
  resumedEngine._createResultItems = async (...args) => {
    hydratedConsumed = args[4];
    return createResults(...args);
  };
  resumedEngine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({
      operationId: 'execute-resume',
      resolvedCheckResult: { success: true, outcome: null, value: null, data: {} },
    }),
  });

  const resumed = await resumedEngine.executeVersionedStage({
    actor,
    componentSourceActors: [source],
    runId: started.runId,
    expectedRevision: interruptedRun.runRevision,
    requestId: 'execute-resume-request',
    executionGrant: 'resume-grant',
  });

  assert.equal(resumed.success, true);
  assert.equal(consumeCalls, 1);
  assert.equal(hydratedConsumed[0].item.name, 'Sun Herb');
  assert.deepEqual(hydratedConsumed[0].ingredient, { componentId: 'herb', quantity: 2 });
  freshManager.invalidateCache(actor.id);
  const completed = freshManager.getRunHistory(actor)[0];
  assert.equal(completed.executionJournal.status, 'committed');
  assert.deepEqual(completed.steps[0].createdResults, [
    {
      actorUuid: actor.uuid,
      itemUuid: 'Actor.resume-crafter.Item.tea-result',
      quantity: 1,
      name: 'Sun Tea',
      img: 'sun-tea.webp',
      componentId: null,
      resultRowId: 'output:tea-result:0',
      sourceItemUuid: 'Item.tea-result',
    },
  ]);

  let awardCalls = 0;
  let recordedRecipeUses = 0;
  game.fabricate.getRecipeVisibilityService = () => ({
    guardCraftStart: ({ viewer }) => ({ craftable: Boolean(viewer) }),
    applyRecipeItemUseOnCraft: async () => {
      recordedRecipeUses += 1;
    },
    learnRecipeOnCraft: async () => {},
  });
  resumedEngine._prepareVersionedStage = async () => ({
    valid: true,
    plan: {
      recipeId: recipe.id,
      stepId: 'step-1',
      selectedIngredientSetId: selectedSet.id,
      items: [],
      currencySpends: [],
      toolItemUuids: [],
    },
    toolItems: [],
    executionRecipe: resumedEngine._buildStepRecipeView(recipe, recipe.getExecutionSteps()[0]),
    craftSelection: { plan: [] },
    toolValidation: { valid: true, tools: [] },
    currencySpends: [],
    resolveComponent: undefined,
    step: recipe.getExecutionSteps()[0],
    selectedSet,
  });
  resumedEngine._consumeIngredients = async () => [];
  installActualRunOutput(actor, recipe, 'final-result', 'Final Tea', 'final-tea.webp');
  resumedEngine._createResultItems = async (...args) => {
    awardCalls += 1;
    return createResults(...args);
  };
  resumedEngine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: context.operation === 'start' ? 'start-final' : 'execute-final',
      resolvedCheckResult: { success: true, outcome: null, value: null, data: {} },
    }),
  });
  const finalizing = await resumedEngine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: recipe.id,
    selectionPlan: { selectedIngredientSetId: selectedSet.id },
    executionGrant: 'start-final-grant',
    requestId: 'start-final-request',
  });
  game.time.worldTime += 120;
  const freshUpdateJournal = freshManager.updateExecutionJournal.bind(freshManager);
  freshManager.updateExecutionJournal = async (...args) => {
    const transition = args[2];
    if (transition?.type === 'effectApplying' && transition.effectId === 'record-recipe-use') {
      throw new Error('simulated process stop after finalization');
    }
    return freshUpdateJournal(...args);
  };

  await assert.rejects(
    () =>
      resumedEngine.executeVersionedStage({
        actor,
        componentSourceActors: [source],
        runId: finalizing.runId,
        expectedRevision: finalizing.runRevision,
        requestId: 'execute-final-request',
        executionGrant: 'execute-final-grant',
      }),
    /simulated process stop after finalization/
  );
  freshManager.invalidateCache(actor.id);
  const finalizedPrefix = freshManager.getRun(actor, finalizing.runId);
  assert.equal(finalizedPrefix.currentStepIndex, null);
  assert.equal(finalizedPrefix.executionJournal.status, 'planned');
  assert.equal(
    finalizedPrefix.executionJournal.effects.find((effect) => effect.effectId === 'finalize-stage')
      .phase,
    'applied'
  );

  const finalManager = new CraftingRunManager();
  const finalEngine = new CraftingEngine(engine.recipeManager, finalManager);
  finalEngine._createResultItems = async () => {
    throw new Error('applied award must not repeat after finalization');
  };
  finalEngine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({
      operationId: 'execute-final',
      resolvedCheckResult: { success: true, outcome: null, value: null, data: {} },
    }),
  });
  const finalized = await finalEngine.executeVersionedStage({
    actor,
    componentSourceActors: [source],
    runId: finalizing.runId,
    expectedRevision: finalizedPrefix.runRevision,
    requestId: 'execute-final-request',
    executionGrant: 'resume-final-grant',
  });

  assert.equal(finalized.success, true);
  assert.equal(awardCalls, 1);
  assert.equal(recordedRecipeUses, 1);
  finalManager.invalidateCache(actor.id);
  assert.equal(finalManager.getRun(actor, finalizing.runId).executionJournal.status, 'committed');
});

test('CraftingEngine journals a recipe-less fizzle and does not consume it twice', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('alchemist');
  const source = new FakeActor('source');
  let deletes = 0;
  const item = {
    uuid: 'Actor.source.Item.herb',
    parent: source,
    system: { quantity: 1 },
    delete: async () => {
      deletes += 1;
      source.items = [];
      return item;
    },
  };
  source.items = [item];
  game.fabricate.getCraftingSystemManager = () => ({
    getSystem: () => ({
      id: 'alchemy-system',
      resolutionMode: 'alchemy',
      alchemy: { consumeOnFail: true, showAttemptHistoryToPlayers: false },
      components: [],
    }),
  });
  engine._matchAlchemySignature = () => ({ matched: false });
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'fizzle-operation' }),
  });
  const request = {
    actor,
    sourceActors: [source],
    craftingSystemId: 'alchemy-system',
    submittedItems: [{ item, componentId: 'herb' }],
    executionGrant: 'fizzle-grant',
    requestId: 'fizzle-request',
  };

  const result = await engine.executeVersionedAlchemyFizzle(request);
  const duplicate = await engine.executeVersionedAlchemyFizzle(request);

  assert.equal(result.disposition, 'no-match');
  assert.equal(result.consumed, true);
  assert.equal(duplicate.runId, result.runId);
  assert.equal(deletes, 1);
  runManager.invalidateCache(actor.id);
  assert.equal(runManager.getRunHistory(actor)[0].executionJournal.status, 'committed');
});

test('CraftingEngine records a non-consuming fizzle without touching submitted stock', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('careful-alchemist');
  const source = new FakeActor('source');
  let deletes = 0;
  const item = {
    uuid: 'Actor.source.Item.herb',
    parent: source,
    system: { quantity: 1 },
    delete: async () => (deletes += 1),
  };
  source.items = [item];
  game.fabricate.getCraftingSystemManager = () => ({
    getSystem: () => ({
      id: 'alchemy-system',
      resolutionMode: 'alchemy',
      alchemy: { consumeOnFail: false, showAttemptHistoryToPlayers: false },
      components: [],
    }),
  });
  engine._matchAlchemySignature = () => ({ matched: false });
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'fizzle-operation' }),
  });

  const result = await engine.executeVersionedAlchemyFizzle({
    actor,
    sourceActors: [source],
    craftingSystemId: 'alchemy-system',
    submittedItems: [{ item, componentId: 'herb' }],
    executionGrant: 'fizzle-grant',
    requestId: 'non-consuming-fizzle',
  });

  assert.equal(result.consumed, false);
  assert.equal(deletes, 0);
  runManager.invalidateCache(actor.id);
  assert.deepEqual(
    runManager.getRunHistory(actor)[0].executionJournal.effects.map((effect) => effect.kind),
    ['recordAlchemyDeadEnd', 'awardResults']
  );
});

test('CraftingEngine check preflight is read-only and a missing trusted result writes no journal', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  actor.name = 'Tinker';
  const source = new FakeActor('source');
  const expectedSpeaker = {
    scene: 'scene-1',
    token: 'token-crafter',
    actor: actor.id,
    alias: actor.name,
  };
  const originalChatMessage = globalThis.ChatMessage;
  globalThis.ChatMessage = {
    getSpeaker: ({ actor: speakerActor }) => ({
      scene: 'scene-1',
      token: 'token-crafter',
      actor: speakerActor.id,
      alias: speakerActor.name,
    }),
  };
  const system = {
    resolutionMode: 'simple',
    features: { craftingChecks: true },
    craftingCheck: {
      simple: {
        rollFormula: '1d20 + 3', dc: 12,
        evaluation: { product: 'count', direction: 'under', pool: { required: 3 } },
      },
    },
  };
  game.fabricate.getCraftingSystemManager = () => ({ getSystem: () => system });
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: `${context.operation}-operation`,
    }),
  });
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });
  // A check is describable only once every other stage requirement is met, elapsed time
  // included, so the preflight runs against a matured gate.
  game.time.worldTime = 1120;

  try {
    const descriptor = await engine.describeVersionedStageCheck({
      actor,
      componentSourceActors: [source],
      runId: started.runId,
      preparationGrant: 'prepare-grant',
    });
    assert.deepEqual(descriptor.publicPrompt, {
      label: 'Sun Tea',
      activity: 'Crafting',
      subject: 'Sun Tea',
      actorName: 'Tinker',
      img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp',
      formula: '1d20 + 3',
      resolvedFormula: null,
      target: 12,
      comparison: 'meet',
      selectedModifiers: [],
      mode: 'simple',
      allowsSituationalModifier: true,
      allowAdvantage: true,
      modifierChoice: null,
    });
    assert.equal(descriptor.privateEvaluation.rollFormula, '1d20 + 3');
    assert.equal(descriptor.privateEvaluation.actorUuid, actor.uuid);
    assert.equal(descriptor.privateEvaluation.decisionPolicy.dc, 12);
    assert.deepEqual(descriptor.privateEvaluation.speaker, expectedSpeaker);
    assert.equal(descriptor.privateEvaluation.flavor, 'Sun Tea — Crafting check (DC 12)');
    assert.deepEqual(descriptor.privateEvaluation.checkConfig.evaluation, {
      product: 'count', direction: 'under', pool: { required: 3 },
    });
    system.craftingCheck.simple.evaluation.pool.required = 12;
    assert.equal(descriptor.privateEvaluation.checkConfig.evaluation.pool.required, 3);

    const originalRoll = globalThis.Roll;
    const posts = [];
    class PreparedRoll {
      constructor(formula) {
        this.formula = formula;
        this.total = 15;
        this.dice = [];
      }
      async evaluate() {
        return this;
      }
      toJSON() {
        return { formula: this.formula, total: this.total, terms: [] };
      }
    }
    class ReconstructedRoll {
      static fromData(data) {
        assert.equal(data.formula, '1d20 + 3');
        return new ReconstructedRoll();
      }
      async toMessage(messageData, options) {
        posts.push({ messageData, options });
      }
    }
    globalThis.Roll = PreparedRoll;
    try {
      const privateEvaluation = JSON.parse(JSON.stringify(descriptor.privateEvaluation));
      const evaluated = await evaluatePreparedRunCheck(privateEvaluation, actor);
      assert.deepEqual(
        Object.fromEntries(['product', 'direction', 'comparison', 'target', 'margin', 'successes', 'cancelled']
          .map((key) => [key, evaluated.data[key]])),
        { product: 'sum', direction: 'over', comparison: 'meet', target: 12, margin: 3,
          successes: null, cancelled: null }
      );
      const handoff = JSON.parse(JSON.stringify(evaluated.rollHandoff));
      const posted = await postCheckRollHandoff(handoff, { Roll: ReconstructedRoll });
      assert.equal(posted.success, true);
      assert.deepEqual(posts[0].messageData.speaker, expectedSpeaker);
      assert.equal(posts[0].messageData.flavor, 'Sun Tea — Crafting check (DC 12)');
    } finally {
      if (originalRoll === undefined) delete globalThis.Roll;
      else globalThis.Roll = originalRoll;
    }
  } finally {
    if (originalChatMessage === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = originalChatMessage;
  }

  game.time.worldTime = 1120;
  await assert.rejects(
    () =>
      engine.executeVersionedStage({
        actor,
        componentSourceActors: [source],
        runId: started.runId,
        expectedRevision: started.runRevision,
        executionGrant: 'execute-grant',
      }),
    (error) => error.code === 'CHECK_RESULT_REQUIRED'
  );
  runManager.invalidateCache();
  const unchanged = runManager.getActiveRun(actor, started.runId);
  assert.equal(unchanged.runRevision, started.runRevision);
  // The start committed its own journal; the refused execute neither planned nor changed one.
  assert.equal(unchanged.executionJournal.status, 'committed');
  assert.equal(unchanged.executionJournal.intent.trigger, 'start');
});

test('versioned Journal preparation freezes modifier contributions across actor and library edits', async () => {
  const originalRoll = globalThis.Roll;
  const rolledFormulas = [];
  class PreparedModifierRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 17;
      this.dice = [];
    }
    static replaceFormulaData(formula, data, { missing = '0' } = {}) {
      return formula.replace(/@([\w.]+)/g, (_match, path) => {
        const value = path.split('.').reduce((entry, key) => entry?.[key], data);
        return value === undefined ? missing : String(value);
      });
    }
    static validate() { return true; }
    evaluateSync() { return this; }
    async evaluate() {
      rolledFormulas.push(this.formula);
      return this;
    }
    toJSON() { return { formula: this.formula, total: this.total, terms: [] }; }
  }
  globalThis.Roll = PreparedModifierRoll;
  try {
    for (const policy of ['addAll', 'playerPicks']) {
      const { engine, recipe } = setupEngineFixture();
      let toolAppendCalls = 0;
      engine._appendToolCheckBonuses = async (formula) => {
        toolAppendCalls += 1;
        return `${formula} + 2[Tool]`;
      };
      const actor = new FakeActor(`journal-${policy}`);
      actor.name = 'Tinker';
      actor.system = { focus: 3, spark: 1 };
      actor.getRollData = () => actor.system;
      const system = {
        resolutionMode: 'simple',
        craftingCheck: {
          simple: { rollFormula: '1d20', dc: 12 },
          defaultModifierPolicy: policy,
          defaultModifierIds: ['focus', 'spark'],
          maxModifierPicks: 2,
        },
        modifiers: [
          { id: 'focus', label: 'Focus', expression: '@focus' },
          { id: 'spark', label: 'Spark', expression: '1d4+@spark' },
        ],
      };
      game.fabricate.getCraftingSystemManager = () => ({ getSystem: () => system });
      const source = new FakeActor('source');
      const started = await startReadyVersionedRun({
        engine, recipe, actor, source,
      });
      game.time.worldTime = 1120;
      const descriptor = await engine.describeVersionedStageCheck({
        actor, componentSourceActors: [source], runId: started.runId,
        preparationGrant: 'prepare-grant',
      });
      assert.equal(descriptor.publicPrompt.actorName, 'Tinker');
      assert.equal(descriptor.publicPrompt.subject, 'Sun Tea');
      assert.equal(descriptor.publicPrompt.target, 12);
      assert.equal(descriptor.publicPrompt.comparison, 'meet');
      assert.equal(toolAppendCalls, 1);
      assert.equal(descriptor.privateEvaluation.rollFormula, '1d20 + 2[Tool]');
      assert.ok(!Object.hasOwn(descriptor.publicPrompt, 'checkConfig'));
      if (policy === 'playerPicks') {
        assert.deepEqual(descriptor.publicPrompt.selectedModifiers, []);
        assert.deepEqual(descriptor.publicPrompt.modifierChoice.modifiers.map(({ id }) => id), ['focus', 'spark']);
        assert.ok(!Object.hasOwn(descriptor.publicPrompt.modifierChoice.modifiers[1], 'formula'));
      } else {
        assert.equal(descriptor.publicPrompt.formula, '1d20 + 2[Tool] + 3[Modifiers] + (1d4+1)[Modifiers]');
        assert.deepEqual(descriptor.publicPrompt.selectedModifiers.map(({ label, display }) => ({ label, display })), [
          { label: 'Focus', display: '+3' },
          { label: 'Spark', display: '+1d4+1' },
        ]);
      }
      actor.system.focus = 9;
      actor.system.spark = 8;
      system.modifiers[0].expression = '77';
      system.modifiers[1].expression = '8d8';
      const decision = policy === 'playerPicks' ? { modifierIds: ['focus', 'spark'] } : {};
      const evaluated = await evaluatePreparedRunCheck(
        JSON.parse(JSON.stringify(descriptor.privateEvaluation)), actor, decision
      );
      assert.equal(evaluated.success, true);
      assert.equal(rolledFormulas.at(-1), '1d20 + 2[Tool] + 3[Modifiers] + (1d4+1)[Modifiers]');
    }
  } finally {
    if (originalRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = originalRoll;
  }
});

test('versioned Journal prompts keep routed and progressive targets private', async () => {
  for (const mode of ['routedByCheck', 'progressive']) {
    const { engine, recipe } = setupEngineFixture();
    const actor = new FakeActor(`journal-${mode}`);
    const system = {
      resolutionMode: mode,
      craftingCheck: {
        routed: { rollFormula: '1d20', type: 'relative', dc: 12,
          relativeOutcomes: [{ id: 'pass', name: 'Pass', dc: 0 }] },
        progressive: { rollFormula: '1d20' },
      },
    };
    game.fabricate.getCraftingSystemManager = () => ({ getSystem: () => system });
    const source = new FakeActor('source');
    const started = await startReadyVersionedRun({
      engine, recipe, actor, source,
    });
    game.time.worldTime = 1120;
    const descriptor = await engine.describeVersionedStageCheck({
      actor, componentSourceActors: [source], runId: started.runId,
      preparationGrant: 'prepare-grant',
    });
    assert.equal(descriptor.publicPrompt.target, null);
    assert.equal(descriptor.publicPrompt.comparison, null);
    if (mode === 'routedByCheck') assert.equal(descriptor.privateEvaluation.decisionPolicy.dc, 12);
  }
});

test('CraftingEngine world-time execution keeps an input stage blocked with zero journal effects', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({
      operationId: 'operation',
      resolvedCheckResult: { success: true, outcome: null, value: null, data: {} },
    }),
  });
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    completionMode: 'worldTime',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });
  game.time.worldTime = 1120;

  const blocked = await engine.executeVersionedStage({
    actor,
    componentSourceActors: [source],
    runId: started.runId,
    expectedRevision: started.runRevision,
    trigger: 'worldTime',
    executionGrant: 'execute-grant',
  });

  assert.equal(blocked.automaticBlocked, true);
  assert.equal(blocked.blocker, 'materials');
  runManager.invalidateCache();
  // The only journal is the START's, committed; the refused automatic execute planned nothing.
  const journal = runManager.getActiveRun(actor, started.runId).executionJournal;
  assert.equal(journal.status, 'committed');
  assert.deepEqual(journal.intent, { stepIndex: 0, recipeId: 'recipe-1', trigger: 'start' });
});

test('CraftingEngine delegates due world-time runs to authority without pre-mutating revisions', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('auto-crafter');
  const source = new FakeActor('auto-source');
  game.actors = [actor];
  const requests = [];
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'start-operation' }),
    requestExecute: async (request) => {
      requests.push(request);
      return { queued: true };
    },
  });
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    completionMode: 'worldTime',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });

  const results = await engine.processVersionedWorldTime({ worldTime: 1120 });

  assert.deepEqual(results, [{ queued: true }]);
  assert.equal(requests[0].runId, started.runId);
  assert.equal(requests[0].expectedRevision, started.runRevision);
  assert.equal(requests[0].trigger, 'worldTime');
  runManager.invalidateCache(actor.id);
  assert.equal(runManager.getActiveRun(actor, started.runId).runRevision, started.runRevision);
  assert.equal(runManager.getActiveRun(actor, started.runId).status, 'waitingTime');
});

test('CraftingEngine bounds world-time jump continuation by the remaining finite stage count', async () => {
  const requests = [];
  const engine = new CraftingEngine();
  engine.craftingRunManager = {
    listDueVersionedRuns: () => [
      {
        actor: { id: 'actor-1' },
        runId: 'run-1',
        expectedRevision: 4,
        componentSourceActorUuids: ['Actor.source'],
        maximumAttempts: 3,
      },
    ],
  };
  engine.installVersionedRunAuthority({
    requestExecute: async (request) => {
      requests.push(request);
      return {
        success: true,
        runId: request.runId,
        status: 'inProgress',
        runRevision: request.expectedRevision + 1,
        terminal: false,
      };
    },
  });

  const results = await engine.processVersionedWorldTime({ worldTime: 5000 });

  assert.deepEqual(
    requests.map((request) => request.expectedRevision),
    [4, 5, 6]
  );
  assert.equal(results.length, 3);
  assert.equal(requests.every((request) => request.trigger === 'worldTime'), true);
});
