/**
 * Unit tests for T-045: CraftingEngine.salvage() method
 *
 * 18 tests across 6 groups:
 *  Group 1: Input validation (3 tests)
 *  Group 2: Component resolution and feature validation (3 tests)
 *  Group 3: Salvage validation + ownership + tool checks (3 tests)
 *  Group 4: Salvage check failure + consumption policy (3 tests)
 *  Group 5: Success path — consume, create, record run (3 tests)
 *  Group 6: SalvageRun record shape and history management (3 tests)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

function getProperty(obj, path) {
  if (!obj || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

function setProperty(obj, path, value) {
  if (!obj || !path) return;
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

let idSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty,
    setProperty,
  },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

// fromUuid is overridden per test or defaults to null
globalThis.fromUuid = async () => null;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function makeItem(id, name, quantity = 1) {
  const item = {
    id,
    uuid: `Item.${id}`,
    name,
    system: { quantity },
    flags: {},
    parent: null,
    effects: [],
    deleteCalled: false,
    updateCalled: false,
    updatePayloads: [],
    toObject() {
      return {
        id: this.id,
        name: this.name,
        type: 'loot',
        system: { quantity: this.system.quantity },
      };
    },
    async delete() {
      this.deleteCalled = true;
    },
    async update(payload) {
      this.updateCalled = true;
      this.updatePayloads.push({ ...payload });
      if (payload['system.quantity'] !== undefined)
        this.system.quantity = payload['system.quantity'];
    },
  };
  return item;
}

function makeActor(id, items = []) {
  const flags = {};
  const created = [];
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    system: {},
    items: {
      contents: items,
      find: (fn) => items.find(fn),
      [Symbol.iterator]() {
        return items[Symbol.iterator]();
      },
    },
    getFlag(ns, key) {
      return flags[ns]?.[key] ?? null;
    },
    async setFlag(ns, key, value) {
      if (!flags[ns]) flags[ns] = {};
      flags[ns][key] = value;
    },
    flags: {},
    _flagStore: flags,
    createdItems: created,
    async createEmbeddedDocuments(_type, dataArr) {
      return dataArr.map((d, i) => {
        const it = makeItem(`created-${id}-${i}`, d.name || 'Created', d.system?.quantity || 1);
        it.uuid = `Actor.${id}.Item.created-${i}`;
        created.push(it);
        return it;
      });
    },
  };
}

function makeSystem({
  id = 'sys-1',
  salvageEnabled = true,
  salvageResolutionMode = 'simple',
  salvageCraftingCheck = null,
  components = [],
  tools = [],
} = {}) {
  return {
    id,
    features: { salvage: salvageEnabled },
    salvageResolutionMode,
    salvageCraftingCheck: salvageCraftingCheck || {
      enabled: false,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components,
    tools,
    craftingCheck: {},
  };
}

function makeComponent({
  id = 'comp-1',
  name = 'Test Component',
  registeredItemUuid = null,
  salvageEnabled = true,
  ingredientQuantity = 1,
  toolIds = [],
  resultGroups = null,
} = {}) {
  return {
    id,
    name,
    registeredItemUuid,
    salvage: salvageEnabled
      ? {
          enabled: true,
          ingredientQuantity,
          toolIds,
          resultGroups: resultGroups ?? [
            {
              id: 'rg-1',
              name: 'Scraps',
              results: [{ id: 'r-1', componentId: 'result-comp', quantity: 1 }],
            },
          ],
        }
      : null,
  };
}

/**
 * Build a library Tool (limitedUses) whose `componentId` matches the salvage
 * tool item id used by the test-double matcher (item.id === tool.componentId).
 */
function makeFakeTool(componentId = 'cat-comp') {
  return {
    id: `lib-${componentId}`,
    componentId,
    breakage: { mode: 'limitedUses', maxUses: 5 },
    onBreak: { mode: 'flagBroken' },
  };
}

/**
 * Build a CraftingEngine with minimal stubs.
 * The mock RecipeManager matches tools to items by componentId = item.id.
 */
function makeEngine(opts = {}) {
  const mockRecipeManager = {
    canCraft() {
      return {
        canCraft: true,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], tools: [] },
      };
    },
    getToolsForSet() {
      return [];
    },
    toolMatchesItem(_recipe, tool, item) {
      return item.id === (tool.componentId || tool.systemItemId);
    },
    ingredientMatchesItem() {
      return false;
    },
  };
  return new CraftingEngine(
    mockRecipeManager,
    null,
    opts.resolutionModeService || null,
    null,
    opts.salvageRunManager || new SalvageRunManager()
  );
}

/**
 * Configure globalThis.game with the given system.
 * Also sets globalThis.fromUuid to return the given actor.
 */
function setupGame(system, actor) {
  const salvageRunManager = new SalvageRunManager();
  globalThis.fromUuid = async (uuid) => {
    if (actor && uuid === actor.uuid) return actor;
    return null;
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
      getSalvageRunManager: () => salvageRunManager,
    },
    user: { id: 'user-1' },
    time: { worldTime: 100 },
  };

  return salvageRunManager;
}

// ---------------------------------------------------------------------------
// Group 1: Input validation
// ---------------------------------------------------------------------------

test('salvage() returns failure when actorUuid resolves to null', async () => {
  const engine = makeEngine();
  globalThis.fromUuid = async () => null;
  globalThis.game = { fabricate: { getCraftingSystemManager: () => ({ getSystem: () => null }) } };

  const result = await engine.salvage('Actor.nobody', 'sys-1', 'comp-1');

  assert.equal(result.success, false);
  assert.match(result.message, /actor not found/i);
  assert.equal(result.salvageRun, null);
});

test('salvage() returns failure when craftingSystem is not found', async () => {
  const engine = makeEngine();
  const actor = makeActor('actor-1');
  globalThis.fromUuid = async () => actor;
  globalThis.game = {
    fabricate: { getCraftingSystemManager: () => ({ getSystem: () => null }) },
    time: { worldTime: 0 },
  };

  const result = await engine.salvage(actor.uuid, 'sys-missing', 'comp-1');

  assert.equal(result.success, false);
  assert.match(result.message, /sys-missing/);
  assert.equal(result.salvageRun, null);
});

test('salvage() returns failure when componentId not found in system', async () => {
  const engine = makeEngine();
  const actor = makeActor('actor-1');
  const system = makeSystem({ components: [] }); // empty, comp-1 not present
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, 'comp-missing');

  assert.equal(result.success, false);
  assert.match(result.message, /comp-missing/);
  assert.equal(result.salvageRun, null);
});

// ---------------------------------------------------------------------------
// Group 2: Feature validation
// ---------------------------------------------------------------------------

test('salvage() returns failure when features.salvage is not enabled on system', async () => {
  const engine = makeEngine();
  const actor = makeActor('actor-1');
  const component = makeComponent();
  const system = makeSystem({ salvageEnabled: false, components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.match(result.message, /salvage feature/i);
});

test('salvage() returns failure when component.salvage.enabled is false', async () => {
  const engine = makeEngine();
  const actor = makeActor('actor-1');
  const component = makeComponent({ salvageEnabled: false });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.match(result.message, /not enabled/i);
});

test('salvage() returns failure when validateSalvage reports errors', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({
      valid: false,
      errors: ['Needs exactly 1 result group in simple mode'],
    }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  const actor = makeActor('actor-1');
  const component = makeComponent();
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.match(result.message, /result group/i);
});

// ---------------------------------------------------------------------------
// Group 3: Ownership and tool checks
// ---------------------------------------------------------------------------

test('salvage() returns failure when actor does not have enough component items', async () => {
  const engine = makeEngine();
  const compItem = makeItem('comp-item', 'Test Component', 1); // only qty 1
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', ingredientQuantity: 3 });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.match(result.message, /not enough/i);
});

test('salvage() returns failure when required tool item is missing', async () => {
  const engine = makeEngine();
  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]); // no tool item
  const tool = makeFakeTool('acid-vial-comp');
  const component = makeComponent({ name: 'Test Component', toolIds: [tool.id] });
  const system = makeSystem({ components: [component], tools: [tool] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.match(result.message, /tool/i);
});

test('salvage() cannot consume and use the same physical Item as a Tool', async () => {
  const engine = makeEngine();
  const sharedItem = makeItem('shared-component', 'Test Component', 1);
  const actor = makeActor('actor-1', [sharedItem]);
  const tool = makeFakeTool('shared-component');
  const component = makeComponent({ name: 'Test Component', toolIds: [tool.id] });
  const system = makeSystem({ components: [component], tools: [tool] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.match(result.message, /tool/i);
  assert.equal(sharedItem.deleteCalled, false, 'validation blocks before consuming the shared Item');
  assert.equal(sharedItem.updateCalled, false, 'validation blocks before mutating the shared Item');
});

test('salvage() can consume one copy and use a distinct physical copy as a Tool', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const consumedCopy = makeItem('consumed-copy', 'Test Component', 1);
  const toolCopy = makeItem('tool-copy', 'Test Component', 1);
  const actor = makeActor('actor-1', [consumedCopy, toolCopy]);
  const tool = makeFakeTool('tool-copy');
  const component = makeComponent({
    name: 'Test Component',
    toolIds: [tool.id],
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ components: [component], tools: [tool] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(consumedCopy.deleteCalled, true);
  assert.equal(toolCopy.deleteCalled, false);
});

test('salvage() passes checks when actor has enough items and tools present', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 2);
  const toolItem = makeItem('acid-vial-comp', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial-comp');
  const component = makeComponent({
    name: 'Test Component',
    toolIds: [tool.id],
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  // Should not fail due to ownership/tool checks
  assert.ok(
    result.success || /check|macro/i.test(result.message || ''),
    `Unexpected failure: ${result.message}`
  );
});

// ---------------------------------------------------------------------------
// Group 4: Salvage check failure + consumption policy
// ---------------------------------------------------------------------------

test('salvage() returns failure when salvage check fails', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Roll failed',
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.match(result.message, /roll failed/i);
});

test('salvage() consumes component on failure when consumeComponentOnFail is true', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Failed',
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    components: [component],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(
    compItem.deleteCalled,
    true,
    'Component should be deleted on failure when consumeComponentOnFail=true'
  );
});

test('salvage() does not consume component on failure when consumeComponentOnFail is false', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Failed',
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    components: [component],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: false, breakToolsOnFail: false },
    },
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(
    compItem.deleteCalled,
    false,
    'Component should NOT be deleted when consumeComponentOnFail=false'
  );
});

test('salvage(): a cancelled interactive check aborts with zero mutation and no orphaned run', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const salvageRunManager = new SalvageRunManager();
  const engine = makeEngine({ resolutionModeService: fakeResolutionService, salvageRunManager });
  // Simulate the player dismissing the interactive roll dialog.
  engine._runSalvageCraftingCheck = async () => ({ success: false, cancelled: true });

  const compItem = makeItem('comp-item', 'Test Component', 3);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', ingredientQuantity: 1 });
  const system = makeSystem({
    components: [component],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      // A policy that WOULD consume + break on a genuine failure — proving the
      // cancel path bypasses it entirely.
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true },
    },
  });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id, { interactive: true });

  assert.equal(result.success, false, 'cancelled salvage is not a success');
  assert.equal(result.cancelled, true, 'cancelled flag surfaced');
  assert.equal(result.results, null, 'no results created');
  assert.equal(compItem.deleteCalled, false, 'component NOT consumed on cancel');
  assert.equal(
    salvageRunManager.getActiveRuns(actor).length,
    0,
    'phantom in-progress run discarded'
  );
  assert.equal(
    salvageRunManager.getRunHistory(actor).length,
    0,
    'no history entry — zero run mutation'
  );
});

