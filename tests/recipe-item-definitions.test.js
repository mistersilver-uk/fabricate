import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';

let idCounter = 0;

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = {
  utils: {
    getProperty,
    randomID: () => `id-${++idCounter}`
  }
};

globalThis.game = {
  user: { isGM: true, name: 'Test GM' },
  actors: [],
  settings: {
    get: () => [],
    set: async () => {}
  }
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

globalThis.fromUuid = async () => null;
globalThis.fromUuidSync = () => null;

test('_normalizeComponentDescription extracts plain text from Foundry-style description objects', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(
    manager._normalizeComponentDescription({ value: '<p>Fresh <strong>silverweed</strong>.</p>' }),
    'Fresh silverweed.'
  );
});

test('_normalizeComponentDescription does not stringify unknown objects', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(manager._normalizeComponentDescription({ unexpected: 'shape' }), '');
});

test('_extractSourceDescription skips object fallback text instead of returning object strings', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(
    manager._extractSourceDescription({
      system: {
        description: {
          value: '<p>Dreamleaf petals.</p>'
        }
      }
    }),
    'Dreamleaf petals.'
  );
  assert.equal(
    manager._extractSourceDescription({
      system: {
        description: {
          unexpected: '<p>Should not stringify the object.</p>'
        }
      }
    }),
    ''
  );
});

test('addRecipeItemFromUuid adds a recipe item definition without creating a component', async () => {
  globalThis.fromUuid = async (uuid) => ({
    documentName: 'Item',
    uuid,
    name: 'Formula Book',
    img: 'icons/svg/book.svg',
    system: {
      description: {
        value: '<p>Arcane instructions</p>'
      }
    }
  });

  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy',
    components: [{
      id: 'component-1',
      name: 'Mandrake',
      img: 'icons/svg/item-bag.svg',
      description: ''
    }]
  }));

  const result = await manager.addRecipeItemFromUuid('sys-1', 'Compendium.world.formulas.book-1');

  assert.equal(result.action, 'added');
  assert.equal(manager.getRecipeItemDefinitions('sys-1').length, 1);
  assert.equal(manager.getItems('sys-1').length, 1);
  assert.equal(manager.getItems('sys-1')[0].id, 'component-1');
  assert.equal(manager.getRecipeItemDefinitions('sys-1')[0].name, 'Formula Book');
});

test('migrateLegacyRecipeItems reuses one recipe item definition for shared legacy UUIDs', async () => {
  let systemsSaved = false;
  let recipesSaved = false;
  const recipes = [
    {
      id: 'recipe-1',
      name: 'Potion A',
      img: 'icons/svg/item-bag.svg',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() { return { ...this }; }
    },
    {
      id: 'recipe-2',
      name: 'Potion B',
      img: 'icons/svg/item-bag.svg',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() { return { ...this }; }
    }
  ];
  const recipeManager = {
    getRecipes: ({ craftingSystemId } = {}) => (craftingSystemId
      ? recipes.filter(recipe => recipe.craftingSystemId === craftingSystemId)
      : recipes),
    save: async () => { recipesSaved = true; }
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.save = async () => { systemsSaved = true; };
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy'
  }));

  await manager._migrateLegacyRecipeItems();

  const definitions = manager.getRecipeItemDefinitions('sys-1');
  assert.equal(definitions.length, 1);
  assert.equal(recipes[0].recipeItemId, definitions[0].id);
  assert.equal(recipes[1].recipeItemId, definitions[0].id);
  assert.equal(systemsSaved, true);
  assert.equal(recipesSaved, true);
});

test('deleteRecipeItemDefinition removes the system recipe item and clears affected recipe references', async () => {
  let systemsSaved = false;
  let recipesSaved = false;
  const recipes = [
    {
      id: 'recipe-1',
      name: 'Potion A',
      craftingSystemId: 'sys-1',
      recipeItemId: 'recipe-item-1',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() { return { ...this }; }
    },
    {
      id: 'recipe-2',
      name: 'Potion B',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() { return { ...this }; }
    }
  ];

  const recipeManager = {
    getRecipes: ({ craftingSystemId } = {}) => (craftingSystemId
      ? recipes.filter(recipe => recipe.craftingSystemId === craftingSystemId)
      : recipes),
    save: async () => { recipesSaved = true; }
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.save = async () => { systemsSaved = true; };
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy',
    recipeItemDefinitions: [{
      id: 'recipe-item-1',
      name: 'Formula Book',
      img: 'icons/svg/book.svg',
      sourceItemUuid: 'Compendium.world.formulas.book-1'
    }]
  }));

  const result = await manager.deleteRecipeItemDefinition('sys-1', 'recipe-item-1');

  assert.equal(result.deleted, true);
  assert.deepEqual(
    result.affectedRecipes.map(recipe => recipe.id),
    ['recipe-1', 'recipe-2']
  );
  assert.equal(manager.getRecipeItemDefinitions('sys-1').length, 0);
  assert.equal(recipes[0].recipeItemId, null);
  assert.equal(recipes[0].linkedRecipeItemUuid, null);
  assert.equal(recipes[1].recipeItemId, null);
  assert.equal(recipes[1].linkedRecipeItemUuid, null);
  assert.equal(systemsSaved, true);
  assert.equal(recipesSaved, true);
});

test('RecipeVisibilityService matches recipeItemId through the system recipe item definition', () => {
  const system = {
    id: 'sys-1',
    resolutionMode: 'simple',
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'item' } },
    recipeItemDefinitions: [{
      id: 'recipe-item-1',
      sourceItemUuid: 'Compendium.world.formulas.book-1'
    }]
  };
  const service = new RecipeVisibilityService(
    { getRecipes: () => [] },
    {
      getSystem: (systemId) => (systemId === 'sys-1' ? system : null),
      getRecipeItemDefinition: (systemId, recipeItemId) =>
        systemId === 'sys-1'
          ? system.recipeItemDefinitions.find(def => def.id === recipeItemId) || null
          : null
    }
  );

  const recipe = {
    id: 'recipe-1',
    craftingSystemId: 'sys-1',
    recipeItemId: 'recipe-item-1'
  };
  const item = {
    uuid: 'Item.actor-owned-formula',
    flags: {
      core: {
        sourceId: 'Compendium.world.formulas.book-1'
      }
    }
  };

  assert.equal(service._isMatchingRecipeItem(recipe, item), true);
});
