/**
 * Unit tests for T-009: Implement Essence-Based Effect Transfer per Spec 005
 *
 * Group 1: Effect transfer uses essence-based pipeline (5 tests)
 * Group 2: Old ingredient-level path removed (1 test)
 * Group 3: Edge cases (2 tests)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

// ---------------------------------------------------------------------------
// Globals required for the modules to load
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = {
  utils: {
    getProperty,
    setProperty(object, path, value) {
      const parts = String(path).split('.');
      let cur = object;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] == null) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
    },
    randomID: () => Math.random().toString(36).slice(2)
  }
};

globalThis.ui = {
  notifications: { info: () => {}, warn: () => {}, error: () => {} }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal CraftingEngine with no-op collaborators.
 */
function makeEngine() {
  const mockRecipeManager = {
    canCraft: () => ({ canCraft: false }),
    getCatalystsForSet: () => [],
    catalystMatchesItem: () => false,
    ingredientMatchesItem: () => false
  };
  return new CraftingEngine(mockRecipeManager, null, null);
}

/**
 * Build a fake consumed item whose fabricate 'essences' flag returns the given map.
 */
function makeConsumedItem(id, essencesMap = {}) {
  // getFabricateFlag calls document.getFlag('fabricate', normalizeFlagKey(key))
  // normalizeFlagKey('essences') => 'fabricate.essences'
  // so getFlag('fabricate', 'fabricate.essences') must return essencesMap
  const flagStore = { 'fabricate.essences': essencesMap };
  return {
    item: {
      id,
      uuid: `Item.${id}`,
      name: `Item ${id}`,
      getFlag(scope, key) {
        if (scope === 'fabricate') return flagStore[key];
        return undefined;
      }
    },
    quantity: 1,
    ingredient: { systemItemId: id, quantity: 1 }
  };
}

/**
 * Build a fake active effect with toObject() returning a plain data blob.
 */
function makeEffect(name) {
  return { name, toObject: () => ({ name, changes: [] }) };
}

/**
 * Build a fake source item (resolved via fromUuid) with the given effects array.
 */
function makeSourceItem(uuid, effects = []) {
  return { id: uuid, uuid, name: `Source ${uuid}`, effects };
}

/**
 * Configure globalThis.game with a system whose essenceDefinitions are provided.
 * essences flag controls features.essences.
 */
function setupGame({ essencesEnabled = true, essenceDefinitions = [], components = [] } = {}) {
  const system = {
    features: {
      essences: essencesEnabled,
      effectTransfer: true
    },
    essenceDefinitions,
    components,
    craftingCheck: { enabled: false }
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => system
      })
    }
  };
  return system;
}

// ---------------------------------------------------------------------------
// Group 1: Effect transfer uses essence-based pipeline
// ---------------------------------------------------------------------------

test('T-009-G1-1: effects transferred from essence sourceItemUuid when essences enabled', async () => {
  const effect = makeEffect('Fire Resist');
  const sourceItem = makeSourceItem('uuid-fire-essence', [effect]);

  setupGame({
    essencesEnabled: true,
    essenceDefinitions: [
      { id: 'essence-fire', sourceItemUuid: 'uuid-fire-essence' }
    ]
  });

  globalThis.fromUuid = async (uuid) => uuid === 'uuid-fire-essence' ? sourceItem : null;

  const engine = makeEngine();

  // Consumed item contributes 1 unit of essence-fire
  const consumedItems = [makeConsumedItem('ing-1', { 'essence-fire': 1 })];

  const capturedEffects = [];
  const resultItem = {
    createEmbeddedDocuments: async (type, data) => {
      capturedEffects.push(...data);
      return data;
    }
  };

  const recipe = { craftingSystemId: 'sys-1', transferEffects: true };

  await engine._transferEffects(resultItem, consumedItems, recipe);

  assert.equal(capturedEffects.length, 1, 'exactly one effect should be transferred');
  assert.equal(capturedEffects[0].name, 'Fire Resist');
});

