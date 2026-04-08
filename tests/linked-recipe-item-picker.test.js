/**
 * Linked recipe item picker coverage through the active editor store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createEditorStore } from '../src/ui/svelte/stores/editorStore.js';

let idCounter = 0;

function mockServices(overrides = {}) {
  return {
    randomID: () => `id-${++idCounter}`,
    getSystem: () => ({
      advancedOptionsEnabled: true,
      features: {},
      recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'item' } }
    }),
    getItems: () => [],
    getRecipeItemDefinitions: () => [],
    getRecipeItemUsage: () => [],
    deleteRecipeItemDefinition: async () => ({ deleted: true, affectedRecipes: [] }),
    confirmDialog: async () => true,
    localize: (key) => key,
    resolveItem: () => null,
    saveRecipe: async () => {},
    onClose: () => {},
    notify: () => {},
    ...overrides
  };
}

function makeRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'sys1',
    img: 'icons/svg/item-bag.svg',
    recipeItemId: '',
    linkedRecipeItemUuid: '',
    ingredientSets: [],
    results: [],
    steps: [],
    toJSON: () => ({
      id: 'recipe-1',
      name: 'Test Recipe',
      craftingSystemId: 'sys1',
      img: 'icons/svg/item-bag.svg',
      recipeItemId: '',
      linkedRecipeItemUuid: '',
      ...overrides
    }),
    ...overrides
  };
}

test('editor store reports a validation error when a recipe item is required but missing', () => {
  const store = createEditorStore(mockServices(), { craftingSystemId: 'sys1' });
  store.setField('name', 'Test Recipe');

  const errors = get(store.validationErrors);

  assert.ok(errors.some(error => error.message.toLowerCase().includes('recipe item')));
});

test('editor store maps linked recipe item UUIDs back to recipe item definitions', () => {
  const store = createEditorStore(mockServices({
    getRecipeItemDefinitions: () => [{
      id: 'recipe-item-123',
      name: 'Formula Book',
      sourceItemUuid: 'Item.formula-book',
      img: 'icons/svg/book.svg'
    }]
  }), { craftingSystemId: 'sys1' });

  store.setLinkedRecipeItemUuid('Item.formula-book');

  const draft = get(store.draft);
  assert.equal(draft.recipeItemId, 'recipe-item-123');
  assert.equal(draft.linkedRecipeItemUuid, 'Item.formula-book');
  assert.equal(draft.img, 'icons/svg/book.svg');
});

test('editor store clears linked recipe item aliases together', () => {
  const store = createEditorStore(mockServices({
    getRecipeItemDefinitions: () => [{
      id: 'recipe-item-abc',
      sourceItemUuid: 'Item.recipe-abc'
    }]
  }), {
    recipe: makeRecipe({
      recipeItemId: 'recipe-item-abc',
      linkedRecipeItemUuid: 'Item.recipe-abc'
    })
  });

  store.clearLinkedRecipeItem();

  assert.equal(get(store.draft).recipeItemId, '');
  assert.equal(get(store.draft).linkedRecipeItemUuid, '');
});

test('editor store deletes a recipe item definition after confirmation and clears current selection', async () => {
  let deleteArgs = null;
  const store = createEditorStore(mockServices({
    getRecipeItemDefinitions: () => [{
      id: 'recipe-item-123',
      sourceItemUuid: 'Item.formula-book',
      img: 'icons/svg/book.svg',
      name: 'Formula Book'
    }],
    getRecipeItemUsage: () => [{ id: 'recipe-1', name: 'Potion A' }],
    deleteRecipeItemDefinition: async (systemId, recipeItemId) => {
      deleteArgs = { systemId, recipeItemId };
      return { deleted: true, affectedRecipes: [] };
    }
  }), { craftingSystemId: 'sys1' });
  store.setRecipeItemId('recipe-item-123');

  const deleted = await store.deleteRecipeItemDefinition('recipe-item-123');

  assert.equal(deleted, true);
  assert.deepEqual(deleteArgs, { systemId: 'sys1', recipeItemId: 'recipe-item-123' });
  assert.equal(get(store.recipeItemDefinitionsVersion), 1);
  assert.equal(get(store.draft).recipeItemId, '');
  assert.equal(get(store.draft).linkedRecipeItemUuid, '');
});
