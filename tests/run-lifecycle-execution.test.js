import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CraftingLifecycleExecutionError,
  CraftingLifecycleExecutor,
} from '../src/systems/CraftingLifecycleExecutor.js';
import { CraftingFizzleExecutor } from '../src/systems/CraftingFizzleExecutor.js';
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
  const persisted = runManager.getActiveRun(actor, started.runId);
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
    runId: started.runId,
    expectedRevision: started.runRevision,
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
  const spend = run.executionJournal.effects.find((effect) => effect.effectId === 'spend-currency');
  const award = run.executionJournal.effects.find((effect) => effect.effectId === 'award-results');
  assert.equal(spends, 1);
  assert.deepEqual(spend.receipt.settledSpends, [{ unit: 'gp', amount: 5 }]);
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
    ['recordAlchemyDeadEnd']
  );
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
    runId: started.runId,
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
        runId: started.runId,
        expectedRevision: started.runRevision,
        executionGrant: 'execute-grant',
      }),
    (error) => error.code === 'CHECK_RESULT_REQUIRED'
  );
  runManager.invalidateCache();
  const unchanged = runManager.getActiveRun(actor, started.runId);
  assert.equal(unchanged.runRevision, started.runRevision);
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
    runId: started.runId,
    expectedRevision: started.runRevision,
    trigger: 'worldTime',
    executionGrant: 'execute-grant',
  });

  assert.equal(blocked.automaticBlocked, true);
  assert.equal(blocked.blocker, 'materials');
  runManager.invalidateCache();
  assert.equal(runManager.getActiveRun(actor, started.runId).executionJournal, undefined);
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
