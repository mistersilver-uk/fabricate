/**
 * Unit tests for ingredient set/group semantics (T-023)
 *
 * Covers:
 *   AC1: OR across ingredient sets — recipe is craftable when ANY one set is fully satisfied
 *   AC2: AND across groups within a set — all groups must be satisfied
 *   AC3: OR within group options — any one option satisfying is enough
 *   AC4: Failure when no complete set is satisfiable
 *   Bonus: Combined semantics and quantity accounting
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals required for module load
// ---------------------------------------------------------------------------

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
    getProperty: () => undefined
  },
  applications: {
    api: {
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      ApplicationV2: class { async _prepareContext() { return {}; } close() {} }
    }
  }
};
globalThis.game = { user: { isGM: true }, fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.ChatMessage = { create: () => {}, getSpeaker: () => ({}) };

// ---------------------------------------------------------------------------
// Imports — must come after globals are set
// ---------------------------------------------------------------------------

const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

/**
 * Make a minimal mock item that is matched by itemUuid on an Ingredient.
 * getFabricateFlag calls item.getFlag('fabricate', 'fabricate.tags') — we return [] by default.
 */
function makeItem(uuid, quantity = 1) {
  return {
    uuid,
    id: uuid,
    system: { quantity },
    getFlag: (_scope, _key) => undefined
  };
}

/**
 * Make an ingredient data object that matches by exact UUID.
 */
function makeIngredientData(itemUuid, quantity = 1) {
  return { itemUuid, quantity };
}

/**
 * Make an IngredientGroup data object (plain, not a class instance).
 * options is an array of ingredient plain objects.
 */
function makeGroupData(options, id = null) {
  return {
    id: id || foundry.utils.randomID(),
    name: 'Test Group',
    options
  };
}

/**
 * Construct an IngredientSet from ingredient group data objects.
 * Each group is an object with { id, name, options[] } where options are ingredient data objects.
 */
function makeIngredientSet(groupDataArray) {
  return IngredientSet.fromJSON({ ingredientGroups: groupDataArray });
}

/**
 * Build a minimal Recipe with the given array of IngredientSet instances.
 */
function makeRecipe(ingredientSets) {
  return new Recipe({
    name: 'Test Recipe',
    ingredientSets: ingredientSets.map(s => s.toJSON()),
    resultGroups: [{ id: 'rg-1', results: [] }]
  });
}

/**
 * Build a mock actor whose items collection is array-like.
 * RecipeManager.canCraft calls: Array.from(actor.items) and actor.items.filter(...)
 */
function makeActor(items) {
  const itemsArray = [...items];
  // Attach array methods directly so both Array.from() and .filter() work
  itemsArray[Symbol.iterator] = itemsArray[Symbol.iterator].bind(itemsArray);
  return { items: itemsArray };
}

/**
 * Build a RecipeManager with game.fabricate returning null systems (no features enabled).
 * This means uuid-based matching still works, tags/essences do not.
 */
function makeRecipeManager() {
  // Reset game.fabricate to null so _getSystemFeatures returns all-false features
  globalThis.game = { user: { isGM: true }, fabricate: null };
  return new RecipeManager();
}

// ---------------------------------------------------------------------------
// AC 1 — OR across ingredient sets
// Recipe is craftable when ANY one ingredient set is fully satisfied.
// ---------------------------------------------------------------------------

test('AC1: recipe is craftable when only the first of two ingredient sets is satisfied', () => {
  const itemX = makeItem('item-x');
  const itemY = makeItem('item-y');

  const setA = makeIngredientSet([makeGroupData([makeIngredientData('item-x')])]);
  const setB = makeIngredientSet([makeGroupData([makeIngredientData('item-y')])]);

  const recipe = makeRecipe([setA, setB]);
  const actor = makeActor([itemX]); // has item-x, not item-y

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable because set A is satisfied by item-x');
  assert.ok(result.satisfiableSet !== null, 'satisfiableSet should be set');
});

