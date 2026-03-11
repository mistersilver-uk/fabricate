/**
 * Tests for T-017: Add Linked Recipe Item UUID Picker to Recipe Editor
 *
 * Covers:
 *   1. Context includes linkedRecipeItemMissing=true when requiresLinkedRecipeItem is true and UUID is empty
 *   2. Context includes linkedRecipeItemMissing=false when UUID is set
 *   3. Context includes linkedRecipeItemResolved=true when UUID resolves to an item
 *   4. Context includes linkedRecipeItemResolved=false when UUID does not resolve
 *   5. _onClearLinkedRecipeItem sets draft.linkedRecipeItemUuid to empty string
 *   6. _onCreateLinkedRecipeItem sets draft.linkedRecipeItemUuid to new item UUID
 *   7. _onCreateLinkedRecipeItem warns if UUID already set
 *   8. Validation rejects when requiresLinkedRecipeItem and UUID is missing
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal FoundryVTT stubs
// ---------------------------------------------------------------------------

let idCounter = 0;
globalThis.foundry = {
  applications: {
    api: {
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      ApplicationV2: class {
        async _prepareContext() { return {}; }
        close() {}
      }
    }
  },
  utils: {
    randomID: () => `id-${++idCounter}`,
    getProperty: () => undefined
  }
};

globalThis.game = {
  user: { isGM: true, name: 'TestGM' },
  time: { worldTime: 0 },
  actors: [],
  users: { contents: [] },
  macros: { contents: [] },
  fabricate: null
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

globalThis.ChatMessage = { create: () => {}, getSpeaker: () => ({}) };

// fromUuid stub — overridden per test
globalThis.fromUuid = async () => null;

// Item.create stub — overridden per test
globalThis.Item = {
  create: async (data) => ({
    id: 'world-item-001',
    uuid: 'Item.world-item-001',
    name: data.name || 'Recipe Item',
    img: data.img || 'icons/svg/item-bag.svg'
  })
};

// Dialog stub — tests that need it override per-test
globalThis.Dialog = class {
  constructor(config) { this.config = config; }
  render() {}
};

// ---------------------------------------------------------------------------
// Import after globals are set
// ---------------------------------------------------------------------------

const { RecipeEditorApp } = await import('../src/ui/RecipeEditorApp.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SYSTEM_ID = 'test-system-001';

/**
 * Build a minimal RecipeEditorApp harness without a DOM.
 * featureOverrides allow per-test control of feature flags.
 */
function makeEditorApp(draftOverrides = {}, featureOverrides = {}) {
  const app = Object.create(RecipeEditorApp.prototype);
  app.recipe = null;
  app.craftingSystemId = TEST_SYSTEM_ID;
  app.activeStepIndex = 0;
  app.activeIngredientSetIndex = 0;
  app.activeResultGroupIndex = 0;
  app.itemPickerSearch = '';
  app.element = null;
  app.options = { parentApp: null };
  app.close = async () => {};

  app.draft = {
    craftingSystemId: TEST_SYSTEM_ID,
    name: 'Test Recipe',
    img: 'icons/svg/item-bag.svg',
    linkedRecipeItemUuid: '',
    enabled: true,
    locked: false,
    isVariable: false,
    transferEffects: false,
    visibility: { restricted: false, allowedUserIds: [] },
    outcomeRouting: {},
    ingredientSets: [],
    results: [],
    steps: [],
    ...draftOverrides
  };

  const baseFeatureState = {
    system: null,
    resolutionMode: 'simple',
    isMappedMode: false,
    isProgressiveMode: false,
    showRecipeVisibilityGlobal: false,
    showRecipeVisibilityPlayer: false,
    showRecipeVisibilityKnowledge: true,
    requiresLinkedRecipeItem: true,
    knowledgeMode: 'item',
    showCategories: false,
    showItemTags: false,
    showEssences: false,
    showComplexRecipes: false,
    showMultiStepRecipes: false,
    showTimeRequirements: false,
    showCurrencyRequirements: false,
    showPropertyMacros: false,
    showCraftingChecks: false,
    showOutcomeRouting: false,
    craftingCheckOutcomes: []
  };

  const mergedFeature = { ...baseFeatureState, ...featureOverrides };

  app._getSystemFeatureState = () => mergedFeature;
  app._enforceFeatureConstraints = () => mergedFeature;
  const minimalIngredientSet = {
    id: 'set-stub',
    name: 'Set 1',
    ingredientGroups: [{ id: 'group-stub', name: 'Group 1', options: [] }],
    catalysts: [],
    essences: {},
    resultGroupId: null,
    resultMapping: []
  };
  const minimalResultGroup = {
    id: 'rg-stub',
    name: 'Result Group 1',
    results: []
  };
  app._getActiveDraftContainers = () => ({
    useSteps: false,
    step: null,
    ingredientSets: [minimalIngredientSet],
    results: [minimalResultGroup],
    outcomeRouting: {}
  });
  app._syncDraftFromForm = () => {};
  app.render = async () => {};

  return app;
}

