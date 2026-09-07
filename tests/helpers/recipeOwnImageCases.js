/**
 * Issue 884 — a recipe renders its OWN image at every GM manager surface, and never
 * a containing book's or scroll's artwork.
 *
 * Book membership is many-to-many (`RecipeItemDefinition.recipeIds[]`), so the
 * projection's legacy first-containing-book scalars track definition resolution
 * order rather than anything the GM authored. The four readers therefore resolve
 * through the ONE shared `resolveRecipeImage` chokepoint.
 *
 * Every fixture below RETAINS a leftover book-image key on the recipe row. That is
 * the point of the design: a fixture that dropped the key would pass vacuously,
 * whereas a retained one fails the moment anyone re-adds the borrow at a render
 * site. Shared here rather than copied per suite because `tests/**` counts fully
 * toward SonarCloud's new-code duplication gate.
 *
 * THE PREMISE THAT CHANGED, AND THE ONE THAT DID NOT (issue 1506). This helper was
 * written over FOUR call sites in TWO different DOM shapes — a `Medallion` image and
 * a bare `<img>` carrying a manager sheet class — and the art-tile unification
 * collapsed that to one shape: all four render the shared tile now, and each suite's
 * `selectImg` reads the primitive's own `img`. The DOM argument for sharing this
 * therefore lapses, and the duplication one does not: four near-identical
 * mount-query-assert blocks are four near-identical blocks whatever markup they
 * query. What the four still have in common is the property itself — that each
 * resolves through the ONE shared `resolveRecipeImage` chokepoint — which is what
 * this helper has always been for.
 */
import { it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CRAFTING_IMAGE,
  GENERIC_ITEM_IMAGE
} from '../../src/ui/svelte/util/craftingImageDefaults.js';

// A recipe item definition's artwork — a bound book. This is exactly what the
// deleted projection field used to substitute for a recipe's own icon.
const BOOK_ARTWORK = 'icons/sundries/books/book-tooled-eye-gold-red.webp';

// The recipe's own authored artwork, deliberately nothing book-shaped.
const OWN_ARTWORK = 'icons/consumables/potions/bottle-round-corked-red.webp';

/**
 * Register the three image cases every GM recipe surface must satisfy against one
 * mounted harness. Call from inside a `describe` whose suite already remounts the
 * harness between tests.
 *
 * @param {object} args
 * @param {{ mount: (props?: object) => Promise<HTMLElement> }} args.harness
 *   the suite's mounted-component harness.
 * @param {(imageOverrides: { img: string, recipeItemImg: string }) => object} args.mountProps
 *   builds the full mount props for this surface from the recipe image overrides.
 * @param {(root: HTMLElement) => string|null} args.selectImg
 *   reads the rendered `src` attribute off this surface's thumbnail.
 */
export function itResolvesTheRecipesOwnImage({ harness, mountProps, selectImg }) {
  async function renderedImage(img) {
    // The book image is passed on EVERY case — the assertion is that it is ignored.
    const props = mountProps({ img, recipeItemImg: BOOK_ARTWORK });
    return selectImg(await harness.mount(props));
  }

  it('renders the OWN image of a book member, never the containing book artwork', async () => {
    assert.equal(
      await renderedImage(OWN_ARTWORK),
      OWN_ARTWORK,
      'a recipe that belongs to a book still shows the image the GM authored on it'
    );
  });

  it('falls back to the blueprint for the generic item bag, never to the book', async () => {
    assert.equal(
      await renderedImage(GENERIC_ITEM_IMAGE),
      DEFAULT_CRAFTING_IMAGE,
      'the bag sentinel means "no image", and no-image resolves to the blueprint'
    );
  });

  it('falls back to the blueprint for a whitespace-only image, never to the book', async () => {
    assert.equal(
      await renderedImage('   '),
      DEFAULT_CRAFTING_IMAGE,
      'an unset image is unset however it was stored'
    );
  });
}
