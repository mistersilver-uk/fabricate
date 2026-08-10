/**
 * The ENGINE-side gate on the retired `@craftingmod` placeholder (issue 1094).
 *
 * `_runCraftingCheck` asks `resolveActiveCraftingCheckFormula` — the POST-shim selector
 * every GM surface asks — whether the active check can roll, instead of each of its five
 * gates reading its own slot's RAW `rollFormula`. This file exists because that change had
 * NO regression protection: a reviewer mutated the reading back to the pre-shim one
 * (preserving slot resolution and trimming) and the whole suite stayed green, because
 * nothing seeded a placeholder-carrying formula through `_runCraftingCheck`.
 *
 * What the missing gate costs, per mode, and it is not symmetric:
 *
 * - alchemy `simple` — `_runSimpleCheck` is entered, `evaluateCheckRoll` strips the formula
 *   to `''` and reports `engine: false`, and `runFormulaPassFail` turns "no engine" into a
 *   NON-BLOCKING `success: true`. The brew then succeeds UNCONDITIONALLY with its DC
 *   ignored, AND consumes — which is why the alchemy rows are also driven through the real
 *   `craft()` below rather than stopping at the check's return value.
 * - alchemy `tiered`, `routedByCheck`, `progressive` — the `requiresCheck` /
 *   `checkRequired` misconfiguration abort never fires, so the craft rolls nothing and
 *   routes to nothing while still consuming.
 * - `simple` / `routedByIngredients` — the optional pass/fail layer is entered for a check
 *   that cannot roll, instead of being skipped as a check that is simply not there.
 *
 * TWO SHAPES ARE DRIVEN THROUGH EVERY MODE, because they reach `checkUsable: false` by
 * different steps of the shim and a partial gate could catch one and miss the other:
 * `@craftingmod` alone (an ADDITIVE placement that strips to the empty string) and
 * `1d20 * @craftingmod` (a REFUSED placement, left as authored and answered `''`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { recordedFoundryRoll } from './helpers/retiredPlaceholderOracle.js';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

let _idCounter = 0;
globalThis.foundry = { utils: { getProperty, randomID: () => `id-${++_idCounter}` } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.game = {};

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');

/**
 * A dice engine that is PRESENT and answers realistically, so nothing here passes for the
 * uninteresting reason that `globalThis.Roll` was missing: `evaluateCheckRoll`'s very first
 * line reports `engine: false` without one, which is the same non-blocking shape the bug
 * produces. `validate` is the recorded Foundry oracle; `evaluate` rolls a fixed high total,
 * so a check that IS entered passes loudly rather than failing for want of a total.
 */
function installRoll() {
  const validator = recordedFoundryRoll([]);
  globalThis.Roll = class {
    static validate(formula) {
      return validator.validate(formula);
    }
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      return { total: 19, dice: [{ number: 1, faces: 20, total: 19 }] };
    }
  };
}

/** The two authored shapes every mode is driven with. */
const UNUSABLE_FORMULAS = Object.freeze([
  ['additive, strips to empty', '@craftingmod'],
  ['refused, left as authored', '1d20 * @craftingmod'],
]);

const ACTOR = { id: 'a1', name: 'Crafter', items: [], uuid: 'Actor.a1' };
const RECIPE = { craftingSystemId: 'sys-1', name: 'Widget' };

/**
 * Install a system and return the engine plus a record of which check RUNNER was entered.
 * The runners are wrapped rather than replaced, so "was it entered" is observed at the one
 * seam the gate decides, and a runner that IS entered still behaves.
 */
function installSystem(system) {
  const engine = new CraftingEngine({}, null, null);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 },
  };
  const entered = [];
  for (const name of ['_runSimpleCheck', '_runRoutedCheck', '_runProgressiveCheck']) {
    const original = engine[name].bind(engine);
    engine[name] = async (...args) => {
      entered.push(name);
      return original(...args);
    };
  }
  return { engine, entered };
}

function craftingSystem({ resolutionMode, alchemyCheckMode = 'none', slot, rollFormula, features = {} }) {
  const routedTiers = {
    type: 'fixed',
    fixedOutcomes: [
      { id: 't-fail', name: 'Fail', success: false, start: 0, end: 9 },
      { id: 't-fine', name: 'Fine', success: true, start: 10, end: 30 },
    ],
  };
  return {
    id: 'sys-1',
    resolutionMode,
    features,
    alchemy: { checkMode: alchemyCheckMode },
    craftingCheck: {
      enabled: true,
      [slot]: { rollFormula, dc: 15, dcMode: 'static', thresholdMode: 'meet', ...(slot === 'routed' ? routedTiers : {}) },
    },
  };
}

