// A crafting tile's `{ art, icon }` for the import-free `<Medallion>` (issue 1506). Exactly one of
// the pair renders — `art` is empty only when the glyph shows — so a call site spreads it blind.

import { DEFAULT_CRAFTING_IMAGE, GENERIC_ITEM_IMAGE } from './craftingImageDefaults.js';

export function resolveCraftingArt(src, glyph) {
  const trimmed = typeof src === 'string' ? src.trim() : '';
  const glyphClass = typeof glyph === 'string' ? glyph.trim() : '';
  const hasGlyph = glyphClass !== '';
  const hasImage = trimmed !== '' && !(hasGlyph && trimmed === GENERIC_ITEM_IMAGE);
  if (hasGlyph && !hasImage) return { art: '', icon: glyphClass };
  // `src`, not `trimmed`: trimming decides whether an image exists, it never rewrites the path.
  return { art: hasImage ? src : DEFAULT_CRAFTING_IMAGE, icon: glyphClass };
}
