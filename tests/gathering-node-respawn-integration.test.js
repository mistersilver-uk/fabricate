import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEnvironmentStore } from '../src/systems/GatheringEnvironmentStore.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { SETTING_KEYS } from '../src/config/settings.js';

const HOUR = 3600;
const SYS = 'sys-int';

const SYSTEM = { id: SYS, name: 'Integration System', enabled: true, features: { gathering: true } };

// A library task that the environment sources via enabledTaskIds (so environment
// validation passes) and that carries an over-time, guaranteed respawn.
function libraryTask(respawn) {
  return {
    id: 'lib-1',
    name: 'Mine Ore',
    enabled: true,
    dropRows: [],
    nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onStart', respawn }
  };
}

function environmentRecord(nodeRespawn, { seedRuntime = true, runtime = {} } = {}) {
  const record = {
    id: 'env-1',
    craftingSystemId: SYS,
    name: 'Quarry',
    enabled: true,
    selectionMode: 'targeted',
    enabledTaskIds: ['lib-1'], // satisfies "targeted requires a task source"
    biomes: [],
    dangerTags: [],
    risk: 'safe'
  };
  // Depleted to empty, with a fresh (null-anchored) respawn — the user's state.
  if (seedRuntime) {
    record.nodeRuntime = {
      'lib-1': {
        enabled: true,
        max: runtime.max ?? 3,
        current: runtime.current ?? 0,
        depletionTiming: 'onStart',
        respawn: nodeRespawn
      }
    };
  }
  return record;
}

function harness(nodeRespawn, { seedRuntime = true, libraryRespawn = nodeRespawn, runtime = {} } = {}) {
  const settings = new Map([
    [SETTING_KEYS.GATHERING_CONFIG, { systems: { [SYS]: { economy: { mode: 'nodes' }, tasks: [libraryTask(libraryRespawn)] } } }],
    [SETTING_KEYS.GATHERING_ENVIRONMENTS, [environmentRecord(nodeRespawn, { seedRuntime, runtime })]]
  ]);
  const getSetting = (key) => settings.get(key);
  const setSetting = async (key, value) => { settings.set(key, value); return value; };

  const store = new GatheringEnvironmentStore({
    getSetting,
    setSetting,
    getSystems: () => [SYSTEM],
    randomID: () => 'env-1'
  });
  store.load();

  const richState = new GatheringRichStateService({
    environmentStore: store,
    getSetting,
    setSetting,
    settingKey: SETTING_KEYS.GATHERING_CONFIG
  });

  return { settings, store, richState };
}

