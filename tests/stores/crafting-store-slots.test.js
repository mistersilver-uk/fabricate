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
const RADIANT_NEED = 4;
const RADIANT_PER_UNIT = 2;
const OWNED_UNITS = 3;
const SUGGESTED_UNITS = 2;
// The engine's own wording for a craft blocked by a short player allocation
// (`CraftingEngine._allocationShortfallMessage`).
const MISSING_MATERIALS = 'Missing required items';

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
        need: RADIANT_NEED,
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
      requirements: [
        { groupId: 'g-radiant', essenceId: 'radiant', need: RADIANT_NEED, delivered: 0 },
      ],
      carriers: [
        {
          itemKey: CARRIER,
          name: 'Duskcrystal',
          ownedUnits: OWNED_UNITS,
          allocatedUnits: 0,
          perUnit: { radiant: RADIANT_PER_UNIT },
        },
      ],
      allocation: {},
      totals: {},
      suggested: { [CARRIER]: SUGGESTED_UNITS },
    },
    ...overrides,
  };
}

function deliveredRadiant(allocation) {
  return Object.values(allocation ?? {}).reduce(
    (total, units) => total + Number(units) * RADIANT_PER_UNIT,
    0
  );
}

/**
 * The resolver's answer FOR A GIVEN ALLOCATION, so the rail's numbers are driven by
 * the payload the store actually sent rather than by a constant a dead store could
 * never contradict. It reproduces the two upstream rules this suite leans on: an
 * EMPTY allocation is honoured as empty (`IngredientSet._resolveEssenceBlock` clamps
 * `{}` instead of falling back to its greedy suggestion), and a short allocation is
 * never topped up from unallocated carriers.
 */
function evaluateForAllocation({ essenceAllocation }) {
  const allocation = essenceAllocation ?? {};
  const delivered = Math.min(RADIANT_NEED, deliveredRadiant(allocation));
  const satisfied = delivered >= RADIANT_NEED;
  return essenceCraftability({
    canCraft: satisfied,
    marker: 'recomputed',
    ingredientStates: [
      {
        groupId: 'g-radiant',
        name: 'Radiant',
        isEssence: true,
        need: RADIANT_NEED,
        delivered,
        owned: OWNED_UNITS,
        satisfied,
      },
    ],
    ingredientChoices: [],
    essencePool: {
      scopeKey: 'set-a',
      requirements: [
        { groupId: 'g-radiant', essenceId: 'radiant', need: RADIANT_NEED, delivered },
      ],
      carriers: [
        {
          itemKey: CARRIER,
          name: 'Duskcrystal',
          ownedUnits: OWNED_UNITS,
          allocatedUnits: Number(allocation[CARRIER] ?? 0),
          perUnit: { radiant: RADIANT_PER_UNIT },
        },
      ],
      allocation: { ...allocation },
      totals: { radiant: delivered },
      suggested: { [CARRIER]: SUGGESTED_UNITS },
    },
  });
}

/**
 * The engine's outcome for a craft carrying a player allocation: it is honoured and
 * never topped up, so a short one comes back blocked with the missing-materials
 * reason rather than quietly drawing a full greedy allocation. A craft carrying NO
 * payload lets the engine allocate for itself and succeeds.
 */
