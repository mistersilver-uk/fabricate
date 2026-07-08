import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';

let idCounter = 0;

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = {
  utils: {
    getProperty,
    randomID: () => `id-${++idCounter}`
  }
};

globalThis.game = {
  user: { isGM: true, name: 'Test GM' },
  actors: [],
  settings: {
    get: () => [],
    set: async () => {}
  }
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

globalThis.fromUuid = async () => null;
globalThis.fromUuidSync = () => null;

test('_normalizeComponentDescription extracts plain text from Foundry-style description objects', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(
    manager._normalizeComponentDescription({ value: '<p>Fresh <strong>silverweed</strong>.</p>' }),
    'Fresh silverweed.'
  );
});

test('_normalizeComponentDescription does not stringify unknown objects', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(manager._normalizeComponentDescription({ unexpected: 'shape' }), '');
});

test('_extractSourceDescription skips object fallback text instead of returning object strings', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(
    manager._extractSourceDescription({
      system: {
        description: {
          value: '<p>Dreamleaf petals.</p>'
        }
      }
    }),
    'Dreamleaf petals.'
  );
  assert.equal(
    manager._extractSourceDescription({
      system: {
        description: {
          unexpected: '<p>Should not stringify the object.</p>'
        }
      }
    }),
    ''
  );
});

// ---------------------------------------------------------------------------
// System-wide recipe visibility strategy (issue 511) — caps moved off knowledge
// ---------------------------------------------------------------------------

test('_normalizeRecipeVisibility keeps only strategy fields (mode + dragDropEnabled); caps are gone', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const normalized = manager._normalizeRecipeVisibility({
    listMode: 'knowledge',
    knowledge: {
      mode: 'itemOrLearned',
      item: { limitUses: true, maxUses: 2, destroyWhenExhausted: true },
      learn: { consumeOnLearn: false, dragDropEnabled: false, limitRecipes: true, maxRecipes: 2 }
    }
  });

  assert.equal(normalized.listMode, 'knowledge');
  assert.equal(normalized.knowledge.mode, 'itemOrLearned');
  assert.equal(normalized.knowledge.learn.dragDropEnabled, false);
  // The per-item caps no longer live on the system-wide config.
  assert.equal('item' in normalized.knowledge, false);
  assert.equal('consumeOnLearn' in normalized.knowledge.learn, false);
  assert.equal('limitRecipes' in normalized.knowledge.learn, false);
});

// ---------------------------------------------------------------------------
// Flat system-level visibility strategy enum (issue 511, PR-B)
// ---------------------------------------------------------------------------

test('_normalizeVisibilityMode passes through the four valid modes', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  for (const mode of ['global', 'restricted', 'item', 'knowledge']) {
    assert.equal(manager._normalizeVisibilityMode(mode), mode);
  }
});

test('_normalizeVisibilityMode defaults invalid/missing input to knowledge', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  for (const bad of [undefined, null, '', 'player', 'nonsense', 42, {}]) {
    assert.equal(manager._normalizeVisibilityMode(bad), 'knowledge');
  }
});

test('_normalizeSystem emits visibilityMode (default knowledge, valid pass-through)', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(manager._normalizeSystem({ id: 'sys-default' }).visibilityMode, 'knowledge');
  assert.equal(
    manager._normalizeSystem({ id: 'sys-item', visibilityMode: 'item' }).visibilityMode,
    'item'
  );
  assert.equal(
    manager._normalizeSystem({ id: 'sys-bad', visibilityMode: 'bogus' }).visibilityMode,
    'knowledge'
  );
});

// ---------------------------------------------------------------------------
// Per-recipe-item caps (issue 511) — model normalization
// ---------------------------------------------------------------------------

test('_normalizeRecipeItemDefinition seeds an uncapped caps block when none is authored', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const def = manager._normalizeRecipeItemDefinition({
    id: 'recipe-item-1',
    name: 'Formula Book',
    sourceItemUuid: 'Compendium.world.formulas.book-1'
  });

  assert.deepEqual(def.caps, {
    item: {
      limitUses: false,
      maxUses: undefined,
      // Default whenSpent is 'destroyed'; the legacy boolean is kept in sync.
      destroyWhenExhausted: true,
      whenSpent: 'destroyed'
    },
    learn: {
      consumeOnLearn: true,
      limitRecipes: false,
      limitLearning: false,
      maxRecipes: undefined,
      learnsAllowed: undefined,
      learnScope: 'perInstance',
      learningMode: 'once',
      prerequisite: null,
      destroyWhenSpent: false
    }
  });
  // The definition defaults to enabled.
  assert.equal(def.enabled, true);
});

