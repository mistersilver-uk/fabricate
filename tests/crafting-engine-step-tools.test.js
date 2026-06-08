/**
 * Phase 0 — STEP-tier Tool support (regression for the merge gap where
 * `step.toolIds` was normalized/serialized by Recipe but never merged into the
 * per-step execution-recipe view, so it was silently never gated, validated,
 * or used/broken).
 *
 * Unlike `crafting-engine-tools.test.js` (which mocks `getToolsForSet` and
 * never exercises granularity) and `recipe-tools.test.js` (which covers only
 * the recipe + ingredient-set tiers), this test wires a REAL multi-step
 * `Recipe`, a REAL `RecipeManager`, and a REAL `CraftingEngine` so the full
 * chain is exercised:
 *
 *   _buildStepRecipeView (merges step.toolIds) -> getToolsForSet via
 *   recipe.toolIds -> canCraft/evaluateCraftability gating -> _validateTools ->
 *   _applyToolBreakage (toolUsage increment + usedTools record).
 *
 * Proves a STEP-level `toolIds` requirement is:
 *   (a) gated by evaluateCraftability/canCraft (missing -> not craftable),
 *   (b) validated by _validateTools, and
 *   (c) used/broken on craft (toolUsage incremented / recorded in usedTools).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals required for module load + craft flow
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

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
    getProperty: getPath,
    setProperty: setPath,
    deepClone: v => JSON.parse(JSON.stringify(v))
  }
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeItem {
  constructor(id, { name, flags = {}, quantity = 1, parent = null } = {}) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name ?? id;
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
  async update(changes = {}) {
    for (const [k, v] of Object.entries(changes)) setPath(this, k, v);
  }
}

/**
 * Install a crafting system with name-matched managed components + tools.
 * `Hammer` is the STEP-2 tool component (no sourceUuid -> matched by name).
 */
function installSystem() {
  const system = {
    id: 'sys-1',
    components: [
      { id: 'c-ore', name: 'Ore' },
      { id: 'c-ingot', name: 'Ingot' },
      { id: 'c-bar', name: 'Bar' },
      { id: 'c-hammer', name: 'Hammer' }
    ],
    tools: [
      { id: 'tool-hammer', componentId: 'c-hammer', breakage: { mode: 'limitedUses', maxUses: 5 }, onBreak: { mode: 'destroy' } }
    ],
    features: {}
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: id => (id === 'sys-1' ? system : null) }),
      getResolutionModeService: () => null
    },
    user: { id: 'user-1', isGM: true },
    time: { worldTime: 0 }
  };
  return system;
}

/**
 * A two-step recipe whose SECOND step requires the `tool-hammer` tool at
 * STEP granularity (no recipe-level or ingredient-set-level toolIds).
 */
function twoStepRecipe() {
  return new Recipe({
    name: 'Forge Bar',
    craftingSystemId: 'sys-1',
    steps: [
      {
        name: 'Smelt',
        ingredientSets: [{
          id: 'set-smelt',
          ingredientGroups: [{ id: 'g1', name: 'G1', options: [{ componentId: 'c-ore', quantity: 1 }] }]
        }],
        resultGroups: [{ id: 'rg1', name: 'Ingot', results: [{ id: 'r1', componentId: 'c-ingot', quantity: 1 }] }]
      },
      {
        name: 'Forge',
        // STEP-tier tool requirement — the regression target.
        toolIds: ['tool-hammer'],
        ingredientSets: [{
          id: 'set-forge',
          ingredientGroups: [{ id: 'g2', name: 'G2', options: [{ componentId: 'c-ingot', quantity: 1 }] }]
        }],
        resultGroups: [{ id: 'rg2', name: 'Bar', results: [{ id: 'r2', componentId: 'c-bar', quantity: 1 }] }]
      }
    ]
  });
}

// The execution-recipe view for step index `i` (mirrors what craft() builds).
function stepView(engine, recipe, i) {
  return engine._buildStepRecipeView(recipe, recipe.getExecutionSteps()[i]);
}

// ---------------------------------------------------------------------------
// (a) gating: evaluateCraftability / canCraft via the step view
// ---------------------------------------------------------------------------

