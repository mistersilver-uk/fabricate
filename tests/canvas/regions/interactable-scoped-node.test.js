import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInteractableBehaviorSystem,
  readInteractableBehaviorSystem,
} from '../../../src/canvas/regions/interactableRegionFlags.js';
import { resolveMarkerImage } from '../../../src/canvas/regions/interactableMarkerDepletion.js';
import {
  summarizeInteractable,
  planSetTaskNodeLink,
  planRestockScopedNode,
} from '../../../src/canvas/regions/interactableConfigActions.js';
import { GatheringRichStateService } from '../../../src/systems/GatheringRichStateService.js';
import { GatheringEngine } from '../../../src/systems/GatheringEngine.js';
import { SETTING_KEYS } from '../../../src/config/settings.js';

const HOUR = 3600;
const SYS = 'sys-scoped';

const SYSTEM = { id: SYS, name: 'Scoped System', enabled: true, features: { gathering: true } };

// Library task carrying a task-linked node (the default). Mirrors the existing
// environment respawn integration fixtures.
function libraryTask() {
  return {
    id: 'lib-1',
    name: 'Mine Ore',
    enabled: true,
    dropRows: [],
    nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onStart', respawn: { policy: 'manual' } },
  };
}

function environmentRecord() {
  return {
    id: 'env-1',
    craftingSystemId: SYS,
    name: 'Quarry',
    enabled: true,
    selectionMode: 'targeted',
    enabledTaskIds: ['lib-1'],
    biomes: [],
    dangerTags: [],
    risk: 'safe',
    nodeRuntime: {
      'lib-1': {
        enabled: true,
        max: 3,
        current: 3,
        depletionTiming: 'onStart',
        respawn: { policy: 'manual' },
      },
    },
  };
}

// A minimal in-memory environment store standing in for GatheringEnvironmentStore.
function fakeEnvironmentStore(record) {
  let env = record;
  return {
    get: (id) => (id === env.id ? env : null),
    list: () => [env],
    update: async (id, patch) => {
      if (id !== env.id) return null;
      env = { ...env, ...patch };
      return env;
    },
    _peek: () => env,
  };
}

function richStateWith({ store, scopedBehaviors = new Map(), writes = [] } = {}) {
  const settings = new Map([
    [
      SETTING_KEYS.GATHERING_CONFIG,
      { systems: { [SYS]: { economy: { mode: 'nodes' }, tasks: [libraryTask()] } } },
    ],
  ]);
  return new GatheringRichStateService({
    environmentStore: store,
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      return value;
    },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    nowWorldTime: () => 0,
    rollD100: () => 1,
    resolveRegionBehavior: (ref) => scopedBehaviors.get(ref?.behaviorId) ?? null,
    writeInteractableBehavior: (ref, patch) => {
      writes.push({ ref, patch });
      // Mirror the active-GM behaviour write so a follow-up read sees the new node.
      const behavior = scopedBehaviors.get(ref?.behaviorId);
      if (behavior) behavior.system.node = patch.node;
    },
  });
}

function scopedBehavior({ behaviorId = 'b1', node }) {
  return {
    type: 'fabricate.interactable',
    id: behaviorId,
    system: {
      interactableType: 'gatheringTask',
      sourceUuid: 'Fabricate.sys.gatheringTask.lib-1',
      systemId: SYS,
      taskId: 'lib-1',
      environmentId: 'env-1',
      taskNodeLink: 'unlinked',
      node,
    },
  };
}

const REF = { sceneId: 's1', regionId: 'r1', behaviorId: 'b1' };

describe('interactable-scoped node — schema + read', () => {
  it('round-trips an unlinked node and downgrades a malformed one', () => {
    const built = buildInteractableBehaviorSystem({
      interactableType: 'gatheringTask',
      sourceUuid: 'Fabricate.sys.gatheringTask.lib-1',
      systemId: SYS,
      taskId: 'lib-1',
      taskNodeLink: 'unlinked',
      node: { enabled: true, max: 5, current: 4 },
    });
    assert.equal(built.taskNodeLink, 'unlinked');
    assert.equal(built.node.max, 5);

    const view = readInteractableBehaviorSystem({ type: 'fabricate.interactable', system: built });
    assert.equal(view.taskNodeLink, 'unlinked');
    assert.equal(view.node.current, 4);

    // A tool never carries an independent node.
    const tool = buildInteractableBehaviorSystem({
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sys.tool.t1',
      systemId: SYS,
      taskNodeLink: 'unlinked',
      node: { enabled: true, max: 5, current: 5 },
    });
    assert.equal(tool.taskNodeLink, 'linked');
    assert.equal(tool.node, null);
  });
});

