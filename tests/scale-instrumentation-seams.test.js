/**
 * The instrumentation seams every optimisation in the performance programme proves itself
 * against (issue 1072).
 *
 * This file tests the SEAMS; `tests/scale-regression-guards.test.js` tests the guards built
 * on them. The split matters because a guard that stops measuring is indistinguishable from
 * a guard that passes, so the machinery underneath it needs its own non-vacuity coverage.
 *
 * Three seams needed real work — the rest of the codebase is already constructor-injected
 * and needed none:
 *
 *  1. `RecipeManager` read `game.fabricate?.getCraftingSystemManager?.()` inline at twelve
 *     sites including `_validateSignatures`, so the alchemy signature path — the one the
 *     quadratic `validateSystem` lives on — could only be instrumented by installing a
 *     global shim.
 *  2. `CraftingSystemManager` did not implement `getRecipesForSystem` /
 *     `getComponentsForSystem`, the contract `SignatureValidator` has always documented.
 *     Seven call sites hand-rolled adapter closures instead, so there was no runtime method
 *     to attach a counter to.
 *  3. The ingredient solver computed `{nodes, capHit}` and threw them away, which made both
 *     this issue's and #1083's ingredient bounds unfalsifiable.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import {
  makeCraftingSystem,
  makeSystemManager,
  makeSignatureRecipe,
} from './helpers/scale/scaleGuardFixtures.js';
import {
  countingFacade,
  countingSettings,
  createOperationCounters,
  atMostLinear,
} from './helpers/scale/scaleProbes.js';

installFoundryEnv();

const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { SETTING_KEYS } = await import('../src/config/settings.js');

// ---------------------------------------------------------------------------
// Seam 3 — solver search statistics
// ---------------------------------------------------------------------------

function ingredientSet(componentIds) {
  return new IngredientSet({
    id: 'set-stats',
    ingredientGroups: componentIds.map((componentId, index) => ({
      id: `g-${index}`,
      options: [{ match: { type: 'component', componentId }, quantity: 1 }],
    })),
  });
}

const heldItem = (id, componentId) => ({
  id,
  uuid: `Item.${id}`,
  name: id,
  flags: { fabricate: { componentId } },
  system: { quantity: 1 },
});

/**
 * The solver calls `matcher(option, item)` — option FIRST. Getting that order wrong makes
 * every option fail to match, which still produces a valid-looking unsatisfiable result, so
 * the tests below assert `success` explicitly rather than trusting the fixture.
 */
const matchHeldComponent = (option, item) =>
  item?.flags?.fabricate?.componentId === option?.match?.componentId;

describe('issue 1072 — the ingredient solver reports its own search cost', () => {
  // `nodes` is the only deterministic measure of assignment work. The node CAP bounds
  // nodes, not work: each node copies and restores the whole available-item ledger, so
  // per-node cost is O(inventory) and a wall-clock reading is a product of two terms it
  // cannot separate. Discarding this number left #1083's bounds unfalsifiable.
  it('surfaces searchStats on a satisfied selection', () => {
    const set = ingredientSet(['c-0', 'c-1']);
    const matcher = matchHeldComponent;
    const result = set.resolveIngredientSelection(
      [heldItem('i0', 'c-0'), heldItem('i1', 'c-1')],
      matcher
    );

    assert.equal(result.success, true, 'fixture must be satisfiable');
    assert.ok(result.searchStats, 'a satisfied resolve must report its search cost');
    assert.equal(result.searchStats.capHit, false);
    assert.ok(
      Number.isInteger(result.searchStats.nodes) && result.searchStats.nodes > 0,
      `nodes must be a positive integer, got ${result.searchStats.nodes}`
    );
  });

  it('surfaces searchStats on the greedy fallback taken when no assignment exists', () => {
    // Nothing held matches, so the search proves unsatisfiability and falls through to the
    // greedy pass. Both exits must carry the statistic or a caller has to branch on which
    // one produced the result — and the UNSATISFIABLE case is the expensive one worth
    // measuring, because it is the branch that explores the whole space before giving up.
    const set = ingredientSet(['c-0', 'c-1']);
    const matcher = matchHeldComponent;
    const result = set.resolveIngredientSelection([heldItem('i0', 'c-9')], matcher);

    assert.equal(result.success, false, 'fixture must be unsatisfiable');
    assert.ok(result.searchStats, 'the greedy fallback must report the search cost too');
    assert.ok(
      Number.isInteger(result.searchStats.nodes) && result.searchStats.nodes > 0,
      `nodes must be a positive integer, got ${result.searchStats.nodes}`
    );
  });

  it('reports a node count that actually tracks the size of the search', () => {
    // Non-vacuity: a statistic that reports the same number for a one-group and a
    // three-group set would be a constant wearing a counter's name.
    const matcher = matchHeldComponent;
    const items = [heldItem('i0', 'c-0'), heldItem('i1', 'c-1'), heldItem('i2', 'c-2')];
    const small = ingredientSet(['c-0']).resolveIngredientSelection(items, matcher);
    const large = ingredientSet(['c-0', 'c-1', 'c-2']).resolveIngredientSelection(items, matcher);

    assert.ok(
      large.searchStats.nodes > small.searchStats.nodes,
      `a larger set must explore more nodes: ${small.searchStats.nodes} -> ${large.searchStats.nodes}`
    );
  });
});

