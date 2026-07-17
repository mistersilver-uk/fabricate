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
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
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
    setProperty
  }
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
      return { id: this.id, name: this.name, type: 'loot', system: { quantity: this.system.quantity } };
    },
    async delete() { this.deleteCalled = true; },
    async update(payload) {
      this.updateCalled = true;
      this.updatePayloads.push({ ...payload });
      if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    }
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
      [Symbol.iterator]() { return items[Symbol.iterator](); }
    },
    getFlag(ns, key) { return flags[ns]?.[key] ?? null; },
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
    }
  };
}

function makeSystem({
  id = 'sys-1',
  salvageEnabled = true,
  salvageResolutionMode = 'simple',
  salvageCraftingCheck = null,
  components = [],
  tools = []
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
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    },
    components,
    tools,
    craftingCheck: {}
  };
}

function makeComponent({
  id = 'comp-1',
  name = 'Test Component',
  registeredItemUuid = null,
  salvageEnabled = true,
  ingredientQuantity = 1,
  toolIds = [],
  resultGroups = null
} = {}) {
  return {
    id,
    name,
    registeredItemUuid,
    salvage: salvageEnabled ? {
      enabled: true,
      ingredientQuantity,
      toolIds,
      resultGroups: resultGroups ?? [
        { id: 'rg-1', name: 'Scraps', results: [{ id: 'r-1', componentId: 'result-comp', quantity: 1 }] }
      ]
    } : null
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
    onBreak: { mode: 'flagBroken' }
  };
}

/**
 * Build a CraftingEngine with minimal stubs.
 * The mock RecipeManager matches tools to items by componentId = item.id.
 */
function makeEngine(opts = {}) {
  const mockRecipeManager = {
    canCraft() { return { canCraft: true, satisfiableSet: null, missing: { ingredients: [], essences: [], tools: [] } }; },
    getToolsForSet() { return []; },
    toolMatchesItem(_recipe, tool, item) {
      return item.id === (tool.componentId || tool.systemItemId);
    },
    ingredientMatchesItem() { return false; }
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
      getSalvageRunManager: () => salvageRunManager
    },
    user: { id: 'user-1' },
    time: { worldTime: 100 }
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
    time: { worldTime: 0 }
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
    validateSalvage: () => ({ valid: false, errors: ['Needs exactly 1 result group in simple mode'] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
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

test('salvage() passes checks when actor has enough items and tools present', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 2);
  const toolItem = makeItem('acid-vial-comp', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial-comp');
  const component = makeComponent({ name: 'Test Component', toolIds: [tool.id], resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  // Should not fail due to ownership/tool checks
  assert.ok(result.success || /check|macro/i.test(result.message || ''), `Unexpected failure: ${result.message}`);
});

// ---------------------------------------------------------------------------
// Group 4: Salvage check failure + consumption policy
// ---------------------------------------------------------------------------

test('salvage() returns failure when salvage check fails', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: false, message: 'Roll failed', outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, false);
  assert.match(result.message, /roll failed/i);
});

test('salvage() consumes component on failure when consumeComponentOnFail is true', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: false, message: 'Failed', outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({
    components: [component],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    }
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(compItem.deleteCalled, true, 'Component should be deleted on failure when consumeComponentOnFail=true');
});

test('salvage() does not consume component on failure when consumeComponentOnFail is false', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: false, message: 'Failed', outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({
    components: [component],
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeComponentOnFail: false, breakToolsOnFail: false }
    }
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(compItem.deleteCalled, false, 'Component should NOT be deleted when consumeComponentOnFail=false');
});

test('salvage(): a cancelled interactive check aborts with zero mutation and no orphaned run', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
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
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true }
    }
  });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id, { interactive: true });

  assert.equal(result.success, false, 'cancelled salvage is not a success');
  assert.equal(result.cancelled, true, 'cancelled flag surfaced');
  assert.equal(result.results, null, 'no results created');
  assert.equal(compItem.deleteCalled, false, 'component NOT consumed on cancel');
  assert.equal(salvageRunManager.getActiveRuns(actor).length, 0, 'phantom in-progress run discarded');
  assert.equal(salvageRunManager.getRunHistory(actor).length, 0, 'no history entry — zero run mutation');
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