test('AC1: recipe is craftable when only the second of two ingredient sets is satisfied', () => {
  const itemX = makeItem('item-x');
  const itemY = makeItem('item-y');

  const setA = makeIngredientSet([makeGroupData([makeIngredientData('item-x')])]);
  const setB = makeIngredientSet([makeGroupData([makeIngredientData('item-y')])]);

  const recipe = makeRecipe([setA, setB]);
  const actor = makeActor([itemY]); // has item-y, not item-x

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable because set B is satisfied by item-y');
});

test('AC1: recipe is craftable when both ingredient sets are satisfied (uses first)', () => {
  const itemX = makeItem('item-x');
  const itemY = makeItem('item-y');

  const setA = makeIngredientSet([makeGroupData([makeIngredientData('item-x')])]);
  const setB = makeIngredientSet([makeGroupData([makeIngredientData('item-y')])]);

  const recipe = makeRecipe([setA, setB]);
  const actor = makeActor([itemX, itemY]); // has both

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable when both sets are satisfied');
  // The first satisfiable set should be returned
  assert.equal(result.satisfiableSet.id, setA.id, 'first satisfiable set should be selected');
});

test('AC1: recipe is craftable when third of three ingredient sets is the only satisfiable one', () => {
  const itemZ = makeItem('item-z');

  const setA = makeIngredientSet([makeGroupData([makeIngredientData('item-x')])]);
  const setB = makeIngredientSet([makeGroupData([makeIngredientData('item-y')])]);
  const setC = makeIngredientSet([makeGroupData([makeIngredientData('item-z')])]);

  const recipe = makeRecipe([setA, setB, setC]);
  const actor = makeActor([itemZ]); // only item-z available

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable when third set is satisfied');
});

// ---------------------------------------------------------------------------
// AC 2 — AND across groups within a set
// All groups in an IngredientSet must be satisfied.
// ---------------------------------------------------------------------------

test('AC2: ingredient set succeeds when both groups are satisfied', () => {
  const itemA = makeItem('item-a');
  const itemB = makeItem('item-b');

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a')]),
    makeGroupData([makeIngredientData('item-b')])
  ]);

  const result = set.resolveIngredientSelection([itemA, itemB]);

  assert.equal(result.success, true, 'set should succeed when both groups are satisfied');
  assert.equal(result.missingGroups.length, 0, 'no groups should be missing');
});

test('AC2: ingredient set fails when first group satisfied but second group not', () => {
  const itemA = makeItem('item-a');
  // item-b is NOT available

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a')]),
    makeGroupData([makeIngredientData('item-b')])
  ]);

  const result = set.resolveIngredientSelection([itemA]);

  assert.equal(result.success, false, 'set should fail when second group is unsatisfied');
  assert.equal(result.missingGroups.length, 1, 'exactly one group should be missing');
});

test('AC2: ingredient set fails when first group unsatisfied even though second is satisfied', () => {
  // item-a is NOT available
  const itemB = makeItem('item-b');

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a')]),
    makeGroupData([makeIngredientData('item-b')])
  ]);

  const result = set.resolveIngredientSelection([itemB]);

  assert.equal(result.success, false, 'set should fail when first group is unsatisfied');
  assert.ok(result.missingGroups.length >= 1, 'at least one group should be missing');
});

test('AC2: ingredient set with three groups fails when middle group is unsatisfied', () => {
  const itemA = makeItem('item-a');
  // item-b NOT available
  const itemC = makeItem('item-c');

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a')]),
    makeGroupData([makeIngredientData('item-b')]), // unsatisfied
    makeGroupData([makeIngredientData('item-c')])
  ]);

  const result = set.resolveIngredientSelection([itemA, itemC]);

  assert.equal(result.success, false, 'set should fail when middle group is unsatisfied');
  assert.ok(result.missingGroups.length >= 1, 'at least one group should be missing');
});

