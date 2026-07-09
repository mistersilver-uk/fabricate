import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CRAFTING_IMAGE,
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