// ---------------------------------------------------------------------------
// Group 5: Success path
// ---------------------------------------------------------------------------

test('salvage() consumes component item on success', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [{ id: 'rg-1', name: 'Scraps', results: [] }], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', ingredientQuantity: 1, resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(compItem.deleteCalled, true, 'Component should be deleted on success (qty == ingredientQuantity)');
});

// Issue 675: the player summary reports "with a roll of N", so the engine must thread
// the rolled total onto the TOP-LEVEL result — not only onto `salvageRun`, which is
// null on the runless path. A rolled check surfaces the number; a no-check salvage
// surfaces null so the UI omits the roll phrase entirely.
test('salvage() threads the rolled total onto the top-level result (issue 675)', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [{ id: 'rg-1', name: 'Scraps', results: [] }], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: 23, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', ingredientQuantity: 1, resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(result.value, 23, 'the rolled total is threaded top-level, even without a run manager');
});

test('salvage() reports a null roll value for a no-check salvage (issue 675)', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [{ id: 'rg-1', name: 'Scraps', results: [] }], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', ingredientQuantity: 1, resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(result.value, null, 'no roll happened — value is null so the UI prints no roll phrase');
});

test('salvage() reduces component quantity when partially consumed', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [{ id: 'rg-1', name: 'Scraps', results: [] }], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 5);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', ingredientQuantity: 2, resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(compItem.updateCalled, true, 'Component item quantity should be updated');
  assert.equal(compItem.system.quantity, 3, 'Remaining quantity should be 3 (5 - 2)');
});

