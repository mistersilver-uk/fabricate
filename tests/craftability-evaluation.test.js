/**
 * Unit tests for T-082: evaluateCraftability() unified computation path
 *
 * Covers:
 *   TC1: Fully satisfied recipe — canCraft true, all ingredientStates satisfied
 *   TC2: Partially satisfied — canCraft false, states identify shortages
 *   TC3: Unsatisfied — canCraft false, actor has nothing
 *   TC4: Exact boundary — actor has exactly the required quantity
 *   TC5: Multiple component source actors — correct aggregation
 *   TC6: Managed-component matching (match.type === 'component')
 *   TC7: Shared items across groups — remaining-quantity tracking consistent
 *   TC8: Tool presence/absence — toolStates match craftability
 *   TC9: Essence requirements — essenceStates match craftability
 *   TC10 (regression): False uncraftable state — managed-component scenario
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals required for module load
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), object);
}

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty
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
 * Make a minimal mock item matched by itemUuid on an Ingredient.
 */
function makeItem(uuid, quantity = 1, extraFlags = {}) {
  return {
    uuid,
    id: uuid,
    system: { quantity },
    flags: extraFlags,
    getFlag: (_scope, _key) => undefined
  };
}

/**
 * Make a managed-component item: matched by componentId via sourceUuid.
 */
function makeComponentItem(uuid, sourceUuid, quantity = 1) {
  return {
    uuid,
    id: uuid,
    system: { quantity },
    flags: { core: { sourceId: sourceUuid } },
    getFlag: (_scope, _key) => undefined
  };
}

function makeIngredientData(itemUuid, quantity = 1) {
  return { itemUuid, quantity };
}

function makeComponentIngredientData(componentId, quantity = 1) {
  return { match: { type: 'component', componentId }, quantity };
}

function makeGroupData(options, id = null) {
  return {
    id: id || foundry.utils.randomID(),
    name: 'Test Group',
    options
  };
}

function makeIngredientSet(groupDataArray, essences = {}) {
  return IngredientSet.fromJSON({ ingredientGroups: groupDataArray, essences });
}

function makeRecipe(ingredientSets, extra = {}) {
  return new Recipe({
    name: 'Test Recipe',
    ingredientSets: ingredientSets.map(s => s.toJSON()),
    resultGroups: [{ id: 'rg-1', results: [] }],
    ...extra
  });
}

/**
 * Build a mock actor whose items collection is array-like.
 */
function makeActor(items) {
  const itemsArray = [...items];
  itemsArray[Symbol.iterator] = itemsArray[Symbol.iterator].bind(itemsArray);
  return { items: itemsArray };
}

/**
 * Build a mock actor whose items collection is iterable but does not expose
 * Array helpers like .filter() (mirrors Foundry EmbeddedCollection behavior).
 */
function makeActorWithIterableCollection(items) {
  const entries = [...items];
  return {
    items: {
      [Symbol.iterator]: function* () {
        yield* entries;
      }
    }
  };
}

/**
 * Build a RecipeManager with no system features (uuid-based matching still works).
 */
function makeRecipeManager() {
  globalThis.game = { user: { isGM: true }, fabricate: null };
  return new RecipeManager();
}

/**
 * Build a RecipeManager wired to a system that exposes named components.
 */
function makeRecipeManagerWithSystem(systemId, components, tools = []) {
  const system = {
    id: systemId,
    features: { itemTags: false, essences: false },
    components,
    managedItems: components,
    tools,
    essenceDefinitions: []
  };
  globalThis.game = {
    user: { isGM: true },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (id) => id === systemId ? system : null
      }),
      getResolutionModeService: () => null
    }
  };
  return new RecipeManager();
}

/**
 * Build a system manager that also supports essences.
 */
function makeRecipeManagerWithEssences(systemId, essenceDefinitions, components = []) {
  const system = {
    id: systemId,
    features: { itemTags: false, essences: true },
    components,
    managedItems: [],
    essenceDefinitions
  };
  globalThis.game = {
    user: { isGM: true },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (id) => id === systemId ? system : null
      }),
      getResolutionModeService: () => null
    }
  };
  return new RecipeManager();
}

