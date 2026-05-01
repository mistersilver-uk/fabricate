import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2)}`
  }
};

globalThis.game = {
  settings: {
    register: () => {},
    get: () => undefined
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
