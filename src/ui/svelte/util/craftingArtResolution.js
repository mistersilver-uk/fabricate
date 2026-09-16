/**
 * craftingArtResolution — which of a crafting tile's two faces renders (issue 1506).
 *
 * ── WHY A MODULE AND NOT THIRTY-FIVE INLINE COPIES ──────────────────────────────────────
 *
 * The crafting thumbnail this change retired centralised a four-step decision, and its own
 * docblock said that centralising it "so the same markup is not repeated per surface" was that
 * component's whole purpose. Retiring the tile into the shared `Medallion` moves the MARKUP into the primitive but
 * leaves that decision homeless: `Medallion` is an import-free leaf by contract (design-system
 * §7), so it cannot read the two default-image constants itself, and its docblock records why —
 * importing them would propagate a required raw-module entry into every mount harness compiling
 * anything that renders a medallion.
 *
 * So the decision moves OUT of the primitive and into one shared reader rather than into an
 * inline derivation at each of the thirty-five converted tiles. Thirty-five copies would be
 * thirty-five chances to regress the defect issue 917 closed, and near-identical blocks repeated
 * across `src/` are exactly what SonarCloud's new-code duplication gate counts.
 *
 * ── THE FOUR STEPS, PRESERVED EXACTLY ───────────────────────────────────────────────────
 *
 * 1. A tile HAS a glyph only when it was passed a non-blank Font Awesome class. Recipe surfaces
 *    pass none and keep the blueprint fallback byte-for-byte; a component or tag tile passes one.
 * 2. Foundry's generic item-bag literal counts as "no image" ONLY for a tile that has a glyph to
 *    fall back to — without one, blanking it would leave nothing at all to render.
 * 3. The glyph renders when the tile has one and no image survived step 2.
 * 4. Otherwise the art is the caller's path, or the alchemical blueprint when there is none.
 *
 * ── WHAT THE RETURN IS SHAPED FOR ───────────────────────────────────────────────────────
 *
 * `{ art, icon }` is the pair `<Medallion>` takes, so a call site spreads it rather than reading
 * two fields and re-binding them. EXACTLY ONE of the two ever renders: `art` is empty only when
 * the glyph is showing, and non-empty otherwise — the blueprint is a constant, never ''. That
 * invariant is what lets the pair be spread blind, and it is asserted rather than assumed.
 *
 * The `is-fallback` treatment the retired tile drew over a blueprint — `object-fit: contain`,
 * 6px of padding, `box-sizing: border-box` and 85% opacity — is DROPPED by this change rather
 * than restated, so no third field records which branch produced the art.
 *
 * No Foundry, DOM or Svelte dependency: a pure leaf, and one entry in a mount harness's
 * `rawModules`.
 */

import { DEFAULT_CRAFTING_IMAGE, GENERIC_ITEM_IMAGE } from './craftingImageDefaults.js';

/**
 * Resolve a crafting tile's art and its glyph fallback.
 *
 * @param {unknown} src The record's authored image path, if it has one.
 * @param {unknown} [glyph] A Font Awesome class this tile may fall back to, for MATERIAL tiles
 *   (a component or tag requirement). Recipe surfaces pass none.
 * @returns {{ art: string, icon: string }} The two props `<Medallion>` takes, one of which renders.
 */
export function resolveCraftingArt(src, glyph) {
  const trimmed = typeof src === 'string' ? src.trim() : '';
  const glyphClass = typeof glyph === 'string' ? glyph.trim() : '';
  const hasGlyph = glyphClass !== '';
  const hasImage = trimmed !== '' && !(hasGlyph && trimmed === GENERIC_ITEM_IMAGE);
  if (hasGlyph && !hasImage) return { art: '', icon: glyphClass };
  // The caller's own string rather than the trimmed one, which is what the retired tile passed
  // to its `<img>`: trimming decided whether an image EXISTS and never rewrote the path.
  return { art: hasImage ? src : DEFAULT_CRAFTING_IMAGE, icon: glyphClass };
}
