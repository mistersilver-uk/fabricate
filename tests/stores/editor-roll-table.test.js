/**
 * T-088: Editor Store resultSelection Tests
 *
 * Tests covering:
 * 1. Draft initializes resultSelection from recipe data
 * 2. setResultSelection updates the draft correctly
 * 3. Payload serializes resultSelection
 * 4. Validation catches empty rollTableUuid when provider is rollTableOutcome
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

function mappedModeServices(overrides = {}) {
  return mockServices({
    getSystem: () => ({
      advancedOptionsEnabled: true,
      resolutionMode: 'mapped',
      features: { complexRecipes: true }
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

describe('editorStore resultSelection initialization', () => {
  beforeEach(() => { idCounter = 0; });

  it('draft initializes resultSelection from recipe data', () => {
    const recipe = makeRecipe({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1', macroUuid: null }
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });
    const $draft = get(store.draft);

    assert.deepEqual($draft.resultSelection, {
      provider: 'rollTableOutcome',
      rollTableUuid: 'table-uuid-1',
      macroUuid: null
    });
  });

  it('draft defaults resultSelection to null when absent', () => {
    const recipe = makeRecipe();
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });
    const $draft = get(store.draft);

    assert.equal($draft.resultSelection, null);
  });
});

describe('editorStore setResultSelection action', () => {
  beforeEach(() => { idCounter = 0; });

  it('setResultSelection sets provider to rollTableOutcome with uuid', () => {
    const store = createEditorStore(mockServices(), { craftingSystemId: 'sys1' });

    store.setResultSelection('rollTableOutcome', { rollTableUuid: 'table-abc-123' });

    const $draft = get(store.draft);
    assert.deepEqual($draft.resultSelection, {
      provider: 'rollTableOutcome',
      rollTableUuid: 'table-abc-123',
      macroUuid: null
    });
  });

  it('setResultSelection sets provider to ingredientSet', () => {
    const store = createEditorStore(mockServices(), { craftingSystemId: 'sys1' });

    store.setResultSelection('ingredientSet', {});

    const $draft = get(store.draft);
    assert.equal($draft.resultSelection.provider, 'ingredientSet');
  });

  it('setResultSelection sets provider to macroOutcome with macroUuid', () => {
    const store = createEditorStore(mockServices(), { craftingSystemId: 'sys1' });

    store.setResultSelection('macroOutcome', { macroUuid: 'macro-uuid-1' });

    const $draft = get(store.draft);
    assert.equal($draft.resultSelection.provider, 'macroOutcome');
    assert.equal($draft.resultSelection.macroUuid, 'macro-uuid-1');
  });

  it('setResultSelection with null clears resultSelection', () => {
    const recipe = makeRecipe({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-1', macroUuid: null }
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    store.setResultSelection(null, null);

    const $draft = get(store.draft);
    assert.equal($draft.resultSelection, null);
  });
});

describe('editorStore payload includes resultSelection', () => {
  beforeEach(() => { idCounter = 0; });

  it('_buildRecipePayload serializes resultSelection', async () => {
    const recipe = makeRecipe({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1', macroUuid: null },
      resultGroups: [{
        id: 'rg-1',
        name: 'Sword',
        results: [{ id: 'r1', componentId: 'item-1', quantity: 1 }]
      }],
      ingredientSets: [{
        id: 'set-1',
        name: 'Set 1',
        ingredientGroups: [{
          id: 'ig-1',
          options: [{ componentId: 'item-1', quantity: 1 }]
        }]
      }]
    });
    let savedPayload = null;
    const services = mockServices({
      saveRecipe: async (payload) => { savedPayload = payload; }
    });
    const store = createEditorStore(services, { recipe, craftingSystemId: 'sys1' });

    await store.saveRecipe();

    assert.ok(savedPayload, 'saveRecipe should have been called');
    assert.deepEqual(savedPayload.resultSelection, {
      provider: 'rollTableOutcome',
      rollTableUuid: 'table-uuid-1',
      macroUuid: null
    });
  });
});

describe('editorStore validation for rollTableOutcome', () => {
  beforeEach(() => { idCounter = 0; });

  it('validation error when rollTableOutcome has empty rollTableUuid', async () => {
    const recipe = makeRecipe({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: '', macroUuid: null },
      resultGroups: [{
        id: 'rg-1',
        name: 'Sword',
        results: [{ id: 'r1', componentId: 'item-1', quantity: 1 }]
      }],
      ingredientSets: [{
        id: 'set-1',
        name: 'Set 1',
        ingredientGroups: [{
          id: 'ig-1',
          options: [{ componentId: 'item-1', quantity: 1 }]
        }]
      }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    const $errors = get(store.validationErrors);
    const hasRollTableError = $errors.some(e =>
      e.message && (e.message.includes('roll table') || e.message.includes('UUID') || e.message.includes('rollTable'))
    );
    assert.ok(hasRollTableError, `Expected roll table UUID validation error, got: ${JSON.stringify($errors)}`);
  });

  it('no validation error when rollTableOutcome has a valid rollTableUuid', async () => {
    const recipe = makeRecipe({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'valid-uuid', macroUuid: null },
      resultGroups: [{
        id: 'rg-1',
        name: 'Sword',
        results: [{ id: 'r1', componentId: 'item-1', quantity: 1 }]
      }],
      ingredientSets: [{
        id: 'set-1',
        name: 'Set 1',
        ingredientGroups: [{
          id: 'ig-1',
          options: [{ componentId: 'item-1', quantity: 1 }]
        }]
      }]
    });
    const store = createEditorStore(mockServices(), { recipe, craftingSystemId: 'sys1' });

    const $errors = get(store.validationErrors);
    const hasRollTableError = $errors.some(e =>
      e.message && (e.message.includes('roll table') || e.message.includes('UUID') || e.message.includes('rollTable'))
    );
    assert.ok(!hasRollTableError, `Unexpected roll table UUID error: ${JSON.stringify($errors)}`);
  });
});
