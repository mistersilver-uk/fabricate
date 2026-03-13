/**
 * Editor Store reactivity tests
 *
 * Verifies that the activeContainers derived store emits new array references
 * whenever the draft is mutated, so that downstream Svelte $derived expressions
 * and {#each} blocks detect the change and re-render.
 *
 * Tests:
 * 1. addIngredientGroup emits new ingredientSets reference with new group
 * 2. addIngredientSet (complex recipes) emits new ingredientSets reference with new set
 * 3. addEssence emits new ingredientSets reference with essence in set
 * 4. addCatalystRow emits new ingredientSets reference with catalyst in set
 * 5. addResultRow emits new results reference with new result row
 * 6. Array references change between successive emissions
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

let idCounter = 0;

function mockServices(overrides = {}) {
  return {
    randomID: () => `id-${++idCounter}`,
    getSystem: () => null,
    getItems: () => [],
    saveRecipe: async () => {},
    onClose: () => {},
    notify: () => {},
    ...overrides
  };
}

function complexServices(overrides = {}) {
  return mockServices({
    getSystem: () => ({
      advancedOptionsEnabled: true,
      features: { complexRecipes: true }
    }),
    ...overrides
  });
}

function essenceServices(overrides = {}) {
  return mockServices({
    getSystem: () => ({
      advancedOptionsEnabled: true,
      features: { essences: true }
    }),
    ...overrides
  });
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

describe('editorStore activeContainers reactivity', () => {
  beforeEach(() => { idCounter = 0; });

  it('addIngredientGroup emits new ingredientSets reference with the new group', () => {
    const recipe = makeRecipe();
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    const before = get(store.activeContainers);
    const refBefore = before.ingredientSets;
    // addIngredientGroup adds a group inside the first set, not a new set
    const groupsBefore = before.ingredientSets[0]?.ingredientGroups?.length ?? 0;

    store.addIngredientGroup(0);

    const after = get(store.activeContainers);
    const groupsAfter = after.ingredientSets[0]?.ingredientGroups?.length ?? 0;
    assert.equal(groupsAfter, groupsBefore + 1,
      'ingredientGroups within the first set should grow after addIngredientGroup');
    assert.notEqual(after.ingredientSets, refBefore,
      'ingredientSets array reference must change after addIngredientGroup');
  });

  it('addIngredientSet emits new ingredientSets reference with the new set (complexRecipes=true)', () => {
    const recipe = makeRecipe();
    const store = createEditorStore(complexServices(), { recipe, craftingSystemId: 'sys1' });

    const before = get(store.activeContainers);
    const refBefore = before.ingredientSets;
    const countBefore = refBefore.length;

    store.addIngredientSet();

    const after = get(store.activeContainers);
    assert.equal(after.ingredientSets.length, countBefore + 1,
      'ingredientSets should contain the new set');
    assert.notEqual(after.ingredientSets, refBefore,
      'ingredientSets array reference must change after addIngredientSet');
  });

  it('addIngredientSet is a no-op when complexRecipes=false', () => {
    const recipe = makeRecipe();
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    const before = get(store.activeContainers);
    const countBefore = before.ingredientSets.length;

    store.addIngredientSet();

    const after = get(store.activeContainers);
    assert.equal(after.ingredientSets.length, countBefore,
      'addIngredientSet should be a no-op when complexRecipes is disabled');
  });

  it('addEssence emits new ingredientSets reference with essence in set', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: {} }]
    });
    const store = createEditorStore(essenceServices(), { recipe, craftingSystemId: 'sys1' });

    const before = get(store.activeContainers);
    const refBefore = before.ingredientSets;

    store.addEssence(0, 'fire', 2);

    const after = get(store.activeContainers);
    assert.equal(after.ingredientSets[0].essences.fire, 2,
      'essence fire should appear in the set');
    assert.notEqual(after.ingredientSets, refBefore,
      'ingredientSets array reference must change after addEssence');
  });

  it('addCatalystRow emits new ingredientSets reference with catalyst in set', () => {
    const recipe = makeRecipe();
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    const before = get(store.activeContainers);
    const refBefore = before.ingredientSets;
    const catalystsBefore = before.ingredientSets[0]?.catalysts?.length ?? 0;

    store.addCatalystRow(0);

    const after = get(store.activeContainers);
    const catalystsAfter = after.ingredientSets[0]?.catalysts?.length ?? 0;
    assert.equal(catalystsAfter, catalystsBefore + 1,
      'catalyst array should grow after addCatalystRow');
    assert.notEqual(after.ingredientSets, refBefore,
      'ingredientSets array reference must change after addCatalystRow');
  });

  it('addResultRow emits new results reference with new result row', () => {
    const recipe = makeRecipe();
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    const before = get(store.activeContainers);
    const refBefore = before.results;
    const countBefore = before.results[0]?.results?.length ?? 0;

    store.addResultRow(0);

    const after = get(store.activeContainers);
    const countAfter = after.results[0]?.results?.length ?? 0;
    assert.equal(countAfter, countBefore + 1,
      'result rows should grow after addResultRow');
    assert.notEqual(after.results, refBefore,
      'results array reference must change after addResultRow');
  });

  it('updateEssence produces a new essences object reference on the set', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 2 } }]
    });
    const store = createEditorStore(essenceServices(), { recipe, craftingSystemId: 'sys1' });

    const before = get(store.activeContainers);
    const essencesBefore = before.ingredientSets[0].essences;

    store.updateEssence(0, 'fire', 5);

    const after = get(store.activeContainers);
    assert.equal(after.ingredientSets[0].essences.fire, 5,
      'essence quantity should be updated');
    assert.notEqual(after.ingredientSets[0].essences, essencesBefore,
      'essences object reference must change after updateEssence');
    assert.notEqual(after.ingredientSets, before.ingredientSets,
      'ingredientSets array reference must change after updateEssence');
  });

  it('removeEssence produces a new essences object reference on the set', () => {
    const recipe = makeRecipe({
      ingredientSets: [{ id: 'set1', ingredientGroups: [], essences: { fire: 2, water: 3 } }]
    });
    const store = createEditorStore(essenceServices(), { recipe, craftingSystemId: 'sys1' });

    const before = get(store.activeContainers);
    const essencesBefore = before.ingredientSets[0].essences;

    store.removeEssence(0, 'fire');

    const after = get(store.activeContainers);
    assert.equal(Object.hasOwn(after.ingredientSets[0].essences, 'fire'), false,
      'fire essence should be removed');
    assert.equal(after.ingredientSets[0].essences.water, 3,
      'water essence should remain');
    assert.notEqual(after.ingredientSets[0].essences, essencesBefore,
      'essences object reference must change after removeEssence');
  });

  it('array references change between successive emissions', () => {
    const recipe = makeRecipe();
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    const containers1 = get(store.activeContainers);

    store.addIngredientGroup(0);
    const containers2 = get(store.activeContainers);

    store.addIngredientGroup(0);
    const containers3 = get(store.activeContainers);

    assert.notEqual(containers1.ingredientSets, containers2.ingredientSets,
      'first and second ingredientSets references must differ');
    assert.notEqual(containers2.ingredientSets, containers3.ingredientSets,
      'second and third ingredientSets references must differ');
    assert.notEqual(containers1.results, containers2.results,
      'results reference must also change between emissions');
  });
});
