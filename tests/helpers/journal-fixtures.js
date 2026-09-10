// Shared RunModel fixtures for the Journal mounted-component tests. Centralized
// so the run-card / run-detail / journal-view suites build runs from one factory
// instead of pasting model literals (keeps new test code under the SonarCloud
// duplication budget).

/**
 * A crafting RunModel. By default it is a 2-step run gated on world time
 * (`waiting`), with a fully-populated current step detail.
 */
export function makeCraftingRun(overrides = {}) {
  const steps = overrides.steps ?? [
    {
      stepId: 's1',
      stepName: 'Brew',
      index: 0,
      status: 'waitingTime',
      timeGate: { availableAt: 1000, initiatedAt: 0, requiredSeconds: 1000 },
      detail: {
        requiredSeconds: 1000,
        primaryToolName: 'Mortar & Pestle',
        toolNames: ['Mortar & Pestle'],
        checkLabel: '1d20 vs DC 12',
        failureText: null
      },
      lastCheckResult: null
    },
    {
      stepId: 's2',
      stepName: 'Bottle',
      index: 1,
      status: 'pending',
      timeGate: null,
      detail: { requiredSeconds: null, primaryToolName: null, toolNames: [], checkLabel: null, failureText: null },
      lastCheckResult: null
    }
  ];
  return {
    id: 'run-craft-1',
    key: JSON.stringify(['Actor.actor-1', 'crafting', 'run-craft-1']),
    actorUuid: 'Actor.actor-1',
    runType: 'crafting',
    activityKind: 'crafting',
    lifecycleContract: 'legacy',
    lifecycleVersion: null,
    runRevision: 0,
    completionMode: 'manual',
    pauseState: null,
    pausedDurationSeconds: 0,
    status: 'waitingTime',
    derivedStatus: 'waiting',
    craftingSystemId: 'sys-1',
    craftingSystemName: 'Alchemy',
    names: { title: 'Healing Potion', subtitle: 'Alchemy' },
    redacted: false,
    img: 'icons/svg/item-bag.svg',
    stepIndex: 0,
    stepCount: steps.length,
    multiStep: true,
    isFinalStep: false,
    stepLabel: 'Step 1 of 2',
    steps,
    currentStep: steps[0],
    timeGate: steps[0]?.timeGate ?? null,
    startedAt: 100,
    updatedAt: 100,
    finishedAt: null,
    structureLabel: 'Multi-Step Recipe',
    resolutionModeLabel: 'Standard (DC)',
    recipeId: 'r1',
    taskId: null,
    flavor: '',
    failureReason: null,
    createdResults: [],
    createdResultCount: 0,
    manualAdvance: true,
    actions: {
      execute: true,
      pause: false,
      resume: false,
      setCompletionMode: false,
      setSelection: false,
      cancel: true,
      dismiss: false,
      disabledReason: null,
    },
    ...overrides
  };
}

/** A gathering RunModel (auto-resolve, no steps). */
export function makeGatheringRun(overrides = {}) {
  return {
    id: 'run-gather-1',
    key: JSON.stringify(['Actor.actor-1', 'gathering', 'run-gather-1']),
    actorUuid: 'Actor.actor-1',
    runType: 'gathering',
    activityKind: 'gathering',
    lifecycleContract: 'legacy',
    lifecycleVersion: null,
    runRevision: 0,
    completionMode: 'manual',
    pauseState: null,
    pausedDurationSeconds: 0,
    status: 'inProgress',
    derivedStatus: 'waiting',
    craftingSystemId: 'sys-1',
    craftingSystemName: 'Wilds',
    names: { title: 'Forage Herbs', subtitle: 'Wilds' },
    redacted: false,
    img: 'icons/svg/item-bag.svg',
    stepIndex: null,
    stepCount: 0,
    multiStep: false,
    isFinalStep: false,
    stepLabel: '',
    steps: [],
    currentStep: null,
    timeGate: { availableAt: 5000, initiatedAt: 0, requiredSeconds: 5000 },
    startedAt: 100,
    updatedAt: 100,
    finishedAt: null,
    structureLabel: '',
    resolutionModeLabel: '',
    gatheringYield: null,
    recipeId: null,
    taskId: 'task-1',
    flavor: '',
    failureReason: null,
    createdResults: [],
    createdResultCount: 0,
    manualAdvance: false,
    actions: {
      execute: false,
      pause: false,
      resume: false,
      setCompletionMode: false,
      setSelection: false,
      cancel: false,
      dismiss: false,
      disabledReason: null,
    },
    ...overrides
  };
}