// ---------------------------------------------------------------------------
// Seam 2 — the accessors SignatureValidator duck-typed
// ---------------------------------------------------------------------------

describe('issue 1072 — CraftingSystemManager implements the SignatureValidator contract', () => {
  async function managerWithSystem() {
    const { settings } = installFoundryEnv();
    const system = makeCraftingSystem({ componentCount: 3, resolutionMode: 'alchemy' });
    settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [system]);
    settings.set(SETTING_KEYS.RECIPES, [
      { id: 'r-0', name: 'R0', craftingSystemId: system.id, enabled: true },
    ]);
    const recipeManager = new RecipeManager({});
    await recipeManager.initialize();
    const systemManager = new CraftingSystemManager(recipeManager);
    await systemManager.initialize();
    return { systemManager, system };
  }

  it('returns the components of a system', async () => {
    const { systemManager, system } = await managerWithSystem();
    assert.deepEqual(
      systemManager.getComponentsForSystem(system.id).map((c) => c.id),
      ['c-0', 'c-1', 'c-2']
    );
    assert.deepEqual(systemManager.getComponentsForSystem('nope'), []);
  });

  it('returns the recipes of a system, unfiltered by enablement', async () => {
    // Unfiltered on purpose: the validator scopes its own scan to enabled recipes, so an
    // accessor that pre-filtered would give two places that decide what "the recipes of a
    // system" means.
    const { systemManager, system } = await managerWithSystem();
    assert.deepEqual(
      systemManager.getRecipesForSystem(system.id).map((r) => r.id),
      ['r-0']
    );
    assert.deepEqual(systemManager.getRecipesForSystem(''), []);
  });
});

// ---------------------------------------------------------------------------
// Seam 1 — RecipeManager's injected system-manager collaborator
// ---------------------------------------------------------------------------

describe('issue 1072 — RecipeManager reaches its system manager through the constructor', () => {
  /**
   * Install a `game.fabricate` whose accessor EXPLODES. Any RecipeManager path still
   * reading the global fails loudly instead of quietly resolving the right system by the
   * wrong route — which is what "injected consistently" has to mean to be worth asserting.
   */
  function hostileGlobalEnv() {
    installFoundryEnv();
    globalThis.game.fabricate = {
      getCraftingSystemManager: () => {
        throw new Error('RecipeManager consulted the game.fabricate global');
      },
    };
  }

  it('resolves system features without touching the global accessor', () => {
    hostileGlobalEnv();
    const system = makeCraftingSystem({ componentCount: 2 });
    const manager = new RecipeManager({
      getCraftingSystemManager: () => makeSystemManager(system),
    });

    const result = manager.evaluateCraftability(
      [{ id: 'a', items: [] }],
      { craftingSystemId: system.id, ingredientSets: [{ id: 's' }] },
      {}
    );
    assert.ok(result, 'evaluateCraftability must complete through the injected manager');
  });

  it('validates alchemy signatures through the injected manager, not the global', () => {
    // `_validateSignatures` is the specific path the signature-audit work has to
    // instrument, and it was the site that made a global shim mandatory.
    hostileGlobalEnv();
    const system = makeCraftingSystem({ componentCount: 2, resolutionMode: 'alchemy' });
    const manager = new RecipeManager({
      getCraftingSystemManager: () => makeSystemManager(system, () => [...manager.recipes.values()]),
    });

    // The realistic enable transition: the candidate is STORED and still disabled, its
    // collider is stored and enabled. `_validateSignatures` substitutes the candidate at
    // its target state so the scan sees the collision the enable would create — a
    // candidate that is not in the store is simply absent from the scan and would make
    // this assertion pass for the wrong reason.
    const candidate = makeSignatureRecipe({
      id: 'r-candidate',
      componentId: 'c-0',
      enabled: false,
    });
    const collider = makeSignatureRecipe({ id: 'r-collider', componentId: 'c-0' });
    manager.recipes.set(candidate.id, candidate);
    manager.recipes.set(collider.id, collider);

    const verdict = manager.canActivateRecipe(candidate.id);
    assert.equal(
      verdict.valid,
      false,
      'two enabled sets naming the same component are inseparable and must block activation'
    );
    assert.ok(
      verdict.errors.some((message) => message.includes('Overlapping signatures')),
      `expected a signature collision, got: ${JSON.stringify(verdict.errors)}`
    );
  });

  it('still falls back to the global when nothing is injected', () => {
    // The seam must not become mandatory: dozens of call sites construct
    // `new RecipeManager({})` and rely on the `game.fabricate` default.
    const system = makeCraftingSystem({ componentCount: 2 });
    installFoundryEnv({ craftingSystemManager: makeSystemManager(system) });
    const manager = new RecipeManager({});

    const result = manager.evaluateCraftability(
      [{ id: 'a', items: [] }],
      { craftingSystemId: system.id, ingredientSets: [{ id: 's' }] },
      {}
    );
    assert.ok(result, 'the un-injected default path must still resolve');
  });
});

