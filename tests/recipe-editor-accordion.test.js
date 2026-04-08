/**
 * Recipe editor accordion behavior through the active editor store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createEditorStore } from '../src/ui/svelte/stores/editorStore.js';

let idCounter = 0;

function services(overrides = {}) {
  return {
    randomID: () => `id-${++idCounter}`,
    getSystem: () => ({
      advancedOptionsEnabled: true,
      features: { complexRecipes: true, multiStepRecipes: false },
      resolutionMode: 'simple'
    }),
    getItems: () => [],
    getRecipeItemDefinitions: () => [],
    getRecipeItemUsage: () => [],
    deleteRecipeItemDefinition: async () => ({ deleted: true, affectedRecipes: [] }),
    confirmDialog: async () => true,
    localize: (key) => key,
    resolveItem: () => null,
    saveRecipe: async () => {},
    notify: () => {},
    ...overrides
  };
}

function seedAccordionDraft(store, ingredientSetCount = 3, resultGroupCount = 3) {
  store.updateDraft(draft => {
    draft.name = 'Accordion Recipe';
    draft.ingredientSets = Array.from({ length: ingredientSetCount }, (_, index) => ({
      id: `set-${index + 1}`,
      name: `Set ${index + 1}`,
      ingredientGroups: [{
        id: `group-${index + 1}`,
        name: 'Group 1',
        options: [{ id: `opt-${index + 1}`, matchType: 'component', componentId: 'item-ingredient', quantity: 1, tagsText: '', tagMatch: 'any' }]
      }],
      catalysts: [],
      essences: {},
      resultGroupId: null,
      resultMapping: []
    }));
    draft.results = Array.from({ length: resultGroupCount }, (_, index) => ({
      id: `rg-${index + 1}`,
      name: `Result Group ${index + 1}`,
      results: [{ id: `res-${index + 1}`, componentId: 'item-result', quantity: 1, propertyMacroUuid: null }]
    }));
  });
}

test('editor store togglePanel controls collapsedPanels state', () => {
  const store = createEditorStore(services(), { craftingSystemId: 'sys1' });

  store.togglePanel('set-1');
  assert.equal(get(store.collapsedPanels).has('set-1'), true);

  store.togglePanel('set-1');
  assert.equal(get(store.collapsedPanels).has('set-1'), false);
});

test('editor store moves ingredient sets while preserving IDs', () => {
  const store = createEditorStore(services(), { craftingSystemId: 'sys1' });
  seedAccordionDraft(store, 3, 1);

  store.moveIngredientSetUp(2);

  assert.deepEqual(get(store.draft).ingredientSets.map(set => set.id), ['set-1', 'set-3', 'set-2']);
});

test('editor store moves result groups while preserving IDs', () => {
  const store = createEditorStore(services(), { craftingSystemId: 'sys1' });
  seedAccordionDraft(store, 1, 3);

  store.moveResultGroupDown(0);

  assert.deepEqual(get(store.draft).results.map(group => group.id), ['rg-2', 'rg-1', 'rg-3']);
});

test('editor store removeIngredientSet removes the targeted panel and clears its collapsed state', () => {
  const store = createEditorStore(services(), { craftingSystemId: 'sys1' });
  seedAccordionDraft(store, 3, 1);
  store.togglePanel('set-2');

  store.removeIngredientSet(1);

  assert.deepEqual(get(store.draft).ingredientSets.map(set => set.id), ['set-1', 'set-3']);
  assert.equal(get(store.collapsedPanels).has('set-2'), false);
});

test('editor store payload is unchanged by accordion collapsed state', async () => {
  let savedPayload = null;
  const store = createEditorStore(services({
    saveRecipe: async (payload) => { savedPayload = payload; }
  }), { craftingSystemId: 'sys1' });
  seedAccordionDraft(store, 2, 2);
  store.togglePanel('set-1');
  store.togglePanel('rg-1');

  const result = await store.saveRecipe();

  assert.equal(result.success, true);
  assert.deepEqual(savedPayload.ingredientSets.map(set => set.id), ['set-1', 'set-2']);
  assert.deepEqual(savedPayload.resultGroups.map(group => group.id), ['rg-1', 'rg-2']);
});
