/**
 * Recipe currency-alternative SPEND tests.
 *
 * Two layers:
 *
 *   1. Selection (IngredientSet.resolveIngredientSelection) — items-first /
 *      currency-fallback, affordability gating, the `currencySpends` field, and the
 *      no-probe back-compat (currency never chosen) that `canBeCraftedWith` relies on.
 *   2. Engine (CraftingEngine.craft) — the single-selection-source flow, the
 *      all-affordable gate before any mutation, cross-unit aggregation, dnd5e
 *      (actor.update) + pf2e (inventory.removeCoins) deduction, the half-consume
 *      abort, the probe-actor identity, the multi-step time gate, and the
 *      async-gate-fail-no-item-fallback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { DND5E_CURRENCY_PRESETS, PF2E_CURRENCY_PRESETS } from '../src/config/currencyPresets.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { ActorInventoryCoinSpender, ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import { Pf2eInventoryCoinAdapter } from '../src/systems/Pf2eInventoryCoinAdapter.js';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = {
  utils: {
    getProperty,
    setProperty: () => {},
    randomID: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

// ---------------------------------------------------------------------------
// Shared item / actor stubs
// ---------------------------------------------------------------------------

function makeItem({ id, name = `Item ${id}`, quantity = 1, componentId = null } = {}) {
  return {
    id,
    uuid: `Item.${id}`,
    name,
    componentId,
    parent: null,
    system: { quantity },
    effects: [],
    deleteCalled: false,
    updateCalled: false,
    updatePayloads: [],
    async delete() {
      this.deleteCalled = true;
      this.system.quantity = 0;
    },
    async update(payload) {
      this.updateCalled = true;
      this.updatePayloads.push(payload);
      if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    },
  };
}

function makeDnd5eActor({ id = 'dnd', currency = {}, items = [] } = {}) {
  const created = [];
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    items,
    createdItems: created,
    system: { currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...currency } },
    updateCalls: [],
    async update(payload) {
      this.updateCalls.push(payload);
      for (const [path, value] of Object.entries(payload)) {
        const key = path.split('.').pop();
        this.system.currency[key] = value;
      }
    },
    async createEmbeddedDocuments(_type, datas) {
      const stubs = (datas || []).map((d, i) => ({
        id: `created-${created.length + i}`,
        uuid: `Item.created-${created.length + i}`,
        name: d.name || 'Created',
        system: { quantity: d.system?.quantity || 1 },
      }));
      created.push(...stubs);
      return stubs;
    },
  };
}

function makePf2eActor({ id = 'pf2e', coins = {}, items = [] } = {}) {
  const created = [];
  const balance = { pp: 0, gp: 0, sp: 0, cp: 0, ...coins };
  const removeCalls = [];
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    items,
    createdItems: created,
    removeCalls,
    // No actor.update for currency — pf2e coins live in inventory.
    inventory: {
      get coins() {
        return {
          ...balance,
          copperValue: balance.cp + balance.sp * 10 + balance.gp * 100 + balance.pp * 1000,
        };
      },
      async removeCoins(coinsToRemove) {
        removeCalls.push(coinsToRemove);
        // Aggregate to copper, check sufficiency, then settle from the highest coin down.
        let copper = 0;
        for (const [denom, count] of Object.entries(coinsToRemove)) {
          const mult = { cp: 1, sp: 10, gp: 100, pp: 1000 }[denom] || 0;
          copper += count * mult;
        }
        const have = balance.cp + balance.sp * 10 + balance.gp * 100 + balance.pp * 1000;
        if (copper > have) return false;
        // Simplest settle: convert everything to copper, subtract, re-distribute.
        let remaining = have - copper;
        balance.pp = Math.floor(remaining / 1000);
        remaining -= balance.pp * 1000;
        balance.gp = Math.floor(remaining / 100);
        remaining -= balance.gp * 100;
        balance.sp = Math.floor(remaining / 10);
        remaining -= balance.sp * 10;
        balance.cp = remaining;
        return true;
      },
    },
    async createEmbeddedDocuments(_type, datas) {
      const stubs = (datas || []).map((d, i) => ({
        id: `created-${created.length + i}`,
        uuid: `Item.created-${created.length + i}`,
        name: d.name || 'Created',
        system: { quantity: d.system?.quantity || 1 },
      }));
      created.push(...stubs);
      return stubs;
    },
  };
}

// ---------------------------------------------------------------------------
// Crafting-system manager stub (requirements.currency)
// ---------------------------------------------------------------------------

function setupGame(systemConfig, fabricateExtra = {}) {
  globalThis.game = {
    user: { id: 'u1', isGM: true },
    time: { worldTime: 0 },
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => systemConfig }),
      ...fabricateExtra,
    },
  };
  globalThis.fromUuid = async () => null;
}

function makeCurrencySystem({ spendStrategy = 'actorProperty', units, enabled = true } = {}) {
  const resolvedUnits =
    units || (spendStrategy === 'actorInventory' ? PF2E_CURRENCY_PRESETS : DND5E_CURRENCY_PRESETS);
  return {
    id: 'sys-cur',
    resolutionMode: 'simple',
    features: { multiStepRecipes: false, craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: { consumeIngredientsOnFail: false } },
    components: [],
    requirements: { currency: { enabled, spendStrategy, units: resolvedUnits, macros: {} } },
  };
}

// ---------------------------------------------------------------------------
// IngredientSet / Recipe / RecipeManager builders for the engine
// ---------------------------------------------------------------------------

function currencyOption(unit, amount) {
  return { quantity: 1, match: { type: 'currency', unit, amount } };
}

function itemOption(componentId, quantity = 1) {
  return { quantity, match: { type: 'component', componentId } };
}

function makeSet(groups) {
  return new IngredientSet({
    id: 'set-1',
    ingredientGroups: groups.map((options, idx) => ({ id: `g${idx}`, name: `G${idx}`, options })),
  });
}

function makeRecipe({ ingredientSet, steps = null } = {}) {
  const recipe = {
    id: 'recipe-1',
    name: 'Currency Recipe',
    craftingSystemId: 'sys-cur',
    ingredientSets: ingredientSet ? [ingredientSet] : [],
    resultGroups: [{ id: 'rg', results: [{ id: 'r', componentId: 'comp-out', quantity: 1 }] }],
    outcomeRouting: null,
    transferEffects: false,
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId };
    },
  };
  recipe.getExecutionSteps = steps !== null ? () => steps : null;
  return recipe;
}

// A RecipeManager stub: item matching is by componentId === item.componentId. canCraft
// delegates to the real IngredientSet selection so the engine's satisfiableSet is authentic.
function makeRecipeManager({ craftingActorRef } = {}) {
  const manager = {
    ingredientMatchesItem(_recipe, ingredient, item) {
      const cid = ingredient?.match?.componentId || ingredient?.componentId || null;
      return !!cid && item?.componentId === cid;
    },
    getToolsForSet: () => [],
    canCraft(actors, recipe, { craftingActor = null } = {}) {
      const set = recipe.ingredientSets[0];
      const items = actors.flatMap((a) => [...a.items]);
      // Build a probe the same way the engine/RecipeManager would, but here we just
      // mirror affordability so satisfiableSet is realistic.
      const selection = set.resolveIngredientSelection(
        items,
        (ing, it) => manager.ingredientMatchesItem(recipe, ing, it),
        { affordCurrency: manager._probe?.(craftingActor || craftingActorRef) }
      );
      // Mirror the real evaluateCraftability missing-ingredient mapping so
      // _formatMissingItems surfaces the currency option's getDescription.
      const missingIngredients = (selection.missingGroups || [])
        .map((mg) => mg?.ingredient || mg?.group?.options?.[0] || null)
        .filter(Boolean)
        .map((ingredient) => ({
          ingredient,
          have: 0,
          need: Number(ingredient.quantity || 1),
        }));
      return {
        canCraft: selection.success,
        satisfiableSet: selection.success ? set : null,
        missing: { ingredients: missingIngredients, essences: [], tools: [] },
      };
    },
  };
  return manager;
}

function makeEngine(system, { actorInventoryCoinSpender = null, actorPropertyCoinSpender = null } = {}) {
  // Wire the spenders onto game.fabricate so the display probe (canCraft) resolves the
  // same spend strategy → spender chain the engine does.
  if (globalThis.game?.fabricate) {
    globalThis.game.fabricate.getActorInventoryCoinSpender = () => actorInventoryCoinSpender;
    globalThis.game.fabricate.getActorPropertyCoinSpender = () => actorPropertyCoinSpender;
  }
  const recipeManager = makeRecipeManager();
  // Wire a probe so the stub canCraft mirrors real affordability.
  const { buildCurrencyAffordProbe } = globalThis.__currencyAffordance;
  recipeManager._probe = (actor) => buildCurrencyAffordProbe(actor, { craftingSystemId: system.id });
  const engine = new CraftingEngine(
    recipeManager,
    null,
    { getMode: () => 'simple', validateRecipe: () => ({ valid: true }), validateCheckResult: () => true },
    null,
    null,
    actorInventoryCoinSpender,
    actorPropertyCoinSpender
  );
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._createResultItems = async (craftingActor) => {
    const [created] = await craftingActor.createEmbeddedDocuments('Item', [
      { name: 'Result', system: { quantity: 1 } },
    ]);
    return { items: [created], rollTableMeta: null, resolutionMeta: { disposition: 'ok' } };
  };
  engine._postCraftChatMessage = async () => {};
  return engine;
}

// Expose the affordance helper to the manager stub probe wiring.
globalThis.__currencyAffordance = await import('../src/systems/currencyAffordance.js');

// ===========================================================================
// 1. Selection-level tests
// ===========================================================================

test('selection: items-first even when a currency option is authored first', () => {
  setupGame(makeCurrencySystem());
  const set = makeSet([[currencyOption('gp', 5), itemOption('comp-a')]]);
  const items = [makeItem({ id: 'a', componentId: 'comp-a' })];
  const matcher = (ing, it) => ing.match?.componentId === it.componentId;
  // Even with an always-affordable probe, the item option wins.
  const selection = set.resolveIngredientSelection(items, matcher, { affordCurrency: () => true });
  assert.equal(selection.success, true);
  assert.equal(selection.plan.length, 1);
  assert.equal(selection.currencySpends.length, 0, 'items strictly beat currency');
});

test('selection: currency-fallback when no item satisfies and it is affordable', () => {
  setupGame(makeCurrencySystem());
  const set = makeSet([[itemOption('comp-missing'), currencyOption('gp', 5)]]);
  const matcher = (ing, it) => ing.match?.componentId === it.componentId;
  const selection = set.resolveIngredientSelection([], matcher, { affordCurrency: () => true });
  assert.equal(selection.success, true);
  assert.equal(selection.plan.length, 0);
  assert.deepEqual(selection.currencySpends.map((s) => `${s.amount} ${s.unit}`), ['5 gp']);
});

test('selection: currency-only group unaffordable surfaces a missing entry with need/have', () => {
  setupGame(makeCurrencySystem());
  const set = makeSet([[currencyOption('gp', 5)]]);
  const matcher = () => false;
  const selection = set.resolveIngredientSelection([], matcher, { affordCurrency: () => false });
  assert.equal(selection.success, false);
  assert.equal(selection.currencySpends.length, 0);
  assert.equal(selection.missingGroups.length, 1);
  const missing = selection.missingGroups[0];
  assert.equal(missing.ingredient.match.type, 'currency');
  assert.equal(missing.ingredient.getDescription(), 'Insufficient currency. Requires 5 gp.');
});

test('selection: no-probe back-compat — authored currency is never chosen (item-only plan)', () => {
  setupGame(makeCurrencySystem());
  const set = makeSet([[currencyOption('gp', 5), itemOption('comp-a')]]);
  const items = [makeItem({ id: 'a', componentId: 'comp-a' })];
  const matcher = (ing, it) => ing.match?.componentId === it.componentId;
  // Default call (no opts) — identical to legacy behavior.
  const legacy = set.resolveIngredientSelection(items, matcher);
  assert.equal(legacy.success, true);
  assert.equal(legacy.plan.length, 1);
  assert.deepEqual(legacy.currencySpends, []);

  // A currency-only group with no probe is missing, not satisfied.
  const currencyOnly = makeSet([[currencyOption('gp', 5)]]);
  const blind = currencyOnly.resolveIngredientSelection([], () => false);
  assert.equal(blind.success, false);
  assert.equal(blind.currencySpends.length, 0);
});

test('selection: first AFFORDABLE currency option wins among multiple currency options', () => {
  setupGame(makeCurrencySystem());
  const set = makeSet([[currencyOption('pp', 1), currencyOption('gp', 5)]]);
  // pp unaffordable, gp affordable → gp chosen.
  const affordCurrency = (m) => m.unit === 'gp';
  const selection = set.resolveIngredientSelection([], () => false, { affordCurrency });
  assert.equal(selection.success, true);
  assert.deepEqual(selection.currencySpends.map((s) => `${s.amount} ${s.unit}`), ['5 gp']);
});

// ===========================================================================
// 2. Engine-craft tests
// ===========================================================================

test('engine: currency-only recipe succeeds and decrements dnd5e currency (no item consumed)', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const set = makeSet([[currencyOption('gp', 3)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const sourceActor = makeDnd5eActor({ id: 'src' });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 10 } });
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, true, result.message);
  assert.equal(craftingActor.system.currency.gp, 7, 'gp 10 - 3 = 7');
  assert.equal(craftingActor.createdItems.length, 1, 'result created');
});

test('engine: mixed item + currency set consumes the item AND decrements currency', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const set = makeSet([[itemOption('comp-a')], [currencyOption('gp', 2)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const herb = makeItem({ id: 'herb', componentId: 'comp-a', quantity: 1 });
  const sourceActor = makeDnd5eActor({ id: 'src', items: [herb] });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 5 } });
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, true, result.message);
  assert.equal(herb.deleteCalled, true, 'item consumed');
  assert.equal(craftingActor.system.currency.gp, 3, 'gp 5 - 2 = 3');
});

test('engine: insufficient currency aborts with an Insufficient-currency message and zero mutation', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const set = makeSet([[currencyOption('gp', 50)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const sourceActor = makeDnd5eActor({ id: 'src' });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 1 } });
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, false);
  assert.match(result.message, /Insufficient currency/i);
  assert.equal(craftingActor.system.currency.gp, 1, 'no currency spent');
  assert.equal(craftingActor.createdItems.length, 0, 'no result created');
  assert.equal(craftingActor.updateCalls.length, 0, 'no actor.update ran');
});

test('engine: half-consume — currency short aborts BEFORE the item is deleted', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const set = makeSet([[itemOption('comp-a')], [currencyOption('gp', 999)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const herb = makeItem({ id: 'herb', componentId: 'comp-a', quantity: 1 });
  const sourceActor = makeDnd5eActor({ id: 'src', items: [herb] });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 1 } });
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, false);
  assert.equal(herb.deleteCalled, false, 'item must NOT be consumed when the gate fails');
  assert.equal(herb.updateCalled, false);
});

test('engine: cross-unit aggregation — two units same ladder, each affordable alone but sum is not', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  // gp 1 (=100 cp) + sp 5 (=50 cp) = 150 cp required; actor has gp 1 (=100 cp) only.
  const set = makeSet([[currencyOption('gp', 1)], [currencyOption('sp', 5)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const sourceActor = makeDnd5eActor({ id: 'src' });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 1 } });
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, false, 'combined requirement exceeds the held ladder value');
  assert.match(result.message, /Insufficient currency/i);
  assert.equal(craftingActor.system.currency.gp, 1, 'zero mutation on aggregate shortfall');
});

test('engine: same-unit aggregation collapses two currency groups into one summed spend', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const set = makeSet([[currencyOption('gp', 2)], [currencyOption('gp', 3)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const sourceActor = makeDnd5eActor({ id: 'src' });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 10 } });
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, true, result.message);
  assert.equal(craftingActor.system.currency.gp, 5, 'gp 10 - (2 + 3) = 5');
});

test('engine: pf2e currency spends through the inventory adapter (no actor.update)', async () => {
  const system = makeCurrencySystem({ spendStrategy: 'actorInventory' });
  setupGame(system);
  globalThis.game.system = { id: 'pf2e' };
  const set = makeSet([[currencyOption('gp', 3)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const sourceActor = makePf2eActor({ id: 'src' });
  const craftingActor = makePf2eActor({ id: 'craft', coins: { gp: 5 } });
  const inventorySpender = new ActorInventoryCoinSpender({
    adapters: new Map([['pf2e', new Pf2eInventoryCoinAdapter()]]),
  });
  const engine = makeEngine(system, { actorInventoryCoinSpender: inventorySpender });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, true, result.message);
  assert.deepEqual(craftingActor.removeCalls, [{ gp: 3 }], 'spent via removeCoins, not actor.update');
  assert.equal(craftingActor.inventory.coins.gp, 2, 'gp 5 - 3 = 2');
});

test('engine: gating requirements.currency.enabled:false — currency never satisfies (missing)', async () => {
  const system = makeCurrencySystem({ enabled: false });
  setupGame(system);
  const set = makeSet([[currencyOption('gp', 1)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const sourceActor = makeDnd5eActor({ id: 'src' });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 1000 } });
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, false, 'currency disabled → group can never be satisfied');
  assert.equal(craftingActor.system.currency.gp, 1000, 'no spend when currency disabled');
});

test('engine: single-selection-source — the spend equals what the gate checked (no recompute divergence)', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const set = makeSet([[itemOption('comp-a')], [currencyOption('gp', 4)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const herb = makeItem({ id: 'herb', componentId: 'comp-a', quantity: 1 });
  const sourceActor = makeDnd5eActor({ id: 'src', items: [herb] });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 4 } });

  // A spy spender records every check/spend requirement; they must be identical.
  const checked = [];
  const spent = [];
  const baseSpender = new ActorPropertyCoinSpender();
  const spy = {
    readCoins: (actor, ctx) => baseSpender.readCoins(actor, ctx),
    check: (actor, req, ctx) => {
      checked.push(req.amount);
      return baseSpender.check(actor, req, ctx);
    },
    spend: (actor, req, ctx) => {
      spent.push(req.amount);
      return baseSpender.spend(actor, req, ctx);
    },
  };
  const engine = makeEngine(system, { actorPropertyCoinSpender: spy });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, true, result.message);
  assert.deepEqual(checked, [4]);
  assert.deepEqual(spent, [4], 'the engine spends exactly what the gate checked');
});

test('engine: probe-actor identity — display probe and craft spend hit the SAME actor', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const set = makeSet([[currencyOption('gp', 2)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const sourceActor = makeDnd5eActor({ id: 'src' });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 2 } });
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });

  // The recipeManager probe (canCraft) reads craftingActor's currency; the engine
  // spends from the same actor. A craft that succeeds proves they agree.
  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, true, result.message);
  assert.equal(craftingActor.system.currency.gp, 0, 'spent from the probed actor');
});

test('engine: craftingActor=null does not crash and shows currency missing', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const { buildCurrencyAffordProbe } = globalThis.__currencyAffordance;
  const probe = buildCurrencyAffordProbe(null, { craftingSystemId: system.id });
  assert.equal(probe({ unit: 'gp', amount: 1 }), false, 'null actor → never affordable, no throw');
});

test('engine: multi-step time gate — a waiting step does NOT spend currency', async () => {
  const system = makeCurrencySystem();
  setupGame(system);
  const set = makeSet([[currencyOption('gp', 1)]]);
  const steps = [
    {
      id: 'step-1',
      name: 'Brew',
      ingredientSets: [set],
      resultGroups: recipeResultGroups(),
      toolIds: [],
      timeRequirement: { duration: 3600 },
      outcomeRouting: null,
    },
  ];
  const recipe = makeRecipe({ ingredientSet: set, steps });
  const sourceActor = makeDnd5eActor({ id: 'src' });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 5 } });

  // A run manager whose run is ALREADY armed (a pre-seeded timeGate) and whose
  // gate is NOT yet proceedable: this call is a poll of a maturing gate, not the
  // START that arms it. Currency was spent at START (a prior call), so this poll
  // spends nothing.
  const runManager = {
    findActiveRunForRecipe: () => null,
    getActiveRun: () => null,
    durationToSeconds: () => 3600,
    async createRun() {
      return { id: 'run-1', currentStepIndex: 0, steps: [{ timeGate: { availableAt: 99999 } }] };
    },
    async markStepWaitingForTime(_a, run) {
      return run;
    },
    canProceedTimeGate: () => false,
    async markStepInProgress(_a, run) {
      return run;
    },
  };
  const engine = makeEngine(system, { actorPropertyCoinSpender: new ActorPropertyCoinSpender() });
  engine.craftingRunManager = runManager;

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, false, 'still waiting for the time gate');
  assert.match(result.message, /in progress/i);
  assert.equal(
    craftingActor.system.currency.gp,
    5,
    'no currency spent while polling an already-armed, not-yet-matured gate'
  );
});

function recipeResultGroups() {
  return [{ id: 'rg', results: [{ id: 'r', componentId: 'comp-out', quantity: 1 }] }];
}

// ===========================================================================
// 3. Real RecipeManager craftability display (plan-review item 6)
// ===========================================================================

test('RecipeManager.evaluateCraftability: unaffordable currency shows the Insufficient-currency description', () => {
  const system = makeCurrencySystem();
  setupGame(system);
  globalThis.game.fabricate.getActorPropertyCoinSpender = () => new ActorPropertyCoinSpender();
  const manager = new RecipeManager();
  const recipe = { craftingSystemId: 'sys-cur', ingredientSets: [makeSet([[currencyOption('gp', 5)]])] };
  const actor = makeDnd5eActor({ id: 'broke', currency: { gp: 1 } });

  const result = manager.evaluateCraftability([actor], recipe, { craftingActor: actor });
  assert.equal(result.canCraft, false);
  assert.equal(result.missing.ingredients.length, 1);
  assert.equal(
    result.missing.ingredients[0].ingredient.getDescription(),
    'Insufficient currency. Requires 5 gp.'
  );
});

test('RecipeManager.evaluateCraftability: an affordable actor flips a currency-only recipe craftable', () => {
  const system = makeCurrencySystem();
  setupGame(system);
  globalThis.game.fabricate.getActorPropertyCoinSpender = () => new ActorPropertyCoinSpender();
  const manager = new RecipeManager();
  const recipe = { craftingSystemId: 'sys-cur', ingredientSets: [makeSet([[currencyOption('gp', 5)]])] };
  const rich = makeDnd5eActor({ id: 'rich', currency: { gp: 100 } });

  assert.equal(manager.evaluateCraftability([rich], recipe, { craftingActor: rich }).canCraft, true);
  // A null crafting actor → currency shows missing (no crash).
  assert.equal(manager.evaluateCraftability([rich], recipe, { craftingActor: null }).canCraft, false);
});

test('engine: async-gate failure (macro) does not fall back to an unselected item plan', async () => {
  // A macro strategy whose canAfford macro reports failure must abort with zero mutation —
  // never silently item-craft. Here the group is currency-only so there is no item plan at all,
  // and the failing async gate must keep the result uncreated.
  const system = makeCurrencySystem({
    spendStrategy: 'macro',
    units: [{ id: 'gp', label: 'Gold', abbreviation: 'gp', contains: [] }],
  });
  // Macro config needs canAfford + decrement to validate.
  system.requirements.currency.macros = { canAfford: 'Macro.afford', decrement: 'Macro.dec' };
  setupGame(system);
  const set = makeSet([[currencyOption('gp', 1)]]);
  const recipe = makeRecipe({ ingredientSet: set });
  const sourceActor = makeDnd5eActor({ id: 'src' });
  const craftingActor = makeDnd5eActor({ id: 'craft', currency: { gp: 100 } });
  const engine = makeEngine(system);

  // The macro probe is optimistic (sync), so canCraft passes selection. The async gate then
  // runs the canAfford macro via MacroExecutor.run; with no resolvable macro the spender
  // returns invalid, so the gate must abort with zero mutation and never item/currency-craft.
  globalThis.fromUuid = async () => null;
  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result.success, false, 'unconfirmable async gate must not item/currency-craft');
  assert.equal(craftingActor.createdItems.length, 0, 'no result created on async-gate failure');
});