test('AC2: ingredient set with three groups succeeds when all three are satisfied', () => {
  const itemA = makeItem('item-a');
  const itemB = makeItem('item-b');
  const itemC = makeItem('item-c');

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a')]),
    makeGroupData([makeIngredientData('item-b')]),
    makeGroupData([makeIngredientData('item-c')])
  ]);

  const result = set.resolveIngredientSelection([itemA, itemB, itemC]);

  assert.equal(result.success, true, 'set should succeed when all three groups are satisfied');
  assert.equal(result.missingGroups.length, 0, 'no groups should be missing');
});

// ---------------------------------------------------------------------------
// AC 3 — OR within group options
// Any one option satisfying a group is enough.
// ---------------------------------------------------------------------------

test('AC3: group is satisfied when first option matches', () => {
  const itemX = makeItem('item-x');
  const itemY = makeItem('item-y');

  const set = makeIngredientSet([
    makeGroupData([
      makeIngredientData('item-x'),
      makeIngredientData('item-y')
    ])
  ]);

  const result = set.resolveIngredientSelection([itemX, itemY]);

  assert.equal(result.success, true, 'group should be satisfied by first option');
  assert.equal(result.selectedIngredients.length, 1, 'one ingredient should be selected');
  assert.equal(result.selectedIngredients[0].itemUuid, 'item-x', 'first option should be selected');
});

test('AC3: group is satisfied when only second option matches (first is unavailable)', () => {
  // item-x NOT available
  const itemY = makeItem('item-y');

  const set = makeIngredientSet([
    makeGroupData([
      makeIngredientData('item-x'), // not available
      makeIngredientData('item-y')  // available
    ])
  ]);

  const result = set.resolveIngredientSelection([itemY]);

  assert.equal(result.success, true, 'group should be satisfied by second option');
  assert.equal(result.selectedIngredients.length, 1, 'one ingredient should be selected');
  assert.equal(result.selectedIngredients[0].itemUuid, 'item-y', 'second option should be selected');
});

test('AC3: group fails when neither option matches', () => {
  // Neither item-x nor item-y available

  const set = makeIngredientSet([
    makeGroupData([
      makeIngredientData('item-x'),
      makeIngredientData('item-y')
    ])
  ]);

  const result = set.resolveIngredientSelection([]);

  assert.equal(result.success, false, 'group should fail when no option matches');
  assert.equal(result.missingGroups.length, 1, 'the group should be reported as missing');
});

test('AC3: group fails when available item does not match any option', () => {
  const itemZ = makeItem('item-z'); // irrelevant item

  const set = makeIngredientSet([
    makeGroupData([
      makeIngredientData('item-x'),
      makeIngredientData('item-y')
    ])
  ]);

  const result = set.resolveIngredientSelection([itemZ]);

  assert.equal(result.success, false, 'group should fail with unmatched available items');
});

// ---------------------------------------------------------------------------
// AC 4 — Failure when no complete set is satisfiable
// ---------------------------------------------------------------------------

test('AC4: canCraft returns false when single set has a missing ingredient', () => {
  // item-a is NOT available

  const set = makeIngredientSet([makeGroupData([makeIngredientData('item-a')])]);
  const recipe = makeRecipe([set]);
  const actor = makeActor([]); // nothing available

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable when ingredient is missing');
  assert.equal(result.satisfiableSet, null, 'satisfiableSet should be null');
});

test('AC4: canCraft returns false when two sets both have missing ingredients', () => {
  // set A needs item-x, set B needs item-y — neither available

  const setA = makeIngredientSet([makeGroupData([makeIngredientData('item-x')])]);
  const setB = makeIngredientSet([makeGroupData([makeIngredientData('item-y')])]);
  const recipe = makeRecipe([setA, setB]);
  const actor = makeActor([]); // nothing

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable when no set is satisfied');
  assert.equal(result.satisfiableSet, null);
});

test('AC4: canCraft returns false with empty ingredient sets array', () => {
  const recipe = makeRecipe([]);
  const actor = makeActor([makeItem('item-a')]);

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable with no ingredient sets defined');
});

