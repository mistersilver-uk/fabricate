/**
 * Tests for T-097: CompendiumImporter service.
 *
 * Tests:
 *   1. Successful import: system + recipes created, correct counts
 *   2. Exact UUID match: component retains UUID, method reported as 'exact'
 *   3. Source+name UUID override: stale UUID remapped, old UUID added to fallbacks
 *   4. Unresolved link reporting: component with no match marked unresolved
 *   5. Fallback ID retention across re-import
 *   6. Additional fallback IDs merged into component
 *   7. overwriteExisting:false skips existing system (returns skipped)
 *   8. __SYSTEM_ID__ placeholder replaced in all recipes
 *   9. Collision detection: existing recipe generates collision entry
 *  10. Invalid pack data: missing system field throws error
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry global stubs
// ---------------------------------------------------------------------------

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty: (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj) ?? undefined
  }
};
globalThis.game = {
  packs: [],
  fabricate: null,
  user: { isGM: true }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null; // default: uuid not found

// ---------------------------------------------------------------------------
// Module import
// ---------------------------------------------------------------------------

const { CompendiumImporter, createDefaultProgressReporter } = await import(
  '../src/systems/CompendiumImporter.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComponent(overrides = {}) {
  return {
    id: 'comp1',
    name: 'Iron Ore',
    originItemUuid: 'Compendium.source.items.iron-ore',
    aliasItemUuids: [],
    ...overrides
  };
}

function makePackData(overrides = {}) {
  return {
    system: {
      id: 'test-system',
      name: 'Test System',
      components: [makeComponent()],
      recipes: []
    },
    recipes: [
      {
        id: 'recipe1',
        name: 'Iron Bar',
        craftingSystemId: '__SYSTEM_ID__',
        ingredientSets: [],
        resultGroups: [],
        enabled: true
      }
    ],
    ...overrides
  };
}

function makeMockSystemManager({ systems = [], createdSystems = [], updatedSystems = [] } = {}) {
  return {
    getSystems: () => systems,
    createSystem: async (data) => {
      const sys = { ...data, id: data.id || 'new-system-id' };
      createdSystems.push(sys);
      return sys;
    },
    updateSystem: async (id, data) => {
      const sys = { ...data, id };
      updatedSystems.push(sys);
      return sys;
    }
  };
}

// STATEFUL recipe-manager double (issue 775): a real backing store so the prune
// assertions are non-vacuous — `getRecipes({craftingSystemId})` returns the persisted
// set and `deleteRecipe` actually removes from it. `createRecipe`/`updateRecipe` fold
// their result into the store (matching the real map mutation), so provenance stamping
// and gone-from-map/idempotence assertions reflect reality rather than a spy log.
function makeMockRecipeManager({
  existingRecipes = {},
  // Recipes already persisted in the store (with craftingSystemId + importSource), used
  // by the prune tests to stage GM-authored / legacy / foreign / provenance-matched rows.
  persistedRecipes = [],
  createdRecipes = [],
  updatedRecipes = [],
  createdRecipeOptions = [],
  updatedRecipeOptions = [],
  deletedRecipeIds = [],
  deleteRecipeOptions = [],
  getRecipesCalls = [],
  notifyDetails = [],
  saveCalls = [],
  cleanupCalls = [],
  // Optionally make specific recipe ids throw on create/update to exercise the
  // per-recipe error-isolation path.
  throwOnRecipeIds = []
} = {}) {
  const store = new Map();
  for (const [id, recipe] of Object.entries(existingRecipes)) {
    store.set(id, { id, ...recipe });
  }
  for (const recipe of persistedRecipes) {
    store.set(recipe.id, { ...recipe });
  }
  return {
    getRecipe: (id) => store.get(id) ?? null,
    getRecipes: (filters = {}) => {
      getRecipesCalls.push(filters);
      let recipes = [...store.values()];
      if (filters.craftingSystemId !== undefined) {
        recipes = recipes.filter((r) => r.craftingSystemId === filters.craftingSystemId);
      }
      return recipes;
    },
    createRecipe: async (data, options) => {
      createdRecipes.push(data);
      createdRecipeOptions.push(options);
      if (throwOnRecipeIds.includes(data.id)) {
        throw new Error(`boom ${data.id}`);
      }
      store.set(data.id, { ...data });
      return data;
    },
    updateRecipe: async (id, data, options) => {
      updatedRecipes.push(data);
      updatedRecipeOptions.push(options);
      if (throwOnRecipeIds.includes(id)) {
        throw new Error(`boom ${id}`);
      }
      store.set(id, { ...data });
      return data;
    },
    deleteRecipe: async (id, options) => {
      deletedRecipeIds.push(id);
      deleteRecipeOptions.push(options);
      store.delete(id);
    },
    // One bulk actor-flag cleanup pass the importer runs after a prune batch (F1).
    cleanupOrphanedRecipeFlags: async () => {
      cleanupCalls.push(Date.now());
    },
    notifyRecipesChanged: (details) => {
      notifyDetails.push(details);
    },
    // The importer flushes the whole recipe batch with a SINGLE save() after the
    // loop; the spy records each call so tests can pin the save-once invariant.
    save: async () => {
      saveCalls.push(Date.now());
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('T-097: successful import creates system and recipes', async () => {
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? {} : null;

  const createdSystems = [];
  const createdRecipes = [];
  const createdRecipeOptions = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager({ createdRecipes, createdRecipeOptions });

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData();

  const summary = await importer.importFromPackData(packData);

  assert.equal(summary.system.created, true, 'System should be created');
  assert.equal(summary.system.skipped, false, 'System should not be skipped');
  assert.equal(createdSystems.length, 1, 'One system should be created');
  assert.equal(summary.recipes.imported, 1, 'One recipe should be imported');
  assert.deepEqual(createdRecipeOptions, [{ notify: false, emitChange: false, persist: false }], 'Batch import should suppress per-recipe create notifications and change hooks, and defer persistence to a single batch save');
  assert.equal(summary.recipes.errors.length, 0, 'No recipe errors');
});

test('T-097: exact UUID match retains UUID, method=exact', async () => {
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? { id: 'found' } : null;

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({ recipes: [] });

  const summary = await importer.importFromPackData(packData);

  assert.equal(summary.components.remapped.length, 1, 'One component remapped');
  const remap = summary.components.remapped[0];
  assert.equal(remap.method, 'exact', 'Method should be exact');
  assert.equal(remap.newUuid, 'Compendium.source.items.iron-ore', 'UUID should be retained');

  // System component should have unchanged originItemUuid
  const createdSystem = createdSystems[0];
  const comp = createdSystem.components[0];
  assert.equal(comp.originItemUuid, 'Compendium.source.items.iron-ore', 'originItemUuid unchanged on exact match');
});

test('exact match snapshots live img/description onto an SRD-backed component that omitted them', async () => {
  // Mirrors a pre-built premium system: the component references a foreign
  // (SRD) pack by UUID but ships no img/description; the live item supplies both.
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.dnd5e.items.Item.smiths'
    ? { img: 'icons/tools/smithing/hammer.webp', system: { description: { value: '<p>Smithing tools.</p>' } } }
    : null;

  const createdSystems = [];
  const extractCalls = [];
  const systemManager = {
    ...makeMockSystemManager({ createdSystems }),
    _extractSourceDescription: (source) => {
      extractCalls.push(source);
      // Plain string strip (no regex) keeps this mock free of the ReDoS hotspot
      // the analyzer flags on `<[^>]+>`; the fixture only carries <p> tags.
      return source?.system?.description?.value?.replaceAll('<p>', '').replaceAll('</p>', '') || '';
    }
  };
  const recipeManager = makeMockRecipeManager();

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({
    recipes: [],
    system: {
      id: 'test-system',
      name: 'Test System',
      components: [makeComponent({ id: 'smiths', name: "Smith's Tools", originItemUuid: 'Compendium.dnd5e.items.Item.smiths' })]
    }
  });

  await importer.importFromPackData(packData);

  const comp = createdSystems[0].components[0];
  assert.equal(comp.img, 'icons/tools/smithing/hammer.webp', 'img snapshotted from the live SRD item');
  assert.equal(comp.description, 'Smithing tools.', 'description snapshotted from the live SRD item');
  assert.equal(extractCalls.length, 1, 'description extraction reused the manager helper');

  globalThis.fromUuid = async () => null;
});

test('exact match preserves baked img and does not overwrite an authored description', async () => {
  // In-module (contentRef) component: build already baked art; live item must not clobber it.
  globalThis.fromUuid = async () => ({ img: 'icons/live/other.webp', system: { description: { value: 'live desc' } } });

  const createdSystems = [];
  const systemManager = {
    ...makeMockSystemManager({ createdSystems }),
    _extractSourceDescription: (source) => source?.system?.description?.value || ''
  };
  const recipeManager = makeMockRecipeManager();

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({
    recipes: [],
    system: {
      id: 'test-system',
      name: 'Test System',
      components: [makeComponent({ img: 'icons/baked/iron-ore.webp', description: 'authored copy' })]
    }
  });

  await importer.importFromPackData(packData);

  const comp = createdSystems[0].components[0];
  assert.equal(comp.img, 'icons/baked/iron-ore.webp', 'baked img preserved');
  assert.equal(comp.description, 'authored copy', 'authored description preserved');

  globalThis.fromUuid = async () => null;
});

test('T-097: source+name match remaps UUID, old UUID added to fallbacks', async () => {
  // fromUuid fails for the original UUID (stale)
  globalThis.fromUuid = async () => null;

  // Pack search finds a new item with matching source+name
  const mockPack = {
    documentName: 'Item',
    collection: 'world.items',
    getIndex: async () => [
      {
        _id: 'newIronOreId',
        name: 'Iron Ore',
        _stats: { compendiumSource: 'Compendium.source.items.iron-ore' }
      }
    ]
  };
  globalThis.game = { ...globalThis.game, packs: [mockPack] };

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({ recipes: [] });

  const summary = await importer.importFromPackData(packData);

  assert.equal(summary.components.remapped.length, 1, 'One component remapped');
  const remap = summary.components.remapped[0];
  assert.equal(remap.method, 'sourceName', 'Method should be sourceName');
  assert.equal(remap.newUuid, 'Compendium.world.items.newIronOreId', 'UUID should be remapped to new item');
  assert.equal(remap.oldUuid, 'Compendium.source.items.iron-ore', 'Old UUID recorded');

  // Old UUID should be in fallbacks
  const comp = createdSystems[0].components[0];
  assert.ok(comp.aliasItemUuids.includes('Compendium.source.items.iron-ore'),
    'Old UUID should be added to aliasItemUuids');

  // Reset
  globalThis.game = { ...globalThis.game, packs: [] };
  globalThis.fromUuid = async () => null;
});

test('T-097: unresolved component reported correctly', async () => {
  globalThis.fromUuid = async () => null;
  globalThis.game = { ...globalThis.game, packs: [] };

  const systemManager = makeMockSystemManager();
  const recipeManager = makeMockRecipeManager();

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({ recipes: [] });

  const summary = await importer.importFromPackData(packData);

  assert.equal(summary.components.unresolved.length, 1, 'One component unresolved');
  assert.equal(summary.components.unresolved[0].componentId, 'comp1');
  assert.equal(summary.components.unresolved[0].originItemUuid, 'Compendium.source.items.iron-ore');
});

test('T-097: fallback IDs retained on re-import when retainFallbackIds=true', async () => {
  globalThis.fromUuid = async () => null;
  globalThis.game = { ...globalThis.game, packs: [] };

  const existingSystem = {
    id: 'test-system',
    name: 'Test System',
    items: [
      {
        id: 'comp1',
        name: 'Iron Ore',
        registeredItemUuid: 'Compendium.source.items.iron-ore',
        aliasItemUuids: ['Item.existing-fallback-id']
      }
    ]
  };

  const createdSystems = [];
  const updatedSystems = [];
  const systemManager = makeMockSystemManager({
    systems: [existingSystem],
    createdSystems,
    updatedSystems
  });
  const recipeManager = makeMockRecipeManager();

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({ recipes: [] });

  // Re-import with overwriteExisting:true and retainFallbackIds:true
  const summary = await importer.importFromPackData(packData, {
    overwriteExisting: true,
    retainFallbackIds: true
  });

  assert.equal(summary.system.created, false, 'System should not be marked as created (it was overwritten)');
  assert.ok(updatedSystems.length > 0 || createdSystems.length > 0,
    'System should be created or updated');

  const updatedSystem = updatedSystems[0] || createdSystems[0];
  const comp = updatedSystem.components[0];
  assert.ok(comp.aliasItemUuids.includes('Item.existing-fallback-id'),
    'Existing fallback ID should be retained on re-import');
});

test('T-097: additional fallback IDs merged from options', async () => {
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? {} : null;
  globalThis.game = { ...globalThis.game, packs: [] };

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({ recipes: [] });

  await importer.importFromPackData(packData, {
    additionalFallbackIds: {
      'comp1': ['Item.manual-fallback-1', 'Item.manual-fallback-2']
    }
  });

  const comp = createdSystems[0].components[0];
  assert.ok(comp.aliasItemUuids.includes('Item.manual-fallback-1'),
    'Additional fallback 1 should be merged');
  assert.ok(comp.aliasItemUuids.includes('Item.manual-fallback-2'),
    'Additional fallback 2 should be merged');
});

test('T-097: overwriteExisting:false skips existing system', async () => {
  const existingSystem = { id: 'test-system', name: 'Test System', items: [] };
  const createdSystems = [];
  const systemManager = makeMockSystemManager({ systems: [existingSystem], createdSystems });
  const recipeManager = makeMockRecipeManager();

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData();

  const summary = await importer.importFromPackData(packData, { overwriteExisting: false });

  assert.equal(summary.system.skipped, true, 'System should be skipped');
  assert.equal(createdSystems.length, 0, 'No system should be created');
  assert.equal(summary.collisions.length, 1, 'One collision entry');
  assert.equal(summary.collisions[0].resolution, 'skipped');
});

test('T-097: __SYSTEM_ID__ placeholder replaced in all recipes', async () => {
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? {} : null;

  const createdRecipes = [];
  const systemManager = makeMockSystemManager();
  const recipeManager = makeMockRecipeManager({ createdRecipes });

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({
    recipes: [
      { id: 'r1', name: 'Recipe 1', craftingSystemId: '__SYSTEM_ID__', ingredientSets: [], resultGroups: [], enabled: true },
      { id: 'r2', name: 'Recipe 2', craftingSystemId: '__SYSTEM_ID__', ingredientSets: [], resultGroups: [], enabled: true }
    ]
  });

  await importer.importFromPackData(packData);

  assert.equal(createdRecipes.length, 2, 'Two recipes should be created');
  for (const r of createdRecipes) {
    assert.notEqual(r.craftingSystemId, '__SYSTEM_ID__',
      `Recipe "${r.name}" should not have __SYSTEM_ID__ placeholder`);
    assert.ok(r.craftingSystemId && r.craftingSystemId.length > 0,
      `Recipe "${r.name}" should have a real system ID`);
  }
});

test('T-097: existing recipe generates collision entry when skipped', async () => {
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? {} : null;

  const systemManager = makeMockSystemManager();
  const createdRecipes = [];
  const recipeManager = makeMockRecipeManager({
    existingRecipes: {
      'recipe1': { id: 'recipe1', name: 'Iron Bar' }
    },
    createdRecipes
  });

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({
    recipes: [
      { id: 'recipe1', name: 'Iron Bar', craftingSystemId: '__SYSTEM_ID__', ingredientSets: [], resultGroups: [], enabled: true }
    ]
  });

  const summary = await importer.importFromPackData(packData, { overwriteExisting: false });

  assert.equal(summary.recipes.skipped, 1, 'Recipe should be skipped');
  assert.equal(createdRecipes.length, 0, 'Recipe should not be created');
  const recipeCollision = summary.collisions.find(c => c.type === 'recipe');
  assert.ok(recipeCollision, 'Recipe collision should be reported');
  assert.equal(recipeCollision.resolution, 'skipped');
});

test('batch import suppresses per-recipe update notifications when overwriting recipes', async () => {
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? {} : null;

  const existingSystem = { id: 'test-system', name: 'Test System', components: [] };
  const updatedRecipeOptions = [];
  const systemManager = makeMockSystemManager({ systems: [existingSystem] });
  const recipeManager = makeMockRecipeManager({
    existingRecipes: {
      'recipe1': { id: 'recipe1', name: 'Iron Bar' }
    },
    updatedRecipeOptions
  });

  const importer = new CompendiumImporter(systemManager, recipeManager);
  const summary = await importer.importFromPackData(makePackData(), { overwriteExisting: true });

  assert.equal(summary.recipes.imported, 1);
  assert.deepEqual(updatedRecipeOptions, [{ notify: false, emitChange: false, persist: false }]);
  assert.equal(
    summary.collisions.some(c => c.type === 'recipe' && c.resolution === 'overwritten'),
    true
  );
});

test('import rejects gathering task drops with unknown component ids before persisting the system', async () => {
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? { documentName: 'Item' } : null;

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({
    recipes: [],
    system: {
      ...makePackData({ recipes: [] }).system,
      gatheringConfig: {
        systems: {
          'test-system': {
            tasks: [{
              id: 'task-ore',
              name: 'Mine Ore',
              dropRows: [{ id: 'drop-stale', name: 'Missing Reward', componentId: 'missing-component', quantity: 1, dropRate: 50 }]
            }]
          }
        }
      }
    }
  });

  await assert.rejects(
    () => importer.importFromPackData(packData),
    /unknown componentId "missing-component"/
  );
  assert.equal(createdSystems.length, 0);
});

test('import rejects gathering task drops with unresolved item UUIDs', async () => {
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? { documentName: 'Item' } : null;

  const systemManager = makeMockSystemManager();
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({
    recipes: [],
    system: {
      ...makePackData({ recipes: [] }).system,
      gatheringConfig: {
        systems: {
          'test-system': {
            tasks: [{
              id: 'task-ore',
              name: 'Mine Ore',
              dropRows: [{ id: 'drop-item', name: 'Lost Reward', itemUuid: 'Item.missing', quantity: 1, dropRate: 50 }]
            }]
          }
        }
      }
    }
  });

  await assert.rejects(
    () => importer.importFromPackData(packData),
    /itemUuid "Item\.missing" does not resolve to an Item/
  );
});

test('import accepts gathering task drops with valid component or item UUID targets', async () => {
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Compendium.source.items.iron-ore') return { documentName: 'Item' };
    if (uuid === 'Item.reward') return { documentName: 'Item' };
    return null;
  };

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({
    recipes: [],
    system: {
      ...makePackData({ recipes: [] }).system,
      gatheringConfig: {
        systems: {
          'test-system': {
            tasks: [{
              id: 'task-ore',
              name: 'Mine Ore',
              dropRows: [
                { id: 'drop-component', name: 'Ore', componentId: 'comp1', quantity: 1, dropRate: 50 },
                { id: 'drop-item', name: 'Reward', itemUuid: 'Item.reward', quantity: 1, dropRate: 25 }
              ]
            }]
          }
        }
      }
    }
  });

  await importer.importFromPackData(packData);
  assert.equal(createdSystems.length, 1);
});

test('T-097: invalid pack data (missing system) throws error', async () => {
  const systemManager = makeMockSystemManager();
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager);

  await assert.rejects(
    () => importer.importFromPackData({ recipes: [] }),
    (err) => {
      assert.ok(err.message.includes('system'), 'Error should mention "system"');
      return true;
    }
  );
});

test('T-097: null pack data throws error', async () => {
  const systemManager = makeMockSystemManager();
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager);

  await assert.rejects(
    () => importer.importFromPackData(null),
    (err) => {
      assert.ok(err.message.includes('Invalid pack data'), 'Error should mention invalid pack data');
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// #492 — gathering authoring import (F1 replace-by-system-id, F3 GM gate, refs)
// ---------------------------------------------------------------------------

// Minimal env-store double: persists whatever the importer's replace-by-system-id
// merge writes (the merge logic lives in the importer, not the store).
function makeEnvStoreDouble(initial = []) {
  let envs = structuredClone(initial);
  return {
    list: () => structuredClone(envs),
    save: async (next) => {
      envs = structuredClone(next);
      return structuredClone(envs);
    },
    _all: () => envs,
  };
}

function makeSettingsDouble(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getSetting: (key) => map.get(key),
    setSetting: async (key, value) => {
      map.set(key, structuredClone(value));
    },
    _map: map,
  };
}

test('#492 F1: importing system B keeps system A environments; overwrite does not duplicate B', async () => {
  globalThis.fromUuid = async () => null;
  globalThis.game = { ...globalThis.game, packs: [], user: { isGM: true } };

  const envA = { id: 'env-a', craftingSystemId: 'system-A', name: 'A Env', enabled: false };
  const store = makeEnvStoreDouble([envA]);
  const settings = makeSettingsDouble();

  const systemManager = makeMockSystemManager();
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager, {
    environmentStore: store,
    getSetting: settings.getSetting,
    setSetting: settings.setSetting,
    isGM: () => true,
  });

  const packData = makePackData({
    recipes: [],
    gatheringEnvironments: [{ id: 'env-b', craftingSystemId: '__SYSTEM_ID__', name: 'B Env', enabled: false }],
  });

  await importer.importFromPackData(packData);

  let all = store._all();
  assert.ok(all.some((e) => e.id === 'env-a'), 'system A environment survives');
  assert.ok(all.some((e) => e.id === 'env-b'), 'system B environment added');
  assert.equal(all.length, 2, 'no accumulation on first import');

  // Overwrite re-import of B must not duplicate/accumulate stale B environments.
  await importer.importFromPackData(packData, { overwriteExisting: true });
  all = store._all();
  assert.equal(all.filter((e) => e.id === 'env-b').length, 1, 'B not duplicated on re-import');
  assert.ok(all.some((e) => e.id === 'env-a'), 'A still present after overwrite');
  assert.equal(all.length, 2, 'still exactly two environments');
});

test('#492 F3: a non-GM import fails fast before any world-scope write', async () => {
  globalThis.fromUuid = async () => null;

  const createdSystems = [];
  const store = makeEnvStoreDouble([]);
  const settings = makeSettingsDouble();
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager, {
    environmentStore: store,
    getSetting: settings.getSetting,
    setSetting: settings.setSetting,
    isGM: () => false,
  });

  await assert.rejects(() => importer.importFromPackData(makePackData()), /Only a GM can import/);
  assert.equal(createdSystems.length, 0, 'no system created');
  assert.equal(store._all().length, 0, 'no environments written');
  assert.equal(settings._map.size, 0, 'no gatheringConfig written');
});

test('#492: unresolved component source items fold into unresolvedReferences', async () => {
  globalThis.fromUuid = async () => null; // source item absent
  globalThis.game = { ...globalThis.game, packs: [], user: { isGM: true } };

  const systemManager = makeMockSystemManager();
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager, { isGM: () => true });

  const summary = await importer.importFromPackData(makePackData({ recipes: [] }));

  const sourceItemRefs = summary.unresolvedReferences.filter((r) => r.kind === 'sourceItem');
  assert.equal(sourceItemRefs.length, 1);
  assert.equal(sourceItemRefs[0].disposition, 'reported');
  assert.equal(sourceItemRefs[0].referenceValue, 'Compendium.source.items.iron-ore');
});

// ---------------------------------------------------------------------------
// #700 — component source-reference field upcast (pre-1.16.0 legacy names)
// ---------------------------------------------------------------------------

// A component carrying ONLY the pre-1.16.0 field names, mirroring an export
// produced before issue 560's rename.
function makeLegacyComponent(overrides = {}) {
  return {
    id: 'legacy-comp',
    name: 'Iron Ore',
    sourceItemUuid: 'Compendium.source.items.iron-ore',
    sourceUuid: 'Compendium.source.items.iron-ore',
    fallbackItemIds: ['Item.legacy-alias-1', 'Item.legacy-alias-2'],
    ...overrides
  };
}

test('#700: a legacy-named component upcasts alias uuids and takes the resolution path', async () => {
  // Source item resolves exactly, so the component is remapped (method=exact) —
  // proving the legacy component reached resolution rather than the id-less exit.
  globalThis.fromUuid = async (uuid) => uuid === 'Compendium.source.items.iron-ore' ? { id: 'found' } : null;
  globalThis.game = { ...globalThis.game, packs: [], user: { isGM: true } };

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager, { isGM: () => true });

  const summary = await importer.importFromPackData(makePackData({
    recipes: [],
    system: { id: 'test-system', name: 'Test System', components: [makeLegacyComponent()] }
  }));

  const comp = createdSystems[0].components[0];
  // Legacy fallbackItemIds became aliasItemUuids, and fallbackItemIds is gone.
  assert.deepEqual(comp.aliasItemUuids, ['Item.legacy-alias-1', 'Item.legacy-alias-2'],
    'aliasItemUuids populated from the legacy fallbackItemIds');
  assert.ok(!('fallbackItemIds' in comp), 'legacy fallbackItemIds is not persisted (shadowing bug fixed)');
  assert.ok(!('sourceItemUuid' in comp), 'legacy sourceItemUuid renamed away');
  assert.ok(!('sourceUuid' in comp), 'legacy sourceUuid renamed away');

  // Resolution + classification ran: the component is counted and reported.
  assert.equal(summary.components.remapped.length, 1, 'legacy component counted in remapped');
  assert.equal(summary.components.remapped[0].method, 'exact');
  assert.equal(summary.components.remapped[0].componentId, 'legacy-comp');
});

test('#700: an unresolvable legacy source ref yields a SOURCE_ITEM unresolvedReferences entry', async () => {
  globalThis.fromUuid = async () => null; // source item absent
  globalThis.game = { ...globalThis.game, packs: [], user: { isGM: true } };

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager, { isGM: () => true });

  const summary = await importer.importFromPackData(makePackData({
    recipes: [],
    system: { id: 'test-system', name: 'Test System', components: [makeLegacyComponent()] }
  }));

  // The legacy component is classified as unresolved (not silently omitted).
  assert.equal(summary.components.unresolved.length, 1, 'legacy component classified as unresolved');
  assert.equal(summary.components.unresolved[0].componentId, 'legacy-comp');
  assert.equal(summary.components.unresolved[0].originItemUuid, 'Compendium.source.items.iron-ore');

  // And it surfaces in the unified reference report as a SOURCE_ITEM entry.
  const sourceItemRefs = summary.unresolvedReferences.filter((r) => r.kind === 'sourceItem');
  assert.equal(sourceItemRefs.length, 1);
  assert.equal(sourceItemRefs[0].disposition, 'reported');
  assert.equal(sourceItemRefs[0].referenceValue, 'Compendium.source.items.iron-ore');

  // The alias uuids survived onto the persisted component (retained, not dropped).
  const comp = createdSystems[0].components[0];
  assert.deepEqual(comp.aliasItemUuids, ['Item.legacy-alias-1', 'Item.legacy-alias-2']);
  assert.ok(!('fallbackItemIds' in comp));
});

test('#700: new names win when both legacy and renamed source fields are present', async () => {
  globalThis.fromUuid = async () => null;
  globalThis.game = { ...globalThis.game, packs: [], user: { isGM: true } };

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager, { isGM: () => true });

  await importer.importFromPackData(makePackData({
    recipes: [],
    system: {
      id: 'test-system',
      name: 'Test System',
      components: [makeLegacyComponent({
        // Post-rename fields also present — they must win, legacy discarded.
        originItemUuid: 'Compendium.new.items.iron-ore',
        registeredItemUuid: 'Compendium.new.items.iron-ore',
        aliasItemUuids: ['Item.new-alias']
      })]
    }
  }));

  const comp = createdSystems[0].components[0];
  assert.equal(comp.originItemUuid, 'Compendium.new.items.iron-ore', 'new originItemUuid wins');
  assert.equal(comp.registeredItemUuid, 'Compendium.new.items.iron-ore', 'new registeredItemUuid wins');
  assert.deepEqual(comp.aliasItemUuids, ['Item.new-alias'],
    'new aliasItemUuids wins, legacy fallbackItemIds discarded');
  assert.ok(!('fallbackItemIds' in comp));
  assert.ok(!('sourceItemUuid' in comp));
  assert.ok(!('sourceUuid' in comp));
});

// ---------------------------------------------------------------------------
// #776 — batched import persistence + progress feedback
// ---------------------------------------------------------------------------

function resetGame(overrides = {}) {
  globalThis.game = { packs: [], fabricate: null, user: { isGM: true }, ...overrides };
}

function makeImportRecipe(id, overrides = {}) {
  return {
    id,
    name: overrides.name || id.toUpperCase(),
    craftingSystemId: '__SYSTEM_ID__',
    ingredientSets: [],
    resultGroups: [],
    enabled: true,
    ...overrides
  };
}

test('#776: batched import flushes exactly one recipeManager.save() for a multi-recipe import', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const saveCalls = [];
  const createdRecipeOptions = [];
  const systemManager = makeMockSystemManager({});
  const recipeManager = makeMockRecipeManager({ saveCalls, createdRecipeOptions });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(
    makePackData({ recipes: [makeImportRecipe('r1'), makeImportRecipe('r2'), makeImportRecipe('r3')] })
  );

  assert.equal(summary.recipes.imported, 3, 'all three recipes imported');
  assert.equal(saveCalls.length, 1, 'exactly one batched save for the whole recipe phase');
  assert.equal(createdRecipeOptions.length, 3);
  for (const options of createdRecipeOptions) {
    assert.equal(options.persist, false, 'each per-recipe create defers persistence to the batch save');
  }
});

test('#776: an all-skipped / empty recipe phase writes nothing (no batch save)', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const saveCalls = [];
  const systemManager = makeMockSystemManager({});
  const recipeManager = makeMockRecipeManager({ saveCalls });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  await importer.importFromPackData(makePackData({ recipes: [] }));

  assert.equal(saveCalls.length, 0, 'zero recipes persisted means zero writes, matching the unbatched behaviour');
});

test('#776: composite overwrite=true fixture preserves counts and ordered collisions', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  // overwriteExisting is a run-global flag, so a single run cannot mix skip and
  // overwrite outcomes; this fixture pins the overwrite branch (new + overwrite +
  // validation-error recipe) with an existing system so the system collision is
  // emitted BEFORE the recipe collision.
  const existingSystem = { id: 'test-system', name: 'Test System', components: [] };
  const updatedSystems = [];
  const saveCalls = [];
  const systemManager = makeMockSystemManager({ systems: [existingSystem], updatedSystems });
  const recipeManager = makeMockRecipeManager({
    saveCalls,
    existingRecipes: { 'r-exist': { id: 'r-exist', name: 'Existing Recipe' } },
    throwOnRecipeIds: ['r-bad']
  });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(
    makePackData({
      recipes: [
        makeImportRecipe('r-new', { name: 'New Recipe' }),
        makeImportRecipe('r-exist', { name: 'Existing Recipe' }),
        makeImportRecipe('r-bad', { name: 'Broken Recipe' })
      ]
    }),
    { overwriteExisting: true }
  );

  assert.equal(summary.recipes.imported, 2, 'new create + existing overwrite counted as imported');
  assert.equal(summary.recipes.skipped, 0);
  assert.equal(summary.recipes.errors.length, 1, 'the validation-error recipe is isolated into errors[]');
  assert.equal(summary.recipes.errors[0].recipeId, 'r-bad');
  assert.deepEqual(summary.collisions, [
    { type: 'system', id: 'test-system', name: 'Test System', resolution: 'overwritten' },
    { type: 'recipe', id: 'r-exist', name: 'Existing Recipe', resolution: 'overwritten' }
  ]);
  assert.equal(saveCalls.length, 1, 'the batch still flushes once');
});

test('#776: composite overwrite=false fixture skips the existing recipe and reports the collision', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  // Mutually exclusive with the overwrite=true fixture above: overwriteExisting is a
  // single run-global flag. A NEW system is used so the run reaches Phase 4 rather
  // than the existing-system early-skip return.
  const saveCalls = [];
  const systemManager = makeMockSystemManager({});
  const recipeManager = makeMockRecipeManager({
    saveCalls,
    existingRecipes: { 'r-exist': { id: 'r-exist', name: 'Existing Recipe' } }
  });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(
    makePackData({
      recipes: [makeImportRecipe('r-new', { name: 'New Recipe' }), makeImportRecipe('r-exist', { name: 'Existing Recipe' })]
    }),
    { overwriteExisting: false }
  );

  assert.equal(summary.recipes.imported, 1, 'only the new recipe imports');
  assert.equal(summary.recipes.skipped, 1, 'the existing recipe is skipped');
  assert.deepEqual(
    summary.collisions.filter((c) => c.type === 'recipe'),
    [{ type: 'recipe', id: 'r-exist', name: 'Existing Recipe', resolution: 'skipped' }]
  );
  assert.equal(saveCalls.length, 1, 'the one new recipe is persisted by the single batch save');
});

test('#776: a mid-loop recipe throw still yields exactly one save and isolates the failure', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const saveCalls = [];
  const systemManager = makeMockSystemManager({});
  const recipeManager = makeMockRecipeManager({ saveCalls, throwOnRecipeIds: ['r-bad'] });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(
    makePackData({
      recipes: [makeImportRecipe('r-ok1'), makeImportRecipe('r-bad'), makeImportRecipe('r-ok2')]
    })
  );

  assert.equal(summary.recipes.imported, 2, 'both flanking successes are imported');
  assert.deepEqual(
    summary.recipes.errors.map((e) => e.recipeId),
    ['r-bad'],
    'only the throwing recipe lands in errors[]'
  );
  assert.equal(saveCalls.length, 1, 'the loop always reaches the single batch save despite the mid-loop throw');
});

test('#776: the per-run pack lookup is method-local and re-derived on a second import (no stale cache)', async () => {
  let getIndexCalls = 0;
  const pack = {
    documentName: 'Item',
    collection: 'world.items',
    getIndex: async () => {
      getIndexCalls += 1;
      return []; // no matching entry: component stays unresolved, exercising the scan path
    }
  };
  resetGame({ packs: [pack] });
  globalThis.fromUuid = async () => null; // exact miss: source+name search runs

  const systemManager = makeMockSystemManager({});
  const recipeManager = makeMockRecipeManager({});
  const importer = new CompendiumImporter(systemManager, recipeManager);

  await importer.importFromPackData(makePackData({ recipes: [] }));
  assert.equal(getIndexCalls, 1, 'run 1 builds the pack lookup once');

  await importer.importFromPackData(makePackData({ recipes: [] }));
  assert.equal(getIndexCalls, 2, 'run 2 re-invokes getIndex, so the lookup did not leak across runs');
});

test('#776: the pack lookup resolves a source+name match with a single getIndex per pack', async () => {
  let getIndexCalls = 0;
  const pack = {
    documentName: 'Item',
    collection: 'world.items',
    getIndex: async () => {
      getIndexCalls += 1;
      return [
        { _id: 'abc', name: 'Iron Ore', _stats: { compendiumSource: 'Compendium.source.items.iron-ore' } }
      ];
    }
  };
  resetGame({ packs: [pack] });
  globalThis.fromUuid = async () => null;

  const createdSystems = [];
  const systemManager = makeMockSystemManager({ createdSystems });
  const recipeManager = makeMockRecipeManager({});
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(
    makePackData({
      recipes: [],
      system: {
        id: 'test-system',
        name: 'Test System',
        components: [makeComponent(), makeComponent({ id: 'comp2', name: 'Iron Ore' })]
      }
    })
  );

  assert.equal(getIndexCalls, 1, 'the pack index is built once and reused across both components');
  assert.equal(summary.components.remapped.length, 2, 'both components resolved via the source+name lookup');
  for (const remap of summary.components.remapped) {
    assert.equal(remap.method, 'sourceName');
    assert.equal(remap.newUuid, 'Compendium.world.items.abc');
  }
});

test('#776: default progress reporter degrades safely for stub / undefined / throwing handles', () => {
  const savedUi = globalThis.ui;
  try {
    // 1. info returns undefined (the existing test-stub shape).
    globalThis.ui = { notifications: { info: () => undefined } };
    const r1 = createDefaultProgressReporter();
    assert.doesNotThrow(() => {
      r1({ pct: 0, message: 'start' });
      r1({ pct: 0.5 });
      r1({ pct: 1, message: 'done' });
    });

    // 2. handle present but without .update.
    globalThis.ui = { notifications: { info: () => ({}) } };
    const r2 = createDefaultProgressReporter();
    assert.doesNotThrow(() => {
      r2({ pct: 0 });
      r2({ pct: 1 });
    });

    // 3. handle.update throws (queued-before-render): degrade silently.
    globalThis.ui = {
      notifications: {
        info: () => ({
          update: () => {
            throw new Error('not yet rendered');
          }
        })
      }
    };
    const r3 = createDefaultProgressReporter();
    assert.doesNotThrow(() => {
      r3({ pct: 0 });
      r3({ pct: 1 });
    });

    // 4. no notifications surface at all.
    globalThis.ui = {};
    const r4 = createDefaultProgressReporter();
    assert.doesNotThrow(() => r4({ pct: 1 }));
  } finally {
    globalThis.ui = savedUi;
  }
});

test('#776: default progress reporter opens one toast and drives it to pct:1', () => {
  const savedUi = globalThis.ui;
  try {
    const infoCalls = [];
    const updates = [];
    const handle = { update: (u) => updates.push(u) };
    globalThis.ui = {
      notifications: {
        info: (msg, opts) => {
          infoCalls.push({ msg, opts });
          return handle;
        }
      }
    };

    const report = createDefaultProgressReporter();
    report({ pct: 0, message: 'a' });
    report({ pct: 2, message: 'b' }); // out-of-range pct is clamped
    report({ pct: 1, message: 'c' });

    assert.equal(infoCalls.length, 1, 'exactly one progress toast is opened');
    assert.deepEqual(
      infoCalls[0].opts,
      { progress: true, console: false },
      'opens as a progress toast with console logging suppressed (native scene-loader parity)'
    );
    assert.equal(
      infoCalls[0].opts.console,
      false,
      'console: false is passed to suppress per-tick logging'
    );
    assert.equal(updates.length, 3);
    assert.equal(updates[1].pct, 1, 'pct above 1 is clamped to 1');
    assert.equal(updates.at(-1).pct, 1, 'completion drives the bar to pct:1');
  } finally {
    globalThis.ui = savedUi;
  }
});

test('#776: import emits progress at phase boundaries, ticks through recipes, and completes at pct:1', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const updates = [];
  const saveCalls = [];
  const systemManager = makeMockSystemManager({});
  const recipeManager = makeMockRecipeManager({ saveCalls });
  const importer = new CompendiumImporter(systemManager, recipeManager, {
    reportProgress: (u) => updates.push(u)
  });

  const recipes = Array.from({ length: 12 }, (_, i) => makeImportRecipe(`r${i}`));
  await importer.importFromPackData(makePackData({ recipes }));

  assert.ok(updates.length >= 3, 'multiple progress emissions across the run');
  assert.equal(updates[0].pct, 0, 'the first emission starts at pct:0');
  assert.equal(updates.at(-1).pct, 1, 'the final emission completes at pct:1');
  assert.ok(
    updates.every((u) => u.pct >= 0 && u.pct <= 1),
    'every emitted pct stays within [0, 1]'
  );
  assert.ok(
    updates.some((u) => u.phase === 'recipes' && /Importing recipes/.test(u.message)),
    'the recipe phase emits at least one interim tick'
  );
  assert.equal(saveCalls.length, 1, 'the recipe batch is flushed once');
});

// ---------------------------------------------------------------------------
// #794 — terminal progress-indicator state on the throw path (default reporter)
// ---------------------------------------------------------------------------

// A crafting-system manager whose createSystem rejects with a caller-supplied error
// instance, so the throw-path tests can assert the ORIGINAL error propagates unchanged.
function makeRejectingSystemManager(bootError) {
  return {
    getSystems: () => [],
    createSystem: async () => {
      throw bootError;
    },
    updateSystem: async () => {
      throw new Error('updateSystem should not run on a fresh-system import');
    }
  };
}

test('#794: a throw after the pct:0 start emit dismisses the toast and re-throws the original error unchanged', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const savedUi = globalThis.ui;
  const removeCalls = [];
  const handle = {
    update: () => {},
    remove: () => {
      removeCalls.push(Date.now());
    }
  };
  globalThis.ui = { notifications: { info: () => handle, warn() {}, error() {} } };

  try {
    const bootError = new Error('createSystem exploded');
    const systemManager = makeRejectingSystemManager(bootError);
    const recipeManager = makeMockRecipeManager({});
    // No reportProgress seam injected: the DEFAULT reporter owns the toast lifecycle,
    // so this exercises the reporter-owned dismiss() the fix adds.
    const importer = new CompendiumImporter(systemManager, recipeManager);

    let caught;
    try {
      await importer.importFromPackData(makePackData({ recipes: [] }));
    } catch (err) {
      caught = err;
    }

    // Both effects proven on one run: the toast is dismissed AND the original error
    // instance propagates. Asserting only rejection would survive removing the fix.
    assert.equal(removeCalls.length, 1, 'the still-open progress toast was dismissed exactly once on the throw path');
    assert.equal(caught, bootError, 'the ORIGINAL error instance propagates unchanged (not wrapped)');
  } finally {
    globalThis.ui = savedUi;
  }
});

test('#794: a removal throw during dismissal does not mask the original import error', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const savedUi = globalThis.ui;
  globalThis.ui = {
    notifications: {
      info: () => ({
        update: () => {},
        remove: () => {
          throw new Error('remove blew up');
        }
      }),
      warn() {},
      error() {}
    }
  };

  try {
    const bootError = new Error('createSystem exploded');
    const systemManager = makeRejectingSystemManager(bootError);
    const recipeManager = makeMockRecipeManager({});
    const importer = new CompendiumImporter(systemManager, recipeManager);

    let caught;
    try {
      await importer.importFromPackData(makePackData({ recipes: [] }));
    } catch (err) {
      caught = err;
    }

    // The guard absorbs the teardown throw so the real import failure — not the
    // removal error — is what the caller sees.
    assert.equal(
      caught,
      bootError,
      'the original import error survives a throwing toast teardown (removal error absorbed)'
    );
  } finally {
    globalThis.ui = savedUi;
  }
});

test('#794: reporter dismiss() is a no-op on the completed (pct:1) path and when never started', () => {
  const savedUi = globalThis.ui;
  try {
    const removeCalls = [];
    const handle = {
      update: () => {},
      remove: () => {
        removeCalls.push(1);
      }
    };
    globalThis.ui = { notifications: { info: () => handle } };

    // Completed path: driven to pct:1, so the toast scheduled its own self-remove and
    // dismiss() stands down (no explicit removal, no double-remove race).
    const completedReporter = createDefaultProgressReporter();
    completedReporter({ pct: 0, message: 'start' });
    completedReporter({ pct: 1, message: 'done' });
    completedReporter.dismiss();
    completedReporter.dismiss();
    assert.equal(removeCalls.length, 0, 'no explicit remove after the toast reached pct:1');

    // Never-started path: dismiss() before any emit opens/removes nothing.
    const idleReporter = createDefaultProgressReporter();
    idleReporter.dismiss();
    assert.equal(removeCalls.length, 0, 'dismiss() before any progress emit opens/removes nothing');
  } finally {
    globalThis.ui = savedUi;
  }
});

test('#794: reporter dismiss() removes an incomplete toast exactly once across repeated calls', () => {
  const savedUi = globalThis.ui;
  try {
    const removeCalls = [];
    const handle = {
      update: () => {},
      remove: () => {
        removeCalls.push(1);
      }
    };
    globalThis.ui = { notifications: { info: () => handle } };

    const reporter = createDefaultProgressReporter();
    reporter({ pct: 0, message: 'start' });
    reporter({ pct: 0.3 }); // never reached pct:1 — the toast is still open
    reporter.dismiss();
    reporter.dismiss();
    reporter.dismiss();
    assert.equal(removeCalls.length, 1, 'an incomplete toast is removed once; dismiss() is idempotent');
  } finally {
    globalThis.ui = savedUi;
  }
});

test('#794: reporter dismiss() degrades safely for undefined / remove-less / throwing handles', () => {
  const savedUi = globalThis.ui;
  try {
    // 1. info returns undefined: started, but there is no handle to remove.
    globalThis.ui = { notifications: { info: () => undefined } };
    const r1 = createDefaultProgressReporter();
    r1({ pct: 0 }); // start, still incomplete
    assert.doesNotThrow(() => r1.dismiss());

    // 2. handle present but without a remove method.
    globalThis.ui = { notifications: { info: () => ({ update: () => {} }) } };
    const r2 = createDefaultProgressReporter();
    r2({ pct: 0 });
    assert.doesNotThrow(() => r2.dismiss());

    // 3. handle.remove throws (teardown on an un-rendered / queued toast).
    globalThis.ui = {
      notifications: {
        info: () => ({
          update: () => {},
          remove: () => {
            throw new Error('not yet rendered');
          }
        })
      }
    };
    const r3 = createDefaultProgressReporter();
    r3({ pct: 0 });
    assert.doesNotThrow(() => r3.dismiss());

    // 4. no notifications surface at all.
    globalThis.ui = {};
    const r4 = createDefaultProgressReporter();
    assert.doesNotThrow(() => r4.dismiss());
  } finally {
    globalThis.ui = savedUi;
  }
});

test('#776: the default progress reporter opens a FRESH toast on each run of a reused importer', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const savedUi = globalThis.ui;
  const infoCalls = [];
  globalThis.ui = {
    notifications: {
      info: (...args) => {
        infoCalls.push(args);
        return undefined; // stub handle: exercises the undefined-handle guard too
      },
      warn() {},
      error() {}
    }
  };

  try {
    const systemManager = makeMockSystemManager({});
    const recipeManager = makeMockRecipeManager({});
    // No reportProgress seam injected: the stateful default reporter path is exercised.
    const importer = new CompendiumImporter(systemManager, recipeManager);

    await importer.importFromPackData(makePackData({ recipes: [makeImportRecipe('r1')] }));
    const afterRun1 = infoCalls.length;
    assert.ok(afterRun1 >= 1, 'run 1 opens a progress toast via ui.notifications.info');

    // A per-INSTANCE default reporter would already be `started` here and update the
    // (dismissed) run-1 toast without opening a new one, leaving zero new info() calls.
    await importer.importFromPackData(makePackData({ recipes: [makeImportRecipe('r2')] }));
    assert.ok(
      infoCalls.length > afterRun1,
      'run 2 opens a fresh progress toast on the reused importer (per-run reporter)'
    );
  } finally {
    globalThis.ui = savedUi;
  }
});

test('#776: a nonzero run where every recipe is skipped writes nothing (imported=0 gate)', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  // A NEW system (so the run reaches Phase 4) but both recipes already exist and
  // overwriteExisting is false — every recipe is skipped, so imported stays 0 and the
  // `imported > 0` gate must suppress the batch save exactly as the unbatched path did.
  const saveCalls = [];
  const systemManager = makeMockSystemManager({});
  const recipeManager = makeMockRecipeManager({
    saveCalls,
    existingRecipes: {
      'r-a': { id: 'r-a', name: 'A' },
      'r-b': { id: 'r-b', name: 'B' }
    }
  });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(
    makePackData({ recipes: [makeImportRecipe('r-a'), makeImportRecipe('r-b')] }),
    { overwriteExisting: false }
  );

  assert.equal(summary.recipes.imported, 0, 'no recipe imported');
  assert.equal(summary.recipes.skipped, 2, 'both recipes skipped');
  assert.equal(saveCalls.length, 0, 'an all-skipped nonzero run issues no batch save');
});

// ---------------------------------------------------------------------------
// #775 — provenance-aware pruning of recipes removed from import payloads
// ---------------------------------------------------------------------------

const PRUNE_DELETE_OPTIONS = { notify: false, emitChange: false, persist: false, cleanupFlags: false };

// Shared overwrite scenario builder so the per-test setup does not repeat the
// existing-system + stateful-manager wiring (keeps new-code duplication down).
function makeOverwriteScenario({ systemId = 'test-system', persistedRecipes = [], payloadRecipeIds = [], throwOnRecipeIds = [] } = {}) {
  const existingSystem = { id: systemId, name: 'Test System', components: [] };
  const recorders = {
    createdRecipes: [],
    updatedRecipes: [],
    deletedRecipeIds: [],
    deleteRecipeOptions: [],
    getRecipesCalls: [],
    notifyDetails: [],
    saveCalls: [],
    cleanupCalls: []
  };
  const systemManager = makeMockSystemManager({ systems: [existingSystem] });
  const recipeManager = makeMockRecipeManager({ persistedRecipes, throwOnRecipeIds, ...recorders });
  const importer = new CompendiumImporter(systemManager, recipeManager);
  const packData = makePackData({
    system: { id: systemId, name: 'Test System', components: [] },
    recipes: payloadRecipeIds.map((id) => makeImportRecipe(id))
  });
  return { importer, packData, recipeManager, recorders, systemId };
}

test('#775 Q1: unprovenanced and foreign-provenance orphans are reported, never deleted', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const systemId = 'test-system';
  const { importer, packData, recipeManager, recorders } = makeOverwriteScenario({
    systemId,
    persistedRecipes: [
      { id: 'gm-authored', name: 'GM Authored', craftingSystemId: systemId, importSource: null },
      { id: 'from-other-pack', name: 'Other Pack', craftingSystemId: systemId, importSource: { systemId: 'other-pack', importedAt: 5 } }
    ],
    payloadRecipeIds: [] // the payload ships nothing: both persisted recipes are orphan candidates
  });

  const summary = await importer.importFromPackData(packData, { overwriteExisting: true });

  assert.equal(summary.recipes.pruned, 0, 'neither orphan is auto-pruned');
  assert.equal(recorders.deletedRecipeIds.length, 0, 'deleteRecipe is never called');
  assert.deepEqual(
    summary.orphans.sort((a, b) => a.recipeId.localeCompare(b.recipeId)),
    [
      { recipeId: 'from-other-pack', recipeName: 'Other Pack', disposition: 'reported', reason: 'foreignProvenance' },
      { recipeId: 'gm-authored', recipeName: 'GM Authored', disposition: 'reported', reason: 'unprovenanced' }
    ]
  );
  // Non-deletion asserted directly: both remain enumerable.
  const remainingIds = recipeManager.getRecipes({ craftingSystemId: systemId }).map((r) => r.id).sort();
  assert.deepEqual(remainingIds, ['from-other-pack', 'gm-authored']);
});

test('#775 Q2: pruning is idempotent — a second identical reinstall prunes nothing more', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const systemId = 'test-system';
  const { importer, packData, recipeManager, recorders } = makeOverwriteScenario({
    systemId,
    persistedRecipes: [
      { id: 'keep', name: 'Keep', craftingSystemId: systemId, importSource: { systemId, importedAt: 1 } },
      { id: 'drop', name: 'Drop', craftingSystemId: systemId, importSource: { systemId, importedAt: 1 } }
    ],
    payloadRecipeIds: ['keep'] // 'drop' is a provenance-matched orphan on the first run
  });

  const first = await importer.importFromPackData(packData, { overwriteExisting: true });
  assert.equal(first.recipes.pruned, 1, 'the provenance-matched dropped recipe is pruned once');
  assert.deepEqual(first.orphans, [
    { recipeId: 'drop', recipeName: 'Drop', disposition: 'pruned', reason: 'provenanceMatched' }
  ]);
  assert.deepEqual(recorders.deletedRecipeIds, ['drop']);
  // F1 guard: the prune delete uses the batch-fold option shape.
  assert.deepEqual(recorders.deleteRecipeOptions, [PRUNE_DELETE_OPTIONS]);
  assert.equal(recipeManager.getRecipe('drop'), null, 'the pruned recipe is gone from the map');
  assert.ok(recipeManager.getRecipe('keep'), 'the payload-present provenance-matched recipe survives');

  const second = await importer.importFromPackData(packData, { overwriteExisting: true });
  assert.equal(second.recipes.pruned, 0, 're-running the identical payload prunes nothing more');
  assert.deepEqual(second.orphans, [], 'no orphan candidates remain');
  assert.deepEqual(recorders.deletedRecipeIds, ['drop'], 'no further deleteRecipe calls');
});

test('#775 Q4: a payload recipe whose overwrite throws is never pruned (absent-set is ALL payload ids)', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const systemId = 'test-system';
  const { importer, packData, recipeManager, recorders } = makeOverwriteScenario({
    systemId,
    // Provenance-MATCHED so it would be pruned if the absent-set were (wrongly) derived
    // from the imported ids instead of ALL payload ids.
    persistedRecipes: [
      { id: 'r-throwme', name: 'Throws', craftingSystemId: systemId, importSource: { systemId, importedAt: 1 } }
    ],
    payloadRecipeIds: ['r-throwme'],
    throwOnRecipeIds: ['r-throwme']
  });

  const summary = await importer.importFromPackData(packData, { overwriteExisting: true });

  assert.equal(summary.recipes.errors.length, 1, 'the overwrite failure is isolated into errors[]');
  assert.equal(summary.recipes.errors[0].recipeId, 'r-throwme');
  assert.equal(summary.recipes.pruned, 0, 'the throwing-but-shipped recipe is not pruned');
  assert.deepEqual(summary.orphans, [], 'it is not an orphan candidate at all');
  assert.equal(recorders.deletedRecipeIds.length, 0, 'deleteRecipe is never called for it');
  assert.ok(recipeManager.getRecipe('r-throwme'), 'it remains persisted');
});

test('#775 Q6: the importer re-stamps a stale/foreign inbound importSource to the pack id', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const createdRecipes = [];
  const systemManager = makeMockSystemManager({});
  const recipeManager = makeMockRecipeManager({ createdRecipes });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(
    makePackData({
      recipes: [makeImportRecipe('r1', { importSource: { systemId: 'foreign-pack', importedAt: 999 } })]
    })
  );

  assert.equal(summary.recipes.imported, 1);
  assert.equal(createdRecipes.length, 1);
  assert.equal(
    createdRecipes[0].importSource.systemId,
    'test-system',
    'the inbound foreign provenance is overwritten to the pack id (a stamp-only-when-null impl fails here)'
  );
  assert.notEqual(createdRecipes[0].importSource.systemId, 'foreign-pack');
  assert.equal(typeof createdRecipes[0].importSource.importedAt, 'number');
});

test('#775 Q8: a copy-mode / fresh-system import never enters the prune path (no existing system)', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const getRecipesCalls = [];
  const deletedRecipeIds = [];
  const systemManager = makeMockSystemManager({}); // no existing systems → existingSystem is null
  const recipeManager = makeMockRecipeManager({ getRecipesCalls, deletedRecipeIds });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(makePackData(), { overwriteExisting: true });

  assert.equal(summary.recipes.pruned, 0);
  assert.deepEqual(summary.orphans, []);
  assert.equal(getRecipesCalls.length, 0, 'no prune enumeration when there is no existing system to overwrite');
  assert.equal(deletedRecipeIds.length, 0);
});

test('#775 Q8b: an existing system imported WITHOUT overwrite never enters the prune path (early skip)', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const getRecipesCalls = [];
  const deletedRecipeIds = [];
  const existingSystem = { id: 'test-system', name: 'Test System', items: [] };
  const systemManager = makeMockSystemManager({ systems: [existingSystem] });
  const recipeManager = makeMockRecipeManager({ getRecipesCalls, deletedRecipeIds });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const summary = await importer.importFromPackData(makePackData(), { overwriteExisting: false });

  assert.equal(summary.system.skipped, true, 'the existing system is skipped before Phase 4');
  assert.equal(summary.recipes.pruned, 0);
  assert.equal(getRecipesCalls.length, 0, 'the other false-limb of the prune gate also never enumerates');
  assert.equal(deletedRecipeIds.length, 0);
});

test('#775 Q10: an overwrite that imports nothing and prunes nothing issues zero saves', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const systemId = 'test-system';
  const { importer, packData, recorders } = makeOverwriteScenario({
    systemId,
    persistedRecipes: [], // nothing to prune
    payloadRecipeIds: [] // nothing to import
  });

  const summary = await importer.importFromPackData(packData, { overwriteExisting: true });

  assert.equal(summary.recipes.imported, 0);
  assert.equal(summary.recipes.pruned, 0);
  assert.equal(recorders.saveCalls.length, 0, 'the widened gate still writes nothing when nothing changed');
  assert.equal(recorders.cleanupCalls.length, 0, 'no bulk flag cleanup when nothing was pruned');
});

test('#775 Q11 + prune-only reinstall: imported:0 & pruned>0 writes once, runs one bulk cleanup, and reports the pruned count', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const systemId = 'test-system';
  const { importer, packData, recorders } = makeOverwriteScenario({
    systemId,
    persistedRecipes: [
      { id: 'drop-1', name: 'Drop One', craftingSystemId: systemId, importSource: { systemId, importedAt: 1 } },
      { id: 'drop-2', name: 'Drop Two', craftingSystemId: systemId, importSource: { systemId, importedAt: 1 } }
    ],
    payloadRecipeIds: [] // a prune-only reinstall: drops recipes, adds none
  });

  const summary = await importer.importFromPackData(packData, { overwriteExisting: true });

  assert.equal(summary.recipes.imported, 0, 'a prune-only reinstall imports nothing');
  assert.equal(summary.recipes.pruned, 2, 'both provenance-matched dropped recipes are pruned');
  assert.equal(recorders.saveCalls.length, 1, 'the widened gate persists the prune-only reinstall exactly once');
  assert.equal(recorders.cleanupCalls.length, 1, 'exactly one bulk actor-flag cleanup pass for the whole prune batch');
  // Q11: the change notification carries the pruned count.
  assert.equal(recorders.notifyDetails.length, 1);
  assert.equal(recorders.notifyDetails[0].pruned, 2, 'notifyRecipesChanged details carry the pruned count');
});

test('#775 Q5: the reporter’s stale Mythwright ids — reported-only while unprovenanced, auto-pruned once provenance-stamped', async () => {
  resetGame();
  globalThis.fromUuid = async () => null;

  const systemId = 'mythwright';
  const existingSystem = { id: systemId, name: 'Mythwright', components: [] };
  const deletedRecipeIds = [];
  const systemManager = makeMockSystemManager({ systems: [existingSystem] });
  // The two stale ids exist in the world as LEGACY unprovenanced recipes (imported
  // before provenance existed) — the reporter's exact ids.
  const recipeManager = makeMockRecipeManager({
    deletedRecipeIds,
    persistedRecipes: [
      { id: 'myRcpSmeltIronIngot1', name: 'Smelt Iron Ingot', craftingSystemId: systemId, importSource: null },
      { id: 'myRcpRefineSteelIngt', name: 'Refine Steel Ingot', craftingSystemId: systemId, importSource: null }
    ]
  });
  const importer = new CompendiumImporter(systemManager, recipeManager);

  const dropAllPack = makePackData({ system: { id: systemId, name: 'Mythwright', components: [] }, recipes: [] });
  const shipBothPack = makePackData({
    system: { id: systemId, name: 'Mythwright', components: [] },
    recipes: [makeImportRecipe('myRcpSmeltIronIngot1'), makeImportRecipe('myRcpRefineSteelIngt')]
  });

  // Reinstall #1 (D2 report-only limb): the payload no longer ships the two ids, but
  // they are still unprovenanced legacy rows, so they are reported-only, never removed.
  const first = await importer.importFromPackData(dropAllPack, { overwriteExisting: true });
  assert.equal(first.recipes.pruned, 0, 'reinstall #1 prunes nothing (the stale ids are unprovenanced)');
  assert.deepEqual(
    first.orphans.map((o) => ({ recipeId: o.recipeId, disposition: o.disposition, reason: o.reason })).sort((a, b) => a.recipeId.localeCompare(b.recipeId)),
    [
      { recipeId: 'myRcpRefineSteelIngt', disposition: 'reported', reason: 'unprovenanced' },
      { recipeId: 'myRcpSmeltIronIngot1', disposition: 'reported', reason: 'unprovenanced' }
    ],
    'both legacy ids are report-only on the first post-fix reinstall'
  );
  assert.equal(deletedRecipeIds.length, 0, 'reinstall #1 deletes nothing');

  // A provenance-stamping reinstall re-ships the two ids: overwriting them stamps the
  // pack provenance onto the persisted rows.
  await importer.importFromPackData(shipBothPack, { overwriteExisting: true });
  for (const recipe of recipeManager.getRecipes({ craftingSystemId: systemId })) {
    assert.equal(recipe.importSource?.systemId, systemId, 'the re-ship stamps provenance');
  }

  // Reinstall #2 (post-dedupe): the payload drops the two now-provenanced ids → auto-prune.
  const second = await importer.importFromPackData(dropAllPack, { overwriteExisting: true });
  assert.equal(second.recipes.pruned, 2, 'the now-provenanced dropped ids are auto-pruned');
  assert.deepEqual(
    second.orphans.map((o) => ({ recipeId: o.recipeId, disposition: o.disposition, reason: o.reason })).sort((a, b) => a.recipeId.localeCompare(b.recipeId)),
    [
      { recipeId: 'myRcpRefineSteelIngt', disposition: 'pruned', reason: 'provenanceMatched' },
      { recipeId: 'myRcpSmeltIronIngot1', disposition: 'pruned', reason: 'provenanceMatched' }
    ]
  );
  assert.deepEqual(deletedRecipeIds.sort(), ['myRcpRefineSteelIngt', 'myRcpSmeltIronIngot1']);
  assert.equal(recipeManager.getRecipes({ craftingSystemId: systemId }).length, 0, 'both stale recipes are gone from the world');
});