// ---------------------------------------------------------------------------
// The probes themselves
// ---------------------------------------------------------------------------

describe('issue 1072 — the probes cannot report a vacuous zero', () => {
  it('counts calls through a facade without mutating the wrapped object', () => {
    const counters = createOperationCounters();
    const system = makeCraftingSystem({ componentCount: 2 });
    const real = makeSystemManager(system);
    const originalGetSystem = real.getSystem;

    const probed = countingFacade(real, counters, { prefix: 'csm', methods: ['getSystem'] });
    probed.getSystem(system.id);
    probed.getSystem(system.id);

    assert.equal(counters.get('csmGetSystem'), 2);
    assert.equal(real.getSystem, originalGetSystem, 'the wrapped object must be untouched');
    assert.equal(
      counters.get('csmGetSystem'),
      2,
      'calling the real object directly must not bump the probe'
    );
    real.getSystem(system.id);
    assert.equal(counters.get('csmGetSystem'), 2);
  });

  it('delegates un-counted methods to the real object', () => {
    const counters = createOperationCounters();
    const system = makeCraftingSystem({ componentCount: 4 });
    const probed = countingFacade(makeSystemManager(system), counters, {
      prefix: 'csm',
      methods: ['getSystem'],
    });
    assert.equal(probed.getComponentsForSystem(system.id).length, 4);
  });

  it('throws when asked to count a method that does not exist', () => {
    // The failure this repository keeps re-learning: a counter that cannot go up reports a
    // green baseline forever. A renamed or misspelled method has to fail at wrap time.
    const counters = createOperationCounters();
    assert.throws(
      () =>
        countingFacade(makeSystemManager(makeCraftingSystem()), counters, {
          prefix: 'csm',
          methods: ['getRecipesForSystemm'],
        }),
      /could never go up/
    );
  });

  it('counts persistence in bytes, which a call counter cannot see', async () => {
    const counters = createOperationCounters();
    const store = countingSettings(counters);

    await store.set('fabricate', SETTING_KEYS.RECIPES, [{ id: 'r-0' }]);
    const afterSmall = counters.get('settingBytesRecipes');
    await store.set('fabricate', SETTING_KEYS.RECIPES, [{ id: 'r-0' }, { id: 'r-1' }]);
    const afterLarge = counters.get('settingBytesRecipes');

    assert.equal(counters.get('settingWritesRecipes'), 2, 'two writes');
    assert.ok(
      afterLarge - afterSmall > afterSmall,
      `a bigger payload must cost more bytes: first ${afterSmall}, second ${afterLarge - afterSmall}`
    );
  });

  it('reports a superlinear growth violation rather than silently passing', () => {
    // `atMostLinear` is the shape every scaling guard uses, so it needs its own negative
    // control: a helper that returns `ok: true` unconditionally would make every guard in
    // the sibling file vacuous at once.
    assert.equal(atMostLinear({ baseline: 10, scaled: 20, factor: 2, axis: 'x', what: 'y' }).ok, true);
    assert.equal(atMostLinear({ baseline: 10, scaled: 21, factor: 2, axis: 'x', what: 'y' }).ok, false);
    assert.match(
      atMostLinear({ baseline: 10, scaled: 40, factor: 2, axis: 'items', what: 'scans' }).message,
      /grew faster than linearly in items/
    );
  });
});
