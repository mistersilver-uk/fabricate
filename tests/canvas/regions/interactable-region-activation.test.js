import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateActivationEligibility,
  buildActivationRequest,
  validateActivationRequest,
  describeGrant
} from '../../../src/canvas/regions/interactableRegionActivation.js';

function baseState(overrides = {}) {
  return {
    enabled: true,
    consumed: false,
    locked: false,
    uses: { max: null, used: 0 },
    cooldown: { seconds: null, lastUsedWorldTime: null },
    ...overrides
  };
}

function toolSystem(stateOverrides = {}) {
  return {
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1',
    systemId: 'sys',
    toolId: 't1',
    taskId: null,
    environmentId: null,
    state: baseState(stateOverrides)
  };
}

function taskSystem({ stateOverrides = {}, node = { current: 3 } } = {}) {
  return {
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    systemId: 'sys',
    toolId: null,
    taskId: 'task1',
    environmentId: 'env-1',
    node,
    state: baseState(stateOverrides)
  };
}

test('eligibility: eligible when no gate trips', () => {
  assert.deepEqual(
    evaluateActivationEligibility(toolSystem(), { now: 100 }),
    { eligible: true, reason: null }
  );
});

test('eligibility precedence: DISABLED first', () => {
  const system = toolSystem({ enabled: false, locked: true, consumed: true });
  assert.deepEqual(evaluateActivationEligibility(system, { now: 0 }), { eligible: false, reason: 'DISABLED' });
});

test('eligibility precedence: LOCKED before CONSUMED', () => {
  const system = toolSystem({ locked: true, consumed: true });
  assert.deepEqual(evaluateActivationEligibility(system, { now: 0 }), { eligible: false, reason: 'LOCKED' });
});

test('eligibility: CONSUMED', () => {
  assert.equal(evaluateActivationEligibility(toolSystem({ consumed: true }), { now: 0 }).reason, 'CONSUMED');
});

test('eligibility: USES_EXHAUSTED when used >= max', () => {
  const system = toolSystem({ uses: { max: 2, used: 2 } });
  assert.equal(evaluateActivationEligibility(system, { now: 0 }).reason, 'USES_EXHAUSTED');
  // not exhausted when under the cap
  assert.equal(evaluateActivationEligibility(toolSystem({ uses: { max: 2, used: 1 } }), { now: 0 }).eligible, true);
});

test('eligibility: COOLDOWN active when now < lastUsed + seconds', () => {
  const system = toolSystem({ cooldown: { seconds: 60, lastUsedWorldTime: 100 } });
  assert.equal(evaluateActivationEligibility(system, { now: 120 }).reason, 'COOLDOWN');
  // expired cooldown is eligible
  assert.equal(evaluateActivationEligibility(system, { now: 160 }).eligible, true);
  // null cooldown fields never block
  assert.equal(
    evaluateActivationEligibility(toolSystem({ cooldown: { seconds: null, lastUsedWorldTime: 100 } }), { now: 120 }).eligible,
    true
  );
});

test('eligibility: NODE_DEPLETED for gatheringTask with current <= 0', () => {
  assert.equal(evaluateActivationEligibility(taskSystem({ node: { current: 0 } }), { now: 0 }).reason, 'NODE_DEPLETED');
  assert.equal(evaluateActivationEligibility(taskSystem({ node: { current: 3 } }), { now: 0 }).eligible, true);
  // a null node (unlimited) never depletes
  assert.equal(evaluateActivationEligibility(taskSystem({ node: null }), { now: 0 }).eligible, true);
});

test('eligibility: state gates take precedence over node depletion', () => {
  const system = taskSystem({ stateOverrides: { locked: true }, node: { current: 0 } });
  assert.equal(evaluateActivationEligibility(system, { now: 0 }).reason, 'LOCKED');
});

test('buildActivationRequest shape for a tool', () => {
  const request = buildActivationRequest(toolSystem(), {
    regionId: 'r1',
    behaviorId: 'b1',
    sceneId: 's1',
    actorId: 'a1',
    userId: 'u1',
    activationSource: 'regionEnter',
    ts: 123
  });
  assert.deepEqual(request, {
    action: 'interactableActivate',
    sceneId: 's1',
    regionId: 'r1',
    behaviorId: 'b1',
    sourceUuid: 'Fabricate.sys.tool.t1',
    interactableType: 'tool',
    systemId: 'sys',
    toolId: 't1',
    taskId: null,
    environmentId: null,
    actorId: 'a1',
    userId: 'u1',
    activationSource: 'regionEnter',
    ts: 123
  });
});