test('salvage() creates result items on success', async () => {
  const resultComp = { id: 'result-comp', name: 'Scrap Metal', registeredItemUuid: null };
  const resultGroup = { id: 'rg-1', name: 'Scraps', results: [{ id: 'r-1', componentId: 'result-comp', quantity: 3 }] };

  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [resultGroup], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

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
    resolveResultGroups: () => ({ groups: [{ id: 'rg-1', name: 'Scraps', results: [] }], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ id: 'comp-1', name: 'Test Component', resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
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
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: false, message: 'Roll too low', outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ id: 'comp-1', name: 'Test Component', resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
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
    resolveResultGroups: () => ({ groups: [{ id: 'rg-1', name: 'Scraps', results: [] }], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  // Pre-populate actor flags with 50 existing runs
  const compItem = makeItem('comp-item', 'Test Component', 100);
  const actor = makeActor('actor-1', [compItem]);

  // Populate 50 existing history entries
  const existingHistory = Array.from({ length: 50 }, (_, i) => ({
    id: `old-run-${i}`,
    componentId: 'comp-1',
    status: 'succeeded'
  }));
  await actor.setFlag('fabricate', 'fabricate.salvageRuns', { active: {}, history: existingHistory });

  const component = makeComponent({ id: 'comp-1', name: 'Test Component', resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
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
    id: 'rg-1', name: 'Salvage Pile',
    results: [
      { id: 'r-1', componentId: 'scrap-iron', quantity: 2 },
      { id: 'r-2', componentId: 'scrap-wood', quantity: 3 }
    ]
  };

  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [resultGroup], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

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
    id: 'rg-1', name: 'Group One',
    results: [{ id: 'r-1', componentId: 'scrap-iron', quantity: 1 }]
  };
  const group2 = {
    id: 'rg-2', name: 'Group Two',
    results: [{ id: 'r-2', componentId: 'scrap-iron', quantity: 5 }]
  };

  // Fake service returns only first group (simulating simple-mode _resolveSalvageResultGroups behaviour)
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [group1], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = makeComponent({ name: 'Test Component', resultGroups: [group1, group2] });
  const system = makeSystem({ components: [component, resultComp] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(actor.createdItems.length, 1, 'Only one item created (from group 1)');
  assert.equal(actor.createdItems[0].system.quantity, 1, 'Quantity should be 1 from group 1, not 5 from group 2');
});

// ---------------------------------------------------------------------------
// Group 8: Routed mode -- outcome routing
// ---------------------------------------------------------------------------

test('salvage() routed mode routes to correct result group based on check outcome', async () => {
  const passComp = { id: 'gold-nugget', name: 'Gold Nugget', registeredItemUuid: null };
  const failComp = { id: 'coal-dust', name: 'Coal Dust', registeredItemUuid: null };
  const passGroup = { id: 'rg-pass', name: 'Pass Results', results: [{ id: 'r-1', componentId: 'gold-nugget', quantity: 1 }] };
  const failGroup = { id: 'rg-fail', name: 'Fail Results', results: [{ id: 'r-2', componentId: 'coal-dust', quantity: 1 }] };

  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  // Return 'pass' outcome
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: 'pass', value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = {
    id: 'comp-1', name: 'Test Component',
    salvage: {
      enabled: true, ingredientQuantity: 1,
      resultGroups: [passGroup, failGroup],
      outcomeRouting: { pass: 'rg-pass', fail: 'rg-fail' }
    }
  };
  const system = makeSystem({
    salvageResolutionMode: 'routed',
    components: [component, passComp, failComp]
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
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  // Return an outcome not in the routing map
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: 'unknown-outcome', value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = {
    id: 'comp-1', name: 'Test Component',
    salvage: {
      enabled: true, ingredientQuantity: 1,
      resultGroups: [{ id: 'rg-pass', name: 'Pass', results: [{ id: 'r-1', componentId: 'scrap', quantity: 1 }] }],
      outcomeRouting: { pass: 'rg-pass' }
    }
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
    { id: 'rg-critical', name: 'Critical', results: [{ id: 'r-1', componentId: 'gem', quantity: 3 }] },
    { id: 'rg-pass', name: 'Pass', results: [{ id: 'r-2', componentId: 'ore', quantity: 1 }] },
    { id: 'rg-fail', name: 'Fail', results: [] }
  ];
  const component = {
    id: 'comp-1', name: 'Ore',
    salvage: {
      enabled: true, ingredientQuantity: 1,
      resultGroups: groups,
      outcomeRouting: { critical: 'rg-critical', pass: 'rg-pass', fail: 'rg-fail' }
    }
  };
  const system = makeSystem({ salvageResolutionMode: 'routed', components: [component] });

  const criticalResult = engine._resolveSalvageResultGroups(component, system, { outcome: 'critical', value: null });
  assert.equal(criticalResult.length, 1);
  assert.equal(criticalResult[0].id, 'rg-critical');

  const passResult = engine._resolveSalvageResultGroups(component, system, { outcome: 'pass', value: null });
  assert.equal(passResult.length, 1);
  assert.equal(passResult[0].id, 'rg-pass');

  const failResult = engine._resolveSalvageResultGroups(component, system, { outcome: 'fail', value: null });
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
    { id: 'rg-fail', name: 'Fail', results: [] }
  ];
  const component = {
    id: 'comp-1', name: 'Ore',
    salvage: {
      enabled: true, ingredientQuantity: 1,
      resultGroups: groups,
      outcomeRouting: { pass: 'rg-pass', fail: 'rg-fail' }
    }
  };
  const system = makeSystem({ salvageResolutionMode: 'routed', components: [component] });

  const passResult = engine._resolveSalvageResultGroups(component, system, { outcome: 'pass', value: null });
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
    id: 'rg-1', name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 }, // difficulty 2
      { id: 'r-2', componentId: 'item-b', quantity: 1 }, // difficulty 3
      { id: 'r-3', componentId: 'item-c', quantity: 1 }  // difficulty 5
    ]
  };
  const component = {
    id: 'comp-1', name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] }
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    },
    components: [
      component,
      { id: 'item-a', name: 'Item A', difficulty: 2 },
      { id: 'item-b', name: 'Item B', difficulty: 3 },
      { id: 'item-c', name: 'Item C', difficulty: 5 }
    ]
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, { outcome: null, value: 7 });
  assert.equal(awarded.length, 1);
  assert.equal(awarded[0].results.length, 2, 'Should award item-a (cost 2) and item-b (cost 3), total 5 <= 7');
  assert.equal(awarded[0].results[0].componentId, 'item-a');
  assert.equal(awarded[0].results[1].componentId, 'item-b');
});

test('_resolveSalvageResultGroups progressive mode awards nothing when check value is 0', () => {
  const engine = makeEngine();
  const resultGroup = {
    id: 'rg-1', name: 'Loot',
    results: [{ id: 'r-1', componentId: 'item-a', quantity: 1 }]
  };
  const component = {
    id: 'comp-1', name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] }
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    },
    components: [component, { id: 'item-a', name: 'Item A', difficulty: 2 }]
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, { outcome: null, value: 0 });
  assert.equal(awarded.length, 1);
  assert.equal(awarded[0].results.length, 0, 'Value 0 should award nothing');
});

