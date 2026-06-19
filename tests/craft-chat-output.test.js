/**
 * Unit tests for T-056: Automatic Crafting Chat Output
 *
 * Tests the _postCraftChatMessage() method added to CraftingEngine and the
 * end-to-end craft() integration.
 *
 * Test cases:
 *  1. Success message payload content
 *  2. Failure message payload content
 *  3. Toggle disabled -> no ChatMessage.create call
 *  4. Toggle enabled (default) -> ChatMessage.create called
 *  5. No system found -> graceful, no error
 *  6. Localization keys used
 *  7. Exactly-once emission in full craft() flow
 *  8. No message for validation-only failures (no actor, missing items)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

// ---------------------------------------------------------------------------
// Minimal globals
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), object);
}

globalThis.foundry = { utils: { getProperty, setProperty: () => {} } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let chatCreated = [];
function resetChat() {
  chatCreated = [];
  globalThis.ChatMessage = {
    create(data) { chatCreated.push(data); return Promise.resolve({ id: `msg-${chatCreated.length}` }); },
    getSpeaker({ actor } = {}) { return { alias: actor?.name || 'Unknown' }; }
  };
}

function buildSystem(chatOutputEnabled = true) {
  return {
    id: 'sys-1',
    features: {
      craftingChecks: false,
      chatOutput: chatOutputEnabled
    },
    craftingCheck: {
      enabled: false,
      macroUuid: null,
      successMacroUuid: null,
      failureMacroUuid: null,
      consumption: { consumeIngredientsOnFail: false, consumeCatalystsOnFail: false }
    }
  };
}

function setupGame(chatOutputEnabled = true) {
  const system = buildSystem(chatOutputEnabled);
  const i18nKeys = [];
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (id) => (id === 'sys-1' ? system : null)
      }),
      getResolutionModeService: () => null
    },
    i18n: {
      localize(key) { i18nKeys.push(key); return key; },
      format(key, data = {}) { i18nKeys.push(key); return key; }
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 }
  };
  return { system, i18nKeys };
}

function buildActor(name = 'Crafter') {
  return { id: 'actor-1', name, uuid: `Actor.${name}` };
}

function buildRecipe(systemId = 'sys-1') {
  return {
    id: 'recipe-1',
    name: 'Iron Sword',
    craftingSystemId: systemId,
    ingredientSets: [],
    resultGroups: [],
    tools: [],
    outcomeRouting: null,
    transferEffects: false,
    getExecutionSteps: null,
    validate() { return { valid: true, errors: [] }; },
    toJSON() { return { id: this.id, name: this.name }; }
  };
}

function buildIngredientItem(name = 'Iron Ingot', quantity = 2) {
  return {
    id: `item-${name}`,
    uuid: `Item.${name}`,
    name,
    parent: null,
    system: { quantity },
    async delete() {},
    async update(p) { if (p['system.quantity'] != null) this.system.quantity = p['system.quantity']; }
  };
}

function buildIngredientSet(item) {
  const ingredient = { systemItemId: item.id, quantity: 1, getDescription: () => item.name };
  return {
    id: 'set-1',
    matchIngredients(availableItems, matcher) {
      const matched = availableItems.find(i => i === item);
      if (!matched) return [];
      return [{ item: matched, quantity: 1, ingredient }];
    }
  };
}

function buildEngine(item, ingredientSet, overrideResolution = null) {
  const mockRecipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], tools: [] } };
    },
    ingredientMatchesItem(recipe, ingredient, itm) { return itm === item; }
  };
  const resolutionService = overrideResolution || {
    validateRecipe() { return { valid: true, errors: [] }; },
    validateCheckResult() { return true; },
    resolveResultGroups() { return { groups: [], meta: {} }; },
    getMode() { return 'simple'; }
  };
  return new CraftingEngine(mockRecipeManager, null, resolutionService);
}

function buildActors(item) {
  const sourceActor = { id: 'a1', name: 'Crafter', items: [item] };
  const craftingActor = {
    id: 'a1', name: 'Crafter', uuid: 'Actor.a1',
    items: { contents: [] },
    async createEmbeddedDocuments() { return []; }
  };
  return { sourceActor, craftingActor };
}

// ---------------------------------------------------------------------------
// Test 1: Success message payload content
// ---------------------------------------------------------------------------

test('_postCraftChatMessage: success message includes actor name, recipe name, consumed and results', async () => {
  setupGame(true);
  resetChat();

  const engine = new CraftingEngine({});
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const consumedIngredients = [
    { item: { name: 'Iron Ingot', uuid: 'Item.iron' }, quantity: 3 }
  ];
  const tools = [{ item: { name: 'Forge Hammer', uuid: 'Item.hammer' } }];
  const createdResults = [{ name: 'Iron Sword', uuid: 'Item.sword', system: { quantity: 1 } }];

  await engine._postCraftChatMessage({
    success: true,
    craftingActor: buildActor('Gandalf'),
    recipe: buildRecipe(),
    consumedIngredients,
    tools,
    createdResults,
    failureReason: undefined
  });

  assert.equal(chatCreated.length, 1, 'Exactly one message posted');
  const content = chatCreated[0].content;
  assert.ok(content.includes('Gandalf'), 'Actor name in content');
  assert.ok(content.includes('Iron Sword'), 'Recipe name in content');
  assert.ok(content.includes('Iron Ingot'), 'Consumed ingredient name in content');
  assert.ok(content.includes('3'), 'Consumed ingredient quantity in content');
  assert.ok(content.includes('Forge Hammer'), 'Tool name in content');
  assert.ok(content.includes('Iron Sword'), 'Created result name in content');
});

// ---------------------------------------------------------------------------
// Test 2: Failure message payload content
// ---------------------------------------------------------------------------

test('_postCraftChatMessage: failure message includes actor, recipe, reason, and consumed resources', async () => {
  setupGame(true);
  resetChat();

  const engine = new CraftingEngine({});

  const consumedIngredients = [{ item: { name: 'Silver Dust', uuid: 'Item.silver' }, quantity: 2 }];
  const tools = [{ item: { name: 'Magic Crucible', uuid: 'Item.crucible' } }];

  await engine._postCraftChatMessage({
    success: false,
    craftingActor: buildActor('Merlin'),
    recipe: buildRecipe(),
    consumedIngredients,
    tools,
    createdResults: [],
    failureReason: 'Skill check too low'
  });

  assert.equal(chatCreated.length, 1, 'Exactly one message posted');
  const content = chatCreated[0].content;
  assert.ok(content.includes('Merlin'), 'Actor name in failure message');
  assert.ok(content.includes('Iron Sword'), 'Recipe name in failure message');
  assert.ok(content.includes('Skill check too low'), 'Failure reason in message');
  assert.ok(content.includes('Silver Dust'), 'Consumed ingredient in failure message');
  assert.ok(content.includes('Magic Crucible'), 'Consumed tool in failure message');
});

// ---------------------------------------------------------------------------
// Test 3: Toggle disabled -> no ChatMessage.create call
// ---------------------------------------------------------------------------

test('_postCraftChatMessage: does not call ChatMessage.create when chatOutput is false', async () => {
  setupGame(false); // toggle OFF
  resetChat();

  const engine = new CraftingEngine({});
  await engine._postCraftChatMessage({
    success: true,
    craftingActor: buildActor(),
    recipe: buildRecipe(),
    consumedIngredients: [],
    tools: [],
    createdResults: []
  });

  assert.equal(chatCreated.length, 0, 'ChatMessage.create must NOT be called when toggle is off');
});

// ---------------------------------------------------------------------------
// Test 4: Toggle enabled (default) -> ChatMessage.create called
// ---------------------------------------------------------------------------

test('_postCraftChatMessage: calls ChatMessage.create when chatOutput is true', async () => {
  setupGame(true); // toggle ON
  resetChat();

  const engine = new CraftingEngine({});
  await engine._postCraftChatMessage({
    success: true,
    craftingActor: buildActor(),
    recipe: buildRecipe(),
    consumedIngredients: [],
    tools: [],
    createdResults: []
  });

  assert.equal(chatCreated.length, 1, 'ChatMessage.create must be called when toggle is on');
});

// ---------------------------------------------------------------------------
// Test 5: No system found -> graceful, no error
// ---------------------------------------------------------------------------

test('_postCraftChatMessage: does not throw when system is not found', async () => {
  setupGame(true);
  resetChat();

  const engine = new CraftingEngine({});
  const recipe = buildRecipe('nonexistent-system-id'); // system not in manager

  await assert.doesNotReject(
    () => engine._postCraftChatMessage({
      success: true,
      craftingActor: buildActor(),
      recipe,
      consumedIngredients: [],
      tools: [],
      createdResults: []
    }),
    'Should not throw when system is not found'
  );

  assert.equal(chatCreated.length, 0, 'No message when system not found');
});

// ---------------------------------------------------------------------------
// Test 6: Localization keys used
// ---------------------------------------------------------------------------

test('_postCraftChatMessage: uses FABRICATE.Chat.* localization keys', async () => {
  const { i18nKeys } = setupGame(true);
  resetChat();

  const engine = new CraftingEngine({});
  await engine._postCraftChatMessage({
    success: true,
    craftingActor: buildActor(),
    recipe: buildRecipe(),
    consumedIngredients: [{ item: { name: 'Iron Ingot' }, quantity: 1 }],
    tools: [],
    createdResults: [{ name: 'Iron Sword', system: { quantity: 1 } }]
  });

  assert.ok(i18nKeys.length > 0, 'Localization keys should be used');
  for (const key of i18nKeys) {
    assert.ok(key.startsWith('FABRICATE.'), `Key "${key}" must start with FABRICATE. namespace`);
  }
  assert.ok(
    i18nKeys.some(k => k.startsWith('FABRICATE.Chat.')),
    'At least one FABRICATE.Chat.* key should be used'
  );
});

// ---------------------------------------------------------------------------
// Test 7: Exactly-once emission in full craft() flow
// ---------------------------------------------------------------------------

test('craft(): posts ChatMessage exactly once on success', async () => {
  setupGame(true);
  resetChat();

  const item = buildIngredientItem('Iron Ingot', 3);
  const ingredientSet = buildIngredientSet(item);
  const recipe = buildRecipe();
  const { sourceActor, craftingActor } = buildActors(item);

  const engine = buildEngine(item, ingredientSet);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft should succeed');
  assert.equal(chatCreated.length, 1, 'ChatMessage.create should be called exactly once on success');
});

test('craft(): posts ChatMessage exactly once on check failure', async () => {
  setupGame(true);
  resetChat();

  const item = buildIngredientItem('Iron Ingot', 3);
  const ingredientSet = buildIngredientSet(item);
  const recipe = buildRecipe();
  const { sourceActor, craftingActor } = buildActors(item);

  const engine = buildEngine(item, ingredientSet);
  engine._runCraftingCheck = async () => ({ success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail');
  assert.equal(chatCreated.length, 1, 'ChatMessage.create should be called exactly once on check failure');
});

// ---------------------------------------------------------------------------
// Test 8: No message for validation-only failures (no actor, missing items)
// ---------------------------------------------------------------------------

test('craft(): does not post chat when craftingActor is missing', async () => {
  setupGame(true);
  resetChat();

  const engine = new CraftingEngine({});
  const result = await engine.craft(null, [buildActor()], buildRecipe(), null, {});

  assert.equal(result.success, false, 'craft should return failure');
  assert.equal(chatCreated.length, 0, 'No chat message for early-exit validation failure (no actor)');
});

test('craft(): does not post chat when ingredient check fails (canCraft false)', async () => {
  setupGame(true);
  resetChat();

  const item = buildIngredientItem('Iron Ingot', 0);
  const recipe = buildRecipe();
  const craftingActor = {
    id: 'a1', name: 'Crafter', uuid: 'Actor.a1',
    items: { contents: [] },
    async createEmbeddedDocuments() { return []; }
  };
  const sourceActor = { id: 'a1', name: 'Crafter', items: [] };

  const mockRecipeManager = {
    canCraft() {
      return { canCraft: false, satisfiableSet: null, missing: { ingredients: [{ name: 'Iron Ingot' }], essences: [], tools: [] } };
    },
    ingredientMatchesItem() { return false; }
  };

  const engine = new CraftingEngine(mockRecipeManager, null, {
    validateRecipe() { return { valid: true, errors: [] }; },
    validateCheckResult() { return true; },
    resolveResultGroups() { return { groups: [], meta: {} }; },
    getMode() { return 'simple'; }
  });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail due to missing ingredients');
  assert.equal(chatCreated.length, 0, 'No chat message when craft fails due to missing items');
});

// ---------------------------------------------------------------------------
// Additional: failure path respects toggle (chatOutput disabled)
// ---------------------------------------------------------------------------

test('_postCraftChatMessage: failure does not post when chatOutput toggle is off', async () => {
  setupGame(false); // toggle OFF
  resetChat();

  const engine = new CraftingEngine({});
  await engine._postCraftChatMessage({
    success: false,
    craftingActor: buildActor(),
    recipe: buildRecipe(),
    consumedIngredients: [],
    tools: [],
    createdResults: [],
    failureReason: 'Check failed'
  });

  assert.equal(chatCreated.length, 0, 'No failure chat message should be posted when chatOutput toggle is off');
});
