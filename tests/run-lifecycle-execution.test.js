import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CraftingLifecycleExecutionError,
  CraftingLifecycleExecutor,
} from '../src/systems/CraftingLifecycleExecutor.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { transitionExecutionJournal } from '../src/systems/runExecutionJournal.js';

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
    this.flags[namespace][key] = value;
    return value;
  }
}

function setupEngineFixture() {
  let id = 0;
  globalThis.foundry = { utils: { randomID: () => `run-${++id}` } };
  globalThis.game = {
    user: { id: 'user-1' },
    time: { worldTime: 1000 },
    actors: [],
    fabricate: {},
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
  return { engine, recipe, runManager };
}

test('CraftingEngine versioned start arms a timed stage with exact intent and zero consumption', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  let deletes = 0;
  source.items = [{ id: 'herb', delete: async () => (deletes += 1) }];
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'start-operation' }),
  });

  const started = await engine.startVersionedRun({
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
  assert.equal(deletes, 0);
  runManager.invalidateCache();
  const persisted = runManager.getActiveRun(actor, started.run.id);
  assert.equal(persisted.lifecycleVersion, 1);
  assert.equal(persisted.completionMode, 'worldTime');
  assert.equal(persisted.steps[0].preparedConsumption, undefined);
  assert.equal(persisted.steps[0].selectionPlan.selectedIngredientSetId, 'set-1');
  assert.deepEqual(persisted.steps[0].selectedRequirementSnapshot.ingredients[3], {
    currency: { unit: 'gp', amount: 5 },
  });
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
    actor,
    sourceActors: [source],
    recipeId: recipe.id,
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'grant',
  });
  const cancelled = await engine.cancelCraft(actor, [source], started.run.id);
  assert.equal(cancelled.requested, true);
  assert.deepEqual(calls, [
    ['start', 'recipe-1'],
    ['cancel', started.run.id, started.run.runRevision],
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

test('CraftingEngine local v1 cancellation forfeits deferred work without reversing legacy inputs', async () => {
  const { engine } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  let itemWrites = 0;
  source.createEmbeddedDocuments = async () => (itemWrites += 1);
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'cancel-operation' }),
  });
  const started = await engine.startVersionedRun({
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });

  const cancelled = await engine.cancelVersionedRun({
    actor,
    componentSourceActors: [source],
    runId: started.run.id,
    expectedRevision: started.run.runRevision,
    executionGrant: 'cancel-grant',
  });

  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.refunded, false);
  assert.equal(itemWrites, 0);
});

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
    runId: started.run.id,
    expectedRevision: started.run.runRevision,
    requestId: 'request-execute',
    executionGrant: 'execute-grant',
  });

  assert.equal(result.success, false);
  assert.equal(result.message, 'Trusted check failed');
  runManager.invalidateCache();
  const history = runManager.getRunHistory(actor);
  assert.equal(history[0].lastCheckResult, undefined);
  assert.equal(history[0].steps[0].lastCheckResult.value, 7);
  assert.equal(history[0].executionJournal.status, 'committed');
  assert.equal(history[0].executionJournal.operationId, 'execute-operation');
});

test('CraftingEngine check preflight is read-only and a missing trusted result writes no journal', async () => {
  const { engine, runManager } = setupEngineFixture();
  const actor = new FakeActor('crafter');
  const source = new FakeActor('source');
  game.fabricate.getCraftingSystemManager = () => ({
    getSystem: () => ({
      resolutionMode: 'simple',
      features: { craftingChecks: true },
      craftingCheck: { simple: { rollFormula: '1d20 + 3', dc: 12 } },
    }),
  });
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: `${context.operation}-operation`,
    }),
  });
  const started = await engine.startVersionedRun({
    actor,
    sourceActors: [source],
    recipeId: 'recipe-1',
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });

  const descriptor = await engine.describeVersionedStageCheck({
    actor,
    componentSourceActors: [source],
    runId: started.run.id,
    preparationGrant: 'prepare-grant',
  });
  assert.deepEqual(descriptor.publicPrompt, {
    label: 'Sun Tea',
    mode: 'simple',
    allowsSituationalModifier: true,
    allowAdvantage: true,
    modifierChoice: null,
  });
  assert.equal(descriptor.privateEvaluation.rollFormula, '1d20 + 3');
  assert.equal(descriptor.privateEvaluation.actorUuid, actor.uuid);
  assert.equal(descriptor.privateEvaluation.decisionPolicy.dc, 12);

  game.time.worldTime = 1120;
  await assert.rejects(
    () =>
      engine.executeVersionedStage({
        actor,
        componentSourceActors: [source],
        runId: started.run.id,
        expectedRevision: started.run.runRevision,
        executionGrant: 'execute-grant',
      }),
    (error) => error.code === 'CHECK_RESULT_REQUIRED'
  );
  runManager.invalidateCache();
  const unchanged = runManager.getActiveRun(actor, started.run.id);
  assert.equal(unchanged.runRevision, started.run.runRevision);
  assert.equal(unchanged.executionJournal, undefined);
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
    runId: started.run.id,
    expectedRevision: started.run.runRevision,
    trigger: 'worldTime',
    executionGrant: 'execute-grant',
  });

  assert.equal(blocked.automaticBlocked, true);
  assert.equal(blocked.blocker, 'materials');
  runManager.invalidateCache();
  assert.equal(runManager.getActiveRun(actor, started.run.id).executionJournal, undefined);
});
