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
  constructor({ uuid = 'item-uuid', name = 'Recipe Item', sourceId = null, compendiumSource = null, flagsArg = {} } = {}) {
    super(flagsArg);
    this.uuid = uuid;
    this.name = name;
    // flags.core.sourceId is read by _isMatchingRecipeItem via the legacy fallback path
    this.flags = sourceId ? { core: { sourceId } } : {};
    // _stats.compendiumSource is the Foundry v12+ canonical field
    if (compendiumSource) {
      this._stats = { compendiumSource };
    }
    this.deleted = false;
    this.deleteCount = 0;
  }

  async delete() {
    this.deleted = true;
    this.deleteCount += 1;
  }
}

// ---------------------------------------------------------------------------
// FakeActor — has id, items array, and inherits FakeDocument flag behaviour
// ---------------------------------------------------------------------------

class FakeActor extends FakeDocument {
  constructor({ id = 'actor-1', name = 'Test Actor', items = [], flagsArg = {} } = {}) {
    super(flagsArg);
    this.id = id;
    this.name = name;
    this.items = items;
    for (const item of items) {
      if (item && !item.parent) item.parent = this;
    }
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
  const system = {
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
  // Per-item caps (issue 511): the service now reads use/learn caps from the
  // recipe's linked recipe item definition, not the system-wide knowledge config.
  // These fixtures still declare caps under knowledge.item / knowledge.learn, so
  // mirror those onto each recipe item definition — exactly as the 1.11.0 migration
  // does at load time — keeping the fixtures exercising real cap behaviour. A
  // definition that already carries its own `caps` is left untouched.
  const knowledge = system.recipeVisibility?.knowledge || {};
  const seededCaps = {
    item: { ...(knowledge.item || {}) },
    learn: {
      consumeOnLearn: knowledge.learn?.consumeOnLearn,
      limitRecipes: knowledge.learn?.limitRecipes,
      maxRecipes: knowledge.learn?.maxRecipes,
      destroyWhenSpent: knowledge.learn?.destroyWhenSpent
    }
  };
  if (Array.isArray(system.recipeItemDefinitions)) {
    system.recipeItemDefinitions = system.recipeItemDefinitions.map((def) =>
      def && def.caps ? def : { ...def, caps: seededCaps }
    );
  }
  return system;
}

function buildService({ system = null, systems = null, recipes = [] } = {}) {
  const recipeManager = {
    getRecipes: () => recipes
  };
  const craftingSystemManager = {
    getSystem: (id) => {
      if (systems) return systems[id] || null;
      return system;
    }
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

// `_filterNonExhausted` resolves each candidate against its OWN book's caps; a
// match with no `item` resolves to the recipe's first member book, so these
// helper-level tests author the caps on that book.
function buildUseCapService(itemCaps) {
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'item' } },
    recipeItemDefinitions: [
      { id: 'book', originItemUuid: 'src-book', caps: { item: itemCaps, learn: {} } }
    ]
  });
  const recipe = buildMockRecipe({ id: 'r1', recipeItemId: 'book', linkedRecipeItemUuid: null });
  return { recipe, service: buildService({ system, recipes: [recipe] }) };
}

test('AC4.1 - _filterNonExhausted keeps items below the matched book maxUses', () => {
  const { recipe, service } = buildUseCapService({ limitUses: true, maxUses: 3 });
  const matches = [{ timesUsed: 2 }];

  const result = service._filterNonExhausted(recipe, matches);

  assert.equal(result.length, 1);
});

test('AC4.2 - _filterNonExhausted removes items at the matched book maxUses', () => {
  const { recipe, service } = buildUseCapService({ limitUses: true, maxUses: 3 });
  const matches = [{ timesUsed: 3 }];

  const result = service._filterNonExhausted(recipe, matches);

  assert.equal(result.length, 0);
});

test('AC4.3 - _filterNonExhausted keeps all when the matched book limitUses is false', () => {
  const { recipe, service } = buildUseCapService({ limitUses: false, maxUses: 3 });
  const matches = [{ timesUsed: 100 }, { timesUsed: 5 }];

  const result = service._filterNonExhausted(recipe, matches);

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
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'recipe-item-uuid' }]
  });
  const recipe = buildMockRecipe({ recipeItemId: 'book', linkedRecipeItemUuid: 'recipe-item-uuid' });
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

test('AC4.5 - applyRecipeItemUseOnCraft skips use-tracking when no actual matching item is present (even for a GM actor)', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'item',
        item: { limitUses: true, maxUses: 3, destroyWhenExhausted: true },
        learn: { consumeOnLearn: false }
      }
    }
  });
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'recipe-item-uuid' });
  // GM actor owns a non-matching item only — no real matched recipe item.
  const nonMatchingItem = new FakeItem({ uuid: 'different-uuid' });
  const craftingActor = new FakeActor({ id: 'gm-actor', items: [nonMatchingItem] });
  craftingActor.isGM = true;
  const service = buildService({ system });

  let usageWrites = 0;
  const originalSetUsage = service._setRecipeItemUsage.bind(service);
  service._setRecipeItemUsage = async (item, timesUsed) => {
    usageWrites += 1;
    return originalSetUsage(item, timesUsed);
  };

  await service.applyRecipeItemUseOnCraft({ recipe, craftingActor });

  assert.equal(usageWrites, 0, 'no use-tracking write should occur when no matching item exists');
  assert.equal(nonMatchingItem.deleted, false);
});

// ---------------------------------------------------------------------------
// Issue 511 Phase 1 — per-document learn-count helpers (mirror recipeItemUsage)
// ---------------------------------------------------------------------------

test('511.P1.1 - _getRecipeItemLearnCount reads the per-document learn count, defaulting to 0', () => {
  const service = buildService();
  const empty = new FakeItem({ uuid: 'book' });
  assert.equal(service._getRecipeItemLearnCount(empty), 0);

  const seeded = new FakeItem({
    uuid: 'book',
    flagsArg: { fabricate: { recipeItemLearning: { learnedCount: 2 } } }
  });
  assert.equal(service._getRecipeItemLearnCount(seeded), 2);
});

test('511.P1.2 - _setRecipeItemLearnCount writes a clamped non-negative integer on the item document', async () => {
  const service = buildService();
  const item = new FakeItem({ uuid: 'book' });

  await service._setRecipeItemLearnCount(item, 3.9);
  assert.equal(service._getRecipeItemLearnCount(item), 3);

  await service._setRecipeItemLearnCount(item, -5);
  assert.equal(service._getRecipeItemLearnCount(item), 0);
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
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'recipe-item-uuid' }]
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', recipeItemId: 'book', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const item = new FakeItem({ uuid: 'recipe-item-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [item] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, true);
  assert.equal(result.message, 'FABRICATE.Knowledge.LearnedRecipe');
  assert.deepEqual(result.messageData, { name: recipe.name });
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
  assert.equal(result.message, 'FABRICATE.Knowledge.LearnedRecipe');
  assert.deepEqual(result.messageData, { name: recipe.name });
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
  assert.equal(result.message, 'FABRICATE.Knowledge.AlreadyLearned');
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
  assert.equal(result.message, 'FABRICATE.Knowledge.NoMatchingItem');
});

test('AC6.4a - learnRecipe for a GM succeeds when the GM owns a matching item (despite evaluateKnowledgeAccess matchedItems:[])', async () => {
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
  const craftingActor = new FakeActor({ id: 'gm-actor', items: [item] });
  const viewer = { isGM: true, id: 'gm-1' };
  const service = buildService({ system });

  // Sanity: the GM bypass returns an empty matchedItems array — the bug the fix guards against.
  const access = service.evaluateKnowledgeAccess({ recipe, viewer, craftingActor });
  assert.equal(access.reason, 'gm');
  assert.deepEqual(access.matchedItems, []);

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, true);
  assert.equal(result.message, 'FABRICATE.Knowledge.LearnedRecipe');
  const learned = craftingActor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.ok(learned['recipe-1']);
  assert.equal(learned['recipe-1'].sourceItemUuid, 'recipe-item-uuid');
});

test('AC6.4b - learnRecipe for a GM rejects with noMatchingItem when the GM owns no matching item', async () => {
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
  const craftingActor = new FakeActor({ id: 'gm-actor', items: [] });
  const viewer = { isGM: true, id: 'gm-1' };
  const service = buildService({ system });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.NoMatchingItem');
  const learned = craftingActor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.ok(!learned || !learned['recipe-1']);
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
  assert.equal(result.message, 'FABRICATE.Knowledge.LearningDisabled');
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
  assert.equal(result.message, 'FABRICATE.Knowledge.LinkedItemRequired');
});

test('AC6.7 - learnRecipe rejects with a localization key when the crafting system is missing', async () => {
  const recipe = buildMockRecipe({ id: 'recipe-1', craftingSystemId: 'missing-system' });
  const craftingActor = new FakeActor({ id: 'actor-1' });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system: null });

  const result = await service.learnRecipe({ viewer, recipe, craftingActor });

  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.SystemNotFound');
});

test('AC6.8 - learnRecipesFromOwnedItem anchors learning and deletion to the exact owned item', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        // consumeOnLearn is authored on the recipe item definition (caps), NOT the
        // system-level field the normalizer strips (#706).
        learn: { dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [
      { id: 'book', originItemUuid: 'Compendium.world.items.book', caps: { learn: { consumeOnLearn: true } } }
    ]
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', recipeItemId: 'book', linkedRecipeItemUuid: null });
  const firstCopy = new FakeItem({ uuid: 'Actor.actor-1.Item.copy-1', sourceId: 'Compendium.world.items.book' });
  const droppedCopy = new FakeItem({ uuid: 'Actor.actor-1.Item.copy-2', sourceId: 'Compendium.world.items.book' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [firstCopy, droppedCopy] });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipesFromOwnedItem({
    ownedItem: droppedCopy,
    actor: craftingActor,
    viewer: { isGM: false, id: 'user-1' },
    mode: 'auto'
  });

  assert.equal(result.notificationKind, 'success');
  const learned = craftingActor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.equal(learned['recipe-1'].sourceItemUuid, 'Actor.actor-1.Item.copy-2');
  assert.equal(firstCopy.deleted, false);
  assert.equal(droppedCopy.deleted, true);
  assert.equal(droppedCopy.deleteCount, 1);
});

test('AC6.9 - learnRecipesFromOwnedItem learns multiple recipes and deletes once after writes', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        // consumeOnLearn authored on the definition (caps), not the stripped
        // system-level field (#706).
        learn: { dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [
      { id: 'book', originItemUuid: 'Compendium.world.items.book', caps: { learn: { consumeOnLearn: true } } }
    ]
  });
  const recipes = [
    buildMockRecipe({ id: 'recipe-a', name: 'Recipe A', recipeItemId: 'book', linkedRecipeItemUuid: null }),
    buildMockRecipe({ id: 'recipe-b', name: 'Recipe B', recipeItemId: 'book', linkedRecipeItemUuid: null }),
    buildMockRecipe({ id: 'recipe-c', name: 'Recipe C', recipeItemId: 'book', linkedRecipeItemUuid: null })
  ];
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({
    id: 'actor-1',
    items: [item],
    flagsArg: { fabricate: { learnedRecipes: { 'recipe-b': { learnedAt: 1000, sourceItemUuid: 'old' } } } }
  });
  const service = buildService({ system, recipes });

  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.equal(result.notificationKind, 'partial');
  assert.deepEqual(result.learnedRecipes.map(recipe => recipe.id), ['recipe-a', 'recipe-c']);
  assert.deepEqual(result.alreadyLearnedRecipes.map(recipe => recipe.id), ['recipe-b']);
  const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.equal(learned['recipe-a'].sourceItemUuid, item.uuid);
  assert.equal(learned['recipe-b'].sourceItemUuid, 'old');
  assert.equal(learned['recipe-c'].sourceItemUuid, item.uuid);
  assert.equal(item.deleteCount, 1);
});

test('AC6.10 - learnRecipesFromOwnedItem does not delete when every matched recipe is already learned', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        // consumeOnLearn authored on the definition (caps), not the stripped
        // system-level field (#706).
        learn: { dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [
      { id: 'book', originItemUuid: 'Compendium.world.items.book', caps: { learn: { consumeOnLearn: true } } }
    ]
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', recipeItemId: 'book', linkedRecipeItemUuid: null });
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({
    id: 'actor-1',
    items: [item],
    flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1000, sourceItemUuid: 'old' } } } }
  });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.equal(result.notificationKind, 'alreadyKnown');
  assert.equal(result.learnedRecipes.length, 0);
  assert.equal(result.alreadyLearnedRecipes.length, 1);
  assert.equal(item.deleted, false);
});