test('_resolveSalvageResultGroups progressive exceed mode awards only when value strictly exceeds cost', () => {
  // exceed: a result is awarded only when `remaining > cost` (strict). value 5,
  // costs 2 then 3 → item-a (5 > 2, remaining 3) awarded; item-b (3 > 3 false) stops.
  const engine = makeEngine();
  const resultGroup = {
    id: 'rg-1', name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 }, // difficulty 2
      { id: 'r-2', componentId: 'item-b', quantity: 1 }  // difficulty 3
    ]
  };
  const component = {
    id: 'comp-1', name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] }
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: { awardMode: 'exceed' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    },
    components: [
      component,
      { id: 'item-a', name: 'Item A', difficulty: 2 },
      { id: 'item-b', name: 'Item B', difficulty: 3 }
    ]
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, { outcome: null, value: 5 });
  assert.equal(awarded.length, 1);
  assert.equal(awarded[0].results.length, 1, 'exceed awards item-a only (5 > 2); item-b stops (3 > 3 is false)');
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
      { id: 'r-2', componentId: 'item-a', quantity: 7 }  // the SAME component, listed twice
    ]
  };
  const component = {
    id: 'comp-1', name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] }
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    },
    components: [component, { id: 'item-a', name: 'Item A', difficulty: 2 }]
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, { outcome: null, value: 4 });
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
    id: 'rg-1', name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 }, // difficulty 3
      { id: 'r-2', componentId: 'item-b', quantity: 1 }, // difficulty 5
      { id: 'r-3', componentId: 'item-c', quantity: 1 }  // difficulty 2
    ]
  };
  const component = {
    id: 'comp-1', name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] }
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: { awardMode: 'partial' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    },
    components: [
      component,
      { id: 'item-a', name: 'Item A', difficulty: 3 },
      { id: 'item-b', name: 'Item B', difficulty: 5 },
      { id: 'item-c', name: 'Item C', difficulty: 2 }
    ]
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, { outcome: null, value: 4 });
  assert.equal(awarded.length, 1);
  assert.equal(awarded[0].results.length, 2, 'partial awards item-a (full) then item-b (partial tail), stopping before item-c');
  assert.equal(awarded[0].results[0].componentId, 'item-a');
  assert.equal(awarded[0].results[1].componentId, 'item-b');
});

test('_resolveSalvageResultGroups progressive mode skips results with invalid difficulty and continues', () => {
  // Salvage skips (continue) a result whose component difficulty is missing/<1
  // rather than failing the whole award. value 6: item-a (cost 2) awarded, item-b
  // (no difficulty) skipped, item-c (cost 3) awarded → both valid results awarded.
  const engine = makeEngine();
  const resultGroup = {
    id: 'rg-1', name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 1 }, // difficulty 2
      { id: 'r-2', componentId: 'item-b', quantity: 1 }, // no/invalid difficulty -> skipped
      { id: 'r-3', componentId: 'item-c', quantity: 1 }  // difficulty 3
    ]
  };
  const component = {
    id: 'comp-1', name: 'Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] }
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    },
    components: [
      component,
      { id: 'item-a', name: 'Item A', difficulty: 2 },
      { id: 'item-b', name: 'Item B', difficulty: 0 }, // invalid (< 1) -> skipped, not a misconfiguration
      { id: 'item-c', name: 'Item C', difficulty: 3 }
    ]
  });

  const awarded = engine._resolveSalvageResultGroups(component, system, { outcome: null, value: 6 });
  assert.equal(awarded.length, 1);
  assert.equal(awarded[0].results.length, 2, 'item-a and item-c awarded; item-b skipped on invalid difficulty');
  assert.equal(awarded[0].results[0].componentId, 'item-a');
  assert.equal(awarded[0].results[1].componentId, 'item-c');
});

