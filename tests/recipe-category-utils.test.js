import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERAL_RECIPE_CATEGORY,
  getEffectiveRecipeCategories,
  getRecipeCategoryLabel,
  isGeneralRecipeCategory,
  normalizeCustomRecipeCategories,
  normalizeRecipeCategory
} from '../src/utils/recipeCategories.js';

describe('recipe category helpers', () => {
  it('normalizes missing or blank recipe categories to the reserved general category', () => {
    assert.equal(normalizeRecipeCategory(undefined), GENERAL_RECIPE_CATEGORY);
    assert.equal(normalizeRecipeCategory(''), GENERAL_RECIPE_CATEGORY);
    assert.equal(normalizeRecipeCategory('   '), GENERAL_RECIPE_CATEGORY);
  });

  it('treats general category strings case-insensitively while preserving custom categories', () => {
    assert.equal(normalizeRecipeCategory('General'), GENERAL_RECIPE_CATEGORY);
    assert.equal(normalizeRecipeCategory(' general '), GENERAL_RECIPE_CATEGORY);
    assert.equal(normalizeRecipeCategory('Potions'), 'Potions');
    assert.equal(isGeneralRecipeCategory('GENERAL'), true);
    assert.equal(isGeneralRecipeCategory('Potions'), false);
    // The non-string guard, which `normalizeRecipeCategory` never reaches — it early-returns
    // first. Since #1663 this is ONE guard answering for both vocabularies.
    assert.equal(isGeneralRecipeCategory(null), false);
    assert.equal(isGeneralRecipeCategory(42), false);
  });

  it('strips the reserved general category from persisted custom category arrays', () => {
    assert.deepEqual(
      normalizeCustomRecipeCategories(['Potions', 'general', ' General ', 'Potions', 'Weapons']),
      ['Potions', 'Weapons']
    );
  });

  it('builds effective category lists with the reserved general category first', () => {
    assert.deepEqual(getEffectiveRecipeCategories([]), [GENERAL_RECIPE_CATEGORY]);
    assert.deepEqual(
      getEffectiveRecipeCategories(['Potions', 'general', 'Weapons']),
      [GENERAL_RECIPE_CATEGORY, 'Potions', 'Weapons']
    );
  });

  it('is total over unusable input, on the recipe path too (issue 1663)', () => {
    // THE RECIPE HALF, WRITTEN DOWN. Since #1663 these helpers are one implementation shared with
    // `componentCategories.js`, whose suite already covers these inputs — so the recipe kind was
    // covered only by a binding no reader of this file can see. These cases are the same total
    // function asserted on the recipe names, where a reader of the recipe path will find them.
    assert.equal(normalizeRecipeCategory(null), GENERAL_RECIPE_CATEGORY);
    assert.equal(normalizeRecipeCategory(42), GENERAL_RECIPE_CATEGORY);
    assert.deepEqual(normalizeCustomRecipeCategories(null), []);
    assert.deepEqual(normalizeCustomRecipeCategories('Potions'), []);
    assert.equal(
      getRecipeCategoryLabel('', (key) => key === 'FABRICATE.Common.General' ? 'General' : '???'),
      'General'
    );
  });

  it('localizes the reserved general category label', () => {
    assert.equal(
      getRecipeCategoryLabel('general', (key) => key === 'FABRICATE.Common.General' ? 'General' : '???'),
      'General'
    );
    assert.equal(getRecipeCategoryLabel('Weapons'), 'Weapons');
    // The NO-LOCALIZER fallback: the English literal, not the raw key. This branch was
    // component-only until #1663 made these ONE function — which is precisely why a reader of the
    // recipe path could not see that it was covered.
    assert.equal(getRecipeCategoryLabel('general'), 'General');
  });
});