test('AC6.10b - learnRecipesFromOwnedItem does not delete when learned-flag write fails', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: true, dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'Compendium.world.items.book' }]
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', recipeItemId: 'book', linkedRecipeItemUuid: null });
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  actor.setFlag = async () => {
    throw new Error('write failed');
  };
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.equal(result.notificationKind, 'silent');
  assert.equal(item.deleted, false);
});

test('AC6.11 - owned-item learning matches canonical recipeItemId definitions and source UUID variants', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'Compendium.world.items.book' }]
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', recipeItemId: 'book', linkedRecipeItemUuid: null });
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', compendiumSource: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.equal(result.notificationKind, 'success');
  assert.equal(result.learnedRecipes[0].id, 'recipe-1');
});

test('AC6.12 - owned-item learning retains legacy linkedRecipeItemUuid compatibility', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: true }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', recipeItemId: null, linkedRecipeItemUuid: 'legacy-source' });
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'legacy-source' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.equal(result.notificationKind, 'success');
  assert.equal(result.learnedRecipes[0].id, 'recipe-1');
});

test('AC6.13 - owned-item learning splits auto and manual scopes by dragDropEnabled', async () => {
  const autoSystem = buildMockSystem({
    id: 'auto-system',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'shared-source' }]
  });
  const manualSystem = buildMockSystem({
    id: 'manual-system',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: false }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'shared-source' }]
  });
  const recipes = [
    buildMockRecipe({ id: 'auto-recipe', craftingSystemId: 'auto-system', recipeItemId: 'book', linkedRecipeItemUuid: null }),
    buildMockRecipe({ id: 'manual-recipe', craftingSystemId: 'manual-system', recipeItemId: 'book', linkedRecipeItemUuid: null })
  ];
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'shared-source' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({
    systems: { 'auto-system': autoSystem, 'manual-system': manualSystem },
    recipes
  });

  const autoPreview = service.previewOwnedItemLearning({ ownedItem: item, actor, mode: 'auto' });
  const manualPreview = service.previewOwnedItemLearning({ ownedItem: item, actor, mode: 'manual' });

  assert.deepEqual(autoPreview.learnedRecipes.map(recipe => recipe.id), ['auto-recipe']);
  assert.deepEqual(manualPreview.learnedRecipes.map(recipe => recipe.id), ['manual-recipe']);
});

// ---------------------------------------------------------------------------
// Issue 511 Phase 2 — recipe-item learn budget (capped books)
// ---------------------------------------------------------------------------

function buildCappedSystem({ id = 'system-1', maxRecipes = 2, destroyWhenSpent = false, dragDropEnabled = true, originItemUuid = 'Compendium.world.items.book' } = {}) {
  return buildMockSystem({
    id,
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: true, dragDropEnabled, limitRecipes: true, maxRecipes, destroyWhenSpent }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid }]
  });
}

function buildCappedRecipe(overrides = {}) {
  return buildMockRecipe({ recipeItemId: 'book', linkedRecipeItemUuid: null, ...overrides });
}

test('511.P2.1 - getLearnableRecipesFromItem reports remainingBudget = maxRecipes - count and unlearned recipes', () => {
  const system = buildCappedSystem({ maxRecipes: 3 });
  const recipes = [
    buildCappedRecipe({ id: 'r-a', name: 'A' }),
    buildCappedRecipe({ id: 'r-b', name: 'B' })
  ];
  const item = new FakeItem({
    uuid: 'Actor.actor-1.Item.book',
    sourceId: 'Compendium.world.items.book',
    flagsArg: { fabricate: { recipeItemLearning: { learnedCount: 1 } } }
  });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system, recipes });

  const state = service.getLearnableRecipesFromItem({ ownedItem: item, actor });

  assert.equal(state.remainingBudget, 2);
  assert.equal(state.maxRecipes, 3);
  assert.equal(state.count, 1);
  assert.deepEqual(state.recipes.map(r => r.id), ['r-a', 'r-b']);
});

test('511.P2.2 - getLearnableRecipesFromItem returns [] and 0 at the cap', () => {
  const system = buildCappedSystem({ maxRecipes: 2 });
  const recipes = [buildCappedRecipe({ id: 'r-a' }), buildCappedRecipe({ id: 'r-b' })];
  const item = new FakeItem({
    uuid: 'Actor.actor-1.Item.book',
    sourceId: 'Compendium.world.items.book',
    flagsArg: { fabricate: { recipeItemLearning: { learnedCount: 2 } } }
  });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system, recipes });

  const state = service.getLearnableRecipesFromItem({ ownedItem: item, actor });

  assert.deepEqual(state.recipes, []);
  assert.equal(state.remainingBudget, 0);
});

test('511.P2.3 - learnOneRecipeFromItem learns one, increments the per-document count, and refuses the (K+1)th', async () => {
  const system = buildCappedSystem({ maxRecipes: 2 });
  const recipes = [
    buildCappedRecipe({ id: 'r-a', name: 'A' }),
    buildCappedRecipe({ id: 'r-b', name: 'B' }),
    buildCappedRecipe({ id: 'r-c', name: 'C' })
  ];
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system, recipes });

  const first = await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: item, actor });
  assert.equal(first.success, true);
  assert.equal(service._getRecipeItemLearnCount(item), 1);

  const second = await service.learnOneRecipeFromItem({ recipe: recipes[1], ownedItem: item, actor });
  assert.equal(second.success, true);
  assert.equal(service._getRecipeItemLearnCount(item), 2);

  // Budget spent — the third (K+1) learn is refused and no flag changes.
  const third = await service.learnOneRecipeFromItem({ recipe: recipes[2], ownedItem: item, actor });
  assert.equal(third.success, false);
  assert.equal(third.message, 'FABRICATE.Knowledge.LearnBudgetSpent');
  assert.equal(service._getRecipeItemLearnCount(item), 2);
  const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.ok(!learned['r-c']);
});

test('511.P2.4 - learnOneRecipeFromItem refuses an already-learned recipe', async () => {
  const system = buildCappedSystem({ maxRecipes: 2 });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({
    id: 'actor-1',
    items: [item],
    flagsArg: { fabricate: { learnedRecipes: { 'r-a': { learnedAt: 1 } } } }
  });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnOneRecipeFromItem({ recipe, ownedItem: item, actor });

  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.AlreadyLearned');
});

test('511.P2.5 - destroyWhenSpent deletes the item on the final learn, and does NOT when off', async () => {
  const destroySystem = buildCappedSystem({ maxRecipes: 1, destroyWhenSpent: true });
  const recipeD = buildCappedRecipe({ id: 'r-d' });
  const destroyItem = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const destroyActor = new FakeActor({ id: 'actor-1', items: [destroyItem] });
  const destroyService = buildService({ system: destroySystem, recipes: [recipeD] });

  const destroyed = await destroyService.learnOneRecipeFromItem({ recipe: recipeD, ownedItem: destroyItem, actor: destroyActor });
  assert.equal(destroyed.success, true);
  assert.equal(destroyed.destroyed, true);
  assert.equal(destroyItem.deleted, true);

  const keepSystem = buildCappedSystem({ maxRecipes: 1, destroyWhenSpent: false });
  const recipeK = buildCappedRecipe({ id: 'r-k' });
  const keepItem = new FakeItem({ uuid: 'Actor.actor-2.Item.book', sourceId: 'Compendium.world.items.book' });
  const keepActor = new FakeActor({ id: 'actor-2', items: [keepItem] });
  const keepService = buildService({ system: keepSystem, recipes: [recipeK] });

  const kept = await keepService.learnOneRecipeFromItem({ recipe: recipeK, ownedItem: keepItem, actor: keepActor });
  assert.equal(kept.success, true);
  assert.equal(kept.destroyed, false);
  assert.equal(keepItem.deleted, false);
});

test('511.P2.6 - consumeOnLearn is ignored for a capped book (item not consumed on learn)', async () => {
  // consumeOnLearn:true is set, but the cap supersedes it — the book survives.
  const system = buildCappedSystem({ maxRecipes: 3, destroyWhenSpent: false });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnOneRecipeFromItem({ recipe, ownedItem: item, actor });

  assert.equal(result.success, true);
  assert.equal(item.deleted, false);
});

test('511.P2.7 - a capped drop does NOT auto-learn, but uncapped recipes in the same drop still auto-learn', async () => {
  const cappedSystem = buildCappedSystem({ id: 'capped-system', maxRecipes: 2, originItemUuid: 'shared-source' });
  const uncappedSystem = buildMockSystem({
    id: 'uncapped-system',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'shared-source' }]
  });
  const recipes = [
    buildCappedRecipe({ id: 'capped-recipe', craftingSystemId: 'capped-system' }),
    buildCappedRecipe({ id: 'uncapped-recipe', craftingSystemId: 'uncapped-system' })
  ];
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'shared-source' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({
    systems: { 'capped-system': cappedSystem, 'uncapped-system': uncappedSystem },
    recipes
  });

  const preview = service.previewOwnedItemLearning({ ownedItem: item, actor, mode: 'auto' });
  assert.deepEqual(preview.learnedRecipes.map(r => r.id), ['uncapped-recipe']);

  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });
  const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.deepEqual(Object.keys(learned), ['uncapped-recipe']);
  // The capped recipe is left to the picker; the item-document count is untouched.
  assert.equal(service._getRecipeItemLearnCount(item), 0);
  assert.equal(result.notificationKind, 'success');
});

test('511.P2.8 - DN1: the learn budget accumulates across actors and survives an ownership change', async () => {
  const system = buildCappedSystem({ maxRecipes: 2, originItemUuid: 'Compendium.world.items.book' });
  const recipes = [buildCappedRecipe({ id: 'r-a' }), buildCappedRecipe({ id: 'r-b' })];
  // One physical document — its learn-count flag travels with it across holders.
  const item = new FakeItem({ uuid: 'Item.book', sourceId: 'Compendium.world.items.book' });
  const actorA = new FakeActor({ id: 'actor-a', items: [item] });
  const service = buildService({ system, recipes });

  const first = await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: item, actor: actorA });
  assert.equal(first.success, true);
  assert.equal(service._getRecipeItemLearnCount(item), 1);

  // Transfer the same document to actor B (ownership change, count NOT reset).
  actorA.items = [];
  const actorB = new FakeActor({ id: 'actor-b', items: [] });
  item.parent = actorB;
  actorB.items = [item];

  const stateB = service.getLearnableRecipesFromItem({ ownedItem: item, actor: actorB });
  assert.equal(stateB.remainingBudget, 1, 'budget carries over — not reset on transfer');

  const second = await service.learnOneRecipeFromItem({ recipe: recipes[1], ownedItem: item, actor: actorB });
  assert.equal(second.success, true);
  assert.equal(service._getRecipeItemLearnCount(item), 2, 'count accumulates across holders');

  const spent = service.getLearnableRecipesFromItem({ ownedItem: item, actor: actorB });
  assert.equal(spent.remainingBudget, 0);
});

test('511.P2.9 - regression: an uncapped drop still learns every matched recipe in one operation', async () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'Compendium.world.items.book' }]
  });
  const recipes = [
    buildCappedRecipe({ id: 'r-a', name: 'A' }),
    buildCappedRecipe({ id: 'r-b', name: 'B' })
  ];
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system, recipes });

  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.deepEqual(result.learnedRecipes.map(r => r.id).sort(), ['r-a', 'r-b']);
  // No learn-count flag is written for the uncapped path.
  assert.equal(service._getRecipeItemLearnCount(item), 0);
});

test('511.P2.10 - getLearnableRecipesFromItem uses the most permissive cap when two capped systems share one item', () => {
  // A single physical document shares ONE learn-count; when two capped systems
  // link it with different caps, the most-permissive cap governs the budget.
  const systemA = buildCappedSystem({ id: 'sys-a', maxRecipes: 2, originItemUuid: 'shared-source' });
  const systemB = buildCappedSystem({ id: 'sys-b', maxRecipes: 5, originItemUuid: 'shared-source' });
  const recipes = [
    buildCappedRecipe({ id: 'a-1', craftingSystemId: 'sys-a' }),
    buildCappedRecipe({ id: 'b-1', craftingSystemId: 'sys-b' })
  ];
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'shared-source' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ systems: { 'sys-a': systemA, 'sys-b': systemB }, recipes });

  const state = service.getLearnableRecipesFromItem({ ownedItem: item, actor });

  assert.equal(state.maxRecipes, 5);
  assert.equal(state.remainingBudget, 5);
  assert.deepEqual(state.recipes.map(r => r.id).sort(), ['a-1', 'b-1']);
});

