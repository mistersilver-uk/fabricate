/**
 * The gathering half of the public API and its bootstrap seams (issue 1933): the facade wrappers
 * driven on the real class over the module-private engine holder, the bar predicate, the adapters,
 * and the composition wiring the boot contract cannot identity-check, as structure-contract rows.
 */
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Fabricate } from '../src/bootstrap/Fabricate.js';
import {
  getBarSelectableActors,
  isSelectableBarActor,
  setGatheringEngine,
} from '../src/bootstrap/gatheringRuntime.js';
import {
  callGatheringRuntimeWithCurrentViewer,
  createGatheringSelectableActorsGetter,
  evaluateGatheringExpression,
  processWorldTimeCallbacksSafely,
  withCurrentGatheringViewer,
} from '../src/gatheringBootstrapAdapters.js';
import { createGatheringToolAvailability } from '../src/gatheringToolRuntime.js';
import { GatheringGateAndCheckEvaluator } from '../src/systems/GatheringGateAndCheckEvaluator.js';
import { makeFacadeActor } from './helpers/fabricateFacadeHarness.js';
import { defineStructureContract } from './helpers/structureContract.js';

const PLAYER = { id: 'player', isGM: false };

/** A player-owned actor of one Foundry actor type. */
const ownedActor = (id, type, owners = [PLAYER.id]) =>
  Object.assign(makeFacadeActor(id, { ownerUserIds: owners }), { type, img: `${id}.webp` });

/**
 * The real facade over a recording engine installed in the module-private holder, a player
 * viewer, the world `actors`, and the persisted remembered-actor and extra-PC-type settings.
 */
function gatheringFacade({ remembered = 'remembered', actors = [], extraTypes = [] } = {}) {
  const calls = [];
  const record = (method, answer) => (payload) => {
    calls.push([method, payload]);
    return answer;
  };
  setGatheringEngine({
    listForActor: record('listForActor', 'listed'),
    getTaskDropBreakdown: record('getTaskDropBreakdown', 'breakdown'),
    requestStart: record('requestStart', { success: false, reason: 'probe' }),
  });
  const settings = {
    lastGatheringActor: remembered,
    additionalPlayerCharacterActorTypes: extraTypes,
  };
  globalThis.game = { user: PLAYER, actors, settings: { get: (_namespace, key) => settings[key] } };
  return { facade: Object.assign(new Fabricate(), { ready: true }), calls };
}

/** `[options, rememberedActorId the engine must receive]`: a truthy id overrides, null coalesces. */
const REMEMBERED_CASES = [
  [{}, 'remembered'],
  [{ rememberedActorId: null }, 'remembered'],
  [{ rememberedActorId: '' }, 'remembered'],
  [{ rememberedActorId: 'explicit' }, 'explicit'],
];

describe('the public gathering wrappers force the current user and the remembered actor', () => {
  for (const [wrapper, method] of [
    ['listGatheringForActor', 'listForActor'],
    ['getGatheringDropBreakdown', 'getTaskDropBreakdown'],
  ]) {
    for (const [options, expected] of REMEMBERED_CASES) {
      it(`${wrapper}(${JSON.stringify(options)}) reaches ${method} for ${expected}`, () => {
        const { facade, calls } = gatheringFacade();
        facade[wrapper]({ ...options, viewer: { id: 'spoofed-gm', isGM: true } });
        const [[called, payload]] = calls;
        assert.equal(called, method);
        assert.equal(payload.viewer, PLAYER, 'the current Foundry user, never a supplied viewer');
        assert.equal(payload.rememberedActorId, expected);
      });
    }
  }

  it('startGatheringAttempt requests a versioned start for the SAME actor the listing used', async () => {
    const remembered = ownedActor('remembered', 'character');
    const { facade, calls } = gatheringFacade({
      actors: [ownedActor('first', 'character'), remembered],
    });

    await facade.startGatheringAttempt({ environmentId: 'env', viewer: { id: 'x', isGM: true } });

    const [[method, payload]] = calls;
    assert.equal(method, 'requestStart', 'the routing wrapper, never startAttempt');
    assert.equal(payload.viewer, PLAYER);
    assert.equal(payload.actor, remembered, 'the remembered actor, not selectableActors[0]');
    assert.equal(payload.lifecycleVersion, 1);
  });
});

