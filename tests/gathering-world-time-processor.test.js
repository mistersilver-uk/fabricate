import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildInteractableBehaviorSystem } from '../src/canvas/regions/interactableRegionFlags.js';
import { GatheringWorldTimeProcessor } from '../src/systems/GatheringWorldTimeProcessor.js';

const SYS = 'sys-1';

function enabledSystemsSeam(systems = [{ id: SYS, enabled: true, features: { gathering: true } }]) {
  return () => new Map(systems.map((system) => [String(system.id), system]));
}

// Minimal environment store stand-in (only `list()` is consumed).
function environmentStore(records) {
  return { list: () => records };
}

// A fake interactable region behaviour carrying an unlinked, nodes-enabled
// scoped node, shaped like the real region-behaviour flags read the engine uses.
function scopedBehavior({ behaviorId = 'b1', regionId = 'r1', sceneId = 's1' } = {}) {
  const system = buildInteractableBehaviorSystem({
    interactableType: 'gatheringTask',
    sourceUuid: 'Compendium.fabricate.tasks.task-1',
    systemId: SYS,
    taskId: 'task-1',
    taskNodeLink: 'unlinked',
    node: { enabled: true, max: 3, current: 0 },
  });
  const behavior = {
    id: behaviorId,
    type: 'fabricate.interactable',
    system,
    parent: { id: regionId, parent: { id: sceneId } },
  };
  const region = { id: regionId, behaviors: [behavior], parent: { id: sceneId } };
  behavior.parent = region;
  const scene = { id: sceneId, regions: [region] };
  return { scene, behavior, region };
}

describe('GatheringWorldTimeProcessor', () => {
  let originalHooks;

  beforeEach(() => {
    originalHooks = globalThis.Hooks;
  });

  afterEach(() => {
    globalThis.Hooks = originalHooks;
  });

  it('runs the stamina regen pass over actors in stamina-enabled systems', async () => {
    const seen = [];
    const richState = {
      staminaEnabled: (id) => id === SYS,
      regenerateActorStamina: async ({ actor, systemId, worldTime }) => {
        seen.push({ actorId: actor.id, systemId, worldTime });
        return actor.id === 'a1';
      },
    };
    const processor = new GatheringWorldTimeProcessor({
      richState,
      getActors: () => [{ id: 'a1' }, { id: 'a2' }],
      enabledGatheringSystems: enabledSystemsSeam(),
    });

    const changed = await processor._processStaminaRegen(1000);

    assert.deepEqual(changed, [{ actorId: 'a1', systemId: SYS }]);
    assert.deepEqual(
      seen.map((entry) => entry.worldTime),
      [1000, 1000]
    );
  });

  it('runs the environment node respawn pass for nodes-enabled systems', async () => {
    const richState = {
      nodesEnabled: (id) => id === SYS,
      respawnNodes: async ({ environment }) => environment.id === 'env-1',
    };
    const processor = new GatheringWorldTimeProcessor({
      richState,
      environmentStore: environmentStore([
        { id: 'env-1', craftingSystemId: SYS },
        { id: 'env-2', craftingSystemId: 'other' },
      ]),
      enabledGatheringSystems: enabledSystemsSeam(),
    });

    const changed = await processor._processNodeRespawn(2000);

    assert.deepEqual(changed, [{ environmentId: 'env-1' }]);
  });

  it('runs the interactable node respawn pass and fires the nodeRespawned hook payload', async () => {
    const { scene } = scopedBehavior();
    const hookCalls = [];
    globalThis.Hooks = {
      callAll: (name, payload) => hookCalls.push({ name, payload }),
    };
    const writes = [];
    const richState = {
      nodesEnabled: (id) => id === SYS,
      respawnInteractableNode: async () => ({ changed: true, node: { current: 2, max: 3 } }),
    };
    const processor = new GatheringWorldTimeProcessor({
      richState,
      scenes: () => [scene],
      applyInteractableBehaviorUpdate: async (ref, update) => writes.push({ ref, update }),
      enabledGatheringSystems: enabledSystemsSeam(),
    });

    const changed = await processor._processInteractableNodeRespawn(2 * 3600);

    assert.deepEqual(changed, [{ sceneId: 's1', regionId: 'r1', behaviorId: 'b1' }]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].update.system.node.current, 2);
    assert.equal(hookCalls.length, 1);
    assert.equal(hookCalls[0].name, 'fabricate.gathering.nodeRespawned');
    assert.deepEqual(hookCalls[0].payload, {
      interactableRef: { sceneId: 's1', regionId: 'r1', behaviorId: 'b1' },
      systemId: SYS,
      taskId: 'task-1',
      current: 2,
      max: 3,
    });
  });

  it('forwards worldTime verbatim to every pass and returns the aggregate shape', async () => {
    const { scene } = scopedBehavior();
    globalThis.Hooks = { callAll: () => {} };
    const staminaWorldTimes = [];
    const nodeWorldTimes = [];
    const interactableWorldTimes = [];
    const richState = {
      staminaEnabled: () => true,
      regenerateActorStamina: async ({ worldTime }) => {
        staminaWorldTimes.push(worldTime);
        return true;
      },
      nodesEnabled: () => true,
      respawnNodes: async ({ worldTime }) => {
        nodeWorldTimes.push(worldTime);
        return true;
      },
      respawnInteractableNode: async ({ worldTime }) => {
        interactableWorldTimes.push(worldTime);
        return { changed: true, node: { current: 1, max: 3 } };
      },
    };
    const processor = new GatheringWorldTimeProcessor({
      richState,
      environmentStore: environmentStore([{ id: 'env-1', craftingSystemId: SYS }]),
      getActors: () => [{ id: 'a1' }],
      scenes: () => [scene],
      applyInteractableBehaviorUpdate: async () => {},
      enabledGatheringSystems: enabledSystemsSeam(),
    });

    const aggregate = await processor.processRegenAndRespawn(4242);

    assert.deepEqual(Object.keys(aggregate), [
      'staminaRegen',
      'nodeRespawn',
      'interactableNodeRespawn',
    ]);
    assert.deepEqual(aggregate.staminaRegen, [{ actorId: 'a1', systemId: SYS }]);
    assert.deepEqual(aggregate.nodeRespawn, [{ environmentId: 'env-1' }]);
    assert.deepEqual(aggregate.interactableNodeRespawn, [
      { sceneId: 's1', regionId: 'r1', behaviorId: 'b1' },
    ]);
    // worldTime forwarded verbatim — never re-derived from globalThis.game.time.
    assert.deepEqual(staminaWorldTimes, [4242]);
    assert.deepEqual(nodeWorldTimes, [4242]);
    assert.deepEqual(interactableWorldTimes, [4242]);
  });

  it('has no GM guard — runs its passes whenever called', async () => {
    // No isPrimaryGM on the processor, and no guard property.
    const processor = new GatheringWorldTimeProcessor({});
    assert.equal(processor.isPrimaryGM, undefined);

    // With empty deps the passes are inert (no richState methods) but still run
    // and return empty aggregates — the processor never gates itself out.
    const aggregate = await processor.processRegenAndRespawn(1);
    assert.deepEqual(aggregate, {
      staminaRegen: [],
      nodeRespawn: [],
      interactableNodeRespawn: [],
    });
  });
});