test('511.P2.11 - a limitRecipes system with an invalid maxRecipes fails closed to the uncapped learn path (not bricked)', async () => {
  // limitRecipes is ON but maxRecipes is missing — the recipe must stay learnable
  // via the normal (unlimited) path rather than yielding a permanent 0 budget.
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: true, limitRecipes: true }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'Compendium.world.items.book' }]
  });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  // Not routed to the capped picker (no effective cap)...
  assert.deepEqual(service.getLearnableRecipesFromItem({ ownedItem: item, actor }).recipes, []);
  // ...but still learnable through the normal unlimited drop path.
  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });
  assert.deepEqual(result.learnedRecipes.map(r => r.id), ['r-a']);
  assert.equal(service._getRecipeItemLearnCount(item), 0);
});

test('511.P2.PERITEM - two books in ONE system enforce independent per-item caps', async () => {
  // The core per-item behaviour (issue 511): caps live on the recipe item
  // DEFINITION, so a system can hold a strict 1-recipe scroll and a generous
  // 3-recipe tome side by side. This is impossible under the old system-wide cap.
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'learned', learn: { dragDropEnabled: true } } },
    recipeItemDefinitions: [
      {
        id: 'scroll',
        originItemUuid: 'src-scroll',
        caps: { item: { limitUses: false }, learn: { limitRecipes: true, maxRecipes: 1 } }
      },
      {
        id: 'tome',
        originItemUuid: 'src-tome',
        caps: { item: { limitUses: false }, learn: { limitRecipes: true, maxRecipes: 3 } }
      }
    ]
  });
  const recipes = [
    buildMockRecipe({ id: 'scroll-r', craftingSystemId: 'system-1', recipeItemId: 'scroll', linkedRecipeItemUuid: null }),
    buildMockRecipe({ id: 'tome-r1', craftingSystemId: 'system-1', recipeItemId: 'tome', linkedRecipeItemUuid: null }),
    buildMockRecipe({ id: 'tome-r2', craftingSystemId: 'system-1', recipeItemId: 'tome', linkedRecipeItemUuid: null })
  ];
  const scrollItem = new FakeItem({ uuid: 'Actor.a1.Item.scroll', sourceId: 'src-scroll' });
  const tomeItem = new FakeItem({ uuid: 'Actor.a1.Item.tome', sourceId: 'src-tome' });
  const actor = new FakeActor({ id: 'a1', items: [scrollItem, tomeItem] });
  const service = buildService({ system, recipes });

  assert.equal(service.getLearnableRecipesFromItem({ ownedItem: scrollItem, actor }).maxRecipes, 1);
  assert.equal(service.getLearnableRecipesFromItem({ ownedItem: tomeItem, actor }).maxRecipes, 3);

  // The scroll spends its 1-recipe budget independently of the tome.
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: scrollItem, actor })).success, true);
  const scrollSpent = await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: scrollItem, actor });
  assert.equal(scrollSpent.success, false);
  // The tome still has its full budget.
  assert.equal(service.getLearnableRecipesFromItem({ ownedItem: tomeItem, actor }).remainingBudget, 3);
});

test('511.P2.FAILCLOSED - a recipe whose recipeItemId resolves to no definition is uncapped', () => {
  // Fail-closed convention: an unresolved recipe item definition yields uncapped
  // caps rather than a zero budget or a throw.
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'learned', learn: { dragDropEnabled: true } } },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'src-book' }]
  });
  const recipe = buildMockRecipe({ id: 'r-ghost', craftingSystemId: 'system-1', recipeItemId: 'does-not-exist', linkedRecipeItemUuid: null });
  const service = buildService({ system, recipes: [recipe] });

  // No effective learn cap → not routed to the capped picker.
  assert.equal(service._isRecipeItemLearnCapped(recipe), false);
  // Use cap resolves uncapped, so knowledge is never "exhausted".
  assert.equal(service.isKnowledgeItemExhausted({ recipe, craftingActor: null }), false);
});

test('511.P2.E2E - full flow: capped drop suppressed, pick K, refuse (K+1), destroy-when-spent', async () => {
  const cappedSystem = buildCappedSystem({ id: 'capped-system', maxRecipes: 2, destroyWhenSpent: true, originItemUuid: 'shared-source' });
  const uncappedSystem = buildMockSystem({
    id: 'uncapped-system',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: true }
      }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'shared-source' }]
  });
  const recipes = [
    buildCappedRecipe({ id: 'cap-a', name: 'Cap A', craftingSystemId: 'capped-system' }),
    buildCappedRecipe({ id: 'cap-b', name: 'Cap B', craftingSystemId: 'capped-system' }),
    buildCappedRecipe({ id: 'cap-c', name: 'Cap C', craftingSystemId: 'capped-system' }),
    buildCappedRecipe({ id: 'free-x', name: 'Free X', craftingSystemId: 'uncapped-system' })
  ];
  const item = new FakeItem({ uuid: 'Actor.actor-1.Item.book', sourceId: 'shared-source' });
  const actor = new FakeActor({ id: 'actor-1', items: [item] });
  const service = buildService({
    systems: { 'capped-system': cappedSystem, 'uncapped-system': uncappedSystem },
    recipes
  });

  // 1) Drop the book: only the uncapped recipe auto-learns; capped ones are held
  //    for the picker, and the learn budget is untouched.
  await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });
  assert.deepEqual(Object.keys(actor.getFlag('fabricate', 'fabricate.learnedRecipes')), ['free-x']);
  assert.equal(service._getRecipeItemLearnCount(item), 0);

  // 2) The player sees the capped candidates with the full budget.
  let state = service.getLearnableRecipesFromItem({ ownedItem: item, actor });
  assert.deepEqual(state.recipes.map(r => r.id), ['cap-a', 'cap-b', 'cap-c']);
  assert.equal(state.remainingBudget, 2);

  // 3) Pick two of them (K = maxRecipes).
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: item, actor })).success, true);
  state = service.getLearnableRecipesFromItem({ ownedItem: item, actor });
  assert.equal(state.remainingBudget, 1);
  assert.deepEqual(state.recipes.map(r => r.id), ['cap-b', 'cap-c']);

  const finalLearn = await service.learnOneRecipeFromItem({ recipe: recipes[1], ownedItem: item, actor });
  assert.equal(finalLearn.success, true);
  // destroy-when-spent removed the book on the final learn.
  assert.equal(finalLearn.destroyed, true);
  assert.equal(item.deleted, true);

  // 4) Budget spent: no candidates remain and the (K+1)th learn is refused.
  state = service.getLearnableRecipesFromItem({ ownedItem: item, actor });
  assert.deepEqual(state.recipes, []);
  assert.equal(state.remainingBudget, 0);
  const refused = await service.learnOneRecipeFromItem({ recipe: recipes[2], ownedItem: item, actor });
  assert.equal(refused.success, false);
  assert.equal(refused.message, 'FABRICATE.Knowledge.LearnBudgetSpent');
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

test('AC7.4 - evaluateRecipeAccess computes knowledge access exactly once per non-GM knowledge-mode call', () => {
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
  const craftingActor = new FakeActor({
    id: 'actor-1',
    items: [new FakeItem({ uuid: 'recipe-item-uuid' })]
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });
  const originalEvaluateKnowledgeAccess = service.evaluateKnowledgeAccess.bind(service);
  let knowledgeCalls = 0;

  service.evaluateKnowledgeAccess = (params) => {
    knowledgeCalls += 1;
    return originalEvaluateKnowledgeAccess(params);
  };

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(knowledgeCalls, 1);
  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
  assert.equal(result.reason, 'ok');
});

test('AC7.5 - locked recipe remains visible but not craftable in knowledge mode', () => {
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
  const recipe = buildMockRecipe({
    locked: true,
    linkedRecipeItemUuid: 'recipe-item-uuid'
  });
  const craftingActor = new FakeActor({
    id: 'actor-1',
    items: [new FakeItem({ uuid: 'recipe-item-uuid' })]
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, true);
  assert.equal(result.craftable, false);
  assert.equal(result.reason, 'locked');
  assert.equal(result.knowledge?.granted, true);
});

test('AC7.6 - cleanupLearnedRecipes removes stale entries and retains valid ones', async () => {
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

// ---------------------------------------------------------------------------
// AC3 (T-087) — Recipe item matching via _stats.compendiumSource
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC8 — Knowledge mode: visibility and learnability via formula items
// ---------------------------------------------------------------------------

test('AC8.1 - learned mode: recipe visible but not craftable when player has matching item but has not learned', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: true }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const formulaItem = new FakeItem({ uuid: 'formula-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [formulaItem] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, true, 'recipe should be visible when player has matching formula item');
  assert.equal(result.craftable, false, 'recipe should not be craftable until learned');
  assert.equal(result.reason, 'knowledge', 'reason should be knowledge');
  assert.equal(result.knowledge.hasMatchedItem, true);
  assert.equal(result.knowledge.hasLearned, false);
  assert.equal(result.knowledge.granted, false, 'knowledge should not be granted in learned mode without learning');
});

test('AC8.2 - learned mode: recipe visible and craftable after learning', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: true }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const craftingActor = new FakeActor({
    id: 'actor-1',
    items: [],
    flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1 } } } }
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
  assert.equal(result.reason, 'ok');
});

test('AC8.3 - learned mode: recipe not visible when player has neither item nor learned', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: true }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, false, 'recipe should be hidden without item or learned state');
  assert.equal(result.craftable, false);
});

test('AC8.4 - itemOrLearned mode: recipe visible and craftable when player has item but has not learned', () => {
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
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const formulaItem = new FakeItem({ uuid: 'formula-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [formulaItem] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, true);
  assert.equal(result.craftable, true, 'itemOrLearned grants craftability with just the item');
  assert.equal(result.reason, 'ok');
});

test('AC8.5 - learned mode: canLearn derivation is true when recipe is visible via item but not yet learned', () => {
  const system = buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: true }
      }
    }
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const formulaItem = new FakeItem({ uuid: 'formula-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [formulaItem] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const access = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  // Replicate the canLearn logic from craftingStore.js
  const canLearn = access.reason === 'knowledge' &&
    !!access.knowledge &&
    access.knowledge.hasLearned !== true &&
    Array.isArray(access.knowledge.matchedItems) &&
    access.knowledge.matchedItems.length > 0;

  assert.equal(canLearn, true, 'canLearn should be true for visible-but-unlearned recipe with matching item');
});

// ---------------------------------------------------------------------------
// AC9 — Alchemy REVEAL-not-gate (issue 563)
//
// `visibilityMode` selects which source(s) REVEAL a recipe in the Known list;
// brewing is NEVER gated by visibility. For a non-GM alchemy recipe the service
// therefore returns `craftable: true` regardless of reveal state — reveal governs
// only `visible`. Reason taxonomy: `gm` (GM), `alchemy-revealed`,
// `alchemy-unrevealed`. Discovery-by-brew (`learnOnCraft` ⇒ learnedRecipes) is
// unioned across all modes.
// ---------------------------------------------------------------------------

function alchemyItemModeSystem() {
  return buildMockSystem({
    resolutionMode: 'alchemy',
    visibilityMode: 'item',
    alchemy: { learnOnCraft: true }
  });
}

function alchemyKnowledgeModeSystem() {
  return buildMockSystem({
    resolutionMode: 'alchemy',
    visibilityMode: 'knowledge',
    alchemy: { learnOnCraft: true }
  });
}

test('AC9.1 - item mode: a HELD linked book reveals the recipe (and it is craftable)', () => {
  const system = alchemyItemModeSystem();
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const formulaItem = new FakeItem({ uuid: 'formula-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [formulaItem] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, true, 'a held book reveals the recipe in item mode');
  assert.equal(result.craftable, true, 'brewing is never gated by reveal');
  assert.equal(result.reason, 'alchemy-revealed');
});

test('AC9.1b - item mode: a book on a COMPONENT SOURCE actor reveals the recipe', () => {
  const system = alchemyItemModeSystem();
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const formulaItem = new FakeItem({ uuid: 'formula-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [] });
  const sourceActor = new FakeActor({ id: 'source-1', items: [formulaItem] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({
    recipe,
    viewer,
    craftingActor,
    componentSourceActors: [sourceActor]
  });

  assert.equal(result.visible, true, 'a book on a component source reveals the recipe');
  assert.equal(result.craftable, true);
});

test('AC9.2 - item mode: no linked book held is NOT revealed but stays craftable', () => {
  const system = alchemyItemModeSystem();
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const craftingActor = new FakeActor({ id: 'actor-1', items: [] });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });

  assert.equal(result.visible, false);
  assert.equal(result.craftable, true, 'brewing is never gated by reveal');
  assert.equal(result.reason, 'alchemy-unrevealed');
});

test('AC9.3 - knowledge mode: a LEARNED recipe is revealed; a held-but-unlearned book is NOT', () => {
  const system = alchemyKnowledgeModeSystem();
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const learnedActor = new FakeActor({
    id: 'actor-1',
    items: [],
    flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1 } } } }
  });
  const learned = service.evaluateRecipeAccess({ recipe, viewer, craftingActor: learnedActor });
  assert.equal(learned.visible, true);
  assert.equal(learned.craftable, true);
  assert.equal(learned.reason, 'alchemy-revealed');

  // Holding the book without learning it does NOT reveal in knowledge mode.
  const heldActor = new FakeActor({ id: 'actor-2', items: [new FakeItem({ uuid: 'formula-uuid' })] });
  const held = service.evaluateRecipeAccess({ recipe, viewer, craftingActor: heldActor });
  assert.equal(held.visible, false, 'knowledge mode reveals only via learning');
  assert.equal(held.craftable, true);
});

test('AC9.4 - Manual (restricted): a per-recipe access grant reveals; without a grant it is unrevealed but craftable', () => {
  const system = buildMockSystem({
    resolutionMode: 'alchemy',
    visibilityMode: 'restricted',
    alchemy: { learnOnCraft: true }
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const granted = buildMockRecipe({ id: 'recipe-1', access: { playerIds: ['user-1'], characterIds: [] } });
  const grantedResult = service.evaluateRecipeAccess({
    recipe: granted,
    viewer,
    craftingActor: new FakeActor({ id: 'actor-1' })
  });
  assert.equal(grantedResult.visible, true, 'an access grant reveals the recipe');
  assert.equal(grantedResult.craftable, true);
  assert.equal(grantedResult.reason, 'alchemy-revealed');

  const ungranted = buildMockRecipe({ id: 'recipe-2', access: { playerIds: ['someone-else'], characterIds: [] } });
  const ungrantedResult = service.evaluateRecipeAccess({
    recipe: ungranted,
    viewer,
    craftingActor: new FakeActor({ id: 'actor-1' })
  });
  assert.equal(ungrantedResult.visible, false);
  assert.equal(ungrantedResult.craftable, true, 'brewing is never gated by reveal');
  assert.equal(ungrantedResult.reason, 'alchemy-unrevealed');
});

test('AC9.5 - GM sees every alchemy recipe revealed and craftable', () => {
  const system = alchemyItemModeSystem();
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const gm = { isGM: true, id: 'gm-user' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({
    recipe,
    viewer: gm,
    craftingActor: new FakeActor({ id: 'actor-1', items: [] })
  });
  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
  assert.equal(result.reason, 'gm');
});

test('AC9.6 - discovery-by-brew is unioned across modes: a learned recipe reveals even under item mode with no held book', () => {
  const system = alchemyItemModeSystem();
  const recipe = buildMockRecipe({ id: 'recipe-1', linkedRecipeItemUuid: 'formula-uuid' });
  const craftingActor = new FakeActor({
    id: 'actor-1',
    items: [],
    flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1 } } } }
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor });
  assert.equal(result.visible, true, 'a brew-discovered recipe reveals in any mode');
  assert.equal(result.craftable, true);
});

