import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';

// Issue 2048: a gathering app opened through an INDEPENDENT interactable listed the shared
// task pool (98/99) instead of the interactable's own (50/50), and gated attemptability on it,
// because the listing path dropped the interactable ref the attempt path carries.

const SYS = 'sys-2048';
const player = { id: 'user-1', isGM: false };
const gm = { id: 'gm-1', isGM: true };
const actor = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Gatherer', items: [] };

const REF_A = { sceneId: 's1', regionId: 'r1', behaviorId: 'b-a' };
const REF_B = { sceneId: 's1', regionId: 'r2', behaviorId: 'b-b' };

function sharedNode(current) {
  return {
    enabled: true,
    max: 99,
    current,
    depletionTiming: 'onSuccess',
    respawn: { policy: 'manual' },
  };
}

function scopedNode(current) {
  return {
    enabled: true,
    max: 50,
    current,
    depletionTiming: 'onSuccess',
    respawn: { policy: 'manual' },
  };
}

// Environments are composed from the library by the real rich-state service, so each carries its
// shared pool in `nodeRuntime`, exactly as a saved world does.
function environment(id, pools, overrides = {}) {
  return {
    id,
    craftingSystemId: SYS,
    name: `Environment ${id}`,
    enabled: true,
    selectionMode: 'targeted',
    enabledTaskIds: Object.keys(pools),
    biomes: [],
    dangerTags: [],
    risk: 'safe',
    nodeRuntime: Object.fromEntries(
      Object.entries(pools).map(([taskId, current]) => [taskId, sharedNode(current)])
    ),
    ...overrides,
  };
}

function libraryTask(id) {
  return { id, name: `Task ${id}`, enabled: true, dropRows: [], nodes: sharedNode(99) };
}

function behavior({ behaviorId, environmentId, taskId, node, link = 'unlinked' }) {
  return {
    type: 'fabricate.interactable',
    id: behaviorId,
    system: {
      interactableType: 'gatheringTask',
      sourceUuid: `Fabricate.sys.gatheringTask.${taskId}`,
      systemId: SYS,
      taskId,
      environmentId,
      taskNodeLink: link,
      node,
    },
  };
}

function makeEngine({ environments, behaviors }) {
  const settings = new Map([
    [
      SETTING_KEYS.GATHERING_CONFIG,
      {
        systems: {
          [SYS]: { economy: { mode: 'nodes' }, tasks: [libraryTask('task-a'), libraryTask('task-b')] },
        },
      },
    ],
  ]);
  const richState = new GatheringRichStateService({
    environmentStore: {
      get: (id) => environments.find((entry) => entry.id === id) ?? null,
      list: () => environments,
      update: async () => null,
    },
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      return value;
    },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    nowWorldTime: () => 0,
    rollD100: () => 1,
    resolveRegionBehavior: (ref) => behaviors.get(ref?.behaviorId) ?? null,
  });
  return new GatheringEngine({
    richState,
    systemManager: null,
    environmentStore: { list: () => environments },
    getSystems: () => [{ id: SYS, enabled: true, features: { gathering: true }, components: [] }],
    getSelectableActors: () => [actor],
    isActorSelectable: () => true,
    isGamePaused: () => false,
    evaluator: {
      evaluateVisibility: async () => ({ visible: true, reasonCode: 'VISIBLE', diagnostic: null }),
    },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    runManager: {
      getActiveRuns: () => [],
      getRunHistory: () => [],
      findActiveRunForTask: () => null,
    },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    localize: (key) => key,
  });
}

function findTask(listing, environmentId, taskId) {
  const env = listing.environments.find((entry) => entry.id === environmentId);
  return env?.tasks.find((entry) => entry.id === taskId) ?? null;
}

const blockedCodes = (listed) => listed.blockedReasons.map((reason) => reason.code);

