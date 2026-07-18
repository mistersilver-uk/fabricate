/**
 * Cascade-safe vocabulary deletion + per-category icon persistence in adminStore
 * (issue 689). Deleting a referenced recipe/component category reassigns the
 * affected records to `general`; deleting a referenced tag strips it from every
 * component that carries it; category icons round-trip through the store's write
 * ops. The mock manager tracks the record + system writes the store issues.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';

function createServices() {
  const store = {};
  const system = {
    id: 'sys1',
    name: 'System One',
    resolutionMode: 'simple',
    features: {},
    recipeVisibility: { listMode: 'global' },
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    tools: [],
    categories: ['Potions', 'Elixirs'],
    categoryIcons: { potions: 'fas fa-flask' },
    componentCategories: ['Reagent'],
    componentCategoryIcons: { reagent: 'fas fa-leaf' },
    itemTags: ['herb', 'ore'],
    components: [
      { id: 'c1', name: 'Iron Ore', category: 'Reagent', tags: ['ore', 'metal'] },
      { id: 'c2', name: 'Sage', category: 'general', tags: ['herb'] },
    ],
  };
  const makeRecipe = (id, category) => ({
    id,
    name: id,
    img: 'icons/svg/item-bag.svg',
    description: '',
    category,
    steps: [],
    ingredientSets: [],
    resultGroups: [],
    toJSON() {
      return {
        id,
        name: id,
        category,
        steps: [],
        ingredientSets: [],
        resultGroups: [],
      };
    },
  });
  const recipes = [makeRecipe('r1', 'Potions'), makeRecipe('r2', 'general')];
  const itemWrites = [];
  const recipeWrites = [];
  const systemManager = {
    getSystems: () => [system],
    getSystem: (id) => (id === system.id ? system : null),
    getItems: () => system.components,
    createSystem: async () => system,
    deleteSystem: async () => {},
    deleteItem: async () => {},
    updateItem: async (id, itemId, updates = {}) => {
      itemWrites.push([itemId, updates]);
      const item = system.components.find((c) => c.id === itemId);
      if (item) Object.assign(item, updates);
      return item;
    },
    updateSystem: async (id, updates = {}) => {
      if (id !== system.id) return null;
      Object.assign(system, updates);
      return system;
    },
  };
  const recipeManager = {
    getRecipes: () => recipes,
    getRecipe: (id) => recipes.find((r) => r.id === id) || null,
    updateRecipe: async (id, updates = {}) => {
      recipeWrites.push([id, updates]);
      const recipe = recipes.find((r) => r.id === id);
      if (recipe) Object.assign(recipe, updates);
      return recipe;
    },
  };
  return {
    getSetting: (key) => store[key] ?? null,
    setSetting: async (key, value) => {
      store[key] = value;
    },
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getGatheringEnvironmentStore: () => ({ list: () => [], save: async () => true }),
    getFoundrySystemId: () => 'dnd5e',
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    localize: (key) => key,
    _system: system,
    _itemWrites: itemWrites,
    _recipeWrites: recipeWrites,
  };
}

async function storeFor() {
  const services = createServices();
  const store = createAdminStore(services);
  await store.selectSystem('sys1');
  return { store, services };
}

describe('adminStore vocabulary cascade + icons (issue 689)', () => {
  it('adds a category with its icon and persists both', async () => {
    const { store, services } = await storeFor();
    await store.addCategory('Tinctures', 'fas fa-droplet');
    assert.ok(services._system.categories.includes('Tinctures'));
    assert.equal(services._system.categoryIcons.tinctures, 'fas fa-droplet');
  });

  it('persists a per-category icon edit', async () => {
    const { store, services } = await storeFor();
    await store.setCategoryIcon('Potions', 'fas fa-vial');
    assert.equal(services._system.categoryIcons.potions, 'fas fa-vial');
  });

  it('reassigns referenced recipes to general when a recipe category is deleted', async () => {
    const { store, services } = await storeFor();
    await store.removeCategory('Potions');
    assert.deepEqual(services._recipeWrites, [['r1', { category: 'general' }]]);
    assert.deepEqual(services._system.categories, ['Elixirs']);
    // The deleted category's icon is dropped alongside it.
    assert.equal(services._system.categoryIcons.potions, undefined);
  });

  it('reassigns referenced components to general when a component category is deleted', async () => {
    const { store, services } = await storeFor();
    await store.removeComponentCategory('Reagent');
    assert.deepEqual(services._itemWrites, [['c1', { category: 'general' }]]);
    assert.deepEqual(services._system.componentCategories, []);
    assert.equal(services._system.componentCategoryIcons.reagent, undefined);
  });

  it('strips a deleted tag from every component carrying it', async () => {
    const { store, services } = await storeFor();
    await store.removeTag('ore');
    assert.deepEqual(services._itemWrites, [['c1', { tags: ['metal'] }]]);
    assert.deepEqual(services._system.itemTags, ['herb']);
  });
});