// ---------------------------------------------------------------------------
// Expanded recipe-item model (issue 511, PR-B) — enabled + whenSpent/learningMode
// ---------------------------------------------------------------------------

test('_normalizeRecipeItemDefinition round-trips enabled:false and defaults it to true', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(manager._normalizeRecipeItemDefinition({ id: 'a', sourceItemUuid: 'u' }).enabled, true);
  assert.equal(
    manager._normalizeRecipeItemDefinition({ id: 'b', sourceItemUuid: 'u', enabled: false }).enabled,
    false
  );
  assert.equal(
    manager._normalizeRecipeItemDefinition({ id: 'c', sourceItemUuid: 'u', enabled: true }).enabled,
    true
  );
});

test('_normalizeRecipeItemCaps derives whenSpent from legacy destroyWhenExhausted when unset', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const destroyed = manager._normalizeRecipeItemCaps({ item: { destroyWhenExhausted: true } });
  assert.equal(destroyed.item.whenSpent, 'destroyed');
  assert.equal(destroyed.item.destroyWhenExhausted, true);

  const inert = manager._normalizeRecipeItemCaps({ item: { destroyWhenExhausted: false } });
  assert.equal(inert.item.whenSpent, 'inert');
  assert.equal(inert.item.destroyWhenExhausted, false);
});

test('_normalizeRecipeItemCaps lets an authored whenSpent win and syncs destroyWhenExhausted', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  // whenSpent wins even when the legacy boolean disagrees.
  const inert = manager._normalizeRecipeItemCaps({
    item: { whenSpent: 'inert', destroyWhenExhausted: true }
  });
  assert.equal(inert.item.whenSpent, 'inert');
  assert.equal(inert.item.destroyWhenExhausted, false);

  const destroyed = manager._normalizeRecipeItemCaps({
    item: { whenSpent: 'destroyed', destroyWhenExhausted: false }
  });
  assert.equal(destroyed.item.whenSpent, 'destroyed');
  assert.equal(destroyed.item.destroyWhenExhausted, true);
});

test('_normalizeRecipeItemCaps mirrors limitRecipes/maxRecipes to limitLearning/learnsAllowed', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const legacy = manager._normalizeRecipeItemCaps({
    learn: { limitRecipes: true, maxRecipes: 4 }
  });
  assert.equal(legacy.learn.limitLearning, true);
  assert.equal(legacy.learn.learnsAllowed, 4);
  // Migrated from legacy: maxRecipes > 1 → 'ntimes'.
  assert.equal(legacy.learn.learningMode, 'ntimes');

  // The new fields win and are mirrored back onto the legacy names.
  const modern = manager._normalizeRecipeItemCaps({
    learn: { limitLearning: true, learnsAllowed: 2, learningMode: 'party' }
  });
  assert.equal(modern.learn.limitRecipes, true);
  assert.equal(modern.learn.maxRecipes, 2);
  assert.equal(modern.learn.limitLearning, true);
  assert.equal(modern.learn.learnsAllowed, 2);
  assert.equal(modern.learn.learningMode, 'party');
});

test('_normalizeRecipeItemCaps defaults learningMode once, prerequisite null, and clamps enum', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const bare = manager._normalizeRecipeItemCaps({});
  assert.equal(bare.learn.learningMode, 'once');
  assert.equal(bare.learn.prerequisite, null);

  const bad = manager._normalizeRecipeItemCaps({ learn: { learningMode: 'nonsense' } });
  assert.equal(bad.learn.learningMode, 'once');

  const prereq = manager._normalizeRecipeItemCaps({ learn: { prerequisite: '  recipe-42  ' } });
  assert.equal(prereq.learn.prerequisite, 'recipe-42');
});

test('_normalizeRecipeItemCaps derives learnScope (per-copy vs total) with legacy mode fallback', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const scope = (learn) => manager._normalizeRecipeItemCaps({ learn }).learn;

  // Default and legacy per-document modes → per-copy scope.
  assert.equal(scope({}).learnScope, 'perInstance');
  assert.equal(scope({ learningMode: 'once' }).learnScope, 'perInstance');
  assert.equal(scope({ learningMode: 'ntimes' }).learnScope, 'perInstance');
  // Legacy shared world pool → total scope.
  assert.equal(scope({ learningMode: 'party' }).learnScope, 'total');
  // An authored learnScope wins over the legacy mode; the legacy mirror follows it.
  const total = scope({ learnScope: 'total', limitLearning: true, learnsAllowed: 4 });
  assert.equal(total.learnScope, 'total');
  assert.equal(total.learningMode, 'party');
  const perCopy = scope({ learnScope: 'perInstance', limitLearning: true, learnsAllowed: 4 });
  assert.equal(perCopy.learnScope, 'perInstance');
  assert.equal(perCopy.learningMode, 'ntimes');
});