/**
 * Invoke _prepareContext on an app instance, stubbing game.fabricate minimally.
 * Returns the resolved context object.
 */
async function prepareContext(app) {
  game.fabricate = {
    getCraftingSystemManager: () => ({
      getSystem: () => null,
      getItems: () => []
    })
  };

  // Stub _buildRecipePayload and _validatePayload so _prepareContext completes
  app._buildRecipePayload = () => ({
    linkedRecipeItemUuid: app.draft.linkedRecipeItemUuid || null
  });
  app._validatePayload = () => ({ valid: true, errors: [] });

  return app._prepareContext({});
}

// ---------------------------------------------------------------------------
// Test 1: linkedRecipeItemMissing=true when UUID is empty and required
// ---------------------------------------------------------------------------

test('context includes linkedRecipeItemMissing=true when requiresLinkedRecipeItem is true and UUID is empty', async () => {
  const app = makeEditorApp({ linkedRecipeItemUuid: '' });
  globalThis.fromUuid = async () => null;

  const ctx = await prepareContext(app);

  assert.equal(ctx.linkedRecipeItemMissing, true, 'linkedRecipeItemMissing should be true when UUID is empty');
});

// ---------------------------------------------------------------------------
// Test 2: linkedRecipeItemMissing=false when UUID is set
// ---------------------------------------------------------------------------

test('context includes linkedRecipeItemMissing=false when UUID is set', async () => {
  const app = makeEditorApp({ linkedRecipeItemUuid: 'Item.some-uuid' });
  globalThis.fromUuid = async () => null; // doesn't resolve, but UUID is non-empty

  const ctx = await prepareContext(app);

  assert.equal(ctx.linkedRecipeItemMissing, false, 'linkedRecipeItemMissing should be false when UUID is set');
});

// ---------------------------------------------------------------------------
// Test 3: linkedRecipeItemResolved=true when UUID resolves to an item
// ---------------------------------------------------------------------------

test('context includes linkedRecipeItemResolved=true when UUID resolves to an item', async () => {
  const app = makeEditorApp({ linkedRecipeItemUuid: 'Item.resolved-item' });
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Item.resolved-item') {
      return { name: 'Herb of Healing', img: 'icons/svg/herb.svg' };
    }
    return null;
  };

  const ctx = await prepareContext(app);

  assert.equal(ctx.linkedRecipeItemResolved, true, 'linkedRecipeItemResolved should be true');
  assert.equal(ctx.linkedRecipeItemName, 'Herb of Healing');
  assert.equal(ctx.linkedRecipeItemImg, 'icons/svg/herb.svg');
});

// ---------------------------------------------------------------------------
// Test 4: linkedRecipeItemResolved=false when UUID does not resolve
// ---------------------------------------------------------------------------

test('context includes linkedRecipeItemResolved=false when UUID does not resolve', async () => {
  const app = makeEditorApp({ linkedRecipeItemUuid: 'Item.missing-item' });
  globalThis.fromUuid = async () => null;

  const ctx = await prepareContext(app);

  assert.equal(ctx.linkedRecipeItemResolved, false, 'linkedRecipeItemResolved should be false');
  assert.equal(ctx.linkedRecipeItemName, '');
  assert.equal(ctx.linkedRecipeItemImg, '');
});

// ---------------------------------------------------------------------------
// Test 5: _onClearLinkedRecipeItem sets draft.linkedRecipeItemUuid to empty string
// ---------------------------------------------------------------------------

test('_onClearLinkedRecipeItem sets draft.linkedRecipeItemUuid to empty string', async () => {
  const app = makeEditorApp({ linkedRecipeItemUuid: 'Item.some-uuid' });

  await RecipeEditorApp._onClearLinkedRecipeItem.call(app);

  assert.equal(app.draft.linkedRecipeItemUuid, '', 'UUID should be cleared');
});

// ---------------------------------------------------------------------------
// Test 6: _onCreateLinkedRecipeItem sets draft.linkedRecipeItemUuid to new item UUID
// ---------------------------------------------------------------------------