test('misconfigured required salvage check: salvage aborts with ZERO mutation (no consume/break)', async () => {
  // routed salvage with no authored roll formula is a GM-side misconfiguration. The
  // real _runSalvageCraftingCheck flags it `misconfigured`, and salvage() must abort
  // before any consumption even though the policy WOULD consume + break on a failure.
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => {
    tool.used = true;
    return [];
  };
  let consumeCalled = false;
  engine._consumeComponentItems = async (...args) => {
    consumeCalled = true;
    // Defer to nothing — but flag the (unexpected) call.
    return args.length ? [] : [];
  };

  const component = makeComponent({
    name: 'Test Component',
    toolIds: [tool.id],
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    salvageResolutionMode: 'routed',
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true,
      // No authored routed roll formula → required-check misconfiguration.
      routed: { rollFormula: '' },
      outcomes: [],
      progressive: null,
      // Policy would consume the component AND break tools on a genuine failure.
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true },
    },
  });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false, 'a misconfigured required salvage check fails');
  assert.equal(result.results, null, 'no results on a misconfigured abort');
  assert.match(result.message, /requires a configured salvage check roll formula/);
  assert.equal(consumeCalled, false, 'the component must NOT be consumed on a misconfiguration');
  assert.equal(compItem.deleteCalled, false, 'source component item is untouched');
  assert.equal(compItem.updateCalled, false, 'source component quantity is unchanged');
  assert.equal(tool.used, false, 'tools must NOT be broken on a misconfiguration');
  assert.equal(actor.createdItems.length, 0, 'no result items are created');
});

// A routed salvage with no authored roll formula is the required-check
// misconfiguration the fizzle branch of `_runSalvageCraftingCheck` flags.
function makeMisconfiguredSetup(salvageRunManager) {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService, salvageRunManager });
  const compItem = makeItem('comp-item', 'Test Component', 3);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    ingredientQuantity: 1,
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    salvageResolutionMode: 'routed',
    components: [component],
    salvageCraftingCheck: {
      enabled: true,
      routed: { rollFormula: '' },
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true },
    },
  });
  setupGame(system, actor);
  return { engine, actor, component, system, compItem };
}

test('misconfigured salvage on a call-created run leaves no active run and mutates nothing', async () => {
  const salvageRunManager = new SalvageRunManager();
  const { engine, actor, component, system, compItem } = makeMisconfiguredSetup(salvageRunManager);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false, 'a misconfigured required salvage check fails');
  assert.match(result.message, /requires a configured salvage check roll formula/);
  assert.equal(result.salvageRun, null, 'a call-created run is reported as discarded');
  assert.equal(
    salvageRunManager.getActiveRuns(actor).length,
    0,
    'the phantom in-progress run is discarded, not stranded'
  );
  assert.equal(
    salvageRunManager.getRunHistory(actor).length,
    0,
    'no history entry — zero run mutation'
  );
  assert.equal(compItem.deleteCalled, false, 'source component item is untouched');
});

test('misconfigured salvage that reused a pre-existing active run leaves that run untouched', async () => {
  const salvageRunManager = new SalvageRunManager();
  const { engine, actor, component, system } = makeMisconfiguredSetup(salvageRunManager);

  // A pre-existing active run for the same component that THIS call will reuse.
  const preExisting = await salvageRunManager.createRun(actor, {
    actorUuid: actor.uuid,
    craftingSystemId: system.id,
    componentId: component.id,
    status: 'inProgress',
  });

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false, 'a misconfigured required salvage check still fails');
  assert.equal(result.salvageRun?.id, preExisting.id, 'the reused run is returned, not null');
  const active = salvageRunManager.getActiveRuns(actor);
  assert.equal(active.length, 1, 'the reused pre-existing run is NOT discarded');
  assert.equal(active[0].id, preExisting.id, 'the surviving run is the one reused this call');
});

test('a retry after a misconfigured abort creates a fresh run rather than reusing a stranded one', async () => {
  const salvageRunManager = new SalvageRunManager();
  const { engine, actor, component, system } = makeMisconfiguredSetup(salvageRunManager);

  const createdIds = [];
  const realCreateRun = salvageRunManager.createRun.bind(salvageRunManager);
  salvageRunManager.createRun = async (actorArg, runData) => {
    const run = await realCreateRun(actorArg, runData);
    createdIds.push(run.id);
    return run;
  };

  await engine.salvage(actor.uuid, system.id, component.id);
  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(createdIds.length, 2, 'each attempt creates its own run');
  assert.notEqual(createdIds[0], createdIds[1], 'the retry does not reuse the first run');
  assert.equal(
    salvageRunManager.getActiveRuns(actor).length,
    0,
    'neither misconfigured attempt strands a run'
  );
});

// ---------------------------------------------------------------------------
// Group 5: Success path
// ---------------------------------------------------------------------------

test('salvage() consumes component item on success', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({
      groups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
      meta: {},
    }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    ingredientQuantity: 1,
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(
    compItem.deleteCalled,
    true,
    'Component should be deleted on success (qty == ingredientQuantity)'
  );
});

// Issue 675: the player summary reports "with a roll of N", so the engine must thread
// the rolled total onto the TOP-LEVEL result — not only onto `salvageRun`, which is
// null on the runless path. A rolled check surfaces the number; a no-check salvage
// surfaces null so the UI omits the roll phrase entirely.
test('salvage() threads the rolled total onto the top-level result (issue 675)', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({
      groups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
      meta: {},
    }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: 23,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    ingredientQuantity: 1,
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(
    result.value,
    23,
    'the rolled total is threaded top-level, even without a run manager'
  );
});

test('salvage() reports a null roll value for a no-check salvage (issue 675)', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({
      groups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
      meta: {},
    }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    ingredientQuantity: 1,
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(
    result.value,
    null,
    'no roll happened — value is null so the UI prints no roll phrase'
  );
});

test('salvage() reduces component quantity when partially consumed', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({
      groups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
      meta: {},
    }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 5);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    ingredientQuantity: 2,
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(compItem.updateCalled, true, 'Component item quantity should be updated');
  assert.equal(compItem.system.quantity, 3, 'Remaining quantity should be 3 (5 - 2)');
});