const runCheck = (engine) => engine._runCraftingCheck(RECIPE, ACTOR, [ACTOR], null);

// ── the five gates, per resolution mode ────────────────────────────────────

test('alchemy simple: an unusable formula is a MISCONFIGURATION, never an unconditional pass', async () => {
  installRoll();
  for (const [label, rollFormula] of UNUSABLE_FORMULAS) {
    const { engine, entered } = installSystem(
      craftingSystem({ resolutionMode: 'alchemy', alchemyCheckMode: 'simple', slot: 'simple', rollFormula })
    );
    const result = await runCheck(engine);
    assert.equal(result.success, false, label);
    assert.equal(result.misconfigured, true, `${label}: the GM is told, and craft() aborts with zero mutation`);
    assert.deepEqual(entered, [], `${label}: _runSimpleCheck is never entered, so nothing can pass for want of an engine`);
  }
});

test('alchemy tiered: an unusable routed formula is a MISCONFIGURATION', async () => {
  installRoll();
  for (const [label, rollFormula] of UNUSABLE_FORMULAS) {
    const { engine, entered } = installSystem(
      craftingSystem({ resolutionMode: 'alchemy', alchemyCheckMode: 'tiered', slot: 'routed', rollFormula })
    );
    const result = await runCheck(engine);
    assert.equal(result.success, false, label);
    assert.equal(result.misconfigured, true, label);
    assert.deepEqual(entered, [], `${label}: _runRoutedCheck is never entered`);
  }
});

test('progressive: an unusable formula hits the required-check abort', async () => {
  installRoll();
  for (const [label, rollFormula] of UNUSABLE_FORMULAS) {
    const { engine, entered } = installSystem(
      craftingSystem({ resolutionMode: 'progressive', slot: 'progressive', rollFormula })
    );
    const result = await runCheck(engine);
    assert.equal(result.success, false, label);
    assert.equal(result.misconfigured, true, label);
    assert.match(result.message, /progressive mode requires a configured crafting check roll formula/, label);
    assert.deepEqual(entered, [], `${label}: _runProgressiveCheck is never entered`);
  }
});

test('routedByCheck: an unusable routed formula hits the required-check abort', async () => {
  installRoll();
  for (const [label, rollFormula] of UNUSABLE_FORMULAS) {
    const { engine, entered } = installSystem(
      craftingSystem({ resolutionMode: 'routedByCheck', slot: 'routed', rollFormula })
    );
    const result = await runCheck(engine);
    assert.equal(result.success, false, label);
    assert.equal(result.misconfigured, true, label);
    assert.match(result.message, /routedByCheck mode requires a configured crafting check roll formula/, label);
    assert.deepEqual(entered, [], `${label}: _runRoutedCheck is never entered`);
  }
});

test('simple: an unusable formula is treated as NO check — a no-op success, runner unentered', async () => {
  installRoll();
  for (const [label, rollFormula] of UNUSABLE_FORMULAS) {
    const { engine, entered } = installSystem(
      craftingSystem({
        resolutionMode: 'simple',
        slot: 'simple',
        rollFormula,
        features: { craftingChecks: true },
      })
    );
    const result = await runCheck(engine);
    assert.equal(result.success, true, `${label}: the optional layer is absent, not failed`);
    assert.equal(result.misconfigured, undefined, `${label}: an optional check is never a misconfiguration`);
    assert.deepEqual(entered, [], `${label}: _runSimpleCheck is never entered`);
  }
});

test('routedByIngredients: an unusable shared simple formula is treated as NO check', async () => {
  installRoll();
  for (const [label, rollFormula] of UNUSABLE_FORMULAS) {
    const { engine, entered } = installSystem(
      craftingSystem({ resolutionMode: 'routedByIngredients', slot: 'simple', rollFormula })
    );
    const result = await runCheck(engine);
    assert.equal(result.success, true, label);
    assert.equal(result.misconfigured, undefined, label);
    assert.deepEqual(entered, [], `${label}: _runSimpleCheck is never entered`);
  }
});

