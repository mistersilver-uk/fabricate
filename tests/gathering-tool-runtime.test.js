/**
 * Engine-level coverage for the tools feature: start-attempt gates
 * (TOOL_BLOCKED), terminal breakage planning, the toolBreakagePolicy override,
 * and usedTools evidence on the public response.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { classifyGatheringToolStates, isToolBroken, matchGatheringTools } from '../src/gatheringToolRuntime.js';

function makeRunManager() {
  let createdTerminal = null;
  return {
    findActiveRunForTask: () => null,
    async createTerminalRun(actor, runData, status, payload) {
      createdTerminal = { runData, status, payload };
      return { id: 'run-1', status, ...runData, ...payload };
    },
    async getMaturedWaitingRuns() { return []; },
    inspectCreated() { return createdTerminal; }
  };
}

function makeEvaluator({ requirementResults = new Map() } = {}) {
  return {
    async evaluateVisibility() {
      return { visible: true, reasonCode: 'VISIBLE', diagnostic: null };
    },
    async evaluateCheck() {
      return { success: true, status: 'success', value: 1, reasonCode: 'CHECK_SUCCESS', diagnostic: null };
    },
    async evaluateRequirement({ requirement }) {
      const key = `${requirement?.provider}:${requirement?.formula || requirement?.macroUuid || ''}`;
      const result = requirementResults.get(key);
      const allowed = result?.allowed === true;
      return {
        allowed,
        description: result?.description ?? '',
        reasonCode: allowed ? 'REQUIREMENT_MET' : 'REQUIREMENT_FAILED',
        diagnostic: null
      };
    }
  };
}

function makeRichState({ toolBreakagePolicy = 'failureOnBreak' } = {}) {
  return {
    composeEnvironment(environment) {
      const composed = {
        ...environment,
        rules: { ...(environment.rules || {}), toolBreakagePolicy }
      };
      if (environment?.__libraryTools instanceof Map) {
        Object.defineProperty(composed, '__libraryTools', {
          value: environment.__libraryTools,
          enumerable: false
        });
      }
      return composed;
    }
  };
}

function makeStores({ environment, system }) {
  return {
    environmentStore: {
      get: id => id === environment.id ? environment : null,
      list: () => [environment],
      listBySystem: () => [environment]
    },
    getSystems: () => [system]
  };
}

function makeAvailability({ missing = [], failedRequirements = [] } = {}) {
  return {
    async check({ tools }) {
      return {
        available: missing.length === 0 && failedRequirements.length === 0,
        missing,
        failedRequirements,
        items: tools
      };
    }
  };
}

function makeBreakage({ planResult = [], applyResult = [] } = {}) {
  const calls = { plan: 0, apply: 0, planTools: [], applyTools: [] };
  return {
    impl: {
      async plan({ tools }) { calls.plan++; calls.planTools.push(tools); return planResult; },
      async apply({ tools }) { calls.apply++; calls.applyTools.push(tools); return applyResult; }
    },
    calls
  };
}

function makeSimpleEngine({
  task,
  toolPlan = [],
  toolApply = [],
  toolMissing = [],
  failedRequirements = [],
  toolBreakagePolicy = 'failureOnBreak',
  libraryTools = []
}) {
  const system = { id: 'system-a', enabled: true, features: { gathering: true } };
  const environment = {
    id: 'env-a',
    craftingSystemId: 'system-a',
    enabled: true,
    selectionMode: 'targeted',
    tasks: [task]
  };
  Object.defineProperty(environment, '__libraryTools', {
    value: new Map(libraryTools.map(tool => [tool.id, tool])),
    enumerable: false
  });
  const stores = makeStores({ environment, system });
  const breakage = makeBreakage({ planResult: toolPlan, applyResult: toolApply });
  const runManager = makeRunManager();
  const engine = new GatheringEngine({
    environmentStore: stores.environmentStore,
    runManager,
    richState: makeRichState({ toolBreakagePolicy }),
    evaluator: makeEvaluator(),
    getSystems: stores.getSystems,
    getSelectableActors: () => [{ id: 'actor-1' }],
    isActorSelectable: () => true,
    isGamePaused: () => false,
    sceneAccess: { canAttempt: async () => ({ allowed: true }) },
    toolAvailability: makeAvailability({ missing: toolMissing, failedRequirements }),
    catalystAvailability: { check: async () => ({ available: true, missing: [] }) },
    catalystUsage: { plan: async () => [], apply: async () => [] },
    toolBreakage: breakage.impl,
    resultResolver: {
      async resolveRouted() {
        return {
          status: 'succeeded',
          resultGroups: [{ id: 'g', name: 'Iron', results: [{ id: 'r', componentId: 'comp-iron', quantity: 1 }] }]
        };
      }
    },
    resultCreator: {
      async plan() { return []; },
      async create() { return []; }
    },
    failureFeedback: { apply: async () => null }
  });
  return { engine, environment, system, breakage, runManager };
}

function baseTask(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather',
    enabled: true,
    resolutionMode: 'routed',
    catalysts: [],
    tools: [],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.x' },
    resultGroups: [{ id: 'g', name: 'Iron', results: [{ id: 'r', componentId: 'comp-iron', quantity: 1 }] }],
    ...overrides
  };
}

const viewer = { id: 'user-1', isGM: false };

// ---------------------------------------------------------------------------
// Start-attempt gate
// ---------------------------------------------------------------------------

test('missing tool blocks startAttempt with TOOL_BLOCKED', async () => {
  const tool = { componentId: 'comp-axe', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } };
  const { engine } = makeSimpleEngine({
    task: baseTask({ tools: [tool] }),
    toolMissing: [tool]
  });
  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.accepted, false);
  assert.equal(result.blockedReasons[0].code, 'TOOL_BLOCKED');
  assert.deepEqual(result.blockedReasons[0].data.missing, [tool]);
});

test('failed tool requirement blocks startAttempt with failedRequirements detail', async () => {
  const tool = {
    componentId: 'comp-axe',
    requirement: { provider: 'dnd5e', formula: '@flags.proficient' },
    breakage: { mode: 'limitedUses', maxUses: null },
    onBreak: { mode: 'destroy' }
  };
  const { engine } = makeSimpleEngine({
    task: baseTask({ tools: [tool] }),
    failedRequirements: [{ tool, reasonCode: 'REQUIREMENT_FAILED' }]
  });
  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.accepted, false);
  assert.equal(result.blockedReasons[0].code, 'TOOL_BLOCKED');
  assert.equal(result.blockedReasons[0].data.failedRequirements.length, 1);
});

test('startAttempt succeeds with available tool and runs breakage plan/apply', async () => {
  const tool = { componentId: 'comp-axe', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } };
  const { engine, breakage } = makeSimpleEngine({
    task: baseTask({ tools: [tool] }),
    toolPlan: [{ componentId: 'comp-axe', mode: 'limitedUses', broken: false }],
    toolApply: [{ componentId: 'comp-axe', broken: false }]
  });
  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.accepted, true);
  assert.equal(result.state, 'succeeded');
  assert.equal(breakage.calls.plan, 1);
  assert.equal(breakage.calls.apply, 1);
  assert.deepEqual(result.usedTools, [{ componentId: 'comp-axe', mode: 'limitedUses', broken: false }]);
});

test('library toolIds resolve through __libraryTools for gates, breakage, and persisted usedTools', async () => {
  const libraryTool = {
    id: 'tool-axe',
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: 100 },
    onBreak: { mode: 'replaceWith', replacementComponentId: 'broken-axe' }
  };
  const plan = [{
    componentId: 'comp-axe',
    itemRef: { actorUuid: 'Actor.actor-1', itemUuid: 'Item.axe', quantity: 1 },
    mode: 'breakageChance',
    broken: true,
    onBreak: { action: 'replaced', replacementComponentId: 'broken-axe' }
  }];
  const { engine, breakage, runManager } = makeSimpleEngine({
    task: baseTask({ toolIds: ['tool-axe'] }),
    libraryTools: [libraryTool],
    toolPlan: plan,
    toolApply: plan,
    toolBreakagePolicy: 'successDespiteBreak'
  });

  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, true);
  assert.equal(breakage.calls.plan, 1);
  assert.equal(breakage.calls.apply, 1);
  assert.deepEqual(breakage.calls.planTools[0], [libraryTool]);
  assert.deepEqual(result.usedTools, plan);
  assert.deepEqual(runManager.inspectCreated().payload.usedTools, plan);
});

test('missing library toolId blocks startAttempt before actor inventory checks', async () => {
  const { engine, breakage } = makeSimpleEngine({
    task: baseTask({ toolIds: ['missing-tool'] })
  });

  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.equal(result.blockedReasons[0].code, 'TOOL_BLOCKED');
  assert.deepEqual(result.blockedReasons[0].data.missingToolIds, ['missing-tool']);
  assert.equal(breakage.calls.plan, 0);
});

test('disabled library toolId blocks listForActor with TOOL_BLOCKED', async () => {
  const disabledTool = {
    id: 'tool-disabled',
    enabled: false,
    componentId: 'comp-axe',
    breakage: { mode: 'limitedUses', maxUses: null },
    onBreak: { mode: 'destroy' }
  };
  const { engine } = makeSimpleEngine({
    task: baseTask({ toolIds: ['tool-disabled'] }),
    libraryTools: [disabledTool]
  });

  const listing = await engine.listForActor({ viewer });

  assert.equal(listing.visible, true);
  assert.equal(listing.attemptable, false);
  assert.equal(listing.environments[0].tasks[0].blockedReasons[0].code, 'TOOL_BLOCKED');
  assert.deepEqual(listing.environments[0].tasks[0].blockedReasons[0].data.disabledToolIds, ['tool-disabled']);
});

test('timed completion resolves library toolIds for usedTools evidence', async () => {
  const actor = { id: 'actor-1', uuid: 'Actor.actor-1' };
  const libraryTool = {
    id: 'tool-axe',
    componentId: 'comp-axe',
    breakage: { mode: 'limitedUses', maxUses: null },
    onBreak: { mode: 'destroy' }
  };
  const plan = [{
    componentId: 'comp-axe',
    itemRef: { actorUuid: 'Actor.actor-1', itemUuid: 'Item.axe', quantity: 1 },
    mode: 'limitedUses',
    broken: false
  }];
  const task = baseTask({ toolIds: ['tool-axe'], timeRequirement: { minutes: 10 } });
  const system = { id: 'system-a', enabled: true, features: { gathering: true } };
  const environment = {
    id: 'env-a',
    craftingSystemId: 'system-a',
    enabled: true,
    selectionMode: 'targeted',
    tasks: [task]
  };
  Object.defineProperty(environment, '__libraryTools', {
    value: new Map([['tool-axe', libraryTool]]),
    enumerable: false
  });
  const breakage = makeBreakage({ planResult: plan, applyResult: plan });
  const runManager = {
    async getMaturedWaitingRuns() {
      return [{
        actor,
        run: {
          id: 'run-waiting',
          actorUuid: 'Actor.actor-1',
          status: 'waitingTime',
          craftingSystemId: 'system-a',
          environmentId: 'env-a',
          taskId: 'task-a'
        }
      }];
    },
    async completeRun(_actor, run, status, payload, { terminalRunData } = {}) {
      return { ...run, ...terminalRunData, status, ...payload };
    }
  };
  const engine = new GatheringEngine({
    environmentStore: { get: () => environment, list: () => [environment], listBySystem: () => [environment] },
    runManager,
    evaluator: makeEvaluator(),
    getSystems: () => [system],
    getRunViewer: () => viewer,
    catalystUsage: { plan: async () => [], apply: async () => [] },
    toolBreakage: breakage.impl,
    resultResolver: {
      async resolveRouted() {
        return {
          status: 'succeeded',
          resultGroups: [{ id: 'g', name: 'Iron', results: [{ id: 'r', componentId: 'comp-iron', quantity: 1 }] }]
        };
      }
    },
    resultCreator: { plan: async () => [], create: async () => [] },
    failureFeedback: { apply: async () => null }
  });

  const result = await engine.processWorldTime(100);

  assert.equal(result.completed.length, 1);
  assert.deepEqual(result.completed[0].run.usedTools, plan);
  assert.deepEqual(breakage.calls.planTools[0], [libraryTool]);
});

// ---------------------------------------------------------------------------
// Policy override
// ---------------------------------------------------------------------------

test('failureOnBreak policy overrides outcome to failed when a tool breaks', async () => {
  const tool = { componentId: 'comp-axe', breakage: { mode: 'breakageChance', breakageChance: 100 }, onBreak: { mode: 'destroy' } };
  const { engine, breakage } = makeSimpleEngine({
    task: baseTask({ tools: [tool] }),
    toolPlan: [{ componentId: 'comp-axe', mode: 'breakageChance', broken: true }],
    toolApply: [{ componentId: 'comp-axe', broken: true, onBreak: { action: 'destroyed' } }],
    toolBreakagePolicy: 'failureOnBreak'
  });
  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.accepted, true);
  assert.equal(result.state, 'failed');
  assert.deepEqual(result.createdResults, []);
  assert.equal(breakage.calls.apply, 1, 'apply still runs so the destruction takes effect');
});

test('successDespiteBreak policy preserves success even when a tool breaks', async () => {
  const tool = { componentId: 'comp-axe', breakage: { mode: 'breakageChance', breakageChance: 100 }, onBreak: { mode: 'flagBroken' } };
  const { engine } = makeSimpleEngine({
    task: baseTask({ tools: [tool] }),
    toolPlan: [{ componentId: 'comp-axe', mode: 'breakageChance', broken: true }],
    toolApply: [{ componentId: 'comp-axe', broken: true, onBreak: { action: 'flagged' } }],
    toolBreakagePolicy: 'successDespiteBreak'
  });
  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.accepted, true);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.usedTools[0].broken, true);
});

test('multi-tool: any missing tool blocks the start', async () => {
  const tool1 = { componentId: 'comp-axe', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } };
  const tool2 = { componentId: 'comp-saw', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } };
  const { engine } = makeSimpleEngine({
    task: baseTask({ tools: [tool1, tool2] }),
    toolMissing: [tool2]
  });
  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.accepted, false);
  assert.equal(result.blockedReasons[0].code, 'TOOL_BLOCKED');
  assert.deepEqual(result.blockedReasons[0].data.missing, [tool2]);
});

test('legacy task without tools is unaffected', async () => {
  const { engine, breakage } = makeSimpleEngine({ task: baseTask() });
  const result = await engine.startAttempt({ viewer, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.accepted, true);
  assert.equal(result.state, 'succeeded');
  assert.equal(breakage.calls.plan, 0, 'no tools means no breakage planning');
  assert.equal(breakage.calls.apply, 0);
  assert.deepEqual(result.usedTools, []);
});

// ---------------------------------------------------------------------------
// isToolBroken / classifyGatheringToolStates (display-state helpers)
// ---------------------------------------------------------------------------

function brokenViaGetFlag(key) {
  return { getFlag: (ns, flag) => ns === 'fabricate' && flag === key };
}

test('isToolBroken detects every supported flag form and is false otherwise', () => {
  assert.equal(isToolBroken(brokenViaGetFlag('toolBroken')), true);
  assert.equal(isToolBroken(brokenViaGetFlag('fabricate.toolBroken')), true);
  globalThis.foundry = { utils: { getProperty: (obj, path) => obj?.[path] === true } };
  assert.equal(isToolBroken({ 'flags.fabricate.toolBroken': true }), true);
  assert.equal(isToolBroken({ 'flags.fabricate.fabricate.toolBroken': true }), true);
  delete globalThis.foundry;
  assert.equal(isToolBroken({ getFlag: () => false }), false);
  assert.equal(isToolBroken(null), false);
});

const matcher = {
  catalystMatchesItem: (_recipe, tool, candidate) => Boolean(tool?.componentId) && tool.componentId === candidate?.componentId
};

function inventoryItem(componentId, broken = false) {
  return { componentId, getFlag: (ns, flag) => ns === 'fabricate' && flag === 'toolBroken' && broken };
}

test('classifyGatheringToolStates reports present / damaged / missing per tool', () => {
  const tools = [{ componentId: 'c-axe' }, { componentId: 'c-saw' }, { componentId: 'c-net' }];
  const actor = { items: [inventoryItem('c-axe'), inventoryItem('c-saw', true)] };
  const states = classifyGatheringToolStates({ actor, system: { id: 's' }, task: { id: 't' }, tools, craftingSystemManager: matcher });
  assert.deepEqual(states.map(s => s.state), ['present', 'damaged', 'missing']);
});

test('classifyGatheringToolStates prefers a non-broken duplicate (present over damaged)', () => {
  const actor = { items: [inventoryItem('c-axe', true), inventoryItem('c-axe', false)] };
  const states = classifyGatheringToolStates({ actor, system: { id: 's' }, task: { id: 't' }, tools: [{ componentId: 'c-axe' }], craftingSystemManager: matcher });
  assert.equal(states[0].state, 'present');
});

test('classifyGatheringToolStates treats a null actor as all-missing without throwing', () => {
  const states = classifyGatheringToolStates({ actor: null, system: { id: 's' }, task: { id: 't' }, tools: [{ componentId: 'c-axe' }], craftingSystemManager: matcher });
  assert.deepEqual(states.map(s => s.state), ['missing']);
});

test('the matcher falls back to craftingSystemManager.recipeManager when the manager has none', () => {
  const viaRecipeManager = { recipeManager: matcher };
  const actor = { items: [inventoryItem('c-axe')] };
  const states = classifyGatheringToolStates({ actor, system: { id: 's' }, task: { id: 't' }, tools: [{ componentId: 'c-axe' }], craftingSystemManager: viaRecipeManager });
  assert.equal(states[0].state, 'present');
});

test('matchGatheringTools still collapses a broken matching tool into missing (attempt validation unchanged)', () => {
  const actor = { items: [inventoryItem('c-axe', true)] };
  const result = matchGatheringTools({ actor, system: { id: 's' }, task: { id: 't' }, tools: [{ componentId: 'c-axe' }], craftingSystemManager: matcher });
  assert.equal(result.items.length, 0);
  assert.equal(result.missing.length, 1);
});

// ---------------------------------------------------------------------------
// classifyGatheringToolStates: replaceWith broken-variant recognition (display)
// ---------------------------------------------------------------------------

function replaceWithTool() {
  return { componentId: 'c-pick', onBreak: { mode: 'replaceWith', replacementComponentId: 'c-pick-broken' } };
}

function classifyOne(actor, tool) {
  return classifyGatheringToolStates({
    actor,
    system: { id: 's' },
    task: { id: 't' },
    tools: [tool],
    craftingSystemManager: matcher
  })[0].state;
}

test('classifyGatheringToolStates: replaceWith variant only → damaged; working → present; neither → missing', () => {
  assert.equal(classifyOne({ items: [inventoryItem('c-pick-broken')] }, replaceWithTool()), 'damaged');
  assert.equal(classifyOne({ items: [inventoryItem('c-pick')] }, replaceWithTool()), 'present');
  assert.equal(classifyOne({ items: [inventoryItem('c-other')] }, replaceWithTool()), 'missing');
});

test('classifyGatheringToolStates: holding both working tool and broken variant → present (working wins)', () => {
  const actor = { items: [inventoryItem('c-pick'), inventoryItem('c-pick-broken')] };
  assert.equal(classifyOne(actor, replaceWithTool()), 'present');
});

test('classifyGatheringToolStates: destroy/flagBroken onBreak does not trigger the broken-variant fallback', () => {
  const actor = { items: [inventoryItem('c-pick-broken')] };
  const destroyTool = { componentId: 'c-pick', onBreak: { mode: 'destroy', replacementComponentId: 'c-pick-broken' } };
  const flagTool = { componentId: 'c-pick', onBreak: { mode: 'flagBroken', replacementComponentId: 'c-pick-broken' } };
  assert.equal(classifyOne(actor, destroyTool), 'missing');
  assert.equal(classifyOne(actor, flagTool), 'missing');
});

test('classifyGatheringToolStates: null/empty/missing replacementComponentId is missing, no throw, no false-match', () => {
  // An inventory item whose componentId is undefined must NOT be matched by a
  // synthetic { componentId: undefined } probe.
  const actor = { items: [{ componentId: undefined, getFlag: () => false }] };
  const nullRepl = { componentId: 'c-pick', onBreak: { mode: 'replaceWith', replacementComponentId: null } };
  const emptyRepl = { componentId: 'c-pick', onBreak: { mode: 'replaceWith', replacementComponentId: '   ' } };
  const missingRepl = { componentId: 'c-pick', onBreak: { mode: 'replaceWith' } };
  assert.equal(classifyOne(actor, nullRepl), 'missing');
  assert.equal(classifyOne(actor, emptyRepl), 'missing');
  assert.equal(classifyOne(actor, missingRepl), 'missing');
});

test('classifyGatheringToolStates: existing toolBroken-flag damaged path still works under replaceWith', () => {
  // Item matches the tool's OWN component and is flagged broken → damaged via flag,
  // independent of the replaceWith fallback.
  const actor = { items: [inventoryItem('c-pick', true)] };
  assert.equal(classifyOne(actor, replaceWithTool()), 'damaged');
});

test('matchGatheringTools: holding only the replaceWith broken variant stays missing (attempt blocked)', () => {
  const actor = { items: [inventoryItem('c-pick-broken')] };
  const result = matchGatheringTools({
    actor,
    system: { id: 's' },
    task: { id: 't' },
    tools: [replaceWithTool()],
    craftingSystemManager: matcher
  });
  assert.equal(result.items.length, 0);
  assert.equal(result.missing.length, 1);
});