test('salvage() creates result items on success', async () => {
  const resultComp = { id: 'result-comp', name: 'Scrap Metal', registeredItemUuid: null };
  const resultGroup = {
    id: 'rg-1',
    name: 'Scraps',
    results: [{ id: 'r-1', componentId: 'result-comp', quantity: 3 }],
  };

  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [resultGroup], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', resultGroups: [resultGroup] });
  const system = makeSystem({ components: [component, resultComp] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.ok(Array.isArray(result.results), 'results should be an array');
  assert.ok(result.results.length > 0, 'Should have created at least one result item');
});

// ---------------------------------------------------------------------------
// Group 6: SalvageRun record shape and history
// ---------------------------------------------------------------------------

test('salvage() creates a SalvageRun record with correct shape on success', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({
      groups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
      meta: {},
    }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    id: 'comp-1',
    name: 'Test Component',
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ id: 'sys-1', components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.ok(result.salvageRun, 'salvageRun should be present in result');

  const run = result.salvageRun;
  assert.ok(run.id, 'run.id should be set');
  assert.equal(run.craftingSystemId, 'sys-1');
  assert.equal(run.componentId, 'comp-1');
  assert.equal(run.status, 'succeeded');
  assert.ok(run.startedAt != null, 'startedAt should be set');
  assert.ok(run.finishedAt != null, 'finishedAt should be set');
  assert.ok(Array.isArray(run.consumedComponents), 'consumedComponents should be array');
  assert.ok(Array.isArray(run.createdResults), 'createdResults should be array');
  assert.equal(run.failureReason, null);
});

test('salvage() creates a failed SalvageRun record on check failure', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Roll too low',
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    id: 'comp-1',
    name: 'Test Component',
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ id: 'sys-1', components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.ok(result.salvageRun, 'salvageRun should be present even on failure');
  assert.equal(result.salvageRun.status, 'failed');
  assert.equal(result.salvageRun.failureReason, 'Roll too low');
});

test('salvage() appends run to actor flags history and respects 50-entry limit', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({
      groups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
      meta: {},
    }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  // Pre-populate actor flags with 50 existing runs
  const compItem = makeItem('comp-item', 'Test Component', 100);
  const actor = makeActor('actor-1', [compItem]);

  // Populate 50 existing history entries
  const existingHistory = Array.from({ length: 50 }, (_, i) => ({
    id: `old-run-${i}`,
    componentId: 'comp-1',
    status: 'succeeded',
  }));
  await actor.setFlag('fabricate', 'fabricate.salvageRuns', {
    active: {},
    history: existingHistory,
  });

  const component = makeComponent({
    id: 'comp-1',
    name: 'Test Component',
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ id: 'sys-1', components: [component] });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  // Read back via getFlag
  const stored = actor.getFlag('fabricate', 'fabricate.salvageRuns');
  const history = stored?.history ?? [];

  // History should be capped at 50
  assert.ok(history.length <= 50, `History should be capped at 50, got ${history.length}`);
  // The newest run should be at index 0 (unshifted)
  assert.equal(history[0].componentId, 'comp-1', 'Newest run should be first');
});

// ---------------------------------------------------------------------------
// Group 7: Simple mode -- full validate-consume-create flow
// ---------------------------------------------------------------------------

test('salvage() simple mode creates result items with correct quantities from result group', async () => {
  const resultComp1 = { id: 'scrap-iron', name: 'Scrap Iron', registeredItemUuid: null };
  const resultComp2 = { id: 'scrap-wood', name: 'Scrap Wood', registeredItemUuid: null };
  const resultGroup = {
    id: 'rg-1',
    name: 'Salvage Pile',
    results: [
      { id: 'r-1', componentId: 'scrap-iron', quantity: 2 },
      { id: 'r-2', componentId: 'scrap-wood', quantity: 3 },
    ],
  };

  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [resultGroup], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', resultGroups: [resultGroup] });
  const system = makeSystem({ components: [component, resultComp1, resultComp2] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.ok(Array.isArray(result.results), 'results should be an array');
  assert.equal(result.results.length, 2, 'Should create one item per result entry');
  // First result created with quantity 2
  assert.equal(actor.createdItems[0].system.quantity, 2, 'First result should have quantity 2');
  // Second result created with quantity 3
  assert.equal(actor.createdItems[1].system.quantity, 3, 'Second result should have quantity 3');
});

test('salvage() simple mode uses only the first result group when component has multiple groups', async () => {
  const resultComp = { id: 'scrap-iron', name: 'Scrap Iron', registeredItemUuid: null };
  const group1 = {
    id: 'rg-1',
    name: 'Group One',
    results: [{ id: 'r-1', componentId: 'scrap-iron', quantity: 1 }],
  };
  const group2 = {
    id: 'rg-2',
    name: 'Group Two',
    results: [{ id: 'r-2', componentId: 'scrap-iron', quantity: 5 }],
  };

  // Fake service returns only first group (simulating simple-mode _resolveSalvageResultGroups behaviour)
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [group1], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', resultGroups: [group1, group2] });
  const system = makeSystem({ components: [component, resultComp] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(actor.createdItems.length, 1, 'Only one item created (from group 1)');
  assert.equal(
    actor.createdItems[0].system.quantity,
    1,
    'Quantity should be 1 from group 1, not 5 from group 2'
  );
});

// ---------------------------------------------------------------------------
// Group 8: Routed mode -- outcome routing
// ---------------------------------------------------------------------------

test('salvage() routed mode routes to correct result group based on check outcome', async () => {
  const passComp = { id: 'gold-nugget', name: 'Gold Nugget', registeredItemUuid: null };
  const failComp = { id: 'coal-dust', name: 'Coal Dust', registeredItemUuid: null };
  const passGroup = {
    id: 'rg-pass',
    name: 'Pass Results',
    results: [{ id: 'r-1', componentId: 'gold-nugget', quantity: 1 }],
  };
  const failGroup = {
    id: 'rg-fail',
    name: 'Fail Results',
    results: [{ id: 'r-2', componentId: 'coal-dust', quantity: 1 }],
  };

  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  // Return 'pass' outcome
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: 'pass',
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = {
    id: 'comp-1',
    name: 'Test Component',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [passGroup, failGroup],
      outcomeRouting: { pass: 'rg-pass', fail: 'rg-fail' },
    },
  };
  const system = makeSystem({
    salvageResolutionMode: 'routed',
    components: [component, passComp, failComp],
  });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  // Only gold-nugget (from rg-pass) should be created, not coal-dust
  assert.equal(actor.createdItems.length, 1, 'Only one result item created (from rg-pass)');
  assert.equal(actor.createdItems[0].name, 'Gold Nugget', 'Result should be from the pass group');
});

test('salvage() routed mode returns empty results array when outcome has no routing entry', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  // Return an outcome not in the routing map
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: 'unknown-outcome',
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = {
    id: 'comp-1',
    name: 'Test Component',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        {
          id: 'rg-pass',
          name: 'Pass',
          results: [{ id: 'r-1', componentId: 'scrap', quantity: 1 }],
        },
      ],
      outcomeRouting: { pass: 'rg-pass' },
    },
  };
  const system = makeSystem({ salvageResolutionMode: 'routed', components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true, 'Should succeed even with unrecognised outcome');
  assert.ok(Array.isArray(result.results), 'results should be an array');
  assert.equal(result.results.length, 0, 'No results for unrecognised outcome');
  assert.equal(actor.createdItems.length, 0, 'No items created');
});

test('_resolveSalvageResultGroups routed mode selects correct group for each outcome', () => {
  const engine = makeEngine();
  const groups = [
    {
      id: 'rg-critical',
      name: 'Critical',
      results: [{ id: 'r-1', componentId: 'gem', quantity: 3 }],
    },
    { id: 'rg-pass', name: 'Pass', results: [{ id: 'r-2', componentId: 'ore', quantity: 1 }] },
    { id: 'rg-fail', name: 'Fail', results: [] },
  ];
  const component = {
    id: 'comp-1',
    name: 'Ore',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: groups,
      outcomeRouting: { critical: 'rg-critical', pass: 'rg-pass', fail: 'rg-fail' },
    },
  };
  const system = makeSystem({ salvageResolutionMode: 'routed', components: [component] });

  const criticalResult = engine._resolveSalvageResultGroups(component, system, {
    outcome: 'critical',
    value: null,
  });
  assert.equal(criticalResult.length, 1);
  assert.equal(criticalResult[0].id, 'rg-critical');

  const passResult = engine._resolveSalvageResultGroups(component, system, {
    outcome: 'pass',
    value: null,
  });
  assert.equal(passResult.length, 1);
  assert.equal(passResult[0].id, 'rg-pass');

  const failResult = engine._resolveSalvageResultGroups(component, system, {
    outcome: 'fail',
    value: null,
  });
  assert.equal(failResult.length, 1);
  assert.equal(failResult[0].id, 'rg-fail');
});

test('_resolveSalvageResultGroups routed salvage routes by outcomeRouting (former tiered alias, now canonical)', () => {
  // Salvage retains its own outcomeRouting model at runtime; the legacy `tiered`
  // salvage token is normalized to `routed` by the manager / 1.4.0 migration
  // before reaching the engine, so the engine only ever sees canonical `routed`.
  const engine = makeEngine();
  const groups = [
    { id: 'rg-pass', name: 'Pass', results: [{ id: 'r-1', componentId: 'ore', quantity: 1 }] },
    { id: 'rg-fail', name: 'Fail', results: [] },
  ];
  const component = {
    id: 'comp-1',
    name: 'Ore',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: groups,
      outcomeRouting: { pass: 'rg-pass', fail: 'rg-fail' },
    },
  };
  const system = makeSystem({ salvageResolutionMode: 'routed', components: [component] });

  const passResult = engine._resolveSalvageResultGroups(component, system, {
    outcome: 'pass',
    value: null,
  });
  assert.equal(passResult.length, 1);
  assert.equal(passResult[0].id, 'rg-pass');
});

// ---------------------------------------------------------------------------
// Group 9: Progressive mode -- difficulty-based awarding
// ---------------------------------------------------------------------------

test('_resolveSalvageResultGroups progressive mode awards results up to check value by difficulty', () => {
  const engine = makeEngine();
  // difficulty 2 + difficulty 3 = 5, difficulty 5 would need 10 total. Value = 7 → awards first two (2+3=5 <= 7), skips third (5 > remaining 2)
  const resultGroup = {
    id: 'rg-1',
    name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 }, // difficulty 2
      { id: 'r-2', componentId: 'item-b', quantity: 1 }, // difficulty 3
      { id: 'r-3', componentId: 'item-c', quantity: 1 }, // difficulty 5
    ],
  };
  const component = {
    id: 'comp-1',
    name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] },
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [
      component,
      { id: 'item-a', name: 'Item A', difficulty: 2 },
      { id: 'item-b', name: 'Item B', difficulty: 3 },
      { id: 'item-c', name: 'Item C', difficulty: 5 },
    ],
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, {
    outcome: null,
    value: 7,
  });
  assert.equal(awarded.length, 1);
  assert.equal(
    awarded[0].results.length,
    2,
    'Should award item-a (cost 2) and item-b (cost 3), total 5 <= 7'
  );
  assert.equal(awarded[0].results[0].componentId, 'item-a');
  assert.equal(awarded[0].results[1].componentId, 'item-b');
});

