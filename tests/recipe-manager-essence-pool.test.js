/**
 * Issue 917 — `RecipeManager` read side of the shared essence pool.
 *
 * `craftability.essencePool` is what the player's requirement rail renders and edits,
 * so these tests pin the numbers whose meaning changed: `delivered` (the essence
 * amount the resolved allocation supplies a requirement) versus `owned` (the amount
 * held), and `carriers[].ownedUnits` (ITEM units, net of the set's non-essence plan).
 * They also pin the two projections that go silently wrong: the `6/4 ✗` a player under-
 * allocation used to render, and the sibling essence tile whose consumed item is only
 * reachable through the block entry's `essenceGroupIds`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let idCounter = 0;
globalThis.foundry = { utils: { randomID: () => `id-${++idCounter}` } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

/**
 * A held stack whose essences come from an item FLAG, so a test declares carriers
 * without also having to author a managed component library.
 */
function heldItem(id, quantity, essences = {}, extra = {}) {
  const scopes = { fabricate: { fabricate: { essences }, essences } };
  return {
    id,
    uuid: id,
    name: `Held ${id}`,
    system: { quantity },
    getFlag: (scope, key) =>
      String(key)
        .split('.')
        .reduce((value, part) => (value == null ? undefined : value[part]), scopes[scope]),
    ...extra,
  };
}

function essenceGroup(id, essenceId, amount) {
  return { id, options: [{ quantity: 1, match: { type: 'essence', essenceId, amount } }] };
}

function tagGroup(id, tags, quantity = 1) {
  return { id, options: [{ quantity, match: { type: 'tags', tags, tagMatch: 'any' } }] };
}

/**
 * A RecipeManager bound to a one-system stub. `essences` toggles the system feature;
 * `definitions` supplies the essence library the pool resolves names/icons/colours from.
 */
function makeManager({ definitions = [], essences = true, matchTags = null } = {}) {
  const system = {
    id: 'sys-917',
    features: { itemTags: true, essences },
    components: [],
    managedItems: [],
    essenceDefinitions: definitions,
  };
  globalThis.game = {
    user: { isGM: true },
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === 'sys-917' ? system : null) }),
      getResolutionModeService: () => null,
    },
  };
  const manager = new RecipeManager();
  if (matchTags) {
    manager.ingredientMatchesItem = (_recipe, ingredient, item) =>
      ingredient?.match?.type === 'tags' && matchTags.has(item.uuid);
  }
  return manager;
}

function makeRecipe(groups) {
  const set = new IngredientSet({ id: 'set-917', ingredientGroups: groups });
  return new Recipe({
    id: 'recipe-917',
    name: 'Pool Recipe',
    craftingSystemId: 'sys-917',
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-917', results: [] }],
  });
}

function makeActor(items) {
  return { items: [...items] };
}

function evaluate(manager, recipe, items, options = {}) {
  return manager.evaluateCraftability([makeActor(items)], recipe, options);
}

function requirementFor(result, groupId) {
  return result.essencePool.requirements.find((entry) => entry.groupId === groupId);
}

// ---------------------------------------------------------------------------
// Presence and gating.
// ---------------------------------------------------------------------------

test('a set with essence requirements exposes a pool of requirements, carriers and allocation', () => {
  const manager = makeManager({
    definitions: [
      { id: 'radiant', name: 'Radiant', icon: 'fas fa-sun', colorToken: 'butter' },
    ],
  });
  const recipe = makeRecipe([essenceGroup('g-rad', 'radiant', 3)]);

  const result = evaluate(manager, recipe, [heldItem('shard', 4, { radiant: 2 })]);

  assert.equal(result.essencePool.scopeKey, 'set-917');
  assert.deepEqual(requirementFor(result, 'g-rad'), {
    groupId: 'g-rad',
    essenceId: 'radiant',
    name: 'Radiant',
    icon: 'fas fa-sun',
    colorToken: 'butter',
    need: 3,
    delivered: 3,
    owned: 8,
    satisfied: true,
  });
  const carrier = result.essencePool.carriers[0];
  assert.equal(carrier.itemKey, 'shard');
  assert.equal(carrier.ownedUnits, 4, 'ownedUnits counts ITEM units, not essence amount');
  assert.equal(carrier.allocatedUnits, 2, 'two units at 2 radiant each cover a need of 3');
  assert.deepEqual(carrier.perUnit, { radiant: 2 });
  assert.deepEqual(result.essencePool.allocation, { shard: 2 });
  assert.deepEqual(result.essencePool.totals, { radiant: 4 });
});

