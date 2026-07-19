import test from 'node:test';
import assert from 'node:assert/strict';

import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';

// These tests drive the WIRED primary-GM check exactly as main.js wires it
// (`() => game.users?.activeGM?.id === game.user?.id`), not the injected unit
// seam, so they prove the load-bearing wiring gates the synced-hook setFlag
// writes. The `() => true` default is exercised by the existing
// salvage-run-manager / crafting-run-manager / salvage-engine suites, which
// build no `activeGM` and must still resume.

const WIRED_IS_PRIMARY_GM = () =>
  globalThis.game?.users?.activeGM?.id === globalThis.game?.user?.id;

class FakeActor {
  constructor(id = 'actor-1') {
    this.id = id;
    this.uuid = `Actor.${id}`;
    this._flags = {};
    this.setFlagCalls = 0;
  }

  getFlag(namespace, key) {
    return this._flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.setFlagCalls += 1;
    this._flags[namespace] = this._flags[namespace] || {};
    this._flags[namespace][key] = value;
    return value;
  }
}

// gmId is the single designated primary GM; userId is the client running the
// world-time processing. When they differ the client is non-primary.
function setupGame({ userId, gmId, worldTime, actors }) {
  globalThis.foundry = { utils: { randomID: () => 'rid-fixed' } };
  globalThis.game = {
    user: { id: userId },
    users: { activeGM: { id: gmId } },
    time: { worldTime },
    actors,
  };
}

// setFabricateFlag normalizes the key to `fabricate.<key>`, so the stored flag
// lives under that dotted key (matching how the manager persists it).
function seedSalvageActor(actor, availableAt) {
  actor._flags.fabricate = {
    'fabricate.salvageRuns': {
      active: {
        'salv-1': {
          id: 'salv-1',
          status: 'waitingTime',
          craftingSystemId: 'sys-1',
          componentId: 'comp-1',
          timeGate: { requiredSeconds: 60, initiatedAt: 0, availableAt },
        },
      },
      history: [],
    },
  };
}

function seedCraftingActor(actor, availableAt) {
  actor._flags.fabricate = {
    'fabricate.craftingRuns': {
      active: {
        'craft-1': {
          id: 'craft-1',
          status: 'waitingTime',
          currentStepIndex: 0,
          steps: [
            {
              stepId: 'step-1',
              status: 'waitingTime',
              timeGate: { requiredSeconds: 60, initiatedAt: 0, availableAt },
            },
          ],
        },
      },
      history: [],
    },
  };
}

test('SalvageRunManager.processWorldTime: non-primary GM skips the timed resume (no persist)', async () => {
  const actor = new FakeActor('salv-actor');
  seedSalvageActor(actor, 100);
  setupGame({ userId: 'player-1', gmId: 'gm-1', worldTime: 200, actors: [actor] });
  const manager = new SalvageRunManager({ isPrimaryGM: WIRED_IS_PRIMARY_GM });

  let readyCalls = 0;
  await manager.processWorldTime(200, async () => {
    readyCalls += 1;
  });

  assert.equal(readyCalls, 0, 'onReadyRun must not fire on a non-primary client');
  assert.equal(actor.setFlagCalls, 0, 'no broadcast setFlag write on a non-primary client');
  assert.equal(manager.getActiveRun(actor, 'salv-1').status, 'waitingTime', 'run stays waiting');
});

test('SalvageRunManager.processWorldTime: primary GM resumes the matured run exactly once', async () => {
  const actor = new FakeActor('salv-actor');
  seedSalvageActor(actor, 100);
  setupGame({ userId: 'gm-1', gmId: 'gm-1', worldTime: 200, actors: [actor] });
  const manager = new SalvageRunManager({ isPrimaryGM: WIRED_IS_PRIMARY_GM });

  const readyRunIds = [];
  await manager.processWorldTime(200, async (_actor, run) => {
    readyRunIds.push(run.id);
  });

  assert.deepEqual(readyRunIds, ['salv-1'], 'onReadyRun fires exactly once for the matured run');
  assert.equal(actor.setFlagCalls, 1, 'the primary GM persists exactly once');
  assert.equal(manager.getActiveRun(actor, 'salv-1').status, 'inProgress', 'run resumes');
});

test('CraftingRunManager.processWorldTime: non-primary GM skips the broadcast _persist write', async () => {
  const actor = new FakeActor('craft-actor');
  seedCraftingActor(actor, 100);
  setupGame({ userId: 'player-1', gmId: 'gm-1', worldTime: 200, actors: [actor] });
  const manager = new CraftingRunManager({ isPrimaryGM: WIRED_IS_PRIMARY_GM });

  await manager.processWorldTime(200);

  assert.equal(actor.setFlagCalls, 0, 'no duplicate broadcast setFlag write on a non-primary client');
  assert.equal(manager.getActiveRun(actor, 'craft-1').status, 'waitingTime', 'run stays waiting');
});

test('CraftingRunManager.processWorldTime: primary GM resumes and persists exactly once', async () => {
  const actor = new FakeActor('craft-actor');
  seedCraftingActor(actor, 100);
  setupGame({ userId: 'gm-1', gmId: 'gm-1', worldTime: 200, actors: [actor] });
  const manager = new CraftingRunManager({ isPrimaryGM: WIRED_IS_PRIMARY_GM });

  await manager.processWorldTime(200);

  assert.equal(actor.setFlagCalls, 1, 'the primary GM persists exactly once');
  assert.equal(manager.getActiveRun(actor, 'craft-1').status, 'inProgress', 'run resumes');
});