function craftOutcome(options) {
  const payload = options?.ingredientEssenceAllocation ?? null;
  if (payload && deliveredRadiant(payload.allocation) < RADIANT_NEED) {
    return { success: false, results: null, message: MISSING_MATERIALS };
  }
  return { success: true, results: [] };
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
      return typeof recomputed === 'function' ? recomputed(options) : recomputed;
    },
    craftRecipe: async (options) => {
      calls.craftRecipe.push(options);
      return craftOutcome(options);
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

/**
 * A store whose pool the player has EXPLICITLY emptied: "pick for me" adopts the
 * resolver's suggestion (an edit — they asked for it), then the one allocated carrier
 * is stepped back to zero. The craftability is read so the derive has actually run.
 */
async function emptiedStore(overrides = {}) {
  const { store, calls } = await loadedStore({ recomputed: evaluateForAllocation, ...overrides });
  store.pickForMe('Picked for you.');
  flushSync();
  store.setEssenceAllocation(CARRIER, 0);
  flushSync();
  assert.equal(store.selectedCraftability.canCraft, false);
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

  // "I cleared every carrier" and "I never touched this" are DIFFERENT intents. The
  // zeroed carrier's entry is still deleted (no no-op stored), but the SCOPE's entry
  // remains, so the emptied pool re-evaluates as empty. Sizing the map instead read
  // `{}` as "no allocation at all" and snapped every bar back to the greedy
  // suggestion the player had just cleared — the pool's own value going nowhere.
  it('clears an allocation entry at zero and keeps the emptied pool EMPTY', async () => {
    const { store, calls } = await loadedStore({ recomputed: evaluateForAllocation });
    store.setEssenceAllocation(CARRIER, SUGGESTED_UNITS);
    flushSync();
    assert.deepEqual(store.selectedEssenceAllocation['set-a::step-1'], {
      [CARRIER]: SUGGESTED_UNITS,
    });

    store.setEssenceAllocation(CARRIER, 0);
    flushSync();
    assert.deepEqual(store.selectedEssenceAllocation['set-a::step-1'], {}, 'the entry is deleted');
    assert.equal(store.selectedCraftability.marker, 'recomputed', 'the emptied pool re-evaluates');
    assert.deepEqual(
      calls.evaluateSelectedSet.at(-1).essenceAllocation,
      {},
      'and it re-evaluates against an EMPTY allocation, not the suggestion'
    );
    const [radiant] = store.railSlots;
    assert.equal(radiant.have, 0, 'the bar shows the emptied selection');
    assert.equal(radiant.state, 'short');
    assert.equal(store.selectedCraftability.canCraft, false, 'so the Craft button blocks');
  });

  it('sends an emptied pool as an empty allocation and the craft is blocked', async () => {
    const { store, calls } = await emptiedStore();

    const result = await store.craft(store.selectedRecipe);
    assert.deepEqual(calls.craftRecipe.at(-1).ingredientEssenceAllocation, {
      stepId: 'step-1',
      ingredientSetId: 'set-a',
      allocation: {},
    });
    assert.equal(result.success, false, 'a short allocation is honoured, never topped up');
    assert.equal(result.message, MISSING_MATERIALS);
  });

  it('returns to a normal allocation when a zeroed carrier is raised again', async () => {
    const { store, calls } = await emptiedStore();

    store.setEssenceAllocation(CARRIER, SUGGESTED_UNITS);
    flushSync();
    assert.equal(store.selectedCraftability.canCraft, true, 'the requirement is funded again');

    const result = await store.craft(store.selectedRecipe);
    assert.deepEqual(calls.craftRecipe.at(-1).ingredientEssenceAllocation.allocation, {
      [CARRIER]: SUGGESTED_UNITS,
    });
    assert.equal(result.success, true);
  });

  // Round-tripping BACK to set-a is what makes this a reset probe rather than a
  // restatement of the scope key: set-b has a key of its own, so only the reset can
  // stop the emptied set-a pool re-appearing when the player returns to it.
  it('drops the emptied pool when the ingredient set changes', async () => {
    const { store, calls } = await emptiedStore();

    store.chooseIngredientSet('set-b');
    flushSync();
    assert.equal(store.selectedCraftability.marker, 'baked-b', 'set-b defers to its suggestion');

    store.chooseIngredientSet('set-a');
    flushSync();
    assert.deepEqual(store.selectedEssenceAllocation, {}, 'set-a is funded from scratch again');

    await store.craft(store.selectedRecipe);
    assert.equal(
      calls.craftRecipe.at(-1).ingredientEssenceAllocation,
      null,
      'and the craft carries no allocation'
    );
  });

  it('drops the emptied pool when the recipe changes', async () => {
    const { store, calls } = await emptiedStore();

    store.select('r1');
    flushSync();
    assert.equal(store.selectedCraftability.marker, 'baked', 'back to the baked suggestion');

    await store.craft(store.selectedRecipe);
    assert.equal(calls.craftRecipe.at(-1).ingredientEssenceAllocation, null);
  });

  // The step id is half the scope key, so an advancing run leaves the emptied pool
  // behind with the step it belonged to. A marker that followed the player into the
  // next step would silently un-fund a step they had never touched.
  it('does not carry the emptied pool into the next STEP', async () => {
    const recipes = [poolRecipe()];
    const { store, calls } = await emptiedStore({ recipes });

    recipes[0] = poolRecipe({ activeStepId: 'step-2' });
    await store.load(true);
    flushSync();

    assert.equal(store.essenceScopeKey, 'set-a::step-2');
    // The choice override survives the step (it is group-keyed), so the set still
    // re-evaluates — but with NO allocation, which is what "step 2 is untouched" means.
    void store.selectedCraftability;
    assert.equal(
      calls.evaluateSelectedSet.at(-1).essenceAllocation,
      null,
      'step 2 defers to the resolver rather than inheriting the emptied pool'
    );
    await store.craft(store.selectedRecipe);
    assert.equal(calls.craftRecipe.at(-1).ingredientEssenceAllocation, null);
    assert.deepEqual(
      store.selectedEssenceAllocation['set-a::step-1'],
      {},
      "and step 1 keeps its own emptied pool for the player's return"
    );
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

  // The counterpart to the emptied-pool claims above: an UNTOUCHED scope defers to the
  // resolver end to end — it never re-evaluates, and the craft carries no payload at
  // all, so the engine allocates its own suggestion exactly as it does today.
  it('sends no allocation payload at all when the player has not touched the pool', async () => {
    const { store, calls } = await loadedStore({ recomputed: evaluateForAllocation });

    assert.equal(store.selectedCraftability.marker, 'baked', 'the baked suggestion stands');
    assert.equal(calls.evaluateSelectedSet.length, 0, 'an untouched pool never re-evaluates');

    const result = await store.craft(store.selectedRecipe);
    assert.equal(calls.craftRecipe.at(-1).ingredientEssenceAllocation, null);
    assert.equal(result.success, true, 'and the engine funds the craft for itself');
  });
});