// The POSITIVE CONTROL for every assertion above. Without it the `entered` spy could be
// wired to nothing and each `deepEqual(entered, [])` would hold vacuously.
test('the same harness DOES enter each runner on an authored, usable formula', async () => {
  installRoll();
  const cases = [
    ['alchemy', 'simple', 'simple', '_runSimpleCheck', {}],
    ['alchemy', 'tiered', 'routed', '_runRoutedCheck', {}],
    ['progressive', 'none', 'progressive', '_runProgressiveCheck', {}],
    ['routedByCheck', 'none', 'routed', '_runRoutedCheck', {}],
    ['simple', 'none', 'simple', '_runSimpleCheck', { craftingChecks: true }],
    ['routedByIngredients', 'none', 'simple', '_runSimpleCheck', {}],
  ];
  for (const [resolutionMode, alchemyCheckMode, slot, runner, features] of cases) {
    const { engine, entered } = installSystem(
      craftingSystem({ resolutionMode, alchemyCheckMode, slot, rollFormula: '1d20', features })
    );
    await runCheck(engine);
    assert.deepEqual(entered, [runner], `${resolutionMode}/${slot} enters ${runner} when the formula rolls`);
  }
});

// ── zero mutation, proved through the REAL craft() ─────────────────────────
//
// The check's `misconfigured: true` is only half the claim; the other half is what
// `craft()` does with it. These drive the whole pipeline so the ingredient item itself is
// the witness: with the gate, it is never updated or deleted and no tool is broken; without
// it, the alchemy `simple` row succeeds unconditionally AND consumes.

function buildFakeItem(id, quantity = 1) {
  return {
    id,
    uuid: `Item.${id}`,
    name: `Item ${id}`,
    parent: null,
    system: { quantity },
    deleteCalled: false,
    updateCalled: false,
    getFlag() {
      return undefined;
    },
    async setFlag() {},
    async delete() {
      this.deleteCalled = true;
    },
    async update(payload) {
      this.updateCalled = true;
      if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    },
  };
}

function buildFakeIngredientSet(ingredientItem) {
  const ingredient = {
    systemItemId: ingredientItem.id,
    quantity: 1,
    getDescription: () => ingredientItem.name,
  };
  return {
    id: 'set-1',
    matchIngredients(availableItems) {
      const matched = availableItems.find((item) => item === ingredientItem);
      return matched ? [{ item: matched, quantity: 1, ingredient }] : [];
    },
  };
}

async function craftWithUnusableCheck({ alchemyCheckMode, slot, rollFormula }) {
  installRoll();
  const system = craftingSystem({
    resolutionMode: 'alchemy',
    alchemyCheckMode,
    slot,
    rollFormula,
  });
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 },
  };

  const ingredientItem = buildFakeItem('ing-1', 3);
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = {
    id: 'recipe-1',
    name: 'Elixir',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [],
    toolIds: [],
    outcomeRouting: null,
    steps: [],
    transferEffects: false,
    getExecutionSteps: null,
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return { id: this.id, name: this.name };
    },
  };
  const recipeManager = {
    canCraft: () => ({
      canCraft: true,
      satisfiableSet: ingredientSet,
      missing: { ingredients: [], essences: [], tools: [] },
    }),
    getToolsForSet: () => [],
    toolMatchesItem: () => false,
    ingredientMatchesItem: (_recipe, _ingredient, item) => item === ingredientItem,
  };
  const engine = new CraftingEngine(recipeManager, null, null);
  const broke = { value: false };
  engine._applyToolBreakage = async () => {
    broke.value = true;
    return [];
  };

  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] } };
  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  return { result, ingredientItem, broke };
}

for (const [alchemyCheckMode, slot] of [
  ['simple', 'simple'],
  ['tiered', 'routed'],
]) {
  for (const [label, rollFormula] of UNUSABLE_FORMULAS) {
    test(`craft() on alchemy ${alchemyCheckMode} aborts with ZERO mutation (${label})`, async () => {
      const { result, ingredientItem, broke } = await craftWithUnusableCheck({
        alchemyCheckMode,
        slot,
        rollFormula,
      });
      assert.equal(result.success, false, 'an unrollable mandatory check never brews');
      assert.equal(result.results, null);
      assert.match(result.message, /requires a configured/);
      assert.equal(ingredientItem.updateCalled, false, 'no ingredient is consumed');
      assert.equal(ingredientItem.deleteCalled, false, 'no ingredient is deleted');
      assert.equal(ingredientItem.system.quantity, 3, 'the stack is untouched');
      assert.equal(broke.value, false, 'no tool is broken');
    });
  }
}

// The POSITIVE CONTROL for the craft() harness: the same wiring, an authored formula, and
// the pipeline really does get past the check (so the zero-mutation assertions above are
// about the gate and not about a craft() that never runs).
test('the same craft() harness reaches the check on an authored formula', async () => {
  const { result } = await craftWithUnusableCheck({
    alchemyCheckMode: 'simple',
    slot: 'simple',
    rollFormula: '1d20',
  });
  assert.notEqual(
    result.message,
    'alchemy simple check mode requires a configured crafting check roll formula',
    'a rollable formula is not a misconfiguration'
  );
});