test('_resolveSalvageResultGroups progressive mode awards nothing when check value is 0', () => {
  const engine = makeEngine();
  const resultGroup = {
    id: 'rg-1',
    name: 'Loot',
    results: [{ id: 'r-1', componentId: 'item-a', quantity: 1 }],
  };
  const component = {
    id: 'comp-1',
    name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] },
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [component, { id: 'item-a', name: 'Item A', difficulty: 2 }],
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, {
    outcome: null,
    value: 0,
  });
  assert.equal(awarded.length, 1);
  assert.equal(awarded[0].results.length, 0, 'Value 0 should award nothing');
});

test('_resolveSalvageResultGroups progressive exceed mode awards only when value strictly exceeds cost', () => {
  // exceed: a result is awarded only when `remaining > cost` (strict). value 5,
  // costs 2 then 3 → item-a (5 > 2, remaining 3) awarded; item-b (3 > 3 false) stops.
  const engine = makeEngine();
  const resultGroup = {
    id: 'rg-1',
    name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 }, // difficulty 2
      { id: 'r-2', componentId: 'item-b', quantity: 1 }, // difficulty 3
    ],
  };
  const component = {
    id: 'comp-1',
    name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] },
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'exceed' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [
      component,
      { id: 'item-a', name: 'Item A', difficulty: 2 },
      { id: 'item-b', name: 'Item B', difficulty: 3 },
    ],
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, {
    outcome: null,
    value: 5,
  });
  assert.equal(awarded.length, 1);
  assert.equal(
    awarded[0].results.length,
    1,
    'exceed awards item-a only (5 > 2); item-b stops (3 > 3 is false)'
  );
  assert.equal(awarded[0].results[0].componentId, 'item-a');
});

test('_resolveSalvageResultGroups progressive forces quantity 1 — an ordered list has no counts', () => {
  // READ THIS BEFORE "RESTORING" THE AUTHORED QUANTITY (issue 676).
  //
  // Progressive is an ORDERED LIST OF INDIVIDUAL RESULTS. Repetition is expressed by
  // listing the same component twice — never by a count — because the award loop spends
  // the roll budget PER ENTRY: it charges the component's difficulty once and awards the
  // entry once. A `quantity: 2` was therefore two items for the price of one entry's
  // difficulty, which is not a rule the mode has.
  //
  // Recipes already forced this (`ResolutionModeService._resolveProgressive`:
  // `awarded.map((result) => ({ ...result, quantity: 1 }))`). Salvage did not, so it
  // returned the authored objects by identity and `_createResultItems` wrote
  // `itemData.system.quantity = result.quantity` — set 2, get 2. This test pins the
  // two paths to the SAME rule.
  //
  // `quantity` stays in the stored model (the normalizer still clamps it) and is inert
  // here, so no migration is needed: an authored 2 simply stops being honoured.
  const engine = makeEngine();
  const resultGroup = {
    id: 'rg-1',
    name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 2 }, // difficulty 2
      { id: 'r-2', componentId: 'item-a', quantity: 7 }, // the SAME component, listed twice
    ],
  };
  const component = {
    id: 'comp-1',
    name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] },
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [component, { id: 'item-a', name: 'Item A', difficulty: 2 }],
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, {
    outcome: null,
    value: 4,
  });
  assert.equal(awarded[0].results.length, 2, 'a budget of 4 buys both entries at difficulty 2');
  assert.deepEqual(
    awarded[0].results.map((result) => result.quantity),
    [1, 1],
    'every awarded progressive entry is exactly one item, whatever the world authored'
  );
  // The rest of the authored result must survive the rewrite — only `quantity` changes.
  assert.equal(awarded[0].results[0].id, 'r-1');
  assert.equal(awarded[0].results[0].componentId, 'item-a');
});

test('_resolveSalvageResultGroups progressive partial mode awards a final partial result on remainder', () => {
  // partial: full results while `remaining >= cost`, then ONE final result on any
  // leftover `remaining > 0`. value 4, costs 3 then 5 → item-a fully (remaining 1),
  // item-b as the partial tail (remaining 1 > 0), then stop.
  const engine = makeEngine();
  const resultGroup = {
    id: 'rg-1',
    name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 }, // difficulty 3
      { id: 'r-2', componentId: 'item-b', quantity: 1 }, // difficulty 5
      { id: 'r-3', componentId: 'item-c', quantity: 1 }, // difficulty 2
    ],
  };
  const component = {
    id: 'comp-1',
    name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] },
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'partial' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [
      component,
      { id: 'item-a', name: 'Item A', difficulty: 3 },
      { id: 'item-b', name: 'Item B', difficulty: 5 },
      { id: 'item-c', name: 'Item C', difficulty: 2 },
    ],
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, {
    outcome: null,
    value: 4,
  });
  assert.equal(awarded.length, 1);
  assert.equal(
    awarded[0].results.length,
    2,
    'partial awards item-a (full) then item-b (partial tail), stopping before item-c'
  );
  assert.equal(awarded[0].results[0].componentId, 'item-a');
  assert.equal(awarded[0].results[1].componentId, 'item-b');
});

test('_resolveSalvageResultGroups progressive mode skips results with invalid difficulty and continues', () => {
  // Salvage skips (continue) a result whose component difficulty is missing/<1
  // rather than failing the whole award. value 6: item-a (cost 2) awarded, item-b
  // (no difficulty) skipped, item-c (cost 3) awarded → both valid results awarded.
  const engine = makeEngine();
  const resultGroup = {
    id: 'rg-1',
    name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 }, // difficulty 2
      { id: 'r-2', componentId: 'item-b', quantity: 1 }, // no/invalid difficulty -> skipped
      { id: 'r-3', componentId: 'item-c', quantity: 1 }, // difficulty 3
    ],
  };
  const component = {
    id: 'comp-1',
    name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] },
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [
      component,
      { id: 'item-a', name: 'Item A', difficulty: 2 },
      { id: 'item-b', name: 'Item B', difficulty: 0 }, // invalid (< 1) -> skipped, not a misconfiguration
      { id: 'item-c', name: 'Item C', difficulty: 3 },
    ],
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, {
    outcome: null,
    value: 6,
  });
  assert.equal(awarded.length, 1);
  assert.equal(
    awarded[0].results.length,
    2,
    'item-a and item-c awarded; item-b skipped on invalid difficulty'
  );
  assert.equal(awarded[0].results[0].componentId, 'item-a');
  assert.equal(awarded[0].results[1].componentId, 'item-c');
});

test('salvage() progressive mode creates items matching awarded results', async () => {
  const itemAComp = { id: 'item-a', name: 'Item A', registeredItemUuid: null, difficulty: 2 };
  const itemBComp = { id: 'item-b', name: 'Item B', registeredItemUuid: null, difficulty: 5 };
  const resultGroup = {
    id: 'rg-1',
    name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 2 }, // cost 2
      { id: 'r-2', componentId: 'item-b', quantity: 1 }, // cost 5
    ],
  };

  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  // value=3 → only item-a (cost 2) should be awarded
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: 3,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = {
    id: 'comp-1',
    name: 'Test Component',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] },
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [component, itemAComp, itemBComp],
  });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(actor.createdItems.length, 1, 'Only item-a should be created (cost 2 <= value 3)');
  // ONE item, though the group authors `quantity: 2` — the BEHAVIOUR CHANGE of issue 676,
  // asserted end-to-end through `_createResultItems`. Progressive is an ordered list of
  // individual results; a count was never a rule of the mode, and honouring one gave two
  // items for one entry's difficulty. Recipes have always forced this; salvage now does
  // too. See `_resolveSalvageResultGroups progressive forces quantity 1` for the why.
  assert.equal(
    actor.createdItems[0].system.quantity,
    1,
    'the authored quantity 2 is inert: a progressive entry awards exactly one item'
  );
});

// ---------------------------------------------------------------------------
// Group 10: Failure consumption policy -- all four combinations
// ---------------------------------------------------------------------------

test('salvage failure: consumeComponent=true, consumeCatalysts=true -- both consumed', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Check failed',
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => {
    tool.used = true;
    return [];
  };
  const component = makeComponent({
    name: 'Test Component',
    toolIds: [tool.id],
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true },
    },
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(
    compItem.deleteCalled,
    true,
    'Component should be consumed (consumeComponentOnFail=true)'
  );
  assert.equal(tool.used, true, 'Tool should be broken (breakToolsOnFail=true)');
});

test('salvage failure: consumeComponent=true, consumeCatalysts=false -- only component consumed', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Check failed',
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => {
    tool.used = true;
    return [];
  };
  const component = makeComponent({
    name: 'Test Component',
    toolIds: [tool.id],
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(
    compItem.deleteCalled,
    true,
    'Component should be consumed (consumeComponentOnFail=true)'
  );
  assert.equal(tool.used, false, 'Tool should NOT be broken (breakToolsOnFail=false)');
});

test('salvage failure: consumeComponent=false, consumeCatalysts=true -- only tools broken', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Check failed',
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => {
    tool.used = true;
    return [];
  };
  const component = makeComponent({
    name: 'Test Component',
    toolIds: [tool.id],
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: false, breakToolsOnFail: true },
    },
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(
    compItem.deleteCalled,
    false,
    'Component should NOT be consumed (consumeComponentOnFail=false)'
  );
  assert.equal(tool.used, true, 'Tool should be broken (breakToolsOnFail=true)');
});

test('salvage failure: consumeComponent=false, consumeCatalysts=false -- nothing consumed', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Check failed',
    outcome: null,
    value: null,
    data: {},
  });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => {
    tool.used = true;
    return [];
  };
  const component = makeComponent({
    name: 'Test Component',
    toolIds: [tool.id],
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: false, breakToolsOnFail: false },
    },
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(
    compItem.deleteCalled,
    false,
    'Component should NOT be consumed (consumeComponentOnFail=false)'
  );
  assert.equal(tool.used, false, 'Tool should NOT be broken (breakToolsOnFail=false)');
});

// ---------------------------------------------------------------------------
// Group 11: Integration test -- end-to-end salvage flow with real ResolutionModeService
// ---------------------------------------------------------------------------

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