test('step-tier toolIds are merged into the execution-recipe view via _buildStepRecipeView', () => {
  installSystem();
  const engine = new CraftingEngine(new RecipeManager());
  const recipe = twoStepRecipe();

  // Step 0 (Smelt) has no tools; Step 1 (Forge) carries the step-tier tool.
  assert.deepEqual(stepView(engine, recipe, 0).toolIds, []);
  assert.deepEqual(stepView(engine, recipe, 1).toolIds, ['tool-hammer']);
});

test('(a) evaluateCraftability gates the step-tier tool: missing hammer -> not craftable', () => {
  installSystem();
  const manager = new RecipeManager();
  const engine = new CraftingEngine(manager);
  const recipe = twoStepRecipe();
  const forgeView = stepView(engine, recipe, 1);

  // Ingot present, hammer absent.
  const missing = manager.evaluateCraftability([{ items: [new FakeItem('i1', { name: 'Ingot' })] }], forgeView);
  assert.equal(missing.toolStates.length, 1);
  assert.equal(missing.toolStates[0].name, 'Hammer');
  assert.equal(missing.toolStates[0].available, false);
  assert.equal(missing.missing.tools.length, 1);
  assert.equal(missing.canCraft, false);

  // Hammer present alongside the ingot -> craftable.
  const present = manager.evaluateCraftability(
    [{ items: [new FakeItem('i1', { name: 'Ingot' }), new FakeItem('h1', { name: 'Hammer' })] }],
    forgeView
  );
  assert.equal(present.missing.tools.length, 0);
  assert.equal(present.canCraft, true);
});

test('(a) canCraft surfaces the missing step-tier tool', () => {
  installSystem();
  const manager = new RecipeManager();
  const engine = new CraftingEngine(manager);
  const forgeView = stepView(engine, twoStepRecipe(), 1);
  const result = manager.canCraft([{ items: [new FakeItem('i1', { name: 'Ingot' })] }], forgeView);
  assert.equal(result.canCraft, false);
  assert.equal(result.missing.tools.length, 1);
});

// ---------------------------------------------------------------------------
// (b) validation: _validateTools enforces the step-tier tool
// ---------------------------------------------------------------------------

test('(b) _validateTools enforces the step-tier tool resolved from the merged view', async () => {
  installSystem();
  const manager = new RecipeManager();
  const engine = new CraftingEngine(manager);
  const forgeView = stepView(engine, twoStepRecipe(), 1);
  const tools = manager.getToolsForSet(forgeView, forgeView.ingredientSets[0]);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].id, 'tool-hammer');

  const missing = await engine._validateTools([{ items: [] }], forgeView, tools);
  assert.equal(missing.valid, false);
  assert.match(missing.message, /Missing required tool/);

  const hammer = new FakeItem('h1', { name: 'Hammer' });
  const present = await engine._validateTools([{ items: [hammer] }], forgeView, tools);
  assert.equal(present.valid, true);
  assert.equal(present.tools[0].item, hammer);
});

// ---------------------------------------------------------------------------
// (c) usage/breakage on a full craft() of the tool-bearing step
// ---------------------------------------------------------------------------

test('(c) craft() of the step-tier step uses/records the tool (toolUsage++ and usedTools)', async () => {
  installSystem();
  const manager = new RecipeManager();
  let lastSuccess = null;
  const engine = new CraftingEngine(manager, makeRunManager(1, payload => { lastSuccess = payload; }), null);

  // Skip side effects unrelated to tools.
  engine._runCraftingCheck = async () => ({ success: true, message: 'ok', outcome: null, value: null, data: {} });
  engine._createResultItems = async () => ({ items: [], rollTableMeta: null, resolutionMeta: {} });
  engine._postCraftChatMessage = async () => {};
  engine._runSuccessMacro = async () => {};

  const recipe = twoStepRecipe();
  const actorRef = { uuid: 'Actor.a1' };
  const ingot = new FakeItem('i1', { name: 'Ingot', parent: actorRef });
  const hammer = new FakeItem('h1', {
    name: 'Hammer',
    flags: { fabricate: { toolUsage: { timesUsed: 0 } } },
    parent: actorRef
  });
  const sourceActor = { id: 'a1', uuid: 'Actor.a1', items: [ingot, hammer] };
  const craftingActor = { id: 'a1', uuid: 'Actor.a1', items: { contents: [] } };

  // Drive step index 1 (Forge) — the step carrying the tool requirement.
  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, result.message);
  assert.ok(lastSuccess, 'success payload recorded');
  assert.equal(lastSuccess.usedTools.length, 1);
  assert.deepEqual(lastSuccess.usedTools[0], {
    actorUuid: 'Actor.a1', itemUuid: 'Item.h1', quantity: 1, componentId: 'c-hammer', broken: false
  });
  assert.deepEqual(getPath(hammer._flags.fabricate, 'fabricate.toolUsage'), { timesUsed: 1 });
});