test('buildActivationRequest shape for a gathering task', () => {
  const request = buildActivationRequest(taskSystem(), {
    regionId: 'r2',
    behaviorId: 'b2',
    sceneId: 's2',
    actorId: 'a2',
    userId: 'u2',
    activationSource: 'gmTest',
    ts: 9
  });
  assert.equal(request.interactableType, 'gatheringTask');
  assert.equal(request.taskId, 'task1');
  assert.equal(request.toolId, null);
  assert.equal(request.environmentId, 'env-1');
  assert.equal(request.activationSource, 'gmTest');
});

test('validateActivationRequest passes the full checklist for a tool', () => {
  const system = toolSystem();
  const request = buildActivationRequest(system, { regionId: 'r', behaviorId: 'b', sceneId: 's', actorId: 'a', userId: 'u', activationSource: 'regionEnter', ts: 1 });
  const result = validateActivationRequest(request, {
    behaviorSystem: system,
    now: 0,
    isGM: false,
    canControlActor: true,
    sourceExists: true,
    tokenInside: true
  });
  assert.deepEqual(result, { ok: true, reason: null });
});

test('validateActivationRequest: NO_BEHAVIOR when system absent', () => {
  assert.equal(validateActivationRequest({ interactableType: 'tool' }, { behaviorSystem: null, now: 0 }).reason, 'NO_BEHAVIOR');
});

test('validateActivationRequest: TYPE_MISMATCH', () => {
  const system = toolSystem();
  const result = validateActivationRequest({ interactableType: 'gatheringTask' }, { behaviorSystem: system, now: 0, canControlActor: true });
  assert.equal(result.reason, 'TYPE_MISMATCH');
});

test('validateActivationRequest: surfaces an eligibility failure', () => {
  const system = toolSystem({ locked: true });
  const result = validateActivationRequest({ interactableType: 'tool' }, { behaviorSystem: system, now: 0, canControlActor: true });
  assert.equal(result.reason, 'LOCKED');
});

test('validateActivationRequest: CANNOT_CONTROL_ACTOR unless GM', () => {
  const system = toolSystem();
  assert.equal(
    validateActivationRequest({ interactableType: 'tool' }, { behaviorSystem: system, now: 0, canControlActor: false }).reason,
    'CANNOT_CONTROL_ACTOR'
  );
  // GM bypass
  assert.equal(
    validateActivationRequest({ interactableType: 'tool' }, { behaviorSystem: system, now: 0, canControlActor: false, isGM: true, sourceExists: true, tokenInside: true }).ok,
    true
  );
});

test('validateActivationRequest: TOKEN_NOT_INSIDE and SOURCE_MISSING', () => {
  const system = toolSystem();
  assert.equal(
    validateActivationRequest({ interactableType: 'tool' }, { behaviorSystem: system, now: 0, canControlActor: true, tokenInside: false }).reason,
    'TOKEN_NOT_INSIDE'
  );
  assert.equal(
    validateActivationRequest({ interactableType: 'tool' }, { behaviorSystem: system, now: 0, canControlActor: true, tokenInside: true, sourceExists: false }).reason,
    'SOURCE_MISSING'
  );
});

test('validateActivationRequest: ENVIRONMENT_MISSING only for gatheringTask', () => {
  const system = taskSystem();
  assert.equal(
    validateActivationRequest({ interactableType: 'gatheringTask' }, { behaviorSystem: system, now: 0, canControlActor: true, tokenInside: true, sourceExists: true, environmentExists: false }).reason,
    'ENVIRONMENT_MISSING'
  );
  // tool ignores environmentExists
  const tool = toolSystem();
  assert.equal(
    validateActivationRequest({ interactableType: 'tool' }, { behaviorSystem: tool, now: 0, canControlActor: true, tokenInside: true, sourceExists: true, environmentExists: false }).ok,
    true
  );
});

test('describeGrant encodes tab + context shape per type', () => {
  assert.deepEqual(describeGrant(toolSystem()), { tab: 'gathering', context: { activeCanvasTool: null } });
  assert.deepEqual(describeGrant(taskSystem()), {
    tab: 'gathering',
    context: { environmentId: 'env-1', taskId: 'task1' }
  });
  assert.equal(describeGrant({ interactableType: 'mystery' }), null);
  assert.equal(describeGrant(null), null);
});