// ---------------------------------------------------------------------------
// TC1: Fully satisfied — all ingredients present at exact+ quantities
// ---------------------------------------------------------------------------

test('TC1: evaluateCraftability returns canCraft true and all ingredientStates satisfied', () => {
  const itemA = makeItem('item-a', 2);
  const itemB = makeItem('item-b', 3);

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)]),
    makeGroupData([makeIngredientData('item-b', 2)])
  ]);
  const recipe = makeRecipe([set]);
  const actor = makeActor([itemA, itemB]);

  const manager = makeRecipeManager();
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable when all ingredients satisfied');
  assert.ok(result.satisfiableSet !== null, 'satisfiableSet should be set');
  assert.equal(result.ingredientStates.length, 2, 'should have one state per group');
  for (const state of result.ingredientStates) {
    assert.equal(state.satisfied, true, `state "${state.description}" should be satisfied`);
  }
});

// ---------------------------------------------------------------------------
// TC2: Partially satisfied — some ingredients present, some missing
// ---------------------------------------------------------------------------

test('TC2: evaluateCraftability returns canCraft false and identifies shortages', () => {
  const itemA = makeItem('item-a', 1); // has item-a
  // item-b is absent

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)]),
    makeGroupData([makeIngredientData('item-b', 2)])
  ]);
  const recipe = makeRecipe([set]);
  const actor = makeActor([itemA]);

  const manager = makeRecipeManager();
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable when ingredient is missing');
  assert.equal(result.satisfiableSet, null, 'satisfiableSet should be null');

  const stateB = result.ingredientStates.find(s => !s.satisfied);
  assert.ok(stateB, 'at least one state should be unsatisfied');
  assert.equal(stateB.have, 0, 'should report 0 available for missing ingredient');
  assert.equal(stateB.need, 2, 'should report the needed quantity');
});

// ---------------------------------------------------------------------------
// TC3: Unsatisfied — actor has none of the required ingredients
// ---------------------------------------------------------------------------

test('TC3: evaluateCraftability returns canCraft false when actor has nothing', () => {
  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)])
  ]);
  const recipe = makeRecipe([set]);
  const actor = makeActor([]);

  const manager = makeRecipeManager();
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable with empty inventory');
  assert.equal(result.satisfiableSet, null);
  assert.equal(result.ingredientStates.length, 1);
  assert.equal(result.ingredientStates[0].satisfied, false);
  assert.equal(result.ingredientStates[0].have, 0);
});

// ---------------------------------------------------------------------------
// TC4: Exact boundary — actor has exactly the required quantity
// ---------------------------------------------------------------------------

test('TC4: evaluateCraftability succeeds when actor has exactly the required quantity', () => {
  const itemA = makeItem('item-a', 3); // exactly 3

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 3)])
  ]);
  const recipe = makeRecipe([set]);
  const actor = makeActor([itemA]);

  const manager = makeRecipeManager();
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true, 'exact quantity should be sufficient');
  assert.equal(result.ingredientStates[0].satisfied, true);
  assert.equal(result.ingredientStates[0].have, 3);
  assert.equal(result.ingredientStates[0].need, 3);
});

// ---------------------------------------------------------------------------
// TC5: Multiple component source actors — ingredients split across two actors
// ---------------------------------------------------------------------------

test('TC5: evaluateCraftability correctly aggregates items from multiple actors', () => {
  // Actor 1 has item-a, Actor 2 has item-b — together they can craft
  const itemA = makeItem('item-a', 1);
  const itemB = makeItem('item-b', 1);

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)]),
    makeGroupData([makeIngredientData('item-b', 1)])
  ]);
  const recipe = makeRecipe([set]);

  const actor1 = makeActor([itemA]);
  const actor2 = makeActor([itemB]);

  const manager = makeRecipeManager();
  const result = manager.evaluateCraftability([actor1, actor2], recipe);

  assert.equal(result.canCraft, true, 'should be craftable when ingredients are split across actors');
  assert.equal(result.ingredientStates.length, 2);
  for (const state of result.ingredientStates) {
    assert.equal(state.satisfied, true, `state "${state.description}" should be satisfied`);
  }
});