test('the pool is null when the crafting system has essences disabled', () => {
  const manager = makeManager({
    definitions: [{ id: 'radiant', name: 'Radiant' }],
    essences: false,
  });
  const recipe = makeRecipe([essenceGroup('g-rad', 'radiant', 1)]);

  const result = evaluate(manager, recipe, [heldItem('shard', 4, { radiant: 1 })]);

  assert.equal(result.essencePool, null, 'matching the per-set essence-state projection');
});

test('the pool is null for a set that authors no essence requirement', () => {
  const manager = makeManager({ matchTags: new Set(['ore']) });
  const recipe = makeRecipe([tagGroup('g-tag', ['metal'])]);

  const result = evaluate(manager, recipe, [heldItem('ore', 2)]);

  assert.equal(result.canCraft, true);
  assert.equal(result.essencePool, null);
});

test('an unauthored colour reads null, which every surface renders as the theme accent', () => {
  const manager = makeManager({ definitions: [{ id: 'radiant', name: 'Radiant' }] });
  const recipe = makeRecipe([essenceGroup('g-rad', 'radiant', 1)]);

  const result = evaluate(manager, recipe, [heldItem('shard', 1, { radiant: 1 })]);

  assert.equal(requirementFor(result, 'g-rad').colorToken, null);
});

// ---------------------------------------------------------------------------
// `ownedUnits` is net of the non-essence plan. A raw `system.quantity` read would
// offer the player units the craft cannot spend.
// ---------------------------------------------------------------------------

test('carriers[].ownedUnits is net of the set’s non-essence consumption plan', () => {
  const manager = makeManager({
    definitions: [{ id: 'radiant', name: 'Radiant' }],
    matchTags: new Set(['shard']),
  });
  const recipe = makeRecipe([tagGroup('g-tag', ['gem'], 2), essenceGroup('g-rad', 'radiant', 1)]);

  const result = evaluate(manager, recipe, [heldItem('shard', 5, { radiant: 1 })]);

  assert.equal(result.canCraft, true);
  assert.equal(
    result.essencePool.carriers[0].ownedUnits,
    3,
    'the tag group claimed 2 of the 5 held units before the block saw the ledger'
  );
});

// ---------------------------------------------------------------------------
// The per-essence-id attribution partition, through the read side.
// ---------------------------------------------------------------------------

test('two requirements naming one essence each read their own need, never the id total', () => {
  const manager = makeManager({ definitions: [{ id: 'radiant', name: 'Radiant' }] });
  const recipe = makeRecipe([
    essenceGroup('g-a', 'radiant', 2),
    essenceGroup('g-b', 'radiant', 2),
  ]);

  const result = evaluate(manager, recipe, [heldItem('shard', 4, { radiant: 1 })]);

  assert.equal(result.canCraft, true);
  assert.equal(requirementFor(result, 'g-a').delivered, 2, 'reads 2/2');
  assert.equal(requirementFor(result, 'g-b').delivered, 2, 'reads 2/2, never 4/2');
  const tiles = result.ingredientStates.filter((state) => state.isEssence === true);
  assert.deepEqual(
    tiles.map((tile) => `${tile.delivered}/${tile.need}`),
    ['2/2', '2/2'],
    'the tiles report the same partition as the pool'
  );
});

test('a satisfied essence tile reports what the plan draws, not the whole inventory', () => {
  // The shipped defect: `have` came from accumulating essences over EVERY held item,
  // so a tile whose plan draws 4 rendered `6/4`.
  const manager = makeManager({ definitions: [{ id: 'radiant', name: 'Radiant' }] });
  const recipe = makeRecipe([essenceGroup('g-rad', 'radiant', 4)]);

  const result = evaluate(manager, recipe, [heldItem('shard', 6, { radiant: 1 })]);

  const tile = result.ingredientStates.find((state) => state.groupId === 'g-rad');
  assert.equal(tile.delivered, 4, 'reads 4/4');
  assert.equal(tile.owned, 6, 'the six held are reported separately as `owned`');
  assert.equal(tile.satisfied, true);
});

