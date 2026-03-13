/**
 * Tests for CraftingSystemExporter service.
 *
 * Tests:
 *   1. buildExportPayload: produces correct envelope with version and timestamp
 *   2. buildExportPayload: replaces craftingSystemId with __SYSTEM_ID__ placeholder
 *   3. buildExportPayload: strips transitional aliases from system
 *   4. buildExportPayload: throws on missing system
 *   5. buildExportPayload: does not mutate original inputs
 *   6. validateImportData: accepts valid export data
 *   7. validateImportData: rejects non-object input
 *   8. validateImportData: rejects missing system field
 *   9. validateImportData: rejects system without name
 *  10. validateImportData: warns on missing fabricateVersion
 *  11. validateImportData: rejects non-array recipes
 *  12. validateImportData: warns on recipe without name
 *  13. prepareForImport: keep mode preserves IDs
 *  14. prepareForImport: copy mode strips IDs and appends "(Copy)"
 *  15. prepareForImport: does not mutate original data
 *  16. makeExportFilename: generates slug from system name
 *  17. makeExportFilename: handles special characters
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildExportPayload,
  validateImportData,
  prepareForImport,
  makeExportFilename
} = await import('../src/systems/CraftingSystemExporter.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSystem(overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Test System',
    description: 'A test system',
    enabled: true,
    resolutionMode: 'simple',
    features: { essences: true, recipeCategories: false, itemTags: false },
    essenceDefinitions: [
      { id: 'earth', name: 'Earth', description: '', icon: 'fas fa-mountain', associatedSystemItemId: null }
    ],
    categories: ['Potions'],
    itemTags: ['ingredient'],
    components: [
      { id: 'comp-1', name: 'Iron Ore', sourceItemUuid: 'Compendium.test.items.iron', essences: { earth: 1 } }
    ],
    // Transitional aliases that should be stripped on export
    items: [{ id: 'comp-1' }],
    managedItems: [{ id: 'comp-1' }],
    tags: ['ingredient'],
    essences: ['earth'],
    enableTags: false,
    enableEssences: true,
    enableCategories: false,
    enableMultiStepRecipes: false,
    enableTiers: false,
    tiers: [],
    advancedOptionsEnabled: true,
    ...overrides
  };
}

function makeRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    name: 'Iron Bar',
    craftingSystemId: 'sys-1',
    system: 'sys-1',
    ingredientSets: [],
    resultGroups: [],
    enabled: true,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// buildExportPayload
// ---------------------------------------------------------------------------

test('buildExportPayload: produces correct envelope', () => {
  const system = makeSystem();
  const recipes = [makeRecipe()];

  const payload = buildExportPayload(system, recipes, '1.0.0-rc.12');

  assert.equal(payload.fabricateVersion, '1.0.0-rc.12');
  assert.ok(payload.exportedAt, 'Should have exportedAt timestamp');
  assert.ok(payload.system, 'Should have system');
  assert.ok(Array.isArray(payload.recipes), 'Should have recipes array');
  assert.equal(payload.recipes.length, 1);
});

test('buildExportPayload: replaces craftingSystemId with placeholder', () => {
  const system = makeSystem();
  const recipes = [makeRecipe()];

  const payload = buildExportPayload(system, recipes, '1.0.0');

  assert.equal(payload.recipes[0].craftingSystemId, '__SYSTEM_ID__');
});

test('buildExportPayload: preserves craftingSystemId for recipes from other systems', () => {
  const system = makeSystem();
  const recipes = [makeRecipe({ craftingSystemId: 'other-system' })];

  const payload = buildExportPayload(system, recipes, '1.0.0');

  assert.equal(payload.recipes[0].craftingSystemId, 'other-system');
});

test('buildExportPayload: strips transitional aliases from system', () => {
  const system = makeSystem();
  const payload = buildExportPayload(system, [], '1.0.0');

  assert.equal(payload.system.items, undefined, 'items alias should be stripped');
  assert.equal(payload.system.managedItems, undefined, 'managedItems alias should be stripped');
  assert.equal(payload.system.tags, undefined, 'tags alias should be stripped');
  assert.equal(payload.system.essences, undefined, 'essences alias should be stripped');
  assert.equal(payload.system.enableTags, undefined);
  assert.equal(payload.system.enableEssences, undefined);
  assert.equal(payload.system.enableCategories, undefined);
  assert.equal(payload.system.enableMultiStepRecipes, undefined);
  assert.equal(payload.system.enableTiers, undefined);
  assert.equal(payload.system.tiers, undefined);
  assert.equal(payload.system.advancedOptionsEnabled, undefined);
});

test('buildExportPayload: strips associatedSystemItemId from essence definitions', () => {
  const system = makeSystem();
  const payload = buildExportPayload(system, [], '1.0.0');

  for (const def of payload.system.essenceDefinitions) {
    assert.equal(def.associatedSystemItemId, undefined,
      `Essence "${def.id}" should not have associatedSystemItemId`);
  }
});

test('buildExportPayload: strips legacy system alias from recipes', () => {
  const system = makeSystem();
  const recipes = [makeRecipe()];

  const payload = buildExportPayload(system, recipes, '1.0.0');

  assert.equal(payload.recipes[0].system, undefined, 'Legacy system alias should be stripped');
});

test('buildExportPayload: retains canonical system fields', () => {
  const system = makeSystem();
  const payload = buildExportPayload(system, [], '1.0.0');

  assert.equal(payload.system.id, 'sys-1');
  assert.equal(payload.system.name, 'Test System');
  assert.ok(Array.isArray(payload.system.components), 'components should be preserved');
  assert.ok(Array.isArray(payload.system.essenceDefinitions), 'essenceDefinitions should be preserved');
  assert.ok(Array.isArray(payload.system.categories), 'categories should be preserved');
  assert.ok(Array.isArray(payload.system.itemTags), 'itemTags should be preserved');
});

test('buildExportPayload: throws on missing system', () => {
  assert.throws(
    () => buildExportPayload(null, [], '1.0.0'),
    /Cannot export: system is missing/
  );
});

test('buildExportPayload: throws on system without id', () => {
  assert.throws(
    () => buildExportPayload({ name: 'No ID' }, [], '1.0.0'),
    /Cannot export: system is missing or has no id/
  );
});

test('buildExportPayload: does not mutate original inputs', () => {
  const system = makeSystem();
  const recipes = [makeRecipe()];
  const originalSystemId = system.id;
  const originalRecipeSystemId = recipes[0].craftingSystemId;

  buildExportPayload(system, recipes, '1.0.0');

  assert.equal(system.id, originalSystemId, 'System should not be mutated');
  assert.equal(recipes[0].craftingSystemId, originalRecipeSystemId, 'Recipe should not be mutated');
  assert.ok(system.items !== undefined, 'Original system aliases should remain');
});

// ---------------------------------------------------------------------------
// validateImportData
// ---------------------------------------------------------------------------

test('validateImportData: accepts valid export data', () => {
  const data = {
    fabricateVersion: '1.0.0',
    system: { name: 'Test' },
    recipes: [{ id: 'r1', name: 'Recipe 1' }]
  };

  const result = validateImportData(data);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
});

test('validateImportData: rejects non-object input', () => {
  assert.equal(validateImportData(null).valid, false);
  assert.equal(validateImportData('string').valid, false);
  assert.equal(validateImportData(42).valid, false);
});

test('validateImportData: rejects missing system field', () => {
  const result = validateImportData({ recipes: [] });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('system')));
});

test('validateImportData: rejects system without name', () => {
  const result = validateImportData({ system: { id: 'x' }, recipes: [] });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('name')));
});

test('validateImportData: warns on missing fabricateVersion', () => {
  const result = validateImportData({ system: { name: 'Test' }, recipes: [] });

  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => w.includes('fabricateVersion')));
});

test('validateImportData: rejects non-array recipes', () => {
  const result = validateImportData({
    fabricateVersion: '1.0.0',
    system: { name: 'Test' },
    recipes: 'not-an-array'
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('array')));
});

test('validateImportData: warns on recipe without name', () => {
  const result = validateImportData({
    fabricateVersion: '1.0.0',
    system: { name: 'Test' },
    recipes: [{ id: 'r1' }]
  });

  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => w.includes('no name')));
});

test('validateImportData: accepts data with no recipes field', () => {
  const result = validateImportData({
    fabricateVersion: '1.0.0',
    system: { name: 'Test' }
  });

  assert.equal(result.valid, true);
});

test('validateImportData: reports invalid recipe objects', () => {
  const result = validateImportData({
    fabricateVersion: '1.0.0',
    system: { name: 'Test' },
    recipes: [null, 42, { id: 'valid', name: 'OK' }]
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('index 0')));
  assert.ok(result.errors.some(e => e.includes('index 1')));
});

// ---------------------------------------------------------------------------
// prepareForImport
// ---------------------------------------------------------------------------

test('prepareForImport: keep mode preserves IDs', () => {
  const data = {
    system: { id: 'sys-1', name: 'Test' },
    recipes: [{ id: 'r1', name: 'Recipe', craftingSystemId: '__SYSTEM_ID__' }]
  };

  const prepared = prepareForImport(data, 'keep');

  assert.equal(prepared.system.id, 'sys-1');
  assert.equal(prepared.recipes[0].id, 'r1');
});

test('prepareForImport: copy mode strips IDs and appends "(Copy)"', () => {
  const data = {
    system: { id: 'sys-1', name: 'Test System' },
    recipes: [{ id: 'r1', name: 'Recipe', craftingSystemId: '__SYSTEM_ID__' }]
  };

  const prepared = prepareForImport(data, 'copy');

  assert.equal(prepared.system.id, undefined, 'System ID should be stripped');
  assert.equal(prepared.system.name, 'Test System (Copy)');
  assert.equal(prepared.recipes[0].id, undefined, 'Recipe ID should be stripped');
});

test('prepareForImport: does not mutate original data', () => {
  const data = {
    system: { id: 'sys-1', name: 'Test' },
    recipes: [{ id: 'r1', name: 'Recipe' }]
  };

  prepareForImport(data, 'copy');

  assert.equal(data.system.id, 'sys-1', 'Original system ID should remain');
  assert.equal(data.recipes[0].id, 'r1', 'Original recipe ID should remain');
});

test('prepareForImport: handles missing recipes', () => {
  const data = { system: { id: 'sys-1', name: 'Test' } };

  const prepared = prepareForImport(data, 'keep');

  assert.ok(Array.isArray(prepared.recipes));
  assert.equal(prepared.recipes.length, 0);
});

// ---------------------------------------------------------------------------
// makeExportFilename
// ---------------------------------------------------------------------------

test('makeExportFilename: generates slug from system name', () => {
  const filename = makeExportFilename('Alchemist\'s Supplies');

  assert.ok(filename.startsWith('fabricate-alchemist-s-supplies-'));
  assert.ok(filename.endsWith('.json'));
});

test('makeExportFilename: handles special characters', () => {
  const filename = makeExportFilename('My  System!! (v2)');

  assert.ok(filename.startsWith('fabricate-my-system-v2-'));
  assert.ok(filename.endsWith('.json'));
  // No consecutive hyphens or leading/trailing hyphens in slug
  assert.ok(!filename.includes('--'), 'No consecutive hyphens');
});

test('makeExportFilename: handles empty name', () => {
  const filename = makeExportFilename('');

  assert.ok(filename.startsWith('fabricate-system-'));
  assert.ok(filename.endsWith('.json'));
});

test('makeExportFilename: includes date in ISO format', () => {
  const filename = makeExportFilename('Test');
  const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);

  assert.ok(dateMatch, 'Filename should contain ISO date');
});
