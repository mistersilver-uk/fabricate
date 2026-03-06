/**
 * Tests for T-040: Data Migration for systemItemId -> componentId
 * Uses node:test + node:assert/strict (no Foundry stubs needed -- pure JSON transforms).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateRecipes,
  migrateCraftingSystems,
  runComponentIdMigration,
} from '../src/migration/migrateComponentId.js';

// ---------------------------------------------------------------------------
// 1. Catalyst systemItemId migrated to componentId (top-level catalysts)
// ---------------------------------------------------------------------------

test('migrateRecipes: catalyst systemItemId -> componentId', () => {
  const input = [{ catalysts: [{ systemItemId: 'item-forge', degradesOnUse: false }] }];
  const [recipe] = migrateRecipes(input);

  assert.equal(recipe.catalysts[0].componentId, 'item-forge');
  assert.equal('systemItemId' in recipe.catalysts[0], false);
});

// ---------------------------------------------------------------------------
// 2. Result systemItemId migrated to componentId (resultGroups[].results[])
// ---------------------------------------------------------------------------

test('migrateRecipes: result systemItemId -> componentId in resultGroups', () => {
  const input = [
    { resultGroups: [{ id: 'rg-1', results: [{ systemItemId: 'item-sword', quantity: 1 }] }] }
  ];
  const [recipe] = migrateRecipes(input);

  assert.equal(recipe.resultGroups[0].results[0].componentId, 'item-sword');
  assert.equal('systemItemId' in recipe.resultGroups[0].results[0], false);
});

// ---------------------------------------------------------------------------
// 3. Ingredient match.systemItemId and match.type migrated
// ---------------------------------------------------------------------------

test('migrateRecipes: ingredient match.systemItemId -> match.componentId and type "systemItem" -> "component"', () => {
  const input = [
    {
      ingredientSets: [
        {
          ingredients: [
            { match: { type: 'systemItem', systemItemId: 'item-iron' } }
          ]
        }
      ]
    }
  ];
  const [recipe] = migrateRecipes(input);
  const ing = recipe.ingredientSets[0].ingredients[0];

  assert.equal(ing.match.componentId, 'item-iron');
  assert.equal(ing.match.type, 'component');
  assert.equal('systemItemId' in ing.match, false);
});

// ---------------------------------------------------------------------------
// 4. Ingredient top-level systemItemId migrated
// ---------------------------------------------------------------------------

test('migrateRecipes: ingredient top-level systemItemId -> componentId', () => {
  const input = [
    {
      ingredientSets: [
        {
          ingredients: [{ systemItemId: 'item-wood', quantity: 2 }]
        }
      ]
    }
  ];
  const [recipe] = migrateRecipes(input);
  const ing = recipe.ingredientSets[0].ingredients[0];

  assert.equal(ing.componentId, 'item-wood');
  assert.equal('systemItemId' in ing, false);
});

// ---------------------------------------------------------------------------
// 5. Ingredient alternatives recursively migrated
// ---------------------------------------------------------------------------

test('migrateRecipes: ingredient alternatives[] recursively migrated', () => {
  const input = [
    {
      ingredientSets: [
        {
          ingredients: [
            {
              systemItemId: 'item-primary',
              alternatives: [
                { systemItemId: 'item-alt', match: { type: 'systemItem', systemItemId: 'item-alt' } }
              ]
            }
          ]
        }
      ]
    }
  ];
  const [recipe] = migrateRecipes(input);
  const ing = recipe.ingredientSets[0].ingredients[0];
  const alt = ing.alternatives[0];

  assert.equal(ing.componentId, 'item-primary');
  assert.equal('systemItemId' in ing, false);
  assert.equal(alt.componentId, 'item-alt');
  assert.equal('systemItemId' in alt, false);
  assert.equal(alt.match.componentId, 'item-alt');
  assert.equal(alt.match.type, 'component');
  assert.equal('systemItemId' in alt.match, false);
});

// ---------------------------------------------------------------------------
// 6. IngredientSet-level catalysts migrated
// ---------------------------------------------------------------------------

test('migrateRecipes: ingredientSets[].catalysts[].systemItemId migrated', () => {
  const input = [
    {
      ingredientSets: [
        { catalysts: [{ systemItemId: 'item-acid', degradesOnUse: true }] }
      ]
    }
  ];
  const [recipe] = migrateRecipes(input);
  const cat = recipe.ingredientSets[0].catalysts[0];

  assert.equal(cat.componentId, 'item-acid');
  assert.equal('systemItemId' in cat, false);
});

// ---------------------------------------------------------------------------
// 7. Step-level catalysts, results, and ingredients migrated
// ---------------------------------------------------------------------------

test('migrateRecipes: steps[].catalysts, resultGroups, and ingredientSets all migrated', () => {
  const input = [
    {
      steps: [
        {
          catalysts: [{ systemItemId: 'cat-step', degradesOnUse: false }],
          resultGroups: [{ id: 'rg-step', results: [{ systemItemId: 'result-step', quantity: 1 }] }],
          ingredientSets: [
            { ingredients: [{ systemItemId: 'ing-step', quantity: 1 }] }
          ]
        }
      ]
    }
  ];
  const [recipe] = migrateRecipes(input);
  const step = recipe.steps[0];

  assert.equal(step.catalysts[0].componentId, 'cat-step');
  assert.equal('systemItemId' in step.catalysts[0], false);

  assert.equal(step.resultGroups[0].results[0].componentId, 'result-step');
  assert.equal('systemItemId' in step.resultGroups[0].results[0], false);

  assert.equal(step.ingredientSets[0].ingredients[0].componentId, 'ing-step');
  assert.equal('systemItemId' in step.ingredientSets[0].ingredients[0], false);
});

// ---------------------------------------------------------------------------
// 8. CraftingSystem managedItems renamed to components
// ---------------------------------------------------------------------------

test('migrateCraftingSystems: managedItems array renamed to components', () => {
  const input = [{ id: 'sys-1', managedItems: [{ id: 'comp-a' }] }];
  const [system] = migrateCraftingSystems(input);

  assert.ok(Array.isArray(system.components));
  assert.equal(system.components[0].id, 'comp-a');
  assert.equal('managedItems' in system, false);
});

// ---------------------------------------------------------------------------
// 9. Salvage catalysts migrated inside component salvage data
// ---------------------------------------------------------------------------

test('migrateCraftingSystems: components[].salvage.catalysts[].systemItemId migrated', () => {
  const input = [
    {
      components: [
        {
          id: 'comp-x',
          salvage: {
            catalysts: [{ systemItemId: 'salvage-cat', degradesOnUse: true }]
          }
        }
      ]
    }
  ];
  const [system] = migrateCraftingSystems(input);
  const cat = system.components[0].salvage.catalysts[0];

  assert.equal(cat.componentId, 'salvage-cat');
  assert.equal('systemItemId' in cat, false);
});

// ---------------------------------------------------------------------------
// 10. Salvage results migrated inside component salvage resultGroups
// ---------------------------------------------------------------------------

test('migrateCraftingSystems: components[].salvage.resultGroups[].results[].systemItemId migrated', () => {
  const input = [
    {
      components: [
        {
          id: 'comp-y',
          salvage: {
            resultGroups: [
              { id: 'rg-s', results: [{ systemItemId: 'salvage-result', quantity: 2 }] }
            ]
          }
        }
      ]
    }
  ];
  const [system] = migrateCraftingSystems(input);
  const result = system.components[0].salvage.resultGroups[0].results[0];

  assert.equal(result.componentId, 'salvage-result');
  assert.equal('systemItemId' in result, false);
});

// ---------------------------------------------------------------------------
// 11. Idempotent: already-migrated data passes through unchanged
// ---------------------------------------------------------------------------

test('idempotency: already-migrated data with componentId is unchanged', () => {
  const alreadyMigrated = [
    {
      catalysts: [{ componentId: 'item-forge', degradesOnUse: false }],
      resultGroups: [{ id: 'rg-1', results: [{ componentId: 'item-sword', quantity: 1 }] }],
      ingredientSets: [
        {
          ingredients: [{ componentId: 'item-wood', match: { type: 'component', componentId: 'item-wood' } }]
        }
      ]
    }
  ];

  const migrated = migrateRecipes(alreadyMigrated);
  assert.deepEqual(migrated, alreadyMigrated);
});

// ---------------------------------------------------------------------------
// 12. Idempotent: running migration twice produces same output as running once
// ---------------------------------------------------------------------------

test('idempotency: f(f(x)) === f(x) for recipes and systems', () => {
  const recipes = [
    {
      catalysts: [{ systemItemId: 'cat-1' }],
      ingredientSets: [
        { ingredients: [{ systemItemId: 'ing-1', match: { type: 'systemItem', systemItemId: 'ing-1' } }] }
      ]
    }
  ];
  const systems = [
    { managedItems: [{ id: 'c-1', salvage: { catalysts: [{ systemItemId: 'sc-1' }] } }] }
  ];

  const once = runComponentIdMigration(recipes, systems);
  const twice = runComponentIdMigration(once.recipes, once.systems);

  assert.deepEqual(twice.recipes, once.recipes);
  assert.deepEqual(twice.systems, once.systems);
});

// ---------------------------------------------------------------------------
// 13. Edge cases: empty arrays, null, missing keys handled gracefully
// ---------------------------------------------------------------------------

test('edge cases: empty arrays, null values, and missing keys do not throw', () => {
  assert.doesNotThrow(() => migrateRecipes([]));
  assert.doesNotThrow(() => migrateCraftingSystems([]));
  assert.doesNotThrow(() => runComponentIdMigration([], []));

  // Recipe with all optional arrays absent
  const bareRecipe = migrateRecipes([{ id: 'bare' }]);
  assert.equal(bareRecipe[0].id, 'bare');

  // Recipe with null nested values
  const nullishRecipe = migrateRecipes([
    {
      catalysts: [null],
      resultGroups: [{ results: [null] }],
      ingredientSets: [{ ingredients: [null] }],
      steps: [null]
    }
  ]);
  assert.ok(Array.isArray(nullishRecipe[0].catalysts));

  // System with empty components
  const bareSystem = migrateCraftingSystems([{ id: 'sys', components: [] }]);
  assert.deepEqual(bareSystem[0].components, []);

  // System with no managedItems and no components (no crash)
  const noComponentSystem = migrateCraftingSystems([{ id: 'sys-bare' }]);
  assert.equal(noComponentSystem[0].id, 'sys-bare');
});
