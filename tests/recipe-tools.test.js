/**
 * Recipe-level Tool support.
 *
 * Covers:
 *   - `toolIds` normalization + serialization at recipe / step / ingredient-set
 *     granularity (trim, drop empties, dedupe, round-trip via toJSON);
 *   - getExecutionSteps surfaces the implicit step's toolIds;
 *   - RecipeManager.getToolsForSet resolves the union of recipe + set toolIds
 *     against the per-system library and skips unknown ids;
 *   - evaluateCraftability produces toolStates + missing.tools (present vs.
 *     missing tool in actor inventory), and gates canCraft on tool presence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals required for module load
// ---------------------------------------------------------------------------

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
    getProperty: (obj, path) => String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj)
  }
};
globalThis.game = { user: { isGM: true }, fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { Recipe } = await import('../src/models/Recipe.js');
const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { component, roleItem } = await import('./helpers/componentIdentityFixtures.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function item(name) {
  return {
    name,
    getFlag: () => undefined
  };
}

function actor(items) {
  return { items };
}

/**
 * Install a crafting-system manager exposing a single system with the given
 * components + tools, resolved by `RecipeManager` via
 * `game.fabricate.getCraftingSystemManager()`.
 */
function installSystem({ id = 'sys-1', components = [], tools = [] } = {}) {
  const system = { id, components, tools, features: {} };
  globalThis.game.fabricate = {
    getCraftingSystemManager: () => ({
      getSystem: sid => (sid === id ? system : null)
    })
  };
  return system;
}

function toolComponent(id, name) {
  // A name-matched managed component (no registeredItemUuid) matches by item name.
  return { id, name };
}

// ---------------------------------------------------------------------------
// Normalization + serialization
// ---------------------------------------------------------------------------

test('recipe-level toolIds normalize: trim, drop empties, dedupe', () => {
  const recipe = new Recipe({ toolIds: ['  t-1 ', 't-1', '', null, 't-2', '   '] });
  assert.deepEqual(recipe.toolIds, ['t-1', 't-2']);
});

test('recipe with no toolIds normalizes to an empty array', () => {
  assert.deepEqual(new Recipe({}).toolIds, []);
});

test('step-level toolIds normalize and round-trip through toJSON', () => {
  const recipe = new Recipe({
    steps: [{
      name: 'Step 1',
      ingredientSets: [{ id: 's', ingredientGroups: [] }],
      resultGroups: [{ id: 'g', name: 'G', results: [] }],
      toolIds: [' a ', 'a', 'b']
    }]
  });
  assert.deepEqual(recipe.steps[0].toolIds, ['a', 'b']);
  const json = recipe.toJSON();
  assert.deepEqual(json.steps[0].toolIds, ['a', 'b']);
});

test('ingredient-set toolIds normalize and round-trip through toJSON', () => {
  const set = new IngredientSet({ id: 's', toolIds: [' x ', 'x', 'y', ''] });
  assert.deepEqual(set.toolIds, ['x', 'y']);
  assert.deepEqual(set.toJSON().toolIds, ['x', 'y']);
});

test('recipe toolIds round-trip through toJSON', () => {
  const recipe = new Recipe({ toolIds: ['t-1', 't-2'] });
  assert.deepEqual(recipe.toJSON().toolIds, ['t-1', 't-2']);
  const rehydrated = Recipe.fromJSON(recipe.toJSON());
  assert.deepEqual(rehydrated.toolIds, ['t-1', 't-2']);
});

test('getExecutionSteps implicit step carries recipe toolIds', () => {
  const recipe = new Recipe({
    toolIds: ['t-1'],
    ingredientSets: [{ id: 's', ingredientGroups: [] }],
    resultGroups: [{ id: 'g', name: 'G', results: [] }]
  });
  const [implicit] = recipe.getExecutionSteps();
  assert.deepEqual(implicit.toolIds, ['t-1']);
});

test('getExecutionSteps explicit steps preserve their own toolIds', () => {
  const recipe = new Recipe({
    steps: [{
      name: 'Step 1',
      ingredientSets: [{ id: 's', ingredientGroups: [] }],
      resultGroups: [{ id: 'g', name: 'G', results: [] }],
      toolIds: ['step-tool']
    }]
  });
  assert.deepEqual(recipe.getExecutionSteps()[0].toolIds, ['step-tool']);
});

// ---------------------------------------------------------------------------
// getToolsForSet
// ---------------------------------------------------------------------------

test('getToolsForSet resolves the union of recipe + set toolIds and dedupes', () => {
  installSystem({
    id: 'sys-1',
    tools: [
      { id: 'tool-axe', componentId: 'c-axe' },
      { id: 'tool-saw', componentId: 'c-saw' }
    ]
  });
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: 'sys-1', toolIds: ['tool-axe'] });
  const set = new IngredientSet({ id: 's', toolIds: ['tool-saw', 'tool-axe'] });

  const tools = manager.getToolsForSet(recipe, set);
  assert.deepEqual(tools.map(t => t.id), ['tool-axe', 'tool-saw']);
});