test('end-to-end salvage: resolve actor, validate, check, consume, create, record run', async () => {
  // Wire up real ResolutionModeService (not mocked) so validateSalvage runs the actual logic.
  // The system manager is provided via game.fabricate.getCraftingSystemManager.
  // We stub only _runSalvageCraftingCheck since it needs MacroExecutor.

  const scrapComp = { id: 'scrap-metal', name: 'Scrap Metal', registeredItemUuid: null };
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const tool = makeFakeTool('acid-vial');

  // Component item: qty=2, ingredientQuantity=2 → fully consumed (delete called)
  const compItem = makeItem('comp-item', 'Iron Ore', 2);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const resultGroup = {
    id: 'rg-1',
    name: 'Scraps',
    results: [{ id: 'r-1', componentId: 'scrap-metal', quantity: 3 }],
  };
  const component = {
    id: 'comp-1',
    name: 'Iron Ore',
    salvage: {
      enabled: true,
      ingredientQuantity: 2,
      toolIds: [tool.id],
      resultGroups: [resultGroup],
    },
  };
  const system = makeSystem({
    id: 'sys-integration',
    salvageEnabled: true,
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      enabled: false,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true },
    },
    components: [component, scrapComp],
    tools: [tool],
  });

  // Build engine with real ResolutionModeService wired to a system manager that returns our system
  const realResolutionService = new ResolutionModeService({
    getSystem: () => system,
  });
  const engine = makeEngine({ resolutionModeService: realResolutionService });

  // Stub only the macro executor step
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });
  tool.used = false;
  engine._applyToolBreakage = async () => {
    tool.used = true;
    return [];
  };

  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  // 1. Overall success
  assert.equal(result.success, true, `Expected success but got: ${result.message}`);

  // 2. Component fully consumed (qty 2 == ingredientQuantity 2)
  assert.equal(compItem.deleteCalled, true, 'Component item should be deleted when fully consumed');

  // 3. Tool used/broken on success path
  assert.equal(tool.used, true, 'Tool should be used/broken after successful salvage');

  // 4. Result items created on actor
  assert.ok(Array.isArray(result.results), 'result.results should be an array');
  assert.ok(result.results.length > 0, 'At least one result item should be created');
  assert.equal(
    actor.createdItems[0].system.quantity,
    3,
    'Result item created with correct quantity'
  );

  // 5. SalvageRun record has correct shape
  assert.ok(result.salvageRun, 'salvageRun should be present on result');
  assert.equal(result.salvageRun.status, 'succeeded');
  assert.equal(result.salvageRun.craftingSystemId, 'sys-integration');
  assert.equal(result.salvageRun.componentId, 'comp-1');
  assert.ok(
    Array.isArray(result.salvageRun.consumedComponents),
    'consumedComponents should be an array'
  );
  assert.ok(
    result.salvageRun.consumedComponents.length > 0,
    'consumedComponents should record the consumed item'
  );
  assert.ok(Array.isArray(result.salvageRun.createdResults), 'createdResults should be an array');
  assert.equal(result.salvageRun.failureReason, null);

  // 6. SalvageRun persisted to actor flags
  const stored = actor.getFlag('fabricate', 'fabricate.salvageRuns');
  assert.ok(stored, 'salvageRuns flag should be set on actor');
  assert.ok(Array.isArray(stored.history), 'history should be an array');
  assert.equal(stored.history[0].componentId, 'comp-1', 'Most recent run should be at index 0');
});

test('salvage run createdResults record the awarding componentId, in award order (issue 659)', async () => {
  // A single result group awards two distinct components. The persisted run's
  // createdResults must carry each awarding componentId (not the pre-fix
  // hardcoded null), and in the order the results were awarded.
  const scrapIron = { id: 'scrap-iron', name: 'Iron Scrap', registeredItemUuid: null };
  const scrapWood = { id: 'scrap-wood', name: 'Wood Scrap', registeredItemUuid: null };

  const compItem = makeItem('comp-item', 'Broken Relic', 1);
  const actor = makeActor('actor-659', [compItem]);

  const resultGroup = {
    id: 'rg-1',
    name: 'Scraps',
    results: [
      { id: 'r-1', componentId: 'scrap-iron', quantity: 2 },
      { id: 'r-2', componentId: 'scrap-wood', quantity: 3 },
    ],
  };
  const component = {
    id: 'comp-1',
    name: 'Broken Relic',
    salvage: { enabled: true, ingredientQuantity: 1, toolIds: [], resultGroups: [resultGroup] },
  };
  const system = makeSystem({
    id: 'sys-659',
    salvageEnabled: true,
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      enabled: false,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true },
    },
    components: [component, scrapIron, scrapWood],
    tools: [],
  });

  const realResolutionService = new ResolutionModeService({ getSystem: () => system });
  const engine = makeEngine({ resolutionModeService: realResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });
  engine._applyToolBreakage = async () => [];

  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true, `Expected success but got: ${result.message}`);
  const createdResults = result.salvageRun.createdResults;
  assert.ok(Array.isArray(createdResults), 'createdResults should be an array');
  assert.equal(createdResults.length, 2, 'both awarded results should be recorded');
  assert.deepEqual(
    createdResults.map((r) => r.componentId),
    ['scrap-iron', 'scrap-wood'],
    'createdResults must carry the awarding componentId in award order — not null'
  );
  // Durable capture (issue 675): each record captures the created item's name/img at
  // award time (mirroring crafting), so the Journal can label a salvage run's output
  // even if the item is later deleted — no display-time resolution required.
  assert.deepEqual(
    createdResults.map((r) => r.name),
    ['Iron Scrap', 'Wood Scrap'],
    'createdResults must capture the awarded item name at award time'
  );
  createdResults.forEach((r) =>
    assert.ok(Object.hasOwn(r, 'img'), 'each createdResults record captures an img field')
  );
});

test('salvage() creates a waitingTime run when salvage has a time requirement', async () => {
  const engine = makeEngine();
  const salvageRunManager = engine.salvageRunManager;
  const compItem = makeItem('comp-item', 'Timed Relic', 1);
  const actor = makeActor('actor-timed', [compItem]);
  const component = {
    id: 'comp-timed',
    name: 'Timed Relic',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        { id: 'rg-1', name: 'Bits', results: [{ id: 'r-1', componentId: 'scrap', quantity: 1 }] },
      ],
      timeRequirement: { minutes: 10 },
    },
  };
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(result.salvageRun?.status, 'waitingTime');
  assert.equal(salvageRunManager.getActiveRuns(actor).length, 1);
  assert.equal(
    actor.createdItems.length,
    0,
    'results should not be created before the time gate completes'
  );
});

test('processPendingSalvageRuns() auto-completes timed salvage runs after world-time advancement', async () => {
  const salvageRunManager = new SalvageRunManager();
  const engine = makeEngine({ salvageRunManager });
  const compItem = makeItem('comp-item', 'Dormant Core', 1);
  const actor = makeActor('actor-resume', [compItem]);
  const component = {
    id: 'comp-resume',
    name: 'Dormant Core',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        { id: 'rg-1', name: 'Shards', results: [{ id: 'r-1', componentId: 'shard', quantity: 2 }] },
      ],
      timeRequirement: { minutes: 5 },
    },
  };
  const resultComponent = { id: 'shard', name: 'Shard', difficulty: 1 };
  const system = makeSystem({ id: 'sys-resume', components: [component, resultComponent] });

  globalThis.fromUuid = async (uuid) => {
    if (uuid === actor.uuid) return actor;
    return null;
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
      getSalvageRunManager: () => salvageRunManager,
    },
    user: { id: 'user-1' },
    time: { worldTime: 100 },
    actors: [actor],
  };

  const started = await engine.salvage(actor.uuid, system.id, component.id);
  assert.equal(started.salvageRun?.status, 'waitingTime');

  globalThis.game.time.worldTime = started.salvageRun.timeGate.availableAt;
  await engine.processPendingSalvageRuns(globalThis.game.time.worldTime);

  assert.equal(
    salvageRunManager.getActiveRuns(actor).length,
    0,
    'timed run should be removed from active runs after completion'
  );
  const history = salvageRunManager.getRunHistory(actor);
  assert.equal(history[0]?.status, 'succeeded');
  assert.equal(
    actor.createdItems.length,
    1,
    'timed completion should create results automatically'
  );
});

// ---------------------------------------------------------------------------
// Group 7 (issue 859): the additive `salvage()` return flags, and `suppressChat`,
// each driven THROUGH `salvage()` rather than through the poster.
//
// `tests/salvage-chat-output.test.js` invokes `_postSalvageChatMessage` DIRECTLY, so a
// poster-level test cannot see a missed thread — and the flag has TWO call sites (the
// rolled-failure path and the success path). Forgetting one means a 10-item bulk run
// with 4 failures posts the aggregate card PLUS 4 stray per-item cards, green.
//
// The assertions are therefore on the CAPTURED CONTENT, never on a `ChatMessage.create`
// call count: the per-roll `Roll#toMessage` dice posts are deliberately KEPT (they are
// the Dice So Nice trigger), so an interactive run legitimately creates messages even
// with the salvage card suppressed. A count assertion would fail against correct
// behaviour.
// ---------------------------------------------------------------------------

/** The markup root only the SALVAGE CARD carries — never a dice post. */
const SALVAGE_CARD_MARKUP = 'fabricate-craft-chat';

/**
 * Stub `Roll` so an interactive check both evaluates to `total` AND posts its dice
 * through `ChatMessage.create`, exactly as `Roll#toMessage` does in a live world.
 */
function stubInteractiveRoll(total) {
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      return {
        total,
        dice: [{ number: 1, faces: 20, total, results: [{ result: total, active: true }] }],
        toMessage: async (data) =>
          globalThis.ChatMessage.create({
            ...data,
            content: `<div class="dice-roll">${total}</div>`,
          }),
      };
    }
  };
}

