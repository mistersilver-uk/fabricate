/**
 * Unit tests for RecipeVisibilityService (T-024)
 *
 * Covers:
 *   AC1 - Player mode listing (restricted/allowedUserIds)
 *   AC2 - Knowledge mode access (item/learned/itemOrLearned)
 *   AC3 - Recipe item matching (UUID and core.sourceId)
 *   AC4 - Limited-use exhaustion
 *   AC5 - Deterministic item selection
 *   AC6 - Learn operation
 *   AC7 - Edge cases
 *
 * Flag double-prefix:
 *   getFabricateFlag(doc, 'learnedRecipes', {}) calls
 *     doc.getFlag('fabricate', 'fabricate.learnedRecipes')
 *   FakeDocument.getFlag(scope, key) does getPathValue(this._flags[scope], key)
 *   _flags = { fabricate: <flagsArg> }
 *   So to seed 'learnedRecipes', pass flagsArg = { fabricate: { learnedRecipes: value } }
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { getProperty } };
globalThis.ui = {
  notifications: { info: () => {}, warn: () => {}, error: () => {} }
};

// game.actors is used by cleanupLearnedRecipes — set per-test via helper
globalThis.game = { actors: [] };

// ---------------------------------------------------------------------------
// Import after globals are set
// ---------------------------------------------------------------------------

const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getPathValue(object, path) {
  return String(path).split('.').reduce((value, part) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[part];
  }, object);
}

function setPathValue(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') {
      target[part] = {};
    }
    target = target[part];
  }
  target[last] = value;
}

// ---------------------------------------------------------------------------
// FakeDocument
//
// Stores state in this._flags = { fabricate: <flagsArg> }
// getFlag('fabricate', 'fabricate.learnedRecipes') resolves
//   getPathValue(this._flags['fabricate'], 'fabricate.learnedRecipes')
//   = this._flags.fabricate.fabricate.learnedRecipes
// So to seed 'learnedRecipes', pass flagsArg = { fabricate: { learnedRecipes: value } }
// ---------------------------------------------------------------------------

class FakeDocument {
  constructor(flagsArg = {}) {
    this._flags = { fabricate: flagsArg };
  }

  getFlag(scope, key) {
    if (!this._flags[scope]) return undefined;
    return getPathValue(this._flags[scope], key);
  }

  async setFlag(scope, key, value) {
    if (!this._flags[scope]) this._flags[scope] = {};
    setPathValue(this._flags[scope], key, value);
    return value;
  }

  async unsetFlag(scope, key) {
    const parts = String(key).split('.');
    const last = parts.pop();
    const parent = getPathValue(this._flags[scope], parts.join('.'));
    if (parent && typeof parent === 'object') {
      delete parent[last];
    }
  }
}

// ---------------------------------------------------------------------------
// FakeItem — extends FakeDocument with uuid, flags.core.sourceId, and delete()
// ---------------------------------------------------------------------------

class FakeItem extends FakeDocument {
  constructor({ uuid = 'item-uuid', sourceId = null, flagsArg = {} } = {}) {
    super(flagsArg);
    this.uuid = uuid;
    // flags.core.sourceId is read by _isMatchingRecipeItem via foundry.utils.getProperty
    this.flags = sourceId ? { core: { sourceId } } : {};
    this.deleted = false;
  }

  async delete() {
    this.deleted = true;
  }
}

// ---------------------------------------------------------------------------
// FakeActor — has id, items array, and inherits FakeDocument flag behaviour
// ---------------------------------------------------------------------------

class FakeActor extends FakeDocument {
  constructor({ id = 'actor-1', items = [], flagsArg = {} } = {}) {
    super(flagsArg);
    this.id = id;
    this.items = items;
  }
}

// ---------------------------------------------------------------------------
// Recipe / system factory helpers
// ---------------------------------------------------------------------------

function buildMockRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'system-1',
    visibility: { restricted: false, allowedUserIds: [] },
    locked: false,
    linkedRecipeItemUuid: 'recipe-item-uuid',
    enabled: true,
    ...overrides
  };
}

function buildMockSystem(overrides = {}) {
  return {
    recipeVisibility: {
      listMode: 'player',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      },
      ...(overrides.recipeVisibility || {})
    },
    ...overrides
  };
}

function buildService({ system = null, recipes = [] } = {}) {
  const recipeManager = {
    getRecipes: () => recipes
  };
  const craftingSystemManager = {
    getSystem: (id) => system
  };
  return new RecipeVisibilityService(recipeManager, craftingSystemManager);
}

// ---------------------------------------------------------------------------
// AC1 — Player mode listing
// ---------------------------------------------------------------------------

test('AC1.1 - player mode: unrestricted recipe is visible to non-GM', () => {
  const system = buildMockSystem({ recipeVisibility: { listMode: 'player' } });
  const recipe = buildMockRecipe({ visibility: { restricted: false, allowedUserIds: [] } });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer });

  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
});

test('AC1.2 - player mode: restricted recipe visible when viewer is in allowedUserIds', () => {
  const system = buildMockSystem({ recipeVisibility: { listMode: 'player' } });
  const recipe = buildMockRecipe({ visibility: { restricted: true, allowedUserIds: ['user-1'] } });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer });

  assert.equal(result.visible, true);
});

test('AC1.3 - player mode: restricted recipe hidden when viewer not in allowedUserIds', () => {
  const system = buildMockSystem({ recipeVisibility: { listMode: 'player' } });
  const recipe = buildMockRecipe({ visibility: { restricted: true, allowedUserIds: ['user-2'] } });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer });

  assert.equal(result.visible, false);
  assert.equal(result.craftable, false);
});

test('AC1.4 - player mode: GM always sees restricted recipe', () => {
  const system = buildMockSystem({ recipeVisibility: { listMode: 'player' } });
  const recipe = buildMockRecipe({ visibility: { restricted: true, allowedUserIds: [] } });
  const viewer = { isGM: true, id: 'gm-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer });

  assert.equal(result.visible, true);
});

test('AC1.5 - player mode: getVisibleRecipes filters recipes based on player visibility', () => {
  const system = buildMockSystem({ recipeVisibility: { listMode: 'player' } });
  const openRecipe = buildMockRecipe({
    id: 'recipe-open',
    visibility: { restricted: false, allowedUserIds: [] }
  });
  const closedRecipe = buildMockRecipe({
    id: 'recipe-closed',
    visibility: { restricted: true, allowedUserIds: ['user-2'] }
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system, recipes: [openRecipe, closedRecipe] });

  const results = service.getVisibleRecipes({ viewer, craftingSystemId: 'system-1' });

  assert.equal(results.length, 1);
  assert.equal(results[0].recipe.id, 'recipe-open');
});

test('AC1.6 - global mode: non-GM can see and craft recipe without knowledge access', () => {
  const system = buildMockSystem({ recipeVisibility: { listMode: 'global' } });
  const recipe = buildMockRecipe({
    visibility: { restricted: true, allowedUserIds: [] },
    linkedRecipeItemUuid: 'missing-recipe-item-uuid'
  });
  const viewer = { isGM: false, id: 'user-1' };
  const craftingActor = new FakeActor({ id: 'actor-1', items: [] });
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
  assert.equal(result.reason, 'ok');
});

test('AC1.7 - missing listMode defaults to global visibility behaviour', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: undefined
    }
  });
  const recipe = buildMockRecipe({
    visibility: { restricted: true, allowedUserIds: [] },
    linkedRecipeItemUuid: 'missing-recipe-item-uuid'
  });
  const viewer = { isGM: false, id: 'user-1' };
  const craftingActor = new FakeActor({ id: 'actor-1', items: [] });
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
  assert.equal(result.reason, 'ok');
});

// ---------------------------------------------------------------------------
// AC2 — Knowledge mode access evaluation
// ---------------------------------------------------------------------------

test('AC2.1 - knowledge item mode: grants access when matching item exists', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'item',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'recipe-item-uuid' });
  const matchingItem = new FakeItem({ uuid: 'recipe-item-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [matchingItem] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateKnowledgeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.granted, true);
  assert.equal(result.hasMatchedItem, true);
});

test('AC2.2 - knowledge item mode: denies access when no matching item', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'item',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'recipe-item-uuid' });
  const nonMatchingItem = new FakeItem({ uuid: 'different-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [nonMatchingItem] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateKnowledgeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.granted, false);
  assert.equal(result.hasMatchedItem, false);
});

test('AC2.3 - knowledge learned mode: grants access when recipe is learned', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1' });
  // Seed: _flags.fabricate.fabricate.learnedRecipes = { 'recipe-1': { learnedAt: 1 } }
  const craftingActor = new FakeActor({
    id: 'actor-1',
    flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1 } } } }
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateKnowledgeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.granted, true);
  assert.equal(result.hasLearned, true);
});

test('AC2.4 - knowledge learned mode: denies access when recipe not learned', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1' });
  const craftingActor = new FakeActor({ id: 'actor-1' });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateKnowledgeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.granted, false);
  assert.equal(result.hasLearned, false);
});

test('AC2.5 - knowledge itemOrLearned mode: grants when only item matches', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const matchingItem = new FakeItem({ uuid: 'recipe-item-uuid' });
  // No learned recipes seeded
  const craftingActor = new FakeActor({ id: 'actor-1', items: [matchingItem] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateKnowledgeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.granted, true);
  assert.equal(result.hasMatchedItem, true);
  assert.equal(result.hasLearned, false);
});

test('AC2.6 - knowledge itemOrLearned mode: grants when only learned', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'recipe-item-uuid' });
  // No matching item in inventory
  const craftingActor = new FakeActor({
    id: 'actor-1',
    items: [],
    flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1 } } } }
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateKnowledgeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.granted, true);
  assert.equal(result.hasMatchedItem, false);
  assert.equal(result.hasLearned, true);
});

// ---------------------------------------------------------------------------
// AC3 — Recipe item matching
// ---------------------------------------------------------------------------

test('AC3.1 - _isMatchingRecipeItem returns true when item.uuid matches linkedRecipeItemUuid', () => {
  const service = buildService();
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'recipe-item-uuid' });
  const item = new FakeItem({ uuid: 'recipe-item-uuid' });

  assert.equal(service._isMatchingRecipeItem(recipe, item), true);
});

test('AC3.2 - _isMatchingRecipeItem returns true when flags.core.sourceId matches linkedRecipeItemUuid', () => {
  const service = buildService();
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'compendium-source-id' });
  // Different uuid but matching sourceId
  const item = new FakeItem({ uuid: 'world-item-uuid', sourceId: 'compendium-source-id' });

  assert.equal(service._isMatchingRecipeItem(recipe, item), true);
});

test('AC3.3 - _isMatchingRecipeItem returns false when neither UUID nor sourceId matches', () => {
  const service = buildService();
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'target-uuid' });
  const item = new FakeItem({ uuid: 'other-uuid', sourceId: 'other-source-id' });

  assert.equal(service._isMatchingRecipeItem(recipe, item), false);
});

test('AC3.4 - _collectCandidateItems gathers items from craftingActor and componentSourceActors', () => {
  const system = buildMockSystem();
  const service = buildService({ system });
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'recipe-item-uuid' });

  const itemA = new FakeItem({ uuid: 'recipe-item-uuid' });
  const itemB = new FakeItem({ uuid: 'recipe-item-uuid' });
  const actorA = new FakeActor({ id: 'actor-a', items: [itemA] });
  const actorB = new FakeActor({ id: 'actor-b', items: [itemB] });

  const matches = service._collectCandidateItems(recipe, actorA, [actorB]);

  assert.equal(matches.length, 2);
  assert.equal(matches[0].actorOrder, 0);
  assert.equal(matches[0].itemOrder, 0);
  assert.equal(matches[1].actorOrder, 1);
  assert.equal(matches[1].itemOrder, 0);
});

// ---------------------------------------------------------------------------
// AC4 — Limited-use exhaustion
// ---------------------------------------------------------------------------

test('AC4.1 - _filterNonExhausted keeps items below maxUses', () => {
  const service = buildService();
  const knowledgeItemCfg = { limitUses: true, maxUses: 3 };
  const matches = [{ timesUsed: 2 }];

  const result = service._filterNonExhausted(matches, knowledgeItemCfg);

  assert.equal(result.length, 1);
});

test('AC4.2 - _filterNonExhausted removes items at maxUses', () => {
  const service = buildService();
  const knowledgeItemCfg = { limitUses: true, maxUses: 3 };
  const matches = [{ timesUsed: 3 }];

  const result = service._filterNonExhausted(matches, knowledgeItemCfg);

  assert.equal(result.length, 0);
});

test('AC4.3 - _filterNonExhausted keeps all when limitUses is false', () => {
  const service = buildService();
  const knowledgeItemCfg = { limitUses: false, maxUses: 3 };
  const matches = [{ timesUsed: 100 }, { timesUsed: 5 }];

  const result = service._filterNonExhausted(matches, knowledgeItemCfg);

  assert.equal(result.length, 2);
});

test('AC4.4 - applyRecipeItemUseOnCraft increments timesUsed and destroys item when exhausted', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'item',
        item: { limitUses: true, maxUses: 2, destroyWhenExhausted: true },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'recipe-item-uuid' });
  // Item with timesUsed: 1 (so incrementing to 2 hits maxUses)
  const item = new FakeItem({
    uuid: 'recipe-item-uuid',
    flagsArg: { fabricate: { recipeItemUsage: { timesUsed: 1 } } }
  });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system });

  await service.applyRecipeItemUseOnCraft({ recipe, craftingActor });

  // timesUsed should now be 2
  const usage = item.getFlag('fabricate', 'fabricate.recipeItemUsage');
  assert.equal(usage.timesUsed, 2);
  // Item should be deleted because destroyWhenExhausted is true
  assert.equal(item.deleted, true);
});

// ---------------------------------------------------------------------------
// AC5 — Deterministic item selection
// ---------------------------------------------------------------------------

test('AC5.1 - _selectDeterministic selects item with highest timesUsed', () => {
  const service = buildService();
  const itemA = new FakeItem({ uuid: 'item-a' });
  const itemB = new FakeItem({ uuid: 'item-b' });
  const matches = [
    { item: itemA, actorOrder: 0, itemOrder: 0, timesUsed: 3 },
    { item: itemB, actorOrder: 0, itemOrder: 1, timesUsed: 7 }
  ];

  const selected = service._selectDeterministic(matches);

  assert.equal(selected.item.uuid, 'item-b');
  assert.equal(selected.timesUsed, 7);
});

test('AC5.2 - _selectDeterministic tiebreaks by lower actorOrder when timesUsed is equal', () => {
  const service = buildService();
  const itemA = new FakeItem({ uuid: 'item-a' });
  const itemB = new FakeItem({ uuid: 'item-b' });
  const matches = [
    { item: itemA, actorOrder: 1, itemOrder: 0, timesUsed: 5 },
    { item: itemB, actorOrder: 0, itemOrder: 0, timesUsed: 5 }
  ];

  const selected = service._selectDeterministic(matches);

  assert.equal(selected.item.uuid, 'item-b');
  assert.equal(selected.actorOrder, 0);
});

test('AC5.3 - _selectDeterministic tiebreaks by lower itemOrder when timesUsed and actorOrder are equal', () => {
  const service = buildService();
  const itemA = new FakeItem({ uuid: 'item-a' });
  const itemB = new FakeItem({ uuid: 'item-b' });
  const matches = [
    { item: itemA, actorOrder: 0, itemOrder: 2, timesUsed: 4 },
    { item: itemB, actorOrder: 0, itemOrder: 0, timesUsed: 4 }
  ];

  const selected = service._selectDeterministic(matches);

  assert.equal(selected.item.uuid, 'item-b');
  assert.equal(selected.itemOrder, 0);
});

// ---------------------------------------------------------------------------
// AC6 — Learn operation
// ---------------------------------------------------------------------------

test('AC6.1 - learnRecipe writes learnedAt and sourceItemUuid to actor flag', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const item = new FakeItem({ uuid: 'recipe-item-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [item] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, true);
  // Verify flag was written
  const learned = craftingActor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.ok(learned['recipe-1']);
  assert.ok(typeof learned['recipe-1'].learnedAt === 'number');
  assert.equal(learned['recipe-1'].sourceItemUuid, 'recipe-item-uuid');
  // Item should NOT be deleted (consumeOnLearn: false)
  assert.equal(item.deleted, false);
});

test('AC6.2 - learnRecipe with consumeOnLearn deletes the matched item', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: true }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const item = new FakeItem({ uuid: 'recipe-item-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [item] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, true);
  assert.equal(item.deleted, true);
});

test('AC6.3 - learnRecipe rejects when recipe is already learned', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const craftingActor = new FakeActor({
    id: 'actor-1',
    flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1000 } } } }
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, false);
  assert.match(result.message, /already learned/i);
});

test('AC6.4 - learnRecipe rejects when no matching recipe item exists', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, false);
  assert.match(result.message, /No matching/i);
});

test('AC6.5 - learnRecipe rejects when knowledge mode does not support learning', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'item',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1' });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, false);
  assert.match(result.message, /not enabled/i);
});

test('AC6.6 - learnRecipe rejects when recipe has no linkedRecipeItemUuid', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: null });
  const craftingActor = new FakeActor({ id: 'actor-1' });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, false);
  assert.match(result.message, /item link is required/i);
});

// ---------------------------------------------------------------------------
// AC7 — Edge cases
// ---------------------------------------------------------------------------

test('AC7.1 - evaluateRecipeAccess returns missing-system reason when system not found', () => {
  // buildService with system=null means getSystem returns null
  const service = buildService({ system: null });
  const recipe = buildMockRecipe({ craftingSystemId: 'nonexistent' });
  const viewer = { isGM: false, id: 'user-1' };

  const result = service.evaluateRecipeAccess({ recipe, viewer });

  assert.equal(result.visible, false);
  assert.equal(result.craftable, false);
  assert.equal(result.reason, 'missing-system');
});

test('AC7.2 - locked recipe is visible but not craftable for non-GM', () => {
  const system = buildMockSystem({ recipeVisibility: { listMode: 'player' } });
  const recipe = buildMockRecipe({
    locked: true,
    visibility: { restricted: false, allowedUserIds: [] }
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer });

  assert.equal(result.visible, true);
  assert.equal(result.craftable, false);
  assert.equal(result.reason, 'locked');
});

test('AC7.3 - GM bypasses knowledge access and gets granted: true with reason gm', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'recipe-item-uuid' });
  // GM has no items and no learned recipes — but should still be granted
  const craftingActor = new FakeActor({ id: 'gm-actor', items: [] });
  const viewer = { isGM: true, id: 'gm-1' };
  const service = buildService({ system });

  const result = service.evaluateKnowledgeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.granted, true);
  assert.equal(result.reason, 'gm');
});

test('AC7.4 - cleanupLearnedRecipes removes stale entries and retains valid ones', async () => {
  const service = buildService();
  const actorA = new FakeActor({
    id: 'actor-a',
    flagsArg: {
      fabricate: {
        learnedRecipes: {
          'recipe-a': { learnedAt: 1 },
          'recipe-b': { learnedAt: 2 },
          'recipe-c': { learnedAt: 3 }
        }
      }
    }
  });

  // Override game.actors for this test
  const originalActors = globalThis.game.actors;
  globalThis.game.actors = [actorA];

  try {
    const validRecipeIds = new Set(['recipe-a', 'recipe-c']);
    await service.cleanupLearnedRecipes(validRecipeIds);

    const learned = actorA.getFlag('fabricate', 'fabricate.learnedRecipes');
    assert.ok('recipe-a' in learned, 'recipe-a should be retained');
    assert.ok('recipe-c' in learned, 'recipe-c should be retained');
    assert.ok(!('recipe-b' in learned), 'recipe-b should be removed');
  } finally {
    globalThis.game.actors = originalActors;
  }
});