describe('interactable-scoped node — routing (_resolveNodeSource via evaluateStart/commit)', () => {
  it('gates and decrements the behaviour node when a ref is supplied', async () => {
    const store = fakeEnvironmentStore(environmentRecord());
    const writes = [];
    const behaviors = new Map([['b1', scopedBehavior({ node: { enabled: true, max: 2, current: 2 } })]]);
    const richState = richStateWith({ store, scopedBehaviors: behaviors, writes });
    const task = { id: 'lib-1', nodes: libraryTask().nodes };

    // evaluateStart gates against the SCOPED pool (current 2 > 0 → not blocked).
    const start = await richState.evaluateStart({
      system: SYSTEM,
      environment: store.get('env-1'),
      task,
      interactableRef: REF,
    });
    assert.equal(start.blockedReasons.length, 0);
    assert.equal(start.evidence.nodes.current, 2);

    // commit decrements the SCOPED node via the writer seam, not the env runtime.
    const evidence = await richState.commitAcceptedAttempt({
      system: SYSTEM,
      environment: store.get('env-1'),
      task,
      outcome: { status: 'succeeded' },
      interactableRef: REF,
    });
    // The persisted discriminator is now `taskNodeLink:'unlinked'` (via scopedBehavior),
    // but the reframe leaves the transient internal source tag untouched: evidence still
    // reports `node.scope === 'interactable'`. This doubles as the reframe-invariant guard.
    assert.equal(evidence.node.scope, 'interactable');
    assert.equal(evidence.node.remaining, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].patch.node.current, 1);
    // The environment runtime is UNTOUCHED.
    assert.equal(store._peek().nodeRuntime['lib-1'].current, 3);
  });

  it('uses the environment path identically when no ref is supplied', async () => {
    const store = fakeEnvironmentStore(environmentRecord());
    const richState = richStateWith({ store });
    const task = { id: 'lib-1', nodes: libraryTask().nodes };

    const evidence = await richState.commitAcceptedAttempt({
      system: SYSTEM,
      environment: store.get('env-1'),
      task,
      outcome: { status: 'succeeded' },
    });
    assert.equal(evidence.node.scope, 'environment');
    assert.equal(evidence.node.remaining, 2);
    assert.equal(store._peek().nodeRuntime['lib-1'].current, 2);
  });

  it('falls back to the environment path when the behaviour is task-linked or gone', async () => {
    const store = fakeEnvironmentStore(environmentRecord());
    const behaviors = new Map([
      ['b-env', { type: 'fabricate.interactable', id: 'b-env', system: { interactableType: 'gatheringTask', sourceUuid: 'x', systemId: SYS, taskId: 'lib-1', taskNodeLink: 'linked', node: null } }],
    ]);
    const richState = richStateWith({ store, scopedBehaviors: behaviors });
    const task = { id: 'lib-1', nodes: libraryTask().nodes };

    // Task-linked behaviour → env decrement.
    const evEnv = await richState.commitAcceptedAttempt({
      system: SYSTEM,
      environment: store.get('env-1'),
      task,
      outcome: { status: 'succeeded' },
      interactableRef: { sceneId: 's', regionId: 'r', behaviorId: 'b-env' },
    });
    assert.equal(evEnv.node.scope, 'environment');

    // Behaviour gone → env decrement, no throw.
    const evGone = await richState.commitAcceptedAttempt({
      system: SYSTEM,
      environment: store.get('env-1'),
      task,
      outcome: { status: 'succeeded' },
      interactableRef: { sceneId: 's', regionId: 'r', behaviorId: 'missing' },
    });
    assert.equal(evGone.node.scope, 'environment');
  });
});

describe('interactable-scoped node — independence', () => {
  it('depleting the scoped pool leaves the environment pool untouched and vice-versa', async () => {
    const store = fakeEnvironmentStore(environmentRecord());
    const writes = [];
    const behaviors = new Map([['b1', scopedBehavior({ node: { enabled: true, max: 5, current: 5 } })]]);
    const richState = richStateWith({ store, scopedBehaviors: behaviors, writes });
    const task = { id: 'lib-1', nodes: libraryTask().nodes };

    // Deplete scoped once.
    await richState.commitAcceptedAttempt({
      system: SYSTEM,
      environment: store.get('env-1'),
      task,
      outcome: { status: 'succeeded' },
      interactableRef: REF,
    });
    assert.equal(behaviors.get('b1').system.node.current, 4);
    assert.equal(store._peek().nodeRuntime['lib-1'].current, 3);

    // Deplete environment once.
    await richState.commitAcceptedAttempt({
      system: SYSTEM,
      environment: store.get('env-1'),
      task,
      outcome: { status: 'succeeded' },
    });
    assert.equal(store._peek().nodeRuntime['lib-1'].current, 2);
    assert.equal(behaviors.get('b1').system.node.current, 4); // unchanged
  });
});

