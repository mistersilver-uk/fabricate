/**
 * Tests for editorStore factory (T-140)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function mockServices(overrides = {}) {
  return {
    randomID: () => `id-${++idCounter}`,
    getSystem: () => null,
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

function complexRecipeServices(overrides = {}) {
  return mockServices({
    getSystem: () => ({
      advancedOptionsEnabled: true,
      features: { complexRecipes: true }
    }),
    ...overrides
  });
}

function multiStepServices(overrides = {}) {
  return mockServices({
    getSystem: () => ({
      advancedOptionsEnabled: true,
      features: { complexRecipes: true, multiStepRecipes: true }
    }),
    ...overrides
  });
}

function makeRecipe(overrides = {}) {
  const base = {
    id: overrides.id || `recipe-${++idCounter}`,
    name: overrides.name || 'Test Recipe',
    description: overrides.description || '',
    img: overrides.img || 'icons/svg/item-bag.svg',
    category: overrides.category || 'general',
    craftingSystemId: overrides.craftingSystemId || 'sys1',
    enabled: overrides.enabled !== undefined ? overrides.enabled : true,
    locked: overrides.locked || false,
    recipeItemId: overrides.recipeItemId || '',
    linkedRecipeItemUuid: overrides.linkedRecipeItemUuid || '',
    visibility: overrides.visibility || { restricted: false, allowedUserIds: [] },
    isVariable: overrides.isVariable || false,
    transferEffects: overrides.transferEffects || false,
    outcomeRouting: overrides.outcomeRouting || {},
    ingredientSets: overrides.ingredientSets || [],
    resultGroups: overrides.resultGroups || [],
    results: overrides.results || [],
    steps: overrides.steps || [],
    metadata: overrides.metadata || undefined,
    ...overrides
  };
  base.toJSON = () => ({ ...base });
  return base;
}

// ---------------------------------------------------------------------------
// Import the store factory
// ---------------------------------------------------------------------------

const { createEditorStore } = await import('../../src/ui/svelte/stores/editorStore.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEditorStore', () => {

  // -------------------------------------------------------------------------
  // 1. Draft initialization
  // -------------------------------------------------------------------------

  describe('draft initialization', () => {
    it('new recipe draft has empty name and defaults', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const d = get(store.draft);
      assert.equal(d.name, '');
      assert.equal(d.description, '');
      assert.equal(d.category, 'general');
      assert.equal(d.enabled, true);
      assert.equal(d.locked, false);
    });

    it('new recipe draft has null id', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const d = get(store.draft);
      assert.equal(d.id, null);
    });

    it('new recipe draft is assigned the craftingSystemId from options', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys-abc' });
      const d = get(store.draft);
      assert.equal(d.craftingSystemId, 'sys-abc');
    });

    it('new recipe draft has one default ingredient set', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const d = get(store.draft);
      assert.ok(Array.isArray(d.ingredientSets));
      assert.equal(d.ingredientSets.length, 1);
    });

    it('new recipe draft ingredient set has one default ingredient group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const d = get(store.draft);
      const groups = d.ingredientSets[0].ingredientGroups;
      assert.ok(Array.isArray(groups));
      assert.equal(groups.length, 1);
    });

    it('new recipe draft has one default result group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const d = get(store.draft);
      assert.ok(Array.isArray(d.results));
      assert.equal(d.results.length, 1);
    });

    it('new recipe draft result group has one default result row', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const d = get(store.draft);
      const rows = d.results[0].results;
      assert.ok(Array.isArray(rows));
      assert.equal(rows.length, 1);
    });

    it('existing recipe populates draft fields', () => {
      const svc = mockServices();
      const recipe = makeRecipe({ name: 'My Potion', description: 'Heals 10hp', category: 'potions' });
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.name, 'My Potion');
      assert.equal(d.description, 'Heals 10hp');
      assert.equal(d.category, 'potions');
    });

    it('existing recipe preserves id', () => {
      const svc = mockServices();
      const recipe = makeRecipe({ id: 'recipe-123' });
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.id, 'recipe-123');
    });

    it('existing recipe preserves craftingSystemId', () => {
      const svc = mockServices();
      const recipe = makeRecipe({ craftingSystemId: 'sys-xyz' });
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.craftingSystemId, 'sys-xyz');
    });

    it('existing recipe preserves enabled and locked flags', () => {
      const svc = mockServices();
      const recipe = makeRecipe({ enabled: false, locked: true });
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.enabled, false);
      assert.equal(d.locked, true);
    });

    it('existing recipe preserves recipeItemId', () => {
      const svc = mockServices();
      const recipe = makeRecipe({ recipeItemId: 'recipe-item-123' });
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.recipeItemId, 'recipe-item-123');
    });

    it('existing recipe with recipeItemId syncs its image from the recipe item definition', () => {
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-123',
          sourceItemUuid: 'uuid-linked-123',
          img: 'icons/svg/book.svg'
        }]
      });
      const recipe = makeRecipe({
        recipeItemId: 'recipe-item-123',
        img: 'icons/svg/item-bag.svg'
      });
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.img, 'icons/svg/book.svg');
    });

    it('existing recipe maps linkedRecipeItemUuid to recipeItemId when the system has a matching definition', () => {
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-linked',
          sourceItemUuid: 'uuid-abc-123'
        }]
      });
      const recipe = makeRecipe({ linkedRecipeItemUuid: 'uuid-abc-123' });
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.recipeItemId, 'recipe-item-linked');
      assert.equal(d.linkedRecipeItemUuid, 'uuid-abc-123');
    });

    it('existing recipe preserves visibility settings', () => {
      const svc = mockServices();
      const recipe = makeRecipe({
        visibility: { restricted: true, allowedUserIds: ['user1', 'user2'] }
      });
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.visibility.restricted, true);
      assert.deepEqual(d.visibility.allowedUserIds, ['user1', 'user2']);
    });

    it('existing recipe with toJSON method uses toJSON output', () => {
      const svc = mockServices();
      const recipe = {
        toJSON: () => ({ id: 'from-json', name: 'From JSON', craftingSystemId: 'sys1' })
      };
      const store = createEditorStore(svc, { recipe });
      const d = get(store.draft);
      assert.equal(d.id, 'from-json');
      assert.equal(d.name, 'From JSON');
    });

    it('options.craftingSystemId takes precedence over recipe.craftingSystemId when no recipe', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys-option' });
      const d = get(store.draft);
      assert.equal(d.craftingSystemId, 'sys-option');
    });
  });

  // -------------------------------------------------------------------------
  // 2. setField
  // -------------------------------------------------------------------------

  describe('setField', () => {
    it('setField updates name', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Elixir of Health');
      assert.equal(get(store.draft).name, 'Elixir of Health');
    });

    it('setField updates description', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('description', 'A powerful elixir');
      assert.equal(get(store.draft).description, 'A powerful elixir');
    });

    it('setField updates category', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('category', 'alchemy');
      assert.equal(get(store.draft).category, 'alchemy');
    });

    it('setField updates enabled', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('enabled', false);
      assert.equal(get(store.draft).enabled, false);
    });

    it('setField updates locked', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('locked', true);
      assert.equal(get(store.draft).locked, true);
    });

    it('setField updates img', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('img', 'icons/svg/potion.svg');
      assert.equal(get(store.draft).img, 'icons/svg/potion.svg');
    });

    it('setField updates isVariable', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('isVariable', true);
      assert.equal(get(store.draft).isVariable, true);
    });

    it('setField updates transferEffects', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('transferEffects', true);
      assert.equal(get(store.draft).transferEffects, true);
    });
  });

  // -------------------------------------------------------------------------
  // 2b. Availability state
  // -------------------------------------------------------------------------

  describe('setAvailabilityState', () => {
    it('defaults new recipes to enabled', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const draft = get(store.draft);
      assert.equal(draft.enabled, true);
      assert.equal(draft.locked, false);
    });

    it('setAvailabilityState("disabled") clears locked and disables the recipe', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setAvailabilityState('disabled');
      const draft = get(store.draft);
      assert.equal(draft.enabled, false);
      assert.equal(draft.locked, false);
    });

    it('setAvailabilityState("locked") enables and locks the recipe', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setAvailabilityState('locked');
      const draft = get(store.draft);
      assert.equal(draft.enabled, true);
      assert.equal(draft.locked, true);
    });

    it('setAvailabilityState("enabled") enables the recipe and clears locked', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setAvailabilityState('locked');
      store.setAvailabilityState('enabled');
      const draft = get(store.draft);
      assert.equal(draft.enabled, true);
      assert.equal(draft.locked, false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Step navigation
  // -------------------------------------------------------------------------

  describe('step navigation', () => {
    it('addStep appends a new step to draft.steps', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addStep();
      store.addStep();
      const d = get(store.draft);
      assert.ok(Array.isArray(d.steps));
      assert.ok(d.steps.length >= 2);
    });

    it('addStep moves activeStepIndex to the new step', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addStep();
      store.addStep();
      const idx = get(store.activeStepIndex);
      const d = get(store.draft);
      assert.equal(idx, d.steps.length - 1);
    });

    it('nextStep advances activeStepIndex', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addStep();
      store.addStep();
      store.activeStepIndex.set(0);
      store.nextStep();
      assert.ok(get(store.activeStepIndex) > 0);
    });

    it('nextStep wraps around to first step from last', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addStep();
      store.addStep();
      const d = get(store.draft);
      store.activeStepIndex.set(d.steps.length - 1);
      store.nextStep();
      assert.equal(get(store.activeStepIndex), 0);
    });

    it('prevStep wraps around to last step from first', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addStep();
      store.addStep();
      store.activeStepIndex.set(0);
      store.prevStep();
      const d = get(store.draft);
      assert.equal(get(store.activeStepIndex), d.steps.length - 1);
    });

    it('prevStep moves to previous step', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addStep();
      store.addStep();
      store.activeStepIndex.set(2);
      store.prevStep();
      assert.equal(get(store.activeStepIndex), 1);
    });

    it('removeStep removes the current step', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addStep();
      store.addStep();
      const beforeCount = get(store.draft).steps.length;
      store.activeStepIndex.set(0);
      store.removeStep();
      assert.equal(get(store.draft).steps.length, beforeCount - 1);
    });

    it('removeStep does not remove last remaining step', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      // Only 1 step after initialization (auto-created on first access)
      store.addStep();
      const d = get(store.draft);
      // Remove all but one
      while (d.steps.length > 1) {
        store.activeStepIndex.set(0);
        store.removeStep();
      }
      const beforeCount = get(store.draft).steps.length;
      store.removeStep();
      assert.equal(get(store.draft).steps.length, beforeCount);
    });

    it('prevStep does nothing when multiStepRecipes is disabled', () => {
      const svc = mockServices(); // no multiStepRecipes
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.activeStepIndex.set(0);
      store.prevStep();
      assert.equal(get(store.activeStepIndex), 0);
    });

    it('nextStep does nothing when multiStepRecipes is disabled', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.activeStepIndex.set(0);
      store.nextStep();
      assert.equal(get(store.activeStepIndex), 0);
    });

    it('addStep does nothing when multiStepRecipes is disabled', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addStep();
      assert.equal(get(store.draft).steps.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Ingredient set CRUD
  // -------------------------------------------------------------------------

  describe('ingredient set CRUD', () => {
    it('addIngredientSet adds a new ingredient set when complexRecipes is enabled', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).ingredientSets.length;
      store.addIngredientSet();
      assert.equal(get(store.draft).ingredientSets.length, before + 1);
    });

    it('addIngredientSet does nothing when complexRecipes is disabled', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).ingredientSets.length;
      store.addIngredientSet();
      assert.equal(get(store.draft).ingredientSets.length, before);
    });

    it('removeIngredientSet removes set at given index', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addIngredientSet();
      const before = get(store.draft).ingredientSets.length;
      store.removeIngredientSet(0);
      assert.equal(get(store.draft).ingredientSets.length, before - 1);
    });

    it('removeIngredientSet does not remove last ingredient set', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      // ensure only one set
      const d = get(store.draft);
      assert.equal(d.ingredientSets.length, 1);
      store.removeIngredientSet(0);
      assert.equal(get(store.draft).ingredientSets.length, 1);
    });

    it('removeIngredientSet does nothing when complexRecipes is disabled', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).ingredientSets.length;
      store.removeIngredientSet(0);
      assert.equal(get(store.draft).ingredientSets.length, before);
    });

    it('moveIngredientSetUp swaps set with the one above', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addIngredientSet();
      const sets = get(store.draft).ingredientSets;
      const firstId = sets[0].id;
      const secondId = sets[1].id;
      store.moveIngredientSetUp(1);
      const after = get(store.draft).ingredientSets;
      assert.equal(after[0].id, secondId);
      assert.equal(after[1].id, firstId);
    });

    it('moveIngredientSetDown swaps set with the one below', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addIngredientSet();
      const sets = get(store.draft).ingredientSets;
      const firstId = sets[0].id;
      const secondId = sets[1].id;
      store.moveIngredientSetDown(0);
      const after = get(store.draft).ingredientSets;
      assert.equal(after[0].id, secondId);
      assert.equal(after[1].id, firstId);
    });

    it('moveIngredientSetUp does nothing for the first set', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addIngredientSet();
      const before = get(store.draft).ingredientSets.map(s => s.id);
      store.moveIngredientSetUp(0);
      const after = get(store.draft).ingredientSets.map(s => s.id);
      assert.deepEqual(after, before);
    });

    it('moveIngredientSetDown does nothing for the last set', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addIngredientSet();
      const d = get(store.draft);
      const lastIdx = d.ingredientSets.length - 1;
      const before = d.ingredientSets.map(s => s.id);
      store.moveIngredientSetDown(lastIdx);
      const after = get(store.draft).ingredientSets.map(s => s.id);
      assert.deepEqual(after, before);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Ingredient group CRUD
  // -------------------------------------------------------------------------

  describe('ingredient group CRUD', () => {
    it('addIngredientGroup adds a group to the specified set', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).ingredientSets[0].ingredientGroups.length;
      store.addIngredientGroup(0);
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups.length, before + 1);
    });

    it('removeIngredientGroup removes a group from the specified set', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addIngredientGroup(0);
      const before = get(store.draft).ingredientSets[0].ingredientGroups.length;
      store.removeIngredientGroup(0, 0);
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups.length, before - 1);
    });

    it('removeIngredientGroup preserves minimum 1 group per set', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups.length, 1);
      store.removeIngredientGroup(0, 0);
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Ingredient option CRUD
  // -------------------------------------------------------------------------

  describe('ingredient option CRUD', () => {
    it('addIngredientOption adds a new option to the group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).ingredientSets[0].ingredientGroups[0].options.length;
      store.addIngredientOption(0, 0);
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups[0].options.length, before + 1);
    });

    it('removeIngredientOption removes an option from the group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addIngredientOption(0, 0);
      const before = get(store.draft).ingredientSets[0].ingredientGroups[0].options.length;
      store.removeIngredientOption(0, 0, 0);
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups[0].options.length, before - 1);
    });

    it('removeIngredientOption preserves minimum 1 option per group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups[0].options.length, 1);
      store.removeIngredientOption(0, 0, 0);
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups[0].options.length, 1);
    });

    it('clearIngredientComponent clears the componentId on an option', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.assignIngredientItem(0, 0, 0, 'item-abc');
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups[0].options[0].componentId, 'item-abc');
      store.clearIngredientComponent(0, 0, 0);
      assert.equal(get(store.draft).ingredientSets[0].ingredientGroups[0].options[0].componentId, null);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Catalyst CRUD
  // -------------------------------------------------------------------------

  describe('catalyst CRUD', () => {
    it('addCatalystRow adds a new catalyst entry to the set', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).ingredientSets[0].catalysts.length;
      store.addCatalystRow(0);
      assert.equal(get(store.draft).ingredientSets[0].catalysts.length, before + 1);
    });

    it('new catalyst row has null componentId', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addCatalystRow(0);
      const cat = get(store.draft).ingredientSets[0].catalysts[0];
      assert.equal(cat.componentId, null);
    });

    it('removeCatalystRow removes a catalyst from the set', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addCatalystRow(0);
      store.addCatalystRow(0);
      const before = get(store.draft).ingredientSets[0].catalysts.length;
      store.removeCatalystRow(0, 0);
      assert.equal(get(store.draft).ingredientSets[0].catalysts.length, before - 1);
    });

    it('clearCatalystComponent clears componentId on a catalyst', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addCatalystRow(0);
      store.assignCatalystItem(0, 0, 'item-catalyst-1');
      assert.equal(get(store.draft).ingredientSets[0].catalysts[0].componentId, 'item-catalyst-1');
      store.clearCatalystComponent(0, 0);
      assert.equal(get(store.draft).ingredientSets[0].catalysts[0].componentId, null);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Result group CRUD
  // -------------------------------------------------------------------------

  describe('result group CRUD', () => {
    it('addResultGroup adds a new result group when complexRecipes is enabled', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).results.length;
      store.addResultGroup();
      assert.equal(get(store.draft).results.length, before + 1);
    });

    it('addResultGroup does nothing when complexRecipes is disabled', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).results.length;
      store.addResultGroup();
      assert.equal(get(store.draft).results.length, before);
    });

    it('removeResultGroup removes a result group', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addResultGroup();
      const before = get(store.draft).results.length;
      store.removeResultGroup(0);
      assert.equal(get(store.draft).results.length, before - 1);
    });

    it('removeResultGroup preserves minimum 1 result group', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.draft).results.length, 1);
      store.removeResultGroup(0);
      assert.equal(get(store.draft).results.length, 1);
    });

    it('removeResultGroup does nothing when complexRecipes is disabled', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).results.length;
      store.removeResultGroup(0);
      assert.equal(get(store.draft).results.length, before);
    });

    it('moveResultGroupUp swaps result group with the one above', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addResultGroup();
      const groups = get(store.draft).results;
      const firstId = groups[0].id;
      const secondId = groups[1].id;
      store.moveResultGroupUp(1);
      const after = get(store.draft).results;
      assert.equal(after[0].id, secondId);
      assert.equal(after[1].id, firstId);
    });

    it('moveResultGroupDown swaps result group with the one below', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addResultGroup();
      const groups = get(store.draft).results;
      const firstId = groups[0].id;
      const secondId = groups[1].id;
      store.moveResultGroupDown(0);
      const after = get(store.draft).results;
      assert.equal(after[0].id, secondId);
      assert.equal(after[1].id, firstId);
    });

    it('moveResultGroupUp does nothing for the first result group', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addResultGroup();
      const before = get(store.draft).results.map(g => g.id);
      store.moveResultGroupUp(0);
      const after = get(store.draft).results.map(g => g.id);
      assert.deepEqual(after, before);
    });

    it('moveResultGroupDown does nothing for the last result group', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addResultGroup();
      const d = get(store.draft);
      const lastIdx = d.results.length - 1;
      const before = d.results.map(g => g.id);
      store.moveResultGroupDown(lastIdx);
      const after = get(store.draft).results.map(g => g.id);
      assert.deepEqual(after, before);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Result row CRUD
  // -------------------------------------------------------------------------

  describe('result row CRUD', () => {
    it('addResultRow adds a new result row to the group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const before = get(store.draft).results[0].results.length;
      store.addResultRow(0);
      assert.equal(get(store.draft).results[0].results.length, before + 1);
    });

    it('new result row has null componentId', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addResultRow(0);
      const row = get(store.draft).results[0].results[1];
      assert.equal(row.componentId, null);
    });

    it('removeResultRow removes a result row from the group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addResultRow(0);
      const before = get(store.draft).results[0].results.length;
      store.removeResultRow(0, 0);
      assert.equal(get(store.draft).results[0].results.length, before - 1);
    });

    it('removeResultRow preserves minimum 1 result row per group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.draft).results[0].results.length, 1);
      store.removeResultRow(0, 0);
      assert.equal(get(store.draft).results[0].results.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Item assignment
  // -------------------------------------------------------------------------

  describe('item assignment', () => {
    it('assignIngredientItem sets componentId on the target option', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.assignIngredientItem(0, 0, 0, 'item-sword');
      const option = get(store.draft).ingredientSets[0].ingredientGroups[0].options[0];
      assert.equal(option.componentId, 'item-sword');
    });

    it('assignIngredientItem sets matchType to component', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.assignIngredientItem(0, 0, 0, 'item-sword');
      const option = get(store.draft).ingredientSets[0].ingredientGroups[0].options[0];
      assert.equal(option.matchType, 'component');
    });

    it('assignCatalystItem sets componentId on the target catalyst', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.addCatalystRow(0);
      store.assignCatalystItem(0, 0, 'item-mortar');
      const cat = get(store.draft).ingredientSets[0].catalysts[0];
      assert.equal(cat.componentId, 'item-mortar');
    });

    it('assignResultItem sets componentId on the target result row', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.assignResultItem(0, 0, 'item-potion');
      const row = get(store.draft).results[0].results[0];
      assert.equal(row.componentId, 'item-potion');
    });
  });

  // -------------------------------------------------------------------------
  // 11. Panel collapse
  // -------------------------------------------------------------------------

  describe('panel collapse', () => {
    it('togglePanel adds a panel id to collapsedPanels', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.togglePanel('panel-1');
      assert.ok(get(store.collapsedPanels).has('panel-1'));
    });

    it('togglePanel removes a panel id that is already collapsed', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.togglePanel('panel-1');
      store.togglePanel('panel-1');
      assert.ok(!get(store.collapsedPanels).has('panel-1'));
    });

    it('togglePanel tracks multiple panels independently', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.togglePanel('panel-a');
      store.togglePanel('panel-b');
      const panels = get(store.collapsedPanels);
      assert.ok(panels.has('panel-a'));
      assert.ok(panels.has('panel-b'));
    });

    it('collapsedPanels starts empty', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.collapsedPanels).size, 0);
    });
  });

  // -------------------------------------------------------------------------
  // 12. Picker search
  // -------------------------------------------------------------------------

  describe('picker search', () => {
    it('setPickerSearch updates pickerSearch store', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setPickerSearch('iron ore');
      assert.equal(get(store.pickerSearch), 'iron ore');
    });

    it('setPickerSearch with falsy value resets to empty string', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setPickerSearch('iron ore');
      store.setPickerSearch(null);
      assert.equal(get(store.pickerSearch), '');
    });

    it('pickerItems uses getItems service with craftingSystemId and search term', () => {
      const calls = [];
      const svc = mockServices({
        getItems: (systemId, search) => { calls.push({ systemId, search }); return []; }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setPickerSearch('herbs');
      // Access pickerItems to trigger derived
      get(store.pickerItems);
      assert.ok(calls.some(c => c.systemId === 'sys1'));
    });

    it('pickerSearch initializes to empty string', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.pickerSearch), '');
    });
  });

  // -------------------------------------------------------------------------
  // 13. Recipe item
  // -------------------------------------------------------------------------

  describe('recipe item', () => {
    it('setRecipeItemId sets the recipeItemId on the draft, resolves the linked UUID alias, and syncs the recipe image', () => {
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-123',
          sourceItemUuid: 'uuid-linked-123',
          img: 'icons/svg/book.svg'
        }]
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setRecipeItemId('recipe-item-123');
      assert.equal(get(store.draft).recipeItemId, 'recipe-item-123');
      assert.equal(get(store.draft).linkedRecipeItemUuid, 'uuid-linked-123');
      assert.equal(get(store.draft).img, 'icons/svg/book.svg');
    });

    it('setRecipeItemId with falsy value clears the recipe item selection', () => {
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-123',
          sourceItemUuid: 'uuid-linked-123'
        }]
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setRecipeItemId('recipe-item-123');
      store.setRecipeItemId(null);
      assert.equal(get(store.draft).recipeItemId, '');
      assert.equal(get(store.draft).linkedRecipeItemUuid, '');
    });

    it('clearRecipeItem clears the recipeItemId and linkedRecipeItemUuid alias', () => {
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-abc',
          sourceItemUuid: 'uuid-linked-abc'
        }]
      });
      const recipe = makeRecipe({ recipeItemId: 'recipe-item-abc', linkedRecipeItemUuid: 'uuid-linked-abc' });
      const store = createEditorStore(svc, { recipe });
      store.clearRecipeItem();
      assert.equal(get(store.draft).recipeItemId, '');
      assert.equal(get(store.draft).linkedRecipeItemUuid, '');
    });

    it('setField ignores direct recipe image changes while a recipe item is associated', () => {
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-123',
          sourceItemUuid: 'uuid-linked-123',
          img: 'icons/svg/book.svg'
        }]
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setRecipeItemId('recipe-item-123');
      store.setField('img', 'icons/svg/potion.svg');
      assert.equal(get(store.draft).img, 'icons/svg/book.svg');
    });

    it('refreshRecipeItemImage re-syncs the recipe image from the live source item', () => {
      let currentImg = 'icons/svg/book.svg';
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-123',
          sourceItemUuid: 'uuid-linked-123',
          img: 'icons/svg/item-bag.svg'
        }],
        resolveItem: () => ({ img: currentImg })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setRecipeItemId('recipe-item-123');
      assert.equal(get(store.draft).img, 'icons/svg/book.svg');
      currentImg = 'icons/svg/scroll.svg';
      store.refreshRecipeItemImage();
      assert.equal(get(store.draft).img, 'icons/svg/scroll.svg');
    });

    it('deleteRecipeItemDefinition confirms, deletes the definition, and clears the current draft selection', async () => {
      let deleteArgs = null;
      let notifyArgs = null;
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-123',
          sourceItemUuid: 'uuid-linked-123',
          img: 'icons/svg/book.svg',
          name: 'Formula Book'
        }],
        getRecipeItemUsage: () => [{ id: 'recipe-1', name: 'Potion A' }],
        deleteRecipeItemDefinition: async (systemId, recipeItemId) => {
          deleteArgs = { systemId, recipeItemId };
          return { deleted: true, affectedRecipes: [{ id: 'recipe-1', name: 'Potion A' }] };
        },
        notify: (type, message) => { notifyArgs = { type, message }; }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setRecipeItemId('recipe-item-123');

      const deleted = await store.deleteRecipeItemDefinition('recipe-item-123');

      assert.equal(deleted, true);
      assert.deepEqual(deleteArgs, { systemId: 'sys1', recipeItemId: 'recipe-item-123' });
      assert.equal(get(store.draft).recipeItemId, '');
      assert.equal(get(store.draft).linkedRecipeItemUuid, '');
      assert.deepEqual(notifyArgs, {
        type: 'info',
        message: 'FABRICATE.Editor.Notifications.LinkedItemDeleted'
      });
    });

    it('deleteRecipeItemDefinition does nothing when confirmation is declined', async () => {
      let deleteCalled = false;
      const svc = mockServices({
        getRecipeItemDefinitions: () => [{
          id: 'recipe-item-123',
          sourceItemUuid: 'uuid-linked-123',
          img: 'icons/svg/book.svg'
        }],
        confirmDialog: async () => false,
        deleteRecipeItemDefinition: async () => {
          deleteCalled = true;
          return { deleted: true, affectedRecipes: [] };
        }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });

      const deleted = await store.deleteRecipeItemDefinition('recipe-item-123');

      assert.equal(deleted, false);
      assert.equal(deleteCalled, false);
    });
  });

  // -------------------------------------------------------------------------
  // 14. Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('validationErrors includes error when name is empty', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      const errors = get(store.validationErrors);
      assert.ok(errors.some(e => e.message.toLowerCase().includes('name')));
    });

    it('validationErrors is empty when name is present and no items assigned', () => {
      // Note: empty groups are only validated when they have no content
      // but the validation fires — test with name set to see name error gone
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Valid Recipe');
      const errors = get(store.validationErrors);
      const nameErrors = errors.filter(e => e.message.toLowerCase().includes('name'));
      assert.equal(nameErrors.length, 0);
    });

    it('validationErrors includes error when recipeItemId is required but missing', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: {},
          recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'itemOrLearned' } }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Test Recipe');
      const errors = get(store.validationErrors);
      assert.ok(errors.some(e => e.message.toLowerCase().includes('recipe item')));
    });

    it('validationErrors does not require linkedRecipeItemUuid for global visibility', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: {},
          recipeVisibility: { listMode: 'global' }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Test Recipe');
      const errors = get(store.validationErrors);
      const linkedErrors = errors.filter(e => e.message.toLowerCase().includes('linked'));
      assert.equal(linkedErrors.length, 0);
    });

    it('validationErrors includes error for empty ingredient group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Test Recipe');
      const errors = get(store.validationErrors);
      assert.ok(errors.some(e => e.message.toLowerCase().includes('ingredient group')));
    });

    it('validationErrors includes error for empty result group', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Test Recipe');
      const errors = get(store.validationErrors);
      assert.ok(errors.some(e => e.message.toLowerCase().includes('result group')));
    });

    it('validationErrors is empty when recipe has name, ingredient assigned, and result assigned', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Complete Recipe');
      store.assignIngredientItem(0, 0, 0, 'item-ingredient');
      store.assignResultItem(0, 0, 'item-result');
      const errors = get(store.validationErrors);
      assert.equal(errors.length, 0);
    });

    it('validationErrors ignores empty placeholder groups when a set has essences or other valid requirements', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: { itemTags: true, essences: true }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Mixed Requirements');
      store.updateDraft(d => {
        d.ingredientSets[0].essences = { fire: 1 };
        d.ingredientSets[0].ingredientGroups = [
          {
            id: 'group-empty',
            name: 'Placeholder',
            options: [{ id: 'opt-empty', matchType: 'component', componentId: null, quantity: 1, tagsText: '', tagMatch: 'any' }]
          },
          {
            id: 'group-component',
            name: 'Components',
            options: [{ id: 'opt-component', matchType: 'component', componentId: 'item-ingredient', quantity: 1, tagsText: '', tagMatch: 'any' }]
          }
        ];
        d.results[0].results[0].componentId = 'item-result';
      });
      const errors = get(store.validationErrors);
      assert.equal(errors.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // 15. Save
  // -------------------------------------------------------------------------

  describe('saveRecipe', () => {
    it('saveRecipe calls services.saveRecipe with payload when valid', async () => {
      let savedPayload = null;
      const svc = mockServices({
        saveRecipe: async (payload) => { savedPayload = payload; }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Valid Recipe');
      store.assignIngredientItem(0, 0, 0, 'item-ingredient');
      store.assignResultItem(0, 0, 'item-result');
      const result = await store.saveRecipe();
      assert.equal(result.success, true);
      assert.ok(savedPayload !== null);
      assert.equal(savedPayload.name, 'Valid Recipe');
    });

    it('saveRecipe passes recipe id as second argument for existing recipe', async () => {
      let savedId = undefined;
      const svc = mockServices({
        saveRecipe: async (payload, id) => { savedId = id; }
      });
      const recipe = makeRecipe({ id: 'existing-id', name: 'Existing' });
      const store = createEditorStore(svc, { recipe });
      store.assignIngredientItem(0, 0, 0, 'item-ingredient');
      store.assignResultItem(0, 0, 'item-result');
      await store.saveRecipe();
      assert.equal(savedId, 'existing-id');
    });

    it('saveRecipe returns errors when validation fails', async () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      // name is empty — validation will fail
      const result = await store.saveRecipe();
      assert.equal(result.success, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
    });

    it('saveRecipe does not call services.saveRecipe when validation fails', async () => {
      let saveCallCount = 0;
      const svc = mockServices({
        saveRecipe: async () => { saveCallCount++; }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      await store.saveRecipe();
      assert.equal(saveCallCount, 0);
    });

    it('saveRecipe calls notify with error message when validation fails', async () => {
      const notifyCalls = [];
      const svc = mockServices({
        notify: (...args) => { notifyCalls.push(args); }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      await store.saveRecipe();
      assert.ok(notifyCalls.some(c => c[0] === 'error'));
    });

    it('saveRecipe returns failure when services.saveRecipe throws', async () => {
      const svc = mockServices({
        saveRecipe: async () => { throw new Error('Network error'); }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Valid Recipe');
      store.assignIngredientItem(0, 0, 0, 'item-ingredient');
      store.assignResultItem(0, 0, 'item-result');
      const result = await store.saveRecipe();
      assert.equal(result.success, false);
      assert.ok(result.errors[0].message.includes('Network error'));
    });

    it('saveRecipe drops empty placeholder groups and options while preserving mixed essences, components, and tags', async () => {
      let savedPayload = null;
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: { itemTags: true, essences: true }
        }),
        saveRecipe: async (payload) => { savedPayload = payload; }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Mixed Requirements');
      store.updateDraft(d => {
        d.ingredientSets[0].essences = { fire: 2 };
        d.ingredientSets[0].ingredientGroups = [
          {
            id: 'group-empty',
            name: 'Placeholder',
            options: [{ id: 'opt-empty', matchType: 'component', componentId: null, quantity: 1, tagsText: '', tagMatch: 'any' }]
          },
          {
            id: 'group-component',
            name: 'Components',
            options: [
              { id: 'opt-component', matchType: 'component', componentId: 'item-ingredient', quantity: 2, tagsText: '', tagMatch: 'any' },
              { id: 'opt-component-empty', matchType: 'component', componentId: null, quantity: 1, tagsText: '', tagMatch: 'any' }
            ]
          },
          {
            id: 'group-tags',
            name: 'Tags',
            options: [
              { id: 'opt-tags', matchType: 'tags', componentId: null, quantity: 1, tagsText: 'herb, rare', tagMatch: 'all' },
              { id: 'opt-tags-empty', matchType: 'tags', componentId: null, quantity: 1, tagsText: ' , ', tagMatch: 'any' }
            ]
          }
        ];
        d.results[0].results[0].componentId = 'item-result';
      });

      const result = await store.saveRecipe();

      assert.equal(result.success, true);
      assert.ok(savedPayload, 'saveRecipe should receive a payload');
      assert.deepEqual(savedPayload.ingredientSets[0].essences, { fire: 2 });
      assert.equal(savedPayload.ingredientSets[0].ingredientGroups.length, 2);
      assert.deepEqual(savedPayload.ingredientSets[0].ingredientGroups.map(group => group.id), ['group-component', 'group-tags']);
      assert.equal(savedPayload.ingredientSets[0].ingredientGroups[0].options.length, 1);
      assert.equal(savedPayload.ingredientSets[0].ingredientGroups[0].options[0].match.type, 'component');
      assert.equal(savedPayload.ingredientSets[0].ingredientGroups[0].options[0].componentId, 'item-ingredient');
      assert.equal(savedPayload.ingredientSets[0].ingredientGroups[1].options.length, 1);
      assert.equal(savedPayload.ingredientSets[0].ingredientGroups[1].options[0].match.type, 'tags');
      assert.deepEqual(savedPayload.ingredientSets[0].ingredientGroups[1].options[0].match.tags, ['herb', 'rare']);
      assert.equal(savedPayload.ingredientSets[0].ingredientGroups[1].options[0].match.tagMatch, 'all');
    });

    it('saveRecipe allows an essence-only ingredient set by omitting the default placeholder group', async () => {
      let savedPayload = null;
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: { essences: true }
        }),
        saveRecipe: async (payload) => { savedPayload = payload; }
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.setField('name', 'Essence Only');
      store.updateDraft(d => {
        d.ingredientSets[0].essences = { fire: 1 };
        d.results[0].results[0].componentId = 'item-result';
      });

      const result = await store.saveRecipe();

      assert.equal(result.success, true);
      assert.ok(savedPayload, 'saveRecipe should receive a payload');
      assert.deepEqual(savedPayload.ingredientSets[0].essences, { fire: 1 });
      assert.deepEqual(savedPayload.ingredientSets[0].ingredientGroups, []);
      assert.deepEqual(savedPayload.ingredientSets[0].ingredients, []);
    });

    it('saveRecipe normalizes contradictory disabled-plus-locked draft state to disabled', async () => {
      let savedPayload = null;
      const svc = mockServices({
        saveRecipe: async (payload) => { savedPayload = payload; }
      });
      const recipe = makeRecipe({
        name: 'Contradictory Status',
        enabled: false,
        locked: true,
        ingredientSets: [{
          id: 'set-1',
          name: 'Set 1',
          ingredientGroups: [{
            id: 'group-1',
            name: 'Group 1',
            options: [{ id: 'opt-1', matchType: 'component', componentId: 'item-ingredient', quantity: 1, tagsText: '', tagMatch: 'any' }]
          }],
          essences: {},
          catalysts: []
        }],
        resultGroups: [{
          id: 'result-group-1',
          name: 'Result Group 1',
          results: [{ id: 'result-1', componentId: 'item-result', quantity: 1, propertyMacroUuid: null }]
        }]
      });
      const store = createEditorStore(svc, { recipe });

      const result = await store.saveRecipe();

      assert.equal(result.success, true);
      assert.ok(savedPayload, 'saveRecipe should receive a payload');
      assert.equal(savedPayload.enabled, false);
      assert.equal(savedPayload.locked, false);
    });
  });

  // -------------------------------------------------------------------------
  // 16. Cancel
  // -------------------------------------------------------------------------

  describe('cancel', () => {
    it('cancel calls services.onClose', () => {
      let called = false;
      const svc = mockServices({ onClose: () => { called = true; } });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      store.cancel();
      assert.ok(called);
    });
  });

  // -------------------------------------------------------------------------
  // 17. Feature state derived store
  // -------------------------------------------------------------------------

  describe('featureState derived store', () => {
    it('featureState.showComplexRecipes is false when system has no features', () => {
      const svc = mockServices({ getSystem: () => null });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showComplexRecipes, false);
    });

    it('featureState.showComplexRecipes is true when system has complexRecipes feature', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showComplexRecipes, true);
    });

    it('featureState.showComplexRecipes is true when resolutionMode requires advanced routing controls', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          resolutionMode: 'tiered',
          features: {}
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showComplexRecipes, true);
      assert.equal(get(store.featureState).showOutcomeRouting, true);
    });

    it('featureState.showCraftingChecks is true when a crafting check macro is configured without the legacy feature flag', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: {},
          craftingCheck: {
            enabled: false,
            macroUuid: 'Macro.check',
            outcomes: ['fail', 'pass']
          }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showCraftingChecks, true);
    });

    it('featureState.showMultiStepRecipes is true when system has multiStepRecipes feature', () => {
      const svc = multiStepServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showMultiStepRecipes, true);
    });

    it('featureState.showMultiStepRecipes is false without the feature', () => {
      const svc = complexRecipeServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showMultiStepRecipes, false);
    });

    it('featureState.showCategories is true when recipeCategories feature is enabled', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: { recipeCategories: true }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showCategories, true);
    });

    it('featureState.showCategories is false when advancedOptionsEnabled is false', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: false,
          features: { recipeCategories: true }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showCategories, false);
    });

    it('systemCategories includes the reserved general category before custom categories', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: { recipeCategories: true },
          categories: ['Potions', 'Weapons']
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.deepEqual(get(store.systemCategories), ['general', 'Potions', 'Weapons']);
    });

    it('systemCategories falls back to only the reserved general category when no custom categories exist', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: { recipeCategories: true },
          categories: []
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.deepEqual(get(store.systemCategories), ['general']);
    });

    it('featureState.requiresLinkedRecipeItem is true when listMode is knowledge and mode is itemOrLearned', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: {},
          recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'itemOrLearned' } }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).requiresLinkedRecipeItem, true);
    });

    it('featureState.requiresLinkedRecipeItem is false for global listMode', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: {},
          recipeVisibility: { listMode: 'global' }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).requiresLinkedRecipeItem, false);
    });

    it('featureState.showTimeRequirements reflects system time requirement config', () => {
      const svc = mockServices({
        getSystem: () => ({
          advancedOptionsEnabled: true,
          features: {},
          requirements: { time: { enabled: true } }
        })
      });
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.featureState).showTimeRequirements, true);
    });
  });

  // -------------------------------------------------------------------------
  // 18. isNewRecipe
  // -------------------------------------------------------------------------

  describe('isNewRecipe', () => {
    it('isNewRecipe is true for a new recipe (no id)', () => {
      const svc = mockServices();
      const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
      assert.equal(get(store.isNewRecipe), true);
    });

    it('isNewRecipe is false for an existing recipe with an id', () => {
      const svc = mockServices();
      const recipe = makeRecipe({ id: 'existing-id' });
      const store = createEditorStore(svc, { recipe });
      assert.equal(get(store.isNewRecipe), false);
    });
  });

  // -------------------------------------------------------------------------
  // 19. Multiple instances — state isolation
  // -------------------------------------------------------------------------

  describe('multiple instances', () => {
    it('two stores do not share draft state', () => {
      const svc1 = mockServices();
      const svc2 = mockServices();
      const store1 = createEditorStore(svc1, { craftingSystemId: 'sys1' });
      const store2 = createEditorStore(svc2, { craftingSystemId: 'sys2' });
      store1.setField('name', 'Recipe A');
      store2.setField('name', 'Recipe B');
      assert.equal(get(store1.draft).name, 'Recipe A');
      assert.equal(get(store2.draft).name, 'Recipe B');
    });

    it('two stores do not share collapsedPanels state', () => {
      const svc1 = mockServices();
      const svc2 = mockServices();
      const store1 = createEditorStore(svc1, { craftingSystemId: 'sys1' });
      const store2 = createEditorStore(svc2, { craftingSystemId: 'sys1' });
      store1.togglePanel('panel-x');
      assert.ok(get(store1.collapsedPanels).has('panel-x'));
      assert.ok(!get(store2.collapsedPanels).has('panel-x'));
    });

    it('two stores do not share pickerSearch state', () => {
      const svc1 = mockServices();
      const svc2 = mockServices();
      const store1 = createEditorStore(svc1, { craftingSystemId: 'sys1' });
      const store2 = createEditorStore(svc2, { craftingSystemId: 'sys1' });
      store1.setPickerSearch('iron');
      assert.equal(get(store1.pickerSearch), 'iron');
      assert.equal(get(store2.pickerSearch), '');
    });

    it('mutations to ingredient sets in one store do not affect the other', () => {
      const svc1 = complexRecipeServices();
      const svc2 = complexRecipeServices();
      const store1 = createEditorStore(svc1, { craftingSystemId: 'sys1' });
      const store2 = createEditorStore(svc2, { craftingSystemId: 'sys1' });
      const before2 = get(store2.draft).ingredientSets.length;
      store1.addIngredientSet();
      assert.equal(get(store2.draft).ingredientSets.length, before2);
    });
  });

});

// ---------------------------------------------------------------------------
// Validation errors (T-095)
// ---------------------------------------------------------------------------

describe('createEditorStore: validationErrors', () => {

  it('returns name error when draft name is empty', () => {
    const svc = mockServices();
    const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
    const errors = get(store.validationErrors);
    const nameError = errors.find(e => e.fieldSelector === '[name="recipeName"]');
    assert.ok(nameError, 'Should have a name validation error when name is empty');
    assert.ok(nameError.message.length > 0, 'Name error should have a message');
  });

  it('returns no name error when draft name is set', () => {
    const svc = mockServices();
    const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
    store.setField('name', 'My Potion');
    const errors = get(store.validationErrors);
    const nameError = errors.find(e => e.fieldSelector === '[name="recipeName"]');
    assert.equal(nameError, undefined, 'Should not have a name error when name is set');
  });

  it('returns ingredient group error when group has no items or tags', () => {
    const svc = mockServices();
    const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
    store.setField('name', 'Valid Name');
    const errors = get(store.validationErrors);
    // The default draft has one ingredient set with one group with one empty option
    const groupError = errors.find(e => e.fieldSelector && e.fieldSelector.includes('data-group-id'));
    assert.ok(groupError, 'Should have ingredient group error when group has no items');
    assert.ok(groupError.panelId, 'Group error should include panelId');
  });

  it('returns result group error when result group has no items', () => {
    const svc = mockServices();
    const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
    store.setField('name', 'Valid Name');
    const errors = get(store.validationErrors);
    // The default draft has one result group with one empty result
    const resultError = errors.find(e => e.panelId && e.fieldSelector && e.fieldSelector.includes('data-group-id'));
    // Could be ingredient or result — we need to distinguish. Result groups: panelId === group.id and fieldSelector matches group.id
    const d = get(store.draft);
    const resultGroupId = d.results?.[0]?.id;
    if (resultGroupId) {
      const resultGroupError = errors.find(e => e.panelId === resultGroupId);
      assert.ok(resultGroupError, 'Should have error for result group with no items');
    }
  });

  it('returns empty array when draft has valid name, ingredients, and results', () => {
    const svc = mockServices({ randomID: () => `id-${Math.random()}` });
    const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
    store.setField('name', 'Valid Recipe');

    // Assign a component to the first ingredient group option
    const d = get(store.draft);
    const setIndex = 0;
    const groupIndex = 0;
    const optionIndex = 0;
    store.assignIngredientItem(setIndex, groupIndex, optionIndex, 'item-123');

    // Assign a component to the first result
    store.assignResultItem(0, 0, 'item-456');

    const errors = get(store.validationErrors);
    assert.equal(errors.length, 0, 'Should have no validation errors when draft is fully valid');
  });

});

// ---------------------------------------------------------------------------
// handleScrollToError panel expansion guard (T-095 bug fix)
// ---------------------------------------------------------------------------

describe('createEditorStore: togglePanel guard for scroll-to-error', () => {

  it('togglePanel expands a collapsed panel', () => {
    const svc = mockServices();
    const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
    const d = get(store.draft);
    const panelId = d.ingredientSets?.[0]?.id || 'set-0';

    // Collapse it first
    store.togglePanel(panelId);
    assert.ok(get(store.collapsedPanels).has(panelId), 'Panel should be collapsed after first toggle');

    // Simulate handleScrollToError guard: only expand when collapsed
    if (get(store.collapsedPanels).has(panelId)) {
      store.togglePanel(panelId);
    }
    assert.ok(!get(store.collapsedPanels).has(panelId), 'Panel should be expanded after conditional toggle');
  });

  it('panel remains expanded when scroll-to-error is triggered and panel is already expanded', () => {
    const svc = mockServices();
    const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
    const d = get(store.draft);
    const panelId = d.ingredientSets?.[0]?.id || 'set-0';

    // Panel starts expanded (not in collapsedPanels)
    assert.ok(!get(store.collapsedPanels).has(panelId), 'Panel should start expanded');

    // Simulate the guarded handleScrollToError — should NOT call togglePanel when already expanded
    if (get(store.collapsedPanels).has(panelId)) {
      store.togglePanel(panelId);
    }

    // Panel should still be expanded
    assert.ok(!get(store.collapsedPanels).has(panelId), 'Panel should remain expanded when guard prevents toggle');
  });

  it('unconditional togglePanel collapses an expanded panel (demonstrates the bug)', () => {
    const svc = mockServices();
    const store = createEditorStore(svc, { craftingSystemId: 'sys1' });
    const d = get(store.draft);
    const panelId = d.ingredientSets?.[0]?.id || 'set-0';

    // Panel starts expanded
    assert.ok(!get(store.collapsedPanels).has(panelId), 'Panel should start expanded');

    // Unconditional toggle (the old buggy behaviour) collapses the panel
    store.togglePanel(panelId);
    assert.ok(get(store.collapsedPanels).has(panelId), 'Unconditional toggle collapses an already-expanded panel');
  });

});