// ---------------------------------------------------------------------------
// AC3 (T-087) — Recipe item matching via _stats.compendiumSource
// ---------------------------------------------------------------------------

test('AC3.5 - _isMatchingRecipeItem returns true when _stats.compendiumSource matches linkedRecipeItemUuid', () => {
  const service = buildService();
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'Compendium.world.items.abc' });
  // Item has a different uuid but its compendiumSource matches the linked UUID
  const item = new FakeItem({
    uuid: 'world-item-uuid',
    compendiumSource: 'Compendium.world.items.abc'
  });

  assert.equal(service._isMatchingRecipeItem(recipe, item), true);
});

test('AC3.6 - _isMatchingRecipeItem returns false when _stats.compendiumSource does not match', () => {
  const service = buildService();
  const recipe = buildMockRecipe({ linkedRecipeItemUuid: 'Compendium.world.items.abc' });
  const item = new FakeItem({
    uuid: 'world-item-uuid',
    compendiumSource: 'Compendium.world.items.different'
  });

  assert.equal(service._isMatchingRecipeItem(recipe, item), false);
});

// ---------------------------------------------------------------------------
// 511 — learnRecipeFromOwnedBook (player Inventory learn affordance)
// ---------------------------------------------------------------------------

function buildUncappedLearnSystem({ consumeOnLearn = true, mode = 'learned' } = {}) {
  return buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode,
        item: { limitUses: false },
        learn: { consumeOnLearn, dragDropEnabled: true },
      },
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'Compendium.world.items.book' }],
  });
}

test('511.INV.1 - learnRecipeFromOwnedBook routes a capped book through the budget-enforced path', async () => {
  const system = buildCappedSystem({ maxRecipes: 1 });
  const recipes = [buildCappedRecipe({ id: 'r-a' }), buildCappedRecipe({ id: 'r-b' })];
  const item = new FakeItem({ uuid: 'Actor.a1.Item.book', compendiumSource: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes });

  const first = await service.learnRecipeFromOwnedBook({ recipe: recipes[0], craftingActor: actor });
  assert.equal(first.success, true);
  assert.equal(service._getRecipeItemLearnCount(item), 1);

  // Budget spent — the second learn is refused by the capped path.
  const second = await service.learnRecipeFromOwnedBook({ recipe: recipes[1], craftingActor: actor });
  assert.equal(second.success, false);
  assert.equal(second.message, 'FABRICATE.Knowledge.LearnBudgetSpent');
});

test('511.INV.2 - learnRecipeFromOwnedBook learns one uncapped recipe and never consumes the book', async () => {
  const system = buildUncappedLearnSystem({ consumeOnLearn: true });
  const recipes = [buildCappedRecipe({ id: 'r-a' }), buildCappedRecipe({ id: 'r-b' })];
  const item = new FakeItem({ uuid: 'Actor.a1.Item.book', compendiumSource: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes });

  const result = await service.learnRecipeFromOwnedBook({ recipe: recipes[0], craftingActor: actor });
  assert.equal(result.success, true);
  const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.ok(learned['r-a'], 'the recipe is recorded as learned');
  // consumeOnLearn is ignored here: the multi-recipe book survives so its other
  // recipes remain learnable.
  assert.equal(item.deleteCount, 0, 'the book is not consumed on an uncapped learn');
});

test('511.INV.3 - learnRecipeFromOwnedBook refuses an already-learned recipe', async () => {
  const system = buildUncappedLearnSystem();
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({ uuid: 'Actor.a1.Item.book', compendiumSource: 'Compendium.world.items.book' });
  const actor = new FakeActor({
    id: 'a1',
    items: [item],
    flagsArg: { fabricate: { learnedRecipes: { 'r-a': { learnedAt: 1 } } } },
  });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipeFromOwnedBook({ recipe, craftingActor: actor });
  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.AlreadyLearned');
});

test('511.INV.4 - learnRecipeFromOwnedBook refuses when no matching book is owned', async () => {
  const system = buildUncappedLearnSystem();
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const actor = new FakeActor({ id: 'a1', items: [] });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipeFromOwnedBook({ recipe, craftingActor: actor });
  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.NoMatchingItem');
});

test('511.INV.5 - learnRecipeFromOwnedBook refuses when the system cannot teach (item-only mode)', async () => {
  const system = buildUncappedLearnSystem({ mode: 'item' });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({ uuid: 'Actor.a1.Item.book', compendiumSource: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipeFromOwnedBook({ recipe, craftingActor: actor });
  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.LearningDisabled');
});

test('511.INV.6 - learnRecipeFromOwnedBook matches a book duplicated from a world template', async () => {
  const system = buildUncappedLearnSystem();
  const recipe = buildCappedRecipe({ id: 'r-a' });
  // The owned copy links to the template only via _stats.duplicateSource — its own
  // uuid and compendium source do not match the definition's originItemUuid.
  const item = new FakeItem({ uuid: 'Actor.a1.Item.copy' });
  item._stats = { duplicateSource: 'Compendium.world.items.book' };
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipeFromOwnedBook({ recipe, craftingActor: actor });
  assert.equal(result.success, true, 'a world-duplicated book resolves for learning');
});

// ---------------------------------------------------------------------------
// Issue 511 PR-B — flat visibilityMode gating (global/restricted/item/knowledge)
// ---------------------------------------------------------------------------

test('MODE.global - every recipe is visible and craftable to a non-GM', () => {
  const system = buildMockSystem({ visibilityMode: 'global' });
  const recipe = buildMockRecipe({
    visibility: { restricted: true, allowedUserIds: [] },
    access: { characterIds: [], playerIds: [] },
    linkedRecipeItemUuid: 'missing'
  });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({ recipe, viewer, craftingActor: new FakeActor({ id: 'a1' }) });

  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
  assert.equal(result.reason, 'ok');
});

test('MODE.restricted.userGrant - a granted player id makes the recipe visible', () => {
  const system = buildMockSystem({ visibilityMode: 'restricted' });
  const recipe = buildMockRecipe({ access: { characterIds: [], playerIds: ['user-1'] } });
  const service = buildService({ system });

  assert.equal(
    service.evaluateRecipeAccess({ recipe, viewer: { isGM: false, id: 'user-1' } }).visible,
    true
  );
  assert.equal(
    service.evaluateRecipeAccess({ recipe, viewer: { isGM: false, id: 'user-2' } }).visible,
    false
  );
});

test('MODE.restricted.assignedCharacter - a granted character the viewer is assigned makes it visible', () => {
  const system = buildMockSystem({ visibilityMode: 'restricted' });
  const recipe = buildMockRecipe({ access: { characterIds: ['char-1'], playerIds: [] } });
  const service = buildService({ system });

  const granted = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: false, id: 'user-1', character: { id: 'char-1' } }
  });
  assert.equal(granted.visible, true);

  const ungranted = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: false, id: 'user-1', character: { id: 'char-9' } }
  });
  assert.equal(ungranted.visible, false);
});

test('MODE.restricted.controlsCharacter - OWNER permission on a granted character makes it visible', () => {
  const system = buildMockSystem({ visibilityMode: 'restricted' });
  const recipe = buildMockRecipe({ access: { characterIds: ['char-2'], playerIds: [] } });
  const service = buildService({ system });
  const actor = {
    id: 'char-2',
    testUserPermission: (viewer, perm) => viewer?.id === 'user-1' && perm === 'OWNER'
  };

  const originalActors = globalThis.game.actors;
  globalThis.game.actors = { get: (id) => (id === 'char-2' ? actor : null) };
  try {
    assert.equal(
      service.evaluateRecipeAccess({ recipe, viewer: { isGM: false, id: 'user-1' } }).visible,
      true
    );
    assert.equal(
      service.evaluateRecipeAccess({ recipe, viewer: { isGM: false, id: 'user-3' } }).visible,
      false
    );
  } finally {
    globalThis.game.actors = originalActors;
  }
});

test('MODE.restricted.gmBypass - a GM always sees a restricted recipe with no grant', () => {
  const system = buildMockSystem({ visibilityMode: 'restricted' });
  const recipe = buildMockRecipe({ access: { characterIds: [], playerIds: [] } });
  const service = buildService({ system });

  assert.equal(
    service.evaluateRecipeAccess({ recipe, viewer: { isGM: true, id: 'gm-1' } }).visible,
    true
  );
});

test('MODE.restricted.legacyFallback - falls back to visibility.allowedUserIds when access is absent', () => {
  const system = buildMockSystem({ visibilityMode: 'restricted' });
  const openRecipe = buildMockRecipe({ visibility: { restricted: false, allowedUserIds: [] } });
  const closedRecipe = buildMockRecipe({ visibility: { restricted: true, allowedUserIds: ['user-9'] } });
  const service = buildService({ system });
  const viewer = { isGM: false, id: 'user-1' };

  assert.equal(service.evaluateRecipeAccess({ recipe: openRecipe, viewer }).visible, true);
  assert.equal(service.evaluateRecipeAccess({ recipe: closedRecipe, viewer }).visible, false);
});

test('MODE.item - only a matching owned item grants; a learned-only actor stays hidden', () => {
  const system = buildMockSystem({
    visibilityMode: 'item',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'itemOrLearned', item: { limitUses: false }, learn: { consumeOnLearn: false } }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'recipe-item-uuid' }]
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', recipeItemId: 'book', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const withItem = service.evaluateRecipeAccess({
    recipe,
    viewer,
    craftingActor: new FakeActor({ id: 'a1', items: [new FakeItem({ uuid: 'recipe-item-uuid' })] })
  });
  assert.equal(withItem.visible, true);
  assert.equal(withItem.craftable, true);

  // Learned but no item: item mode ignores learned state → not visible.
  const learnedOnly = service.evaluateRecipeAccess({
    recipe,
    viewer,
    craftingActor: new FakeActor({
      id: 'a2',
      items: [],
      flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1 } } } }
    })
  });
  assert.equal(learnedOnly.visible, false);
});

