import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

import { DEFAULT_RECIPE_IMAGE } from '../src/models/Recipe.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';

/**
 * `_resolveRecipePromptImg` feeds the interactive roll-prompt header icon. It must
 * match the GM editor / listing precedence — recipe-item definition image, then
 * `recipe.img`, then the recipe default (blueprint) — and must NEVER fall back to
 * the generic item bag (an explicit product requirement).
 */
const ITEM_BAG = 'icons/svg/item-bag.svg';

function stubGame(definitionsById = {}) {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getRecipeItemDefinition: (_systemId, recipeItemId) => definitionsById[recipeItemId] ?? null,
      }),
    },
  };
}

describe('CraftingEngine._resolveRecipePromptImg', () => {
  afterEach(() => {
    delete globalThis.game;
  });

  it('prefers the recipe-item definition image over recipe.img', () => {
    stubGame({ 'ri-1': { img: 'icons/tools/smithing/anvil.webp' } });
    const engine = new CraftingEngine({});
    const img = engine._resolveRecipePromptImg({
      craftingSystemId: 'sys-1',
      recipeItemId: 'ri-1',
      img: 'icons/sundries/scrolls/scroll-plain.webp',
    });
    assert.equal(img, 'icons/tools/smithing/anvil.webp');
  });

  it('falls back to recipe.img when there is no recipe-item definition image', () => {
    stubGame({ 'ri-1': { img: '' } });
    const engine = new CraftingEngine({});
    const img = engine._resolveRecipePromptImg({
      craftingSystemId: 'sys-1',
      recipeItemId: 'ri-1',
      img: 'icons/sundries/scrolls/scroll-plain.webp',
    });
    assert.equal(img, 'icons/sundries/scrolls/scroll-plain.webp');
  });

  it('falls back to recipe.img for a non-recipe-item recipe', () => {
    stubGame();
    const engine = new CraftingEngine({});
    const img = engine._resolveRecipePromptImg({
      craftingSystemId: 'sys-1',
      img: 'icons/sundries/scrolls/scroll-plain.webp',
    });
    assert.equal(img, 'icons/sundries/scrolls/scroll-plain.webp');
  });

  it('falls back to the blueprint default (never the item bag) for a plain-object recipe with no img', () => {
    stubGame();
    const engine = new CraftingEngine({});
    const img = engine._resolveRecipePromptImg({ craftingSystemId: 'sys-1' });
    assert.equal(img, DEFAULT_RECIPE_IMAGE);
    assert.notEqual(img, ITEM_BAG);
  });

  it('is null-safe with no game / no crafting system manager and still yields the blueprint default', () => {
    delete globalThis.game;
    const engine = new CraftingEngine({});
    const img = engine._resolveRecipePromptImg({ craftingSystemId: 'sys-1', recipeItemId: 'ri-1' });
    assert.equal(img, DEFAULT_RECIPE_IMAGE);
    assert.notEqual(img, ITEM_BAG);
  });
});