/** Capture every `ChatMessage.create` payload for the duration of one test. */
function captureSalvageChat(t) {
  const previous = globalThis.ChatMessage;
  const created = [];
  globalThis.ChatMessage = {
    create: async (payload) => {
      created.push(payload);
      return { id: `msg-${created.length}` };
    },
    getSpeaker: () => ({ alias: 'Salvager' }),
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previous;
  });
  return created;
}

/**
 * A wired interactive salvage whose SIMPLE check rolls `total` against DC 15, with chat
 * output enabled. `total` decides which of the poster's two call sites runs.
 */
function makeSuppressibleSetup(total) {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  const compItem = makeItem('comp-item', 'Test Component', 3);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({
    components: [component],
    salvageCraftingCheck: {
      enabled: true,
      simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
  });
  system.features.chatOutput = true;
  setupGame(system, actor);
  globalThis.game.i18n = { localize: (key) => key, format: (key) => key };
  stubInteractiveRoll(total);
  return { engine, actor, component, system, compItem };
}

/** The payloads whose content is the SALVAGE CARD, never the dice posts beside it. */
const salvageCards = (created) =>
  created.filter((payload) => String(payload?.content ?? '').includes(SALVAGE_CARD_MARKUP));

/** Whether any captured payload is a dice post. */
const postedDice = (created) =>
  created.some((payload) => String(payload?.content ?? '').includes('dice-roll'));

test('salvage(): the FAILURE path posts its own card when chat is not suppressed', async (t) => {
  const created = captureSalvageChat(t);
  const { engine, actor, component, system } = makeSuppressibleSetup(4);

  const result = await engine.salvage(actor.uuid, system.id, component.id, { interactive: true });

  assert.equal(result.success, false, '4 < 15');
  assert.equal(salvageCards(created).length, 1, 'the control: one per-item card');
});

test('salvage(): suppressChat kills the FAILURE card and nothing else', async (t) => {
  const created = captureSalvageChat(t);
  const { engine, actor, component, system } = makeSuppressibleSetup(4);

  const result = await engine.salvage(actor.uuid, system.id, component.id, {
    interactive: true,
    suppressChat: true,
  });

  assert.equal(result.success, false);
  assert.deepEqual(salvageCards(created), [], 'no message carrying the salvage card markup');
  assert.equal(
    postedDice(created),
    true,
    'the roll STILL posts its dice — that is the Dice So Nice trigger, not the card'
  );
});

test('salvage(): the SUCCESS path posts its own card when chat is not suppressed', async (t) => {
  const created = captureSalvageChat(t);
  const { engine, actor, component, system } = makeSuppressibleSetup(16);

  const result = await engine.salvage(actor.uuid, system.id, component.id, { interactive: true });

  assert.equal(result.success, true, '16 >= 15');
  assert.equal(salvageCards(created).length, 1, 'the control: one per-item card');
});

test('salvage(): suppressChat kills the SUCCESS card too — the SECOND call site', async (t) => {
  // Asserted separately from the failure path on purpose: the flag has two call sites,
  // and threading only one is the exact defect that ships green.
  const created = captureSalvageChat(t);
  const { engine, actor, component, system } = makeSuppressibleSetup(16);

  const result = await engine.salvage(actor.uuid, system.id, component.id, {
    interactive: true,
    suppressChat: true,
  });

  assert.equal(result.success, true);
  assert.deepEqual(salvageCards(created), []);
  assert.equal(postedDice(created), true, 'and the dice post survives here as well');
});

test('salvage(): an omitted suppressChat behaves exactly as `false`', async (t) => {
  const created = captureSalvageChat(t);
  const { engine, actor, component, system } = makeSuppressibleSetup(16);

  await engine.salvage(actor.uuid, system.id, component.id, {
    interactive: true,
    suppressChat: undefined,
  });

  assert.equal(salvageCards(created).length, 1, 'only an explicit true suppresses');
});

test('salvage(): a misconfigured CHECK returns misconfigured: true', async () => {
  // Branch one of two. A routed salvage with no authored formula: the check itself
  // reports the misconfiguration and `salvage()` propagates the discriminator.
  const { engine, actor, component, system } = makeMisconfiguredSetup(new SalvageRunManager());

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.equal(result.misconfigured, true, 'not a rolled failure — a GM-side config gap');
  assert.equal(result.results, null);
});

test('an UNSUPPORTED salvage mode is refused on all three MUTATING engine paths', async () => {
  // `resolveSalvageCheck` coerces an unsupported token to `simple` for display and pairs
  // it with `unsupportedMode: true`, so every reader that would MUTATE has to test the
  // flag before reading the mode. That contract is pinned in the pure resolver's own
  // suite; these three are the real, mutating call sites, where getting it wrong awards
  // `resultGroups[0]` and breaks tools for a configuration `validateSalvage` already
  // rejects. Defence in depth — `validateSalvage` refuses the same system first — so this
  // is one cheap assertion per path rather than a suite.
  const engine = makeEngine();
  const component = makeComponent({ name: 'Test Component' });
  const system = makeSystem({
    salvageResolutionMode: 'tiered', // a LEGACY token the normalizer should have rewritten
    components: [component],
    salvageCraftingCheck: {
      enabled: true,
      // Authored under `simple`, which is exactly what the coercion would read: each
      // assertion below therefore has something real to return if the guard is removed.
      simple: { rollFormula: '', checkBreakage: { triggers: [{ id: 't1', breakTools: true }] } },
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
  });
  const actor = makeActor('actor-1', []);
  setupGame(system, actor);

  const checkResult = await engine._runSalvageCraftingCheck(component, system, actor);

  assert.equal(checkResult.misconfigured, true, 'the check reports a GM-side config defect');
  assert.equal(checkResult.success, false);
  assert.match(checkResult.message, /Unsupported salvage resolution mode: tiered/);
  assert.deepEqual(
    engine._resolveSalvageResultGroups(component, system, checkResult),
    [],
    "and nothing is awarded — never the coerced `simple` mode's first group"
  );
  assert.equal(
    engine._resolveSalvageCheckBreakage(system),
    null,
    "nor are a foreign mode's breakage triggers read"
  );
});

test('salvage(): a validateSalvage ABORT returns misconfigured: true as well', async () => {
  // Branch two of two, and the one that actually fires in a wired world: this gate runs
  // BEFORE the check, so a GM-side config error never reaches the check's own
  // misconfigured return. Without the flag here the player is told "Nothing recovered"
  // for a configuration only their GM can fix — and the whole `misconfigured` row of the
  // bulk outcome table would be dead in production.
  const engine = makeEngine({
    resolutionModeService: {
      validateSalvage: () => ({ valid: false, errors: ['two success groups in simple mode'] }),
      resolveResultGroups: () => ({ groups: [], meta: {} }),
    },
  });
  const compItem = makeItem('comp-item', 'Test Component', 3);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component' });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.equal(result.misconfigured, true);
  assert.match(result.message, /Invalid salvage configuration/);
  assert.equal(compItem.deleteCalled, false, 'and it aborts with ZERO mutation');
  assert.equal(compItem.updateCalled, false);
});

test('salvage(): a rolled failure carries NO misconfigured flag', async (t) => {
  // The negative control. Without it, an implementation that flagged every failure would
  // pass both tests above while telling every unlucky player to talk to their GM.
  captureSalvageChat(t);
  const { engine, actor, component, system } = makeSuppressibleSetup(4);

  const result = await engine.salvage(actor.uuid, system.id, component.id, { interactive: true });

  assert.equal(result.success, false);
  assert.equal(result.misconfigured, undefined);
  assert.equal(result.waiting, undefined);
});

test('salvage(): a time-gated run returns waiting: true ALONGSIDE success: true', async () => {
  // The flag exists so a caller need not re-derive "started, come back later" from
  // `results == null` — which is also what a no-result success looks like. `success` is
  // deliberately unchanged, so no existing consumer regresses.
  const salvageRunManager = new SalvageRunManager();
  const engine = makeEngine({
    resolutionModeService: {
      validateSalvage: () => ({ valid: true, errors: [] }),
      resolveResultGroups: () => ({ groups: [], meta: {} }),
    },
    salvageRunManager,
  });
  const compItem = makeItem('comp-item', 'Test Component', 3);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component' });
  component.salvage.timeRequirement = { minutes: 5 };
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);
  globalThis.game.fabricate.getSalvageRunManager = () => salvageRunManager;

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.waiting, true);
  assert.equal(result.success, true, 'the run STARTED — success is unchanged');
  assert.equal(result.results, null, 'and it has awarded nothing yet');
  assert.equal(result.salvageRun?.status, 'waitingTime');
  assert.equal(compItem.deleteCalled, false, 'nothing is consumed by merely starting');
});

test('salvage(): a genuine no-result success carries NO waiting flag', async () => {
  // The counter-case that makes the flag worth having: this return also has empty
  // results, so `results == null` cannot tell the two apart and the flag can.
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: null,
    data: {},
  });
  const compItem = makeItem('comp-item', 'Test Component', 3);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({
    name: 'Test Component',
    resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
  });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(result.waiting, undefined);
  assert.deepEqual(result.results, [], 'it resolved; it just had nothing to award');
});

// ---------------------------------------------------------------------------
// Group 8 (issue 1098): the FAILURE AWARD — a capability salvage never had.
//
// Until this issue `salvage()` returned inside `if (!checkResult.success)` BEFORE
// `_resolveSalvageResultGroups`, so a failed salvage awarded nothing whatever a component
// authored. Two canonical statements and one in-code comment said that was deliberate;
// all three are retracted, and this group is what makes the retraction checkable.
//
// EVERY TEST HERE DRIVES `salvage()`, never `_resolveSalvageResultGroups` alone. The
// resolver could select the right group and the branch still report an empty award on
// three separate seams — the run record, the chat card and the return value — and a
// resolver-level test cannot see any of them.
// ---------------------------------------------------------------------------