// ---------------------------------------------------------------------------
// TC6: Managed-component matching (match.type === 'component' with componentId)
// ---------------------------------------------------------------------------

test('TC6: evaluateCraftability matches managed-component ingredients by sourceUuid', () => {
  const systemId = 'sys-tc6';
  const compId = 'comp-iron-ingot';
  const sourceUuid = 'Item.iron-ingot-source';

  // The actor item has the sourceId flag pointing to the component's sourceUuid
  const actorItem = makeComponentItem('actor-item-uuid', sourceUuid, 2);

  const set = makeIngredientSet([
    makeGroupData([makeComponentIngredientData(compId, 1)])
  ]);
  const recipe = new Recipe({
    name: 'Managed Component Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const manager = makeRecipeManagerWithSystem(systemId, [
    { id: compId, sourceUuid, name: 'Iron Ingot', img: 'icons/iron-ingot.webp' }
  ]);

  const actor = makeActor([actorItem]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true, 'managed-component ingredient should match by sourceUuid');
  assert.equal(result.ingredientStates.length, 1);
  const state = result.ingredientStates[0];
  assert.equal(state.satisfied, true);
  // The ingredient state carries the component visuals for the player image grid.
  assert.equal(state.componentId, compId, 'ingredient state exposes its component id');
  assert.equal(state.name, 'Iron Ingot', 'ingredient state exposes the component name');
  assert.equal(state.img, 'icons/iron-ingot.webp', 'ingredient state exposes the component image');
});

test('TC6b: a missing managed-component ingredient still exposes its component image', () => {
  const systemId = 'sys-tc6b';
  const compId = 'comp-mithril';
  const sourceUuid = 'Item.mithril-source';

  const set = makeIngredientSet([makeGroupData([makeComponentIngredientData(compId, 2)])]);
  const recipe = new Recipe({
    name: 'Missing Component Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const manager = makeRecipeManagerWithSystem(systemId, [
    { id: compId, sourceUuid, name: 'Mithril', img: 'icons/mithril.webp' }
  ]);

  // Actor has none of the component.
  const result = manager.evaluateCraftability([makeActor([])], recipe);

  assert.equal(result.canCraft, false);
  const state = result.ingredientStates[0];
  assert.equal(state.satisfied, false);
  assert.equal(state.componentId, compId);
  assert.equal(state.name, 'Mithril');
  assert.equal(state.img, 'icons/mithril.webp', 'missing ingredient still resolves its image');
});

// ---------------------------------------------------------------------------
// TC7: Shared items across groups — remaining-quantity tracking consistent
// ---------------------------------------------------------------------------

test('TC7: evaluateCraftability tracks remaining quantity across groups (no double-counting)', () => {
  // Both Group 1 and Group 2 require item-a quantity 1.
  // Actor has item-a with quantity 1 (only enough for ONE group).
  // canCraft should be false AND states should reflect the shortage consistently.
  const itemA = makeItem('item-a', 1);

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)]),
    makeGroupData([makeIngredientData('item-a', 1)])
  ]);
  const recipe = makeRecipe([set]);
  const actor = makeActor([itemA]);

  const manager = makeRecipeManager();
  const result = manager.evaluateCraftability([actor], recipe);

  // canCraft must be false — quantity is exhausted by first group
  assert.equal(result.canCraft, false,
    'canCraft must be false when shared item only covers one of two groups');

  // The display states must agree: at least one group must be unsatisfied
  const unsatisfied = result.ingredientStates.filter(s => !s.satisfied);
  assert.ok(unsatisfied.length >= 1,
    'at least one ingredientState must be unsatisfied (consistent with canCraft:false)');
});

test('TC7b: evaluateCraftability succeeds when shared item covers both groups', () => {
  // Both groups need item-a quantity 1, actor has item-a quantity 2.
  const itemA = makeItem('item-a', 2);

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)]),
    makeGroupData([makeIngredientData('item-a', 1)])
  ]);
  const recipe = makeRecipe([set]);
  const actor = makeActor([itemA]);

  const manager = makeRecipeManager();
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable when shared item covers both groups');
  for (const state of result.ingredientStates) {
    assert.equal(state.satisfied, true, 'all states must be satisfied when enough quantity exists');
  }
});

