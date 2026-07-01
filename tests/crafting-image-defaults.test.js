import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CRAFTING_IMAGE } from '../src/ui/svelte/util/craftingImageDefaults.js';
import { DEFAULT_RECIPE_IMAGE } from '../src/models/Recipe.js';

// The Crafting tab keeps a standalone copy of the default recipe image so its
// Svelte component tree does not import the whole models/Recipe.js graph just to
// resolve a fallback path. This guard fails if that mirror drifts from the
// canonical model constant.
describe('crafting image defaults', () => {
  it('mirrors the canonical DEFAULT_RECIPE_IMAGE', () => {
    assert.equal(DEFAULT_CRAFTING_IMAGE, DEFAULT_RECIPE_IMAGE);
  });
});