/** A component whose CLAMPED groups are [success, failure] — CF1's trap, exactly. */
function makeFailureAwardComponent() {
  return makeComponent({
    name: 'Test Component',
    resultGroups: [
      {
        id: 'rg-success',
        name: 'Scraps',
        results: [{ id: 'r-success', componentId: 'success-comp', quantity: 1 }],
      },
      {
        id: 'rg-failure',
        role: 'failure',
        name: 'Ruined scraps',
        results: [{ id: 'r-failure', componentId: 'failure-comp', quantity: 1 }],
      },
    ],
  });
}

function makeFailureAwardSetup(failureResultPolicy) {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({
    success: false,
    message: 'Roll failed',
    outcome: 'fail',
    value: 4,
    data: {},
  });
  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeFailureAwardComponent();
  const system = makeSystem({
    // The two AWARDED components have to be in the library: `_createSingleResult` resolves
    // a result's `componentId` against `system.components` and returns null when it cannot,
    // so a fixture that omitted them would report "nothing was awarded" for the wrong reason.
    components: [
      component,
      { id: 'success-comp', name: 'Scraps' },
      { id: 'failure-comp', name: 'Ruined scraps' },
    ],
    salvageCraftingCheck: {
      enabled: true,
      failureResultPolicy,
      progressive: null,
      // Nothing is consumed and no tool breaks, so the ONLY thing this group can be
      // observing is the award itself.
      consumption: { consumeComponentOnFail: false, breakToolsOnFail: false },
    },
  });
  system.features.chatOutput = true;
  const salvageRunManager = setupGame(system, actor);
  return { engine, actor, component, system, salvageRunManager };
}

test('salvage(): a failed check under always awards the reserved failure group, never the success one', async (t) => {
  captureSalvageChat(t);
  const { engine, actor, component, system } = makeFailureAwardSetup('always');

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false, 'it is still a FAILED salvage');
  // CF1's trap, asserted directly. `resultGroups[0]` is the SUCCESS group by the
  // `_normalizeSalvage` retain-one clamp, so an index-based selection — which is exactly
  // what `slice(0, 1)` would have produced — awards the full success salvage output on a
  // failed check. The NAMES distinguish the two: a length-only assertion cannot.
  assert.equal(actor.createdItems.length, 1, 'exactly one item was awarded');
  assert.equal(
    actor.createdItems[0].name,
    'Ruined scraps',
    'the FAILURE group was awarded, selected by role rather than by index'
  );
});

test('salvage(): the failure award is reported on the return value, the run record AND the chat card', async (t) => {
  const created = captureSalvageChat(t);
  const { engine, actor, component, system } = makeFailureAwardSetup('always');

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  // 1. THE RETURN VALUE — what the bulk-salvage surfaces read. A null here would report
  //    "produced nothing" to every caller while items sat on the actor.
  assert.ok(Array.isArray(result.results), 'results is an array, not null');
  assert.equal(result.results.length, 1);

  // 2. THE RUN RECORD — it persists into the actor's Fabricate run-container flag, so an
  //    empty `createdResults` beside real items is a DURABLE contradiction, not a gap.
  const failed = result.salvageRun;
  assert.equal(failed.status, 'failed', 'the run completed as failed');
  assert.equal(failed.createdResults.length, 1, 'the award is in the run record');
  assert.equal(
    failed.createdResults[0].componentId,
    'failure-comp',
    'in the SUCCESS branch shape — carrying the component id, not just a uuid'
  );

  // 3. THE RENDERED CHAT CARD, read as HTML rather than as the arguments passed to the
  //    poster. `buildResultCard`'s failure branch built its sections from `model.consumed`
  //    and `model.tools` ONLY and never read `model.results`, so a threaded award rendered
  //    as nothing — an argument-level assertion passes on a card that shows nothing.
  const card = created.find((payload) => String(payload.content).includes(SALVAGE_CARD_MARKUP));
  assert.ok(card, 'the salvage card was posted');
  assert.match(String(card.content), /Ruined scraps/, 'the failure card renders the awarded item');
});

test('salvage(): a failed check under never awards nothing and posts the card it always posted', async (t) => {
  const created = captureSalvageChat(t);
  const { engine, actor, component, system } = makeFailureAwardSetup('never');

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.results, null, 'the return value is byte-for-byte the pre-1098 one');
  assert.equal(actor.createdItems.length, 0, 'nothing was created on the actor');
  assert.equal(result.salvageRun.status, 'failed');
  assert.deepEqual(result.salvageRun.createdResults, []);
  const card = created.find((payload) => String(payload.content).includes(SALVAGE_CARD_MARKUP));
  assert.ok(!String(card.content).includes('Ruined scraps'), 'and the card shows no award');
});

test('salvage(): always on a component authoring NO failure group produces nothing', async (t) => {
  captureSalvageChat(t);
  const { engine, actor, component, system } = makeFailureAwardSetup('always');
  // The policy SELECTS an authored failure output; it never fabricates one.
  component.salvage.resultGroups = component.salvage.resultGroups.filter(
    (group) => group.role !== 'failure'
  );

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.results, null);
  assert.equal(actor.createdItems.length, 0, 'and emphatically not the success group');
});

test('_resolveSalvageResultGroups: the disposition argument selects by ROLE on failure and by INDEX on success', () => {
  const engine = makeEngine();
  const component = makeFailureAwardComponent();
  const system = makeSystem({ salvageResolutionMode: 'simple' });

  // The DEFAULT is byte-for-byte the pre-1098 behaviour, for every existing caller.
  assert.deepEqual(
    engine._resolveSalvageResultGroups(component, system, null).map((group) => group.id),
    ['rg-success']
  );
  assert.deepEqual(
    engine
      ._resolveSalvageResultGroups(component, system, null, null, 'failure')
      .map((group) => group.id),
    ['rg-failure']
  );

  // No reserved group authored → nothing, rather than the success group at index 0.
  const successOnly = makeComponent({
    resultGroups: [{ id: 'rg-success', name: 'Scraps', results: [] }],
  });
  assert.deepEqual(
    engine._resolveSalvageResultGroups(successOnly, system, null, null, 'failure'),
    []
  );

  // Progressive has one success group against a budget and no tier to mark, so a failure
  // selects nothing whatever the policy says.
  const progressiveSystem = makeSystem({ salvageResolutionMode: 'progressive' });
  assert.deepEqual(
    engine._resolveSalvageResultGroups(component, progressiveSystem, { value: 99 }, null, 'failure'),
    []
  );
});

test('_resolveSalvageResultGroups: routed selects the FAILING tier name through outcomeRouting', () => {
  const engine = makeEngine();
  const component = makeComponent({
    resultGroups: [
      { id: 'rg-good', name: 'Good', results: [] },
      { id: 'rg-ruined', name: 'Ruined', results: [] },
    ],
  });
  component.salvage.outcomeRouting = { Masterwork: 'rg-good', Ruined: 'rg-ruined' };
  const system = makeSystem({ salvageResolutionMode: 'routed' });

  assert.deepEqual(
    engine
      ._resolveSalvageResultGroups(component, system, { outcome: 'Ruined' }, null, 'failure')
      .map((group) => group.id),
    ['rg-ruined']
  );
});

// ---------------------------------------------------------------------------
// Group 12: Progressive component complications (issue 1286)
//
// The firing site sits between `_awardSalvageResultGroups` and
// `_postSalvageChatMessage`: after the award is committed, before the card. These
// assert WHAT fires and — at least as importantly — the four places that must fire
// NOTHING (the failure branch, the two non-progressive modes, and a second occurrence
// of an already-fired complication).
// ---------------------------------------------------------------------------

/**
 * One authored complication. `visibility` defaults to `gmOnly`, so every firing
 * produces a GM request and the delivery spy counts firings end to end. Neither roll
 * is enabled: a condition roll and an effect roll are the RUNTIME's concern and are
 * covered by that module's own suite; enabling either here would only stub Foundry's
 * `Roll` back into a test about the engine's call sites.
 */
function complication({
  id = 'cx',
  name = 'Shrapnel',
  when = { stageAwarded: true },
  match = 'any',
  visibility = 'gmOnly',
  activities = { salvage: true },
} = {}) {
  return {
    id,
    name,
    description: `${name} description`,
    severity: 'minor',
    visibility,
    activities,
    match,
    when,
    rollCondition: { enabled: false },
    effectRoll: { enabled: false },
  };
}

/** A delivery writer that records every `deliver` call rather than emitting. */
function recordingWriter() {
  const calls = [];
  return {
    calls,
    deliver(args) {
      calls.push(args);
      return true;
    },
  };
}

/**
 * A progressive salvage world: two output components (cost 2 and cost 5) and a
 * component that breaks down into them. `value` decides which stages are awarded.
 */
