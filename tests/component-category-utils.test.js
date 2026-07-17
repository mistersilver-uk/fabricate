/**
 * Issue 676 — the component category vocabulary.
 *
 * Covers AC7 (`componentCategories` and `categories` stay independent; `general` is
 * never persisted in either) at the helper layer, plus the two properties copied
 * deliberately from the recipe sibling: the reserved bucket is never stored, and
 * `Component.category` defaults to `general` through normalization rather than
 * through a migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERAL_COMPONENT_CATEGORY,
  getComponentCategoryLabel,
  getEffectiveComponentCategories,
  isGeneralComponentCategory,
  normalizeComponentCategory,
  normalizeCustomComponentCategories,
} from '../src/utils/componentCategories.js';
import {
  GENERAL_RECIPE_CATEGORY,
  normalizeCustomRecipeCategories,
} from '../src/utils/recipeCategories.js';

describe('component category helpers (issue 676)', () => {
  it('normalizes missing, blank, or non-string categories to the reserved general category', () => {
    assert.equal(normalizeComponentCategory(undefined), GENERAL_COMPONENT_CATEGORY);
    assert.equal(normalizeComponentCategory(null), GENERAL_COMPONENT_CATEGORY);
    assert.equal(normalizeComponentCategory(''), GENERAL_COMPONENT_CATEGORY);
    assert.equal(normalizeComponentCategory('   '), GENERAL_COMPONENT_CATEGORY);
    assert.equal(normalizeComponentCategory(42), GENERAL_COMPONENT_CATEGORY);
  });

  it('treats general case-insensitively while preserving custom categories verbatim', () => {
    assert.equal(normalizeComponentCategory('General'), GENERAL_COMPONENT_CATEGORY);
    assert.equal(normalizeComponentCategory(' general '), GENERAL_COMPONENT_CATEGORY);
    assert.equal(normalizeComponentCategory('Reagent'), 'Reagent');
    assert.equal(isGeneralComponentCategory('GENERAL'), true);
    assert.equal(isGeneralComponentCategory('Reagent'), false);
  });

  it('never persists the reserved general bucket in the custom array, and dedupes/trims', () => {
    assert.deepEqual(
      normalizeCustomComponentCategories(['Reagent', 'general', ' Metal ', 'Reagent', 'General', '']),
      ['Reagent', 'Metal']
    );
    assert.deepEqual(normalizeCustomComponentCategories(null), []);
    assert.deepEqual(normalizeCustomComponentCategories('Reagent'), []);
  });

  it('offers general FIRST as the effective option list', () => {
    assert.deepEqual(getEffectiveComponentCategories(['Metal', 'Herb']), [
      GENERAL_COMPONENT_CATEGORY,
      'Metal',
      'Herb',
    ]);
    assert.deepEqual(getEffectiveComponentCategories([]), [GENERAL_COMPONENT_CATEGORY]);
  });

  it('localizes only general; a custom token is surfaced verbatim', () => {
    const localize = (key) => (key === 'FABRICATE.Common.General' ? 'Allgemein' : key);
    assert.equal(getComponentCategoryLabel('general', localize), 'Allgemein');
    assert.equal(getComponentCategoryLabel('', localize), 'Allgemein');
    assert.equal(getComponentCategoryLabel('Reagent', localize), 'Reagent');
    // No localizer: the English fallback, not the raw key.
    assert.equal(getComponentCategoryLabel('general'), 'General');
  });

  it('is a SIBLING of the recipe vocabulary, not an alias of it (AC7)', () => {
    // The two normalizers share a reserved token STRING but must never share a list.
    // This is the property decision 5 bought: reuse would have leaked component
    // categories (Reagent/Metal/Herb) into the Recipe Studio's filter and the
    // player-facing RecipeListingModel.category filter, and vice versa.
    assert.equal(GENERAL_COMPONENT_CATEGORY, GENERAL_RECIPE_CATEGORY);

    const componentVocabulary = normalizeCustomComponentCategories(['Reagent', 'Metal']);
    const recipeVocabulary = normalizeCustomRecipeCategories(['Potions', 'Weapons']);

    for (const componentCategory of componentVocabulary) {
      assert.ok(
        !recipeVocabulary.includes(componentCategory),
        `component category ${componentCategory} must never appear in recipe category options`
      );
    }
    for (const recipeCategory of recipeVocabulary) {
      assert.ok(
        !componentVocabulary.includes(recipeCategory),
        `recipe category ${recipeCategory} must never appear in component category options`
      );
    }
  });
});
