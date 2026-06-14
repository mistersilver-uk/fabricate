import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateActivationEligibility,
  shouldPromptOnEnter,
  resolveMarkerHidden,
  buildActivationRequest,
  validateActivationRequest,
  describeGrant,
  activationDenialMessageKey
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

function taskSystem({ stateOverrides = {} } = {}) {
  return {
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    systemId: 'sys',
    toolId: null,
    taskId: 'task1',
    environmentId: 'env-1',
    state: baseState(stateOverrides)
  };
}

// --- Visibility decisions (prompt + marker hidden) --------------------------
//
// shouldPromptOnEnter / resolveMarkerHidden are VISIBILITY decisions, distinct
// from evaluateActivationEligibility. Concealed = DISABLED OR explicitly HIDDEN.
// A LOCKED interactable is VISIBLE: prompt fires + marker visible (the LOCKED
// denial is enforced at Interact time by validateActivationRequest).

function withPresentation(system, presentation) {
  return { ...system, presentation };
}

test('shouldPromptOnEnter: enabled + unlocked → prompt', () => {
  assert.equal(shouldPromptOnEnter(toolSystem()), true);
});

test('shouldPromptOnEnter: LOCKED → still prompt (lock has teeth at Interact, not the prompt)', () => {
  assert.equal(shouldPromptOnEnter(toolSystem({ locked: true })), true);
});

test('shouldPromptOnEnter: consumed / uses-exhausted / cooldown → still prompt (denied at Interact)', () => {
  assert.equal(shouldPromptOnEnter(toolSystem({ consumed: true })), true, 'consumed still prompts');
  assert.equal(shouldPromptOnEnter(toolSystem({ uses: { max: 1, used: 1 } })), true, 'uses-exhausted still prompts');
  assert.equal(
    shouldPromptOnEnter(toolSystem({ cooldown: { seconds: 60, lastUsedWorldTime: 100 } })),
    true,
    'cooldown still prompts'
  );
});

test('shouldPromptOnEnter: DISABLED → no prompt', () => {
  assert.equal(shouldPromptOnEnter(toolSystem({ enabled: false })), false);
});

test('shouldPromptOnEnter: explicitly HIDDEN → no prompt', () => {
  assert.equal(shouldPromptOnEnter(withPresentation(toolSystem(), { hidden: true })), false);
});

test('shouldPromptOnEnter: locked + disabled → disabled wins (no prompt)', () => {
  assert.equal(shouldPromptOnEnter(toolSystem({ enabled: false, locked: true })), false);
});

test('resolveMarkerHidden: enabled + unlocked → visible', () => {
  assert.equal(resolveMarkerHidden(toolSystem()), false);
});

test('resolveMarkerHidden: LOCKED → still visible (locked stays visible to players)', () => {
  assert.equal(resolveMarkerHidden(toolSystem({ locked: true })), false);
});

test('resolveMarkerHidden: DISABLED → hidden', () => {
  assert.equal(resolveMarkerHidden(toolSystem({ enabled: false })), true);
});

test('resolveMarkerHidden: explicitly HIDDEN → hidden', () => {
  assert.equal(resolveMarkerHidden(withPresentation(toolSystem(), { hidden: true })), true);
});

test('resolveMarkerHidden: locked + disabled → disabled wins (hidden)', () => {
  assert.equal(resolveMarkerHidden(toolSystem({ enabled: false, locked: true })), true);
});

test('visibility decisions tolerate a missing/empty system shape (no throw) and treat it as unconfigured/inert', () => {
  // Since issue 342 a missing/empty system is UNCONFIGURED ⇒ concealed/inert: no
  // prompt, marker hidden. This is the safe default (an undefined/malformed system
  // can never be a real configured interactable) and never throws.
  assert.equal(shouldPromptOnEnter(undefined), false);
  assert.equal(shouldPromptOnEnter({}), false);
  assert.equal(resolveMarkerHidden(undefined), true);
  assert.equal(resolveMarkerHidden({}), true);
});

// --- Unconfigured interactable is inert (issue 342) -------------------------
//
// A `fabricate.interactable` born via the native "+ Add Behavior" path carries the
// unconfigured sentinels and no real id. It must be concealed (no prompt, hidden
// marker) and DENIED (never thrown) until a GM configures it.

function unconfiguredToolSystem(overrides = {}) {
  return {
    interactableType: 'tool',
    sourceUuid: 'Fabricate.unconfigured.tool',
    systemId: 'unconfigured',
    toolId: null,
    taskId: null,
    environmentId: null,
    state: baseState(),
    ...overrides
  };
}

test('unconfigured ⇒ concealed: no on-enter prompt, marker hidden from players', () => {
  const system = unconfiguredToolSystem();
  assert.equal(shouldPromptOnEnter(system), false, 'no prompt while unconfigured');
  assert.equal(resolveMarkerHidden(system), true, 'marker hidden while unconfigured');
});

test('a configured interactable is unaffected by the unconfigured concealment', () => {
  // The fully-configured tool/task fixtures still prompt + stay visible.
  assert.equal(shouldPromptOnEnter(toolSystem()), true);
  assert.equal(resolveMarkerHidden(toolSystem()), false);
});

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

