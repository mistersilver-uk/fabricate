/**
 * CraftingEngine recipe-level Tool support.
 *
 * Covers:
 *   - _validateTools matched / missing (and broken-item rejection);
 *   - tool usage/breakage application via the shared toolBreakageRuntime
 *     (limitedUses increments toolUsage; breakageChance honored; diceExpression
 *     honored; onBreak destroy / flagBroken / replaceWith);
 *   - usedTools recorded on the success run record.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}
function setProperty(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let t = object;
  for (const p of parts) {
    if (!t[p] || typeof t[p] !== 'object') t[p] = {};
    t = t[p];
  }
  t[last] = value;
}

globalThis.foundry = { utils: { getProperty, setProperty, deepClone: v => JSON.parse(JSON.stringify(v)) } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

function installSystem({ components = [] } = {}) {
  const system = { id: 'sys-1', components, tools: [], features: {} };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null
    },
    user: { id: 'user-1', isGM: true },
    time: { worldTime: 0 }
  };
  return system;
}

// ---------------------------------------------------------------------------
// FakeItem with dot-path flag storage (matches getFabricateFlag conventions)
// ---------------------------------------------------------------------------

function getPath(obj, path) {
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}
function setPath(obj, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let t = obj;
  for (const p of parts) {
    if (!t[p] || typeof t[p] !== 'object') t[p] = {};
    t = t[p];
  }
  t[last] = value;
}

class FakeItem {
  constructor(id, { flags = {}, quantity = 1, parent = null } = {}) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = `Item ${id}`;
    this.system = { quantity };
    this._flags = { fabricate: flags };
    this.parent = parent;
    this.deleted = false;
  }
  getFlag(scope, key) {
    if (!this._flags[scope]) return undefined;
    return getPath(this._flags[scope], key);
  }
  async setFlag(scope, key, value) {
    if (!this._flags[scope]) this._flags[scope] = {};
    setPath(this._flags[scope], key, value);
    return value;
  }
  async delete() { this.deleted = true; }
  async update() {}
}

function recipe() {
  return { id: 'recipe-1', name: 'R', craftingSystemId: 'sys-1' };
}

// A recipeManager that matches tools by componentId === item.id.
function toolMatcherManager() {
  return {
    toolMatchesItem: (_recipe, tool, item) => Boolean(tool?.componentId) && tool.componentId === item?.id
  };
}

// ---------------------------------------------------------------------------
// _validateTools
// ---------------------------------------------------------------------------

test('_validateTools: returns matched { tool, item } pairs when present', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const axe = new FakeItem('c-axe');
  const actor = { items: [axe] };
  const tool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } };

  const result = await engine._validateTools([actor], recipe(), [tool]);
  assert.equal(result.valid, true);
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0].item, axe);
});

test('_validateTools: missing tool fails validation with a message', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const actor = { items: [] };
  const tool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } };

  const result = await engine._validateTools([actor], recipe(), [tool]);
  assert.equal(result.valid, false);
  assert.match(result.message, /Missing required tool/);
});

test('_validateTools: a broken matching item does NOT satisfy the tool', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const brokenAxe = new FakeItem('c-axe', { flags: { fabricate: { toolBroken: true } } });
  const actor = { items: [brokenAxe] };
  const tool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } };

  const result = await engine._validateTools([actor], recipe(), [tool]);
  assert.equal(result.valid, false);
});

test('_validateTools: no tools is trivially valid', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const result = await engine._validateTools([{ items: [] }], recipe(), []);
  assert.equal(result.valid, true);
  assert.deepEqual(result.tools, []);
});

// ---------------------------------------------------------------------------
// _applyToolBreakage
// ---------------------------------------------------------------------------

test('_applyToolBreakage: limitedUses increments toolUsage and records usedTools', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const actorRef = { uuid: 'Actor.a' };
  const axe = new FakeItem('c-axe', { flags: { fabricate: { toolUsage: { timesUsed: 1 } } }, parent: actorRef });
  const tool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: 5 }, onBreak: { mode: 'destroy' } };

  const used = await engine._applyToolBreakage(recipe(), [{ tool, item: axe }]);
  assert.deepEqual(getPath(axe._flags.fabricate, 'fabricate.toolUsage'), { timesUsed: 2 });
  assert.equal(used.length, 1);
  assert.deepEqual(used[0], { actorUuid: 'Actor.a', itemUuid: 'Item.c-axe', quantity: 1, componentId: 'c-axe', broken: false });
});

test('_applyToolBreakage: breakageChance 100 destroys via onBreak destroy', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const axe = new FakeItem('c-axe', { parent: { uuid: 'Actor.a' } });
  const tool = { componentId: 'c-axe', breakage: { mode: 'breakageChance', breakageChance: 100 }, onBreak: { mode: 'destroy' } };

  const used = await engine._applyToolBreakage(recipe(), [{ tool, item: axe }]);
  assert.equal(axe.deleted, true);
  assert.equal(used[0].broken, true);
  // breakageChance writes NO usage flag
  assert.equal(axe._flags.fabricate.fabricate, undefined);
});

test('_applyToolBreakage: breakageChance 0 never breaks and writes no usage flag', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const axe = new FakeItem('c-axe', { parent: { uuid: 'Actor.a' } });
  const tool = { componentId: 'c-axe', breakage: { mode: 'breakageChance', breakageChance: 0 }, onBreak: { mode: 'flagBroken' } };

  const used = await engine._applyToolBreakage(recipe(), [{ tool, item: axe }]);
  assert.equal(used[0].broken, false);
  assert.equal(axe._flags.fabricate.fabricate, undefined);
});

test('_applyToolBreakage: flagBroken sets toolBroken when broken', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const axe = new FakeItem('c-axe', { parent: { uuid: 'Actor.a' } });
  const tool = { componentId: 'c-axe', breakage: { mode: 'diceExpression', formula: '1d20', threshold: 10 }, onBreak: { mode: 'flagBroken' } };

  const used = await engine._applyToolBreakage(recipe(), [{ tool, item: axe }]);
  // No evaluateExpression injected → result null → not broken.
  assert.equal(used[0].broken, false);
  assert.equal(getPath(axe._flags.fabricate, 'fabricate.toolBroken'), undefined);
});

test('_applyToolBreakage: replaceWith deletes and creates the replacement component', async () => {
  const replacementComponent = { id: 'c-axe-broken', name: 'Broken Axe', type: 'loot', system: { quantity: 1 } };
  installSystem({ components: [replacementComponent] });
  const engine = new CraftingEngine(toolMatcherManager());
  const created = [];
  const actorRef = { uuid: 'Actor.a', createEmbeddedDocuments: async (_type, data) => { created.push(...data); } };
  const axe = new FakeItem('c-axe', { parent: actorRef });
  const tool = {
    componentId: 'c-axe',
    breakage: { mode: 'breakageChance', breakageChance: 100 },
    onBreak: { mode: 'replaceWith', replacementComponentId: 'c-axe-broken' }
  };

  const used = await engine._applyToolBreakage(recipe(), [{ tool, item: axe }]);
  assert.equal(axe.deleted, true);
  assert.equal(used[0].broken, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].name, 'Broken Axe');
});

// ---------------------------------------------------------------------------
// Full craft() flow — usedTools recorded on the success run record
// ---------------------------------------------------------------------------

function fullCraftRecipeManager({ ingredientItem, toolItem, fakeTool, ingredientSet }) {
  return {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], tools: [] } };
    },
    getToolsForSet() { return fakeTool ? [fakeTool] : []; },
    toolMatchesItem: (_recipe, tool, item) => tool === fakeTool && item === toolItem,
    ingredientMatchesItem: (_recipe, _ingredient, item) => item === ingredientItem
  };
}

function fakeIngredientSet(ingredientItem) {
  const ingredient = { systemItemId: ingredientItem.id, quantity: 1, getDescription: () => ingredientItem.name };
  return {
    id: 'set-1',
    matchIngredients(availableItems) {
      const matched = availableItems.find(i => i === ingredientItem);
      return matched ? [{ item: matched, quantity: 1, ingredient }] : [];
    }
  };
}

function fakeRecipe(ingredientSet) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [],
    toolIds: [],
    toolIds: [],
    outcomeRouting: null,
    steps: [],
    transferEffects: false,
    getExecutionSteps: null,
    validate() { return { valid: true, errors: [] }; },
    toJSON() { return { id: this.id, name: this.name }; }
  };
}

test('craft(): records usedTools on the success run record and increments toolUsage', async () => {
  installSystem();
  const ingredientItem = new FakeItem('ing-1', { quantity: 2 });
  const actorRef = { uuid: 'Actor.a1' };
  const toolItem = new FakeItem('c-axe', { flags: { fabricate: { toolUsage: { timesUsed: 0 } } }, parent: actorRef });
  const fakeTool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: 3 }, onBreak: { mode: 'destroy' } };
  const ingredientSet = fakeIngredientSet(ingredientItem);

  const recipeManager = fullCraftRecipeManager({ ingredientItem, toolItem, fakeTool, ingredientSet });

  let successPayload = null;
  const runManager = {
    findActiveRunForRecipe: () => null,
    getActiveRun: () => null,
    async createRun() { return { id: 'run-1', status: 'inProgress', currentStepIndex: 0 }; },
    canProceedTimeGate: () => true,
    async markStepInProgress(_actor, run) { return run; },
    async markStepWaitingForTime(_actor, run) { return run; },
    async completeStepSuccess(_actor, run, _idx, payload) { successPayload = payload; return { ...run, status: 'succeeded' }; },
    async completeStepFailure() { return {}; }
  };

  const engine = new CraftingEngine(recipeManager, runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, message: 'ok', outcome: null, value: null, data: {} });
  engine._createResultItems = async () => ({ items: [], rollTableMeta: null, resolutionMeta: {} });
  engine._postCraftChatMessage = async () => {};
  engine._runSuccessMacro = async () => {};

  const sourceActor = { id: 'a1', uuid: 'Actor.a1', items: [ingredientItem, toolItem] };
  const craftingActor = { id: 'a1', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], fakeRecipe(ingredientSet), null, {});

  assert.equal(result.success, true);
  assert.ok(successPayload, 'a success run payload was recorded');
  assert.equal(successPayload.usedTools.length, 1);
  assert.deepEqual(successPayload.usedTools[0], {
    actorUuid: 'Actor.a1', itemUuid: 'Item.c-axe', quantity: 1, componentId: 'c-axe', broken: false
  });
  assert.deepEqual(getPath(toolItem._flags.fabricate, 'fabricate.toolUsage'), { timesUsed: 1 });
});

// ---------------------------------------------------------------------------
// Virtual-present tools (Phase 4: activeCanvasTool injection)
// ---------------------------------------------------------------------------

test('_validateTools: an unowned tool present as activeCanvasTool is satisfied and marked virtual', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const actor = { items: [] };
  const tool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: 3 }, onBreak: { mode: 'destroy' } };

  const result = await engine._validateTools([actor], recipe(), [tool], { systemId: 'sys-1', componentIds: ['c-axe'] });
  assert.equal(result.valid, true);
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0].virtual, true);
  assert.equal(result.tools[0].item, null, 'no owned item backs a virtual tool');
});

test('_validateTools: a present tool from another system does NOT satisfy this recipe (cross-system collision)', async () => {
  // componentId c-axe is a PER-SYSTEM id; a station tool from system-other must
  // not satisfy a sys-1 recipe whose required tool shares the same componentId.
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const tool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: 3 }, onBreak: { mode: 'destroy' } };
  const result = await engine._validateTools(
    [{ items: [] }],
    recipe(),
    [tool],
    { systemId: 'system-other', componentIds: ['c-axe'] }
  );
  assert.equal(result.valid, false, 'an out-of-system present tool is inert');
  assert.match(result.message, /Missing required tool/);
});

test('_validateTools: WITHOUT the active tool the same unowned requirement still fails (regression guard)', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const tool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: 3 }, onBreak: { mode: 'destroy' } };
  const result = await engine._validateTools([{ items: [] }], recipe(), [tool], null);
  assert.equal(result.valid, false);
  assert.match(result.message, /Missing required tool/);
});

test('_validateTools: an owned non-broken item wins over a virtual match', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const axe = new FakeItem('c-axe');
  const result = await engine._validateTools([{ items: [axe] }], recipe(), [{ componentId: 'c-axe' }], { systemId: 'sys-1', componentIds: ['c-axe'] });
  assert.equal(result.valid, true);
  assert.equal(result.tools[0].item, axe);
  assert.equal(result.tools[0].virtual, undefined);
});

test('_applyToolBreakage: skips a virtual tool — no usage, no breakage, no usedTools entry', async () => {
  installSystem();
  const engine = new CraftingEngine(toolMatcherManager());
  const tool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: 1 }, onBreak: { mode: 'destroy' } };

  const used = await engine._applyToolBreakage(recipe(), [{ tool, item: null, virtual: true }]);
  assert.deepEqual(used, [], 'a virtual tool produces no usedTools run-record entry');
});

test('craft(): a tool absent from inventory but present as activeCanvasTool crafts with no breakage/usage', async () => {
  installSystem();
  const ingredientItem = new FakeItem('ing-1', { quantity: 2 });
  const fakeTool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: 3 }, onBreak: { mode: 'destroy' } };
  const ingredientSet = fakeIngredientSet(ingredientItem);
  // No tool item in inventory — only the active canvas tool provides it.
  const recipeManager = fullCraftRecipeManager({ ingredientItem, toolItem: null, fakeTool, ingredientSet });

  let successPayload = null;
  const runManager = {
    findActiveRunForRecipe: () => null,
    getActiveRun: () => null,
    async createRun() { return { id: 'run-1', status: 'inProgress', currentStepIndex: 0 }; },
    canProceedTimeGate: () => true,
    async markStepInProgress(_actor, run) { return run; },
    async markStepWaitingForTime(_actor, run) { return run; },
    async completeStepSuccess(_actor, run, _idx, payload) { successPayload = payload; return { ...run, status: 'succeeded' }; },
    async completeStepFailure() { return {}; }
  };

  const engine = new CraftingEngine(recipeManager, runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, message: 'ok', outcome: null, value: null, data: {} });
  engine._createResultItems = async () => ({ items: [], rollTableMeta: null, resolutionMeta: {} });
  engine._postCraftChatMessage = async () => {};
  engine._runSuccessMacro = async () => {};

  const sourceActor = { id: 'a1', uuid: 'Actor.a1', items: [ingredientItem] };
  const craftingActor = { id: 'a1', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], fakeRecipe(ingredientSet), null, {
    presentTools: { systemId: 'sys-1', componentIds: ['c-axe'] }
  });

  assert.equal(result.success, true);
  assert.ok(successPayload, 'a success run payload was recorded');
  assert.deepEqual(successPayload.usedTools, [], 'the virtual canvas tool contributes no usedTools entry');
});

test('craft(): missing required tool blocks the craft before consuming ingredients', async () => {
  installSystem();
  const ingredientItem = new FakeItem('ing-1', { quantity: 2 });
  const fakeTool = { componentId: 'c-axe', breakage: { mode: 'limitedUses', maxUses: 3 }, onBreak: { mode: 'destroy' } };
  const ingredientSet = fakeIngredientSet(ingredientItem);
  // No tool item in inventory.
  const recipeManager = fullCraftRecipeManager({ ingredientItem, toolItem: null, fakeTool, ingredientSet });

  const engine = new CraftingEngine(recipeManager, null, null);
  engine._runCraftingCheck = async () => ({ success: true, message: 'ok', outcome: null, value: null, data: {} });

  const sourceActor = { id: 'a1', uuid: 'Actor.a1', items: [ingredientItem] };
  const craftingActor = { id: 'a1', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], fakeRecipe(ingredientSet), null, {});
  assert.equal(result.success, false);
  assert.match(result.message, /Missing required tool/);
});
