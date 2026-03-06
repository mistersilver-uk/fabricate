/**
 * Unit tests for EssenceDefinition normalization (T-003)
 * Validates that _normalizeEssenceDefinition and _normalizeSystem correctly
 * populate the `icon` and `sourceItemUuid` fields defined in spec 002.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal stubs so the module can load without a Foundry runtime
let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined
  }
};
globalThis.game = {};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

/**
 * Build a minimal CraftingSystemManager instance.
 * The manager needs a recipeManager stub that returns no recipes.
 */
function makeManager() {
  const recipeManagerStub = {
    getRecipes: () => []
  };
  return new CraftingSystemManager(recipeManagerStub);
}

// ---------------------------------------------------------------------------
// Group 1: _normalizeEssenceDefinition — 6 tests
// ---------------------------------------------------------------------------

test('_normalizeEssenceDefinition - string entry gets default icon', () => {
  const manager = makeManager();
  const result = manager._normalizeEssenceDefinition('Water');
  assert.equal(result.icon, 'fas fa-mortar-pestle');
});

test('_normalizeEssenceDefinition - string entry gets null sourceItemUuid', () => {
  const manager = makeManager();
  const result = manager._normalizeEssenceDefinition('Water');
  assert.equal(result.sourceItemUuid, null);
});

test('_normalizeEssenceDefinition - string entry gets null associatedSystemItemId', () => {
  const manager = makeManager();
  const result = manager._normalizeEssenceDefinition('Water');
  assert.equal(result.associatedSystemItemId, null);
});

test('_normalizeEssenceDefinition - object entry with icon preserves icon', () => {
  const manager = makeManager();
  const result = manager._normalizeEssenceDefinition({ name: 'Fire', icon: 'fas fa-fire' });
  assert.equal(result.icon, 'fas fa-fire');
});

test('_normalizeEssenceDefinition - object entry without icon gets default icon', () => {
  const manager = makeManager();
  const result = manager._normalizeEssenceDefinition({ name: 'Fire' });
  assert.equal(result.icon, 'fas fa-mortar-pestle');
});

test('_normalizeEssenceDefinition - object entry with sourceItemUuid uses it as primary', () => {
  const manager = makeManager();
  const result = manager._normalizeEssenceDefinition({ name: 'Fire', sourceItemUuid: 'item-123' });
  assert.equal(result.sourceItemUuid, 'item-123');
  assert.equal(result.associatedSystemItemId, 'item-123');
});

// ---------------------------------------------------------------------------
// Group 2: _normalizeSystem round-trip — 4 tests
// ---------------------------------------------------------------------------

test('_normalizeSystem - normalized system includes icon and sourceItemUuid on essences', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    essenceDefinitions: [
      { name: 'Water', icon: 'fas fa-tint', sourceItemUuid: null }
    ]
  });
  const essence = system.essenceDefinitions[0];
  assert.ok(Object.prototype.hasOwnProperty.call(essence, 'icon'), 'icon field should be present');
  assert.ok(Object.prototype.hasOwnProperty.call(essence, 'sourceItemUuid'), 'sourceItemUuid field should be present');
  assert.equal(essence.icon, 'fas fa-tint');
});

test('_normalizeSystem - sourceItemUuid resolved to null when item does not exist in managedItems', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    essenceDefinitions: [
      { name: 'Water', sourceItemUuid: 'nonexistent-item-id' }
    ],
    managedItems: []
  });
  const essence = system.essenceDefinitions[0];
  assert.equal(essence.sourceItemUuid, null);
  assert.equal(essence.associatedSystemItemId, null);
});

test('_normalizeSystem - sourceItemUuid preserved when item exists in managedItems', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    essenceDefinitions: [
      { name: 'Water', sourceItemUuid: 'managed-item-id' }
    ],
    managedItems: [
      { id: 'managed-item-id', name: 'Water Vial' }
    ]
  });
  const essence = system.essenceDefinitions[0];
  assert.equal(essence.sourceItemUuid, 'managed-item-id');
  assert.equal(essence.associatedSystemItemId, 'managed-item-id');
});

test('_normalizeSystem - legacy system with only associatedSystemItemId migrates to sourceItemUuid', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    essenceDefinitions: [
      { name: 'Earth', associatedSystemItemId: 'legacy-item-id' }
    ],
    managedItems: [
      { id: 'legacy-item-id', name: 'Earth Stone' }
    ]
  });
  const essence = system.essenceDefinitions[0];
  assert.equal(essence.sourceItemUuid, 'legacy-item-id');
  assert.equal(essence.associatedSystemItemId, 'legacy-item-id');
});

// ---------------------------------------------------------------------------
// Group 3: Edge cases — 2 tests
// ---------------------------------------------------------------------------

test('_normalizeEssenceDefinition - empty string icon falls back to default', () => {
  const manager = makeManager();
  const result = manager._normalizeEssenceDefinition({ name: 'Fire', icon: '' });
  assert.equal(result.icon, 'fas fa-mortar-pestle');
});

test('_normalizeEssenceDefinition - whitespace-only icon string falls back to default', () => {
  const manager = makeManager();
  const result = manager._normalizeEssenceDefinition({ name: 'Fire', icon: '   ' });
  assert.equal(result.icon, 'fas fa-mortar-pestle');
});
