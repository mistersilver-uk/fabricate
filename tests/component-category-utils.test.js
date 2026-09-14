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
    // WHAT THIS TEST PROVES, AND WHAT IT NO LONGER PROVES, SINCE #1663.
    //
    // The six component helpers and the six recipe helpers are now ONE implementation in
    // `src/utils/categoryNormalization.js`, re-exported under both families of names. So
    // `GENERAL_COMPONENT_CATEGORY === GENERAL_RECIPE_CATEGORY` is literally `x === x`, and both
    // `normalizeCustom*` calls below are the SAME function — the disjointness loop therefore
    // asserts only that two literal arrays written in this file are disjoint from each other.
    // Neither assertion can see a leak.
    //
    // THE INDEPENDENCE STILL HOLDS WHERE IT IS SPEC'D, which is at the stored data rather than
    // at the normaliser: `CraftingSystem.componentCategories` and `CraftingSystem.categories`
    // are separate stored keys with separate call sites, and merging, aliasing or
    // cross-populating them remains forbidden by `openspec/specs/data-models/spec.md`. That is
    // the property the STORE-LEVEL suites witness — `tests/component-category-normalization.test.js`'s
    // 'componentCategories and categories stay independent vocabularies (AC7)' over the real
    // `CraftingSystemManager._normalizeSystem`, and `tests/admin-store-vocabulary-cascade.test.js`
    // over the adminStore write ops — not this one.
    //
    // KEPT, DELIBERATELY, as the public-name smoke: both families are still reachable under
    // their own names, from their own module paths, with the shape callers expect.
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
