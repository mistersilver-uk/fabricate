/**
 * Editor Store essence actions tests
 *
 * Tests covering:
 * 1. addEssence adds a new essence to the set
 * 2. addEssence does not overwrite an existing essence
 * 3. updateEssence changes or adds the quantity
 * 4. updateEssence removes the essence when quantity is zero
 * 5. removeEssence deletes the essence key
 * 6. removeEssence is a no-op for missing keys
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

let idCounter = 0;

function mockServices(overrides = {}) {
  return {
    randomID: () => `id-${++idCounter}`,
    getSystem: () => ({
      advancedOptionsEnabled: true,
      features: { essences: true }
    }),
    getItems: () => [],
    saveRecipe: async () => {},
    onClose: () => {},
    notify: () => {},
    ...overrides
  };
}

function makeRecipe(overrides = {}) {
  const base = {
    id: overrides.id || `recipe-${++idCounter}`,
    name: overrides.name || 'Test Recipe',
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'general',
    craftingSystemId: overrides.craftingSystemId || 'sys1',
    enabled: true,
    locked: false,
    linkedRecipeItemUuid: '',
    visibility: { restricted: false, allowedUserIds: [] },
    isVariable: false,
    transferEffects: false,
    outcomeRouting: {},
    ingredientSets: overrides.ingredientSets || [],
    resultGroups: overrides.resultGroups || [],
    results: [],
    steps: [],
    metadata: undefined,
    ...overrides
  };
  base.toJSON = () => ({ ...base });
  return base;
}

const { createEditorStore } = await import('../../src/ui/svelte/stores/editorStore.js');

describe('editorStore essence actions', () => {
  beforeEach(() => { idCounter = 0; });

  it('addEssence adds a new essence to the set', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: {} }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.addEssence(0, 'fire', 3);

    const $draft = get(store.draft);
    assert.equal($draft.ingredientSets[0].essences.fire, 3);
  });

  it('addEssence does not overwrite an existing essence', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 5 } }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.addEssence(0, 'fire', 10);

    const $draft = get(store.draft);
    assert.equal($draft.ingredientSets[0].essences.fire, 5);
  });

  it('addEssence defaults quantity to 1', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: {} }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.addEssence(0, 'water');

    const $draft = get(store.draft);
    assert.equal($draft.ingredientSets[0].essences.water, 1);
  });

  it('updateEssence changes the quantity', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 2 } }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.updateEssence(0, 'fire', 7);

    const $draft = get(store.draft);
    assert.equal($draft.ingredientSets[0].essences.fire, 7);
  });

  it('updateEssence adds a missing essence when quantity is greater than zero', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 3 } }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.updateEssence(0, 'water', 5);

    const $draft = get(store.draft);
    assert.equal($draft.ingredientSets[0].essences.fire, 3);
    assert.equal($draft.ingredientSets[0].essences.water, 5);
  });

  it('updateEssence removes an essence when quantity is zero', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 2, water: 4 } }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.updateEssence(0, 'fire', 0);

    const $draft = get(store.draft);
    assert.equal(Object.hasOwn($draft.ingredientSets[0].essences, 'fire'), false);
    assert.equal($draft.ingredientSets[0].essences.water, 4);
  });

  it('updateEssence is a no-op for missing essence key when quantity is zero', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 2 } }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.updateEssence(0, 'water', 0);

    const $draft = get(store.draft);
    assert.equal($draft.ingredientSets[0].essences.water, undefined);
    assert.equal($draft.ingredientSets[0].essences.fire, 2);
  });

  it('removeEssence deletes the essence key', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 2, water: 3 } }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.removeEssence(0, 'fire');

    const $draft = get(store.draft);
    assert.equal(Object.hasOwn($draft.ingredientSets[0].essences, 'fire'), false);
    assert.equal($draft.ingredientSets[0].essences.water, 3);
  });

  it('removeEssence is a no-op for missing key', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 2 } }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.removeEssence(0, 'nonexistent');

    const $draft = get(store.draft);
    assert.equal($draft.ingredientSets[0].essences.fire, 2);
  });

  it('addEssence initializes essences object when missing', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [] }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.addEssence(0, 'light', 2);

    const $draft = get(store.draft);
    assert.equal($draft.ingredientSets[0].essences.light, 2);
  });
});