test('AC4: canCraft returns missing details from first set when all sets fail', () => {
  // set A needs item-x, set B needs item-y — neither available
  const setA = makeIngredientSet([makeGroupData([makeIngredientData('item-x')])]);
  const setB = makeIngredientSet([makeGroupData([makeIngredientData('item-y')])]);
  const recipe = makeRecipe([setA, setB]);
  const actor = makeActor([]);

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, false);
  assert.ok(Array.isArray(result.missing.ingredients), 'missing.ingredients should be an array');
  assert.ok(result.missing.ingredients.length > 0, 'missing.ingredients should be populated from first set');
  assert.equal(result.missing.ingredients[0].ingredient.itemUuid, 'item-x',
    'missing ingredient should be from the first set');
});

test('AC4: canCraft returns false when actor has no items array', () => {
  const setA = makeIngredientSet([makeGroupData([makeIngredientData('item-x')])]);
  const recipe = makeRecipe([setA]);

  const manager = makeRecipeManager();
  // No actors provided
  const result = manager.canCraft([], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable with no actors');
});

// ---------------------------------------------------------------------------
// Bonus — Combined semantics and quantity accounting
// ---------------------------------------------------------------------------

test('Bonus: shared item pool — two groups both need same item with enough for both', () => {
  // Group 1 needs 1x item-a, Group 2 needs 1x item-a
  // Actor has item-a with quantity 2 — enough for both groups
  const itemA = makeItem('item-a', 2); // quantity 2

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)]),
    makeGroupData([makeIngredientData('item-a', 1)])
  ]);

  const result = set.resolveIngredientSelection([itemA]);

  assert.equal(result.success, true, 'set should succeed: 2 available covers both groups needing 1 each');
});

test('Bonus: shared item pool — two groups need same item, only enough for one group', () => {
  // Group 1 needs 1x item-a, Group 2 needs 1x item-a
  // Actor has item-a with quantity 1 — only enough for one group
  const itemA = makeItem('item-a', 1); // quantity 1

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)]),
    makeGroupData([makeIngredientData('item-a', 1)])
  ]);

  const result = set.resolveIngredientSelection([itemA]);

  assert.equal(result.success, false,
    'set should fail: only 1 available but 2 total needed across groups');
});

test('Bonus: multi-stack quantity — ingredient needs qty 3, have two stacks of 2 (total 4)', () => {
  // Two separate items both with uuid matching ingredient — different uuids treated as separate stacks
  const itemA1 = makeItem('item-a-stack1', 2);
  const itemA2 = makeItem('item-a-stack2', 2);

  // Use a custom matcher to treat both items as "item-a" variants
  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a-stack1', 3)])
  ]);

  // Only stack1 matches (uuid match), and it has qty 2 — not enough
  const resultSingleStack = set.resolveIngredientSelection([itemA1, itemA2]);
  assert.equal(resultSingleStack.success, false,
    'stack1 alone has qty 2, needs 3 — should fail');

  // Give stack1 qty 3 — should now succeed
  const itemA1Enough = makeItem('item-a-stack1', 3);
  const resultEnough = set.resolveIngredientSelection([itemA1Enough]);
  assert.equal(resultEnough.success, true, 'stack1 with qty 3 should satisfy the need for 3');
});

test('Bonus: multi-stack quantity via custom matcher — need 3, have two stacks of 2 total 4', () => {
  // Use a custom matcher so both item-a-1 and item-a-2 are treated as "item-a"
  const itemA1 = makeItem('item-a-1', 2);
  const itemA2 = makeItem('item-a-2', 2);

  // The ingredient references item-a-1 but we override matcher to match both
  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a-1', 3)])
  ]);

  // Custom matcher: treat any item whose uuid starts with 'item-a-' as matching
  const matcher = (ingredient, item) => item.uuid.startsWith('item-a-');
  const result = set.resolveIngredientSelection([itemA1, itemA2], matcher);

  assert.equal(result.success, true,
    'should succeed: custom matcher allows both stacks (2+2=4) to fill the need of 3');
  assert.equal(result.plan.length, 2, 'plan should include entries from both stacks');

  const totalConsumed = result.plan.reduce((sum, entry) => sum + entry.quantity, 0);
  assert.equal(totalConsumed, 3, 'total consumed quantity should be exactly 3');
});

