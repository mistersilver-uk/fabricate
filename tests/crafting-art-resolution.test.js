/**
 * THE FOUR-STEP ART DECISION THE RETIRED CRAFTING TILE OWNED (issue 1506).
 *
 * `CraftingThumb` held it in a runes block, where it could only ever be exercised by mounting a
 * whole crafting tree. Retiring the tile into the shared `Medallion` moves the markup into the
 * primitive and this decision into a pure `.js` leaf, which is the first time it can be asked
 * directly what it does with a bag sentinel, a blank path, or a tile with no glyph to fall back
 * to.
 *
 * WHAT THESE CASES ARE PROTECTING. Steps 2 and 3 are the defect issue 917 closed: Foundry's
 * generic item-bag literal reads as "no image" for a MATERIAL tile that carries a glyph, and as
 * a real image for a recipe tile that does not — because blanking it there would leave the tile
 * with nothing at all to render. Those two branches are one condition apart and nothing else in
 * the tree states them, so they are pinned in both directions rather than in the direction the
 * shipped fixtures happen to take.
 *
 * AND THE SPREAD INVARIANT. Every converted call site spreads the return straight into
 * `<Medallion {...resolveCraftingArt(…)} …>`, which is sound only while exactly one of the two
 * fields ever renders — `art` empty exactly when the glyph shows. That is asserted here rather
 * than assumed at thirty-five call sites.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveCraftingArt } from '../src/ui/svelte/util/craftingArtResolution.js';
import {
  DEFAULT_CRAFTING_IMAGE,
  GENERIC_ITEM_IMAGE,
} from '../src/ui/svelte/util/craftingImageDefaults.js';

const OWN_ART = 'icons/consumables/potions/bottle-round-corked-red.webp';
const GLYPH = 'fa-solid fa-cube';

describe('1506 the crafting art resolution — a tile with no glyph', () => {
  it('passes an authored path through unchanged', () => {
    assert.deepEqual(resolveCraftingArt(OWN_ART), { art: OWN_ART, icon: '' });
  });

  it('falls back to the blueprint for a blank path', () => {
    assert.deepEqual(resolveCraftingArt(''), { art: DEFAULT_CRAFTING_IMAGE, icon: '' });
    assert.deepEqual(resolveCraftingArt(' '), { art: DEFAULT_CRAFTING_IMAGE, icon: '' });
  });

  it('KEEPS the item bag, because blanking it would leave nothing to render', () => {
    assert.deepEqual(resolveCraftingArt(GENERIC_ITEM_IMAGE), {
      art: GENERIC_ITEM_IMAGE,
      icon: '',
    });
  });

  it('falls back to the blueprint for anything that is not a string', () => {
    for (const value of [undefined, null, 0, {}]) {
      assert.deepEqual(resolveCraftingArt(value), { art: DEFAULT_CRAFTING_IMAGE, icon: '' });
    }
  });
});

describe('1506 the crafting art resolution — a MATERIAL tile with a glyph', () => {
  it('still prefers a real authored image over the glyph', () => {
    assert.deepEqual(resolveCraftingArt(OWN_ART, GLYPH), { art: OWN_ART, icon: GLYPH });
  });

  it('reads the item bag as "no image" and shows the glyph instead', () => {
    assert.deepEqual(resolveCraftingArt(GENERIC_ITEM_IMAGE, GLYPH), { art: '', icon: GLYPH });
  });

  it('shows the glyph for a blank path rather than the recipe blueprint', () => {
    assert.deepEqual(resolveCraftingArt('', GLYPH), { art: '', icon: GLYPH });
    assert.deepEqual(resolveCraftingArt(' ', GLYPH), { art: '', icon: GLYPH });
  });

  it('treats a blank glyph class as no glyph at all', () => {
    for (const blank of ['', ' ', null, undefined, 7]) {
      assert.deepEqual(resolveCraftingArt(GENERIC_ITEM_IMAGE, blank), {
        art: GENERIC_ITEM_IMAGE,
        icon: '',
      });
    }
  });
});

describe('1506 the crafting art resolution — the spread invariant', () => {
  it('leaves `art` empty exactly when the glyph is the face that renders', () => {
    const cases = [
      [OWN_ART, ''],
      ['', ''],
      [GENERIC_ITEM_IMAGE, ''],
      [OWN_ART, GLYPH],
      ['', GLYPH],
      [GENERIC_ITEM_IMAGE, GLYPH],
      [' ', GLYPH],
    ];
    let glyphFaces = 0;
    for (const [src, glyph] of cases) {
      const { art, icon } = resolveCraftingArt(src, glyph);
      if (art === '') {
        glyphFaces += 1;
        assert.ok(
          icon !== '',
          `a tile with no art must carry a glyph: ${JSON.stringify([src, glyph])}`
        );
      } else {
        assert.ok(
          typeof art === 'string' && art.trim() !== '',
          `a tile with art must carry a renderable path: ${JSON.stringify([src, glyph])}`
        );
      }
    }
    // Non-vacuity: the empty-art branch is REACHED by this table, so the clause above is not
    // satisfied by a resolution that never returns one.
    assert.equal(glyphFaces, 3, 'three of the seven cases resolve to the glyph face');
  });
});