test('MODE.knowledge - itemOrLearned semantics override a legacy learned-only knowledge.mode', () => {
  // The flat 'knowledge' mode forces itemOrLearned even though the system's legacy
  // knowledge.mode is 'learned' — an item alone now grants craftability.
  const system = buildMockSystem({
    visibilityMode: 'knowledge',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { consumeOnLearn: false } }
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'recipe-item-uuid' }]
  });
  const recipe = buildMockRecipe({ id: 'recipe-1', recipeItemId: 'book', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const viewer = { isGM: false, id: 'user-1' };
  const service = buildService({ system });

  const itemOnly = service.evaluateRecipeAccess({
    recipe,
    viewer,
    craftingActor: new FakeActor({ id: 'a1', items: [new FakeItem({ uuid: 'recipe-item-uuid' })] })
  });
  assert.equal(itemOnly.visible, true);
  assert.equal(itemOnly.craftable, true);

  const learnedOnly = service.evaluateRecipeAccess({
    recipe,
    viewer,
    craftingActor: new FakeActor({
      id: 'a2',
      flagsArg: { fabricate: { learnedRecipes: { 'recipe-1': { learnedAt: 1 } } } }
    })
  });
  assert.equal(learnedOnly.craftable, true);
});

test('MODE.legacyFallback - AC1.7 preserved: absent visibilityMode + listMode maps to global', () => {
  const system = buildMockSystem({ recipeVisibility: { listMode: undefined } });
  const recipe = buildMockRecipe({ visibility: { restricted: true, allowedUserIds: [] } });
  const service = buildService({ system });

  const result = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: false, id: 'user-1' },
    craftingActor: new FakeActor({ id: 'a1' })
  });
  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
});

// ---------------------------------------------------------------------------
// Issue 511 PR-B — whenSpent: destroyed vs inert on craft exhaustion
// ---------------------------------------------------------------------------

function buildWhenSpentSystem(whenSpent, maxUses = 2) {
  return buildMockSystem({
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'item', item: { limitUses: false }, learn: { consumeOnLearn: false } }
    },
    recipeItemDefinitions: [
      {
        id: 'book',
        originItemUuid: 'recipe-item-uuid',
        caps: { item: { limitUses: true, maxUses, whenSpent }, learn: {} }
      }
    ]
  });
}

test('WHENSPENT.destroyed - the item is deleted when it exhausts', async () => {
  const system = buildWhenSpentSystem('destroyed', 2);
  const recipe = buildMockRecipe({ recipeItemId: 'book', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const item = new FakeItem({
    uuid: 'recipe-item-uuid',
    flagsArg: { fabricate: { recipeItemUsage: { timesUsed: 1 } } }
  });
  const service = buildService({ system });

  await service.applyRecipeItemUseOnCraft({ recipe, craftingActor: new FakeActor({ id: 'a1', items: [item] }) });

  assert.equal(item.deleted, true);
  assert.equal(item.deleteCount, 1);
});

test('WHENSPENT.inert - the item survives, is flagged inert, and is NOT deleted', async () => {
  const system = buildWhenSpentSystem('inert', 2);
  const recipe = buildMockRecipe({ recipeItemId: 'book', linkedRecipeItemUuid: 'recipe-item-uuid' });
  const item = new FakeItem({
    uuid: 'recipe-item-uuid',
    flagsArg: { fabricate: { recipeItemUsage: { timesUsed: 1 } } }
  });
  const service = buildService({ system });

  await service.applyRecipeItemUseOnCraft({ recipe, craftingActor: new FakeActor({ id: 'a1', items: [item] }) });

  assert.equal(item.deleted, false, 'delete is only called for whenSpent: destroyed');
  const usage = item.getFlag('fabricate', 'fabricate.recipeItemUsage');
  assert.equal(usage.timesUsed, 2);
  assert.equal(usage.inert, true);
});

// ---------------------------------------------------------------------------
// Issue 511 PR-B — learning modes (once / ntimes / party shared pool) + prerequisite
// ---------------------------------------------------------------------------

function makeFakePartyPool() {
  const store = {};
  return {
    store,
    get: (key) => Number(store[key] || 0),
    increment: async (key) => {
      store[key] = Number(store[key] || 0) + 1;
      return true;
    }
  };
}

function buildLearnModeSystem({ learningMode, learnScope, learnsAllowed, prerequisiteIds = [] } = {}) {
  return buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } }
    },
    recipeItemDefinitions: [
      {
        id: 'book',
        originItemUuid: 'Compendium.world.items.book',
        caps: {
          item: { limitUses: false },
          learn: { limitLearning: true, learnsAllowed, learnScope, learningMode, prerequisiteIds }
        }
      }
    ]
  });
}

test('LEARN.once - a once-book with a budget of 1 refuses a second learn from the same copy', async () => {
  const system = buildLearnModeSystem({ learningMode: 'once', learnsAllowed: 1 });
  const recipes = [buildCappedRecipe({ id: 'r-a' }), buildCappedRecipe({ id: 'r-b' })];
  const item = new FakeItem({ uuid: 'Actor.a1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes });

  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: item, actor })).success, true);
  const second = await service.learnOneRecipeFromItem({ recipe: recipes[1], ownedItem: item, actor });
  assert.equal(second.success, false);
  assert.equal(second.message, 'FABRICATE.Knowledge.LearnBudgetSpent');
});

test('LEARN.ntimes - an n-times book learns N from one copy and refuses the (N+1)th', async () => {
  const system = buildLearnModeSystem({ learningMode: 'ntimes', learnsAllowed: 2 });
  const recipes = [
    buildCappedRecipe({ id: 'r-a' }),
    buildCappedRecipe({ id: 'r-b' }),
    buildCappedRecipe({ id: 'r-c' })
  ];
  const item = new FakeItem({ uuid: 'Actor.a1.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes });

  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: item, actor })).success, true);
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[1], ownedItem: item, actor })).success, true);
  const third = await service.learnOneRecipeFromItem({ recipe: recipes[2], ownedItem: item, actor });
  assert.equal(third.success, false);
  assert.equal(service._getRecipeItemLearnCount(item), 2);
});

test('LEARN.party - two actors share ONE budget across two physical copies', async () => {
  const system = buildLearnModeSystem({ learningMode: 'party', learnsAllowed: 2 });
  const recipes = [
    buildCappedRecipe({ id: 'r-a' }),
    buildCappedRecipe({ id: 'r-b' }),
    buildCappedRecipe({ id: 'r-c' })
  ];
  const pool = makeFakePartyPool();
  const recipeManager = { getRecipes: () => recipes };
  const craftingSystemManager = { getSystem: () => system };
  const service = new RecipeVisibilityService(recipeManager, craftingSystemManager, pool);

  const copyA = new FakeItem({ uuid: 'Actor.a.Item.book', sourceId: 'Compendium.world.items.book' });
  const actorA = new FakeActor({ id: 'actor-a', items: [copyA] });
  const copyB = new FakeItem({ uuid: 'Actor.b.Item.book', sourceId: 'Compendium.world.items.book' });
  const actorB = new FakeActor({ id: 'actor-b', items: [copyB] });

  // Actor A spends one shared slot, Actor B spends the second — from a different copy.
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: copyA, actor: actorA })).success, true);
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[1], ownedItem: copyB, actor: actorB })).success, true);

  // The shared pool is now spent — a third learn by either actor is refused.
  const refused = await service.learnOneRecipeFromItem({ recipe: recipes[2], ownedItem: copyA, actor: actorA });
  assert.equal(refused.success, false);
  assert.equal(refused.message, 'FABRICATE.Knowledge.LearnBudgetSpent');
  assert.equal(pool.get('system-1::book'), 2, 'both learns drew from one shared, system-scoped pool');
});

test('LEARN.scope=total - an explicit learnScope drives the shared world pool', async () => {
  const system = buildLearnModeSystem({ learnScope: 'total', learnsAllowed: 2 });
  const recipes = [buildCappedRecipe({ id: 'r-a' }), buildCappedRecipe({ id: 'r-b' }), buildCappedRecipe({ id: 'r-c' })];
  const pool = makeFakePartyPool();
  const service = new RecipeVisibilityService({ getRecipes: () => recipes }, { getSystem: () => system }, pool);

  const copyA = new FakeItem({ uuid: 'Actor.a.Item.book', sourceId: 'Compendium.world.items.book' });
  const actorA = new FakeActor({ id: 'actor-a', items: [copyA] });
  const copyB = new FakeItem({ uuid: 'Actor.b.Item.book', sourceId: 'Compendium.world.items.book' });
  const actorB = new FakeActor({ id: 'actor-b', items: [copyB] });

  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: copyA, actor: actorA })).success, true);
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[1], ownedItem: copyB, actor: actorB })).success, true);
  const refused = await service.learnOneRecipeFromItem({ recipe: recipes[2], ownedItem: copyA, actor: actorA });
  assert.equal(refused.success, false);
  assert.equal(pool.get('system-1::book'), 2, 'both learns drew from one shared pool via learnScope=total');
});

test('LEARN.scope=total - destroyWhenSpent is read from the SPECIFIC book learned from, not the first book', async () => {
  // A recipe in two total-scope books with OPPOSITE destroy caps. Learning from book B
  // must honour B's cap, even though book A is the recipe's first member book.
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } },
    },
    recipeItemDefinitions: [
      {
        id: 'book-a',
        originItemUuid: 'src-a',
        recipeIds: ['r1'],
        caps: { item: { limitUses: false }, learn: { limitLearning: true, learnScope: 'total', learnsAllowed: 1, destroyWhenSpent: true } },
      },
      {
        id: 'book-b',
        originItemUuid: 'src-b',
        recipeIds: ['r1'],
        caps: { item: { limitUses: false }, learn: { limitLearning: true, learnScope: 'total', learnsAllowed: 1, destroyWhenSpent: false } },
      },
    ],
  });
  const recipe = buildMockRecipe({ id: 'r1', linkedRecipeItemUuid: null });
  const service = new RecipeVisibilityService(
    { getRecipes: () => [recipe] },
    { getSystem: () => system },
    makeFakePartyPool()
  );

  // Learn from book B (destroyWhenSpent:false) — the spending learn must NOT destroy it.
  const bookB = new FakeItem({ uuid: 'Actor.y.Item.b', sourceId: 'src-b' });
  const learnB = await service.learnOneRecipeFromItem({
    recipe,
    ownedItem: bookB,
    actor: new FakeActor({ id: 'actor-b', items: [bookB] }),
  });
  assert.equal(learnB.success, true);
  assert.equal(learnB.destroyed, false, "book B honours its own destroyWhenSpent:false, not book A's true");

  // Learn from book A (destroyWhenSpent:true) — the spending learn DOES destroy it.
  const bookA = new FakeItem({ uuid: 'Actor.x.Item.a', sourceId: 'src-a' });
  const learnA = await service.learnOneRecipeFromItem({
    recipe,
    ownedItem: bookA,
    actor: new FakeActor({ id: 'actor-a', items: [bookA] }),
  });
  assert.equal(learnA.success, true);
  assert.equal(learnA.destroyed, true, 'book A honours its own destroyWhenSpent:true');
});

test('LEARN.scope=perInstance - each copy carries its OWN budget (not shared)', async () => {
  const system = buildLearnModeSystem({ learnScope: 'perInstance', learnsAllowed: 1 });
  const recipes = [buildCappedRecipe({ id: 'r-a' }), buildCappedRecipe({ id: 'r-b' })];
  // A shared pool that would throw if consulted — per-copy scope must never touch it.
  const pool = { get: () => 0, increment: async () => { throw new Error('per-copy must not use the shared pool'); } };
  const service = new RecipeVisibilityService({ getRecipes: () => recipes }, { getSystem: () => system }, pool);

  const copyA = new FakeItem({ uuid: 'Actor.a.Item.book', sourceId: 'Compendium.world.items.book' });
  const actorA = new FakeActor({ id: 'actor-a', items: [copyA] });
  const copyB = new FakeItem({ uuid: 'Actor.b.Item.book', sourceId: 'Compendium.world.items.book' });
  const actorB = new FakeActor({ id: 'actor-b', items: [copyB] });

  // Copy A spends its single learn; a second learn from A is refused (its budget is gone).
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: copyA, actor: actorA })).success, true);
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[1], ownedItem: copyA, actor: actorA })).success, false);
  // Copy B still has its OWN full budget — an independent per-copy count.
  assert.equal((await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: copyB, actor: actorB })).success, true);
});