test('Bonus: complex recipe — 2 sets, 2 groups each with options, correct set resolves', () => {
  // Set A: Group1(item-x OR item-y) AND Group2(item-z)
  // Set B: Group1(item-w)
  // Actor has: item-y, item-z (not item-x, not item-w)
  // Expected: craftable via Set A (group1 satisfied by item-y, group2 by item-z)

  const itemY = makeItem('item-y');
  const itemZ = makeItem('item-z');

  const setA = makeIngredientSet([
    makeGroupData([makeIngredientData('item-x'), makeIngredientData('item-y')]),
    makeGroupData([makeIngredientData('item-z')])
  ]);
  const setB = makeIngredientSet([
    makeGroupData([makeIngredientData('item-w')])
  ]);

  const recipe = makeRecipe([setA, setB]);
  const actor = makeActor([itemY, itemZ]);

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable via set A');
  assert.equal(result.satisfiableSet.id, setA.id, 'set A should be the satisfiable set');
});

test('Bonus: complex recipe — 2 sets both unsatisfied returns canCraft false', () => {
  // Set A needs item-x AND item-z; Set B needs item-w
  // Actor has only item-y — satisfies nothing

  const itemY = makeItem('item-y');

  const setA = makeIngredientSet([
    makeGroupData([makeIngredientData('item-x')]),
    makeGroupData([makeIngredientData('item-z')])
  ]);
  const setB = makeIngredientSet([
    makeGroupData([makeIngredientData('item-w')])
  ]);

  const recipe = makeRecipe([setA, setB]);
  const actor = makeActor([itemY]);

  const manager = makeRecipeManager();
  const result = manager.canCraft([actor], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable when neither set is satisfied');
});

test('Bonus: resolveIngredientSelection returns correct selectedIngredients and plan entries', () => {
  const itemA = makeItem('item-a');
  const itemB = makeItem('item-b');

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a')]),
    makeGroupData([makeIngredientData('item-b')])
  ]);

  const result = set.resolveIngredientSelection([itemA, itemB]);

  assert.equal(result.success, true);
  assert.equal(result.selectedIngredients.length, 2, 'should select one ingredient per group');
  assert.equal(result.plan.length, 2, 'plan should have one entry per satisfied group');

  const planUuids = result.plan.map(entry => entry.item.uuid);
  assert.ok(planUuids.includes('item-a'), 'plan should include item-a');
  assert.ok(planUuids.includes('item-b'), 'plan should include item-b');
});

test('Bonus: insufficient quantity — ingredient needs qty 3, actor has qty 2 — fails', () => {
  const itemA = makeItem('item-a', 2); // only 2 available

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 3)]) // needs 3
  ]);

  const result = set.resolveIngredientSelection([itemA]);

  assert.equal(result.success, false, 'should fail: need 3 but only have 2');
  assert.equal(result.missingGroups.length, 1, 'one group should be missing');
  assert.equal(result.missingGroups[0].have, 2, 'should report having 2');
  assert.equal(result.missingGroups[0].need, 3, 'should report needing 3');
});

test('Bonus: sufficient quantity — ingredient needs qty 3, actor has qty 4 — succeeds', () => {
  const itemA = makeItem('item-a', 4); // 4 available

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 3)]) // needs 3
  ]);

  const result = set.resolveIngredientSelection([itemA]);

  assert.equal(result.success, true, 'should succeed: have 4, need 3');
  assert.equal(result.plan[0].quantity, 3, 'plan should consume exactly 3');
});
