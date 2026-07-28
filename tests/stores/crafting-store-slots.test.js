/**
 * craftingStore — requirement rail + shared essence pool (issue 917).
 *
 * These claims live in the store, not in a mounted component: the rail's open-slot
 * re-validation, the scope key composition and the re-evaluate guard are all
 * derives over store state, and a mounted test can only prove
 * presentation-given-props. The suite is deliberately separate from
 * `crafting-store.test.js` — it needs a much narrower services fake (one
 * `evaluateSelectedSet` spy and one `craftRecipe` recorder) and copying that file's
 * broad fake would add duplicated lines for no reach.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import { ESSENCE_POOL_SLOT_ID } from '../../src/ui/svelte/util/requirementSlots.js';

let compiler;
let createCraftingStore;

const CARRIER = 'Item.dusk-1';

function essenceCraftability(overrides = {}) {
  return {
    canCraft: false,
    marker: 'baked',
    ingredientStates: [
      {
        groupId: 'g-radiant',
        name: 'Radiant',
        isEssence: true,
        icon: 'fas fa-sun',
        need: 4,
        delivered: 0,
        owned: 6,
        satisfied: false,
      },
      {
        groupId: 'g-herb',
        name: 'Red Herb',
        need: 1,
        have: 0,
        satisfied: false,
        hasChoice: true,
        choiceCount: 2,
      },
    ],
    ingredientChoices: [
      {
        kind: 'option',
        groupId: 'g-herb',
        options: [
          { optionIndex: 0, have: 0, satisfied: false },
          { optionIndex: 1, have: 4, satisfied: true },
        ],
      },
    ],
    essencePool: {
      scopeKey: 'set-a',
      requirements: [{ groupId: 'g-radiant', essenceId: 'radiant', need: 4, delivered: 0 }],
      carriers: [{ itemKey: CARRIER, name: 'Duskcrystal', ownedUnits: 3, allocatedUnits: 0, perUnit: { radiant: 2 } }],
      allocation: {},
      totals: {},
      suggested: { [CARRIER]: 2 },
    },
    ...overrides,
  };
}

function poolRecipe(overrides = {}) {
  return {
    id: 'r1',
    name: 'Sunblade',
    ingredientSets: [
      { id: 'set-a', craftability: essenceCraftability() },
      { id: 'set-b', craftability: essenceCraftability({ marker: 'baked-b' }) },
    ],
    defaultSetId: 'set-a',
    activeStepId: 'step-1',
    displayedStepId: 'step-1',
    activeStepTimeGateArmed: false,
    ...overrides,
  };
}

function makeServices({ recipes = [poolRecipe()], recomputed = null } = {}) {
  const calls = { evaluateSelectedSet: [], craftRecipe: [] };
  const services = {
    listCraftingForActor: async () => ({ recipes }),
    evaluateSelectedSet: (options) => {
      calls.evaluateSelectedSet.push(options);
      return recomputed;
    },
    craftRecipe: async (options) => {
      calls.craftRecipe.push(options);
      return { success: true, results: [] };
    },
    notify: () => {},
    craftErrorMessage: () => 'failed',
    getSelectedCraftingActorId: () => 'hero',
    getCraftingComponentSourceIds: () => ['hero'],
    getFavouriteRecipeIds: () => [],
  };
  return { services, calls };
}

async function loadedStore(overrides = {}) {
  const { services, calls } = makeServices(overrides);
  const store = createCraftingStore({ services });
  await store.load();
  store.select('r1');
  flushSync();
  return { store, calls };
}

describe('craftingStore requirement rail and essence pool', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-crafting-slots-');
    compiler.copyPlain('src/ui/svelte/util/shoppingListAggregator.js');
    compiler.copyPlain('src/utils/progressiveResultOrder.js');
    compiler.copyPlain('src/utils/progressiveStageThresholds.js');
    compiler.copyPlain('src/ui/svelte/util/requirementSlots.js');
    ({ createCraftingStore } = await compiler.load('src/ui/svelte/stores/craftingStore.svelte.js'));
  });

  after(() => compiler.cleanup());

  it('composes the pool scope key from the set id and the ACTIVE step id', async () => {
    const { store } = await loadedStore();
    assert.equal(store.essenceScopeKey, 'set-a::step-1');
  });

  it('keeps the bare set id as the scope key for a recipe with no step position', async () => {
    const { store } = await loadedStore({ recipes: [poolRecipe({ activeStepId: null })] });
    assert.equal(store.essenceScopeKey, 'set-a');
  });

  // THE GUARD. Gating the re-evaluate on option overrides alone means a stepper-only
  // change never re-runs the resolver: every pool bar would freeze at the baked
  // suggestion while the craft consumed something else — green, and completely dead.
  it('re-evaluates the set after a stepper change with NO option override', async () => {
    const { store, calls } = await loadedStore({
      recomputed: { marker: 'recomputed', ingredientStates: [], essencePool: null },
    });
    assert.equal(calls.evaluateSelectedSet.length, 0, 'nothing re-evaluated yet');

    store.setEssenceAllocation(CARRIER, 2);
    flushSync();
    // Reading the derive is what runs it; assert on the value AND the spy.
    assert.equal(store.selectedCraftability.marker, 'recomputed');
    assert.equal(calls.evaluateSelectedSet.length, 1, 'the allocation alone re-evaluated the set');
    assert.deepEqual(calls.evaluateSelectedSet.at(-1), {
      recipeId: 'r1',
      setId: 'set-a',
      optionOverrides: {},
      essenceAllocation: { [CARRIER]: 2 },
      stepId: 'step-1',
      actorId: 'hero',
      componentSourceActorIds: ['hero'],
    });
  });

  it('clears an allocation entry at zero rather than storing a no-op', async () => {
    const { store } = await loadedStore();
    store.setEssenceAllocation(CARRIER, 2);
    flushSync();
    assert.deepEqual(store.selectedEssenceAllocation['set-a::step-1'], { [CARRIER]: 2 });

    store.setEssenceAllocation(CARRIER, 0);
    flushSync();
    assert.deepEqual(store.selectedEssenceAllocation['set-a::step-1'], {});
    assert.equal(store.selectedCraftability.marker, 'baked', 'and the derive falls back to baked');
  });

  it('keeps a stale allocation key verbatim instead of resolving or dropping it', async () => {
    // A carrier the player spent or deleted between renders. The store must not try to
    // look the id up (the payload is an index into the resolver's own ledger, never a
    // uuid to resolve) and must not silently top the shortfall up from elsewhere: the
    // model clamps an absent key to zero, and the tiles then say so.
    const { store, calls } = await loadedStore();
    store.setEssenceAllocation('Item.deleted', 5);
    flushSync();
    void store.selectedCraftability;
    assert.deepEqual(calls.evaluateSelectedSet.at(-1).essenceAllocation, { 'Item.deleted': 5 });
  });

  it('drops the allocation and the open chooser when the ingredient set changes', async () => {
    const { store } = await loadedStore();
    store.setEssenceAllocation(CARRIER, 2);
    store.openSlot('g-herb');
    flushSync();

    store.chooseIngredientSet('set-b');
    flushSync();
    assert.deepEqual(store.selectedEssenceAllocation, {});
    assert.equal(store.selectedCraftability.marker, 'baked-b');
  });

  it('drops the allocation and the open chooser when the recipe changes', async () => {
    const { store } = await loadedStore();
    store.setEssenceAllocation(CARRIER, 2);
    flushSync();

    store.select('r1');
    flushSync();
    assert.deepEqual(store.selectedEssenceAllocation, {});
    assert.equal(store.slotAnnouncement, '');
  });

  it('auto-advances to the first unsatisfied slot until the player opens one', async () => {
    const { store } = await loadedStore();
    assert.equal(store.openSlotId, ESSENCE_POOL_SLOT_ID, 'the first unsatisfied slot is open');

    store.openSlot('g-herb');
    flushSync();
    assert.equal(store.openSlotId, 'g-herb', "the player's choice sticks");
  });

  // Re-validated on READ: after a set change the remembered key names a slot in a
  // scope that no longer exists, so it must not win.
  it('re-validates the remembered chooser against the live scope', async () => {
    const { store } = await loadedStore();
    store.openSlot('g-herb');
    flushSync();
    assert.equal(store.openSlotId, 'g-herb');

    store.chooseIngredientSet('set-b');
    flushSync();
    assert.equal(store.openSlotId, ESSENCE_POOL_SLOT_ID, 'back to the first unsatisfied slot');
  });

  it('closes the chooser on a nullish slot id', async () => {
    const { store } = await loadedStore();
    store.openSlot(null);
    flushSync();
    assert.equal(store.openSlotId, ESSENCE_POOL_SLOT_ID, 'and the rail re-derives its default');
  });

  it('pickForMe adopts the resolver suggestion and the most-held choice option', async () => {
    const { store } = await loadedStore();
    store.pickForMe('Picked for you.');
    flushSync();

    assert.deepEqual(store.selectedEssenceAllocation['set-a::step-1'], { [CARRIER]: 2 });
    assert.deepEqual(store.selectedIngredientOptions, {
      'g-herb': { optionIndex: 1, heldItemId: null },
    });
    assert.equal(store.slotAnnouncement, 'Picked for you.');
  });

  it('pickForMe on an infeasible inventory suggests what it can and reports the shortfall', async () => {
    const infeasible = essenceCraftability({
      ingredientStates: [
        {
          groupId: 'g-radiant',
          name: 'Radiant',
          isEssence: true,
          need: 4,
          delivered: 2,
          owned: 2,
          satisfied: false,
        },
      ],
      ingredientChoices: [],
      essencePool: {
        scopeKey: 'set-a',
        requirements: [{ groupId: 'g-radiant', essenceId: 'radiant', need: 4, delivered: 2 }],
        carriers: [{ itemKey: CARRIER, name: 'Duskcrystal', ownedUnits: 1, allocatedUnits: 1, perUnit: { radiant: 2 } }],
        allocation: { [CARRIER]: 1 },
        totals: { radiant: 2 },
        suggested: { [CARRIER]: 1 },
      },
    });
    const { store } = await loadedStore({
      recipes: [poolRecipe({ ingredientSets: [{ id: 'set-a', craftability: infeasible }] })],
    });

    store.pickForMe('Picked for you.');
    flushSync();
    assert.deepEqual(store.selectedEssenceAllocation['set-a::step-1'], { [CARRIER]: 1 });
    const [radiant] = store.railSlots;
    assert.equal(radiant.state, 'partial', 'the shortfall stays visible on the tile');
  });

  it('sends the allocation scoped to the active step and set on craft', async () => {
    const { store, calls } = await loadedStore();
    store.setEssenceAllocation(CARRIER, 2);
    flushSync();

    await store.craft(store.selectedRecipe);
    assert.deepEqual(calls.craftRecipe.at(-1).ingredientEssenceAllocation, {
      stepId: 'step-1',
      ingredientSetId: 'set-a',
      allocation: { [CARRIER]: 2 },
    });
  });

  it('sends no allocation payload at all when the player allocated nothing', async () => {
    const { store, calls } = await loadedStore();
    await store.craft(store.selectedRecipe);
    assert.equal(calls.craftRecipe.at(-1).ingredientEssenceAllocation, null);
  });
});