test('LEARN.scope=total - getLearnableRecipesFromItem reports remaining from the shared pool', async () => {
  const system = buildLearnModeSystem({ learnScope: 'total', learnsAllowed: 3 });
  const recipes = [buildCappedRecipe({ id: 'r-a' }), buildCappedRecipe({ id: 'r-b' })];
  const pool = makeFakePartyPool();
  const service = new RecipeVisibilityService({ getRecipes: () => recipes }, { getSystem: () => system }, pool);
  const copy = new FakeItem({ uuid: 'Actor.a.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'actor-a', items: [copy] });

  assert.equal(service.getLearnableRecipesFromItem({ ownedItem: copy, actor }).remainingBudget, 3);
  // Spending draws from the shared pool; the reported remaining reflects it even
  // though the per-copy document count is never touched by the total path.
  await service.learnOneRecipeFromItem({ recipe: recipes[0], ownedItem: copy, actor });
  assert.equal(service.getLearnableRecipesFromItem({ ownedItem: copy, actor }).remainingBudget, 2);
});

test('511.M2M - a recipe in two books is matched via either, with caps read per book', () => {
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } },
    },
    recipeItemDefinitions: [
      {
        id: 'book-a',
        originItemUuid: 'src-a',
        recipeIds: ['r1'],
        caps: { item: { limitUses: false }, learn: { limitLearning: true, learnScope: 'perInstance', learnsAllowed: 1 } },
      },
      {
        id: 'book-b',
        originItemUuid: 'src-b',
        recipeIds: ['r1'],
        caps: { item: { limitUses: false }, learn: { limitLearning: true, learnScope: 'perInstance', learnsAllowed: 3 } },
      },
    ],
  });
  // Membership lives on the books (recipeIds); the recipe carries no reverse ref.
  const recipe = buildMockRecipe({ id: 'r1', linkedRecipeItemUuid: null });
  const service = buildService({ system, recipes: [recipe] });

  const bookA = new FakeItem({ uuid: 'Actor.x.Item.a', sourceId: 'src-a' });
  const actorA = new FakeActor({ id: 'actor-a', items: [bookA] });
  const bookB = new FakeItem({ uuid: 'Actor.y.Item.b', sourceId: 'src-b' });
  const actorB = new FakeActor({ id: 'actor-b', items: [bookB] });

  // Visible/matched via EITHER book.
  assert.equal(
    service.evaluateRecipeAccess({ recipe, viewer: { isGM: false, id: 'u1' }, craftingActor: actorA }).knowledge.hasMatchedItem,
    true
  );
  assert.equal(
    service.evaluateRecipeAccess({ recipe, viewer: { isGM: false, id: 'u2' }, craftingActor: actorB }).knowledge.hasMatchedItem,
    true
  );

  // The learn cap is read from the SPECIFIC book being read.
  assert.equal(service.getLearnableRecipesFromItem({ ownedItem: bookA, actor: actorA }).maxRecipes, 1, 'book A cap');
  assert.equal(service.getLearnableRecipesFromItem({ ownedItem: bookB, actor: actorB }).maxRecipes, 3, 'book B cap');
});

test('LEARN.party - a non-GM (failed) shared-counter write fails closed without learning', async () => {
  const system = buildLearnModeSystem({ learningMode: 'party', learnsAllowed: 5 });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const degradedPool = { get: () => 0, increment: async () => false };
  const recipeManager = { getRecipes: () => [recipe] };
  const craftingSystemManager = { getSystem: () => system };
  const service = new RecipeVisibilityService(recipeManager, craftingSystemManager, degradedPool);
  const item = new FakeItem({ uuid: 'Actor.a.Item.book', sourceId: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'actor-a', items: [item] });

  const result = await service.learnOneRecipeFromItem({ recipe, ownedItem: item, actor });

  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.LearnBudgetSpent');
  const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.ok(!learned || !learned['r-a'], 'the recipe is not learned when the shared write fails');
});

test('PREREQ - learning is refused until ALL required-knowledge recipes are learned (AND)', async () => {
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } }
    },
    recipeItemDefinitions: [
      { id: 'basic', originItemUuid: 'src-basic', caps: { item: { limitUses: false }, learn: {} } },
      { id: 'basic2', originItemUuid: 'src-basic2', caps: { item: { limitUses: false }, learn: {} } },
      {
        id: 'advanced',
        originItemUuid: 'src-adv',
        caps: {
          item: { limitUses: false },
          learn: { limitLearning: true, prerequisiteIds: ['r-a', 'r-c'] }
        }
      }
    ]
  });
  const basicRecipe = buildMockRecipe({ id: 'r-a', recipeItemId: 'basic', linkedRecipeItemUuid: null });
  const basic2Recipe = buildMockRecipe({ id: 'r-c', recipeItemId: 'basic2', linkedRecipeItemUuid: null });
  const advancedRecipe = buildMockRecipe({ id: 'r-b', recipeItemId: 'advanced', linkedRecipeItemUuid: null });
  const basicBook = new FakeItem({ uuid: 'Actor.a1.Item.basic', sourceId: 'src-basic' });
  const basic2Book = new FakeItem({ uuid: 'Actor.a1.Item.basic2', sourceId: 'src-basic2' });
  const advancedBook = new FakeItem({ uuid: 'Actor.a1.Item.adv', sourceId: 'src-adv' });
  const actor = new FakeActor({ id: 'a1', items: [basicBook, basic2Book, advancedBook] });
  const service = buildService({ system, recipes: [basicRecipe, basic2Recipe, advancedRecipe] });

  // Neither prerequisite learned → r-b is refused.
  const blocked = await service.learnRecipeFromOwnedBook({ recipe: advancedRecipe, craftingActor: actor });
  assert.equal(blocked.success, false);
  assert.equal(blocked.message, 'FABRICATE.Knowledge.PrerequisiteNotMet');

  // Learning only ONE prerequisite still leaves it refused (AND semantics).
  assert.equal((await service.learnRecipeFromOwnedBook({ recipe: basicRecipe, craftingActor: actor })).success, true);
  const stillBlocked = await service.learnRecipeFromOwnedBook({ recipe: advancedRecipe, craftingActor: actor });
  assert.equal(stillBlocked.success, false);
  assert.equal(stillBlocked.message, 'FABRICATE.Knowledge.PrerequisiteNotMet');

  // Learn the second prerequisite, then r-b succeeds.
  assert.equal((await service.learnRecipeFromOwnedBook({ recipe: basic2Recipe, craftingActor: actor })).success, true);
  const unblocked = await service.learnRecipeFromOwnedBook({ recipe: advancedRecipe, craftingActor: actor });
  assert.equal(unblocked.success, true);
});

test('PREREQ - with Limited learning OFF, neither Required Knowledge nor character prerequisites gate learning (issue 544)', async () => {
  const system = buildMockSystem({
    id: 'system-1',
    characterPrerequisites: [
      { id: 'p-expert', name: 'Expert Crafter', path: 'skills.cra.rank', op: 'gte', value: 5 }
    ],
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } }
    },
    recipeItemDefinitions: [
      {
        id: 'advanced',
        originItemUuid: 'src-adv',
        caps: {
          item: { limitUses: false },
          // Both gates configured, but Limited learning is OFF → neither is enforced.
          learn: { limitLearning: false, prerequisiteIds: ['r-a'], characterPrerequisiteIds: ['p-expert'] }
        }
      }
    ]
  });
  const advancedRecipe = buildMockRecipe({ id: 'r-b', recipeItemId: 'advanced', linkedRecipeItemUuid: null });
  const advancedBook = new FakeItem({ uuid: 'Actor.a1.Item.adv', sourceId: 'src-adv' });
  // The actor has NOT learned r-a and FAILS the character prerequisite (rank 0 < 5).
  const actor = new FakeActor({ id: 'a1', items: [advancedBook], rollData: { skills: { cra: { rank: 0 } } } });
  const service = buildService({ system, recipes: [advancedRecipe] });

  const result = await service.learnRecipeFromOwnedBook({ recipe: advancedRecipe, craftingActor: actor });
  assert.equal(result.success, true, 'learning is free when Limited learning is off');
});

test('PREREQ - Required Knowledge blocks the drag-drop bulk learn path (issue 544)', () => {
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } }
    },
    recipeItemDefinitions: [
      { id: 'basic', originItemUuid: 'src-basic', caps: { item: { limitUses: false }, learn: {} } },
      {
        id: 'advanced',
        originItemUuid: 'src-adv',
        // limitLearning on but no learnsAllowed → uncapped, so it bulk-learns on drop.
        caps: { item: { limitUses: false }, learn: { limitLearning: true, prerequisiteIds: ['r-a'] } }
      }
    ]
  });
  const basicRecipe = buildMockRecipe({ id: 'r-a', recipeItemId: 'basic', linkedRecipeItemUuid: null });
  const advancedRecipe = buildMockRecipe({ id: 'r-b', recipeItemId: 'advanced', linkedRecipeItemUuid: null });
  const service = buildService({ system, recipes: [basicRecipe, advancedRecipe] });

  // Required Knowledge (r-a) not learned → the bulk preview does NOT offer r-b.
  const blockedBook = new FakeItem({ uuid: 'Actor.a1.Item.adv', sourceId: 'src-adv' });
  const blockedActor = new FakeActor({ id: 'a1', items: [blockedBook] });
  const blocked = service.previewOwnedItemLearning({ ownedItem: blockedBook, actor: blockedActor, mode: 'auto' });
  assert.equal(blocked.learnedRecipes.some((r) => r.id === 'r-b'), false, 'Required Knowledge unmet ⇒ r-b not bulk-learnable');

  // r-a learned → r-b is offered.
  const okBook = new FakeItem({ uuid: 'Actor.a2.Item.adv', sourceId: 'src-adv' });
  const okActor = new FakeActor({
    id: 'a2',
    items: [okBook],
    flagsArg: { fabricate: { learnedRecipes: { 'r-a': { learnedAt: 1 } } } }
  });
  const ok = service.previewOwnedItemLearning({ ownedItem: okBook, actor: okActor, mode: 'auto' });
  assert.equal(ok.learnedRecipes.some((r) => r.id === 'r-b'), true, 'Required Knowledge met ⇒ r-b bulk-learnable');
});

test('PREREQ - Required Knowledge blocks the craft-time auto-learn (issue 544)', async () => {
  const system = buildMockSystem({
    id: 'system-1',
    resolutionMode: 'alchemy',
    alchemy: { learnOnCraft: true },
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } }
    },
    recipeItemDefinitions: [
      {
        id: 'advanced',
        originItemUuid: 'src-adv',
        caps: { item: { limitUses: false }, learn: { limitLearning: true, prerequisiteIds: ['r-a'] } }
      }
    ]
  });
  const basicRecipe = buildMockRecipe({ id: 'r-a', recipeItemId: 'basic', linkedRecipeItemUuid: null });
  const advancedRecipe = buildMockRecipe({ id: 'r-b', recipeItemId: 'advanced', linkedRecipeItemUuid: null });
  const service = buildService({ system, recipes: [basicRecipe, advancedRecipe] });

  // Required Knowledge (r-a) not learned → crafting r-b does not auto-learn it.
  const blockedActor = new FakeActor({ id: 'a1' });
  await service.learnRecipeOnCraft(advancedRecipe, blockedActor);
  assert.ok(!service._getLearnedMap(blockedActor)?.['r-b'], 'Required Knowledge unmet ⇒ no craft auto-learn');

  // r-a learned → crafting r-b auto-learns it.
  const okActor = new FakeActor({
    id: 'a2',
    flagsArg: { fabricate: { learnedRecipes: { 'r-a': { learnedAt: 1 } } } }
  });
  await service.learnRecipeOnCraft(advancedRecipe, okActor);
  assert.ok(service._getLearnedMap(okActor)?.['r-b'], 'Required Knowledge met ⇒ craft auto-learns');
});

test('PREREQ - a dangling Required Knowledge id (deleted recipe) fails open (issue 544)', async () => {
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } }
    },
    recipeItemDefinitions: [
      {
        id: 'advanced',
        originItemUuid: 'src-adv',
        // 'ghost' resolves to no existing recipe.
        caps: { item: { limitUses: false }, learn: { limitLearning: true, prerequisiteIds: ['ghost'] } }
      }
    ]
  });
  const advancedRecipe = buildMockRecipe({ id: 'r-b', recipeItemId: 'advanced', linkedRecipeItemUuid: null });
  const advancedBook = new FakeItem({ uuid: 'Actor.a1.Item.adv', sourceId: 'src-adv' });
  const actor = new FakeActor({ id: 'a1', items: [advancedBook] });
  const service = buildService({ system, recipes: [advancedRecipe] });

  // The deleted prerequisite is skipped rather than permanently bricking the book.
  const result = await service.learnRecipeFromOwnedBook({ recipe: advancedRecipe, craftingActor: actor });
  assert.equal(result.success, true, 'a deleted prerequisite recipe does not brick the book');
});

// ---------------------------------------------------------------------------
// Issue 555 — R5 tier-4-only bulk auto-learn refusal + R6 cap resolution
// ---------------------------------------------------------------------------