describe('interactable-scoped node — respawnInteractableNode lifecycle', () => {
  it('regrows an overTime/guaranteed scoped pool and never an nonRegenerating one', async () => {
    const store = fakeEnvironmentStore(environmentRecord());
    const richState = richStateWith({ store });

    const overTime = {
      enabled: true,
      max: 3,
      current: 0,
      depletionTiming: 'onStart',
      respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 },
    };
    const r1 = await richState.respawnInteractableNode({ node: overTime, worldTime: 2 * HOUR });
    assert.equal(r1.changed, true);
    assert.equal(r1.node.current, 2);

    const nonRegen = {
      enabled: true,
      max: 3,
      current: 0,
      depletionTiming: 'onStart',
      respawn: { policy: 'nonRegenerating' },
    };
    const r2 = await richState.respawnInteractableNode({ node: nonRegen, worldTime: 5 * HOUR });
    assert.equal(r2.changed, false);
    assert.equal(r2.node.current, 0);

    const manual = {
      enabled: true,
      max: 3,
      current: 0,
      depletionTiming: 'onStart',
      respawn: { policy: 'manual' },
    };
    const r3 = await richState.respawnInteractableNode({ node: manual, worldTime: 5 * HOUR });
    assert.equal(r3.changed, false);
  });
});

describe('interactable-scoped node — engine respawn enumeration', () => {
  it('scans a fake scenes graph and writes the changed node via the seam', async () => {
    const store = fakeEnvironmentStore(environmentRecord());
    const richState = richStateWith({ store });

    const behavior = scopedBehavior({
      node: {
        enabled: true,
        max: 3,
        current: 0,
        depletionTiming: 'onStart',
        respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 },
      },
    });
    const region = { behaviors: [behavior], parent: { id: 's1' }, id: 'r1' };
    behavior.parent = region;
    const scene = { id: 's1', regions: [region] };

    const writes = [];
    const engine = new GatheringEngine({
      environmentStore: store,
      runManager: {},
      richState,
      evaluator: {},
      getSystems: () => [SYSTEM],
      isPrimaryGM: () => true,
      scenes: () => [scene],
      applyInteractableBehaviorUpdate: async (ref, update) => {
        writes.push({ ref, update });
      },
    });

    const changed = await engine._processInteractableNodeRespawn(2 * HOUR);
    assert.equal(changed.length, 1);
    assert.deepEqual(changed[0], { sceneId: 's1', regionId: 'r1', behaviorId: 'b1' });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].update.system.node.current, 2);
  });

  it('no-ops without the scenes/writer seams', async () => {
    const store = fakeEnvironmentStore(environmentRecord());
    const richState = richStateWith({ store });
    const engine = new GatheringEngine({
      environmentStore: store,
      runManager: {},
      richState,
      evaluator: {},
      getSystems: () => [SYSTEM],
      isPrimaryGM: () => true,
      scenes: () => null,
      applyInteractableBehaviorUpdate: null,
    });
    const changed = await engine._processInteractableNodeRespawn(HOUR);
    assert.deepEqual(changed, []);
  });
});

describe('interactable-scoped node — marker swap', () => {
  it('drives the marker from the scoped node current + swapImage', () => {
    const system = readInteractableBehaviorSystem(
      scopedBehavior({
        node: { enabled: true, max: 3, current: 0, depletedBehavior: { swapImage: 'icons/svg/hazard.svg' } },
      })
    );
    system.linkedVisual = { documentName: 'Tile', uuid: 'Scene.s.Tile.t', mode: 'marker', missingPolicy: 'warn' };

    const depleted = resolveMarkerImage({
      behaviorSystem: system,
      environment: null,
      task: null,
      availableImg: 'icons/svg/ore.svg',
    });
    assert.equal(depleted.depleted, true);
    assert.equal(depleted.desiredImg, 'icons/svg/hazard.svg');

    system.node.current = 2;
    const available = resolveMarkerImage({
      behaviorSystem: system,
      environment: null,
      task: null,
      availableImg: 'icons/svg/ore.svg',
    });
    assert.equal(available.depleted, false);
    assert.equal(available.desiredImg, 'icons/svg/ore.svg');
  });
});