// ---------------------------------------------------------------------------
// TC8: Tool presence/absence
// ---------------------------------------------------------------------------

test('TC8: evaluateCraftability toolStates show available when tool present', () => {
  const systemId = 'sys-tc8';
  const compId = 'comp-mortar';
  const sourceUuid = 'Item.mortar-source';

  const actorItem = makeComponentItem('mortar-uuid', sourceUuid, 1);
  const ingredientItem = makeItem('item-a', 1);

  // Recipe with one ingredient and one tool
  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)])
  ]);

  const manager = makeRecipeManagerWithSystem(systemId, [
    { id: compId, sourceUuid, name: 'Mortar', img: 'icons/mortar.webp' }
  ], [{ id: 'tool-mortar', componentId: compId, enabled: true }]);

  const recipe = new Recipe({
    name: 'Tool Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    toolIds: ['tool-mortar'],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([ingredientItem, actorItem]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable with tool present');
  assert.equal(result.toolStates.length, 1);
  assert.equal(result.toolStates[0].available, true, 'tool should be marked available');
  assert.equal(result.toolStates[0].name, 'Mortar', 'tool state carries the component name');
  assert.equal(result.toolStates[0].img, 'icons/mortar.webp', 'tool state carries the component image');
});

test('TC8b: evaluateCraftability toolStates show unavailable when tool missing', () => {
  const systemId = 'sys-tc8b';
  const compId = 'comp-mortar-b';
  const sourceUuid = 'Item.mortar-b-source';

  // Actor has the ingredient but NOT the tool
  const ingredientItem = makeItem('item-a', 1);

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)])
  ]);

  const manager = makeRecipeManagerWithSystem(systemId, [
    { id: compId, sourceUuid, name: 'Mortar B' }
  ], [{ id: 'tool-mortar-b', componentId: compId, enabled: true }]);

  const recipe = new Recipe({
    name: 'Missing Tool Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    toolIds: ['tool-mortar-b'],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([ingredientItem]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable when tool is missing');
  assert.equal(result.toolStates.length, 1);
  assert.equal(result.toolStates[0].available, false, 'tool should be marked unavailable');
});

