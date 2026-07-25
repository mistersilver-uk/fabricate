/**
 * Player cancel of an in-progress craft (issue 848).
 *
 * A timed craft consumes ingredients + currency at START and produces results at
 * FINISH, so a mid-run cancel occurs AFTER consumption, BEFORE production. This pins
 * the reversal truth table for CraftingEngine.cancelCraft / reverseRunConsumption:
 *   - refund ON  -> consumed ingredients restored + currency refunded + run removed
 *                   (archived as cancelled) + nothing produced;
 *   - refund OFF -> run removed, nothing restored, nothing produced;
 *   - owner scope -> a non-owned actor is refused;
 *   - idempotent -> a finished (non-active) run cannot be cancelled.
 * The consumption is simulated via the run manager's START-phase snapshot
 * (markStepPrepared), the same shape the timed-craft START path persists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}
function setProperty(object, path, value) {
  const keys = String(path).split('.');
  let cursor = object;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor[keys[i]] = cursor[keys[i]] || {};
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
  return object;
}

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    getProperty,
    setProperty,
    randomID: () => `id-${++_idCounter}`,
    deepClone: (value) => JSON.parse(JSON.stringify(value ?? null)),
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

class FakeItem {
  constructor(id, name, quantity = 1) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name;
    this.img = `icons/${id}.png`;
    this.parent = null;
    this.system = { quantity };
  }
  toObject() {
    return { name: this.name, img: this.img, type: 'loot', system: { ...this.system } };
  }
}

class FakeActor {
  constructor(name, { isOwner = true, gp = 0, failCreate = false, failUpdate = false } = {}) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.isOwner = isOwner;
    this.items = [];
    this.system = { currency: { gp, sp: 0 } };
    this._flags = {};
    this.created = [];
    this._updates = [];
    this._failCreate = failCreate;
    this._failUpdate = failUpdate;
  }
  getFlag(ns, key) {
    return this._flags?.[ns]?.[key];
  }
  async setFlag(ns, key, value) {
    this._flags[ns] = this._flags[ns] || {};
    this._flags[ns][key] = value;
    return value;
  }
  async update(payload) {
    if (this._failUpdate) throw new Error('update refused');
    this._updates.push(payload);
    for (const [path, value] of Object.entries(payload)) setProperty(this, path, value);
  }
  async createEmbeddedDocuments(type, data) {
    if (this._failCreate) throw new Error('createEmbeddedDocuments refused');
    const created = data.map((d, i) => {
      const item = new FakeItem(
        `restored-${this.created.length + i}`,
        d.name,
        d.system?.quantity || 1
      );
      item.parent = this;
      return item;
    });
    this.created.push(...created);
    return created;
  }
}

const CURRENCY_UNITS = [
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'sp', amount: 10 }],
  },
  { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp', contains: [] },
];

function makeSystem() {
  return {
    id: 'sys-cancel',
    features: { refundOnPlayerCancel: true },
    components: [{ id: 'wood', name: 'Wood', registeredItemUuid: 'Item.wood-src' }],
    requirements: {
      currency: { enabled: true, spendStrategy: 'actorProperty', units: CURRENCY_UNITS },
    },
  };
}

function setupGame(system, { sourceActor } = {}) {
  const woodSource = new FakeItem('wood-src', 'Wood', 1);
  globalThis.fromUuid = async (uuid) => (uuid === 'Item.wood-src' ? woodSource : null);
  globalThis.fromUuidSync = (uuid) =>
    sourceActor && uuid === sourceActor.uuid ? sourceActor : null;
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
    },
    user: { id: 'user-1' },
    time: { worldTime: 1000 },
    actors: [],
  };
}

// Build an active timed run whose current step is CONSUMED (has a START snapshot)
// but not yet resolved — the exact state a mid-run cancel targets.
async function seedConsumedRun(runManager, craftingActor, sourceActor) {
  const recipe = {
    id: 'recipe-cancel',
    craftingSystemId: 'sys-cancel',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Timed Step' }],
  };
  const run = await runManager.createRun(craftingActor, recipe, [sourceActor], 'user-1');
  await runManager.markStepPrepared(craftingActor, run, 0, {
    selectedIngredientSetId: 'set-1',
    currencySpends: [{ unit: 'gp', amount: 5 }],
    resolvedEssences: {},
    consumedSummary: [
      {
        itemUuid: 'Item.wood',
        actorUuid: sourceActor.uuid,
        quantity: 2,
        name: 'Wood',
        img: 'icons/wood.png',
        componentId: 'wood',
      },
    ],
  });
  run.status = 'waitingTime';
  run.steps[0].status = 'waitingTime';
  await runManager.updateRun(craftingActor, run);
  return run;
}

// A two-step run: step 0 already SUCCEEDED (produced results, no recoverable snapshot),
// step 1 is waitingTime with a consumed START snapshot — the mid-run cancel target.
async function seedMultiStepRun(runManager, craftingActor, sourceActor) {
  const recipe = {
    id: 'recipe-multi',
    craftingSystemId: 'sys-cancel',
    getExecutionSteps: () => [
      { id: 'step-0', name: 'Step 0' },
      { id: 'step-1', name: 'Step 1' },
    ],
  };
  const run = await runManager.createRun(craftingActor, recipe, [sourceActor], 'user-1');
  // Step 0 succeeded and produced an output.
  run.steps[0].status = 'succeeded';
  run.steps[0].createdResults = [{ itemUuid: 'Item.plank', quantity: 1, name: 'Plank' }];
  // Step 1 consumed at START and is waiting.
  run.currentStepIndex = 1;
  run.status = 'waitingTime';
  run.steps[1].status = 'waitingTime';
  run.steps[1].preparedConsumption = {
    selectedIngredientSetId: 'set-1',
    currencySpends: [{ unit: 'gp', amount: 3 }],
    resolvedEssences: {},
    consumedSummary: [
      {
        itemUuid: 'Item.wood2',
        actorUuid: sourceActor.uuid,
        quantity: 4,
        name: 'Wood',
        img: 'icons/wood.png',
        componentId: 'wood',
      },
    ],
  };
  await runManager.updateRun(craftingActor, run);
  return run;
}

function makeEngine(runManager) {
  return new CraftingEngine(
    { getRecipe: () => ({ craftingSystemId: 'sys-cancel' }) },
    runManager,
    null
  );
}

test('cancel with refund ON restores ingredients, refunds currency, removes the run, produces nothing', async () => {
  const system = makeSystem();
  const craftingActor = new FakeActor('Crafter', { gp: 0 });
  const sourceActor = new FakeActor('Source', { gp: 0 });
  setupGame(system, { sourceActor });

  const runManager = new CraftingRunManager();
  const engine = makeEngine(runManager);
  const run = await seedConsumedRun(runManager, craftingActor, sourceActor);

  const result = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: true });

  assert.equal(result.success, true);
  assert.equal(result.cancelled, true);
  assert.equal(result.refunded, true);
  assert.equal(result.restoredCount, 1, 'one consumed ingredient stack restored');

  // Ingredient restored onto the ORIGINAL source actor at the consumed quantity.
  assert.equal(sourceActor.created.length, 1, 'a restored item is created on the source actor');
  assert.equal(sourceActor.created[0].system.quantity, 2, 'restored at the consumed quantity');
  assert.equal(sourceActor.created[0].name, 'Wood');

  // Currency refunded to the crafting actor.
  assert.equal(craftingActor.system.currency.gp, 5, '5 gp is refunded');

  // Run removed from active, archived as cancelled, nothing produced.
  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'no active run remains');
  const history = runManager.getRunHistory(craftingActor);
  assert.equal(history.length, 1, 'the cancelled run is archived');
  assert.equal(history[0].status, 'cancelled');
});

test('cancel with refund OFF removes the run without restoring ingredients or currency', async () => {
  const system = makeSystem();
  const craftingActor = new FakeActor('Crafter', { gp: 0 });
  const sourceActor = new FakeActor('Source', { gp: 0 });
  setupGame(system, { sourceActor });

  const runManager = new CraftingRunManager();
  const engine = makeEngine(runManager);
  const run = await seedConsumedRun(runManager, craftingActor, sourceActor);

  const result = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: false });

  assert.equal(result.success, true);
  assert.equal(result.refunded, false);
  assert.equal(result.restoredCount, 0);
  assert.equal(sourceActor.created.length, 0, 'nothing restored when refund is off');
  assert.equal(craftingActor.system.currency.gp, 0, 'no currency refunded when refund is off');
  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'run still removed');
  assert.equal(runManager.getRunHistory(craftingActor)[0].status, 'cancelled');
});

test('cancel reads the system feature flag when no explicit refund override is given', async () => {
  const system = makeSystem();
  system.features.refundOnPlayerCancel = false; // GM forfeits inputs on cancel
  const craftingActor = new FakeActor('Crafter', { gp: 0 });
  const sourceActor = new FakeActor('Source', { gp: 0 });
  setupGame(system, { sourceActor });

  const runManager = new CraftingRunManager();
  const engine = makeEngine(runManager);
  const run = await seedConsumedRun(runManager, craftingActor, sourceActor);

  const result = await engine.cancelCraft(craftingActor, [sourceActor], run.id);
  assert.equal(result.refunded, false, 'the system flag (false) forfeits inputs');
  assert.equal(sourceActor.created.length, 0);
});

test('cancel is refused for a non-owned crafting actor (owner-scoped, no GM relay)', async () => {
  const system = makeSystem();
  const craftingActor = new FakeActor('Crafter', { isOwner: false, gp: 0 });
  const sourceActor = new FakeActor('Source', { gp: 0 });
  setupGame(system, { sourceActor });

  const runManager = new CraftingRunManager();
  const engine = makeEngine(runManager);
  const run = await seedConsumedRun(runManager, craftingActor, sourceActor);

  const result = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: true });
  assert.equal(result.success, false, 'a non-owner cannot cancel');
  assert.match(result.message, /own/i);
  assert.equal(runManager.getActiveRuns(craftingActor).length, 1, 'the run is untouched');
  assert.equal(sourceActor.created.length, 0, 'no reversal for a refused cancel');
});

test('a finished/absent run cannot be cancelled (idempotent)', async () => {
  const system = makeSystem();
  const craftingActor = new FakeActor('Crafter', { gp: 0 });
  const sourceActor = new FakeActor('Source', { gp: 0 });
  setupGame(system, { sourceActor });

  const runManager = new CraftingRunManager();
  const engine = makeEngine(runManager);
  const run = await seedConsumedRun(runManager, craftingActor, sourceActor);

  // First cancel succeeds and archives the run.
  const first = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: true });
  assert.equal(first.success, true);
  const refundsAfterFirst = sourceActor.created.length;

  // A second cancel of the same (now-archived) run is a no-op refusal — no double refund.
  const second = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: true });
  assert.equal(second.success, false, 'no active run to cancel a second time');
  assert.equal(sourceActor.created.length, refundsAfterFirst, 'no double restore');
  assert.equal(craftingActor.system.currency.gp, 5, 'no double refund');
});

test('cancel reports refunded:false (and partialRefund) when the currency refund FAILS', async () => {
  const system = makeSystem();
  // The crafting actor's update throws, so the currency refund cannot apply.
  const craftingActor = new FakeActor('Crafter', { gp: 0, failUpdate: true });
  const sourceActor = new FakeActor('Source', { gp: 0 });
  setupGame(system, { sourceActor });

  const runManager = new CraftingRunManager();
  const engine = makeEngine(runManager);
  const run = await seedConsumedRun(runManager, craftingActor, sourceActor);

  const result = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: true });

  // Truthful outcome: the ingredient came back but the currency refund failed, so this
  // is NOT reported as a full refund (issue 848 finding #2).
  assert.equal(result.success, true, 'the cancel still completes');
  assert.equal(result.refunded, false, 'a failed currency refund is not reported as refunded');
  assert.equal(result.partialRefund, true, 'partial: the ingredient returned but currency did not');
  assert.equal(sourceActor.created.length, 1, 'the ingredient was still restored');
  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'the run is still archived');
});

test('a mid-reversal RESTORE failure cannot double-restore: run is archived, not re-cancellable', async () => {
  const system = makeSystem();
  const craftingActor = new FakeActor('Crafter', { gp: 0 });
  // The source actor rejects item creation (permission / invalid type).
  const sourceActor = new FakeActor('Source', { gp: 0, failCreate: true });
  setupGame(system, { sourceActor });

  const runManager = new CraftingRunManager();
  const engine = makeEngine(runManager);
  const run = await seedConsumedRun(runManager, craftingActor, sourceActor);

  // The restore throw is swallowed (best-effort) rather than propagating out of cancel.
  const result = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: true });
  assert.equal(result.success, true, 'the cancel completes despite the restore failure');
  assert.equal(result.refunded, false, 'a failed restore is not reported as a full refund');
  assert.equal(result.partialRefund, true, 'partial: currency refunded but the ingredient did not');
  assert.equal(sourceActor.created.length, 0, 'nothing was actually restored');
  assert.equal(craftingActor.system.currency.gp, 5, 'currency was still refunded');

  // Crucially, the run is archived, so a re-cancel is a no-op — no double-restore path.
  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'the run is archived, not left active');
  const second = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: true });
  assert.equal(second.success, false, 'the archived run cannot be re-cancelled');
});

test('multi-step cancel reverses ONLY the consumed-but-unresolved step, never a succeeded step', async () => {
  const system = makeSystem();
  const craftingActor = new FakeActor('Crafter', { gp: 0 });
  const sourceActor = new FakeActor('Source', { gp: 0 });
  setupGame(system, { sourceActor });

  const runManager = new CraftingRunManager();
  const engine = makeEngine(runManager);
  const run = await seedMultiStepRun(runManager, craftingActor, sourceActor);
  const step0ResultsBefore = JSON.stringify(run.steps[0].createdResults);

  const result = await engine.cancelCraft(craftingActor, [sourceActor], run.id, { refund: true });

  assert.equal(result.success, true);
  assert.equal(result.refunded, true);
  // Only step 1's inputs are restored (4 wood), NOT a phantom restore of step 0.
  assert.equal(result.restoredCount, 1, 'exactly one step reversed');
  assert.equal(sourceActor.created.length, 1, 'only step 1 ingredients restored');
  assert.equal(sourceActor.created[0].system.quantity, 4, 'step 1 quantity restored');
  assert.equal(craftingActor.system.currency.gp, 3, 'only step 1 currency (3 gp) refunded');

  // Step 0's produced output is untouched (the no-duplication invariant).
  const archived = runManager.getRunHistory(craftingActor)[0];
  assert.equal(
    JSON.stringify(archived.steps[0].createdResults),
    step0ResultsBefore,
    'the succeeded step 0 output is left intact'
  );
});