describe('node respawn over world time — real store integration (reproduction)', () => {
  it('refills a depleted overTime/guaranteed node across world-time ticks (unit+amount schema)', async () => {
    const { store, richState } = harness({
      policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: null
    });

    // Tick 1 (anchor), tick 2 (gain) — re-read the environment from the store each
    // tick exactly as GatheringEngine._processNodeRespawn does.
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 0 });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 2 * HOUR });

    const after = store.get('env-1');
    assert.equal(after.nodeRuntime['lib-1'].current, 2, 'two whole hours should restock two nodes');
  });

  it('drives respawn through GatheringEngine.processWorldTime', async () => {
    const { store, richState } = harness({
      policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: null
    });
    const engine = new GatheringEngine({
      environmentStore: store,
      richState,
      getSystems: () => [SYSTEM],
      isPrimaryGM: () => true,
      getActors: () => [],
      runManager: { getMaturedWaitingRuns: async () => [] }
    });

    await engine.processWorldTime(0);
    await engine.processWorldTime(2 * HOUR);

    assert.equal(store.get('env-1').nodeRuntime['lib-1'].current, 2);
  });

  it('refills a legacy intervalSeconds node (pre unit/amount schema)', async () => {
    const { store, richState } = harness({
      policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR, lastEvaluatedWorldTime: null
    });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 0 });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 2 * HOUR });
    assert.equal(store.get('env-1').nodeRuntime['lib-1'].current, 2);
  });

  it('refills with a 100% chance gain mode', async () => {
    const { store, richState } = harness({
      policy: 'overTime', gainMode: 'chance', chance: 1, intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: null
    });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 0 });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 2 * HOUR });
    assert.equal(store.get('env-1').nodeRuntime['lib-1'].current, 2);
  });

  // The user's world may carry a node authored under the pre-0.4.0 respawn schema
  // (policy elapsedTime/probability/manualAndElapsedTime) that was never migrated —
  // e.g. a dev world with a stale migrationVersion. Previously normalizeRespawn
  // coerced any such policy to 'manual' and _respawnNode never fired: a silent
  // "respawn never works" that matched the report (and is nodes-specific, so
  // stamina was unaffected). Read-time legacy mapping now keeps respawn working.
  it('refills a node whose nodeRuntime still carries a legacy (un-migrated) respawn policy', async () => {
    const { store, richState } = harness({
      policy: 'elapsedTime', intervalSeconds: HOUR, lastEvaluatedWorldTime: null
    });
    assert.equal(store.get('env-1').nodeRuntime['lib-1'].respawn.policy, 'overTime', 'legacy policy maps to overTime on load');
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 0 });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 2 * HOUR });
    assert.equal(store.get('env-1').nodeRuntime['lib-1'].current, 2);
  });

  // The actual field-reported bug: a per-environment nodeRuntime entry was seeded
  // while the library task was still `manual` (intervalAmount 0); the GM later set
  // the task to `overTime`, but the frozen per-env copy never respawned — and an
  // emptied pool never re-depletes to refresh it. Respawn now sources config from
  // the library task, keeping only the runtime count/anchor per environment.
  it('refills when the nodeRuntime entry has STALE respawn config vs the library task', async () => {
    const stale = { policy: 'manual', gainMode: 'guaranteed', chance: 0, amountExpression: '', intervalUnit: 'hours', intervalAmount: 0, lastEvaluatedWorldTime: null };
    const healthy = { policy: 'overTime', gainMode: 'chance', chance: 1, amountExpression: '1d4', intervalUnit: 'hours', intervalAmount: 1 };
    const { store, richState } = harness(stale, { libraryRespawn: healthy });

    // The stored per-environment copy is stale (manual / interval 0)…
    assert.equal(store.get('env-1').nodeRuntime['lib-1'].respawn.policy, 'manual');
    // …but respawn uses the library config and restocks anyway.
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 0 });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 2 * HOUR });
    const after = store.get('env-1').nodeRuntime['lib-1'];
    assert.equal(after.current, 2, 'restocks despite the stale stored config');
    assert.equal(after.respawn.policy, 'overTime', 'and self-heals the stored config to match the library');
  });

  // A GM may overstock one environment beyond the library max via
  // restockNode({max}); that per-environment max is STATE and must survive the
  // config-from-library merge (it is not reset to the library's max).
  it('preserves a per-environment max override across respawn', async () => {
    const respawn = { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1 };
    // Library max is 3 (libraryTask); this environment was overstocked to max 12.
    const { store, richState } = harness(respawn, { runtime: { current: 5, max: 12 } });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 0 });
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: 2 * HOUR });
    const after = store.get('env-1').nodeRuntime['lib-1'];
    assert.equal(after.max, 12, 'per-env max override is not clobbered by the library max');
    assert.equal(after.current, 7, 'respawn grows toward the per-env max, not the library max');
  });

  it('seeds the respawn anchor on depletion so the FIRST advance restocks (no wasted tick)', async () => {
    const respawn = { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1 };
    const { store, richState } = harness(respawn, { seedRuntime: false });

    // Deplete once through the real attempt-commit path, which seeds nodeRuntime.
    const runtimeTask = richState._libraryTaskToRuntimeTask(libraryTask(respawn), store.get('env-1'));
    await richState.commitAcceptedAttempt({
      system: SYSTEM, environment: store.get('env-1'), task: runtimeTask, outcome: { status: 'succeeded' }
    });
    const seeded = store.get('env-1').nodeRuntime['lib-1'];
    assert.equal(seeded.current, 2, 'depletion seeds and decrements the pool');
    assert.equal(typeof seeded.respawn.lastEvaluatedWorldTime, 'number', 'anchor seeded at depletion');

    // A single one-hour advance now restocks immediately (anchor was seeded).
    await richState.respawnNodes({ environment: store.get('env-1'), worldTime: HOUR });
    assert.equal(store.get('env-1').nodeRuntime['lib-1'].current, 3);
  });
});
