/**
 * DIAGNOSIS repro (issue: immediate check-failure craft missing from the Journal
 * History). Drives the FULL CraftingEngine.craft() with the REAL CraftingRunManager
 * and a faithful Foundry-like actor (setFlag deep-merge + update `-=` deletion), for
 * a single-step IMMEDIATE (untimed) craft whose crafting check FAILS. Asserts the
 * actor's persisted craftingRuns flag has a `failed` history entry, and that the
 * RunJournalBuilder projects it to a visible GM entry.
 *
 * Permanent regression suite for issues 733 + 739: test 3 reproduces the stale-cache
 * clobber (a second writer's timed-resume `_persist` dropping an immediate failure from
 * history, surviving a restart) and is GREEN only with document-coherent persistence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { RunJournalBuilder } from '../src/systems/RunJournalBuilder.js';

// ---------------------------------------------------------------------------
// Faithful foundry.utils: getProperty / setProperty / expandObject / mergeObject
// with `-=` deletion, so setFlag + update behave like the Foundry document layer.
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function setProperty(object, path, value) {
  const keys = String(path).split('.');
  let target = object;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof target[k] !== 'object' || target[k] === null) target[k] = {};
    target = target[k];
  }
  target[keys[keys.length - 1]] = value;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Recursive merge mirroring Foundry mergeObject: plain objects merge, arrays and
// primitives REPLACE, and a `-=key` in the source deletes `key` from the target.
function mergeInto(target, source) {
  if (!isPlainObject(target)) target = {};
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('-=')) {
      delete target[key.slice(2)];
      continue;
    }
    if (isPlainObject(value) && isPlainObject(target[key])) {
      target[key] = mergeInto(target[key], value);
    } else if (isPlainObject(value)) {
      target[key] = mergeInto({}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

// expandObject: turn { 'a.b.-=c': null } into { a: { b: { '-=c': null } } }.
function expandObject(flat) {
  const result = {};
  for (const [path, value] of Object.entries(flat)) {
    setProperty(result, path, value);
  }
  return result;
}

globalThis.foundry = {
  utils: {
    getProperty,
    setProperty,
    randomID: (() => {
      let n = 0;
      return () => `rid-${++n}`;
    })(),
    mergeObject: (a, b) => mergeInto(a, b),
    expandObject,
    duplicate: (o) => JSON.parse(JSON.stringify(o)),
  },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

// ---------------------------------------------------------------------------
// Faithful actor: real flag document semantics.
// ---------------------------------------------------------------------------

function makeActor({ id = 'actor-1', items = [] } = {}) {
  const createdItems = [];
  const data = { flags: {} };
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    items,
    createdItems,
    _data: data,
    getFlag(ns, key) {
      return getProperty(data.flags, `${ns}.${key}`);
    },
    async setFlag(ns, key, value) {
      // Foundry setFlag deep-merges the value into flags[ns] under the (dotted) key.
      const expanded = expandObject({ [`${ns}.${key}`]: value });
      mergeInto(data.flags, expanded);
      return value;
    },
    async update(payload) {
      // Foundry update: expand dotted paths (incl. -= deletions) then deep-merge.
      const expanded = expandObject(payload);
      mergeInto(data, expanded);
    },
    async createEmbeddedDocuments(_type, itemDatas) {
      const stubs = (itemDatas || []).map((d, i) => ({
        id: `created-item-${createdItems.length + i}`,
        uuid: `Item.created-item-${createdItems.length + i}`,
        name: d.name || 'Created Item',
        system: { quantity: d.system?.quantity || 1 },
      }));
      createdItems.push(...stubs);
      return stubs;
    },
  };
}

function makeItem({ id, name = `Item ${id}`, quantity = 1 } = {}) {
  return {
    id,
    uuid: `Item.${id}`,
    name,
    parent: null,
    system: { quantity },
    effects: [],
    deleteCalled: false,
    updateCalled: false,
    async delete() {
      this.deleteCalled = true;
      this.system.quantity = 0;
    },
    async update(payload) {
      this.updateCalled = true;
      if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    },
  };
}

function makeSourceItem(name) {
  const dataObj = {
    name,
    img: 'icons/svg/item-bag.svg',
    type: 'loot',
    system: { quantity: 1 },
    effects: [],
  };
  return { ...dataObj, toObject() { return { ...dataObj, system: { ...dataObj.system } }; } };
}

function makeIngredientSet({ id = 'set-1', ingredientItem, quantity = 1 } = {}) {
  const ingredient = {
    systemItemId: ingredientItem.id,
    quantity,
    getDescription: () => `${quantity}x ${ingredientItem.name}`,
  };
  return {
    id,
    ingredientGroups: [{ options: [{ componentId: ingredientItem.id, quantity }] }],
    matchIngredients(availableItems, matcher) {
      const matched = availableItems.find((i) => matcher(ingredient, i));
      return matched ? [{ item: matched, quantity, ingredient }] : [];
    },
  };
}

function makeRecipe({ id = 'recipe-embercap', name = 'Embercap Skillet Cakes', craftingSystemId = 'sys-1', ingredientSets = [], resultGroups = [] } = {}) {
  const recipe = {
    id,
    name,
    craftingSystemId,
    ingredientSets,
    resultGroups,
    outcomeRouting: null,
    resultSelection: null,
    transferEffects: false,
    steps: [{ id: 'step-1' }],
    validate() { return { valid: true, errors: [] }; },
    toJSON() { return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId }; },
  };
  recipe.getExecutionSteps = () => [
    {
      id: 'step-1',
      name: 'Step 1',
      ingredientSets,
      resultGroups,
      toolIds: [],
      timeRequirement: null,
      outcomeRouting: null,
    },
  ];
  return recipe;
}

function makeSystem() {
  return {
    id: 'sys-1',
    name: 'Test Kitchen',
    resolutionMode: 'simple',
    features: { multiStepRecipes: false, craftingChecks: true, essences: false },
    craftingCheck: {
      enabled: true,
      simple: { rollFormula: '1d20', dc: 16, thresholdMode: 'meet', dcMode: 'static', tiers: [], checkBreakage: { triggers: [] } },
      outcomes: [],
      progressive: null,
      consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
    },
    managedItems: [{ id: 'comp-cake', registeredItemUuid: 'uuid:cake', difficulty: 1 }],
    components: [{ id: 'comp-cake', registeredItemUuid: 'uuid:cake', difficulty: 1 }],
  };
}

function setupGame(system, runManager) {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
      getCraftingRunManager: () => runManager,
      getResolutionModeService: () => null,
      getRecipeVisibilityService: () => null,
    },
    user: { id: 'user-akra', isGM: true, name: 'Akra' },
    users: [{ id: 'user-akra', isGM: true }],
    time: { worldTime: 1000 },
  };
  globalThis.fromUuid = async (uuid) => (uuid === 'uuid:cake' ? makeSourceItem('Embercap Skillet Cakes') : null);
}

test('ENGINE: an immediate check-FAILURE craft writes a `failed` entry to the actor crafting history', async () => {
  const system = makeSystem();
  const runManager = new CraftingRunManager();
  setupGame(system, runManager);

  const flour = makeItem({ id: 'flour-1', name: 'Embercap Flour', quantity: 3 });
  const ingredientSet = makeIngredientSet({ ingredientItem: flour, quantity: 1 });
  const recipe = makeRecipe({
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'comp-cake', quantity: 1 }] }],
  });

  const sourceActor = makeActor({ id: 'akra', items: [flour] });
  const craftingActor = sourceActor; // craft from/into the same actor

  const recipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [] } };
    },
    getToolsForSet() { return []; },
    ingredientMatchesItem(_recipe, ingredient, item) { return item === flour && item.id === ingredient.systemItemId; },
  };

  const resolutionService = new ResolutionModeService({ getSystem: (id) => (id === system.id ? system : null) });
  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);

  // Spy on discardRun to see whether the finally-block phantom discard fires.
  let discardCalls = 0;
  const origDiscard = runManager.discardRun.bind(runManager);
  runManager.discardRun = async (...args) => {
    discardCalls++;
    return origDiscard(...args);
  };

  // DC 16, rolled 12 → fail. Mirrors the maintainer's Embercap Skillet Cakes case.
  engine._runCraftingCheck = async () => ({
    success: false,
    outcome: 'fail',
    value: 12,
    message: 'Crafting check failed (rolled 12 vs DC 16)',
    data: { dc: 16, diceGroups: [{ groupId: 0, group: '1d20', sum: 12, results: [12] }] },
  });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, { interactive: true });

  assert.equal(result.success, false, 'the craft reports failure');

  // --- Persisted flag (survives reload): the source of truth for the Journal ---
  const persisted = craftingActor.getFlag('fabricate', 'fabricate.craftingRuns');
  console.log('persisted craftingRuns =', JSON.stringify(persisted, null, 2));
  console.log('discardRun call count =', discardCalls);

  assert.ok(persisted, 'a craftingRuns flag was persisted');
  assert.deepEqual(Object.keys(persisted.active || {}), [], 'no run left dangling in active');
  assert.equal(Array.isArray(persisted.history) ? persisted.history.length : 0, 1, 'exactly one history entry persisted');
  assert.equal(persisted.history?.[0]?.status, 'failed', 'the persisted history entry is `failed`');
  assert.equal(discardCalls, 0, 'the phantom-discard did NOT fire on the completed-failure path');

  // --- Manager cache (what the live UI reads) ---
  const history = runManager.getRunHistory(craftingActor);
  assert.equal(history.length, 1, 'manager history has the failed run');
  assert.equal(history[0].status, 'failed');

  // --- Projection layer: RunJournalBuilder as a GM viewer ---
  const journalBuilder = new RunJournalBuilder({
    recipeManager: { getRecipe: (id) => (id === recipe.id ? recipe : null) },
    getSystem: (id) => (id === system.id ? system : null),
    craftingRunManager: runManager,
    salvageRunManager: null,
    gatheringRunSource: null,
    localize: (k) => k,
  });
  const projection = journalBuilder.buildListing({ actor: craftingActor, viewer: game.user });
  console.log('projected history count =', projection.history.length);
  console.log('projected history[0] =', JSON.stringify(projection.history[0], null, 2));

  assert.equal(projection.history.length, 1, 'the failed run projects to exactly one visible history entry');
  assert.equal(projection.history[0].status, 'failed');
  assert.equal(projection.history[0].runType, 'crafting');

  // --- Reload survival: a FRESH manager (empty cache) reads the persisted flag ---
  const reloadedManager = new CraftingRunManager();
  const reloadedHistory = reloadedManager.getRunHistory(craftingActor);
  console.log('reloaded history count =', reloadedHistory.length);
  assert.equal(reloadedHistory.length, 1, 'the failed run survives a reload (fresh manager, persisted flag)');
  assert.equal(reloadedHistory[0].status, 'failed');
  assert.deepEqual(reloadedManager.getActiveRuns(craftingActor), [], 'no run resurrected in active after reload');
});

test('ENGINE: interactive deferred failure survives a concurrent world-time tick + journal read during the roll await', async () => {
  const system = makeSystem();
  const runManager = new CraftingRunManager();
  setupGame(system, runManager);

  const flour = makeItem({ id: 'flour-2', name: 'Embercap Flour', quantity: 3 });
  const ingredientSet = makeIngredientSet({ ingredientItem: flour, quantity: 1 });
  const recipe = makeRecipe({
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'comp-cake', quantity: 1 }] }],
  });
  const craftingActor = makeActor({ id: 'akra2', items: [flour] });

  const recipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [] } };
    },
    getToolsForSet() { return []; },
    ingredientMatchesItem(_recipe, ingredient, item) { return item === flour && item.id === ingredient.systemItemId; },
  };
  const resolutionService = new ResolutionModeService({ getSystem: (id) => (id === system.id ? system : null) });
  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);

  const journalBuilder = new RunJournalBuilder({
    recipeManager: { getRecipe: (id) => (id === recipe.id ? recipe : null) },
    getSystem: (id) => (id === system.id ? system : null),
    craftingRunManager: runManager,
    localize: (k) => k,
  });

  // The interactive roll dialog: resolves only after the test pokes concurrent
  // events (a world-time tick's processWorldTime + a journal read) while the run
  // is sitting in `active`, mirroring a player taking time to roll.
  let releaseRoll;
  const rollGate = new Promise((resolve) => { releaseRoll = resolve; });
  engine._runCraftingCheck = async () => {
    // While we're "waiting for the player to roll", the run is live in active.
    const midActive = runManager.getActiveRuns(craftingActor);
    console.log('during roll await, active runs =', midActive.length, 'status =', midActive[0]?.status);
    // A world-time tick fires (primary GM) and the journal re-reads.
    game.time.worldTime = 1500;
    await runManager.processWorldTime(1500);
    journalBuilder.buildListing({ actor: craftingActor, viewer: game.user });
    await rollGate;
    return { success: false, outcome: 'fail', value: 12, message: 'Crafting check failed (rolled 12 vs DC 16)', data: { dc: 16 } };
  };

  const craftPromise = engine.craft(craftingActor, [craftingActor], recipe, null, { interactive: true });
  releaseRoll();
  const result = await craftPromise;

  assert.equal(result.success, false);
  const persisted = craftingActor.getFlag('fabricate', 'fabricate.craftingRuns');
  console.log('deferred persisted =', JSON.stringify(persisted?.history?.map((h) => h.status)), 'active =', JSON.stringify(Object.keys(persisted?.active || {})));
  assert.equal(persisted.history.length, 1, 'the deferred failed run persisted to history');
  assert.equal(persisted.history[0].status, 'failed');
  assert.deepEqual(Object.keys(persisted.active), [], 'no dangling active run after deferred failure');

  const projection = journalBuilder.buildListing({ actor: craftingActor, viewer: game.user });
  assert.equal(projection.history.length, 1, 'deferred failed run projects to a visible entry');
});

// ---------------------------------------------------------------------------
// ROOT CAUSE: CraftingRunManager's write-through `_cache` is never invalidated
// (`invalidateCache` has ZERO callers in src/). Any SECOND writer to the same
// actor's `craftingRuns` flag whose cache predates a run persists a STALE
// container and silently CLOBBERS that run from the persisted document. This
// survives a world restart because the document itself is overwritten.
//
// Mirrors the maintainer's world exactly:
//   - client/manager A writes the immediate "Embercap" check-FAILURE to the doc
//   - client/manager B (primary-GM cache seeded BEFORE that write, holding a
//     maturing timed "Forge Breastplate" run) resumes the timed run on a
//     world-time tick; its _persist writes B's stale container back, dropping
//     Embercap while Forge (the run whose resume did the write) survives.
//   - after restart, a fresh manager reads the doc: Forge present, Embercap gone.
// ---------------------------------------------------------------------------
test('ROOT CAUSE: a stale-cache timed-resume _persist clobbers an immediate failure from history (survives restart)', async () => {
  const system = makeSystem();
  // Two managers = two clients (or a rebuilt manager) sharing ONE actor document.
  const managerA = new CraftingRunManager(); // the client that crafts Embercap (immediate)
  const managerB = new CraftingRunManager(); // the primary GM running the timed resume
  const actor = makeActor({ id: 'akra-shared', items: [] });

  // Timed "Forge Breastplate" recipe (a real timed step).
  const forgeRecipe = {
    id: 'recipe-forge',
    name: 'Forge Breastplate',
    craftingSystemId: 'sys-1',
    getExecutionSteps: () => [
      { id: 'forge-step', name: 'Forge', ingredientSets: [], resultGroups: [], toolIds: [], timeRequirement: { hours: 1 }, outcomeRouting: null },
    ],
  };

  // (1) The GM's manager B is seeded with the maturing timed Forge run and a
  // prior "yesterday" history entry — its cache snapshot PREDATES the Embercap write.
  setupGame(system, managerB);
  const forgeRun = await managerB.createRun(actor, forgeRecipe, [actor], 'user-akra');
  await managerB.markStepWaitingForTime(actor, forgeRun, 0, { hours: 1 });
  // A prior successful run already in the doc's history (from "yesterday").
  const seededHistory = actor.getFlag('fabricate', 'fabricate.craftingRuns');
  seededHistory.history.unshift({ id: 'run-yesterday', recipeId: 'recipe-forge', craftingSystemId: 'sys-1', status: 'succeeded', startedAt: 10, finishedAt: 20, steps: [] });
  await actor.setFlag('fabricate', 'fabricate.craftingRuns', seededHistory);
  // managerB's cache now holds {active:{forge waitingTime}, history:[yesterday]} and
  // is NEVER invalidated when the doc changes out-of-band below.
  managerB._cache.get(actor.id).history = [{ id: 'run-yesterday', recipeId: 'recipe-forge', craftingSystemId: 'sys-1', status: 'succeeded', startedAt: 10, finishedAt: 20, steps: [] }];

  // (2) Client A crafts the immediate Embercap check-FAILURE. Its manager reads the
  // doc fresh (sees forge + yesterday) and appends the failure — persisted to the doc.
  setupGame(system, managerA);
  const flour = makeItem({ id: 'flour-shared', name: 'Embercap Flour', quantity: 2 });
  const ingredientSet = makeIngredientSet({ ingredientItem: flour, quantity: 1 });
  actor.items.push(flour);
  const embercap = makeRecipe({
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'comp-cake', quantity: 1 }] }],
  });
  const recipeManager = {
    canCraft() { return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [] } }; },
    getToolsForSet() { return []; },
    ingredientMatchesItem(_recipe, ingredient, item) { return item === flour && item.id === ingredient.systemItemId; },
  };
  const engineA = new CraftingEngine(recipeManager, managerA, new ResolutionModeService({ getSystem: (id) => (id === system.id ? system : null) }));
  engineA._runCraftingCheck = async () => ({ success: false, outcome: 'fail', value: 12, message: 'Crafting check failed (rolled 12 vs DC 16)', data: { dc: 16 } });
  await engineA.craft(actor, [actor], embercap, null, { interactive: true });

  const afterEmbercap = actor.getFlag('fabricate', 'fabricate.craftingRuns');
  console.log('after Embercap write, doc history statuses =', JSON.stringify(afterEmbercap.history.map((h) => `${h.recipeId}:${h.status}`)));
  assert.ok(afterEmbercap.history.some((h) => h.recipeId === 'recipe-embercap' && h.status === 'failed'), 'Embercap failure IS written to the doc');

  // (3) The Forge timer matures. The PRIMARY GM (manager B, stale cache) resumes it:
  // processWorldTime flips it to inProgress and persists B's STALE container.
  setupGame(system, managerB);
  game.time.worldTime = 999999;
  await managerB.processWorldTime(999999);
  // Then the timed step finishes and the run is archived to history.
  await managerB.completeStepSuccess(actor, forgeRun, 0, { lastCheckResult: { success: true } });

  // (4) Restart: a fresh manager reads the persisted doc.
  const fresh = new CraftingRunManager();
  const finalHistory = fresh.getRunHistory(actor);
  console.log('POST-RESTART doc history =', JSON.stringify(finalHistory.map((h) => `${h.recipeId}:${h.status}`)));

  const forgeShows = finalHistory.some((h) => h.recipeId === 'recipe-forge' && h.status === 'succeeded');
  const embercapShows = finalHistory.some((h) => h.recipeId === 'recipe-embercap' && h.status === 'failed');
  assert.equal(forgeShows, true, 'the timed Forge run survives (it did the clobbering write)');
  // The BUG: the immediate Embercap failure was clobbered by manager B's stale-cache persist.
  assert.equal(embercapShows, true, 'REGRESSION GUARD: the immediate Embercap failure MUST survive the timed resume');
});