test('updateRecipeItemDefinition accepts an enabled patch alongside caps', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy',
    recipeItemDefinitions: [{ id: 'book-1', sourceItemUuid: 'u' }]
  }));

  const result = await manager.updateRecipeItemDefinition('sys-1', 'book-1', {
    enabled: false,
    caps: { learn: { limitLearning: true, learnsAllowed: 3, learnScope: 'total' } }
  });

  assert.equal(result.item.enabled, false);
  assert.equal(result.item.caps.learn.learnScope, 'total');
  assert.equal(result.item.caps.learn.learnsAllowed, 3);
  // Legacy fields stay in sync for back-compat consumers.
  assert.equal(result.item.caps.learn.learningMode, 'party');
  assert.equal(result.item.caps.learn.limitRecipes, true);
  assert.equal(result.item.caps.learn.maxRecipes, 3);
});

test('_normalizeRecipeItemDefinition round-trips authored per-item caps', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const def = manager._normalizeRecipeItemDefinition({
    id: 'recipe-item-1',
    name: 'Formula Book',
    sourceItemUuid: 'Compendium.world.formulas.book-1',
    caps: {
      item: { limitUses: true, maxUses: 3, destroyWhenExhausted: true },
      learn: {
        consumeOnLearn: false,
        limitRecipes: true,
        maxRecipes: 2,
        destroyWhenSpent: true
      }
    }
  });

  assert.equal(def.caps.item.limitUses, true);
  assert.equal(def.caps.item.maxUses, 3);
  assert.equal(def.caps.item.destroyWhenExhausted, true);
  assert.equal(def.caps.learn.consumeOnLearn, false);
  assert.equal(def.caps.learn.limitRecipes, true);
  assert.equal(def.caps.learn.maxRecipes, 2);
  assert.equal(def.caps.learn.destroyWhenSpent, true);
});

test('_normalizeRecipeItemCaps keeps a finite positive learn maxRecipes only when limitRecipes is on', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const capOff = manager._normalizeRecipeItemCaps({
    learn: { limitRecipes: false, maxRecipes: 4 }
  });
  assert.equal(capOff.learn.maxRecipes, undefined);

  const nonPositive = manager._normalizeRecipeItemCaps({
    learn: { limitRecipes: true, maxRecipes: 0 }
  });
  assert.equal(nonPositive.learn.maxRecipes, undefined);

  const enabled = manager._normalizeRecipeItemCaps({
    learn: { limitRecipes: true, maxRecipes: 4 }
  });
  assert.equal(enabled.learn.maxRecipes, 4);
});

test('addRecipeItemFromUuid adds a recipe item definition without creating a component', async () => {
  globalThis.fromUuid = async (uuid) => ({
    documentName: 'Item',
    uuid,
    name: 'Formula Book',
    img: 'icons/svg/book.svg',
    system: {
      description: {
        value: '<p>Arcane instructions</p>'
      }
    }
  });

  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy',
    components: [{
      id: 'component-1',
      name: 'Mandrake',
      img: 'icons/svg/item-bag.svg',
      description: ''
    }]
  }));

  const result = await manager.addRecipeItemFromUuid('sys-1', 'Compendium.world.formulas.book-1');

  assert.equal(result.action, 'added');
  assert.equal(manager.getRecipeItemDefinitions('sys-1').length, 1);
  assert.equal(manager.getItems('sys-1').length, 1);
  assert.equal(manager.getItems('sys-1')[0].id, 'component-1');
  assert.equal(manager.getRecipeItemDefinitions('sys-1')[0].name, 'Formula Book');
});

test('migrateLegacyRecipeItems reuses one recipe item definition for shared legacy UUIDs', async () => {
  let systemsSaved = false;
  let recipesSaved = false;
  const recipes = [
    {
      id: 'recipe-1',
      name: 'Potion A',
      img: 'icons/svg/item-bag.svg',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() { return { ...this }; }
    },
    {
      id: 'recipe-2',
      name: 'Potion B',
      img: 'icons/svg/item-bag.svg',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() { return { ...this }; }
    }
  ];
  const recipeManager = {
    getRecipes: ({ craftingSystemId } = {}) => (craftingSystemId
      ? recipes.filter(recipe => recipe.craftingSystemId === craftingSystemId)
      : recipes),
    save: async () => { recipesSaved = true; }
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.save = async () => { systemsSaved = true; };
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy'
  }));

  await manager._migrateLegacyRecipeItems();

  const definitions = manager.getRecipeItemDefinitions('sys-1');
  assert.equal(definitions.length, 1);
  assert.equal(recipes[0].recipeItemId, definitions[0].id);
  assert.equal(recipes[1].recipeItemId, definitions[0].id);
  assert.equal(systemsSaved, true);
  assert.equal(recipesSaved, true);
});