test('555 R5 - bulk auto-learn REFUSES a recipe whose owned item matches only via tier 4 (duplicateSource)', () => {
  const system = buildUncappedLearnSystem({ consumeOnLearn: false });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({ uuid: 'Actor.a1.Item.copy' });
  // Tier-4 ONLY: no durable flag, no compendium source, just a transitive duplicateSource.
  item._stats = { duplicateSource: 'Compendium.world.items.book' };
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const preview = service.previewOwnedItemLearning({ ownedItem: item, actor, mode: 'auto' });
  assert.equal(preview.matchedRecipes.length, 0, 'a tier-4-only match is refused in the bulk auto path');
});

test('555 R5 - bulk auto-learn GRANTS a tier-1 flagged item', () => {
  const system = buildUncappedLearnSystem({ consumeOnLearn: false });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({
    uuid: 'Actor.a1.Item.copy',
    flagsArg: { fabricate: { recipeItemDefinitionId: 'book' } }
  });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const preview = service.previewOwnedItemLearning({ ownedItem: item, actor, mode: 'auto' });
  assert.equal(preview.learnedRecipes.length, 1, 'a tier-1 flagged item still auto-learns');
});

test('555 R5 - bulk auto-learn GRANTS a tier-3 compendium-source item', () => {
  const system = buildUncappedLearnSystem({ consumeOnLearn: false });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({ uuid: 'Actor.a1.Item.copy', compendiumSource: 'Compendium.world.items.book' });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const preview = service.previewOwnedItemLearning({ ownedItem: item, actor, mode: 'auto' });
  assert.equal(preview.learnedRecipes.length, 1, 'a tier-3 compendium item still auto-learns');
});

test('555 R5 - the item-sheet picker (mode manual) STILL resolves a tier-4 match', () => {
  const system = buildCappedSystem({ maxRecipes: 3 });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const item = new FakeItem({ uuid: 'Actor.a1.Item.copy' });
  item._stats = { duplicateSource: 'Compendium.world.items.book' };
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const state = service.getLearnableRecipesFromItem({ ownedItem: item, actor });
  assert.ok(state.recipes.some((r) => r.id === 'r-a'), 'tier 4 still resolves for the manual picker');
});

test('555 R6b - _matchDefinitionForItem: a SUPPLIED item matching no member definition yields null (uncapped)', () => {
  const system = buildCappedSystem({ maxRecipes: 2 });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const service = buildService({ system, recipes: [recipe] });
  const item = new FakeItem({ uuid: 'Item.unrelated' }); // matches no member definition
  assert.equal(service._matchDefinitionForItem(recipe, item), null);
});

test('555 R6b - _matchDefinitionForItem: an ABSENT item still yields the first member definition', () => {
  const system = buildCappedSystem({ maxRecipes: 2 });
  const recipe = buildCappedRecipe({ id: 'r-a' });
  const service = buildService({ system, recipes: [recipe] });
  const def = service._matchDefinitionForItem(recipe, null);
  assert.equal(def?.id, 'book', 'item == null falls back to defs[0]');
});

// A recipe linked only by the legacy `linkedRecipeItemUuid` — an un-migrated book, or a
// standalone alchemy formula item — resolves through the synthetic entry built by
// `_recipeItemMatchDefinitions`, which carries `id: null`. It has no registered definition,
// so `autoStampRecipeItemSources` can never stamp its source and tier 1 is unreachable.
// Refusing its tier-4 match would disable on-drop learning permanently, not until R3 runs.
function buildLegacyLinkedRecipe(uuid) {
  return buildMockRecipe({ id: 'r-legacy', recipeItemId: null, linkedRecipeItemUuid: uuid });
}

test('555 R5 - bulk auto-learn GRANTS a legacy `linkedRecipeItemUuid` recipe matched at tier 4', () => {
  const system = buildUncappedLearnSystem({ consumeOnLearn: false });
  const recipe = buildLegacyLinkedRecipe('Item.formula');
  const item = new FakeItem({ uuid: 'Actor.a1.Item.copy' });
  // A world-template drag: duplicateSource is the only surviving link, and no flag is possible.
  item._stats = { duplicateSource: 'Item.formula' };
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const preview = service.previewOwnedItemLearning({ ownedItem: item, actor, mode: 'auto' });
  assert.equal(
    preview.matchedRecipes.length,
    1,
    'a definition-less legacy link must still auto-learn: the auto-stamp cannot rescue it'
  );
});

test('555 R5 - the tier-4 refusal still applies to a REGISTERED definition', () => {
  const system = buildUncappedLearnSystem({ consumeOnLearn: false });
  const recipe = buildCappedRecipe({ id: 'r-a' }); // member of the registered `book` definition
  const item = new FakeItem({ uuid: 'Actor.a1.Item.copy' });
  item._stats = { duplicateSource: 'Compendium.world.items.book' };
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  const preview = service.previewOwnedItemLearning({ ownedItem: item, actor, mode: 'auto' });
  assert.equal(preview.matchedRecipes.length, 0, 'a registered book is still refused at tier 4');
});

// #703 — System-Validity Gate at craft time (guardCraftStart) + entity tier
// ---------------------------------------------------------------------------

// A system whose validation report blocks the whole system (progressive mode with
// no configured progressive check → `progressiveNoCheck`, a `blocks: 'system'`
// blocker).
function buildBlockedSystem(id = 'system-1') {
  return {
    id,
    resolutionMode: 'progressive',
    craftingCheck: {},
    components: [],
    visibilityMode: 'global',
    recipeVisibility: { listMode: 'global' },
  };
}

// A simple-mode system whose one salvageable component has an invalid salvage config
// (two result groups where simple mode requires exactly one) → a `blocks: 'visibility'`
// critical whose entityId is the component id.
function buildInvalidSalvageSystem({ id = 'system-1', componentId = 'invalid-comp' } = {}) {
  return {
    id,
    resolutionMode: 'simple',
    features: { salvage: true },
    salvageResolutionMode: 'simple',
    visibilityMode: 'global',
    recipeVisibility: { listMode: 'global' },
    components: [
      {
        id: componentId,
        name: 'Faulty Widget',
        salvage: {
          enabled: true,
          resultGroups: [
            { id: 'g1', results: [] },
            { id: 'g2', results: [] },
          ],
        },
      },
    ],
  };
}

test('703 - non-GM craft against a blocksSystem system is rejected at guardCraftStart', () => {
  const system = buildBlockedSystem('system-1');
  const recipe = buildMockRecipe({ id: 'r1', craftingSystemId: 'system-1' });
  const service = buildService({ system, recipes: [recipe] });

  const guard = service.guardCraftStart({
    viewer: { isGM: false, id: 'u1' },
    recipe,
    craftingActor: new FakeActor({ id: 'a1' }),
  });

  assert.equal(guard.craftable, false);
  assert.equal(guard.reason, 'system-invalid');
});

test('703 - a GM bypasses the craft-time system-validity gate', () => {
  const system = buildBlockedSystem('system-1');
  const recipe = buildMockRecipe({ id: 'r1', craftingSystemId: 'system-1' });
  const service = buildService({ system, recipes: [recipe] });

  const guard = service.guardCraftStart({
    viewer: { isGM: true, id: 'gm' },
    recipe,
    craftingActor: new FakeActor({ id: 'a1' }),
  });

  assert.notEqual(guard.reason, 'system-invalid');
  assert.equal(guard.visible, true);
});

test('703 - non-GM craft targeting a blocks:visibility entity is rejected; a GM succeeds', () => {
  const system = buildInvalidSalvageSystem({ id: 'system-1', componentId: 'ent-x' });
  // The targeted entity id (`recipe.id`) is the invalid-salvage component id, so it is
  // carried in the system's `hiddenEntityIds`.
  const recipe = buildMockRecipe({ id: 'ent-x', craftingSystemId: 'system-1' });
  const service = buildService({ system, recipes: [recipe] });

  const playerGuard = service.guardCraftStart({
    viewer: { isGM: false, id: 'u1' },
    recipe,
    craftingActor: new FakeActor({ id: 'a1' }),
  });
  assert.equal(playerGuard.craftable, false);
  assert.equal(playerGuard.reason, 'visibility');

  const gmGuard = service.guardCraftStart({
    viewer: { isGM: true, id: 'gm' },
    recipe,
    craftingActor: new FakeActor({ id: 'a1' }),
  });
  assert.equal(gmGuard.craftable, true);
});

test('703 - guardCraftStart evaluates system visibility at most once per craft call', () => {
  let getRecipesCalls = 0;
  const recipeManager = {
    getRecipes: () => {
      getRecipesCalls += 1;
      return [];
    },
  };
  const system = {
    id: 'system-1',
    resolutionMode: 'simple',
    components: [],
    visibilityMode: 'global',
    recipeVisibility: { listMode: 'global' },
  };
  const service = new RecipeVisibilityService(recipeManager, { getSystem: () => system });
  const recipe = buildMockRecipe({ id: 'r1', craftingSystemId: 'system-1' });

  const guard = service.guardCraftStart({
    viewer: { isGM: false, id: 'u1' },
    recipe,
    craftingActor: null,
  });

  assert.equal(guard.craftable, true, 'a valid global system stays craftable');
  assert.equal(getRecipesCalls, 1, 'system visibility computed once, not per step');
});

// ---------------------------------------------------------------------------
// #704 — learn preconditions honour the authored flat visibility mode
// ---------------------------------------------------------------------------

// A flat-authored system that keeps the normalizer's residual `knowledge.mode`
// default of `itemOrLearned`. Under a non-`knowledge` flat mode, learning must be
// refused even though the residual sub-mode would otherwise allow it.
function buildFlatModeLearnSystem(visibilityMode) {
  return buildMockSystem({
    id: 'system-1',
    visibilityMode,
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: false },
        learn: { consumeOnLearn: true, dragDropEnabled: true },
      },
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'src-book' }],
  });
}

function buildOwnedBookScenario(visibilityMode) {
  const system = buildFlatModeLearnSystem(visibilityMode);
  const recipe = buildMockRecipe({
    id: 'recipe-1',
    craftingSystemId: 'system-1',
    recipeItemId: 'book',
    linkedRecipeItemUuid: null,
  });
  const book = new FakeItem({ uuid: 'Actor.a1.Item.book', sourceId: 'src-book' });
  const actor = new FakeActor({ id: 'a1', items: [book] });
  const service = buildService({ system, recipes: [recipe] });
  return { service, recipe, book, actor };
}

for (const flatMode of ['item', 'global', 'restricted']) {
  test(`704 - learnRecipe refuses a flat '${flatMode}' system carrying the residual itemOrLearned sub-mode`, async () => {
    const { service, recipe, book, actor } = buildOwnedBookScenario(flatMode);

    const result = await service.learnRecipe({ recipe, craftingActor: actor });

    assert.equal(result.success, false);
    assert.equal(result.message, 'FABRICATE.Knowledge.LearningDisabled');
    // No side effects: no learn write, no consumption.
    assert.equal(actor.getFlag('fabricate', 'fabricate.learnedRecipes'), undefined);
    assert.equal(book.deleted, false);
  });

  test(`704 - learnRecipeFromOwnedBook refuses a flat '${flatMode}' system (clean failure, no throw)`, async () => {
    const { service, recipe, book, actor } = buildOwnedBookScenario(flatMode);

    const result = await service.learnRecipeFromOwnedBook({ recipe, craftingActor: actor });

    assert.equal(result.success, false);
    assert.equal(result.message, 'FABRICATE.Knowledge.LearningDisabled');
    assert.equal(actor.getFlag('fabricate', 'fabricate.learnedRecipes'), undefined);
    assert.equal(book.deleted, false);
  });
}

test('704 - a flat knowledge system still learns (positive path)', async () => {
  const { service, recipe, actor } = buildOwnedBookScenario('knowledge');

  const result = await service.learnRecipe({ recipe, craftingActor: actor });

  assert.equal(result.success, true);
  const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
  assert.ok(learned['recipe-1'], 'the recipe is recorded as learned');
});

test('704 - a legacy knowledge system with no authored flat mode keeps learned behaviour', async () => {
  // No `visibilityMode` authored: the legacy `knowledge.mode` governs, so 'learned'
  // still learns exactly as before the flat-mode gate.
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled: true },
      },
    },
    recipeItemDefinitions: [{ id: 'book', originItemUuid: 'src-book' }],
  });
  const recipe = buildMockRecipe({
    id: 'recipe-1',
    craftingSystemId: 'system-1',
    recipeItemId: 'book',
    linkedRecipeItemUuid: null,
  });
  const book = new FakeItem({ uuid: 'Actor.a1.Item.book', sourceId: 'src-book' });
  const actor = new FakeActor({ id: 'a1', items: [book] });
  const service = buildService({ system, recipes: [recipe] });

  const result = await service.learnRecipe({ recipe, craftingActor: actor });
  assert.equal(result.success, true);
  assert.ok(actor.getFlag('fabricate', 'fabricate.learnedRecipes')['recipe-1']);
});

