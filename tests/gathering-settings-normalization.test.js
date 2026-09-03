import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2)}`
  }
};

globalThis.game = {
  user: { isGM: true },
  settings: {
    register: () => {},
    get: () => undefined,
    set: async () => undefined
  }
};

const {
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
  registerFabricateSettings
} = await import('../src/config/settings.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

test('registerFabricateSettings registers gathering settings with canonical scopes and defaults', () => {
  const registrations = [];
  globalThis.game.settings.register = (namespace, key, definition) => {
    registrations.push({ namespace, key, definition });
  };

  registerFabricateSettings();

  const gatheringEnvironments = registrations.find(entry => entry.key === SETTING_KEYS.GATHERING_ENVIRONMENTS);
  assert.ok(gatheringEnvironments, 'gatheringEnvironments should be registered');
  assert.equal(gatheringEnvironments.namespace, FABRICATE_SETTINGS_NAMESPACE);
  assert.equal(gatheringEnvironments.definition.scope, 'world');
  assert.equal(gatheringEnvironments.definition.type, Array);
  assert.deepEqual(gatheringEnvironments.definition.default, []);

  const lastGatheringActor = registrations.find(entry => entry.key === SETTING_KEYS.LAST_GATHERING_ACTOR);
  assert.ok(lastGatheringActor, 'lastGatheringActor should be registered');
  assert.equal(lastGatheringActor.namespace, FABRICATE_SETTINGS_NAMESPACE);
  assert.equal(lastGatheringActor.definition.scope, 'client');
  assert.equal(lastGatheringActor.definition.type, String);
  assert.equal(lastGatheringActor.definition.default, '');
});

test('features.gathering defaults to false when omitted', () => {
  const manager = makeManager();
  const normalized = manager._normalizeFeatures({});

  assert.equal(normalized.gathering, false);
});

test('features.gathering is enabled only for the literal boolean true', () => {
  const manager = makeManager();

  assert.equal(manager._normalizeFeatures({ features: { gathering: true } }).gathering, true);
  assert.equal(manager._normalizeFeatures({ features: { gathering: 1 } }).gathering, false);
  assert.equal(manager._normalizeFeatures({ features: { gathering: 'true' } }).gathering, false);
});

test('features.gathering safely normalizes absent or legacy feature objects', () => {
  const manager = makeManager();

  assert.equal(manager._normalizeFeatures({ features: null, enableTags: true }).gathering, false);
  assert.equal(manager._normalizeSystem({ name: 'Legacy System', enableCategories: true }).features.gathering, false);
});

test('recipe categories and item tags normalize on despite legacy disabled flags', () => {
  const manager = makeManager();
  const normalized = manager._normalizeSystem({
    name: 'Legacy Disabled System',
    enableCategories: false,
    enableTags: false,
    features: {
      recipeCategories: false,
      categories: false,
      itemTags: false
    }
  });

  assert.equal(normalized.features.recipeCategories, true);
  assert.equal(normalized.features.categories, true);
  assert.equal(normalized.features.itemTags, true);
  assert.equal(normalized.enableCategories, true);
  assert.equal(normalized.enableTags, true);
});

test('updateSystem ignores recipe category and item tag disable attempts', async () => {
  const manager = makeManager();
  const system = await manager.createSystem({
    id: 'sys-tags',
    name: 'Tags',
    features: {
      recipeCategories: false,
      itemTags: false
    }
  });

  assert.equal(system.features.recipeCategories, true);
  assert.equal(system.features.itemTags, true);

  const updated = await manager.updateSystem('sys-tags', {
    enableCategories: false,
    enableTags: false,
    features: {
      recipeCategories: false,
      categories: false,
      itemTags: false
    }
  });

  assert.equal(updated.features.recipeCategories, true);
  assert.equal(updated.features.categories, true);
  assert.equal(updated.features.itemTags, true);
  assert.equal(updated.enableCategories, true);
  assert.equal(updated.enableTags, true);
});