test('effects transfer resolves sourceComponentId through the managed component source UUID', async () => {
  const effect = makeEffect('Stone Skin');
  const sourceItem = makeSourceItem('uuid-earth-source', [effect]);

  setupGame({
    essencesEnabled: true,
    components: [
      { id: 'component-earth', sourceItemUuid: 'uuid-earth-source' }
    ],
    essenceDefinitions: [
      { id: 'essence-earth', sourceComponentId: 'component-earth', sourceItemUuid: 'legacy-component-earth' }
    ]
  });

  const resolvedUuids = [];
  globalThis.fromUuid = async (uuid) => {
    resolvedUuids.push(uuid);
    return uuid === 'uuid-earth-source' ? sourceItem : null;
  };

  const engine = makeEngine();
  const consumedItems = [makeConsumedItem('ing-1', { 'essence-earth': 1 })];
  const capturedEffects = [];
  const resultItem = {
    createEmbeddedDocuments: async (type, data) => {
      capturedEffects.push(...data);
      return data;
    }
  };

  await engine._transferEffects(resultItem, consumedItems, { craftingSystemId: 'sys-1', transferEffects: true });

  assert.deepEqual(resolvedUuids, ['uuid-earth-source']);
  assert.equal(capturedEffects.length, 1);
  assert.equal(capturedEffects[0].name, 'Stone Skin');
});

test('effects transfer skips stale sourceComponentId instead of falling back to legacy sourceItemUuid', async () => {
  const legacySourceItem = makeSourceItem('uuid-legacy-source', [makeEffect('Legacy Effect')]);

  setupGame({
    essencesEnabled: true,
    components: [],
    essenceDefinitions: [
      { id: 'essence-stale', sourceComponentId: 'missing-component', sourceItemUuid: 'uuid-legacy-source' }
    ]
  });

  const resolvedUuids = [];
  globalThis.fromUuid = async (uuid) => {
    resolvedUuids.push(uuid);
    return uuid === 'uuid-legacy-source' ? legacySourceItem : null;
  };

  const engine = makeEngine();
  const consumedItems = [makeConsumedItem('ing-1', { 'essence-stale': 1 })];
  let createCalled = false;
  const resultItem = {
    createEmbeddedDocuments: async () => {
      createCalled = true;
      return [];
    }
  };

  await engine._transferEffects(resultItem, consumedItems, { craftingSystemId: 'sys-1', transferEffects: true });

  assert.deepEqual(resolvedUuids, []);
  assert.equal(createCalled, false);
});

test('T-009-G1-2: no effects transferred when essences feature is disabled', async () => {
  setupGame({
    essencesEnabled: false,
    essenceDefinitions: [
      { id: 'essence-fire', sourceItemUuid: 'uuid-fire-essence' }
    ]
  });

  globalThis.fromUuid = async () => makeSourceItem('uuid-fire-essence', [makeEffect('Fire Resist')]);

  const engine = makeEngine();
  const consumedItems = [makeConsumedItem('ing-1', { 'essence-fire': 1 })];

  let createCalled = false;
  const resultItem = {
    createEmbeddedDocuments: async () => { createCalled = true; return []; }
  };

  const recipe = { craftingSystemId: 'sys-1', transferEffects: true };

  await engine._transferEffects(resultItem, consumedItems, recipe);

  assert.equal(createCalled, false, 'createEmbeddedDocuments should not be called when essences are disabled');
});

test('T-009-G1-3: essence with no sourceItemUuid contributes no effects', async () => {
  setupGame({
    essencesEnabled: true,
    essenceDefinitions: [
      { id: 'essence-water' } // no sourceItemUuid
    ]
  });

  globalThis.fromUuid = async () => null;

  const engine = makeEngine();
  const consumedItems = [makeConsumedItem('ing-1', { 'essence-water': 2 })];

  let createCalled = false;
  const resultItem = {
    createEmbeddedDocuments: async () => { createCalled = true; return []; }
  };

  const recipe = { craftingSystemId: 'sys-1', transferEffects: true };

  await engine._transferEffects(resultItem, consumedItems, recipe);

  assert.equal(createCalled, false, 'no effects should be transferred when sourceItemUuid is absent');
});

test('T-009-G1-4: sourceItemUuid that resolves to null is gracefully skipped', async () => {
  setupGame({
    essencesEnabled: true,
    essenceDefinitions: [
      { id: 'essence-void', sourceItemUuid: 'uuid-does-not-exist' }
    ]
  });

  globalThis.fromUuid = async () => null; // resolution fails

  const engine = makeEngine();
  const consumedItems = [makeConsumedItem('ing-1', { 'essence-void': 1 })];

  let createCalled = false;
  const resultItem = {
    createEmbeddedDocuments: async () => { createCalled = true; return []; }
  };

  const recipe = { craftingSystemId: 'sys-1', transferEffects: true };

  await engine._transferEffects(resultItem, consumedItems, recipe);

  assert.equal(createCalled, false, 'missing source item should be gracefully skipped');
});