test('getToolsForSet skips unknown tool ids without throwing', () => {
  installSystem({ id: 'sys-1', tools: [{ id: 'tool-axe', componentId: 'c-axe' }] });
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: 'sys-1', toolIds: ['tool-axe', 'missing-tool'] });
  const tools = manager.getToolsForSet(recipe, new IngredientSet({ id: 's' }));
  assert.deepEqual(tools.map(t => t.id), ['tool-axe']);
});

test('getToolsForSet returns [] when the recipe has no system', () => {
  installSystem({ id: 'sys-1', tools: [{ id: 'tool-axe', componentId: 'c-axe' }] });
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: null, toolIds: ['tool-axe'] });
  assert.deepEqual(manager.getToolsForSet(recipe, new IngredientSet({ id: 's' })), []);
});

// ---------------------------------------------------------------------------
// evaluateCraftability — toolStates / missing.tools
// ---------------------------------------------------------------------------

function craftableRecipe({ toolIds = [], setToolIds = [] } = {}) {
  return new Recipe({
    craftingSystemId: 'sys-1',
    toolIds,
    ingredientSets: [new IngredientSet({
      id: 'set-1',
      toolIds: setToolIds,
      ingredientGroups: [{
        id: 'g1',
        name: 'G1',
        options: [{ componentId: 'c-iron', quantity: 1 }]
      }]
    })],
    resultGroups: [{ id: 'rg', name: 'Out', results: [{ id: 'r', componentId: 'c-bar', quantity: 1 }] }]
  });
}

test('evaluateCraftability: present tool yields toolStates available and craftable', () => {
  installSystem({
    id: 'sys-1',
    components: [toolComponent('c-iron', 'Iron'), toolComponent('c-axe', 'Axe')],
    tools: [{ id: 'tool-axe', componentId: 'c-axe' }]
  });
  const manager = new RecipeManager();
  const recipe = craftableRecipe({ toolIds: ['tool-axe'] });
  const sourceActor = actor([item('Iron'), item('Axe')]);

  const result = manager.evaluateCraftability([sourceActor], recipe);
  assert.equal(result.toolStates.length, 1);
  assert.equal(result.toolStates[0].available, true);
  assert.equal(result.toolStates[0].name, 'Axe');
  assert.deepEqual(result.missing.tools, []);
  assert.equal(result.canCraft, true);
});

test('evaluateCraftability: missing tool yields missing.tools and blocks craft', () => {
  installSystem({
    id: 'sys-1',
    components: [toolComponent('c-iron', 'Iron'), toolComponent('c-axe', 'Axe')],
    tools: [{ id: 'tool-axe', componentId: 'c-axe' }]
  });
  const manager = new RecipeManager();
  const recipe = craftableRecipe({ toolIds: ['tool-axe'] });
  const sourceActor = actor([item('Iron')]); // ingredient present, axe absent

  const result = manager.evaluateCraftability([sourceActor], recipe);
  assert.equal(result.toolStates[0].available, false);
  assert.equal(result.missing.tools.length, 1);
  assert.equal(result.missing.tools[0].id, 'tool-axe');
  assert.equal(result.canCraft, false);
});

test('evaluateCraftability: set-level toolIds are evaluated alongside recipe-level', () => {
  installSystem({
    id: 'sys-1',
    components: [toolComponent('c-iron', 'Iron'), toolComponent('c-saw', 'Saw')],
    tools: [{ id: 'tool-saw', componentId: 'c-saw' }]
  });
  const manager = new RecipeManager();
  const recipe = craftableRecipe({ setToolIds: ['tool-saw'] });

  const missing = manager.evaluateCraftability([actor([item('Iron')])], recipe);
  assert.equal(missing.missing.tools.length, 1);
  assert.equal(missing.canCraft, false);

  const present = manager.evaluateCraftability([actor([item('Iron'), item('Saw')])], recipe);
  assert.equal(present.missing.tools.length, 0);
  assert.equal(present.canCraft, true);
});

test('evaluateCraftability: a broken matching item does NOT satisfy the tool', () => {
  installSystem({
    id: 'sys-1',
    components: [toolComponent('c-iron', 'Iron'), toolComponent('c-axe', 'Axe')],
    tools: [{ id: 'tool-axe', componentId: 'c-axe' }]
  });
  const manager = new RecipeManager();
  const recipe = craftableRecipe({ toolIds: ['tool-axe'] });
  const brokenAxe = { name: 'Axe', getFlag: (ns, flag) => ns === 'fabricate' && flag === 'toolBroken' };
  const result = manager.evaluateCraftability([actor([item('Iron'), brokenAxe])], recipe);
  assert.equal(result.toolStates[0].available, false);
  assert.equal(result.canCraft, false);
});