// ---------------------------------------------------------------------------
// #705 — cap resolution anchors on each candidate item's OWN book, not the
// recipe's first member book
// ---------------------------------------------------------------------------

// A recipe (r1) living in two books of one system with DIFFERING caps. Book A is the
// recipe's first member book; book B differs, so judging B's items by A's caps is the
// drift under test.
function buildTwoBookSystem({ bookACaps, bookBCaps, visibilityMode = 'knowledge' } = {}) {
  return buildMockSystem({
    id: 'system-1',
    visibilityMode,
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'itemOrLearned', learn: { dragDropEnabled: true } },
    },
    recipeItemDefinitions: [
      { id: 'book-a', originItemUuid: 'src-a', recipeIds: ['r1'], caps: bookACaps },
      { id: 'book-b', originItemUuid: 'src-b', recipeIds: ['r1'], caps: bookBCaps },
    ],
  });
}

test('705 - an item of book B is not judged exhausted by book A caps (evaluateKnowledgeAccess)', () => {
  // Book A: unlimited uses (first book). Book B: 2 uses. A book-B item at 2 uses is
  // exhausted by ITS book, so it must not grant a match — even though book A is unlimited.
  const system = buildTwoBookSystem({
    bookACaps: { item: { limitUses: false }, learn: {} },
    bookBCaps: { item: { limitUses: true, maxUses: 2 }, learn: {} },
  });
  const recipe = buildMockRecipe({ id: 'r1', linkedRecipeItemUuid: null });
  const service = buildService({ system, recipes: [recipe] });

  const spentB = new FakeItem({
    uuid: 'Actor.a.Item.b',
    sourceId: 'src-b',
    flagsArg: { fabricate: { recipeItemUsage: { timesUsed: 2 } } },
  });
  const actorB = new FakeActor({ id: 'actor-b', items: [spentB] });
  assert.equal(
    service.evaluateKnowledgeAccess({
      recipe,
      viewer: { isGM: false, id: 'u' },
      craftingActor: actorB,
    }).hasMatchedItem,
    false,
    "a spent book-B item is exhausted by book B's cap"
  );
  assert.equal(
    service.isKnowledgeItemExhausted({ recipe, craftingActor: actorB }),
    true,
    'the player-listing exhausted status honours book B'
  );

  // A fresh book-A item (unlimited) is never exhausted, even though it is the first book.
  const freshA = new FakeItem({ uuid: 'Actor.a.Item.a', sourceId: 'src-a' });
  const actorA = new FakeActor({ id: 'actor-a', items: [freshA] });
  assert.equal(
    service.evaluateKnowledgeAccess({
      recipe,
      viewer: { isGM: false, id: 'u' },
      craftingActor: actorA,
    }).hasMatchedItem,
    true
  );
  assert.equal(service.isKnowledgeItemExhausted({ recipe, craftingActor: actorA }), false);
});

test('705 - applyRecipeItemUseOnCraft tracks a use on book B even when book A does not limit uses', async () => {
  const system = buildTwoBookSystem({
    bookACaps: { item: { limitUses: false }, learn: {} },
    bookBCaps: { item: { limitUses: true, maxUses: 2, whenSpent: 'inert' }, learn: {} },
    visibilityMode: 'item',
  });
  const recipe = buildMockRecipe({ id: 'r1', linkedRecipeItemUuid: null });
  const service = buildService({ system, recipes: [recipe] });

  // The actor owns only a book-B item; the recipe's FIRST book (A) is unlimited, which
  // the old first-book early return used to skip tracking entirely.
  const bookBItem = new FakeItem({ uuid: 'Actor.a.Item.b', sourceId: 'src-b' });
  const actor = new FakeActor({ id: 'actor-b', items: [bookBItem] });

  await service.applyRecipeItemUseOnCraft({ recipe, craftingActor: actor });

  assert.equal(service._getRecipeItemUsage(bookBItem), 1, "book B's use is tracked");
});

test('705 - applyRecipeItemUseOnCraft does not track a use for an unlimited selected book', async () => {
  const system = buildTwoBookSystem({
    bookACaps: { item: { limitUses: false }, learn: {} },
    bookBCaps: { item: { limitUses: false }, learn: {} },
    visibilityMode: 'item',
  });
  const recipe = buildMockRecipe({ id: 'r1', linkedRecipeItemUuid: null });
  const service = buildService({ system, recipes: [recipe] });
  const bookAItem = new FakeItem({ uuid: 'Actor.a.Item.a', sourceId: 'src-a' });
  const actor = new FakeActor({ id: 'actor-a', items: [bookAItem] });

  await service.applyRecipeItemUseOnCraft({ recipe, craftingActor: actor });

  assert.equal(service._getRecipeItemUsage(bookAItem), 0, 'nothing to track for an unlimited book');
});

test('705 - learnRecipe consumes the selected item only when ITS book consumeOnLearn is true', async () => {
  const system = buildTwoBookSystem({
    bookACaps: { item: { limitUses: false }, learn: { consumeOnLearn: false } },
    bookBCaps: { item: { limitUses: false }, learn: { consumeOnLearn: true } },
  });
  const recipe = buildMockRecipe({ id: 'r1', linkedRecipeItemUuid: null });

  // Learn selecting a book-B item (consumeOnLearn: true) → the item is consumed.
  const serviceB = buildService({ system, recipes: [recipe] });
  const bookBItem = new FakeItem({ uuid: 'Actor.b.Item.b', sourceId: 'src-b' });
  const actorB = new FakeActor({ id: 'actor-b', items: [bookBItem] });
  const learnB = await serviceB.learnRecipe({ recipe, craftingActor: actorB });
  assert.equal(learnB.success, true);
  assert.equal(bookBItem.deleted, true, "book B's consumeOnLearn:true consumes the item");

  // Learn selecting a book-A item (consumeOnLearn: false) → the item is retained, even
  // though book A is the recipe's first member book.
  const serviceA = buildService({ system, recipes: [recipe] });
  const bookAItem = new FakeItem({ uuid: 'Actor.a.Item.a', sourceId: 'src-a' });
  const actorA = new FakeActor({ id: 'actor-a', items: [bookAItem] });
  const learnA = await serviceA.learnRecipe({ recipe, craftingActor: actorA });
  assert.equal(learnA.success, true);
  assert.equal(bookAItem.deleted, false, "book A's consumeOnLearn:false retains the item");
});

// ---------------------------------------------------------------------------
// #706 — bulk drop-learn reads consumeOnLearn from the matched book's caps, not
// the legacy system-wide config the normalizer strips
// ---------------------------------------------------------------------------

// A knowledge system whose bulk-learnable book authors consumeOnLearn on its caps
// (the real runtime shape), with NO system-level `knowledge.learn.consumeOnLearn`.
function buildBulkLearnSystem(consumeOnLearn) {
  return buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } },
    },
    recipeItemDefinitions: [
      {
        id: 'book',
        originItemUuid: 'Compendium.world.items.book',
        caps: { learn: { consumeOnLearn } },
      },
    ],
  });
}

function bulkLearnOwnedBook(system) {
  const recipe = buildMockRecipe({
    id: 'recipe-1',
    recipeItemId: 'book',
    linkedRecipeItemUuid: null,
  });
  const item = new FakeItem({
    uuid: 'Actor.a1.Item.book',
    sourceId: 'Compendium.world.items.book',
  });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });
  return { service, item, actor };
}

test('706a - a dropped book with caps.consumeOnLearn:true is removed after bulk learn', async () => {
  const { service, item, actor } = bulkLearnOwnedBook(buildBulkLearnSystem(true));

  await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.equal(item.deleted, true);
});

test('706b - a dropped book with caps.consumeOnLearn:false is retained after bulk learn', async () => {
  const { service, item, actor } = bulkLearnOwnedBook(buildBulkLearnSystem(false));

  const result = await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.equal(result.notificationKind, 'success');
  assert.equal(item.deleted, false);
});

test('706c - a recipe resolving to no definition consumes on learn (fail-closed default)', async () => {
  // A legacy-linked recipe with no authored definition: the owned item matches via the
  // synthetic legacy entry, so `_matchDefinitionForItem` resolves to null and caps fall
  // back to the uncapped default (consumeOnLearn on).
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', item: { limitUses: false }, learn: { dragDropEnabled: true } },
    },
  });
  const recipe = buildMockRecipe({
    id: 'recipe-1',
    recipeItemId: null,
    linkedRecipeItemUuid: 'Compendium.world.items.legacy',
  });
  const item = new FakeItem({
    uuid: 'Actor.a1.Item.legacy',
    sourceId: 'Compendium.world.items.legacy',
  });
  const actor = new FakeActor({ id: 'a1', items: [item] });
  const service = buildService({ system, recipes: [recipe] });

  await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });

  assert.equal(item.deleted, true, 'fail-closed default consumes');
});

test('706d - the normalized system config carries no legacy consumeOnLearn, yet caps still consume', async () => {
  const system = buildBulkLearnSystem(true);
  const { service, item, actor } = bulkLearnOwnedBook(system);

  // The legacy read the old code used is undefined here, so it could never have fired.
  assert.equal(service._getKnowledgeConfig(system).learn?.consumeOnLearn, undefined);

  await service.learnRecipesFromOwnedItem({ ownedItem: item, actor, mode: 'auto' });
  assert.equal(item.deleted, true, 'consumption is driven by the definition caps');
});

// ---------------------------------------------------------------------------
// Multi-step feature gate — LISTING path (issue 710)
//
// Disabling `features.multiStepRecipes` is a non-destructive visibility gate:
// a multi-step recipe (steps[].length > 0) is retained in persisted data but
// raises a `blocks: 'visibility'` issue, so the non-GM listing must drop it and
// re-enabling the feature must list it again losslessly. These pin the listing
// counterpart to guardCraftStart so the player list and the craft guard agree.
// ---------------------------------------------------------------------------

function buildMultiStepGateFixture(multiStepEnabled) {
  const system = buildMockSystem({
    id: 'system-1',
    recipeVisibility: { listMode: 'player' },
    features: { multiStepRecipes: multiStepEnabled },
  });
  const singleStep = buildMockRecipe({
    id: 'recipe-single',
    visibility: { restricted: false, allowedUserIds: [] },
  });
  const multiStep = buildMockRecipe({
    id: 'recipe-multi',
    visibility: { restricted: false, allowedUserIds: [] },
    steps: [{ id: 's1' }, { id: 's2' }],
  });
  return { system, recipes: [singleStep, multiStep] };
}

test('710 listing - multi-step recipe is hidden from a non-GM when the feature is disabled', () => {
  const { system, recipes } = buildMultiStepGateFixture(false);
  const service = buildService({ system, recipes });

  const results = service.getVisibleRecipes({
    viewer: { isGM: false, id: 'user-1' },
    craftingSystemId: 'system-1',
  });

  const ids = results.map((entry) => entry.recipe.id);
  assert.deepEqual(ids, ['recipe-single'], 'the globally-visible multi-step recipe is gated out of the listing');
});

test('710 listing - a GM still sees the gated multi-step recipe (bypass)', () => {
  const { system, recipes } = buildMultiStepGateFixture(false);
  const service = buildService({ system, recipes });

  const results = service.getVisibleRecipes({
    viewer: { isGM: true, id: 'gm-1' },
    craftingSystemId: 'system-1',
  });

  const ids = results.map((entry) => entry.recipe.id).sort();
  assert.deepEqual(ids, ['recipe-multi', 'recipe-single'], 'the GM bypass lists every recipe');
});

test('710 listing - re-enabling the feature restores the multi-step recipe with no data loss', () => {
  const { system, recipes } = buildMultiStepGateFixture(true);
  const service = buildService({ system, recipes });

  const results = service.getVisibleRecipes({
    viewer: { isGM: false, id: 'user-1' },
    craftingSystemId: 'system-1',
  });

  const listed = results.find((entry) => entry.recipe.id === 'recipe-multi');
  assert.ok(listed, 'the multi-step recipe is listed once the feature is on');
  assert.deepEqual(listed.recipe.steps, recipes[1].steps, 'its steps are unchanged (round-trip is lossless)');
});

test('710 guard - a non-GM craft of a gated multi-step recipe is rejected with reason visibility', () => {
  const { system, recipes } = buildMultiStepGateFixture(false);
  const service = buildService({ system, recipes });

  const guard = service.guardCraftStart({
    viewer: { isGM: false, id: 'user-1' },
    recipe: recipes[1],
  });

  assert.equal(guard.craftable, false);
  assert.equal(guard.reason, 'visibility', 'listing and the craft guard agree on the gate');
});