test('a player under-allocation reports the DELIVERED amount, never the ledger total', () => {
  // Allocating 2 of a needed 4 while holding 6 used to render `6/4` with a failure
  // mark, because the missing entry carried the whole ledger's total.
  const manager = makeManager({ definitions: [{ id: 'radiant', name: 'Radiant' }] });
  const recipe = makeRecipe([essenceGroup('g-rad', 'radiant', 4)]);

  const result = evaluate(manager, recipe, [heldItem('shard', 6, { radiant: 1 })], {
    essenceAllocation: { shard: 2 },
  });

  assert.equal(result.canCraft, false);
  const tile = result.ingredientStates.find((state) => state.groupId === 'g-rad');
  assert.equal(tile.delivered, 2, 'never 6');
  assert.equal(tile.need, 4);
  assert.equal(tile.satisfied, false);
  assert.equal(requirementFor(result, 'g-rad').delivered, 2);
});

test('a short essence requirement never marks a fully delivered sibling missing', () => {
  const manager = makeManager({
    definitions: [
      { id: 'radiant', name: 'Radiant' },
      { id: 'shadow', name: 'Shadow' },
    ],
  });
  const recipe = makeRecipe([
    essenceGroup('g-rad', 'radiant', 2),
    essenceGroup('g-sha', 'shadow', 1),
  ]);

  const result = evaluate(manager, recipe, [heldItem('dusk', 1, { radiant: 1, shadow: 1 })]);

  assert.equal(result.canCraft, false);
  assert.equal(requirementFor(result, 'g-rad').satisfied, false);
  assert.equal(requirementFor(result, 'g-sha').satisfied, true);
  const shadowTile = result.ingredientStates.find((state) => state.groupId === 'g-sha');
  assert.equal(shadowTile.satisfied, true, 'a delivered requirement is not dragged down');
});

// ---------------------------------------------------------------------------
// Threading and attribution.
// ---------------------------------------------------------------------------

test('a threaded allocation steers which held stack the plan spends', () => {
  const manager = makeManager({ definitions: [{ id: 'radiant', name: 'Radiant' }] });
  const recipe = makeRecipe([essenceGroup('g-rad', 'radiant', 2)]);
  const items = [heldItem('cheap', 4, { radiant: 1 }), heldItem('rich', 4, { radiant: 2 })];

  const suggested = evaluate(manager, recipe, items);
  assert.deepEqual(suggested.essencePool.allocation, { rich: 1 }, 'the suggestion prefers `rich`');

  const steered = evaluate(manager, recipe, items, { essenceAllocation: { cheap: 2 } });
  assert.deepEqual(steered.essencePool.allocation, { cheap: 2 });
  assert.equal(
    steered.essencePool.carriers.find((carrier) => carrier.itemKey === 'rich').allocatedUnits,
    0,
    'the unallocated carrier is untouched'
  );
  assert.deepEqual(
    steered.essencePool.suggested,
    { rich: 1 },
    'the suggestion is still offered beside the player allocation'
  );
});

test('a sibling essence tile resolves its consumed item through the block entry’s group ids', () => {
  // The block emits ONE plan entry per item key naming ONE `ingredient`. A tile
  // reading only `entry.ingredient` would resolve `consumedItem: null` for every
  // sibling requirement the same entry funds.
  const manager = makeManager({
    definitions: [
      { id: 'radiant', name: 'Radiant' },
      { id: 'shadow', name: 'Shadow' },
    ],
  });
  const recipe = makeRecipe([
    essenceGroup('g-rad', 'radiant', 2),
    essenceGroup('g-sha', 'shadow', 1),
  ]);

  const result = evaluate(manager, recipe, [
    heldItem('dusk', 1, { radiant: 2, shadow: 1 }, { img: 'icons/commodities/gems/dusk.webp' }),
  ]);

  assert.equal(result.canCraft, true);
  const carriers = result.essencePool.carriers;
  assert.equal(carriers.length, 1, 'one carrier funds both requirements');
  assert.equal(carriers[0].allocatedUnits, 1, 'and is drawn exactly once');
  for (const groupId of ['g-rad', 'g-sha']) {
    assert.equal(
      requirementFor(result, groupId).satisfied,
      true,
      `${groupId} is funded by the shared draw`
    );
  }
});

test('a carrier carrying the generic item-bag literal reports no image', () => {
  const manager = makeManager({ definitions: [{ id: 'radiant', name: 'Radiant' }] });
  const recipe = makeRecipe([essenceGroup('g-rad', 'radiant', 1)]);

  const result = evaluate(manager, recipe, [
    heldItem('shard', 1, { radiant: 1 }, { img: 'icons/svg/item-bag.svg' }),
  ]);

  assert.equal(result.essencePool.carriers[0].img, null);
  assert.equal(result.essencePool.carriers[0].name, 'Held shard');
});