describe('scoped gathering listing reads the independent interactable pool (issue 2048)', () => {
  it('shows the interactable pool on its own row and the shared pool elsewhere', async () => {
    const environments = [
      environment('env-a', { 'task-a': 98, 'task-b': 98 }),
      environment('env-b', { 'task-a': 98 }),
    ];
    const behaviors = new Map([
      ['b-a', behavior({ behaviorId: 'b-a', environmentId: 'env-a', taskId: 'task-a', node: scopedNode(50) })],
    ]);
    const engine = makeEngine({ environments, behaviors });

    for (const viewer of [player, gm]) {
      const scoped = await engine.listForActor({ viewer, actor, interactableRef: REF_A });
      assert.deepEqual(
        [findTask(scoped, 'env-a', 'task-a').rich.nodes.current, findTask(scoped, 'env-a', 'task-a').rich.nodes.max],
        [50, 50],
        'the interactable row shows its own pool'
      );
      // Rows that are not this interactable's keep the shared pool, even with a matching task id.
      assert.equal(findTask(scoped, 'env-a', 'task-b').rich.nodes.current, 98);
      assert.equal(findTask(scoped, 'env-b', 'task-a').rich.nodes.current, 98);

      const ordinary = await engine.listForActor({ viewer, actor });
      assert.equal(findTask(ordinary, 'env-a', 'task-a').rich.nodes.current, 98);
      assert.equal(findTask(ordinary, 'env-a', 'task-a').rich.nodes.max, 99);
    }
  });

  it('gates attemptability on the interactable pool, not the shared one', async () => {
    const behaviors = new Map([
      ['b-a', behavior({ behaviorId: 'b-a', environmentId: 'env-a', taskId: 'task-a', node: scopedNode(50) })],
    ]);

    // Shared pool empty, independent pool available: the scoped row stays attemptable.
    const sharedEmpty = makeEngine({ environments: [environment('env-a', { 'task-a': 0 })], behaviors });
    const scoped = findTask(
      await sharedEmpty.listForActor({ viewer: player, actor, interactableRef: REF_A }),
      'env-a',
      'task-a'
    );
    assert.equal(scoped.attemptable, true);
    assert.deepEqual(blockedCodes(scoped), []);
    const ordinary = findTask(await sharedEmpty.listForActor({ viewer: player, actor }), 'env-a', 'task-a');
    assert.equal(ordinary.attemptable, false);
    assert.deepEqual(blockedCodes(ordinary), ['NODE_DEPLETED']);

    // Independent pool empty, shared pool available: the scoped row is depleted and blocked.
    behaviors.get('b-a').system.node = scopedNode(0);
    const sharedFull = makeEngine({ environments: [environment('env-a', { 'task-a': 98 })], behaviors });
    const depleted = findTask(
      await sharedFull.listForActor({ viewer: player, actor, interactableRef: REF_A }),
      'env-a',
      'task-a'
    );
    assert.equal(depleted.attemptable, false);
    assert.deepEqual(blockedCodes(depleted), ['NODE_DEPLETED']);
    assert.equal(depleted.rich.nodes.depleted, true);
    assert.equal(
      findTask(await sharedFull.listForActor({ viewer: player, actor }), 'env-a', 'task-a').attemptable,
      true
    );
  });

  it('keeps two independent interactables on their own pools', async () => {
    const environments = [environment('env-a', { 'task-a': 98, 'task-b': 98 })];
    const behaviors = new Map([
      ['b-a', behavior({ behaviorId: 'b-a', environmentId: 'env-a', taskId: 'task-a', node: scopedNode(50) })],
      ['b-b', behavior({ behaviorId: 'b-b', environmentId: 'env-a', taskId: 'task-b', node: scopedNode(7) })],
    ]);
    const engine = makeEngine({ environments, behaviors });

    const viaA = await engine.listForActor({ viewer: player, actor, interactableRef: REF_A });
    const viaB = await engine.listForActor({ viewer: player, actor, interactableRef: REF_B });
    assert.equal(findTask(viaA, 'env-a', 'task-a').rich.nodes.current, 50);
    assert.equal(findTask(viaA, 'env-a', 'task-b').rich.nodes.current, 98);
    assert.equal(findTask(viaB, 'env-a', 'task-a').rich.nodes.current, 98);
    assert.equal(findTask(viaB, 'env-a', 'task-b').rich.nodes.current, 7);
  });

  it('falls back to the shared pool for a linked, missing or malformed reference', async () => {
    const environments = [environment('env-a', { 'task-a': 98 })];
    const behaviors = new Map([
      ['b-a', behavior({ behaviorId: 'b-a', environmentId: 'env-a', taskId: 'task-a', node: scopedNode(50), link: 'linked' })],
    ]);
    const engine = makeEngine({ environments, behaviors });

    for (const interactableRef of [REF_A, REF_B, { sceneId: 's1' }, 'b-a', null]) {
      const listing = await engine.listForActor({ viewer: player, actor, interactableRef });
      assert.equal(findTask(listing, 'env-a', 'task-a').rich.nodes.current, 98, JSON.stringify(interactableRef));
    }
  });

  it('keeps blind redaction while reading the interactable pool', async () => {
    const hidden = scopedNode(0);
    const environments = [environment('env-a', { 'task-a': 98 }, { selectionMode: 'blind' })];
    const behaviors = new Map([
      ['b-a', behavior({ behaviorId: 'b-a', environmentId: 'env-a', taskId: 'task-a', node: hidden })],
    ]);
    const engine = makeEngine({ environments, behaviors });

    const listing = await engine.listForActor({ viewer: player, actor, interactableRef: REF_A });
    const [opaque] = listing.environments[0].tasks;
    assert.equal(opaque.action, 'blindGather');
    assert.equal(opaque.rich.nodes.current, null, 'counts stay redacted for a blind player view');
    assert.equal(opaque.rich.nodes.depleted, true, 'but availability follows the interactable pool');
    assert.equal(opaque.attemptable, false);
    assert.deepEqual(blockedCodes(opaque), ['NODE_DEPLETED']);
    assert.equal(blockedCodes(opaque).length, 1);
    assert.equal(opaque.blockedReasons[0].data, null, 'blind reason data stays redacted');
  });
});