describe('the actor-selection bar composes ownership with the CONFIGURED player-character types', () => {
  it('admits an owned character, and an owned robot only once the GM configures robots', () => {
    const robot = ownedActor('robot', 'robot');
    gatheringFacade();
    assert.equal(
      isSelectableBarActor({ actor: ownedActor('pc', 'character'), viewer: PLAYER }),
      true
    );
    assert.equal(
      isSelectableBarActor({ actor: ownedActor('pc', 'character', []), viewer: PLAYER }),
      false
    );
    assert.equal(isSelectableBarActor({ actor: robot, viewer: PLAYER }), false);
    gatheringFacade({ extraTypes: ['robot'] });
    assert.equal(isSelectableBarActor({ actor: robot, viewer: PLAYER }), true);
  });

  it('lists the bar through that predicate, as redaction-safe { id, uuid, name, img } records', () => {
    const pc = ownedActor('pc', 'character');
    const { facade } = gatheringFacade({
      actors: [pc, ownedActor('npc', 'npc'), ownedActor('theirs', 'character', ['other'])],
    });
    assert.deepEqual(getBarSelectableActors({ viewer: PLAYER }), [pc]);
    assert.deepEqual(facade.listSelectableActors(), [
      { id: 'pc', uuid: 'Actor.pc', name: 'Actor pc', img: 'pc.webp' },
    ]);
  });
});

// The engine's scene-access, result-creator and failure-feedback seams are factory products the
// boot can see but not identity-check, so their construction is pinned where it is composed.
defineStructureContract(
  'the gathering engine is composed with the requesting viewer scene and its factory seams',
  { file: 'src/bootstrap/composeServices.js', fn: 'buildGatheringEngine' },
  {
    calls: [
      'createGatheringSceneAccess',
      'resolveViewerScene',
      'createGatheringResultCreator',
      'createGatheringFailureFeedback',
      'createGatheringToolAvailability',
      'createGatheringToolBreakage',
    ],
  }
);

defineStructureContract(
  'the location service senses travel-marker regions on any scene',
  { file: 'src/bootstrap/composeServices.js', fn: 'buildGatheringStores' },
  { calls: ['senseTravelMarkerRegions'] }
);

test('current-user viewer enforcement prevents public API viewer spoofing', () => {
  const currentUser = { id: 'real-user', isGM: false };
  const spoofedUser = { id: 'spoofed-gm', isGM: true };

  const payload = withCurrentGatheringViewer(
    { actor: { id: 'actor-1' }, viewer: spoofedUser, environmentId: 'env-a' },
    () => currentUser
  );

  assert.equal(payload.viewer, currentUser);
  assert.equal(payload.viewer.isGM, false);
  assert.equal(payload.environmentId, 'env-a');
});

test('public gathering API wrappers force current user before reaching runtime methods', () => {
  const calls = [];
  const currentUser = { id: 'real-user', isGM: false };
  const spoofedUser = { id: 'spoofed-gm', isGM: true };
  const runtime = {
    listForActor: (payload) => {
      calls.push({ method: 'listForActor', payload });
      return payload;
    },
    startAttempt: (payload) => {
      calls.push({ method: 'startAttempt', payload });
      return payload;
    }
  };

  const listPayload = callGatheringRuntimeWithCurrentViewer(
    runtime,
    'listForActor',
    { viewer: spoofedUser, rememberedActorId: 'actor-a' },
    () => currentUser
  );
  const startPayload = callGatheringRuntimeWithCurrentViewer(
    runtime,
    'startAttempt',
    { viewer: spoofedUser, environmentId: 'env-a', taskId: 'task-a' },
    () => currentUser
  );

  assert.equal(listPayload.viewer, currentUser);
  assert.equal(startPayload.viewer, currentUser);
  assert.equal(calls[0].payload.viewer.isGM, false);
  assert.equal(calls[1].payload.viewer.isGM, false);
  assert.deepEqual(calls.map(call => call.method), ['listForActor', 'startAttempt']);
});

test('selectable-actors adapter accepts GatheringEngine payload shape and preserves viewer permissions', () => {
  const player = { id: 'player', isGM: false };
  const gm = { id: 'gm', isGM: true };
  const ownedActor = { id: 'owned', ownership: { player: 3 } };
  const gmOnlyActor = { id: 'gm-only', ownership: {} };
  const actors = new Map([
    [ownedActor.id, ownedActor],
    [gmOnlyActor.id, gmOnlyActor]
  ]);

  const getSelectableActors = createGatheringSelectableActorsGetter({
    getActors: () => actors,
    getCurrentUser: () => player,
    isSelectable: (actor, viewer) => viewer?.isGM === true || actor.ownership?.[viewer?.id] >= 3
  });

  assert.deepEqual(getSelectableActors({ viewer: player }).map(actor => actor.id), ['owned']);
  assert.deepEqual(getSelectableActors({ viewer: gm }).map(actor => actor.id), ['owned', 'gm-only']);
  assert.deepEqual(getSelectableActors().map(actor => actor.id), ['owned']);
});

