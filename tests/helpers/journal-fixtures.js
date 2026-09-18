// Shared RunModel fixtures for the Journal mounted-component tests.

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
        tools: [{ id: 'tool-mortar', name: 'Mortar & Pestle', img: 'icons/mortar.webp' }],
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
      detail: { requiredSeconds: null, tools: [], checkLabel: null, failureText: null },
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
 * Historical evidence comes from real execution, serialized actor flags and a fresh manager. Only
 * Item documents, currency settlement and authority are doubled; no evidence is injected.
 */
export async function createPersistedCraftingHistory({
  failLast = false, cancelAfter = null, armNext = false, opaque = false,
  resumePrefix = false, stageCount = 2, mode = 'simple', checked = true, awardQuantity = undefined, previewOnly = false, transformBeforeResume = null,
  legacy = false, timed = true, refuseConsumeAt = null, refuseSettlement = false, drive = null,
  // The 99gp plan and the canned 2gp settlement below exist so a history-capture fixture has
  // currency EVIDENCE to project (issue 1648).
  stubCurrencySettlement = drive === null,
} = {}) {
  const { CraftingEngine } = await import('../../src/systems/CraftingEngine.js');
  const { CraftingRunManager } = await import('../../src/systems/CraftingRunManager.js');
  const { RunJournalBuilder } = await import('../../src/systems/RunJournalBuilder.js');
  const { IngredientSet } = await import('../../src/models/IngredientSet.js');
  const { makeWorldCurrencyConfig } = await import('./currency-spend-fixtures.js');
  const { ActorPropertyCoinSpender } = await import('../../src/systems/CoinSpenders.js');
  const { affordsCurrencySpends, buildCurrencyAffordProbe } = await import(
    '../../src/systems/currencyAffordance.js'
  );
  const { findMatchingComponent, resolveItemEssences } = await import(
    '../../src/utils/essenceResolver.js'
  );
  const { resolvedComponentsFor } = await import('../../src/systems/scopedEntityReads.js');
  const saved = { game: globalThis.game, foundry: globalThis.foundry, Roll: globalThis.Roll };
  let sequence = 0;
  const viewer = { id: 'history-player', isGM: false };
  const gm = { id: 'history-gm', isGM: true };
  const actor = historyActor('crafter');
  const persist = actor.setFlag.bind(actor);
  if (refuseSettlement) actor.setFlag = async (namespace, key, value) => {
    if (value.history?.some((run) => ['succeeded', 'failed'].includes(run.status))) return undefined;
    return persist(namespace, key, value);
  };
  const sources = [historyActor('source-a'), historyActor('source-b')];
  const items = sources.map((source, index) => historyItem(source, index));
  if (refuseConsumeAt !== null) items[refuseConsumeAt].delete = async () => undefined;
  const system = {
    id: 'history-system', name: 'Recorded crafting', resolutionMode: mode,
    features: { multiStepRecipes: true, essences: true, craftingChecks: checked },
    requirements: { currency: { enabled: true } },
    craftingCheck: { simple: { rollFormula: checked ? '1d20' : '' } },
    essenceDefinitions: [{ id: 'sun', name: 'Sun' }, { id: 'moon', name: 'Moon' }],
    components: Array.from({ length: stageCount }, (_, index) => ({ id: `award-stage-${index}`, name: `Award stage-${index}`, img: 'icons/commodities/gems/gem-faceted-round-blue.webp' })),
  };
  const set = new IngredientSet({ id: 'route', name: 'Recorded route',
    ingredientGroups: [{ id: 'sun', options: [{ match: { type: 'essence', essenceId: 'sun', amount: 4 } }] },
      { id: 'moon', options: [{ match: { type: 'essence', essenceId: 'moon', amount: 6 } }] }],
  });
  const emptySet = new IngredientSet({ id: 'next-route', name: 'Next route', ingredientGroups: [] });
  if (previewOnly) emptySet.ingredientGroups = new IngredientSet({ id: 'future-inputs', ingredientGroups: [
    { id: 'choice', name: 'Binder', options: ['Wax', 'Oil'].map((componentId) => ({ quantity: 1, match: { type: 'component', componentId } })) },
    { id: 'essence', options: [{ match: { type: 'essence', essenceId: 'sun', amount: 4 } }] },
    { id: 'tag', options: [{ quantity: 2, match: { type: 'tags', tags: ['fresh'], tagMatch: 'all' } }] },
    { id: 'currency', options: [{ match: { type: 'currency', unit: 'gp', amount: 3 } }] },
    { id: 'item', name: 'Bottle', options: [{ quantity: 1, itemUuid: 'Item.bottle' }] },
  ] }).ingredientGroups;
  const steps = Array.from({ length: stageCount }, (_, index) => ({
    id: `stage-${index}`, name: `Stage ${index + 1}`, description: `Purpose ${index + 1}`,
    ingredientSets: [index === 0 ? set : emptySet], resultGroups: awardQuantity === null ? [] : [{ id: `outputs-${index}`, results: [{ id: `result-${index}`, componentId: `award-stage-${index}`, quantity: awardQuantity ?? (index === 0 ? 1 : 3) }] }], toolIds: [], timeRequirement: timed ? { minutes: 1 } : null,
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
  // A REAL ladder and a REAL spender, so the projection's currency answer and the engine's come
  // from the same place production reads them from (issue 1648, QE2-5).
  const currencyConfigStore = { get: () => makeWorldCurrencyConfig() };
  const currencySeams = {
    actorPropertyCoinSpender: new ActorPropertyCoinSpender(),
    getCurrencyConfig: () => currencyConfigStore.get(),
  };
  const configure = () => {
    const engine = new CraftingEngine(recipeManager, manager, null, null, null, null,
      currencySeams.actorPropertyCoinSpender, { currencyConfigStore });
    engine.installVersionedRunAuthority({ consumeExecutionGrant: async (_grant, context) => ({
      operationId: `operation-${context.requestId}`,
      resolvedCheckResult: { success: !(failLast && manager.getActiveRuns(actor)[0]?.currentStepIndex === stageCount - 1),
        value: checked ? 17 : null, data: checked ? { formula: '1d20', total: 17, dc: 12 } : {} },
    }) });
    if (stubCurrencySettlement) {
      const prepare = engine._prepareVersionedStage.bind(engine);
      engine._prepareVersionedStage = async (args) => {
        const prepared = await prepare(args);
        if (prepared.valid) {
          prepared.currencySpends = [{ unit: 'gp', amount: 99 }];
          prepared.plan.currencySpends = prepared.currencySpends;
        }
        return prepared;
      };
      engine._spendCraftCurrencyVersioned = async () => ({
        settledSpends: [{ unit: 'gp', amount: 2 }],
      });
    }
    engine._versionedFailureAwardAllowed = () => true;
    return engine;
  };
  let interruptedRecord = null;
  try {
    globalThis.foundry = { utils: { randomID: () => `history-${++sequence}` } };
    globalThis.game = { user: legacy ? viewer : gm, users: new Map([[viewer.id, viewer], [gm.id, gm]]),
      time: { worldTime: 100 }, actors: [actor, ...sources], fabricate: {
        getCraftingSystemManager: () => ({ getSystem: () => system }),
        getRecipeVisibilityService: () => visibility,
      } };
    game.fabricate.getCurrencyConfigStore = () => currencyConfigStore;
    let engine = configure();
    if (legacy) {
      const { stubRoll } = await import('./gathering.js');
      stubRoll(failLast ? 3 : 17, [{ faces: 20, number: 1, total: failLast ? 3 : 17 }]);
      let error = null;
      const options = { ingredientEssenceAllocation: { stepId: steps[0].id, ingredientSetId: set.id,
        allocation: Object.fromEntries(items.map((item) => [item.uuid, 1])) } };
      try {
        await engine.craft(actor, sources, recipe, set.id, options);
        if (timed && manager.getActiveRuns(actor).length) {
          game.time.worldTime += 60;
          await engine.craft(actor, sources, recipe, set.id, { ...options, runId: manager.getActiveRuns(actor)[0].id });
        }
      } catch (failure) { error = { code: failure.code, message: failure.message }; }
      const retryErrors = [];
      if (refuseSettlement) {
        actor.setFlag = persist;
        const runId = manager.getActiveRuns(actor)[0]?.id;
        for (const reader of [manager, new CraftingRunManager()]) {
          try { await new CraftingEngine(recipeManager, reader).craft(actor, sources, recipe, set.id, { ...options, runId }); }
          catch (failure) { retryErrors.push(failure.code); }
        }
      }
      actor.flags = JSON.parse(JSON.stringify(actor.flags));
      manager = new CraftingRunManager();
      const record = manager.getRunHistory(actor)[0] ?? manager.getActiveRuns(actor)[0];
      const listing = new RunJournalBuilder({ craftingRunManager: manager, getResultItem: () => null, getComponent: () => null })
        .buildListing({ actor, viewer: gm });
      return { record, model: listing.history[0] ?? listing.activeRuns[0], error, retryErrors, awardedCount: actor.items.length, sourceItemsRemaining: sources.map((source) => source.items.length) };
    }
    const started = await engine.startVersionedRun({ viewer, actor, sourceActors: sources,
      recipeId: recipe.id, selectionPlan: { selectedIngredientSetId: set.id,
        ingredientEssenceAllocation: { stepId: steps[0].id, ingredientSetId: set.id,
          allocation: Object.fromEntries(items.map((item) => [item.uuid, 1])) },
      },
      requestId: 'start', executionGrant: 'grant' });
    const armedRecord = structuredClone(manager.getActiveRun(actor, started.runId));
    // `drive` hands the live world to the caller INSIDE the installed globals, so a test can
    // act on the real engine, run manager and actor documents at any point after the start.
    if (drive) {
      // Wired as `main.js` wires them, so the projection reads the same world clock and the
      // same component sources the engine's own commands are driven with.
      const project = (candidate = gm) => new RunJournalBuilder({ craftingRunManager: manager,
        recipeManager, recipeVisibility: visibility, getSystem: () => system,
        getResultItem: () => null, getComponent: () => null,
        nowWorldTime: () => Number(game.time?.worldTime ?? 0),
        getComponentSourceActors: () => sources,
        // The three resolution seams `main.js` wires (issue 1648).
        resolveItemEssences: ({ item, recipe: view }) =>
          resolveItemEssences(
            item,
            resolvedComponentsFor(system),
            view?.craftingSystemId,
            findMatchingComponent
          ),
        affordCurrency: ({ actor: holder, recipe: view, match }) =>
          buildCurrencyAffordProbe(holder, view, currencySeams)(match),
        affordCurrencySpends: ({ actor: holder, recipe: view, currencySpends }) =>
          affordsCurrencySpends(holder, view, currencySpends, currencySeams),
      }).buildListing({ actor, viewer: candidate });
      const driven = await drive({ engine, actor, sources, recipe, steps, set, system, gm, viewer,
        runId: started.runId, started, project, manager: () => manager,
        remaining: () => sources.map((source) => source.items.length) });
      return { armedRecord, sourceItemsRemaining: sources.map((source) => source.items.length),
        record: structuredClone(manager.getRun(actor, started.runId)), ...driven };
    }
    if (previewOnly) {
      const before = structuredClone(actor.flags);
      const model = new RunJournalBuilder({ craftingRunManager: new CraftingRunManager(),
        recipeManager, recipeVisibility: visibility, getSystem: () => system,
      }).buildListing({ actor, viewer }).activeRuns[0];
      return { record: armedRecord, model, before, after: structuredClone(actor.flags) };
    }
    steps[0].description = 'Later live purpose';
    const execute = (requestId) => engine.executeVersionedStage({ viewer: gm, actor,
      componentSourceActors: sources, runId: started.runId,
      expectedRevision: manager.getRun(actor, started.runId).runRevision, requestId, executionGrant: 'grant' });
    // A stage after the first is begun explicitly: that is where its choice locks and its
    // materials are spent. Executing an unstarted stage is refused, not silently armed.
    const begin = (requestId) => engine.beginVersionedStage({ viewer: gm, actor,
      componentSourceActors: sources, runId: started.runId,
      expectedRevision: manager.getRun(actor, started.runId).runRevision, requestId, executionGrant: 'grant' });
    for (let index = 0; index < (cancelAfter ?? stageCount); index += 1) {
      if (index > 0) await begin(`arm-${index}`);
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
        if (transformBeforeResume) await transformBeforeResume({ actor, system, recipe, steps });
        manager = new CraftingRunManager();
        engine = configure();
      }
      await execute(`execute-${index}`);
    }
    if (cancelAfter !== null) {
      if (armNext) await begin('arm-cancelled');
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

/** Minimal legacy persisted shape: component-only rows, equivalent full pack Item receipts. */
export function legacyGatheringEvidence() {
  return {
    result: { provider: 'd100', items: [
      { id: 'ore', componentId: 'ore', itemUuid: '', roll: 12, effectiveRoll: 12, threshold: 11, finalDropRate: 90, dropped: true },
      { id: 'gem', componentId: 'gem', itemUuid: '', roll: 94, effectiveRoll: 94, threshold: 81, finalDropRate: 20, dropped: true },
    ] },
    awards: [
      { itemUuid: 'Compendium.example.materials.Item.ore', quantity: 2, name: 'Ore' },
      { itemUuid: 'Compendium.example.materials.Item.gem', quantity: 1, name: 'Gem' },
    ],
    systemId: 'mining',
    components: ['ore', 'gem'].map((id) => ({ id, registeredItemUuid: `Compendium.example.materials.${id}` })),
  };
}

/** Real engine, creator, manager and serialized flags; only Foundry documents and rolls are doubled. */
export async function createPersistedGatheringHistory({ mode = 'straight', timed = false, versioned = false, refuseAt = null, refuseHistory = null } = {}) {
  const { GatheringEngine } = await import('../../src/systems/GatheringEngine.js');
  const { GatheringRunManager } = await import('../../src/systems/GatheringRunManager.js');
  const { GatheringRichStateService } = await import('../../src/systems/GatheringRichStateService.js');
  const { createGatheringResultCreator } = await import('../../src/gatheringResultCreation.js');
  const { RunJournalBuilder } = await import('../../src/systems/RunJournalBuilder.js');
  const { routedRoll, routedSystemCheck } = await import('./gathering.js');
  const saved = Object.fromEntries(['game', 'foundry', 'Roll', 'ChatMessage', 'fromUuidSync'].map((key) => [key, globalThis[key]]));
  const actor = historyActor('gatherer');
  const viewer = { id: 'gathering-owner', isGM: false };
  const publications = [];
  const chat = [];
  let sequence = 0;
  let now = 100;
  let creates = 0;
  const saveFlag = actor.setFlag;
  actor.setFlag = async function(namespace, key, value) {
    const settlement = value?.history?.[0]?.historySettlement?.awards;
    if ((refuseHistory === 'initial' && settlement === 'pending') || (refuseHistory === 'settlement' && settlement === 'complete')) return undefined;
    return saveFlag.call(this, namespace, key, value);
  };
  const create = actor.createEmbeddedDocuments;
  actor.createEmbeddedDocuments = async function(...args) { creates++; return creates === refuseAt ? [] : create.apply(this, args); };
  const outputs = [2, 1].map((quantity, index) => ({ id: `row-${index}`, componentId: `output-${index}`, quantity }));
  const task = { id: 'gathering-task', name: 'Gathering', enabled: true, resolutionMode: mode, toolIds: [],
    timeRequirement: timed ? { minutes: 1 } : null,
    resultGroups: [{ id: 'yield', name: 'Yield', results: outputs }],
    dropRows: outputs.map((row) => ({ ...row, enabled: true, dropRate: 100 })),
  };
  const environment = { id: 'gathering-environment', craftingSystemId: 'gathering-system', name: 'Environment', enabled: true, selectionMode: 'targeted', tasks: [task], events: [], conditions: {}, rules: { rewardSelectionMode: 'allDrops' } };
  const system = { id: environment.craftingSystemId, name: 'System', enabled: true, features: { gathering: true, chatOutput: true },
    gatheringCraftingCheck: { ...routedSystemCheck({ tierName: 'Yield' }), progressive: { rollFormula: '1d20' } },
    components: outputs.map((row, index) => ({ id: row.componentId, name: `Gathered ${index}`, img: 'icons/commodities/ore/ore-iron-grey.webp', difficulty: 1 })),
  };
  const store = { list: () => [environment], get: () => environment };
  const manager = new GatheringRunManager({ randomID: () => `gather-${++sequence}`, nowWorldTime: () => now, getUserId: () => viewer.id, getActors: () => [actor] });
  try {
    globalThis.game = { user: viewer, users: new Map([[viewer.id, viewer]]), actors: [actor], time: { worldTime: now } };
    globalThis.foundry = { utils: { randomID: () => `id-${++sequence}` } };
    globalThis.fromUuidSync = () => null;
    globalThis.ChatMessage = { getSpeaker: () => ({ actor: actor.id }), create: async ({ content }) => { chat.push(content); } };
    routedRoll();
    const rich = new GatheringRichStateService({ environmentStore: store, rollD100: () => 94, nowWorldTime: () => now });
    const engine = new GatheringEngine({ environmentStore: store, runManager: manager,
      richState: Object.fromEntries(['resolveD100Attempt', 'resolveEnvironmentalEvents', 'commitAcceptedAttempt'].map((name) => [name, rich[name].bind(rich)])),
      getSystems: () => [system], getSelectableActors: () => [actor], isActorSelectable: () => true,
      isGamePaused: () => false, isPrimaryGM: () => true, getRunViewer: () => viewer,
      evaluator: { evaluateVisibility: async () => ({ visible: true }) },
      sceneAccess: { canAttempt: () => ({ allowed: true }) },
      toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
      resultCreator: createGatheringResultCreator({ getSystem: () => system }),
      hookPublisher: { publishAttemptCompleted: (payload) => publications.push(structuredClone(payload.createdResults)) },
      nowWorldTime: () => now,
    });
    engine.installVersionedRunAuthority({ consumeExecutionGrant: async (_grant, context) => ({ operationId: `operation-${context.requestId}`,
      resolvedCheckResult: { success: true, status: 'success', outcome: mode === 'routed' ? 'Yield' : null, value: 18, data: { total: 18, formula: '1d20' } },
    }) });
    const args = { actor, viewer, environmentId: environment.id, taskId: task.id, requestId: 'start', executionGrant: 'grant' };
    let response;
    let error = null;
    try {
      response = versioned ? await engine.startVersionedRun(args) : await engine.startAttempt(args);
      if (timed || versioned) {
        now += 60;
        game.time.worldTime = now;
        const run = manager.getActiveRuns(actor)[0];
        if (versioned && run) response = await engine.executeVersionedStage({ actor, runId: run.id, expectedRevision: run.runRevision, requestId: 'execute', executionGrant: 'grant' });
        else if (run) response = await engine.processWorldTime(now);
      }
    } catch (failure) { error = { code: failure.code, message: failure.message }; }
    actor.flags = JSON.parse(JSON.stringify(actor.flags));
    const fresh = new GatheringRunManager();
    const record = fresh.getRunHistory(actor)[0];
    const model = new RunJournalBuilder({ gatheringRunSource: fresh, getResultItem: () => null, getComponent: () => null }).buildListing({ actor, viewer: { isGM: true } }).history[0];
    return { record, model, response, error, publications, chat, creates };
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
}

export async function createPersistedSalvageHistory({ timed = false } = {}) {
  const { CraftingEngine } = await import('../../src/systems/CraftingEngine.js');
  const { SalvageRunManager } = await import('../../src/systems/SalvageRunManager.js');
  const { RunJournalBuilder } = await import('../../src/systems/RunJournalBuilder.js');
  const saved = { game: globalThis.game, foundry: globalThis.foundry, fromUuid: globalThis.fromUuid };
  const actor = historyActor('salvager');
  const input = historyItem(actor, 0);
  const viewer = { id: 'salvage-owner', isGM: false };
  const component = { id: 'carrier', name: input.name, registeredItemUuid: input.uuid, salvage: {
    enabled: true, ingredientQuantity: 1, toolIds: [], timeRequirement: timed ? { minutes: 1 } : null,
    resultGroups: [{ id: 'output', results: [2, 1].map((quantity, index) => ({ id: `result-${index}`, componentId: 'output', quantity })) }],
  } };
  const system = { id: 'salvage-system', features: { salvage: true }, salvageResolutionMode: 'simple', salvageCraftingCheck: {},
    components: [component, { id: 'output', name: 'Recovered material', img: 'icons/commodities/ore/ore-iron-grey.webp' }] };
  let sequence = 0;
  try {
    globalThis.foundry = { utils: { randomID: () => `salvage-${++sequence}` } };
    globalThis.game = { user: viewer, users: new Map([[viewer.id, viewer]]), actors: [actor], time: { worldTime: 10 },
      fabricate: { getCraftingSystemManager: () => ({ getSystem: () => system }) } };
    globalThis.fromUuid = async (uuid) => uuid === actor.uuid ? actor : null;
    const manager = new SalvageRunManager();
    const engine = new CraftingEngine({ getToolsForSet: () => [] }, null, null, null, manager);
    const response = await engine.salvage(actor.uuid, system.id, component.id);
    if (timed) { game.time.worldTime += 60; await engine.processPendingSalvageRuns(game.time.worldTime); }
    actor.flags = JSON.parse(JSON.stringify(actor.flags));
    const fresh = new SalvageRunManager();
    const record = fresh.getRunHistory(actor)[0];
    const model = new RunJournalBuilder({ salvageRunManager: fresh, getComponent: () => null, getResultItem: () => null })
      .buildListing({ actor, viewer }).history[0];
    return { record, model, response, inventory: actor.items.map((item) => ({ name: item.name, quantity: item._source.system.quantity })) };
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
}

export async function createPersistedFizzleHistory({ versioned = false, consume = true, refuse = false, refuseSettlement = false } = {}) {
  const { CraftingEngine } = await import('../../src/systems/CraftingEngine.js');
  const { CraftingRunManager } = await import('../../src/systems/CraftingRunManager.js');
  const { RunJournalBuilder } = await import('../../src/systems/RunJournalBuilder.js');
  const saved = { game: globalThis.game, foundry: globalThis.foundry };
  const viewer = { id: 'fizzle-owner', isGM: false };
  const actor = historyActor('fizzle');
  const persist = actor.setFlag.bind(actor);
  if (refuseSettlement) actor.setFlag = async (namespace, key, value) => {
    if (value.history?.some((run) => ['complete', 'uncertain'].includes(run.historySettlement?.consumption))) return undefined;
    return persist(namespace, key, value);
  };
  const item = historyItem(actor, 0);
  if (refuse) item.delete = async () => undefined;
  const submitted = [{ item, componentId: 'carrier' }];
  const system = { id: 'fizzle-system', resolutionMode: 'alchemy', features: {},
    components: [{ id: 'carrier', name: 'Carrier', registeredItemUuid: item.uuid }],
    alchemy: { consumeOnFail: consume, showAttemptHistoryToPlayers: true },
  };
  let sequence = 0;
  const manager = new CraftingRunManager();
  try {
    globalThis.foundry = { utils: { randomID: () => `fizzle-${++sequence}` } };
    globalThis.game = { user: viewer, users: new Map([[viewer.id, viewer]]), time: { worldTime: 10 },
      fabricate: { getCraftingSystemManager: () => ({ getSystem: () => system }) } };
    const engine = new CraftingEngine({ getRecipes: () => [] }, manager);
    engine.installVersionedRunAuthority({ consumeExecutionGrant: async () => ({ operationId: 'fizzle-operation' }) });
    let error = null;
    try {
      if (versioned) await engine.executeVersionedAlchemyFizzle({ actor, viewer, sourceActors: [actor], submittedItems: submitted,
        craftingSystemId: system.id, requestId: 'fizzle-request', executionGrant: 'grant' });
      else await engine.craftAlchemy(actor, [actor], submitted, { craftingSystemId: system.id });
    } catch (failure) { error = { code: failure.code, message: failure.message }; }
    const retryErrors = [];
    if (refuseSettlement) {
      actor.setFlag = persist;
      const runId = manager.getRunHistory(actor)[0].id;
      for (const reader of [manager, new CraftingRunManager()]) {
        try { await new CraftingEngine({ getRecipes: () => [] }, reader).craftAlchemy(actor, [actor], submitted, { craftingSystemId: system.id, runId }); }
        catch (failure) { retryErrors.push(failure.code); }
      }
    }
    actor.flags = JSON.parse(JSON.stringify(actor.flags));
    const fresh = new CraftingRunManager();
    const record = fresh.getRunHistory(actor)[0];
    const model = new RunJournalBuilder({ craftingRunManager: fresh, getSystem: () => system })
      .buildListing({ actor, viewer }).history[0];
    return { record, model, error, retryErrors, historyCount: fresh.getRunHistory(actor).length, remaining: actor.items.length };
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
}

export function mergeHistoryFlag(previous, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(value);
  const result = previous && typeof previous === 'object' ? structuredClone(previous) : {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.startsWith('-=')) delete result[key.slice(2)];
    else result[key] = mergeHistoryFlag(result[key], entry);
  }
  return result;
}

function historyActor(id) {
  return { id, uuid: `Actor.${id}`, documentName: 'Actor', isOwner: true, items: [], flags: {},
    getFlag(namespace, key) { return this.flags[namespace]?.[key]; },
    async setFlag(namespace, key, value) {
      this.flags[namespace] ??= {};
      this.flags[namespace][key] = mergeHistoryFlag(this.flags[namespace][key], value);
      return this;
    },
    async createEmbeddedDocuments(_type, data) {
      return data.map((source) => {
        const item = { ...structuredClone(source), id: `award-${this.items.length}`, documentName: 'Item', parent: this,
          _source: structuredClone(source), getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
          async update(patch) { for (const [path, value] of Object.entries(patch)) { const parts = path.split('.'); let target = this._source; for (const part of parts.slice(0, -1)) target = target[part]; target[parts.at(-1)] = value; } this.system = structuredClone(this._source.system); return this; },
        };
        item.uuid = `${this.uuid}.Item.${item.id}`;
        this.items.push(item);
        return item;
      });
    },
  };
}

/** One essence carrier on a source actor, in the shape the fixture's consumption deletes. */
export function historyItem(actor, index) {
  const item = { id: 'same-id', uuid: `${actor.uuid}.Item.same-id`, parent: actor,
    documentName: 'Item', _source: { system: { quantity: 1 } },
    name: `Carrier ${index + 1}`, img: 'icons/commodities/flowers/flower-white.webp',
    system: { quantity: 1 }, flags: {},
    getFlag: (_namespace, key) => key.endsWith('essences') ? { sun: 2, moon: 3 } : undefined,
    async delete() { actor.items = actor.items.filter((entry) => entry !== this); return this; },
    toObject() { return { name: this.name, img: this.img, type: 'loot', system: { ...this.system } }; },
  };
  actor.items.push(item);
  return item;
}