test('TC8c: evaluateCraftability supports iterable actor.items without Array.filter', () => {
  const systemId = 'sys-tc8c';
  const compId = 'comp-mortar-c';
  const sourceUuid = 'Item.mortar-c-source';

  const actorItem = makeComponentItem('mortar-c-uuid', sourceUuid, 1);
  const ingredientItem = makeItem('item-a', 1);

  const set = makeIngredientSet([
    makeGroupData([makeIngredientData('item-a', 1)])
  ]);

  const manager = makeRecipeManagerWithSystem(systemId, [
    { id: compId, sourceUuid, name: 'Mortar C' }
  ], [{ id: 'tool-mortar-c', componentId: compId, enabled: true }]);

  const recipe = new Recipe({
    name: 'Tool Collection Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    toolIds: ['tool-mortar-c'],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActorWithIterableCollection([ingredientItem, actorItem]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true, 'should remain craftable with iterable items collection');
  assert.equal(result.toolStates.length, 1);
  assert.equal(result.toolStates[0].available, true, 'tool should be detected from iterable collection');
});

// ---------------------------------------------------------------------------
// TC9: Essence requirements
// ---------------------------------------------------------------------------

test('TC9: evaluateCraftability essenceStates show satisfied when essences available', () => {
  const systemId = 'sys-tc9';

  // Item that provides fire essence via fabricate flag
  const fireItem = {
    uuid: 'fire-item',
    id: 'fire-item',
    system: { quantity: 1 },
    getFlag: (scope, key) => {
      if (scope === 'fabricate' && key === 'fabricate.essences') return { fire: 3 };
      return undefined;
    }
  };

  const set = makeIngredientSet([], { fire: 2 }); // needs 2 fire, items provide 3

  const manager = makeRecipeManagerWithEssences(systemId, [
    { id: 'fire', name: 'Fire' }
  ]);

  const recipe = new Recipe({
    name: 'Essence Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([fireItem]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable when essence requirement met');
  assert.equal(result.essenceStates.length, 1);
  assert.equal(result.essenceStates[0].type, 'fire');
  assert.equal(result.essenceStates[0].have, 3);
  assert.equal(result.essenceStates[0].need, 2);
  assert.equal(result.essenceStates[0].satisfied, true);
});

test('TC9a: evaluateCraftability counts essences from matched component definitions', () => {
  const systemId = 'sys-tc9a';
  const essenceId = 'restorative';
  const components = [
    {
      id: 'red-herb',
      name: 'Red Herb',
      sourceUuid: 'Compendium.test.red-herb',
      sourceItemUuid: 'Compendium.test.red-herb',
      essences: { [essenceId]: 1 }
    },
    {
      id: 'silverleaf',
      name: 'Silverleaf',
      sourceUuid: 'Compendium.test.silverleaf',
      sourceItemUuid: 'Compendium.test.silverleaf',
      essences: { [essenceId]: 1 }
    }
  ];
  const redHerb = makeComponentItem('red-herb-item', 'Compendium.test.red-herb', 1);
  const silverleaf = makeComponentItem('silverleaf-item', 'Compendium.test.silverleaf', 1);
  const set = makeIngredientSet([], { [essenceId]: 2 });

  const manager = makeRecipeManagerWithEssences(systemId, [
    { id: essenceId, name: 'Restorative' }
  ], components);

  const recipe = new Recipe({
    name: 'Healing Potion',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([redHerb, silverleaf]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true, 'should be craftable when component-defined essences satisfy the recipe');
  assert.equal(result.essenceStates.length, 1);
  assert.equal(result.essenceStates[0].type, essenceId);
  assert.equal(result.essenceStates[0].have, 2);
  assert.equal(result.essenceStates[0].need, 2);
  assert.equal(result.essenceStates[0].satisfied, true);
});

test('TC9b: evaluateCraftability multiplies component-defined essences by stack quantity', () => {
  const systemId = 'sys-tc9b-stack';
  const essenceId = 'restorative';
  const components = [{
    id: 'red-herb',
    name: 'Red Herb',
    sourceUuid: 'Compendium.test.red-herb',
    sourceItemUuid: 'Compendium.test.red-herb',
    essences: { [essenceId]: 1 }
  }];
  const redHerbStack = makeComponentItem('red-herb-stack', 'Compendium.test.red-herb', 2);
  const set = makeIngredientSet([], { [essenceId]: 2 });

  const manager = makeRecipeManagerWithEssences(systemId, [
    { id: essenceId, name: 'Restorative' }
  ], components);

  const recipe = new Recipe({
    name: 'Healing Potion',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([redHerbStack]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, true);
  assert.equal(result.essenceStates[0].have, 2);
});

test('TC9c: evaluateCraftability uses item-flag essences before component fallback', () => {
  const systemId = 'sys-tc9c-precedence';
  const essenceId = 'restorative';
  const components = [{
    id: 'red-herb',
    name: 'Red Herb',
    sourceUuid: 'Compendium.test.red-herb',
    sourceItemUuid: 'Compendium.test.red-herb',
    essences: { [essenceId]: 5 }
  }];
  const redHerb = {
    uuid: 'red-herb-flagged',
    id: 'red-herb-flagged',
    name: 'Red Herb',
    system: { quantity: 1 },
    flags: { core: { sourceId: 'Compendium.test.red-herb' } },
    getFlag: (scope, key) => {
      if (scope === 'fabricate' && key === 'fabricate.essences') return { [essenceId]: 1 };
      return undefined;
    }
  };
  const set = makeIngredientSet([], { [essenceId]: 2 });

  const manager = makeRecipeManagerWithEssences(systemId, [
    { id: essenceId, name: 'Restorative' }
  ], components);

  const recipe = new Recipe({
    name: 'Healing Potion',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([redHerb]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, false, 'item flag value should override the larger component fallback');
  assert.equal(result.essenceStates[0].have, 1);
});

test('TC9d: evaluateCraftability essenceStates show unsatisfied when essences insufficient', () => {
  const systemId = 'sys-tc9b';

  // Item provides only 1 fire essence, but recipe needs 3
  const fireItem = {
    uuid: 'fire-item-b',
    id: 'fire-item-b',
    system: { quantity: 1 },
    getFlag: (scope, key) => {
      if (scope === 'fabricate' && key === 'fabricate.essences') return { fire: 1 };
      return undefined;
    }
  };

  const set = makeIngredientSet([], { fire: 3 }); // needs 3

  const manager = makeRecipeManagerWithEssences(systemId, [
    { id: 'fire', name: 'Fire' }
  ]);

  const recipe = new Recipe({
    name: 'Insufficient Essence Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([fireItem]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, false, 'should not be craftable when essence requirement unmet');
  assert.equal(result.essenceStates.length, 1);
  assert.equal(result.essenceStates[0].have, 1);
  assert.equal(result.essenceStates[0].need, 3);
  assert.equal(result.essenceStates[0].satisfied, false);
});

// ---------------------------------------------------------------------------
// TC10 (regression): False uncraftable state — managed-component scenario
//
// Reproduces the reported bug: a recipe with managed-component ingredients
// where the actor has all required items at sufficient quantities.
// The old divergent paths could produce contradictory results where
// individual ingredient display states all showed satisfied=true but
// canCraft returned false (or vice versa). evaluateCraftability must
// return consistent canCraft:true and all states satisfied.
// ---------------------------------------------------------------------------

test('TC10 (regression): evaluateCraftability is consistent when actor has all managed-component ingredients', () => {
  const systemId = 'sys-tc10';
  const compIdA = 'comp-tc10-a';
  const compIdB = 'comp-tc10-b';
  const sourceUuidA = 'Item.tc10-a-source';
  const sourceUuidB = 'Item.tc10-b-source';

  // Actor has both managed components at sufficient quantity
  const actorItemA = makeComponentItem('actor-tc10-a', sourceUuidA, 2);
  const actorItemB = makeComponentItem('actor-tc10-b', sourceUuidB, 1);

  const set = makeIngredientSet([
    makeGroupData([makeComponentIngredientData(compIdA, 2)]),
    makeGroupData([makeComponentIngredientData(compIdB, 1)])
  ]);

  const manager = makeRecipeManagerWithSystem(systemId, [
    { id: compIdA, sourceUuid: sourceUuidA, name: 'Component A' },
    { id: compIdB, sourceUuid: sourceUuidB, name: 'Component B' }
  ]);

  const recipe = new Recipe({
    name: 'Managed Component Full Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([actorItemA, actorItemB]);
  const result = manager.evaluateCraftability([actor], recipe);

  // Primary assertion: recipe must be craftable
  assert.equal(result.canCraft, true,
    'canCraft must be true when actor has all managed-component ingredients at required quantities');

  // All display states must agree with canCraft
  assert.equal(result.ingredientStates.length, 2);
  for (const state of result.ingredientStates) {
    assert.equal(state.satisfied, true,
      `ingredientState "${state.description}" must be satisfied (consistent with canCraft:true)`);
  }

  // Verify canCraft() thin wrapper returns same boolean
  const canCraftResult = manager.canCraft([actor], recipe);
  assert.equal(canCraftResult.canCraft, result.canCraft,
    'canCraft() thin wrapper must agree with evaluateCraftability().canCraft');
});

test('TC10b (regression): evaluateCraftability returns all states unsatisfied when canCraft is false', () => {
  // Verifies the symmetric case: canCraft false must not have all states satisfied.
  const systemId = 'sys-tc10b';
  const compId = 'comp-tc10b';
  const sourceUuid = 'Item.tc10b-source';

  // Actor has NOTHING — managed component is absent
  const set = makeIngredientSet([
    makeGroupData([makeComponentIngredientData(compId, 1)])
  ]);

  const manager = makeRecipeManagerWithSystem(systemId, [
    { id: compId, sourceUuid, name: 'Component TC10B' }
  ]);

  const recipe = new Recipe({
    name: 'Missing Managed Component Recipe',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const actor = makeActor([]);
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.canCraft, false,
    'canCraft must be false when managed-component is absent');

  const allSatisfied = result.ingredientStates.every(s => s.satisfied);
  assert.equal(allSatisfied, false,
    'not all ingredientStates can be satisfied when canCraft is false (no false positive)');
});