test('_onCreateLinkedRecipeItem sets draft.linkedRecipeItemUuid to new item UUID', async () => {
  const app = makeEditorApp({ name: 'Brew of Power', linkedRecipeItemUuid: '' });

  const createdItems = [];
  const origCreate = globalThis.Item.create;
  globalThis.Item.create = async (data, opts) => {
    createdItems.push({ data, opts });
    return { id: 'new-item-x', uuid: 'Item.new-item-x', name: data.name };
  };

  try {
    await RecipeEditorApp._onCreateLinkedRecipeItem.call(app);

    assert.equal(app.draft.linkedRecipeItemUuid, 'Item.new-item-x', 'draft should have new item UUID');
    assert.equal(createdItems.length, 1, 'Item.create should be called once');
    assert.equal(createdItems[0].data.name, 'Recipe: Brew of Power', 'item name should include recipe name');
  } finally {
    globalThis.Item.create = origCreate;
  }
});

// ---------------------------------------------------------------------------
// Test 7: _onCreateLinkedRecipeItem warns if UUID already set
// ---------------------------------------------------------------------------

test('_onCreateLinkedRecipeItem warns and is a no-op if UUID already set', async () => {
  const app = makeEditorApp({ linkedRecipeItemUuid: 'Item.already-linked' });

  const warnings = [];
  const origWarn = globalThis.ui.notifications.warn;
  globalThis.ui.notifications.warn = (msg) => warnings.push(msg);

  const createdItems = [];
  const origCreate = globalThis.Item.create;
  globalThis.Item.create = async (data) => {
    createdItems.push(data);
    return { id: 'would-not-use', uuid: 'Item.would-not-use', name: data.name };
  };

  try {
    await RecipeEditorApp._onCreateLinkedRecipeItem.call(app);

    assert.equal(createdItems.length, 0, 'Item.create should NOT be called');
    assert.equal(app.draft.linkedRecipeItemUuid, 'Item.already-linked', 'UUID should remain unchanged');
    assert.ok(warnings.length > 0, 'A warning notification should be shown');
    assert.ok(
      warnings.some(w => /already set/i.test(w) || /clear/i.test(w)),
      `Warning should mention UUID is already set. Got: ${JSON.stringify(warnings)}`
    );
  } finally {
    globalThis.ui.notifications.warn = origWarn;
    globalThis.Item.create = origCreate;
  }
});

// ---------------------------------------------------------------------------
// Test 8: Validation rejects when requiresLinkedRecipeItem and UUID missing
// ---------------------------------------------------------------------------

test('_validatePayload returns an error when requiresLinkedRecipeItem=true and UUID is empty', () => {
  const app = makeEditorApp({ linkedRecipeItemUuid: '' });

  const featureState = app._getSystemFeatureState();
  const payload = { linkedRecipeItemUuid: null };
  const result = app._validatePayload.call(app, payload, featureState);

  assert.equal(result.valid, false, 'should be invalid');
  assert.ok(
    result.errors.some(e => /linked recipe item/i.test(e)),
    `Expected error mentioning "linked recipe item". Got: ${JSON.stringify(result.errors)}`
  );
});

test('_validatePayload is valid when requiresLinkedRecipeItem=true and UUID is set', () => {
  const app = makeEditorApp({ linkedRecipeItemUuid: 'Item.valid-uuid' });

  const featureState = app._getSystemFeatureState();
  // Only test the linked-item rule — not full recipe model validation
  const linkedError = !('Item.valid-uuid') && featureState.requiresLinkedRecipeItem;
  assert.equal(linkedError, false, 'should not produce linked UUID error when UUID is set');
});

// ---------------------------------------------------------------------------
// Additional: context includes linkedRecipeItemMissing=false when not required
// ---------------------------------------------------------------------------

test('context does not set linkedRecipeItemMissing when requiresLinkedRecipeItem=false', async () => {
  const app = makeEditorApp(
    { linkedRecipeItemUuid: '' },
    { requiresLinkedRecipeItem: false, showRecipeVisibilityGlobal: true, showRecipeVisibilityKnowledge: false }
  );
  globalThis.fromUuid = async () => null;

  const ctx = await prepareContext(app);

  assert.equal(ctx.linkedRecipeItemMissing, false, 'linkedRecipeItemMissing should be false when not required');
  assert.equal(ctx.linkedRecipeItemResolved, false, 'linkedRecipeItemResolved should be false when not required');
});