test('salvage() progressive mode creates items matching awarded results', async () => {
  const itemAComp = { id: 'item-a', name: 'Item A', registeredItemUuid: null, difficulty: 2 };
  const itemBComp = { id: 'item-b', name: 'Item B', registeredItemUuid: null, difficulty: 5 };
  const resultGroup = {
    id: 'rg-1', name: 'Loot',
    results: [
      { id: 'r-1', componentId: 'item-a', quantity: 2 }, // cost 2
      { id: 'r-2', componentId: 'item-b', quantity: 1 }  // cost 5
    ]
  };

  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  // value=3 → only item-a (cost 2) should be awarded
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: 3, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const actor = makeActor('actor-1', [compItem]);
  const component = {
    id: 'comp-1', name: 'Test Component',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [resultGroup] }
  };
  const system = makeSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    },
    components: [component, itemAComp, itemBComp]
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
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => { tool.used = true; return []; };
  const component = makeComponent({ name: 'Test Component', toolIds: [tool.id], resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true }
    }
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(compItem.deleteCalled, true, 'Component should be consumed (consumeComponentOnFail=true)');
  assert.equal(tool.used, true, 'Tool should be broken (breakToolsOnFail=true)');
});

test('salvage failure: consumeComponent=true, consumeCatalysts=false -- only component consumed', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => { tool.used = true; return []; };
  const component = makeComponent({ name: 'Test Component', toolIds: [tool.id], resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false }
    }
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(compItem.deleteCalled, true, 'Component should be consumed (consumeComponentOnFail=true)');
  assert.equal(tool.used, false, 'Tool should NOT be broken (breakToolsOnFail=false)');
});

test('salvage failure: consumeComponent=false, consumeCatalysts=true -- only tools broken', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => { tool.used = true; return []; };
  const component = makeComponent({ name: 'Test Component', toolIds: [tool.id], resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: null,
      consumption: { consumeComponentOnFail: false, breakToolsOnFail: true }
    }
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(compItem.deleteCalled, false, 'Component should NOT be consumed (consumeComponentOnFail=false)');
  assert.equal(tool.used, true, 'Tool should be broken (breakToolsOnFail=true)');
});

