import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CRAFTING_IMAGE,
  DEFAULT_MATERIAL_GLYPH,
  GENERIC_ITEM_IMAGE,
  resolveRecipeImage,
} from '../src/ui/svelte/util/craftingImageDefaults.js';
import { DEFAULT_RECIPE_IMAGE } from '../src/models/Recipe.js';

// The Crafting tab keeps a standalone copy of the default recipe image so its
// Svelte component tree does not import the whole models/Recipe.js graph just to
// resolve a fallback path. This guard fails if that mirror drifts from the
// canonical model constant.
describe('crafting image defaults', () => {
  it('mirrors the canonical DEFAULT_RECIPE_IMAGE', () => {
    assert.equal(DEFAULT_CRAFTING_IMAGE, DEFAULT_RECIPE_IMAGE);
  });

  it('pins the generic item-bag sentinel', () => {
    assert.equal(GENERIC_ITEM_IMAGE, 'icons/svg/item-bag.svg');
  });

  it('gives a material tile a glyph fallback that is NOT the recipe blueprint', () => {
    // The blueprint is the recipe's fallback (issue 917). Reusing it for a component
    // or tag requirement would tell the player their material is a recipe.
    assert.ok(DEFAULT_MATERIAL_GLYPH.startsWith('fa'), 'the material fallback is a glyph class');
    assert.notEqual(DEFAULT_MATERIAL_GLYPH, DEFAULT_CRAFTING_IMAGE);
  });

  describe('resolveRecipeImage', () => {
    it('falls back to the blueprint for an empty/undefined image', () => {
      assert.equal(resolveRecipeImage({}), DEFAULT_CRAFTING_IMAGE);
      assert.equal(resolveRecipeImage({ img: '' }), DEFAULT_CRAFTING_IMAGE);
      assert.equal(resolveRecipeImage({ img: '   ' }), DEFAULT_CRAFTING_IMAGE);
      assert.equal(resolveRecipeImage(undefined), DEFAULT_CRAFTING_IMAGE);
      assert.equal(resolveRecipeImage(null), DEFAULT_CRAFTING_IMAGE);
    });

    it('treats the generic item-bag as "no image" and falls back to the blueprint', () => {
      assert.equal(resolveRecipeImage({ img: GENERIC_ITEM_IMAGE }), DEFAULT_CRAFTING_IMAGE);
    });

    it('passes a real authored path through unchanged', () => {
      assert.equal(
        resolveRecipeImage({ img: 'icons/tools/smithing/anvil.webp' }),
        'icons/tools/smithing/anvil.webp'
      );
    });
  });
});
