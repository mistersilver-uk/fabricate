import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import { runContainersChanged } from '../src/systems/runFlagInvalidation.js';

// Issue 739 (read side): the run managers cache an actor's runs in memory and never
// learn about a write another client (or the primary-GM world-time resume) makes to the
// actor's run flags. `invalidateCache(actorId)` — wired to the `updateActor` hook in
// main.js — drops the stale cache so the next read reflects the synced document.

// A minimal actor whose flags stand in for the SYNCED Foundry actor document.
class SharedActor {
  constructor(name = 'PlayerPC') {
    this.id = name;
    this.name = name;
    this.uuid = `Actor.${name}`;
    this._flags = {};
  }
  getFlag(ns, key) {
    return this._flags?.[ns]?.[key];
  }
  async setFlag(ns, key, value) {
    this._flags[ns] = this._flags[ns] || {};
    this._flags[ns][key] = value;
    return value;
  }
}

function setupGlobals(worldTime = 1000) {
  let n = 0;
  globalThis.foundry = { utils: { randomID: () => `rid-${++n}` } };
  globalThis.game = { user: { id: 'gm-1' }, time: { worldTime }, actors: [] };
}

function stepRecipe(id) {
  return {
    id,
    craftingSystemId: 'system-1',
    getExecutionSteps: () => [{ id: `${id}-s1`, name: 'One' }],
  };
}

// Simulate a remote (player) client's replicated write landing on the GM's client:
// Foundry replaces the actor's flag with a FRESH merged object on sync, so deep-clone
// the stored container into a NEW object and add the player's run WITHOUT going through
// the GM manager's in-memory cache.
function remoteWriteActiveCraftingRun(actor, run) {
  const prev = actor._flags?.fabricate?.['fabricate.craftingRuns'] ?? { active: {}, history: [] };
  actor._flags.fabricate = actor._flags.fabricate || {};
  actor._flags.fabricate['fabricate.craftingRuns'] = {
    active: { ...(prev.active || {}), [run.id]: run },
    history: [...(prev.history || [])],
  };
}

test('CraftingRunManager: invalidateCache lets a GM see a run another client replicated in', async () => {
  setupGlobals();
  const actor = new SharedActor();
  const gmManager = new CraftingRunManager();

  // The GM persists something to this actor (seeding + freezing its cache).
  await gmManager.createRun(actor, stepRecipe('recipe-1'), [actor], 'gm-1');
  assert.equal(gmManager.getActiveRuns(actor).length, 1, 'GM sees the run it just persisted');

  // A player starts a run on the same actor; it replicates into the synced document.
  remoteWriteActiveCraftingRun(actor, {
    id: 'R2',
    actorUuid: actor.uuid,
    userId: 'player-9',
    craftingSystemId: 'system-1',
    recipeId: 'recipe-2',
    status: 'inProgress',
    currentStepIndex: 0,
    steps: [{ stepId: 'r2-s1', stepName: 'One', status: 'inProgress' }],
  });

  // A fresh manager proves the synced flag genuinely holds BOTH runs.
  const freshIds = new CraftingRunManager()
    .getActiveRuns(actor)
    .map((r) => r.id)
    .sort();
  assert.deepEqual(freshIds, ['R2', 'rid-1'], 'the synced flag holds both runs');

  // Before invalidation the GM's frozen cache still hides the player's run (the bug).
  assert.deepEqual(
    gmManager.getActiveRuns(actor).map((r) => r.id),
    ['rid-1'],
    'stale cache hides the replicated run until invalidated'
  );

  // The updateActor hook invalidates the cache; the next read re-reads the document.
  gmManager.invalidateCache(actor.id);
  assert.deepEqual(
    gmManager
      .getActiveRuns(actor)
      .map((r) => r.id)
      .sort(),
    ['R2', 'rid-1'],
    'after invalidateCache the GM sees the replicated run too'
  );
});

test('SalvageRunManager: invalidateCache lets a GM see a run another client replicated in', async () => {
  setupGlobals();
  const actor = new SharedActor('Salvager');
  const gmManager = new SalvageRunManager();

  const seed = await gmManager.createRun(actor, {
    craftingSystemId: 'system-1',
    componentId: 'component-1',
    status: 'inProgress',
  });
  assert.equal(gmManager.getActiveRuns(actor).length, 1);

  // Remote replicated salvage run (doubly-nested salvageRuns flag path).
  const prev = actor._flags.fabricate['fabricate.salvageRuns'];
  actor._flags.fabricate['fabricate.salvageRuns'] = {
    active: {
      ...(prev.active || {}),
      S2: {
        id: 'S2',
        actorUuid: actor.uuid,
        userId: 'player-9',
        craftingSystemId: 'system-1',
        componentId: 'component-2',
        status: 'inProgress',
      },
    },
    history: [...(prev.history || [])],
  };

  assert.deepEqual(
    gmManager.getActiveRuns(actor).map((r) => r.id),
    [seed.id],
    'stale cache hides the replicated salvage run until invalidated'
  );

  gmManager.invalidateCache(actor.id);
  assert.deepEqual(
    gmManager
      .getActiveRuns(actor)
      .map((r) => r.id)
      .sort(),
    ['S2', seed.id].sort(),
    'after invalidateCache the GM sees the replicated salvage run'
  );
});

test('runContainersChanged: matches the doubly-nested crafting/salvage and single-scope gathering flag paths', () => {
  const has = (object, path) =>
    String(path)
      .split('.')
      .every((seg) => {
        if (object == null || typeof object !== 'object' || !(seg in object)) return false;
        object = object[seg];
        return true;
      });

  const crafting = { flags: { fabricate: { fabricate: { craftingRuns: { active: {} } } } } };
  assert.deepEqual(runContainersChanged(crafting, has), ['crafting']);

  const salvage = { flags: { fabricate: { fabricate: { salvageRuns: { history: [] } } } } };
  assert.deepEqual(runContainersChanged(salvage, has), ['salvage']);

  const gathering = { flags: { fabricate: { gatheringRuns: { active: {} } } } };
  assert.deepEqual(runContainersChanged(gathering, has), ['gathering']);

  // The single-scope crafting path must NOT match (would silently never fire).
  const wrongDepth = { flags: { fabricate: { craftingRuns: { active: {} } } } };
  assert.deepEqual(runContainersChanged(wrongDepth, has), []);

  // A noisy HP-tick diff touches no run flag.
  const hpTick = { system: { attributes: { hp: { value: 3 } } } };
  assert.deepEqual(runContainersChanged(hpTick, has), []);
});