test('salvage failure: consumeComponent=false, consumeCatalysts=false -- nothing consumed', async () => {
  const fakeResolutionService = {
    validateSalvage: () => ({ valid: true, errors: [] }),
    resolveResultGroups: () => ({ groups: [], meta: {} })
  };
  const engine = makeEngine({ resolutionModeService: fakeResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  const compItem = makeItem('comp-item', 'Test Component', 1);
  const toolItem = makeItem('acid-vial', 'Acid Vial', 1);
  const actor = makeActor('actor-1', [compItem, toolItem]);

  const tool = makeFakeTool('acid-vial');
  tool.used = false;
  engine._applyToolBreakage = async () => { tool.used = true; return []; };
  const component = makeComponent({ name: 'Test Component', toolIds: [tool.id], resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }] });
  const system = makeSystem({
    components: [component],
    tools: [tool],
    salvageCraftingCheck: {
      enabled: true, macroUuid: null, outcomes: [], progressive: null,
      consumption: { consumeComponentOnFail: false, breakToolsOnFail: false }
    }
  });
  setupGame(system, actor);

  await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(compItem.deleteCalled, false, 'Component should NOT be consumed (consumeComponentOnFail=false)');
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
    id: 'rg-1', name: 'Scraps',
    results: [{ id: 'r-1', componentId: 'scrap-metal', quantity: 3 }]
  };
  const component = {
    id: 'comp-1', name: 'Iron Ore',
    salvage: {
      enabled: true,
      ingredientQuantity: 2,
      toolIds: [tool.id],
      resultGroups: [resultGroup]
    }
  };
  const system = makeSystem({
    id: 'sys-integration',
    salvageEnabled: true,
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      enabled: false, macroUuid: null, outcomes: [], progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true }
    },
    components: [component, scrapComp],
    tools: [tool]
  });

  // Build engine with real ResolutionModeService wired to a system manager that returns our system
  const realResolutionService = new ResolutionModeService({
    getSystem: () => system
  });
  const engine = makeEngine({ resolutionModeService: realResolutionService });

  // Stub only the macro executor step
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  tool.used = false;
  engine._applyToolBreakage = async () => { tool.used = true; return []; };

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
  assert.equal(actor.createdItems[0].system.quantity, 3, 'Result item created with correct quantity');

  // 5. SalvageRun record has correct shape
  assert.ok(result.salvageRun, 'salvageRun should be present on result');
  assert.equal(result.salvageRun.status, 'succeeded');
  assert.equal(result.salvageRun.craftingSystemId, 'sys-integration');
  assert.equal(result.salvageRun.componentId, 'comp-1');
  assert.ok(Array.isArray(result.salvageRun.consumedComponents), 'consumedComponents should be an array');
  assert.ok(result.salvageRun.consumedComponents.length > 0, 'consumedComponents should record the consumed item');
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
    id: 'rg-1', name: 'Scraps',
    results: [
      { id: 'r-1', componentId: 'scrap-iron', quantity: 2 },
      { id: 'r-2', componentId: 'scrap-wood', quantity: 3 }
    ]
  };
  const component = {
    id: 'comp-1', name: 'Broken Relic',
    salvage: { enabled: true, ingredientQuantity: 1, toolIds: [], resultGroups: [resultGroup] }
  };
  const system = makeSystem({
    id: 'sys-659',
    salvageEnabled: true,
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      enabled: false, macroUuid: null, outcomes: [], progressive: null,
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true }
    },
    components: [component, scrapIron, scrapWood],
    tools: []
  });

  const realResolutionService = new ResolutionModeService({ getSystem: () => system });
  const engine = makeEngine({ resolutionModeService: realResolutionService });
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
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
      resultGroups: [{ id: 'rg-1', name: 'Bits', results: [{ id: 'r-1', componentId: 'scrap', quantity: 1 }] }],
      timeRequirement: { minutes: 10 }
    }
  };
  const system = makeSystem({ components: [component] });
  setupGame(system, actor);

  const result = await engine.salvage(actor.uuid, system.id, component.id);

  assert.equal(result.success, true);
  assert.equal(result.salvageRun?.status, 'waitingTime');
  assert.equal(salvageRunManager.getActiveRuns(actor).length, 1);
  assert.equal(actor.createdItems.length, 0, 'results should not be created before the time gate completes');
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
      resultGroups: [{ id: 'rg-1', name: 'Shards', results: [{ id: 'r-1', componentId: 'shard', quantity: 2 }] }],
      timeRequirement: { minutes: 5 }
    }
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
      getSalvageRunManager: () => salvageRunManager
    },
    user: { id: 'user-1' },
    time: { worldTime: 100 },
    actors: [actor]
  };

  const started = await engine.salvage(actor.uuid, system.id, component.id);
  assert.equal(started.salvageRun?.status, 'waitingTime');

  globalThis.game.time.worldTime = started.salvageRun.timeGate.availableAt;
  await engine.processPendingSalvageRuns(globalThis.game.time.worldTime);

  assert.equal(salvageRunManager.getActiveRuns(actor).length, 0, 'timed run should be removed from active runs after completion');
  const history = salvageRunManager.getRunHistory(actor);
  assert.equal(history[0]?.status, 'succeeded');
  assert.equal(actor.createdItems.length, 1, 'timed completion should create results automatically');
});
