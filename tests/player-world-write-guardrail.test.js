/**
 * The guardrail for the bug class that has now shipped three times: a player-reachable
 * code path writing shared state the acting client may not write (issue 302, Region
 * Behaviours; issue 970, actor documents; the gathering environment node pool).
 *
 * Every persistence fake in this suite is omnipotent — a `Map.set` that cannot refuse —
 * so "forgot to route this through the GM" is invisible to `npm test`. These tests use
 * `makeSettingsSeam({ isGM: false })`, which refuses world-scope writes exactly as the
 * server does, and prove:
 *
 *   1. the seam CAN fail (a mechanical check that never fails is worthless), and
 *   2. the gathering depletion path no longer trips it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SETTING_KEYS, WORLD_SCOPED_SETTING_KEYS } from '../src/config/settings.js';
import { GatheringEnvironmentStore } from '../src/systems/GatheringEnvironmentStore.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { isWorldScopedSettingKey, makeSettingsSeam } from './helpers/settings.js';

const SYS = 'sys-guard';

function libraryTask() {
  return {
    id: 'lib-1',
    name: 'Mine Ore',
    enabled: true,
    dropRows: [],
    nodes: {
      enabled: true,
      max: 3,
      current: 3,
      depletionTiming: 'onStart',
      respawn: { policy: 'manual' }
    }
  };
}

function environmentRecord() {
  return {
    id: 'env-1',
    craftingSystemId: SYS,
    name: 'Iron Hills',
    // Disabled so the REAL store's "an enabled environment needs a task" validation
    // passes on a record whose tasks come from the library, not the record. Nothing on
    // the depletion path reads `enabled` — `_writeNodeState` only patches nodeRuntime —
    // and using the real store is the whole point: its validation and its `setSetting`
    // call are what an in-memory fake elides.
    enabled: false,
    selectionMode: 'targeted',
    tasks: [],
    nodeRuntime: {}
  };
}

// --- the scope table is derived, not restated ------------------------------

test('world-scope keys are derived from the real setting definitions', () => {
  // Spot-check both sides so a re-scoped setting cannot silently fall out of the gate.
  assert.ok(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.GATHERING_ENVIRONMENTS));
  assert.ok(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.CRAFTING_SYSTEMS));
  assert.ok(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.RECIPES));
  // client-scope (localStorage) and user-scope settings are NOT GM-only.
  assert.ok(!WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.FAVOURITE_RECIPES));
  assert.ok(!WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER));
});

test('isWorldScopedSettingKey accepts bare and fully-qualified keys', () => {
  assert.equal(isWorldScopedSettingKey('gatheringEnvironments'), true);
  assert.equal(isWorldScopedSettingKey('fabricate.gatheringEnvironments'), true);
  assert.equal(isWorldScopedSettingKey('favouriteRecipes'), false);
  assert.equal(isWorldScopedSettingKey('fabricate.favouriteRecipes'), false);
});

// --- the seam can actually fail --------------------------------------------

test('the player seam refuses a world write with the real server message', async () => {
  const seam = makeSettingsSeam({ isGM: false, userName: 'Randall' });
  await assert.rejects(
    () => seam.setSetting(SETTING_KEYS.GATHERING_ENVIRONMENTS, []),
    /User Randall lacks permission to update Setting \[fabricate\.gatheringEnvironments\]/
  );
  assert.deepEqual(seam.refused, [SETTING_KEYS.GATHERING_ENVIRONMENTS]);
  assert.equal(seam.writes.length, 0);
});

test('the player seam still allows client- and user-scope writes', async () => {
  const seam = makeSettingsSeam({ isGM: false });
  await seam.setSetting(SETTING_KEYS.FAVOURITE_RECIPES, ['r1']);
  await seam.setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, { a: [] });
  assert.equal(seam.writes.length, 2);
});

test('a GM seam writes world scope normally', async () => {
  const seam = makeSettingsSeam({ isGM: true });
  await seam.setSetting(SETTING_KEYS.GATHERING_ENVIRONMENTS, []);
  assert.equal(seam.writes.length, 1);
  assert.equal(seam.refused.length, 0);
});

// --- the guardrail reproduces the ORIGINAL bug -----------------------------

function makeRichState({ seam, depleteEnvironmentNode = null }) {
  const store = new GatheringEnvironmentStore({
    getSetting: seam.getSetting,
    setSetting: seam.setSetting,
    getSystems: () => [{ id: SYS, name: 'Guard', enabled: true, features: { gathering: true } }]
  });
  seam.settings.set(SETTING_KEYS.GATHERING_ENVIRONMENTS, [environmentRecord()]);
  store.load();

  const config = {
    systems: { [SYS]: { tasks: [libraryTask()], economy: { nodes: { enabled: true } } } }
  };
  const service = new GatheringRichStateService({
    environmentStore: store,
    getSetting: (key) =>
      key === SETTING_KEYS.GATHERING_CONFIG ? config : seam.getSetting(key),
    setSetting: seam.setSetting,
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    nowWorldTime: () => 0,
    hooks: { callAll: () => {} },
    depleteEnvironmentNode
  });
  return { service, store };
}

const attempt = {
  actor: { id: 'a1', uuid: 'Actor.a1' },
  system: { id: SYS },
  environment: { id: 'env-1', craftingSystemId: SYS },
  task: {
    id: 'lib-1',
    nodes: { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } }
  },
  outcome: { status: 'succeeded' }
};

test('GUARD: an unrouted depletion on a player client reproduces the shipped bug', async () => {
  // This is the regression the guardrail exists to catch. With no GM-routing seam the
  // real store reaches `setSetting(gatheringEnvironments)` and the player seam refuses,
  // exactly as Foundry's server did. If this test ever stops rejecting, the seam has
  // been neutered and the guardrail is worthless.
  const seam = makeSettingsSeam({ isGM: false, userName: 'Randall' });
  const { service } = makeRichState({ seam });

  await assert.rejects(
    () => service.commitAcceptedAttempt(attempt),
    /lacks permission to update Setting/
  );
});

test('GUARD: the routed depletion writes no world setting on a player client', async () => {
  const routed = [];
  const seam = makeSettingsSeam({ isGM: false, userName: 'Randall' });
  const { service } = makeRichState({
    seam,
    depleteEnvironmentNode: (args) => routed.push(args)
  });

  const evidence = await service.commitAcceptedAttempt(attempt);

  assert.deepEqual(routed, [{ environmentId: 'env-1', taskId: 'lib-1' }]);
  assert.equal(seam.refused.length, 0, 'nothing was even attempted');
  assert.equal(seam.writes.length, 0, 'and nothing was written');
  assert.equal(evidence.node.authoritative, false);
});

test('GUARD: the same attempt on a GM client still writes the pool directly', async () => {
  const seam = makeSettingsSeam({ isGM: true });
  const { service, store } = makeRichState({ seam });

  await service.commitAcceptedAttempt(attempt);

  assert.equal(store.get('env-1').nodeRuntime['lib-1'].current, 2);
  assert.ok(seam.writes.some((write) => write.key === SETTING_KEYS.GATHERING_ENVIRONMENTS));
});