test('eligibility: a gathering-task interactable has NO per-interactable node gate (env nodeRuntime owns depletion)', () => {
  // A region-first gathering-task interactable is a pure (environment, task)
  // shortcut: it carries no per-interactable node pool, so eligibility never trips
  // on NODE_DEPLETED. Node depletion is enforced by the gathering engine against
  // the environment's `nodeRuntime[taskId]` when the session opens.
  assert.deepEqual(evaluateActivationEligibility(taskSystem(), { now: 0 }), { eligible: true, reason: null });
});

test('eligibility: state gates still trip for a gathering task', () => {
  const system = taskSystem({ stateOverrides: { locked: true } });
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

test('validateActivationRequest: an UNCONFIGURED interactable is DENIED (never thrown), checked first', () => {
  const system = unconfiguredToolSystem();
  // Even with every other collaborator green, an unconfigured behaviour is denied
  // with the dedicated UNCONFIGURED reason — and it does not throw.
  const result = validateActivationRequest(
    { interactableType: 'tool' },
    { behaviorSystem: system, now: 0, isGM: true, canControlActor: true, tokenInside: true, sourceExists: true }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'UNCONFIGURED');

  // UNCONFIGURED is decided ahead of TYPE_MISMATCH: a stale request type against
  // the sentinel default still denies cleanly with UNCONFIGURED.
  const mismatch = validateActivationRequest(
    { interactableType: 'gatheringTask' },
    { behaviorSystem: system, now: 0, isGM: true, canControlActor: true, tokenInside: true }
  );
  assert.equal(mismatch.reason, 'UNCONFIGURED');
});

test('validateActivationRequest: a configured interactable is unaffected by the unconfigured gate', () => {
  const system = toolSystem();
  const result = validateActivationRequest(
    { interactableType: 'tool' },
    { behaviorSystem: system, now: 0, canControlActor: true, tokenInside: true, sourceExists: true }
  );
  assert.equal(result.ok, true);
});

test('describeGrant encodes tab + context shape per type (tools open Crafting)', () => {
  // A Tool station belongs to crafting, so it opens the Crafting tab.
  assert.deepEqual(describeGrant(toolSystem()), { tab: 'crafting', context: { activeCanvasTool: null } });
  assert.deepEqual(describeGrant(taskSystem()), {
    tab: 'gathering',
    context: { environmentId: 'env-1', taskId: 'task1' }
  });
  assert.equal(describeGrant({ interactableType: 'mystery' }), null);
  assert.equal(describeGrant(null), null);
});

// --- activationDenialMessageKey (denial reason → localization key) -----------

test('activationDenialMessageKey maps every reason to a non-default key', () => {
  // Every reason validateActivationRequest / evaluateActivationEligibility can
  // return resolves to a dedicated (non-generic) key.
  const cases = {
    DISABLED: 'FABRICATE.Canvas.Interactable.Denied.Disabled',
    LOCKED: 'FABRICATE.Canvas.Interactable.Denied.Locked',
    CONSUMED: 'FABRICATE.Canvas.Interactable.Denied.Consumed',
    USES_EXHAUSTED: 'FABRICATE.Canvas.Interactable.Denied.UsesExhausted',
    COOLDOWN: 'FABRICATE.Canvas.Interactable.Denied.Cooldown',
    CANNOT_CONTROL_ACTOR: 'FABRICATE.Canvas.Interactable.Denied.CannotControl',
    TOKEN_NOT_INSIDE: 'FABRICATE.Canvas.Interactable.Denied.NotInside',
    SOURCE_MISSING: 'FABRICATE.Canvas.Interactable.Denied.SourceMissing',
    UNCONFIGURED: 'FABRICATE.Canvas.Interactable.Denied.Unconfigured',
    ENVIRONMENT_MISSING: 'FABRICATE.Canvas.Interactable.Denied.EnvironmentMissing'
  };
  const generic = 'FABRICATE.Canvas.Interactable.Denied.Generic';
  for (const [reason, key] of Object.entries(cases)) {
    assert.equal(activationDenialMessageKey(reason), key, `${reason} maps to its dedicated key`);
    assert.notEqual(activationDenialMessageKey(reason), generic, `${reason} is not the generic fallback`);
  }
});

test('activationDenialMessageKey falls back to the generic key for unknown/blank reasons', () => {
  const generic = 'FABRICATE.Canvas.Interactable.Denied.Generic';
  assert.equal(activationDenialMessageKey('NO_BEHAVIOR'), generic, 'internal NO_BEHAVIOR has no player copy ⇒ generic');
  assert.equal(activationDenialMessageKey('TYPE_MISMATCH'), generic, 'internal TYPE_MISMATCH ⇒ generic');
  assert.equal(activationDenialMessageKey('something-unmapped'), generic);
  assert.equal(activationDenialMessageKey(''), generic);
  assert.equal(activationDenialMessageKey(null), generic);
  assert.equal(activationDenialMessageKey(undefined), generic);
});
