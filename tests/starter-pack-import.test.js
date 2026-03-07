/**
 * Smoke tests for T-054: Starter Content Pack
 *
 * Tests:
 *   1. JSON structure   - top-level keys, system shape, recipe count >= 10
 *   2. Recipe validation - Recipe.fromJSON validates for each recipe
 *   3. Cross-reference  - result componentIds exist in components; essence keys in essenceDefinitions
 *   4. Component coverage - all product components referenced by at least one recipe result
 *   5. Macro templates  - dnd5e and generic are non-empty strings
 *   6. Import simulation - mock managers, verify correct counts returned
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Foundry global stubs
// ---------------------------------------------------------------------------

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty: () => undefined
  }
};
globalThis.game = {};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

// ---------------------------------------------------------------------------
// Load the pack JSON
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = join(__dirname, '..', 'packs', 'starter-alchemists-supplies.json');
const packData = JSON.parse(readFileSync(PACK_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// Load models under test
// ---------------------------------------------------------------------------

const { Recipe } = await import('../src/models/Recipe.js');
const { dnd5eCheckTemplate, genericCheckTemplate } = await import('../src/macros/check-templates.js');

// ---------------------------------------------------------------------------
// Group 1: JSON structure
// ---------------------------------------------------------------------------

test('pack has required top-level keys', () => {
  assert.ok(typeof packData.id === 'string' && packData.id.length > 0, 'id should be a non-empty string');
  assert.ok(typeof packData.name === 'string' && packData.name.length > 0, 'name should be a non-empty string');
  assert.ok(packData.system && typeof packData.system === 'object', 'system should be an object');
  assert.ok(Array.isArray(packData.recipes), 'recipes should be an array');
  assert.ok(packData.macroTemplates && typeof packData.macroTemplates === 'object', 'macroTemplates should be an object');
});

test('system has required shape', () => {
  const { system } = packData;
  assert.ok(typeof system.name === 'string', 'system.name should be a string');
  assert.ok(typeof system.description === 'string', 'system.description should be a string');
  assert.ok(typeof system.resolutionMode === 'string', 'system.resolutionMode should be a string');
  assert.ok(system.features && typeof system.features === 'object', 'system.features should be an object');
  assert.ok(Array.isArray(system.essenceDefinitions), 'system.essenceDefinitions should be an array');
  assert.ok(Array.isArray(system.components), 'system.components should be an array');
});

test('system has at least 6 essence definitions', () => {
  assert.ok(packData.system.essenceDefinitions.length >= 6,
    `Expected >= 6 essence definitions, got ${packData.system.essenceDefinitions.length}`);
});

test('recipes array has at least 10 entries', () => {
  assert.ok(packData.recipes.length >= 10,
    `Expected >= 10 recipes, got ${packData.recipes.length}`);
});

// ---------------------------------------------------------------------------
// Group 2: Recipe validation
// ---------------------------------------------------------------------------

test('every recipe passes Recipe.fromJSON().validate()', () => {
  const errors = [];
  for (const recipeData of packData.recipes) {
    const recipe = Recipe.fromJSON({ ...recipeData, craftingSystemId: 'test-sys' });
    const result = recipe.validate();
    if (!result.valid) {
      errors.push(`Recipe "${recipeData.name}": ${result.errors.join('; ')}`);
    }
  }
  assert.equal(errors.length, 0,
    `Recipe validation failures:\n${errors.join('\n')}`);
});

test('every recipe has a non-empty name', () => {
  for (const recipe of packData.recipes) {
    assert.ok(typeof recipe.name === 'string' && recipe.name.trim().length > 0,
      `Recipe id "${recipe.id}" has no name`);
  }
});

test('every recipe has exactly one ingredientSet with essences', () => {
  for (const recipe of packData.recipes) {
    assert.equal(recipe.ingredientSets.length, 1,
      `Recipe "${recipe.name}" should have exactly 1 ingredientSet`);
    const essences = recipe.ingredientSets[0].essences;
    assert.ok(essences && typeof essences === 'object' && Object.keys(essences).length > 0,
      `Recipe "${recipe.name}" ingredientSet should have at least 1 essence`);
  }
});

test('every recipe has exactly one resultGroup with one result', () => {
  for (const recipe of packData.recipes) {
    assert.equal(recipe.resultGroups.length, 1,
      `Recipe "${recipe.name}" should have exactly 1 resultGroup`);
    assert.equal(recipe.resultGroups[0].results.length, 1,
      `Recipe "${recipe.name}" resultGroup should have exactly 1 result`);
  }
});

// ---------------------------------------------------------------------------
// Group 3: Cross-reference integrity
// ---------------------------------------------------------------------------

test('all result componentIds exist in system.components', () => {
  const componentIds = new Set(packData.system.components.map(c => c.id));
  const missing = [];
  for (const recipe of packData.recipes) {
    for (const group of recipe.resultGroups) {
      for (const result of group.results) {
        if (!componentIds.has(result.componentId)) {
          missing.push(`Recipe "${recipe.name}" references unknown componentId "${result.componentId}"`);
        }
      }
    }
  }
  assert.equal(missing.length, 0,
    `Cross-reference failures:\n${missing.join('\n')}`);
});

test('all essence keys in recipes exist in essenceDefinitions', () => {
  const essenceIds = new Set(packData.system.essenceDefinitions.map(e => e.id));
  const missing = [];
  for (const recipe of packData.recipes) {
    for (const set of recipe.ingredientSets) {
      for (const key of Object.keys(set.essences || {})) {
        if (!essenceIds.has(key)) {
          missing.push(`Recipe "${recipe.name}" uses unknown essence "${key}"`);
        }
      }
    }
  }
  assert.equal(missing.length, 0,
    `Essence key failures:\n${missing.join('\n')}`);
});

// ---------------------------------------------------------------------------
// Group 4: Component coverage
// ---------------------------------------------------------------------------

test('all product components are referenced by at least one recipe result', () => {
  const productComponents = packData.system.components.filter(c =>
    Array.isArray(c.tags) && c.tags.includes('product')
  );
  const referencedIds = new Set();
  for (const recipe of packData.recipes) {
    for (const group of recipe.resultGroups) {
      for (const result of group.results) {
        referencedIds.add(result.componentId);
      }
    }
  }
  const unreferenced = productComponents.filter(c => !referencedIds.has(c.id));
  assert.equal(unreferenced.length, 0,
    `Unreferenced product components: ${unreferenced.map(c => c.name).join(', ')}`);
});

// ---------------------------------------------------------------------------
// Group 5: Macro templates
// ---------------------------------------------------------------------------

test('dnd5eCheckTemplate is a non-empty string', () => {
  assert.equal(typeof dnd5eCheckTemplate, 'string',
    'dnd5eCheckTemplate should be a string');
  assert.ok(dnd5eCheckTemplate.trim().length > 0,
    'dnd5eCheckTemplate should not be empty');
});

test('genericCheckTemplate is a non-empty string', () => {
  assert.equal(typeof genericCheckTemplate, 'string',
    'genericCheckTemplate should be a string');
  assert.ok(genericCheckTemplate.trim().length > 0,
    'genericCheckTemplate should not be empty');
});

test('dnd5eCheckTemplate contains rollAbilityTest call', () => {
  assert.ok(dnd5eCheckTemplate.includes('rollAbilityTest'),
    'dnd5eCheckTemplate should include rollAbilityTest');
});

test('genericCheckTemplate contains Roll formula', () => {
  assert.ok(genericCheckTemplate.includes('1d20'),
    'genericCheckTemplate should include a dice roll formula');
});

// ---------------------------------------------------------------------------
// Group 6: Import simulation
// ---------------------------------------------------------------------------

test('import simulation: correct system and recipe counts returned', async () => {
  const createdRecipes = [];
  let createdSystem = null;

  const mockSystemManager = {
    createSystem: async (systemData) => {
      createdSystem = { ...systemData, id: 'mock-system-id' };
      return createdSystem;
    }
  };

  const mockRecipeManager = {
    createRecipe: async (recipeData) => {
      const recipe = { ...recipeData };
      createdRecipes.push(recipe);
      return recipe;
    }
  };

  // Simulate the import logic inline (matches importStarterPack.js logic)
  const data = packData;

  assert.ok(data.system && Array.isArray(data.recipes),
    'pack data should have system and recipes');

  const system = await mockSystemManager.createSystem(data.system);

  for (const recipeData of data.recipes) {
    const resolved = { ...recipeData, craftingSystemId: system.id };
    await mockRecipeManager.createRecipe(resolved);
  }

  assert.equal(createdSystem.id, 'mock-system-id', 'system should be created');
  assert.equal(createdRecipes.length, data.recipes.length,
    `Should create ${data.recipes.length} recipes`);
  assert.ok(createdRecipes.length >= 10,
    `Should create at least 10 recipes, created ${createdRecipes.length}`);

  // All created recipes should have the system ID injected
  for (const recipe of createdRecipes) {
    assert.equal(recipe.craftingSystemId, 'mock-system-id',
      `Recipe "${recipe.name}" should have craftingSystemId replaced`);
  }
});

test('import simulation: placeholder system ID is replaced in all recipes', async () => {
  const createdRecipes = [];
  const mockSystemManager = {
    createSystem: async (data) => ({ ...data, id: 'real-system-id' })
  };
  const mockRecipeManager = {
    createRecipe: async (data) => { createdRecipes.push(data); return data; }
  };

  const system = await mockSystemManager.createSystem(packData.system);
  for (const recipeData of packData.recipes) {
    await mockRecipeManager.createRecipe({ ...recipeData, craftingSystemId: system.id });
  }

  const withPlaceholder = createdRecipes.filter(r => r.craftingSystemId === '__SYSTEM_ID__');
  assert.equal(withPlaceholder.length, 0,
    'No recipe should retain the __SYSTEM_ID__ placeholder after import');
});
