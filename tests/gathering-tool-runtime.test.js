/**
 * Engine-level coverage for the tools feature: start-attempt gates
 * (TOOL_BLOCKED), terminal breakage planning, the toolBreakagePolicy override,
 * and usedTools evidence on the public response.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';

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
      return {
        ...environment,
        rules: { ...(environment.rules || {}), toolBreakagePolicy }
      };
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
  const calls = { plan: 0, apply: 0 };
  return {
    impl: {
      async plan() { calls.plan++; return planResult; },
      async apply() { calls.apply++; return applyResult; }
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
  toolBreakagePolicy = 'failureOnBreak'
}) {
  const system = { id: 'system-a', enabled: true, features: { gathering: true } };
  const environment = {
    id: 'env-a',
    craftingSystemId: 'system-a',
    enabled: true,
    selectionMode: 'targeted',
    tasks: [task]
  };
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