/** A succeeded terminal crafting RunModel carrying created results. */
export function makeSucceededRun(overrides = {}) {
  return makeCraftingRun({
    id: 'run-done-1',
    status: 'succeeded',
    derivedStatus: 'succeeded',
    names: { title: 'Healing Potion', subtitle: 'Alchemy' },
    timeGate: null,
    finishedAt: 4000,
    createdResults: [{ componentId: 'c1', itemUuid: 'Item.x', quantity: 3, name: 'Healing Potion', img: 'icons/svg/item-bag.svg' }],
    createdResultCount: 1,
    ...overrides
  });
}

/**
 * Execute the real versioned engine, serialize actor flags, reload a fresh manager,
 * and project the result. No proposed historical fields are supplied by this fixture.
 * Item documents, the currency settlement adapter and authority are test doubles;
 * consumption, essence capture, stage finalization, persistence and projection are real.
 * Dynamic imports keep the existing lightweight mounted fixtures lightweight.
 */
export async function createPersistedCraftingHistory({
  failLast = false, cancelAfter = null, armNext = false, opaque = false,
  resumePrefix = false, stageCount = 2, mode = 'simple', checked = true,
} = {}) {
  const { CraftingEngine } = await import('../../src/systems/CraftingEngine.js');
  const { CraftingRunManager } = await import('../../src/systems/CraftingRunManager.js');
  const { RunJournalBuilder } = await import('../../src/systems/RunJournalBuilder.js');
  const { IngredientSet } = await import('../../src/models/IngredientSet.js');
  const saved = { game: globalThis.game, foundry: globalThis.foundry };
  let sequence = 0;
  const viewer = { id: 'history-player', isGM: false };
  const gm = { id: 'history-gm', isGM: true };
  const actor = historyActor('crafter');
  const sources = [historyActor('source-a'), historyActor('source-b')];
  const items = sources.map((source, index) => historyItem(source, index));
  const system = {
    id: 'history-system', name: 'Recorded crafting', resolutionMode: mode,
    features: { multiStepRecipes: true, essences: true },
    craftingCheck: { simple: { rollFormula: checked ? '1d20' : '' } },
    essences: [{ id: 'sun', name: 'Sun' }, { id: 'moon', name: 'Moon' }],
    components: [],
  };
  const set = new IngredientSet({ id: 'route', name: 'Recorded route',
    ingredientGroups: [{ id: 'sun', options: [{ match: { type: 'essence', essenceId: 'sun', amount: 4 } }] },
      { id: 'moon', options: [{ match: { type: 'essence', essenceId: 'moon', amount: 6 } }] }],
  });
  const emptySet = new IngredientSet({ id: 'next-route', name: 'Next route', ingredientGroups: [] });
  const steps = Array.from({ length: stageCount }, (_, index) => ({
    id: `stage-${index}`, name: `Stage ${index + 1}`, description: `Purpose ${index + 1}`,
    ingredientSets: [index === 0 ? set : emptySet], resultGroups: [], toolIds: [], timeRequirement: { minutes: 1 },
  }));
  const recipe = { id: 'historical-recipe', name: 'Recorded tonic', craftingSystemId: system.id,
    getExecutionSteps: () => steps, validate: () => ({ valid: true, errors: [] }) };
  const visibility = {
    applyRecipeItemUseOnCraft: async () => {},
    learnRecipeOnCraft: async () => {},
    guardCraftStart: () => ({ craftable: true }),
    evaluateRecipeAccess: ({ viewer: candidate }) => ({ visible: !opaque || candidate?.isGM === true }),
  };
  let manager = new CraftingRunManager();
  const recipeManager = { getRecipe: () => recipe, canCraft: () => ({ canCraft: true }), getToolsForSet: () => [] };
  const configure = () => {
    const engine = new CraftingEngine(recipeManager, manager);
    engine.installVersionedRunAuthority({ consumeExecutionGrant: async (_grant, context) => ({
      operationId: `operation-${context.requestId}`,
      resolvedCheckResult: { success: !(failLast && manager.getActiveRuns(actor)[0]?.currentStepIndex === stageCount - 1),
        value: checked ? 17 : null, data: checked ? { formula: '1d20', total: 17, dc: 12 } : {} },
    }) });
    const prepare = engine._prepareVersionedStage.bind(engine);
    engine._prepareVersionedStage = async (args) => {
      const prepared = await prepare(args);
      if (prepared.valid) {
        prepared.currencySpends = [{ unit: 'gp', amount: 99 }];
        prepared.plan.currencySpends = prepared.currencySpends;
      }
      return prepared;
    };
    engine._spendCraftCurrencyVersioned = async () => ({ settledSpends: [{ unit: 'gp', amount: 2 }] });
    engine._versionedFailureAwardAllowed = () => true;
    engine._createResultItems = async (_actor, _recipe, step) => ({
      items: [{ id: `award-${step.id}`, uuid: `${actor.uuid}.Item.award-${step.id}`,
        name: `Award ${step.id}`, img: 'icons/commodities/gems/gem-faceted-round-blue.webp',
        system: { quantity: step.id === 'stage-0' ? 1 : 3 } }],
      resolutionMeta: null,
    });
    return engine;
  };
  let interruptedRecord = null;
  try {
    globalThis.foundry = { utils: { randomID: () => `history-${++sequence}` } };
    globalThis.game = { user: gm, users: new Map([[viewer.id, viewer], [gm.id, gm]]),
      time: { worldTime: 100 }, actors: [actor, ...sources], fabricate: {
        getCraftingSystemManager: () => ({ getSystem: () => system }),
        getRecipeVisibilityService: () => visibility,
      } };
    let engine = configure();
    const started = await engine.startVersionedRun({ viewer, actor, sourceActors: sources,
      recipeId: recipe.id, selectionPlan: { selectedIngredientSetId: set.id,
        ingredientEssenceAllocation: { stepId: steps[0].id, ingredientSetId: set.id,
          allocation: Object.fromEntries(items.map((item) => [item.uuid, 1])) },
      },
      requestId: 'start', executionGrant: 'grant' });
    const armedRecord = structuredClone(manager.getActiveRun(actor, started.runId));
    steps[0].description = 'Later live purpose';
    const execute = (requestId) => engine.executeVersionedStage({ viewer: gm, actor,
      componentSourceActors: sources, runId: started.runId,
      expectedRevision: manager.getRun(actor, started.runId).runRevision, requestId, executionGrant: 'grant' });
    for (let index = 0; index < (cancelAfter ?? stageCount); index += 1) {
      if (index > 0) await execute(`arm-${index}`);
      game.time.worldTime += 60;
      if (resumePrefix && index === 0) {
        const update = manager.updateExecutionJournal.bind(manager);
        manager.updateExecutionJournal = async (...args) => {
          if (args[2].type === 'effectApplying' && args[2].effectId === 'award-results') {
            throw new Error('history fixture stopped between effects');
          }
          return update(...args);
        };
        try { await execute(`execute-${index}`); }
        catch (error) { if (!error.message.includes('stopped between effects')) throw error; }
        interruptedRecord = structuredClone(manager.getRun(actor, started.runId));
        manager = new CraftingRunManager();
        engine = configure();
      }
      await execute(`execute-${index}`);
    }
    if (cancelAfter !== null) {
      if (armNext) await execute('arm-cancelled');
      await engine.cancelVersionedRun({ actor, runId: started.runId,
        expectedRevision: manager.getRun(actor, started.runId).runRevision,
        requestId: 'cancel', executionGrant: 'grant' });
    }
    actor.flags = JSON.parse(JSON.stringify(actor.flags));
    manager = new CraftingRunManager();
    const record = structuredClone(manager.getRunHistory(actor)[0]);
    system.resolutionMode = 'progressive';
    system.craftingCheck = { progressive: { rollFormula: 'CHANGED_PRIVATE_FORMULA' } };
    steps.forEach((step) => { step.name = 'Changed live name'; step.description = 'Changed live purpose'; });
    const project = (candidate, deleted = false) => new RunJournalBuilder({
      craftingRunManager: manager, recipeManager: { getRecipe: () => deleted ? null : recipe },
      recipeVisibility: visibility, getSystem: () => system,
      getResultItem: () => null, getComponent: () => null, nowWorldTime: () => 1000,
    }).buildListing({ actor, viewer: candidate }).history[0];
    return { record, armedRecord, interruptedRecord, model: project(viewer),
      deletedRecipeModel: project(gm, true), sourceItemsRemaining: sources.map((source) => source.items.length) };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

function historyActor(id) {
  return { id, uuid: `Actor.${id}`, isOwner: true, items: [], flags: {},
    getFlag(namespace, key) { return this.flags[namespace]?.[key]; },
    async setFlag(namespace, key, value) {
      this.flags[namespace] ??= {};
      this.flags[namespace][key] = structuredClone(value);
    },
  };
}

function historyItem(actor, index) {
  const item = { id: 'same-id', uuid: `${actor.uuid}.Item.same-id`, parent: actor,
    name: `Carrier ${index + 1}`, img: 'icons/commodities/flowers/flower-white.webp',
    system: { quantity: 1 }, flags: {},
    getFlag: (_namespace, key) => key.endsWith('essences') ? { sun: 2, moon: 3 } : undefined,
    async delete() { actor.items = actor.items.filter((entry) => entry !== this); },
    toObject() { return { name: this.name, img: this.img, type: 'loot', system: { ...this.system } }; },
  };
  actor.items.push(item);
  return item;
}
