/**
 * The WRITE boundary for durable-flag map keys (issue 1143).
 *
 * A crafting-system id and a recipe id are both interpolated into dotted flag paths —
 * `roles.<systemId>.componentId` for the system, and the `learnedRecipes` /
 * `discoveryProgress` per-actor maps for the recipe. `Document#update` dot-expands the
 * whole nested VALUE TREE of an `ObjectField`, so an id containing a `.` is not stored
 * under the key it was written with, and the id -> storage mapping stops being
 * injective: learning `a.b` and then `a` destroys `a.b` before any reader runs.
 *
 * Reader-side repair (`src/systems/recipeKeyedFlagEntries.js`) is best-effort, for
 * worlds that already carry such an id. Refusing the id at intake is the complete fix,
 * and these are the tests that pin it. Loading an EXISTING world must not route through
 * either guard, or a world already holding a dotted id would be bricked rather than
 * repaired — that negative is asserted here too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
const settingsStore = new Map();

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], obj),
  },
};

globalThis.game = {
  user: { isGM: true },
  actors: [],
  fabricate: {},
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    },
  },
};

globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { isSafeFlagKeySegment } = await import('../src/config/flags.js');

function makeRecipeManager() {
  const manager = new RecipeManager();
  manager.initialized = true;
  return manager;
}

function recipeData(id) {
  return { id, name: 'Imported Recipe', craftingSystemId: 'sys-1' };
}

// The id guard runs BEFORE structural validation, so an authoring shell is enough to
// exercise it and the tests do not depend on the unrelated completeness contract.
const draft = { allowIncomplete: true, notify: false };

// The three separators that actually reach these ids in the wild: a dot (the one that
// nests), plus a space and a slash, which `isSafeFlagKeySegment` also refuses.
const UNSAFE_IDS = ['imported.recipe.id', 'a.b', 'has space', 'has/slash'];

test('1143 createRecipe REFUSES a dotted recipe id at intake', async () => {
  const manager = makeRecipeManager();

  await assert.rejects(
    () => manager.createRecipe(recipeData('imported.recipe.id'), draft),
    /Invalid recipe id "imported\.recipe\.id"/,
    'the id is named in the error so an import report can point at the offending recipe'
  );
  assert.equal(manager.getRecipes().length, 0, 'and nothing is persisted');
});

test('1143 createRecipe refuses every unsafe id shape, and accepts a generated one', async () => {
  const manager = makeRecipeManager();

  for (const id of UNSAFE_IDS) {
    assert.equal(isSafeFlagKeySegment(id), false, `${id} is an unsafe flag key segment`);
    await assert.rejects(() => manager.createRecipe(recipeData(id), draft), /Invalid recipe id/);
  }

  // `foundry.utils.randomID()` always satisfies the pattern, so the normal path is
  // unaffected — the guard must not be able to reject an id the module itself mints.
  const created = await manager.createRecipe(recipeData(undefined), draft);
  assert.ok(isSafeFlagKeySegment(created.id), 'a generated id passes');
  assert.equal(manager.getRecipes().length, 1);
});

test('1143 a world ALREADY holding a dotted recipe id still loads (repair, not brick)', async () => {
  // `initialize()` / `reload()` rehydrate through `Recipe.fromJSON`, never `createRecipe`,
  // so the intake guard cannot retroactively refuse a recipe a previous version accepted.
  // If this ever stops being true, an affected world loses its whole recipe list.
  settingsStore.set('recipes', [recipeData('imported.recipe.id')]);
  const manager = new RecipeManager();
  await manager.initialize();

  assert.equal(manager.getRecipe('imported.recipe.id')?.name, 'Imported Recipe');
  settingsStore.delete('recipes');
});

test('1143 createSystem REFUSES a dotted crafting-system id at intake', async () => {
  const manager = new CraftingSystemManager(makeRecipeManager());
  manager.initialized = true;

  await assert.rejects(
    () => manager.createSystem({ id: 'imported.system.id', name: 'Imported System' }),
    /Invalid crafting system id "imported\.system\.id"/
  );
  assert.equal(manager.getSystems().length, 0);
});

test('1143 updateSystem cannot introduce a dotted system id (the id is pinned to the target)', async () => {
  // The other half of the system write boundary: `createSystem` is guarded, and
  // `updateSystem` overrides `id` with the id it was called for, so a payload carrying a
  // dotted `id` cannot smuggle one past the guard on an edit.
  const manager = new CraftingSystemManager(makeRecipeManager());
  manager.initialized = true;
  const system = await manager.createSystem({ id: 'safe-system', name: 'Safe' });

  const updated = await manager.updateSystem(system.id, { id: 'imported.system.id', name: 'Renamed' });

  assert.equal(updated.id, 'safe-system', 'the payload id is ignored');
  assert.equal(manager.getSystem('imported.system.id'), null, 'no dotted system is registered');
});