test('evaluateCraftability: no toolIds leaves toolStates/missing.tools empty', () => {
  installSystem({ id: 'sys-1', components: [toolComponent('c-iron', 'Iron')], tools: [] });
  const manager = new RecipeManager();
  const recipe = craftableRecipe();
  const result = manager.evaluateCraftability([actor([item('Iron')])], recipe);
  assert.deepEqual(result.toolStates, []);
  assert.deepEqual(result.missing.tools, []);
  assert.equal(result.canCraft, true);
});

test('canCraft passes through missing.tools', () => {
  installSystem({
    id: 'sys-1',
    components: [toolComponent('c-iron', 'Iron'), toolComponent('c-axe', 'Axe')],
    tools: [{ id: 'tool-axe', componentId: 'c-axe' }]
  });
  const manager = new RecipeManager();
  const recipe = craftableRecipe({ toolIds: ['tool-axe'] });
  const result = manager.canCraft([actor([item('Iron')])], recipe);
  assert.equal(result.canCraft, false);
  assert.equal(result.missing.tools.length, 1);
});

// ---------------------------------------------------------------------------
// toolMatchesItemByIdentity — durable-identity gate for usage/breakage. Retargeted
// onto the TOOL's own identity `roles[sys].toolId` (issue 561, superseding the #557
// component-scoped gate). The tool is a first-class item carrying its own source refs.
// ---------------------------------------------------------------------------

const HAMMER_TOOL = {
  id: 'tool-hammer',
  componentId: 'c-hammer',
  name: 'Hammer',
  registeredItemUuid: 'Item.hammer-src',
  originItemUuid: 'Item.hammer-src',
  aliasItemUuids: []
};

function identitySystem() {
  return installSystem({
    id: 'sys-1',
    components: [
      component('c-hammer', { registeredItemUuid: 'Item.hammer-src', name: 'Hammer' }),
      component('c-tongs', { registeredItemUuid: 'Item.tongs-src', name: 'Tongs' })
    ],
    tools: [HAMMER_TOOL]
  });
}

test('toolMatchesItemByIdentity: durable roles-flag item matches its tool', () => {
  identitySystem();
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: 'sys-1' });
  const durable = roleItem({ uuid: 'Item.h1', roles: { 'sys-1': { toolId: 'tool-hammer' } }, name: 'Hammer' });
  assert.equal(manager.toolMatchesItemByIdentity(recipe, HAMMER_TOOL, durable), true);
});

test('toolMatchesItemByIdentity: an own-compendiumSource item matches its tool', () => {
  identitySystem();
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: 'sys-1' });
  const copy = roleItem({ uuid: 'Item.h2', compendiumSource: 'Item.hammer-src', name: 'Hammer' });
  assert.equal(manager.toolMatchesItemByIdentity(recipe, HAMMER_TOOL, copy), true);
});

test('toolMatchesItemByIdentity: a duplicateSource decoy does NOT match (but presence does)', () => {
  identitySystem();
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: 'sys-1' });
  const decoy = roleItem({ uuid: 'Item.h3', duplicateSource: 'Item.hammer-src', name: 'Mallet' });
  assert.equal(manager.toolMatchesItemByIdentity(recipe, HAMMER_TOOL, decoy), false);
  // The wide presence matcher still accepts it — proving this is narrower, not vacuous.
  assert.equal(manager.toolMatchesItem(recipe, HAMMER_TOOL, decoy), true);
});

test('toolMatchesItemByIdentity: a same-name decoy does NOT match (but presence does)', () => {
  identitySystem();
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: 'sys-1' });
  const decoy = roleItem({ uuid: 'Item.h4', name: 'Hammer' });
  assert.equal(manager.toolMatchesItemByIdentity(recipe, HAMMER_TOOL, decoy), false);
  assert.equal(manager.toolMatchesItem(recipe, HAMMER_TOOL, decoy), true);
});

test('toolMatchesItemByIdentity: false when the tool has no id', () => {
  identitySystem();
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: 'sys-1' });
  const durable = roleItem({ uuid: 'Item.h5', roles: { 'sys-1': { toolId: 'tool-hammer' } } });
  assert.equal(manager.toolMatchesItemByIdentity(recipe, {}, durable), false);
});

test('toolMatchesItemByIdentity: false for an item that claims a different tool', () => {
  identitySystem();
  const manager = new RecipeManager();
  const recipe = new Recipe({ craftingSystemId: 'sys-1' });
  const durable = roleItem({ uuid: 'Item.h6', roles: { 'sys-1': { toolId: 'tool-other' } }, name: 'Hammer' });
  assert.equal(manager.toolMatchesItemByIdentity(recipe, HAMMER_TOOL, durable), false);
});
