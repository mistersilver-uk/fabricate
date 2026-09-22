/** Cascade-safe vocabulary deletion + per-category icon persistence in adminStore (issue 689). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { createServices as createSharedServices } from './helpers/adminStoreServices.js';

function createServices() {
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
  const makeRecipe = (id, category, ingredientSets = []) => ({
    id,
    name: id,
    img: 'icons/svg/item-bag.svg',
    description: '',
    category,
    craftingSystemId: system.id,
    steps: [],
    ingredientSets,
    resultGroups: [],
    toJSON() {
      return {
        id,
        name: id,
        category,
        steps: [],
        ingredientSets,
        resultGroups: [],
      };
    },
  });
  // r3 filters an ingredient on the `ore` tag, so deleting `ore` must rewrite it,
  // not just the components that carry the tag.
  const recipes = [
    makeRecipe('r1', 'Potions'),
    makeRecipe('r2', 'general'),
    makeRecipe('r3', 'general', [
      { ingredientGroups: [{ options: [{ match: { type: 'tags', tags: ['ore'] } }] }] },
    ]),
  ];
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
  return createSharedServices(system, recipes, [], {
    settings: {},
    updateRecipe: async (id, updates = {}) => {
      recipeWrites.push([id, updates]);
      const recipe = recipes.find((r) => r.id === id);
      if (recipe) Object.assign(recipe, updates);
      return recipe;
    },
    getCraftingSystemManager: () => systemManager,
    getGatheringEnvironmentStore: () => ({ list: () => [], save: async () => true }),
    getFoundrySystemId: () => 'dnd5e',
    confirmDialog: async () => true,
    _system: system,
    _recipes: recipes,
    _itemWrites: itemWrites,
    _recipeWrites: recipeWrites,
  });
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

  it('strips a deleted tag from every component and every recipe placeholder', async () => {
    const { store, services } = await storeFor();
    await store.removeTag('ore');
    assert.deepEqual(services._itemWrites, [['c1', { tags: ['metal'] }]]);
    // The recipe tag-placeholder that filtered on `ore` is rewritten too, so no
    // recipe is left naming a tag the vocabulary no longer holds.
    assert.deepEqual(services._recipeWrites, [
      [
        'r3',
        { ingredientSets: [{ ingredientGroups: [{ options: [{ match: { type: 'tags', tags: [] } }] }] }] },
      ],
    ]);
    assert.deepEqual(services._system.itemTags, ['herb']);
  });
});

describe('deleting the row a case-only pair collapsed to (issue 1397)', () => {
  // The screen renders one row per normalized key, so one click has to answer for every spelling
  // behind it. The cascade planners already match case-insensitively; before this fix the
  // vocabulary write filtered on the exact string, so the records under BOTH spellings were
  // reassigned while one spelling stayed on disk and came back as an orphaned `Unused` row.

  it('removes every recipe-category spelling that collapses to the deleted key', async () => {
    const { store, services } = await storeFor();
    services._system.categories = ['Potions', 'potions'];
    services._recipes[1].category = 'potions';

    await store.removeCategory('Potions');

    assert.deepEqual(services._system.categories, []);
    assert.deepEqual(
      services._recipeWrites.map(([id, updates]) => [id, updates.category]),
      [
        ['r1', 'general'],
        ['r2', 'general'],
      ],
      'the recipes under BOTH spellings were reassigned, which is what makes leaving one stored ' +
        'incoherent rather than merely untidy'
    );
  });

  it('removes every component-category spelling that collapses to the deleted key', async () => {
    const { store, services } = await storeFor();
    services._system.componentCategories = ['Reagent', 'reagent'];
    services._system.components[1].category = 'reagent';

    await store.removeComponentCategory('Reagent');

    assert.deepEqual(services._system.componentCategories, []);
    assert.deepEqual(services._itemWrites.map(([id]) => id), ['c1', 'c2']);
  });

  it('removes every tag spelling that collapses to the deleted key', async () => {
    const { store, services } = await storeFor();
    services._system.itemTags = ['ore', 'ORE', 'herb'];

    await store.removeTag('ore');

    assert.deepEqual(services._system.itemTags, ['herb']);
  });
});