function progressiveSalvageWorld({
  results = [
    { id: 'r-1', componentId: 'item-a', quantity: 2 },
    { id: 'r-2', componentId: 'item-b', quantity: 1 },
  ],
  complicationsA = [complication()],
  complicationsB = [],
  value = 3,
  checkSuccess = true,
  awardMode = 'equal',
  salvageRunManager = null,
  allowPlayerResultReorder,
} = {}) {
  const itemAComp = {
    id: 'item-a',
    name: 'Item A',
    registeredItemUuid: null,
    difficulty: 2,
    complications: complicationsA,
  };
  const itemBComp = {
    id: 'item-b',
    name: 'Item B',
    registeredItemUuid: null,
    difficulty: 5,
    complications: complicationsB,
  };
  const engine = makeEngine({
    resolutionModeService: {
      validateSalvage: () => ({ valid: true, errors: [] }),
      resolveResultGroups: () => ({ groups: [], meta: {} }),
    },
    salvageRunManager,
  });
  engine._runSalvageCraftingCheck = async () => ({
    success: checkSuccess,
    outcome: null,
    value,
    data: { total: value },
    engineEvaluated: true,
    message: checkSuccess ? undefined : 'Check failed',
  });
  const writer = recordingWriter();
  engine.installComplicationDelivery({ writer });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const salvage = {
    enabled: true,
    ingredientQuantity: 1,
    resultGroups: [{ id: 'rg-1', name: 'Loot', results }],
  };
  if (allowPlayerResultReorder !== undefined) {
    salvage.allowPlayerResultReorder = allowPlayerResultReorder;
  }
  const component = { id: 'comp-1', name: 'Test Component', salvage };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [component, itemAComp, itemBComp],
  });
  setupGame(system, actor);
  return { engine, writer, actor, component, system };
}

test('salvage(): a progressive award fires its awarded stage and delivers the GM request once', async () => {
  const { engine, writer, actor, component, system } = progressiveSalvageWorld();

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true, 'the salvage still succeeds');
  assert.equal(writer.calls.length, 1, 'exactly one delivery for one resolution');
  const [delivered] = writer.calls;
  assert.equal(delivered.craftingSystemId, 'sys-1');
  assert.equal(delivered.actorUuid, actor.uuid);
  assert.equal(delivered.complications.length, 1);
  assert.deepEqual(
    {
      componentId: delivered.complications[0].componentId,
      complicationId: delivered.complications[0].complicationId,
      resultId: delivered.complications[0].resultId,
      activity: delivered.complications[0].activity,
      bucket: delivered.complications[0].bucket,
    },
    {
      componentId: 'item-a',
      complicationId: 'cx',
      // The STAGE OCCURRENCE, not just the component: a card that could not name the row
      // cannot be reconciled against a component listed more than once.
      resultId: 'r-1',
      activity: 'salvage',
      bucket: 'full',
    }
  );
  // The engine never mints: the writer does, once per `deliver` call.
  assert.equal('resolutionId' in delivered, false, 'the engine does not mint a resolution id');
});

test('salvage(): a MISSED stage fires, and reads the halt the award loop reported', async () => {
  // Budget 3 awards `item-a` (cost 2) and halts on `item-b` (cost 5). A `stageMissed`
  // complication on the halted component is the headline case for this feature.
  const { engine, writer, actor, component, system } = progressiveSalvageWorld({
    complicationsA: [],
    complicationsB: [complication({ id: 'cy', name: 'Shattered', when: { stageMissed: true } })],
  });

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(writer.calls.length, 1);
  assert.deepEqual(
    writer.calls[0].complications.map((entry) => [entry.componentId, entry.bucket]),
    [['item-b', 'halted']]
  );
});

test('salvage(): NEGATIVE CONTROL — the FAILURE branch fires nothing at all', async () => {
  // `_resolveSalvageResultGroups` returns [] for a failed progressive check, so there are
  // no stages, no award and no candidates. That is a stated requirement, not an accident:
  // a failed salvage must not fire the complications a successful one would have.
  const { engine, writer, actor, component, system } = progressiveSalvageWorld({
    checkSuccess: false,
    complicationsA: [complication()],
    complicationsB: [complication({ id: 'cy', when: { stageMissed: true } })],
  });

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false, 'the check failed');
  assert.equal(writer.calls.length, 0, 'a failed salvage delivers nothing');
  // NOT a vacuous pass. The same component and the same rolled value DO produce plan
  // inputs — two stages and two candidate complications — so the only thing keeping this
  // at zero is that the firing site sits after the award, on the success path, and the
  // failure branch returns before ever reaching it.
  const wouldHaveFired = engine._progressiveSalvagePlanInputs(
    component,
    system,
    { value: 3 },
    null
  );
  assert.equal(wouldHaveFired.stages.length, 2);
  assert.deepEqual(
    engine._resolveSalvageResultGroups(component, system, { value: 3 }, null, 'failure'),
    []
  );
});

test('salvage(): NEGATIVE CONTROL — simple mode fires nothing, and still selects by index', async () => {
  const outputComp = {
    id: 'result-comp',
    name: 'Scrap',
    difficulty: 1,
    complications: [complication()],
  };
  const engine = makeEngine({
    resolutionModeService: {
      validateSalvage: () => ({ valid: true, errors: [] }),
      resolveResultGroups: () => ({ groups: [], meta: {} }),
    },
  });
  const writer = recordingWriter();
  engine.installComplicationDelivery({ writer });
  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent();
  const system = makeSystem({ components: [component, outputComp] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(writer.calls.length, 0, 'complications are a progressive-only consequence');
  assert.equal(actor.createdItems.length, 1, 'the simple award is untouched');
});

test('salvage(): a component listed twice fires ONCE, naming the occurrence that matched', async () => {
  // A component may legitimately appear several times, so `full` and `stageMissed` can
  // both be true for it — the honest reading. But a `1d6` shrapnel complication on a
  // component listed twice must not roll twice.
  const { engine, writer, actor, component, system } = progressiveSalvageWorld({
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 },
      { id: 'r-2', componentId: 'item-a', quantity: 1 },
      { id: 'r-3', componentId: 'item-b', quantity: 1 },
    ],
    complicationsA: [complication({ when: { stageAwarded: true, stageMissed: true } })],
    value: 3,
  });

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(writer.calls.length, 1);
  assert.equal(
    writer.calls[0].complications.length,
    1,
    'deduped on (componentId, complicationId), not once per occurrence'
  );
  assert.equal(
    writer.calls[0].complications[0].resultId,
    'r-1',
    'and it names the first occurrence in fire order that satisfied a matched clause'
  );
});

test('salvage(): the RUN RECORD order decides which stage fires, not the authored order', async () => {
  // The order is captured onto the run at start, so a world-time-resumed salvage is
  // independent of whichever client wins the race. Reversing it moves the budget onto a
  // different stage, and the firing must follow the award rather than the authored list.
  const salvageRunManager = new SalvageRunManager();
  const { engine, writer, actor, component, system } = progressiveSalvageWorld({
    complicationsA: [complication({ id: 'ca', when: { stageAwarded: true } })],
    complicationsB: [complication({ id: 'cb', when: { stageAwarded: true } })],
    value: 5,
    salvageRunManager,
  });
  // The starting user's stored order, read ONCE at run start and captured on the record.
  engine.getPlayerResultOrder = () => ['r-2', 'r-1'];

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(writer.calls.length, 1);
  assert.deepEqual(
    writer.calls[0].complications.map((entry) => entry.componentId),
    ['item-b'],
    'the reordered list spends the whole budget on item-b (cost 5), so only it is awarded'
  );
});

test('salvage(): a THROWING delivery writer never costs the salvage its results', async () => {
  const { engine, actor, component, system } = progressiveSalvageWorld();
  engine.installComplicationDelivery({
    writer: {
      deliver() {
        throw new Error('socket exploded');
      },
    },
  });

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true, 'the award is committed and stays committed');
  assert.equal(actor.createdItems.length, 1, 'the awarded item is still on the actor');
});

test('_resolveProgressiveSalvageAward: reports the ORDERED list and the award verbatim', () => {
  // The split exists so two callers can take two halves of one computation: the award
  // path needs the awarded results, the classifier needs the whole ordered list plus the
  // loop's own report of why it stopped.
  const engine = makeEngine();
  const component = makeComponent({
    resultGroups: [
      {
        id: 'rg-1',
        name: 'Loot',
        results: [
          { id: 'r-1', componentId: 'item-a', quantity: 2 },
          { id: 'r-2', componentId: 'item-b', quantity: 1 },
        ],
      },
    ],
  });
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    components: [
      { id: 'item-a', name: 'A', difficulty: 2 },
      { id: 'item-b', name: 'B', difficulty: 5 },
    ],
  });

  const resolved = engine._resolveProgressiveSalvageAward(component, system, { value: 3 }, null);

  assert.deepEqual(
    resolved.results.map((r) => r.id),
    ['r-1', 'r-2'],
    'the WHOLE ordered list, not just the awarded prefix'
  );
  assert.deepEqual(
    resolved.award.awarded.map((r) => r.id),
    ['r-1']
  );
  assert.equal(resolved.award.haltedResult?.id, 'r-2', 'the loop reports why it stopped');
  assert.equal(resolved.award.partialResult, null);
  assert.deepEqual(resolved.award.skippedResults, []);
  // The `quantity: 1` force belongs to the AWARD path and must not leak in here.
  assert.equal(resolved.award.awarded[0].quantity, 2, 'the authored result is handed back as-is');
});

test('salvage(): deferComplicationDelivery FIRES but does not emit, returning the requests to batch', async () => {
  // The bulk-salvage sibling of `suppressChat`, and required for the same reason: the
  // GM-side rate limiter is sized on the stated assumption that a bulk salvage of any
  // size emits ONE message, so a per-row emit would silently drop a long run's tail.
  const { engine, writer, actor, component, system } = progressiveSalvageWorld();

  const result = await engine.salvage(actor.uuid, system.id, component.id, {
    deferComplicationDelivery: true,
  });

  assert.equal(result.success, true);
  assert.equal(writer.calls.length, 0, 'nothing was emitted from the row');
  assert.deepEqual(
    result.complicationRequests.map((entry) => [entry.componentId, entry.complicationId]),
    [['item-a', 'cx']],
    'and the requests came back for the caller to batch'
  );
});

test('salvage(): an undeferred salvage carries NO complicationRequests key at all', async () => {
  // The key is present only when a caller asked to batch: adding it unconditionally would
  // change the return shape of every salvage in the module for one caller's benefit.
  const { engine, actor, component, system } = progressiveSalvageWorld();

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal('complicationRequests' in result, false);
});