test('expression adapter accepts evaluator payload shape and uses actor roll data', async () => {
  const rollCalls = [];
  const previousRoll = globalThis.Roll;
  globalThis.Roll = class FakeRoll {
    constructor(formula, data) {
      this.formula = formula;
      this.data = data;
      rollCalls.push({ formula, data });
    }

    async evaluate(options) {
      rollCalls[rollCalls.length - 1].options = options;
      return { total: this.formula === '@skills.sur.mod + 10' ? this.data.skills.sur.mod + 10 : 12 };
    }
  };

  try {
    const actor = {
      getRollData: () => ({ skills: { sur: { mod: 5 } } })
    };
    const evaluator = new GatheringGateAndCheckEvaluator({
      evaluateExpression: evaluateGatheringExpression
    });

    const result = await evaluator.evaluateVisibility({
      gate: { formula: '@skills.sur.mod + 10', threshold: '12' },
      actor
    });

    assert.equal(result.visible, true);
    assert.equal(result.reasonCode, 'VISIBLE');
    assert.deepEqual(rollCalls.map(call => call.formula), ['@skills.sur.mod + 10', '12']);
    assert.deepEqual(rollCalls[0].data, { skills: { sur: { mod: 5 } } });
    // async evaluate() (not evaluateSync()), with the non-interactive option so a
    // manual roll-fulfilment dialog can never surface mid-gather (defect 3).
    assert.deepEqual(rollCalls[0].options, { allowInteractive: false });
  } finally {
    if (previousRoll === undefined) {
      delete globalThis.Roll;
    } else {
      globalThis.Roll = previousRoll;
    }
  }
});

test('world-time processor helper continues after synchronous throws and async rejections', async () => {
  const calls = [];
  const errors = [];

  const settlements = processWorldTimeCallbacksSafely([
    {
      label: 'Crafting',
      callback: () => {
        calls.push('crafting');
        throw new Error('crafting failed');
      }
    },
    {
      label: 'Salvage',
      callback: async () => {
        calls.push('salvage');
        throw new Error('salvage failed');
      }
    },
    {
      label: 'Gathering',
      callback: () => {
        calls.push('gathering');
      }
    }
  ], {
    onError: (label, error) => errors.push({ label, message: error.message })
  });

  assert.deepEqual(calls, ['crafting', 'salvage', 'gathering']);
  await Promise.all(settlements);
  assert.deepEqual(errors, [
    { label: 'Crafting', message: 'crafting failed' },
    { label: 'Salvage', message: 'salvage failed' }
  ]);
});

test('awaited startup settlement delays fabricate.ready until all guarded processors settle', async () => {
  const calls = [];
  const errors = [];
  let releaseCrafting;

  async function simulatedReadyHook() {
    await Promise.all(processWorldTimeCallbacksSafely([
      {
        label: 'Crafting',
        callback: () => {
          calls.push('crafting');
          return new Promise(resolve => {
            releaseCrafting = resolve;
          });
        }
      },
      {
        label: 'Salvage',
        callback: () => {
          calls.push('salvage');
          throw new Error('salvage failed');
        }
      },
      {
        label: 'Gathering',
        callback: async () => {
          calls.push('gathering');
          throw new Error('gathering failed');
        }
      }
    ], {
      onError: (label, error) => errors.push({ label, message: error.message })
    }));
    calls.push('fabricate.ready');
  }

  const readyPromise = simulatedReadyHook();
  assert.deepEqual(calls, ['crafting', 'salvage', 'gathering']);
  assert.equal(calls.includes('fabricate.ready'), false);

  releaseCrafting();
  await readyPromise;

  assert.deepEqual(calls, ['crafting', 'salvage', 'gathering', 'fabricate.ready']);
  assert.deepEqual(errors, [
    { label: 'Salvage', message: 'salvage failed' },
    { label: 'Gathering', message: 'gathering failed' }
  ]);
});

test('tool availability injectable blocks when actor lacks a required library tool', async () => {
  const availability = createGatheringToolAvailability({
    craftingSystemManager: {
      toolMatchesItem: (_recipe, tool, item) => tool.componentId === item.componentId
    },
    evaluator: { evaluateRequirement: async () => ({ allowed: true }) }
  });

  const result = await availability.check({
    actor: { uuid: 'Actor.actor-1', items: [] },
    system: { id: 'system-a' },
    task: { id: 'task-a' },
    tools: [{ componentId: 'tool-pick' }]
  });

  assert.equal(result.available, false);
  assert.deepEqual(result.missing, [{ componentId: 'tool-pick' }]);
});

test('tool availability injectable treats actor tools flagged broken as missing', async () => {
  const availability = createGatheringToolAvailability({
    craftingSystemManager: {
      toolMatchesItem: (_recipe, tool, item) => tool.componentId === item.componentId
    },
    evaluator: { evaluateRequirement: async () => ({ allowed: true }) }
  });
  const brokenItem = {
    uuid: 'Item.pick',
    componentId: 'tool-pick',
    flags: { fabricate: { toolBroken: true } },
    getFlag: (namespace, key) => namespace === 'fabricate' && key === 'toolBroken' ? true : undefined
  };

  const result = await availability.check({
    actor: { uuid: 'Actor.actor-1', items: [brokenItem] },
    system: { id: 'system-a' },
    task: { id: 'task-a' },
    tools: [{ componentId: 'tool-pick' }]
  });

  assert.equal(result.available, false);
  assert.deepEqual(result.missing, [{ componentId: 'tool-pick' }]);
});
