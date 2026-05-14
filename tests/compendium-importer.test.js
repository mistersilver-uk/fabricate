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

const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComponent(overrides = {}) {
  return {
    id: 'comp1',
    name: 'Iron Ore',
    sourceItemUuid: 'Compendium.source.items.iron-ore',
    fallbackItemIds: [],
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

function makeMockRecipeManager({
  existingRecipes = {},
  createdRecipes = [],
  updatedRecipes = [],
  createdRecipeOptions = [],
  updatedRecipeOptions = []
} = {}) {
  return {
    getRecipe: (id) => existingRecipes[id] || null,
    createRecipe: async (data, options) => {
      createdRecipes.push(data);
      createdRecipeOptions.push(options);
      return data;
    },
    updateRecipe: async (id, data, options) => {
      updatedRecipes.push(data);
      updatedRecipeOptions.push(options);
      return data;
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
  assert.deepEqual(createdRecipeOptions, [{ notify: false }], 'Batch import should suppress per-recipe create notifications');
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

  // System component should have unchanged sourceItemUuid
  const createdSystem = createdSystems[0];
  const comp = createdSystem.components[0];
  assert.equal(comp.sourceItemUuid, 'Compendium.source.items.iron-ore', 'sourceItemUuid unchanged on exact match');
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
  assert.ok(comp.fallbackItemIds.includes('Compendium.source.items.iron-ore'),
    'Old UUID should be added to fallbackItemIds');

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
  assert.equal(summary.components.unresolved[0].sourceItemUuid, 'Compendium.source.items.iron-ore');
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
        sourceUuid: 'Compendium.source.items.iron-ore',
        fallbackItemIds: ['Item.existing-fallback-id']
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
  assert.ok(comp.fallbackItemIds.includes('Item.existing-fallback-id'),
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
  assert.ok(comp.fallbackItemIds.includes('Item.manual-fallback-1'),
    'Additional fallback 1 should be merged');
  assert.ok(comp.fallbackItemIds.includes('Item.manual-fallback-2'),
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
  assert.deepEqual(updatedRecipeOptions, [{ notify: false }]);
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