describe('interactable-scoped node — config actions', () => {
  it('summarizeInteractable surfaces the task-node link + node summary', () => {
    const summary = summarizeInteractable(
      scopedBehavior({
        node: { enabled: true, max: 3, current: 0, respawn: { policy: 'nonRegenerating' } },
      }),
      { resolveVisual: () => null }
    );
    assert.equal(summary.taskNodeLink, 'unlinked');
    assert.equal(summary.node.max, 3);
    assert.equal(summary.node.current, 0);
    assert.equal(summary.node.depleted, true);
    assert.equal(summary.node.permanentlyExhausted, true);
  });

  it('summarizeInteractable reports linked with a null node by default', () => {
    const summary = summarizeInteractable(
      { type: 'fabricate.interactable', system: { interactableType: 'gatheringTask', sourceUuid: 'x', systemId: SYS, taskId: 'lib-1', taskNodeLink: 'linked', node: null } },
      { resolveVisual: () => null }
    );
    assert.equal(summary.taskNodeLink, 'linked');
    assert.equal(summary.node, null);
  });

  it('planSetTaskNodeLink toggles the link and seeds/clears the node', () => {
    const linkedSystem = { interactableType: 'gatheringTask', state: {}, taskNodeLink: 'linked', node: null, taskId: 'lib-1' };
    const toUnlinked = planSetTaskNodeLink(linkedSystem, 'unlinked');
    assert.equal(toUnlinked.system.taskNodeLink, 'unlinked');
    assert.ok(toUnlinked.system.node);

    const unlinkedSystem = { interactableType: 'gatheringTask', state: {}, taskNodeLink: 'unlinked', node: { enabled: true, max: 3, current: 3 }, taskId: 'lib-1' };
    const toLinked = planSetTaskNodeLink(unlinkedSystem, 'linked');
    assert.equal(toLinked.system.taskNodeLink, 'linked');
    assert.equal(toLinked.system.node, null);

    // A tool can never be unlinked.
    const tool = { interactableType: 'tool', state: {}, taskNodeLink: 'linked', node: null };
    assert.equal(planSetTaskNodeLink(tool, 'unlinked'), null);
  });

  it('planSetTaskNodeLink round-trips and preserves the independent pool non-destructively', () => {
    // Author an independent pool, switch back to linked, then unlink again — the
    // pool's authored config (max/current/timing) survives the round-trip.
    const pool = { enabled: true, max: 7, current: 5, depletionTiming: 'onSuccess', respawn: { policy: 'overTime', gainMode: 'guaranteed' } };
    const unlinked = { interactableType: 'gatheringTask', state: {}, taskNodeLink: 'unlinked', node: pool, taskId: 'lib-1' };

    const toLinked = planSetTaskNodeLink(unlinked, 'linked');
    assert.equal(toLinked.system.taskNodeLink, 'linked');
    assert.equal(toLinked.system.node, null);

    // Switching back to unlinked while the behaviour still carries the pool keeps it.
    const stillCarrying = { interactableType: 'gatheringTask', state: {}, taskNodeLink: 'unlinked', node: pool, taskId: 'lib-1' };
    const toUnlinked = planSetTaskNodeLink(stillCarrying, 'linked');
    assert.equal(toUnlinked.system.node, null);

    // Re-seeding from a behaviour that still has the authored node preserves it.
    const reseed = planSetTaskNodeLink({ interactableType: 'gatheringTask', state: {}, taskNodeLink: 'linked', node: pool, taskId: 'lib-1' }, 'unlinked');
    assert.equal(reseed.system.taskNodeLink, 'unlinked');
    assert.equal(reseed.system.node.max, 7);
    assert.equal(reseed.system.node.current, 5);
    assert.equal(reseed.system.node.depletionTiming, 'onSuccess');
    assert.equal(reseed.system.node.respawn.policy, 'overTime');
  });

  it('planRestockScopedNode tops up an unlinked pool but is a no-op for nonRegenerating', () => {
    const unlinkedSystem = {
      interactableType: 'gatheringTask',
      state: {},
      taskNodeLink: 'unlinked',
      node: { enabled: true, max: 3, current: 0, respawn: { policy: 'overTime', gainMode: 'guaranteed' } },
      taskId: 'lib-1',
    };
    const plan = planRestockScopedNode(unlinkedSystem, { current: 3, max: 4 });
    assert.equal(plan.system.node.current, 3);
    assert.equal(plan.system.node.max, 4);

    // Restocking above the new max clamps to max.
    const plan2 = planRestockScopedNode(unlinkedSystem, { current: 10, max: 4 });
    assert.equal(plan2.system.node.current, 4);

    const nonRegen = {
      interactableType: 'gatheringTask',
      state: {},
      taskNodeLink: 'unlinked',
      node: { enabled: true, max: 3, current: 0, respawn: { policy: 'nonRegenerating' } },
      taskId: 'lib-1',
    };
    assert.equal(planRestockScopedNode(nonRegen, { current: 3, max: 3 }), null);
  });
});

describe('interactable-scoped node — default link', () => {
  it('a behaviour with no taskNodeLink reads as linked with a null node', () => {
    const view = readInteractableBehaviorSystem({
      type: 'fabricate.interactable',
      system: { interactableType: 'gatheringTask', sourceUuid: 'x', systemId: SYS, taskId: 'lib-1', environmentId: 'env-1' },
    });
    assert.equal(view.taskNodeLink, 'linked');
    assert.equal(view.node, null);
  });
});