test('T-009-G1-5: effects from multiple essence sources are all collected', async () => {
  const fireEffect = makeEffect('Fire Resist');
  const iceEffect = makeEffect('Ice Resist');

  setupGame({
    essencesEnabled: true,
    essenceDefinitions: [
      { id: 'essence-fire', sourceItemUuid: 'uuid-fire' },
      { id: 'essence-ice', sourceItemUuid: 'uuid-ice' }
    ]
  });

  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'uuid-fire') return makeSourceItem('uuid-fire', [fireEffect]);
    if (uuid === 'uuid-ice') return makeSourceItem('uuid-ice', [iceEffect]);
    return null;
  };

  const engine = makeEngine();
  // Two consumed items, each contributing a different essence
  const consumedItems = [
    makeConsumedItem('ing-fire', { 'essence-fire': 1 }),
    makeConsumedItem('ing-ice', { 'essence-ice': 1 })
  ];

  const capturedEffects = [];
  const resultItem = {
    createEmbeddedDocuments: async (type, data) => {
      capturedEffects.push(...data);
      return data;
    }
  };

  const recipe = { craftingSystemId: 'sys-1', transferEffects: true };

  await engine._transferEffects(resultItem, consumedItems, recipe);

  const names = capturedEffects.map(e => e.name).sort();
  assert.deepEqual(names, ['Fire Resist', 'Ice Resist'], 'effects from both essence sources should be transferred');
});

// ---------------------------------------------------------------------------
// Group 2: Old ingredient-level path removed
// ---------------------------------------------------------------------------

test('T-009-G2-1: ingredient extractEffects=true does NOT cause effect transfer (old path removed)', async () => {
  setupGame({
    essencesEnabled: true,
    essenceDefinitions: [] // no essence definitions at all
  });

  globalThis.fromUuid = async () => null;

  const engine = makeEngine();

  // Ingredient has the old extractEffects flag — should be ignored
  const consumedItem = {
    item: {
      id: 'ing-old',
      uuid: 'Item.ing-old',
      name: 'Old Ingredient',
      getFlag(scope, key) {
        // No essences on this item — empty map
        if (scope === 'fabricate' && key === 'fabricate.essences') return {};
        return undefined;
      },
      effects: [makeEffect('Should Not Transfer')]
    },
    quantity: 1,
    ingredient: {
      systemItemId: 'ing-old',
      quantity: 1,
      extractEffects: true,        // old flag — must be ignored by new implementation
      effectFilter: null
    }
  };

  let createCalled = false;
  const resultItem = {
    createEmbeddedDocuments: async () => { createCalled = true; return []; }
  };

  const recipe = { craftingSystemId: 'sys-1', transferEffects: true };

  await engine._transferEffects(resultItem, [consumedItem], recipe);

  assert.equal(createCalled, false, 'extractEffects on ingredient should be ignored — old path is removed');
});

// ---------------------------------------------------------------------------
// Group 3: Edge cases
// ---------------------------------------------------------------------------

test('T-009-G3-1: source item with empty effects array transfers nothing', async () => {
  setupGame({
    essencesEnabled: true,
    essenceDefinitions: [
      { id: 'essence-empty', sourceItemUuid: 'uuid-empty-source' }
    ]
  });

  globalThis.fromUuid = async () => makeSourceItem('uuid-empty-source', []); // no effects

  const engine = makeEngine();
  const consumedItems = [makeConsumedItem('ing-1', { 'essence-empty': 1 })];

  let createCalled = false;
  const resultItem = {
    createEmbeddedDocuments: async () => { createCalled = true; return []; }
  };

  const recipe = { craftingSystemId: 'sys-1', transferEffects: true };

  await engine._transferEffects(resultItem, consumedItems, recipe);

  assert.equal(createCalled, false, 'no call when source item has no effects');
});

test('T-009-G3-2: empty consumedItems list results in no effects transferred', async () => {
  setupGame({
    essencesEnabled: true,
    essenceDefinitions: [
      { id: 'essence-fire', sourceItemUuid: 'uuid-fire' }
    ]
  });

  globalThis.fromUuid = async () => makeSourceItem('uuid-fire', [makeEffect('Fire Resist')]);

  const engine = makeEngine();

  let createCalled = false;
  const resultItem = {
    createEmbeddedDocuments: async () => { createCalled = true; return []; }
  };

  const recipe = { craftingSystemId: 'sys-1', transferEffects: true };

  await engine._transferEffects(resultItem, [], recipe);

  assert.equal(createCalled, false, 'no essences contributed means no effects transferred');
});
