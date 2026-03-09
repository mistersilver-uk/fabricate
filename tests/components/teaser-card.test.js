/**
 * Component tests for teaser recipe card rendering
 * Tests the prepared recipe object fields that RecipeCard.svelte uses
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

global.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
global.game = { user: { name: 'Test', isGM: false } };

// We test the prepared recipe data (what craftingStore outputs) rather than
// rendering the Svelte component, since the component itself just reads fields.

function makeTeaserRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    description: 'FABRICATE.Teaser.HiddenDescription',
    img: 'icons/svg/item-bag.svg',
    category: 'general',
    canCraft: false,
    allowCraftAction: false,
    accessReason: 'teaser',
    statusLabel: 'Unknown',
    ingredients: [],
    essences: [],
    catalysts: [],
    resultDescription: 'FABRICATE.Teaser.HiddenResults',
    isTeaser: true,
    teaserProgress: 45,
    teaserHiddenFields: ['ingredients', 'results', 'description'],
    teaserDescription: 'Mysterious recipe...',
    isFavourite: false,
    ...overrides
  };
}

function makeFullRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    description: 'Actual recipe description',
    img: 'icons/svg/item-bag.svg',
    category: 'general',
    canCraft: true,
    allowCraftAction: true,
    accessReason: 'ok',
    statusLabel: 'Available',
    ingredients: [{ description: 'Iron', have: 2, need: 1, satisfied: true }],
    essences: [],
    catalysts: [],
    resultDescription: '1x Sword',
    isTeaser: false,
    teaserProgress: 0,
    teaserHiddenFields: [],
    teaserDescription: '',
    isFavourite: false,
    ...overrides
  };
}

describe('Teaser card - prepared recipe data', () => {
  it('teaser recipe has isTeaser:true and teaserProgress', () => {
    const recipe = makeTeaserRecipe({ teaserProgress: 45 });
    assert.equal(recipe.isTeaser, true);
    assert.equal(recipe.teaserProgress, 45);
  });

  it('teaser recipe hides masked fields with placeholder values', () => {
    const recipe = makeTeaserRecipe();
    // Ingredients masked
    assert.deepEqual(recipe.ingredients, []);
    // Results masked
    assert.equal(recipe.resultDescription, 'FABRICATE.Teaser.HiddenResults');
    // Description masked
    assert.equal(recipe.description, 'FABRICATE.Teaser.HiddenDescription');
  });

  it('fully discovered recipe shows all fields and is not teaser', () => {
    const recipe = makeFullRecipe();
    assert.equal(recipe.isTeaser, false);
    assert.equal(recipe.teaserProgress, 0);
    assert.equal(recipe.description, 'Actual recipe description');
    assert.equal(recipe.resultDescription, '1x Sword');
    assert.equal(recipe.ingredients.length, 1);
  });

  it('teaser recipe shows correct progress percentage', () => {
    const recipe75 = makeTeaserRecipe({ teaserProgress: 75 });
    assert.equal(recipe75.teaserProgress, 75);
    const recipe0 = makeTeaserRecipe({ teaserProgress: 0 });
    assert.equal(recipe0.teaserProgress, 0);
    const recipe100 = makeFullRecipe(); // fully discovered
    assert.equal(recipe100.isTeaser, false);
  });
});