test('(c) craft() of the step-tier step is blocked when the tool is absent', async () => {
  installSystem();
  const manager = new RecipeManager();
  const engine = new CraftingEngine(manager, makeRunManager(1, () => {}), null);
  engine._runCraftingCheck = async () => ({ success: true, message: 'ok', outcome: null, value: null, data: {} });

  const recipe = twoStepRecipe();
  const ingot = new FakeItem('i1', { name: 'Ingot', parent: { uuid: 'Actor.a1' } });
  const sourceActor = { id: 'a1', uuid: 'Actor.a1', items: [ingot] }; // no hammer
  const craftingActor = { id: 'a1', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, false);
  // Gated by canCraft (missing tool) before the explicit _validateTools call.
  assert.match(result.message, /Missing required items|Missing required tool/);
});

test('(c) failure-path: a failed check breaks the step-tier tool when consumeCatalystsOnFail is set', async () => {
  const system = installSystem();
  // Enable failure-path tool consumption (the gate at CraftingEngine
  // ~line 233/306 that drives _applyToolBreakage on a failed check).
  system.craftingCheck = { consumption: { consumeIngredientsOnFail: false, consumeCatalystsOnFail: true } };

  const manager = new RecipeManager();
  let failurePayload = null;
  const runManager = makeRunManager(1, () => {});
  runManager.completeStepFailure = async (_actor, run, _idx, _msg, payload) => { failurePayload = payload; return { ...run, status: 'failed' }; };
  const engine = new CraftingEngine(manager, runManager, null);

  // Force the crafting check to FAIL so the failure-path consumption runs.
  engine._runCraftingCheck = async () => ({ success: false, message: 'check failed', outcome: null, value: null, data: {} });
  engine._postCraftChatMessage = async () => {};
  engine._runFailureMacro = async () => {};

  const recipe = twoStepRecipe();
  const actorRef = { uuid: 'Actor.a1' };
  const ingot = new FakeItem('i1', { name: 'Ingot', parent: actorRef });
  const hammer = new FakeItem('h1', { name: 'Hammer', parent: actorRef });
  const sourceActor = { id: 'a1', uuid: 'Actor.a1', items: [ingot, hammer] };
  const craftingActor = { id: 'a1', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, false);
  assert.ok(failurePayload, 'failure payload recorded');
  assert.equal(failurePayload.usedTools.length, 1);
  assert.equal(failurePayload.usedTools[0].componentId, 'c-hammer');
  // limitedUses with maxUses 5 starting at 0 -> not broken, but usage recorded.
  assert.equal(failurePayload.usedTools[0].broken, false);
});

// A run manager that drives a specific step index and captures the success payload.
function makeRunManager(stepIndex, onSuccess) {
  return {
    findActiveRunForRecipe: () => null,
    getActiveRun: () => null,
    async createRun() { return { id: 'run-1', status: 'inProgress', currentStepIndex: stepIndex }; },
    canProceedTimeGate: () => true,
    async markStepInProgress(_actor, run) { return run; },
    async markStepWaitingForTime(_actor, run) { return run; },
    async completeStepSuccess(_actor, run, _idx, payload) { onSuccess(payload); return { ...run, status: 'succeeded' }; },
    async completeStepFailure() { return {}; }
  };
}
