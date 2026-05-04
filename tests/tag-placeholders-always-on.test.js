import test from 'node:test';
import assert from 'node:assert/strict';
import { RecipeManager } from '../src/systems/RecipeManager.js';

function makeRecipeManager(system) {
  globalThis.game = {
    user: { isGM: true },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (id) => id === system.id ? system : null
      }),
      getResolutionModeService: () => null
    }
  };
  return new RecipeManager();
}

function makeRecipe(tag) {
  return {
    id: 'recipe-tags',
    craftingSystemId: 'sys-tags',
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [
          {
            id: 'group-1',
            options: [
              {
                match: {
                  type: 'tags',
                  tags: [tag],
                  tagMatch: 'any'
                }
              }
            ]
          }
        ]
      }
    ]
  };
}

test('tag placeholders validate when legacy itemTags feature is disabled', () => {
  const manager = makeRecipeManager({
    id: 'sys-tags',
    advancedOptionsEnabled: false,
    features: { itemTags: false },
    itemTags: ['herb']
  });

  const result = manager._validateTagPlaceholders(makeRecipe('herb'));

  assert.deepEqual(result, { valid: true, errors: [] });
});

test('tag placeholders still reject unknown tag ids', () => {
  const manager = makeRecipeManager({
    id: 'sys-tags',
    features: { itemTags: false },
    itemTags: ['herb']
  });

  const result = manager._validateTagPlaceholders(makeRecipe('ore'));

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Ingredient group "group-1" references unknown tag "ore"']);
});
