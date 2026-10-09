/** The per-call station presence views (issue 2265), over a real RecipeManager and CraftingEngine. */
import assert from 'node:assert/strict';
import test from 'node:test';

// RecipeManager falls back to `game.fabricate` for its system manager; there is none here.
Object.assign(globalThis, { game: { user: { isGM: true }, fabricate: null } });

const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { engineWithStationPresence, normalizeStationPresence, withStationPresence } =
  await import('../src/systems/stationPresence.js');

const STATION = Object.freeze({ systemId: 'sys-1', componentIds: [], toolIds: ['tool-anvil'] });

function fixture() {
  const system = {
    id: 'sys-1',
    components: [],
    tools: [{ id: 'tool-anvil', name: 'Anvil' }],
    characterPrerequisites: [],
    resolutionMode: 'simple',
    features: {},
  };
  const recipeManager = new RecipeManager({
    getCraftingSystem: (systemId) => (systemId === system.id ? system : null),
  });
  const recipe = new Recipe({
    id: 'recipe-1',
    craftingSystemId: system.id,
    toolIds: ['tool-anvil'],
    ingredientSets: [new IngredientSet({ id: 'set-1', ingredientGroups: [] })],
    resultGroups: [
      { id: 'rg', name: 'Out', results: [{ id: 'r', componentId: 'c', quantity: 1 }] },
    ],
  });
  const tools = recipeManager.getToolsForSet(recipe, recipe.ingredientSets[0]);
  const actor = { id: 'a', items: [], getRollData: () => ({}) };
  return { recipeManager, recipe, tools, actor };
}

const ownState = (object) => Reflect.ownKeys(object).map((key) => [key, object[key]]);

test('fills the station when the caller passes no presentTools, undefined or null', () => {
  const { recipeManager, recipe, tools, actor } = fixture();
  const view = withStationPresence(recipeManager, STATION);
  for (const options of [undefined, {}, { presentTools: undefined }, { presentTools: null }]) {
    const label = JSON.stringify(options ?? 'absent');
    const states = view.resolveToolStates(recipe, tools, [actor], options);
    assert.equal(states[0].available, true, label);
    assert.equal(states[0].virtual, true, label);
    assert.equal(view.evaluateCraftability([actor], recipe, options).canCraft, true, label);
  }
  assert.equal(recipeManager.resolveToolStates(recipe, tools, [actor])[0].available, false);
});

test("a caller's own presentTools wins over the station", () => {
  const { recipeManager, recipe, tools, actor } = fixture();
  const view = withStationPresence(recipeManager, STATION);
  const other = { systemId: 'sys-2', componentIds: [], toolIds: ['tool-anvil'] };
  assert.equal(
    view.resolveToolStates(recipe, tools, [actor], { presentTools: other })[0].available,
    false
  );
  assert.equal(view.evaluateCraftability([actor], recipe, { presentTools: other }).canCraft, false);
});

test('inherited methods dispatch through the view, so canCraft sees the station', () => {
  const { recipeManager, recipe, actor } = fixture();
  assert.equal(
    withStationPresence(recipeManager, STATION).canCraft([actor], recipe).canCraft,
    true
  );
  assert.equal(recipeManager.canCraft([actor], recipe).canCraft, false);
});

test('a payload that names no crafting system returns the identical objects', () => {
  const { recipeManager } = fixture();
  const engine = new CraftingEngine(recipeManager);
  const malformed = [
    null,
    undefined,
    'sys-1',
    ['tool-anvil'],
    {},
    { systemId: '' },
    { systemId: 7, toolIds: ['tool-anvil'] },
  ];
  for (const payload of malformed) {
    assert.equal(withStationPresence(recipeManager, payload), recipeManager, String(payload));
    assert.equal(engineWithStationPresence(engine, payload), engine, String(payload));
    assert.equal(normalizeStationPresence(payload), null, String(payload));
  }
});

test('normalises the payload to string ids only', () => {
  assert.deepEqual(
    normalizeStationPresence({ systemId: 'sys-1', componentIds: 'c', toolIds: ['t', '', 3], x: 1 }),
    { systemId: 'sys-1', componentIds: [], toolIds: ['t'] }
  );
});

test('a real engine method run through the view reports the station Tool virtual', async () => {
  const { recipeManager, recipe, tools, actor } = fixture();
  const engine = new CraftingEngine(recipeManager);
  const before = { engine: ownState(engine), recipeManager: ownState(recipeManager) };
  const view = engineWithStationPresence(engine, STATION);

  const validated = await view._validateTools([actor], recipe, tools, null, actor);

  assert.equal(validated.valid, true, validated.message);
  assert.equal(validated.tools[0].virtual, true);
  assert.equal(validated.tools[0].item, null);
  assert.equal((await engine._validateTools([actor], recipe, tools, null, actor)).valid, false);
  assert.deepEqual(ownState(engine), before.engine, 'the shared engine gains no own property');
  assert.deepEqual(ownState(recipeManager), before.recipeManager, 'nor does the shared manager');
  assert.equal(engine.recipeManager, recipeManager);
});