test('deleteRecipeItemDefinition removes the system recipe item and clears affected recipe references', async () => {
  let systemsSaved = false;
  let recipesSaved = false;
  const recipes = [
    {
      id: 'recipe-1',
      name: 'Potion A',
      craftingSystemId: 'sys-1',
      recipeItemId: 'recipe-item-1',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() { return { ...this }; }
    },
    {
      id: 'recipe-2',
      name: 'Potion B',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() { return { ...this }; }
    }
  ];

  const recipeManager = {
    getRecipes: ({ craftingSystemId } = {}) => (craftingSystemId
      ? recipes.filter(recipe => recipe.craftingSystemId === craftingSystemId)
      : recipes),
    save: async () => { recipesSaved = true; }
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.save = async () => { systemsSaved = true; };
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy',
    recipeItemDefinitions: [{
      id: 'recipe-item-1',
      name: 'Formula Book',
      img: 'icons/svg/book.svg',
      sourceItemUuid: 'Compendium.world.formulas.book-1'
    }]
  }));

  const result = await manager.deleteRecipeItemDefinition('sys-1', 'recipe-item-1');

  assert.equal(result.deleted, true);
  assert.deepEqual(
    result.affectedRecipes.map(recipe => recipe.id),
    ['recipe-1', 'recipe-2']
  );
  assert.equal(manager.getRecipeItemDefinitions('sys-1').length, 0);
  assert.equal(recipes[0].recipeItemId, null);
  assert.equal(recipes[0].linkedRecipeItemUuid, null);
  assert.equal(recipes[1].recipeItemId, null);
  assert.equal(recipes[1].linkedRecipeItemUuid, null);
  assert.equal(systemsSaved, true);
  assert.equal(recipesSaved, true);
});

test('updateRecipeItemDefinition merges and normalizes a caps patch, persisting it', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy',
    recipeItemDefinitions: [{
      id: 'book-1',
      name: 'Formula Book',
      sourceItemUuid: 'Compendium.world.formulas.book-1'
    }]
  }));

  const result = await manager.updateRecipeItemDefinition('sys-1', 'book-1', {
    caps: { learn: { limitRecipes: true, maxRecipes: 3 } }
  });

  assert.equal(result.item.caps.learn.limitRecipes, true);
  assert.equal(result.item.caps.learn.maxRecipes, 3);
  const stored = manager.getRecipeItemDefinition('sys-1', 'book-1');
  assert.equal(stored.caps.learn.maxRecipes, 3);
  // The untouched item sub-block keeps its uncapped defaults.
  assert.equal(stored.caps.item.limitUses, false);
});

test('updateRecipeItemDefinition drops an invalid maxRecipes via normalization', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy',
    recipeItemDefinitions: [{ id: 'book-1', sourceItemUuid: 'u' }]
  }));

  const result = await manager.updateRecipeItemDefinition('sys-1', 'book-1', {
    caps: { learn: { limitRecipes: true, maxRecipes: 0 } }
  });

  assert.equal(result.item.caps.learn.maxRecipes, undefined);
});

test('updateRecipeItemDefinition throws for a missing definition', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sys-1', manager._normalizeSystem({ id: 'sys-1', name: 'A' }));

  await assert.rejects(() => manager.updateRecipeItemDefinition('sys-1', 'nope', { caps: {} }));
});

test('RecipeVisibilityService matches recipeItemId through the system recipe item definition', () => {
  const system = {
    id: 'sys-1',
    resolutionMode: 'simple',
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'item' } },
    recipeItemDefinitions: [{
      id: 'recipe-item-1',
      sourceItemUuid: 'Compendium.world.formulas.book-1'
    }]
  };
  const service = new RecipeVisibilityService(
    { getRecipes: () => [] },
    {
      getSystem: (systemId) => (systemId === 'sys-1' ? system : null),
      getRecipeItemDefinition: (systemId, recipeItemId) =>
        systemId === 'sys-1'
          ? system.recipeItemDefinitions.find(def => def.id === recipeItemId) || null
          : null
    }
  );

  const recipe = {
    id: 'recipe-1',
    craftingSystemId: 'sys-1',
    recipeItemId: 'recipe-item-1'
  };
  const item = {
    uuid: 'Item.actor-owned-formula',
    flags: {
      core: {
        sourceId: 'Compendium.world.formulas.book-1'
      }
    }
  };

  assert.equal(service._isMatchingRecipeItem(recipe, item), true);
});
